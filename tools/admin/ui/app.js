// 博客管理页前端。原生 JS，无框架、无构建步骤。
//
// 分工：写盘与发布全部由服务端转交给 scripts/new-content.sh 与 scripts/push-blog.sh，
// 这里只负责表单、渲染与流式日志显示。架构红线（哪些页面不能写 tags）由服务端下发的
// schema.tagsPolicy 决定，前端照做。

'use strict';

// ---------------- 基础 ----------------

const $ = (id) => document.getElementById(id);

const api = {
  async get(path) {
    const res = await fetch(path);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
  async send(method, path, body) {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
      body: JSON.stringify(body ?? {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  },
};

let toastTimer = null;
function toast(message, kind = '') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${kind}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
  }, kind === 'error' ? 9000 : 4500);
}

const store = {
  state: null,
  taxonomy: { tags: [], categories: [] },
  items: [],
  options: { courses: [], chapters: {}, projectHomes: [], projectDirs: [] },
  kind: 'post',
  group: 'post',
  lastKindByGroup: {},
  createTags: new Set(),
  createCats: new Set(),
  // 拖入 .md 后暂存的导入结果：{ filename, body, analysis }；提交成功后清空
  import: null,
  editing: null,
  publishing: false,
};

// ---------------- 顶栏状态 ----------------

function chips() {
  const s = store.state;
  if (!s) return '';
  const out = [];
  const outOfMain = s.branch !== 'main';
  out.push(`<span class="chip ${outOfMain ? 'warn' : ''}">分支 <b>${esc(s.branch || '?')}</b></span>`);
  out.push(`<span class="chip ${s.entries.length ? 'warn' : ''}">改动 <b>${s.entries.length}</b></span>`);
  out.push(`<span class="chip">待推送 <b>${s.ahead ?? '?'}</b></span>`);
  if (s.drafts.length) out.push(`<span class="chip warn">草稿 <b>${s.drafts.length}</b></span>`);
  if (s.futureDated?.length) out.push(`<span class="chip warn">排期在未来 <b>${s.futureDated.length}</b></span>`);
  const p = s.preview;
  const pText = !s.previewEnabled ? '已关闭' : p.ready ? `就绪 :${p.port}` : p.running ? '启动中…' : '未运行';
  out.push(`<span class="chip ${p.ready ? 'ok' : ''}">预览 <b>${pText}</b></span>`);
  if (!s.bash.ok) out.push('<span class="chip warn">bash 不可用</span>');
  return out.join('');
}

function renderChips() {
  $('chips').innerHTML = chips();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function refreshState() {
  if (store.publishing) return;
  try {
    store.state = await api.get('/api/state');
    renderChips();
    renderChanges();
    renderPreviewStatus();
  } catch (err) {
    toast(`读取仓库状态失败：${err.message}`, 'error');
  }
  if (!store.state?.bash.ok) {
    toast(`bash 不可用：${store.state?.bash.error ?? ''}`, 'error');
  }
}

// ---------------- 预览 ----------------

let previewPath = null;

function renderPreviewStatus() {
  const p = store.state?.preview;
  const el = $('preview-status');
  if (!store.state?.previewEnabled) {
    el.textContent = '预览已关闭（--no-preview）';
    return;
  }
  if (!p) {
    el.textContent = '预览：未知';
    return;
  }
  el.textContent = p.ready ? `预览就绪 :${p.port}` : p.running ? '预览启动中…' : '预览未运行';
}

async function setPreviewFor(relPath) {
  try {
    const info = await api.get(`/api/preview/url?path=${encodeURIComponent(relPath)}`);
    previewPath = relPath;
    $('preview-open').href = info.href ?? '#';
    if (info.href) {
      $('preview-frame').src = info.href;
      if (!info.exact) toast(info.note ?? '预览地址可能不准确');
    } else {
      toast('预览未运行：点「重启」启动 hugo server');
    }
  } catch (err) {
    toast(`计算预览地址失败：${err.message}`, 'error');
  }
}

$('preview-toggle').addEventListener('click', () => {
  const main = $('main');
  main.classList.toggle('preview-hidden');
  $('preview-toggle').textContent = main.classList.contains('preview-hidden') ? '显示预览' : '隐藏预览';
});

$('preview-reload').addEventListener('click', () => {
  const f = $('preview-frame');
  // eslint-disable-next-line no-self-assign
  if (f.src) f.src = f.src;
});

$('preview-restart').addEventListener('click', () => restartPreview());

// 重启预览：hugo server 不会把「保存后固定链接变了」的页面重新注册到新地址上
// （改 date / title / slug 就会发生），这时只有重启才能在新 URL 上看到它。
async function restartPreview(quiet = false) {
  if (!quiet) toast('正在重启 hugo server…');
  try {
    await api.send('POST', '/api/preview/stop').catch(() => {});
    const st = await api.send('POST', '/api/preview/start');
    if (st.ready) {
      if (!quiet) toast(`预览就绪：127.0.0.1:${st.port}`, 'ok');
      if (previewPath) await setPreviewFor(previewPath);
    } else {
      toast(`预览未就绪：${st.error ?? '超时'}（见服务端日志）`, 'error');
    }
  } catch (err) {
    toast(`启动预览失败：${err.message}`, 'error');
  }
  refreshState();
}

// ---------------- tab 切换 ----------------

$('tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('active', b === btn);
  for (const p of document.querySelectorAll('.panel')) {
    p.classList.toggle('active', p.id === `panel-${btn.dataset.tab}`);
  }
  if (btn.dataset.tab === 'edit') loadTree();
  if (btn.dataset.tab === 'publish') refreshState();
});

// ---------------- 新建 ----------------

// 一章可以建哪些材料页。章目录下**任何** leaf bundle 都会被章入口页列为材料卡片
// （标题、图标、顺序取自 front matter，与目录名无关），所以同一章可以有第二个实验 ——
// 实验的表单里有「目录名」字段，填 lab-02 即可。
const MATERIAL_CHOICES = [
  { value: 'notes', label: '📖 学习笔记' },
  { value: 'homework', label: '📝 作业' },
  { value: 'lab', label: '🧪 实验' },
];

const KINDS = {
  post: {
    label: '文章',
    tags: true,
    cats: true,
    series: true,
    fields: [
      { k: 'slug', label: '目录名（slug）', required: true, hint: '英文短横线；决定 URL /:year/:month/:slug/' },
      { k: 'title', label: '标题' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea', hint: '列表页与摘要使用' },
    ],
  },
  course: {
    label: '课程主页',
    tags: true,
    cats: true,
    fields: [
      { k: 'name', label: '课程目录名', required: true, hint: '如 numerical-analysis' },
      { k: 'title', label: '课程名' },
      { k: 'unit', label: '分区单位', type: 'select', options: ['章', '周'] },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
    ],
  },
  chapter: {
    label: '章节',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'title', label: '章节标题', required: true },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
      {
        k: 'materials',
        label: '本章材料',
        type: 'checks',
        options: MATERIAL_CHOICES,
        default: ['notes', 'homework'],
        hint: '勾哪些就建哪些；不勾则只建入口页，之后可用「笔记 / 作业 / 实验」单独补',
      },
    ],
  },
  notes: {
    label: '笔记',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'chapter', label: '所属章节', type: 'select', source: 'chapters', required: true, hint: '只列已有章节；新章节请用「章节」' },
      { k: 'title', label: '标题', hint: '留空用骨架默认「学习笔记」' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
    ],
  },
  homework: {
    label: '作业',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'chapter', label: '所属章节', type: 'select', source: 'chapters', required: true, hint: '只列已有章节；新章节请用「章节」' },
      { k: 'title', label: '标题', hint: '留空用骨架默认「作业」' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
    ],
  },
  lab: {
    label: '实验',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'chapter', label: '所属章节', type: 'select', source: 'chapters', required: true, hint: '只列已有章节；新章节请用「章节」' },
      { k: 'dir', label: '目录名', hint: '留空 = lab；同一章要放第二个实验就填 lab-02（权重自动接着排）' },
      { k: 'title', label: '标题', hint: '留空用骨架默认「实验」' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
    ],
  },
  project: {
    label: '项目',
    tags: true,
    cats: true,
    fields: [
      { k: 'name', label: '项目目录名', required: true },
      { k: 'title', label: '项目名' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
      { k: 'repo', label: '仓库地址' },
      { k: 'layered', label: '分层项目（下面还要放子项目）', type: 'bool' },
    ],
  },
  sub: {
    label: '子项目',
    tags: false,
    cats: false,
    fields: [
      { k: 'project', label: '所属项目（分层项目）', type: 'select', source: 'projectHomes', required: true },
      { k: 'name', label: '子项目目录名', required: true },
      { k: 'title', label: '子项目名' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
    ],
  },
  doc: {
    label: '项目文档',
    tags: true,
    cats: false,
    fields: [
      { k: 'projectPath', label: '所属目录', type: 'select', source: 'projectDirs', required: true, hint: '可选项来自 content/projects 下已有的目录' },
      { k: 'name', label: '文档名', required: true, hint: '不要带 .md' },
      { k: 'title', label: '标题' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天' },
      { k: 'description', label: '描述', type: 'textarea' },
      { k: 'noMath', label: '纯文字（不加载 KaTeX 样式）', type: 'bool' },
    ],
  },
};

// 类型选择是两级的：第一行分组，第二行是该组下的具体类型。分组**只影响界面**，
// store.kind 始终是叶子 id —— 它与 new-content.sh 的子命令名一一对应，
// 服务端的 allowlist（lib/content.mjs 的 buildCreateArgs）也只认这些 id。
const KIND_GROUPS = [
  { id: 'post', label: '文章', kinds: ['post'] },
  { id: 'course', label: '课程', kinds: ['course', 'chapter', 'notes', 'homework', 'lab'] },
  { id: 'project', label: '项目', kinds: ['project', 'sub', 'doc'] },
];

const KIND_PREF_KEY = 'admin-create-kind';

function groupOfKind(kind) {
  return KIND_GROUPS.find((g) => g.kinds.includes(kind)) ?? KIND_GROUPS[0];
}

// 上次选的类型存本地：以前每次刷新都会跳回「文章」
function saveKindPref() {
  try {
    localStorage.setItem(KIND_PREF_KEY, JSON.stringify({ kind: store.kind, lastKindByGroup: store.lastKindByGroup }));
  } catch {
    // 隐私模式 / 禁用存储：记不住就算了，不影响使用
  }
}

function loadKindPref() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KIND_PREF_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  // 存的是坏数据（类型被删掉过）就退回默认，不能让它把 store.kind 带歪
  if (saved?.kind && KINDS[saved.kind]) store.kind = saved.kind;
  if (saved?.lastKindByGroup) store.lastKindByGroup = saved.lastKindByGroup;
  store.group = groupOfKind(store.kind).id;
}

function selectKind(kind) {
  const group = groupOfKind(kind);
  const changed = kind !== store.kind;
  store.kind = kind;
  store.group = group.id;
  store.lastKindByGroup[group.id] = kind;
  saveKindPref();
  renderKindPicker();
  // 点的是当前类型就只是把分组切回来，不要把已勾的标签清掉、也不要重渲染表单
  if (!changed) return;
  store.createTags.clear();
  store.createCats.clear();
  renderCreateFields();
}

// 下拉选项由服务端下发（见 GET /api/content/list 的 options），前端不重复实现路径推导。
// 「所属章节」是唯一有依赖的一项：它跟着「所属课程」变，所以要看快照里当前选中的课程。
function sourceOptions(source, snap) {
  if (source === 'chapters') return chaptersForCourse(snap?.course);
  return store.options[source] ?? [];
}

function chaptersForCourse(course) {
  const c = course || (store.options.courses ?? [])[0] || '';
  return (store.options.chapters ?? {})[c] ?? [];
}

// 换课程 → 重建章节下拉；原来的选择还在就留着
function fillChapterOptions(course) {
  const sel = $('cf-chapter');
  if (!sel) return;
  const prev = sel.value;
  const list = chaptersForCourse(course);
  sel.innerHTML = list.length
    ? list.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')
    : '<option value="">（这门课还没有章节，先用「章节」新建）</option>';
  if (list.includes(prev)) sel.value = prev;
}

function renderKindPicker() {
  const group = KIND_GROUPS.find((g) => g.id === store.group) ?? KIND_GROUPS[0];
  const rows = KIND_GROUPS.map((g) => {
    // 有子级的分组给个指示符；没有子级的（文章）点了就直接是表单
    const caret = g.kinds.length > 1 ? '<span class="caret" aria-hidden="true">▾</span>' : '';
    return `<button type="button" data-group="${g.id}" class="${g.id === group.id ? 'active' : ''}">${esc(g.label)}${caret}</button>`;
  }).join('');
  // 只有一个叶子的分组不再铺第二行，否则「文章」下面会多出一个同名按钮
  const subs = group.kinds.length > 1
    ? `<div class="kind-sub">${group.kinds
        .map((k) => `<button type="button" data-kind="${k}" class="${k === store.kind ? 'active' : ''}">${esc(KINDS[k].label)}</button>`)
        .join('')}</div>`
    : '';
  $('kind-picker').innerHTML = `<div class="kind-row">${rows}</div>${subs}`;
}

function renderCreateFields() {
  const spec = KINDS[store.kind];
  const snapshot = snapshotCreateFields();
  const html = spec.fields
    .map((f) => {
      const id = `cf-${f.k}`;
      const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
      const req = f.required ? '<span class="hint">必填</span>' : '';
      if (f.type === 'bool') {
        return `<label class="check"><input type="checkbox" id="${id}" data-field="${f.k}"> ${esc(f.label)}${hint ? ` · ${hint}` : ''}</label>`;
      }
      if (f.type === 'checks') {
        const boxes = (f.options ?? [])
          .map((o) => {
            const value = typeof o === 'string' ? o : o.value;
            const label = typeof o === 'string' ? o : o.label;
            const on = (f.default ?? []).includes(value) ? ' checked' : '';
            return `<label class="check"><input type="checkbox" data-field="${f.k}" data-cvalue="${esc(value)}"${on}> ${esc(label)}</label>`;
          })
          .join('');
        return `<div class="field"><label>${esc(f.label)} ${hint}</label><div class="checks">${boxes}</div></div>`;
      }
      if (f.type === 'select') {
        const opts = f.source
          ? sourceOptions(f.source, snapshot)
          : f.options ?? [];
        const body = opts.length
          ? opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')
          : '<option value="">（没有可选项，请先创建上层内容）</option>';
        return `<div class="field"><label for="${id}">${esc(f.label)} ${req} ${hint}</label><select id="${id}" data-field="${f.k}">${body}</select></div>`;
      }
      if (f.type === 'textarea') {
        return `<div class="field"><label for="${id}">${esc(f.label)} ${req} ${hint}</label><textarea id="${id}" data-field="${f.k}" rows="2"></textarea></div>`;
      }
      return `<div class="field"><label for="${id}">${esc(f.label)} ${req} ${hint}</label><input type="text" id="${id}" data-field="${f.k}"></div>`;
    })
    .join('');
  $('create-fields').innerHTML = html;
  restoreCreateFields(snapshot);
  // 「所属章节」的选项依赖「所属课程」，所以换课程时要重算一次
  if (spec.fields.some((f) => f.source === 'chapters')) {
    $('cf-course')?.addEventListener('change', (ev) => fillChapterOptions(ev.target.value));
  }
  $('create-tags-wrap').hidden = !spec.tags;
  $('create-cats-wrap').hidden = !spec.cats;
  $('create-series-wrap').hidden = !spec.series;
  if (spec.cats && store.createCats.size === 0) {
    if (store.kind === 'post') store.createCats.add('文章');
    if (store.kind === 'course') store.createCats.add('课程');
    if (store.kind === 'project') store.createCats.add('项目');
  }
  renderChipsPicker('tag-chips', store.taxonomy.tags, store.createTags, $('tag-search').value);
  renderChipsPicker('cat-chips', store.taxonomy.categories, store.createCats, '');
  $('cat-hint').textContent = store.taxonomy.categories.join('、') || '（空）';
}

// 重渲染表单（例如刚往词表里加了新词）不该把用户已经填好的内容清掉
function snapshotCreateFields() {
  const snap = {};
  for (const el of document.querySelectorAll('#create-fields [data-field]')) {
    // 多选框组（checks）：同名元素共用 data-field，靠 data-cvalue 区分，收集成数组
    if (el.dataset.cvalue !== undefined) {
      const arr = snap[el.dataset.field] ?? [];
      if (el.checked) arr.push(el.dataset.cvalue);
      snap[el.dataset.field] = arr;
      continue;
    }
    snap[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return snap;
}

function restoreCreateFields(snap) {
  for (const el of document.querySelectorAll('#create-fields [data-field]')) {
    const v = snap[el.dataset.field];
    if (v === undefined) continue;
    if (el.dataset.cvalue !== undefined) {
      el.checked = Array.isArray(v) && v.includes(el.dataset.cvalue);
      continue;
    }
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else if (!el.querySelector('option[value=""]')) el.value = v;
  }
}

// 通用多选 chips
function renderChipsPicker(containerId, options, selected, filter = '') {
  const el = $(containerId);
  const kw = String(filter ?? '').trim().toLowerCase();
  const list = options.filter((o) => !kw || o.toLowerCase().includes(kw));
  const shown = list.concat([...selected].filter((s) => !list.includes(s)));
  if (shown.length === 0) {
    el.innerHTML = '<span class="hint">词表是空的</span>';
    return;
  }
  el.innerHTML = shown
    .map((o) => `<span class="chip ${selected.has(o) ? 'on' : ''}" data-value="${esc(o)}">${esc(o)}</span>`)
    .join('');
}

function bindChipsPicker(containerId, selected, onChange) {
  $(containerId).addEventListener('click', (ev) => {
    const chip = ev.target.closest('.chip[data-value]');
    if (!chip) return;
    const value = chip.dataset.value;
    if (selected.has(value)) selected.delete(value);
    else selected.add(value);
    onChange?.();
  });
}

// 分组按钮只带 data-group，叶子按钮只带 data-kind —— 两者分开才不会把分组当成类型
$('kind-picker').addEventListener('click', (ev) => {
  const groupBtn = ev.target.closest('button[data-group]');
  if (groupBtn) {
    const group = KIND_GROUPS.find((g) => g.id === groupBtn.dataset.group);
    if (!group) return;
    const remembered = store.lastKindByGroup[group.id];
    selectKind(group.kinds.includes(remembered) ? remembered : group.kinds[0]);
    return;
  }
  const kindBtn = ev.target.closest('button[data-kind]');
  if (kindBtn) selectKind(kindBtn.dataset.kind);
});

$('tag-search').addEventListener('input', () => {
  renderChipsPicker('tag-chips', store.taxonomy.tags, store.createTags, $('tag-search').value);
});

bindChipsPicker('tag-chips', store.createTags);
bindChipsPicker('cat-chips', store.createCats);

$('new-tag-btn').addEventListener('click', async () => {
  const input = $('new-tag-input');
  const term = input.value.trim();
  if (!term) return;
  try {
    const res = await api.send('POST', '/api/taxonomy/add', { section: 'tags', term });
    await loadTaxonomy();
    store.createTags.add(term);
    input.value = '';
    renderCreateFields();
    toast(res.alreadyPresent ? `「${term}」本来就在词表里` : `已加入词表：${term}`, 'ok');
    renderVocab();
  } catch (err) {
    toast(`加入词表失败：${err.message}`, 'error');
  }
});

$('create-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const spec = KINDS[store.kind];
  const form = { kind: store.kind, publish: $('create-publish').checked };
  for (const el of $('create-fields').querySelectorAll('[data-field]')) {
    // 多选框组（checks）收集成数组，交给服务端拼成 --materials
    if (el.dataset.cvalue !== undefined) {
      const arr = form[el.dataset.field] ?? [];
      if (el.checked) arr.push(el.dataset.cvalue);
      form[el.dataset.field] = arr;
      continue;
    }
    form[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value.trim();
  }
  const missing = spec.fields.filter((f) => f.required && !String(form[f.k] ?? '').trim());
  if (missing.length) {
    toast(`还差必填项：${missing.map((f) => f.label).join('、')}`, 'error');
    return;
  }
  if (spec.tags) form.tags = [...store.createTags];
  if (spec.cats) form.categories = [...store.createCats];
  if (spec.series) {
    const series = $('create-series').value.trim();
    if (series) form.series = series;
  }
  form.allowNewTags = spec.tags && store.createTags.size > 0;
  // 拖入的 .md：正文由服务端通过 stdin 交给 new-content.sh，front matter 仍来自 archetypes/
  if (store.import) form.body = store.import.body;

  $('create-pending').textContent = '正在创建…';
  $('create-log').hidden = false;
  $('create-log').textContent = `▸ bash scripts/new-content.sh ${store.kind} …\n`;
  try {
    const res = await api.send('POST', '/api/content', form);
    printScriptResult(res);
    if (res.ok) {
      toast('创建成功' + (form.publish ? '（已标记为发布）' : '（草稿）'), 'ok');
      // 导入的正文已经落到新文件里了；留着会让下一次创建重复带上同一个正文
      store.import = null;
      renderImportNotice();
      await loadItems(true);
      renderCreateFields();
      $('create-publish').checked = false;
    } else {
      toast('创建失败，看下方日志', 'error');
    }
  } catch (err) {
    $('create-log').textContent += `✗ ${err.message}\n`;
    toast(`创建失败：${err.message}`, 'error');
  } finally {
    $('create-pending').textContent = '';
    refreshState();
  }
});

function printScriptResult(res) {
  const log = $('create-log');
  log.hidden = false;
  let text = '';
  if (Array.isArray(res.scriptArgs)) text += `▸ new-content.sh ${res.scriptArgs.map((a) => (a.includes(' ') ? JSON.stringify(a) : a)).join(' ')}\n`;
  if (res.addedTerms?.length) text += `▸ 新标签已写入词表：${res.addedTerms.join('、')}\n`;
  if (res.mathFix?.count > 0) text += `▸ 已自动修正 ${res.mathFix.count} 处公式转义（\\* → *）：不修的话 KaTeX 会让整站构建失败\n`;
  if (res.stdout) text += res.stdout;
  if (res.stderr) text += `\n${res.stderr}`;
  log.textContent += text.endsWith('\n') || text === '' ? text : `${text}\n`;
  if (res.files?.length) {
    const wrap = document.createElement('div');
    wrap.className = 'inline';
    wrap.style.marginTop = '8px';
    for (const f of res.files) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ghost';
      b.textContent = `编辑 ${f}`;
      b.addEventListener('click', () => openInEditor(f));
      wrap.appendChild(b);
    }
    log.appendChild(wrap);
  }
}

async function openInEditor(relPath) {
  document.querySelector('#tabs button[data-tab="edit"]').click();
  await loadTree();
  selectFile(relPath);
}

// ---------------- 词表 ----------------

async function loadTaxonomy() {
  store.taxonomy = await api.get('/api/taxonomy');
}

function renderVocab() {
  $('vocab-body').innerHTML = `
    <div><strong>标签</strong>（${store.taxonomy.tags.length}）</div>
    <div class="chips">${store.taxonomy.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <div><strong>分类</strong>（${store.taxonomy.categories.length}）</div>
    <div class="chips">${store.taxonomy.categories.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>
    <p class="hint">词条只能从这里选（新建时勾选）；手工加词请用上面的输入框，它会写进 data/taxonomy.yaml 并立刻复核。</p>`;
}

// ---------------- 编辑 ----------------

async function loadItems(force = false) {
  if (!force && store.items.length) return;
  const res = await api.get('/api/content/list');
  store.items = res.items;
  store.options = res.options ?? store.options;
}

async function loadTree() {
  try {
    await loadItems(true);
  } catch (err) {
    $('tree-body').innerHTML = `<p class="muted">载入失败：${esc(err.message)}</p>`;
    return;
  }
  renderTree();
  renderCreateFields();
}

function renderTree() {
  const kw = $('tree-search').value.trim().toLowerCase();
  const groups = new Map();
  for (const item of store.items) {
    if (kw && !`${item.title} ${item.path}`.toLowerCase().includes(kw)) continue;
    if (!groups.has(item.typeLabel)) groups.set(item.typeLabel, []);
    groups.get(item.typeLabel).push(item);
  }
  if (groups.size === 0) {
    $('tree-body').innerHTML = '<p class="muted">没有匹配的文件</p>';
    return;
  }
  $('tree-body').innerHTML = [...groups.entries()]
    .map(
      ([label, items]) => `<div class="tree-group"><h3>${esc(label)}（${items.length}）</h3>${items
        .map(
          (i) =>
            `<button type="button" class="tree-item ${store.editing?.path === i.path ? 'active' : ''}" data-path="${esc(i.path)}">` +
            `${esc(i.title)}${i.draft ? '<span class="badge">草稿</span>' : ''}${i.math ? '<span class="badge">公式</span>' : ''}` +
            `<span class="path">${esc(i.path)}</span></button>`
        )
        .join('')}</div>`
    )
    .join('');
}

$('tree-search').addEventListener('input', renderTree);

$('tree-body').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-path]');
  if (btn) selectFile(btn.dataset.path);
});

let pending = null; // { path, schema, values, indents, cover, changed:Map, coverChanged:Map, body }

async function selectFile(relPath) {
  try {
    const data = await api.get(`/api/content/file?path=${encodeURIComponent(relPath)}`);
    pending = {
      path: data.path,
      type: data.type,
      typeLabel: data.typeLabel,
      schema: data.schema,
      values: data.values,
      indents: data.indents,
      cover: data.cover ?? {},
      body: data.body,
      hasFrontMatter: data.hasFrontMatter,
      // 缺哪些必填 front matter（服务端按 check-frontmatter.sh 的规则算好）：
      // 用来提示、并让「按默认值补全」知道该补什么
      missingRequired: data.missingRequired ?? [],
      futureDate: Boolean(data.futureDate),
      changed: new Map(),
      coverChanged: new Map(),
      bodyDirty: false,
      bodyOriginal: data.body,
    };
    renderEditor();
    renderTree();
    setPreviewFor(relPath);
  } catch (err) {
    toast(`打开失败：${err.message}`, 'error');
  }
}

function renderEditor() {
  if (!pending) return;
  const p = pending;
  // 未保存的改动优先：拖入导入后会重渲染，不能让 p.values 里的旧值把刚填的值盖回去。
  const val = (key) => (p.changed.has(key) ? p.changed.get(key) : p.values[key]);
  const isTrue = (key) => val(key) === true || val(key) === 'true';
  const missing = p.missingRequired ?? [];
  // 已经填进 changed（拖入导入或点了「按默认值补全」）的不再算缺：否则填完了还在喊缺
  const missingRemaining = missing.filter((k) => !p.changed.has(k));
  const needsArchetype = !p.hasFrontMatter && SECTION_TYPES.has(p.type);
  const archetypeHint = LIST_TYPES.has(p.type)
    ? '这是列表页（分区的入口页）：title / description 之外的键不在这里重建。页面整个不见了就用 <code>bash scripts/new-content.sh section &lt;路径&gt; --title 标题</code> 补回来。'
    : '这是 section 页：它的 layout / cascade 等结构键不在这里重建，若页面渲染不对，请用「新建」面板按类型重建。';
  const dirtyWarn = missingRemaining.length
    ? `<div class="notice error"><strong>缺必填的 front matter：</strong>${missingRemaining.map((k) => esc(FRONTMATTER_LABEL[k] ?? k)).join('、')}
        —— 这样的文件 <code>scripts/check-frontmatter.sh</code> 会以硬错误拦下推送。
        <div class="inline" style="margin-top:6px"><button type="button" class="ghost" id="ed-repair">按默认值补全</button>
        <span class="hint">标题取正文第一个 # 标题、日期用站点今天、草稿状态保持「仍是草稿」；补完仍需点「保存」。</span></div>
        ${needsArchetype ? `<div class="hint" style="margin-top:6px">${archetypeHint}</div>` : ''}
      </div>`
    : '';
  const warn =
    p.schema.tagsPolicy === 'forbidden'
      ? `<div class="notice"><strong>不要在这里写 tags：</strong>${esc(p.schema.tagsReason)}</div>`
      : p.schema.tagsPolicy === 'caution'
        ? `<div class="notice"><strong>写 tags 要当心：</strong>${esc(p.schema.tagsReason)}</div>`
        : '';
  const futureNotice = p.futureDate
    ? `<div class="notice"><strong>日期在未来：</strong>这篇的 date 是 ${esc(p.values.date)}，站点时区（${esc(
        store.state?.siteTimeZone ?? 'UTC'
      )}）的今天是 ${esc(store.state?.siteToday ?? '')}。Hugo 默认不构建未来日期的内容，CI 不会发布它——要么把日期改成今天或更早，要么就当作排期稿。</div>`
    : '';

  const fieldHtml = p.schema.fields
    .filter((f) => f.kind !== 'child')
    .map((f) => {
      const id = `ef-${f.key}`;
      const hint = f.hint ? `<span class="hint">${esc(f.hint)}</span>` : '';
      let control;
      if (f.kind === 'bool') {
        control = `<label class="check"><input type="checkbox" id="${id}" data-ekey="${f.key}" data-kind="bool" ${isTrue(f.key) ? 'checked' : ''}> ${esc(f.label)}</label>`;
        return control;
      }
      if (f.kind === 'list') {
        if (f.key === 'tags' && p.schema.tagsPolicy === 'forbidden') {
          return `<div class="field"><label>${esc(f.label)}</label><div class="muted">已禁用（见上方说明）${p.values.tags.length ? `　当前继承到的标签会由上层 cascade 提供` : ''}</div></div>`;
        }
        if (f.key === 'tags') {
          return `<div class="field"><label>${esc(f.label)} ${hint}</label><div class="chips selectable" id="ef-tags"></div></div>`;
        }
        if (f.key === 'categories') {
          return `<div class="field"><label>${esc(f.label)} ${hint}</label><div class="chips selectable" id="ef-cats"></div></div>`;
        }
        control = `<input type="text" id="${id}" data-ekey="${f.key}" data-kind="list" value="${esc((val(f.key) ?? []).join(', '))}">`;
        return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label>${control}</div>`;
      }
      if (f.kind === 'select') {
        control = `<select id="${id}" data-ekey="${f.key}" data-kind="text">${(f.options ?? []).map((o) => `<option ${val(f.key) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label>${control}</div>`;
      }
      const type = f.kind === 'number' ? 'number' : 'text';
      control = `<input type="${type}" id="${id}" data-ekey="${f.key}" data-kind="${f.kind}" value="${esc(val(f.key) ?? '')}">`;
      return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label>${control}</div>`;
    })
    .join('');

  const coverHtml =
    p.type === 'post'
      ? `<fieldset class="field"><legend>封面（图片放在 index.md 同目录）</legend>
          <div class="field"><label for="ec-image">封面图文件名</label><input type="text" id="ec-image" data-cover="image" value="${esc(p.cover.image ?? '')}"></div>
          <div class="field"><label for="ec-alt">alt</label><input type="text" id="ec-alt" data-cover="alt" value="${esc(p.cover.alt ?? '')}"></div>
          <div class="field"><label for="ec-caption">说明</label><input type="text" id="ec-caption" data-cover="caption" value="${esc(p.cover.caption ?? '')}"></div>
        </fieldset>`
      : '';

  $('editor').innerHTML = `
    <div class="editor-head">
      <h3>${esc(val('title') || p.path)}</h3>
      <span class="chip">${esc(p.typeLabel)}</span>
      <span class="chip ${isTrue('draft') ? 'warn' : 'ok'}">${isTrue('draft') ? '草稿' : '已发布'}</span>
      ${val('math') === '' || val('math') === undefined ? '<span class="chip">math 继承</span>' : ''}
      <span class="badge" id="dirty-badge" hidden>未保存</span>
      <div class="preview-actions" style="margin-left:auto">
        <button type="button" class="ghost" id="ed-preview">预览</button>
        <button type="button" class="primary" id="ed-save">保存</button>
        <button type="button" class="danger" id="ed-delete">删除</button>
      </div>
    </div>
    <p class="hint">${esc(p.path)}${p.hasFrontMatter ? '' : '　（这个文件原本没有 front matter，保存带字段的改动会自动补一个区块）'}　<span class="hint">拖入 .md 可替换正文</span></p>
    ${dirtyWarn}
    ${warn}
    ${futureNotice}
    <div id="ed-delete-notice"></div>
    <div class="fields">${fieldHtml}</div>
    ${coverHtml}
    <div class="field">
      <label>正文<span class="hint">Markdown；公式写 $...$ 或 $$...$$，裸写美元符号要写成 \\$</span></label>
      <div class="toolbar" id="md-toolbar">
        <button type="button" data-md="bold">加粗</button>
        <button type="button" data-md="h2">标题</button>
        <button type="button" data-md="link">链接</button>
        <button type="button" data-md="code">行内代码</button>
        <button type="button" data-md="fence">代码块</button>
        <button type="button" data-md="imath">行内公式</button>
        <button type="button" data-md="dmath">块级公式</button>
      </div>
      <label class="check"><input type="checkbox" id="ed-import-overwrite" ${importOverwrite ? 'checked' : ''}> 拖入 .md 时用文件里的 front matter 覆盖已有字段（默认只补空缺）</label>
      <textarea id="ed-body" spellcheck="false"></textarea>
      <div id="ed-lint"></div>
    </div>
    <div id="ed-import-notice"></div>`;

  $('ed-body').value = p.body;
  $('ed-lint').innerHTML = lintHtml(p.body);
  $('ed-repair')?.addEventListener('click', repairFrontMatter);

  // 标签 chips（可编辑策略）
  if (p.schema.tagsPolicy !== 'forbidden') {
    const tagsEl = $('ef-tags');
    if (tagsEl) {
      const selected = new Set(Array.isArray(val('tags')) ? val('tags') : []);
      const draw = (kw = '') => {
        tagsEl.innerHTML = chipsHtml(store.taxonomy.tags, selected, kw);
      };
      draw();
      tagsEl.addEventListener('click', (ev) => {
        const chip = ev.target.closest('.chip[data-value]');
        if (!chip) return;
        const v = chip.dataset.value;
        if (selected.has(v)) selected.delete(v);
        else selected.add(v);
        p.changed.set('tags', [...selected]);
        draw();
        markDirty();
      });
    }
    const catsEl = $('ef-cats');
    if (catsEl) {
      const selected = new Set(Array.isArray(val('categories')) ? val('categories') : []);
      const draw = () => {
        catsEl.innerHTML = chipsHtml(store.taxonomy.categories, selected, '');
      };
      draw();
      catsEl.addEventListener('click', (ev) => {
        const chip = ev.target.closest('.chip[data-value]');
        if (!chip) return;
        const v = chip.dataset.value;
        if (selected.has(v)) selected.delete(v);
        else selected.add(v);
        p.changed.set('categories', [...selected]);
        draw();
        markDirty();
      });
    }
  }

  $('ed-save').addEventListener('click', saveEditor);
  $('ed-preview').addEventListener('click', () => setPreviewFor(p.path));
  $('ed-delete').addEventListener('click', onDeleteClick);
  $('md-toolbar').addEventListener('click', onToolbar);
  // 重新渲染（换文件、保存后刷新）必须解除已武装的删除 —— 否则「确认删除」会落到另一个文件上
  resetDeleteArm();
}

function chipsHtml(options, selected, filter) {
  const kw = String(filter ?? '').trim().toLowerCase();
  const list = options.filter((o) => !kw || o.toLowerCase().includes(kw));
  const shown = list.concat([...selected].filter((s) => !list.includes(s)));
  if (shown.length === 0) return '<span class="hint">词表是空的</span>';
  return shown.map((o) => `<span class="chip ${selected.has(o) ? 'on' : ''}" data-value="${esc(o)}">${esc(o)}</span>`).join('');
}

function onEditorInput(ev) {
  const p = pending;
  if (!p) return;
  const el = ev.target;
  if (el.id === 'ed-body') {
    p.body = el.value;
    p.bodyDirty = p.body !== p.bodyOriginal;
    $('ed-lint').innerHTML = lintHtml(p.body);
  } else if (el.dataset.ekey) {
    const key = el.dataset.ekey;
    const kind = el.dataset.kind;
    let value;
    if (kind === 'bool') value = el.checked;
    else if (kind === 'number') value = el.value.trim();
    else if (kind === 'list') value = el.value.split(',').map((s) => s.trim()).filter(Boolean);
    else value = el.value;
    p.changed.set(key, value);
  } else if (el.dataset.cover) {
    p.coverChanged.set(el.dataset.cover, el.value);
    markDirty();
    return;
  } else {
    return;
  }
  markDirty();
}

function markDirty() {
  const badge = $('dirty-badge');
  if (!badge || !pending) return;
  const dirty = pending.changed.size > 0 || pending.coverChanged.size > 0 || pending.bodyDirty;
  badge.hidden = !dirty;
}

async function saveEditor() {
  const p = pending;
  if (!p) return;
  const changed = [];
  for (const [key, value] of p.changed) {
    const field = p.schema.fields.find((f) => f.key === key);
    if (!field) continue;
    // 文件里原本没有这个键时（p.indents 是空串）要退回 schema 声明的缩进：课程主页 / 分层
    // 项目主页的 tags 写在 cascade 里（缩进 4 空格），写成顶层就会让 check-frontmatter 报错。
    const existing = key === 'tags' ? p.indents.tags : key === 'categories' ? p.indents.categories : '';
    const indent = existing || field.indent || '';
    changed.push({ key, kind: field.kind, value, indent });
  }
  const coverChanges = [...p.coverChanged.entries()].map(([child, value]) => ({ child, value }));
  // 文章的 URL 是 /:year/:month/:slug/，而 :slug 由 title/slug 决定、:year/:month 来自 date：
  // 改动这三者就会换地址，保存后需要重启预览才能在新地址上看到。
  const movesPermalink = p.type === 'post' && ['title', 'slug', 'date'].some((k) => p.changed.has(k));
  try {
    const res = await api.send('PUT', '/api/content/file', {
      path: p.path,
      changed,
      coverChanges,
      body: p.body,
    });
    p.changed.clear();
    p.coverChanged.clear();
    // 服务端会把正文里 `\*` 这类会让构建失败的公式转义顺手修掉（同一份实现：
    // scripts/fix-math-escapes.mjs）。同步回编辑器，否则下次保存又把坏文本写回去。
    const fixedCount = Number(res.mathFix?.count) || 0;
    if (fixedCount > 0 && typeof res.body === 'string') {
      p.body = res.body;
      const ta = $('ed-body');
      if (ta) ta.value = res.body;
    }
    p.bodyOriginal = p.body;
    p.bodyDirty = false;
    markDirty();
    if (fixedCount > 0) toast(`已保存，并自动修正 ${fixedCount} 处公式转义（\\* → *）`, 'ok');
    else toast(res.changed ? '已保存' : '没有变化，未写盘', 'ok');
    await loadItems(true);
    renderTree();
    if (movesPermalink && store.state?.preview?.running) {
      toast('改动了标题/日期，URL 跟着变了，正在重启预览…');
      await restartPreview(true);
    } else if (previewPath === p.path) {
      setPreviewFor(p.path);
    }
    refreshState();
  } catch (err) {
    toast(`保存失败：${err.message}`, 'error');
  }
}

// ---------------- 拖入 .md 导入 ----------------
//
// 拖进来的文件只在浏览器里读成文本，POST /api/content/analyze 让服务端用 lib/frontmatter.mjs
// 解析（不在前端重写一遍 YAML 解析）；用户确认后才走原有两条写盘路径：
//   新建 → POST /api/content        正文走 stdin，front matter 仍由 archetypes/ 生成
//   编辑 → PUT  /api/content/file   替换正文 + 只补空缺字段（勾选框打开才覆盖）
//
// 全局拦下 dragover/drop：不拦的话浏览器会直接用拖进来的文件替换整个页面。

const IMPORT_MAX_BYTES = 4 * 1024 * 1024;
// 缺必填 front matter 时给用户看的字段名
const FRONTMATTER_LABEL = { title: '标题 title', date: '日期 date', draft: '草稿状态 draft' };
// section 页的 layout / cascade 等结构键不在编辑器里重建，只能提示重做
const SECTION_TYPES = new Set(['course-home', 'chapter', 'project-home', 'project-section', 'courses-list', 'projects-list', 'posts-list', 'section-list', 'taxonomy-page']);
// 列表页（分区的入口页：/posts/、/courses/、/tags/ 这些）没有对应的「新建」面板类型 ——
// 面板里的 kind 一一对应 new-content.sh 的子命令，而列表页走的是 section 子命令。
// 所以它们的修复提示要指向 CLI，不能把人送到一个不存在的按钮上。
const LIST_TYPES = new Set(['courses-list', 'projects-list', 'posts-list', 'section-list', 'taxonomy-page']);

let importOverwrite = false; // 编辑面板：是否用文件里的值覆盖已有字段（默认只补空缺）

document.addEventListener('dragover', (ev) => ev.preventDefault());
document.addEventListener('drop', (ev) => ev.preventDefault());

function fileFromDrop(ev) {
  const files = [...(ev.dataTransfer?.files ?? [])];
  if (files.length === 0) return null;
  if (files.length > 1) toast('一次只处理一个文件，已取第一个', 'error');
  return files[0];
}

// 中文 Windows 上导出的 .md 常见 GBK：先按 UTF-8 严格解码，失败再退回 GBK 并明确告知，
// 免得整篇正文变成乱码而用户不知道发生了什么。
async function readMarkdownFile(file) {
  if (!/\.md$/i.test(file.name)) throw new Error(`只支持 .md 文件：${file.name}`);
  if (file.size > IMPORT_MAX_BYTES) {
    throw new Error(`文件太大（${Math.round(file.size / 1024)}KB），上限 ${IMPORT_MAX_BYTES / 1024 / 1024}MB`);
  }
  const buf = await file.arrayBuffer();
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(buf), encoding: 'UTF-8' };
  } catch {
    return { text: new TextDecoder('gbk').decode(buf), encoding: 'GBK' };
  }
}

async function analyzeFile(file) {
  const { text, encoding } = await readMarkdownFile(file);
  const info = await api.send('POST', '/api/content/analyze', { text, filename: file.name });
  if (encoding !== 'UTF-8') {
    info.warnings = [`文件不是 UTF-8（已按 ${encoding} 解码）；如有乱码请先转成 UTF-8。`, ...(info.warnings ?? [])];
  }
  return info;
}

// 拖放区：点击/回车也能选文件（拖放不是唯一入口）
function bindDropZone(el, onFile) {
  const input = el.querySelector('input[type=file]');
  el.addEventListener('click', () => input?.click());
  el.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      input?.click();
    }
  });
  el.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    el.classList.add('over');
  });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    el.classList.remove('over');
    const file = fileFromDrop(ev);
    if (file) await onFile(file);
  });
  input?.addEventListener('change', async () => {
    const file = input.files?.[0];
    input.value = ''; // 同一个文件连选两次也要能再次触发
    if (file) await onFile(file);
  });
}

function setCreateField(key, value) {
  const el = document.querySelector(`#create-fields [data-field="${key}"]`);
  if (!el || value === undefined || value === null || value === '') return false;
  if (el.tagName === 'SELECT') {
    // 只在选项里确实有该值时才选（如 unit 只允许「章 / 周」）
    if (![...el.options].some((o) => o.value === String(value))) return false;
    el.value = String(value);
    return true;
  }
  if (el.type === 'checkbox') {
    el.checked = value === true || value === 'true';
    return true;
  }
  el.value = String(value);
  return true;
}

// 把解析结果填进新建表单。只填「能从文件推出来」的字段：类型、目标目录、课程/章节这些
// 仍然由用户在表单里选。标签/分类只勾选词表里已有的，词表外的留给用户在提示里处理。
function applyImportToCreateForm(info) {
  const fill = info.fill ?? {};
  const stem = String(info.filename || '').replace(/\.md$/i, '');
  const asciiStem = /^[A-Za-z0-9._-]+$/.test(stem) ? stem : '';
  const kind = store.kind;

  setCreateField('title', fill.title);
  setCreateField('date', fill.date);
  setCreateField('description', fill.description);
  setCreateField('repo', fill.repo);
  setCreateField('unit', fill.unit);
  // 目录名类字段优先用 ASCII 文件名（中文目录名会让 URL 变成百分号编码），否则退回标题的 slug
  const dirName = asciiStem || fill.slug || '';
  if (kind === 'post') setCreateField('slug', dirName);
  if (kind === 'course' || kind === 'project' || kind === 'sub') setCreateField('name', dirName);
  // 文档名保留原始文件名（这个仓库的项目文档本来就是中文文件名），脚本会去掉 .md
  if (kind === 'doc' && stem) setCreateField('name', stem);
  if (kind === 'doc' && fill.math === 'false') setCreateField('noMath', true);
  if (KINDS[kind]?.series && Array.isArray(fill.series) && fill.series.length) {
    const el = $('create-series');
    if (el) el.value = fill.series.join(', ');
  }

  const knownTags = new Set((store.taxonomy.tags ?? []).map((t) => t.toLowerCase()));
  const knownCats = new Set((store.taxonomy.categories ?? []).map((c) => c.toLowerCase()));
  store.createTags = new Set((fill.tags ?? []).filter((t) => knownTags.has(t.toLowerCase())));
  store.createCats = new Set((fill.categories ?? []).filter((c) => knownCats.has(c.toLowerCase())));
  renderChipsPicker('tag-chips', store.taxonomy.tags, store.createTags, $('tag-search').value);
  renderChipsPicker('cat-chips', store.taxonomy.categories, store.createCats, '');
}

function importNoticeHtml(info) {
  const knownTags = new Set((store.taxonomy.tags ?? []).map((t) => t.toLowerCase()));
  const knownCats = new Set((store.taxonomy.categories ?? []).map((c) => c.toLowerCase()));
  const tags = Array.isArray(info.values.tags) ? info.values.tags : [];
  const cats = Array.isArray(info.values.categories) ? info.values.categories : [];
  const unknown = [
    ...tags.filter((t) => !knownTags.has(t.toLowerCase())),
    ...cats.filter((c) => !knownCats.has(c.toLowerCase())),
  ];
  const rows = [
    `<div><strong>已载入 ${esc(info.filename || '（无名文件）')}</strong>：正文 ${info.bodyLines} 行${
      info.hasFrontMatter ? '' : '（文件里没有 front matter，标题与日期已按正文标题和今天推断）'
    }。</div>`,
  ];
  const fields = Object.keys(info.values);
  rows.push(`<div class="hint">文件里的字段：${fields.length ? esc(fields.join('、')) : '（没有可识别的字段）'}；已按文件里的值填进表单，可以再改。</div>`);
  if (tags.length || cats.length) {
    rows.push(
      `<div class="hint">文件里的标签：${esc([...tags, ...cats].join('、'))}${
        unknown.length ? `；其中 ${esc(unknown.join('、'))} 不在词表里，<b>没有</b>自动勾选（要加请用下面的「加入词表」）` : '（都在词表里，已自动勾选）'
      }</div>`
    );
  }
  if (info.notApplicable?.length) rows.push(`<div class="hint">这些键新建表单里没有对应输入，未导入：${esc(info.notApplicable.join('、'))}</div>`);
  if (info.unknownKeys?.length) rows.push(`<div class="hint">不认识的键（已忽略）：${esc(info.unknownKeys.join('、'))}</div>`);
  for (const w of info.warnings ?? []) rows.push(`<div class="hint">⚠ ${esc(w)}</div>`);
  for (const problem of lintDollar(info.body)) rows.push(`<div class="hint err">⚠ ${esc(problem)}</div>`);
  rows.push('<div class="inline" style="margin-top:6px"><button type="button" class="ghost" id="import-clear">移除导入</button></div>');
  return rows.join('');
}

function renderImportNotice() {
  const el = $('import-notice');
  if (!el) return;
  if (!store.import) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = importNoticeHtml(store.import.analysis);
  $('import-clear')?.addEventListener('click', () => {
    store.import = null;
    renderImportNotice();
    toast('已移除导入的正文（表单里已填的字段保留，可继续手填或再拖一个文件）');
  });
}

async function onCreateDrop(file) {
  try {
    const info = await analyzeFile(file);
    store.import = { filename: info.filename || file.name, body: info.body, analysis: info };
    applyImportToCreateForm(info);
    renderImportNotice();
    toast(`已载入 ${store.import.filename}：正文 ${info.bodyLines} 行，尚未创建`, 'ok');
  } catch (err) {
    toast(`读取文件失败：${err.message}`, 'error');
  }
}

// 编辑面板：只补空缺字段；overwrite 打开时才覆盖已有值。
// draft 永远不在这里改（是否发布由用户决定），tags/categories 在禁止写标签的类型上跳过。
function applyImportToEditor(info, overwrite) {
  const p = pending;
  if (!p) return [];
  const fill = info.fill ?? {};
  const knownTags = new Set((store.taxonomy.tags ?? []).map((t) => t.toLowerCase()));
  const knownCats = new Set((store.taxonomy.categories ?? []).map((c) => c.toLowerCase()));
  const applied = [];
  for (const f of p.schema.fields) {
    if (f.kind === 'child' || f.key === 'draft') continue;
    if ((f.key === 'tags' || f.key === 'categories') && p.schema.tagsPolicy === 'forbidden') continue;
    let value = fill[f.key];
    if (f.key === 'tags') value = (fill.tags ?? []).filter((t) => knownTags.has(t.toLowerCase()));
    if (f.key === 'categories') value = (fill.categories ?? []).filter((c) => knownCats.has(c.toLowerCase()));
    if (value === undefined) continue;
    if (f.kind === 'bool') value = value === true || value === 'true';
    const cur = p.changed.has(f.key) ? p.changed.get(f.key) : p.values[f.key];
    const emptyNow = f.kind === 'list' || Array.isArray(cur) ? !(Array.isArray(cur) && cur.length) : !String(cur ?? '').trim();
    if (!overwrite && !emptyNow) continue;
    p.values[f.key] = value;
    p.changed.set(f.key, value);
    applied.push(f.label ?? f.key);
  }
  return applied;
}

function renderEditorImportNotice(info, applied, overwrite) {
  const el = $('ed-import-notice');
  if (!el) return;
  const knownTags = new Set((store.taxonomy.tags ?? []).map((t) => t.toLowerCase()));
  const tags = Array.isArray(info.values.tags) ? info.values.tags : [];
  const unknown = tags.filter((t) => !knownTags.has(t.toLowerCase()));
  const rows = [
    `<div class="hint"><strong>已用 ${esc(info.filename || '（无名文件）')} 替换正文</strong>（${info.bodyLines} 行）${
      overwrite ? '，并按文件覆盖了已有字段' : '，front matter 只补了空缺字段'
    }。</div>`,
  ];
  if (applied.length) rows.push(`<div class="hint">补上/覆盖的字段：${esc(applied.join('、'))}</div>`);
  if (unknown.length) rows.push(`<div class="hint">词表外的标签没有写入：${esc(unknown.join('、'))}</div>`);
  if (info.notApplicable?.length) rows.push(`<div class="hint">这些键本页编辑器没有对应输入，未处理：${esc(info.notApplicable.join('、'))}</div>`);
  // draft: false 的提醒已经在 info.warnings 里（服务端统一生成），这里不再重复一遍
  for (const w of info.warnings ?? []) rows.push(`<div class="hint">⚠ ${esc(w)}</div>`);
  for (const problem of lintDollar(info.body)) rows.push(`<div class="hint err">⚠ ${esc(problem)}</div>`);
  el.innerHTML = `<div class="import-notice">${rows.join('')}</div>`;
}

async function onEditorDrop(file) {
  if (!pending) {
    toast('先在左侧选一个要替换的文件，再拖入 .md', 'error');
    return;
  }
  try {
    const info = await analyzeFile(file);
    const overwrite = Boolean($('ed-import-overwrite')?.checked);
    if (pending.bodyDirty && !window.confirm(`当前正文有未保存的改动（${pending.path}）。\n确定用 ${info.filename || file.name} 的正文替换吗？`)) {
      return;
    }
    pending.body = info.body;
    pending.bodyDirty = pending.body !== pending.bodyOriginal;
    const applied = applyImportToEditor(info, overwrite);
    renderEditor();
    markDirty();
    renderEditorImportNotice(info, applied, overwrite);
    toast(
      `已用 ${info.filename || file.name} 替换正文（尚未保存）${applied.length ? `，补了 ${applied.length} 个字段` : ''}`,
      'ok'
    );
  } catch (err) {
    toast(`读取文件失败：${err.message}`, 'error');
  }
}

// 文件没有 front matter / 缺必填键时的一键补全：只写 schema 里暴露的键，补完仍需点「保存」。
// 值取正文第一个 # 标题、站点今天、draft: true（安全缺省）；section 页的 layout/cascade
// 不在补全范围（那是骨架的职责），所以那种情况只提示用「新建」面板重建。
function repairFrontMatter() {
  const p = pending;
  if (!p) return;
  const missing = new Set(p.missingRequired ?? []);
  const heading = (/^#[ \t]+(.+?)[ \t]*$/m.exec(p.body) ?? [])[1] ?? '';
  const stem = String(p.path).split('/').pop().replace(/\.md$/i, '');
  const defaults = {
    title: p.values.title || heading || stem,
    date: p.values.date || store.state?.siteToday || '',
    draft: true,
  };
  if (!SECTION_TYPES.has(p.type) && !p.hasFrontMatter) {
    defaults.weight = 1;
    defaults.math = true;
  }
  const applied = [];
  for (const f of p.schema.fields) {
    if (f.kind === 'child' || f.key === 'tags' || f.key === 'categories') continue;
    if (!(f.key in defaults)) continue;
    const cur = p.changed.has(f.key) ? p.changed.get(f.key) : p.values[f.key];
    const emptyNow = f.kind === 'bool' ? cur === undefined || cur === '' : !String(cur ?? '').trim();
    if (!missing.has(f.key) && !(emptyNow && !p.hasFrontMatter)) continue;
    const value = f.kind === 'bool' ? defaults[f.key] === true || defaults[f.key] === 'true' : String(defaults[f.key]);
    if (value === '') continue;
    p.values[f.key] = value;
    p.changed.set(f.key, value);
    applied.push(f.label ?? f.key);
  }
  if (applied.length === 0) {
    toast('没有可自动补全的字段', 'error');
    return;
  }
  renderEditor();
  markDirty();
  toast(`已补上：${applied.join('、')}（还要点「保存」才写盘）`, 'ok');
}

// 编辑面板整块都是拖放目标；遮罩用 pointer-events:none，不干扰拖放事件本身
function bindEditorDropZone() {
  const panel = $('panel-edit');
  panel.addEventListener('dragover', (ev) => {
    ev.preventDefault();
    if (pending) $('editor-drop').hidden = false;
  });
  panel.addEventListener('dragleave', (ev) => {
    if (!panel.contains(ev.relatedTarget)) $('editor-drop').hidden = true;
  });
  panel.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    $('editor-drop').hidden = true;
    const file = fileFromDrop(ev);
    if (file) await onEditorDrop(file);
  });
}

// ---------------- 删除 ----------------
//
// 两步走：第一次点击先让脚本「干跑」一遍（remove --dry-run），把会删掉的文件清单摆出来；
// 第二次点击才真删。判定规则（哪些路径能删、能不能连目录删、section 根一律拒绝）只有
// scripts/new-content.sh 的 cmd_remove 一份实现，前端不重写。

let deleteArmed = false;
let deleteTimer = null;

function resetDeleteArm() {
  deleteArmed = false;
  clearTimeout(deleteTimer);
  const btn = $('ed-delete');
  if (btn) {
    btn.textContent = '删除';
    btn.classList.remove('armed');
  }
}

function dirOf(relPath) {
  const s = String(relPath);
  const i = s.lastIndexOf('/');
  return i > 0 ? s.slice(0, i) : s;
}

function deleteNoticeHtml(title, res, dirty) {
  const rel = String(res.path ?? '');
  const files = res.plan?.length ? res.plan : res.removed ?? [];
  const wholeDir = /(^|\/)_index\.md$/.test(rel);
  const err = res.stderr ? `<div class="notice-err">${esc(String(res.stderr).trim())}</div>` : '';
  // 预检被拒时只说清「删不了、为什么」，不要去描述「本来会删掉什么」
  if (!res.ok) {
    return `<div class="notice error"><div><strong>${esc(title)}：</strong><code>${esc(rel)}</code></div>${err}</div>`;
  }
  const head = wholeDir
    ? `这是 section 入口页，会连它所在的<b>整个目录</b>一起删（含附件与下级页面），共 ${files.length} 个文件`
    : `会删除 ${files.length} 个文件`;
  const list = files.length ? `<ul>${files.map((f) => `<li><code>${esc(f)}</code></li>`).join('')}</ul>` : '';
  const unsaved = dirty ? '<div>⚠ 这个页面还有<b>未保存</b>的改动，会一起丢掉。</div>' : '';
  return (
    `<div class="notice error"><div><strong>${esc(title)}：</strong>${head}</div>` +
    list +
    err +
    unsaved +
    `<div class="hint">还没动手：再点一次「确认删除」才真的删。删除会出现在「发布」页签的改动清单里；` +
    `已提交过的内容可以用 <code>git checkout -- ${esc(wholeDir ? dirOf(rel) : rel)}</code> 找回。</div></div>`
  );
}

async function onDeleteClick() {
  const p = pending;
  if (!p) return;
  const btn = $('ed-delete');
  const dirty = p.changed.size > 0 || p.coverChanged.size > 0 || p.bodyDirty;
  if (!deleteArmed) {
    btn.disabled = true;
    try {
      const res = await api.send('POST', '/api/content/delete', { path: p.path, withBundle: true, dryRun: true });
      if (!res.ok) {
        $('ed-delete-notice').innerHTML = deleteNoticeHtml('不能删除', res, dirty);
        toast('这个文件删不了，原因见编辑器里的提示', 'error');
        return;
      }
      deleteArmed = true;
      btn.textContent = '确认删除';
      btn.classList.add('armed');
      $('ed-delete-notice').innerHTML = deleteNoticeHtml('确认要删除吗', res, dirty);
      clearTimeout(deleteTimer);
      deleteTimer = setTimeout(resetDeleteArm, 20000);
    } catch (err) {
      toast(`删除预检失败：${err.message}`, 'error');
    } finally {
      btn.disabled = false;
    }
    return;
  }

  resetDeleteArm();
  btn.disabled = true;
  try {
    const res = await api.send('POST', '/api/content/delete', { path: p.path, withBundle: true });
    if (!res.ok) {
      $('ed-delete-notice').innerHTML = deleteNoticeHtml('删除失败', res, dirty);
      toast('删除失败，原因见编辑器里的提示', 'error');
      return;
    }
    await afterDelete(p.path, res);
  } catch (err) {
    toast(`删除失败：${err.message}`, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function afterDelete(relPath, res) {
  const n = res.removed?.length ?? 0;
  pending = null;
  $('editor').innerHTML = '<p class="muted">文件已删除。从左侧选一个文件继续编辑。</p>';
  await loadItems(true);
  renderTree();
  renderCreateFields(); // 课程 / 章节下拉要跟着更新
  // 预览不该停在已经删掉的地址上：往上找最近一个还在的 _index.md
  const next = nearestSurvivingIndex(relPath);
  if (next) {
    toast(`已删除 ${n} 个文件：${relPath}`, 'ok');
    setPreviewFor(next);
  } else {
    toast(`已删除 ${n} 个文件：${relPath}（预览未改动，可从左侧选一个文件重新预览）`, 'ok');
  }
  refreshState();
}

function nearestSurvivingIndex(relPath) {
  const parts = String(relPath).split('/');
  for (let i = parts.length - 1; i > 0; i--) {
    const candidate = `${parts.slice(0, i).join('/')}/_index.md`;
    if (store.items.some((it) => it.path === candidate)) return candidate;
  }
  return '';
}

// Markdown 工具条：在选区两端插标记，或插入整块模板
function onToolbar(ev) {
  const btn = ev.target.closest('button[data-md]');
  if (!btn) return;
  const ta = $('ed-body');
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const sel = ta.value.slice(start, end);
  const wrap = (before, after, placeholder) => {
    const inner = sel || placeholder;
    ta.value = ta.value.slice(0, start) + before + inner + after + ta.value.slice(end);
    ta.selectionStart = start + before.length;
    ta.selectionEnd = start + before.length + inner.length;
  };
  const insert = (text) => {
    ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    ta.selectionStart = ta.selectionEnd = start + text.length;
  };
  switch (btn.dataset.md) {
    case 'bold':
      wrap('**', '**', '加粗文字');
      break;
    case 'h2':
      insert('\n## 小标题\n');
      break;
    case 'link':
      wrap('[', '](https://)', '链接文字');
      break;
    case 'code':
      wrap('`', '`', 'code');
      break;
    case 'fence':
      insert('\n```bash\n\n```\n');
      break;
    case 'imath':
      wrap('$', '$', 'x^2');
      break;
    case 'dmath':
      insert('\n$$\n\n$$\n');
      break;
    default:
      return;
  }
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
}

// 裸 $ 检查。实测（在真正的构建里，KaTeX 的 strict 模式是 'error'）：
//   价格是 $100，折扣是 $200。        → 构建失败（LaTeX-incompatible input, strict mode 'error'）
//   区间 $一百到二百$ 元。            → 构建失败
//   公式 $\frac{1}{$后面              → 构建失败（Unexpected end of input in a macro argument）
//   公式 $a^2+b^2=c^2$，正常。        → 通过
// 所以「$ 不成对 / 中间含中文」是会让构建失败的真实原因，这里如实提示。
function lintDollar(body) {
  const problems = [];
  let text = String(body)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');

  const displayTokens = text.match(/\$\$/g) ?? [];
  if (displayTokens.length % 2 !== 0) {
    problems.push('块级公式定界符 $$ 数量是奇数，没有配对，构建会失败');
  }
  text = text.replace(/\$\$/g, ' ');

  const singles = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '$' && text[i - 1] !== '\\') singles.push(i);
  }
  if (singles.length % 2 !== 0) {
    problems.push(`有 ${singles.length} 个未转义的 $（奇数）：构建会失败，只想显示美元符号请写成 \\$`);
  } else {
    for (let i = 0; i + 1 < singles.length; i += 2) {
      const inner = text.slice(singles[i] + 1, singles[i + 1]);
      if (/[\u4e00-\u9fff]/.test(inner)) {
        problems.push(`一对 $ 之间含中文（「${inner.slice(0, 16)}」）：会被当成公式交给 KaTeX，构建会因 Unicode text character ... used in math mode 失败——这里如果只是想显示美元符号，请写 \\$`);
      }
    }
  }
  return problems;
}

function lintHtml(body) {
  const problems = lintDollar(body);
  if (problems.length === 0) return '<p class="hint">✓ $ 与 $$ 配对检查通过</p>';
  return `<div class="notice error">${problems.map((p) => esc(p)).join('<br>')}</div>`;
}

// ---------------- 发布 ----------------

function renderChanges() {
  const s = store.state;
  const el = $('changes');
  if (!s) return;
  if (s.entries.length === 0) {
    const ahead = s.ahead ?? 0;
    el.innerHTML = `<div class="change-row"><span class="xy"></span><span class="p">${
      ahead > 0 ? `工作区干净，但有 ${ahead} 个提交待推送` : '没有需要推送的内容（工作区干净且与 origin/main 同步）'
    }</span></div>`;
    return;
  }
  el.innerHTML = s.entries
    .map((e) => `<div class="change-row" data-path="${esc(e.path)}"><span class="xy">${esc(e.xy.trim() || '??')}</span><span class="p">${esc(e.path)}</span></div>`)
    .join('');
}

$('changes').addEventListener('click', async (ev) => {
  const row = ev.target.closest('.change-row[data-path]');
  if (!row) return;
  try {
    const res = await api.get(`/api/git/diff?path=${encodeURIComponent(row.dataset.path)}`);
    $('preview-diff-wrap').hidden = false;
    $('diff-view').textContent = res.ok ? res.diff || '（没有文本差异，可能是二进制或被忽略）' : `读取失败：${res.error}`;
  } catch (err) {
    toast(`读取 diff 失败：${err.message}`, 'error');
  }
});

let confirmTimer = null;

$('publish-btn').addEventListener('click', async () => {
  const btn = $('publish-btn');
  if (btn.dataset.armed !== '1') {
    const s = store.state;
    const drafts = s?.drafts ?? [];
    const future = s?.futureDated ?? [];
    let msg = `将执行 git add -A 并提交推送 ${s?.entries.length ?? 0} 个改动文件。\n`;
    if (s?.branch !== 'main') msg += `\n⚠ 当前分支是 ${s?.branch}，push-blog.sh 会直接中止。`;
    else {
      if (drafts.length) msg += `\n⚠ 其中 ${drafts.length} 个文件仍是 draft: true，CI 不会发布它们。`;
      if (future.length) msg += `\n⚠ 有 ${future.length} 个页面日期在未来，CI 同样不会发布。`;
    }
    msg += '\n\n再点一次按钮确认。';
    toast(msg);
    btn.dataset.armed = '1';
    btn.textContent = '确认发布？';
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      btn.dataset.armed = '';
      btn.textContent = '发布到 origin/main';
    }, 10000);
    return;
  }
  clearTimeout(confirmTimer);
  btn.dataset.armed = '';
  btn.textContent = '发布到 origin/main';

  const message = $('commit-msg').value.trim() || 'chore: 更新博客内容';
  const log = $('publish-log');
  log.hidden = false;
  log.textContent = '';
  store.publishing = true;
  btn.disabled = true;
  $('publish-hint').textContent = '正在发布…';

  try {
    const res = await fetch('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let exitCode = null;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, idx).replace(/^data: /, '');
        buf = buf.slice(idx + 2);
        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          continue;
        }
        if (payload.text) {
          const span = document.createElement('span');
          if (payload.stream === 'err') span.className = 'err';
          span.textContent = payload.text;
          log.appendChild(span);
        }
        if (payload.event === 'done') exitCode = payload.code;
      }
      log.scrollTop = log.scrollHeight;
    }
    if (exitCode === 0) {
      toast('推送完成，CI 会自动部署', 'ok');
      $('publish-hint').textContent = '已推送';
    } else {
      toast(`发布未完成（退出码 ${exitCode}），看日志尾部`, 'error');
      $('publish-hint').textContent = `退出码 ${exitCode}`;
    }
  } catch (err) {
    toast(`发布失败：${err.message}`, 'error');
    log.textContent += `✗ ${err.message}\n`;
  } finally {
    store.publishing = false;
    btn.disabled = false;
    refreshState();
    loadItems(true).catch(() => {});
  }
});

// ---------------- 启动 ----------------

(async function init() {
  // 正文/字段的输入用委托监听一次即可：编辑器内容是反复重渲染的，逐个绑定会越积越多。
  $('editor').addEventListener('input', onEditorInput);
  // 「覆盖已有字段」是全局偏好，不随编辑器重渲染丢失
  $('editor').addEventListener('change', (ev) => {
    if (ev.target.id === 'ed-import-overwrite') importOverwrite = ev.target.checked;
  });
  bindDropZone($('create-drop'), onCreateDrop);
  bindEditorDropZone();
  loadKindPref();
  renderKindPicker();
  try {
    await loadTaxonomy();
    renderVocab();
  } catch (err) {
    toast(`读取词表失败：${err.message}`, 'error');
  }
  try {
    await loadItems(true);
  } catch (err) {
    toast(`读取内容列表失败：${err.message}`, 'error');
  }
  renderCreateFields();
  await refreshState();
  renderPreviewStatus();
  setInterval(refreshState, 6000);
})();
