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
  tab: 'create',
  // 有未保存改动的文件（树上打点提示）；离开页面时也靠它决定要不要拦一下
  unsaved: new Set(),
  // 体检面板的状态：结果按检查项 id 存
  checks: { items: [], results: new Map(), running: false, selected: null, mode: null },
  ci: null,
};

// ---------------- 顶栏状态 ----------------

function chips() {
  const s = store.state;
  if (!s) return '';
  // 只留「会改变你今天动作」的状态。待推送为 0、草稿为 0 这类不需要占位的数字不再显示，
  // 想让它们出现时点开发布页看细节。
  const out = [];
  const outOfMain = s.branch !== 'main';
  out.push(`<span class="chip ${outOfMain ? 'warn' : ''}" title="当前分支">${esc(s.branch || '?')}</span>`);
  out.push(`<span class="chip ${s.entries.length ? 'warn' : ''}" title="工作区改动数（发布页有清单与 diff）">改动 <b>${s.entries.length}</b></span>`);
  if (s.ahead > 0) out.push(`<span class="chip warn" title="已提交但还没推送">待推 <b>${s.ahead}</b></span>`);
  if (s.drafts.length) out.push(`<span class="chip warn" title="草稿不会被 CI 发布">草稿 <b>${s.drafts.length}</b></span>`);
  if (s.futureDated?.length) out.push(`<span class="chip warn" title="日期在未来，Hugo 默认不构建">排期 <b>${s.futureDated.length}</b></span>`);
  const p = s.preview;
  const pText = !s.previewEnabled ? '已关闭' : p.ready ? `:${p.port}` : p.running ? '启动中' : '未运行';
  out.push(`<span class="chip ${p.ready ? 'ok' : ''}" title="内嵌预览状态">预览 <b>${pText}</b></span>`);
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
    renderDrafts();
    renderCommits();
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
  const hidden = main.classList.contains('preview-hidden');
  $('preview-toggle').textContent = hidden ? '显示预览' : '预览';
  $('preview-toggle').classList.toggle('active', !hidden);
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

const TABS = ['create', 'edit', 'publish', 'check'];

$('tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (btn) activateTab(btn.dataset.tab);
});

// 切面板的唯一入口：tab 点击、URL hash（刷新/收藏）、命令面板都走这里，
// 免得三处各写一遍「切 class + 拉数据」而漂移。silent 用于从 hash 恢复时不回写 hash。
function activateTab(name, { silent = false } = {}) {
  if (!TABS.includes(name)) name = 'create';
  store.tab = name;
  for (const b of $('tabs').querySelectorAll('button')) b.classList.toggle('active', b.dataset.tab === name);
  for (const p of document.querySelectorAll('.panel')) p.classList.toggle('active', p.id === `panel-${name}`);
  if (!silent) setHash(name);
  if (name === 'edit') loadTree();
  if (name === 'publish') {
    refreshState();
    loadCi();
  }
  if (name === 'check') loadCheckItems();
}

// ---------------- 新建 ----------------

// 一章可以建哪些材料页。章目录下**任何** leaf bundle 都会被章入口页列为材料卡片，
// 而入口页按**目录名**把它们分进「笔记 / 习题 / 实验」三组（认不出的落进「其他」）：
// notes* → 笔记、homework* → 习题、lab* → 实验。同一组可以有多页 —— 三个材料类型的表单
// 都带「目录名」字段，填 notes-02 / homework-02 / lab-02 即可（权重自动接着排）。
const MATERIAL_CHOICES = [
  { value: 'notes', label: '📖 学习笔记' },
  { value: 'homework', label: '📝 作业' },
  { value: 'lab', label: '🧪 实验' },
];

// 「目录名」字段在三个材料类型里共用一份说明：它现在有两层后果 ——
// 决定 URL 的目录，也决定这页在章节入口页上属于哪一组（界面上别再把它当成纯内部文件名）。
const DIR_HINT = {
  notes: '留空 = notes。同一章要放第二份笔记就填 notes-02（权重自动接着排），并把标题也改开（如「学习笔记（中）」）——两页同标题在章节页上分不出来。notes* 都列在「笔记」组下',
  homework: '留空 = homework。同一章第二份作业填 homework-02，同样记得改标题。homework* 在章节页上列在「习题」组下',
  lab: '留空 = lab。同一章要放第二个实验就填 lab-02（权重自动接着排）。lab* 在章节页上列在「实验」组下',
};

const KINDS = {
  post: {
    label: '文章',
    tags: true,
    cats: true,
    series: true,
    fields: [
      { k: 'title', label: '标题' },
      {
        k: 'slug',
        label: '目录名（slug）',
        hint: '可以留空：留空就由标题自动派生（中文标题会派生成 post-2026-09-18 这样的日期名）。文章 URL 与目录名无关 —— 固定链接是 /:year/:month/:slug，:slug 取自「固定链接」字段或标题',
      },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', hint: '列表页与摘要使用', more: true },
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
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
    ],
  },
  chapter: {
    label: '章节',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'title', label: '章节标题', required: true },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
      {
        k: 'materials',
        label: '本章材料',
        type: 'checks',
        options: MATERIAL_CHOICES,
        default: ['notes', 'homework'],
        hint: '勾哪些就建哪些；不勾则只建入口页，之后可用「笔记 / 作业 / 实验」单独补。入口页会按材料的目录名把它们分成「笔记 / 习题 / 实验」三组显示，同一组可以有多页',
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
      { k: 'dir', label: '目录名', hint: DIR_HINT.notes },
      { k: 'title', label: '标题', hint: '留空用骨架默认「学习笔记」' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
    ],
  },
  homework: {
    label: '作业',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'chapter', label: '所属章节', type: 'select', source: 'chapters', required: true, hint: '只列已有章节；新章节请用「章节」' },
      { k: 'dir', label: '目录名', hint: DIR_HINT.homework },
      { k: 'title', label: '标题', hint: '留空用骨架默认「作业」' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
    ],
  },
  lab: {
    label: '实验',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'chapter', label: '所属章节', type: 'select', source: 'chapters', required: true, hint: '只列已有章节；新章节请用「章节」' },
      { k: 'dir', label: '目录名', hint: DIR_HINT.lab },
      { k: 'title', label: '标题', hint: '留空用骨架默认「实验」' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
    ],
  },
  project: {
    label: '项目',
    tags: true,
    cats: true,
    fields: [
      { k: 'name', label: '项目目录名', required: true },
      { k: 'title', label: '项目名' },
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
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
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
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
      { k: 'date', label: '日期', hint: '格式 2026-09-12；留空用骨架里的今天', more: true },
      { k: 'description', label: '描述', type: 'textarea', more: true },
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
  // 材料目录名跟着类型走，不能跨类型带过去（见 renderCreateFields 的说明）
  renderCreateFields({ resetFields: ['dir'] });
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

// resetFields：切类型时要丢掉的字段值。字段值默认按**字段名**跨类型带过去（`笔记 → 作业`
// 保留已填的标题，是有意的），但 `dir` 不能这么带：它的正确取值是跟着类型走的（notes / homework /
// lab），把「笔记」里填的 notes-02 带到「作业」上，会去建一个叫 notes-02 的作业页 —— 重的会撞上
// 同名目录、轻的也会让那页在章节入口页上落到「笔记」组。
function renderCreateFields({ resetFields = [] } = {}) {
  const spec = KINDS[store.kind];
  const snapshot = snapshotCreateFields();
  for (const k of resetFields) delete snapshot[k];
  const fieldHtml = (f) => {
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
  };
  // more: true 的字段折进「更多选项」（日期留空就是骨架里的今天、描述多数时候空着、系列只有
  // 文章用得上），首屏只留下必填和常用项。它们仍然可改，只是不再抢注意力。
  const primary = spec.fields.filter((f) => !f.more);
  const folded = spec.fields.filter((f) => f.more);
  $('create-fields').innerHTML = primary.map(fieldHtml).join('');
  $('create-more-fields').innerHTML = folded.map(fieldHtml).join('');
  restoreCreateFields(snapshot);
  // 折起来的字段里已经有值（拖入 .md 带进来的日期/描述，或上次填过）就自动展开，
  // 别让「导入的值」藏在收起的区块里让人以为没生效。
  const more = $('create-more');
  if (more) {
    const hasValue = folded.some((f) => {
      const v = snapshot[f.k];
      return f.type === 'checks' ? Array.isArray(v) && v.length > 0 : String(v ?? '').trim() !== '';
    });
    if (hasValue) more.open = true;
  }
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

// 重渲染表单（例如刚往词表里加了新词）不该把用户已经填好的内容清掉。
// 选择器用 #create-form（而不是 #create-fields）：折进「更多选项」的字段不在 #create-fields 里，
// 漏掉它们会在每次重渲染时把日期/描述清空。
function snapshotCreateFields() {
  const snap = {};
  for (const el of document.querySelectorAll('#create-form [data-field]')) {
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
  // 同 snapshotCreateFields：必须覆盖「更多选项」里的那些字段
  for (const el of document.querySelectorAll('#create-form [data-field]')) {
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

// 「直接发布」的默认值：`index.html` 的 #create-publish 也写了 checked，两处必须一致。
// 新建的多是写完就想发的稿子，草稿是例外；创建成功后复位到这个默认值，
// 免得下一条内容悄悄继承上一次的手动选择。
const DEFAULT_PUBLISH = true;

// 「创建后直接打开编辑器」的偏好也存本地（与上面同理：默认值写在 index.html 的 #create-open 上）。
const CREATE_OPEN_KEY = 'admin-create-open';

function initCreateOpenPref() {
  const el = $('create-open');
  if (!el) return;
  try {
    el.checked = localStorage.getItem(CREATE_OPEN_KEY) !== '0';
  } catch {
    /* 读不到就用默认的勾上 */
  }
  el.addEventListener('change', () => {
    try {
      localStorage.setItem(CREATE_OPEN_KEY, el.checked ? '1' : '0');
    } catch {
      /* 写不了就只在本次会话生效 */
    }
  });
}

$('create-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const spec = KINDS[store.kind];
  const form = { kind: store.kind, publish: $('create-publish').checked };
  // #create-form 而不是 #create-fields：折进「更多选项」的字段（日期 / 描述）也要收进来
  for (const el of $('create-form').querySelectorAll('[data-field]')) {
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
  // 系列已经是一个普通的 data-field 字段（在「更多选项」里），通用收集已经放进 form.series 了
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
      $('create-publish').checked = DEFAULT_PUBLISH;
      // 新建的多半是要接着写正文：直接开在编辑器里。批量建材料页时取消勾选，留在原地看日志。
      if ($('create-open').checked && res.files?.length) await openInEditor(res.files[0]);
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
  // 目录名留空时是服务端派生的，得说一声 —— 否则用户不知道文件建到哪个目录了
  if (res.derivedSlug) text += `▸ 目录名留空，已按标题派生为「${res.derivedSlug}」（文章 URL 不受它影响）\n`;
  if (res.addedTerms?.length) text += `▸ 新标签已写入词表：${res.addedTerms.join('、')}\n`;
  if (res.mathFix?.count > 0) text += `▸ 已自动修正 ${res.mathFix.count} 处公式写法（\\* / § / 圈号 → KaTeX 的正规写法）：不修的话 KaTeX 会让整站构建失败\n`;
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

// 打开某个文件；line > 0 时把正文滚到那一行（体检问题、搜索结果都靠它跳转）
async function openInEditor(relPath, line = 0) {
  activateTab('edit');
  await loadTree();
  await selectFile(relPath);
  if (line > 0) revealBodyLine(line);
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

// 折叠状态记在 localStorage：不记住的话每次刷新都重新展开全部 39 个文件
const TREE_COLLAPSED_KEY = 'admin-tree-collapsed';
const treeCollapsed = (() => {
  try {
    return new Set(JSON.parse(localStorage.getItem(TREE_COLLAPSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
})();

function saveTreeCollapsed() {
  try {
    localStorage.setItem(TREE_COLLAPSED_KEY, JSON.stringify([...treeCollapsed]));
  } catch {
    /* 隐私模式下写不了，不影响功能 */
  }
}

// 每个条目一行：标题 + 短徽标。原先每条还要再占一行完整路径（content/courses/…），
// 19 个文件就能把左栏撑出一屏半的滚动，而那一行信息在 title 提示和搜索里都有。
// 树的分组标题。材料页按**章节入口页上的分组**分（笔记 / 习题 / 实验 / 其他材料），与站点
// 那张入口页一致；其余仍按类型名。分组由服务端按目录名算好（lib/content.mjs 的 materialGroupOf），
// 前端不重新实现。目录名认不出来时它会落到「其他材料」—— 那正是站点上会显示成「其他」的那几页。
function treeGroupOf(item) {
  return item.groupLabel ? item.groupLabel : item.typeLabel;
}

function renderTree() {
  renderRecent();
  const kw = $('tree-search').value.trim().toLowerCase();
  const groups = new Map();
  for (const item of store.items) {
    // 分组名也进搜索词：材料页的「笔记 / 习题 / 实验」并不总写在标题里
    if (kw && !`${item.title} ${item.path} ${treeGroupOf(item)}`.toLowerCase().includes(kw)) continue;
    const label = treeGroupOf(item);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(item);
  }
  const shown = [...groups.values()].reduce((n, list) => n + list.length, 0);
  $('tree-count').textContent = kw ? `${shown} / ${store.items.length} 个文件` : `${store.items.length} 个文件`;
  if (groups.size === 0) {
    $('tree-body').innerHTML = '<p class="muted">没有匹配的文件</p>';
    return;
  }
  $('tree-body').innerHTML = [...groups.entries()]
    .map(([label, items]) => {
      // 搜索时强制展开：折叠着搜出「没匹配」比噪声更糟
      const collapsed = !kw && treeCollapsed.has(label);
      return `<div class="tree-group ${collapsed ? 'collapsed' : ''}">
        <button type="button" class="tree-group-head" data-group="${esc(label)}" aria-expanded="${!collapsed}">
          <span class="caret">${collapsed ? '▸' : '▾'}</span>${esc(label)}<span class="n">${items.length}</span>
        </button>
        <div class="tree-items">${items
          .map(
            (i) =>
              `<button type="button" class="tree-item${pending && pending.path === i.path ? ' active' : ''}${store.unsaved.has(i.path) ? ' unsaved' : ''}" data-path="${esc(i.path)}" title="${esc(i.path)}">` +
              `<span class="t">${esc(i.title)}</span>` +
              `${i.draft ? '<span class="badge">草稿</span>' : ''}${i.math ? '<span class="badge">公式</span>' : ''}</button>`
          )
          .join('')}</div>
      </div>`;
    })
    .join('');
}

// ---------------- 最近打开 ----------------
//
// 树是按类型分组的，跨类型找「刚写的那篇」要翻两组以上，所以在树上方置顶最多 6 条。
// 只记路径，标题每次从 store.items 现取：文件被删或改名后条目自然消失，不需要另写失效逻辑。
const RECENT_KEY = 'admin-recent-files';
const RECENT_MAX = 6;

let recentPaths = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
})();

function rememberRecent(relPath) {
  recentPaths = [relPath, ...recentPaths.filter((p) => p !== relPath)].slice(0, RECENT_MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentPaths));
  } catch {
    /* 隐私模式下写不了，只是记不住 */
  }
  renderRecent();
}

// 最近打开里同名条目很常见（每章都有「章节入口页」），所以右侧补一个短标签：
// 入口页（index.md / _index.md）取所在目录名——它们自己的文件名是零信息的；其他取文件名去 .md。
function shortLabel(relPath) {
  const parts = String(relPath).split('/');
  const last = String(parts[parts.length - 1] ?? '');
  const stem = /^_?index\.md$/i.test(last) ? parts[parts.length - 2] ?? last : last;
  return String(stem ?? '').replace(/\.md$/i, '');
}

function renderRecent() {
  const box = $('tree-recent');
  if (!box) return;
  const rows = recentPaths.map((p) => store.items.find((i) => i.path === p)).filter(Boolean);
  // 正在搜树时它让位：结果里就有目标，再挂一块最近打开只是噪声
  box.hidden = rows.length === 0 || $('tree-search').value.trim() !== '';
  if (box.hidden) return;
  box.innerHTML =
    '<div class="recent-head">最近打开</div>' +
    rows
      .map(
        (i) =>
          `<button type="button" class="tree-item${pending && pending.path === i.path ? ' active' : ''}" data-path="${esc(i.path)}" title="${esc(i.path)}"><span class="t">${esc(i.title)}</span><span class="badge">${esc(shortLabel(i.path))}</span></button>`
      )
      .join('');
}

$('tree-recent').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-path]');
  if (btn) selectFile(btn.dataset.path);
});

$('tree-search').addEventListener('input', renderTree);

$('tree-body').addEventListener('click', (ev) => {
  const head = ev.target.closest('button[data-group]');
  if (head) {
    const label = head.dataset.group;
    if (treeCollapsed.has(label)) treeCollapsed.delete(label);
    else treeCollapsed.add(label);
    saveTreeCollapsed();
    renderTree();
    return;
  }
  const btn = ev.target.closest('button[data-path]');
  if (btn) selectFile(btn.dataset.path);
});

let pending = null; // { path, schema, values, indents, cover, changed:Map, coverChanged:Map, body }

// 编辑器里折进「更多选项」的低频字段：改一次基本不再动。
//   weight —— 只有同级材料/章节要调顺序时才用
//   math   —— 课程材料页的 math 由课程主页 cascade 下发，页面自己通常不写（头部有「math 继承」徽章）
//   icon   —— 只有材料页用
// 它们仍然可改（折叠不等于隐藏），只是不再占据首屏。**不要**把 front matter 校验要求必填的键
// （title / date / draft）折进来：缺必填项时那个红色提示要能一眼看到（见 docs/admin.md 第 6.1 节）。
const EDITOR_LOW_FREQ = new Set(['weight', 'math', 'icon']);

async function selectFile(relPath) {
  try {
    // 切走之前先把还在防抖里的本地暂存补上，否则刚敲的那段会丢
    flushDraftNow();
    const data = await api.get(`/api/content/file?path=${encodeURIComponent(relPath)}`);
    pending = {
      path: data.path,
      type: data.type,
      typeLabel: data.typeLabel,
      // 材料页在章节入口页上属于哪一组（服务端按目录名算；非材料页是 null）
      group: data.group ?? null,
      groupLabel: data.groupLabel ?? null,
      schema: data.schema,
      values: data.values,
      indents: data.indents,
      cover: data.cover ?? {},
      body: data.body,
      hasFrontMatter: data.hasFrontMatter,
      // 缺哪些必填 front matter（服务端按 check-frontmatter.sh 的规则算好）：
      // 用来提示、并让「按默认值补全」知道该补什么
      missingRequired: data.missingRequired ?? [],
      // 正文第一行在文件里的行号：搜索与体检给的是文件行号，定位要减掉这个偏移
      bodyStartLine: data.bodyStartLine ?? 1,
      futureDate: Boolean(data.futureDate),
      changed: new Map(),
      coverChanged: new Map(),
      bodyDirty: false,
      bodyOriginal: data.body,
    };
    renderEditor();
    rememberRecent(data.path);
    renderTree();
    syncEditHash();
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
  // 材料页：它落在章节入口页的哪一组完全由**目录名**决定（notes* → 笔记 / homework* → 习题 /
  // lab* → 实验，其余 → 其他）。规则只写在 layouts/courses/chapter.html 里，这里只是把结果显示
  // 出来 —— 目录名一旦不合形状，那页会悄悄从「笔记」掉进「其他」，此前在管理页里看不出来。
  const materialDir = p.type === 'material' ? (p.path.split('/').slice(-2)[0] ?? '') : '';
  const isMaterial = p.type === 'material';
  const materialChip =
    isMaterial && p.groupLabel
      ? `<span class="chip ${p.group === 'other' ? 'warn' : ''}" title="章节入口页按目录名分组，这页列在「${esc(
          p.groupLabel
        )}」组下">章节页：${esc(p.groupLabel)}</span>`
      : '';
  const groupNotice =
    isMaterial && p.group === 'other'
      ? `<div class="notice"><strong>这页在章节入口页上会落到「其他」组：</strong>入口页按目录名分组
          （<code>notes*</code> → 笔记、<code>homework*</code> → 习题、<code>lab*</code> → 实验），而这页的目录名是
          <code>${esc(materialDir)}</code>，三种形状都对不上。想让它在站点上正常归类，就把目录改成上面三种之一
          （管理页不能改目录名，用 <code>git mv</code> 或在资源管理器里改名，改完回这里刷新）；如果想让它自成一类，
          则要同时改 <code>layouts/courses/chapter.html</code> 的分组表与 <code>i18n/zh.toml</code> 的组名。</div>`
      : '';

  const renderField = (f) => {
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
  };

  // 低频字段折进「更多选项」：改一次基本不再动的那些。它们仍然可改，只是不再占首屏。
  const editable = p.schema.fields.filter((f) => f.kind !== 'child');
  const fieldHtml = editable.filter((f) => !EDITOR_LOW_FREQ.has(f.key)).map(renderField).join('');
  const folded = editable.filter((f) => EDITOR_LOW_FREQ.has(f.key));
  const foldedHtml = folded.length
    ? `<details class="more-options"><summary>更多选项<span class="hint">${folded
        .map((f) => esc(f.label))
        .join(' / ')}</span></summary><div class="fields">${folded.map(renderField).join('')}</div></details>`
    : '';

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
      ${materialChip}
      <span class="chip ${isTrue('draft') ? 'warn' : 'ok'}">${isTrue('draft') ? '草稿' : '已发布'}</span>
      ${val('math') === '' || val('math') === undefined ? '<span class="chip">math 继承</span>' : ''}
      <span class="badge" id="dirty-badge" hidden>未保存</span>
      <div class="preview-actions" style="margin-left:auto">
        <button type="button" class="ghost" id="ed-preview">预览</button>
        <button type="button" class="ghost" id="ed-save-publish" title="保存并切到发布页（Ctrl+Shift+S）">保存并去发布</button>
        <button type="button" class="primary" id="ed-save">保存</button>
        <button type="button" class="danger" id="ed-delete">删除</button>
      </div>
    </div>
    <p class="hint">${esc(p.path)}${p.hasFrontMatter ? '' : '　（这个文件原本没有 front matter，保存带字段的改动会自动补一个区块）'}　<span class="hint">拖入 .md 可替换正文</span><span class="hint" id="ed-preview-note" hidden title="右侧 iframe 是 Hugo 渲染好的页面，也就是上一次保存的版本；保存后会自动刷新">　· 有未保存改动，右侧预览还是上次保存的版本</span></p>
    ${dirtyWarn}
    ${warn}
    ${groupNotice}
    ${futureNotice}
    <div id="ed-delete-notice"></div>
    <div id="ed-draft-notice"></div>
    <div class="fields">${fieldHtml}</div>
    ${foldedHtml}
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

  // 包一层箭头函数：saveEditor 现在收 { goPublish }，直接把事件对象传进去会多出一个无关参数
  $('ed-save').addEventListener('click', () => saveEditor());
  $('ed-save-publish').addEventListener('click', () => saveEditor({ goPublish: true }));
  $('ed-preview').addEventListener('click', () => setPreviewFor(p.path));
  $('ed-delete').addEventListener('click', onDeleteClick);
  $('md-toolbar').addEventListener('click', onToolbar);
  // 重新渲染（换文件、保存后刷新）必须解除已武装的删除 —— 否则「确认删除」会落到另一个文件上
  resetDeleteArm();
  renderDraftNotice();
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
  // 未保存状态同步到左栏条目：切走再切回来也能看见哪个文件还没存
  if (dirty) store.unsaved.add(pending.path);
  else store.unsaved.delete(pending.path);
  const item = $('tree-body')?.querySelector('button.tree-item.active');
  if (item) item.classList.toggle('unsaved', dirty);
  // 右侧 iframe 里是 Hugo 渲染好的**已保存**版本 —— 有未保存改动时明确说一句，
  // 否则「改了正文但预览没变」看起来像预览坏了。
  const note = $('ed-preview-note');
  if (note) note.hidden = !dirty;
  syncDraft(dirty);
}

// ---------------- 未保存草稿的本地暂存 ----------------
//
// 有未保存改动时关掉标签页（或浏览器崩了），正文就没了：beforeunload 只能拦一次确认。
// 这里把编辑器里的当前内容按文件路径存进 localStorage，下次打开这个文件时若发现暂存的正文
// 与磁盘上的不一样，就提示「上次还有没保存的改动」并给「恢复 / 丢弃」两个选择。
//
// 只写浏览器本地，**不碰磁盘** —— 所以不会出现「半成品被 push-blog.sh 的 git add -A 带上去」
// 这种事（那正是 AGENTS.md 反复提醒的风险）。单文件超过 400KB 就不暂存（localStorage 通常
// 只有 5MB），并给一条提示，而不是静默截断出一份半截正文。
const DRAFT_KEY = 'admin-drafts';
const DRAFT_MAX_CHARS = 400 * 1024;
let draftTimer = null;

function readDrafts() {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {}; // 隐私模式 / 存了坏数据
  }
}

function writeDrafts(drafts) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    /* 配额满或不可写：放弃暂存，不影响编辑 */
  }
}

function getDraft(path) {
  const entry = readDrafts()[path];
  return entry && typeof entry.body === 'string' ? entry : null;
}

function dropDraft(path) {
  const drafts = readDrafts();
  if (!(path in drafts)) return;
  delete drafts[path];
  writeDrafts(drafts);
}

function putDraft(path, body) {
  const drafts = readDrafts();
  if (body.length > DRAFT_MAX_CHARS) {
    if (path in drafts) {
      delete drafts[path];
      writeDrafts(drafts);
    }
    toast('正文超过 400KB，本次不做本地暂存（请及时保存）', 'error');
    return;
  }
  drafts[path] = { body, at: Date.now() };
  writeDrafts(drafts);
}

// 输入时防抖写暂存；不脏了（保存成功 / 手动还原）就立刻清掉对应条目。
function syncDraft(dirty) {
  if (!pending) return;
  const path = pending.path;
  const body = pending.body ?? '';
  clearTimeout(draftTimer);
  if (!dirty) {
    draftTimer = null;
    dropDraft(path);
    return;
  }
  draftTimer = setTimeout(() => {
    draftTimer = null;
    putDraft(path, body);
  }, 600);
}

// 切文件/关页面前把还没落盘的暂存补上，免得丢掉最后 0.6 秒里敲的字。
function flushDraftNow() {
  if (draftTimer === null || !pending) return;
  clearTimeout(draftTimer);
  draftTimer = null;
  putDraft(pending.path, pending.body ?? '');
}

// 「上次还有没保存的改动」提示：只在暂存正文与磁盘正文不同时出现。
function renderDraftNotice() {
  const el = $('ed-draft-notice');
  if (!el || !pending) return;
  const draft = getDraft(pending.path);
  if (!draft || draft.body === pending.bodyOriginal) {
    el.innerHTML = '';
    return;
  }
  const when = new Date(draft.at);
  const stamp = Number.isNaN(when.getTime()) ? '' : when.toLocaleString();
  el.innerHTML = `<div class="notice"><strong>这个文件有未保存的本地暂存：</strong>
      上次离开时正文与磁盘上的不一样（暂存于 ${esc(stamp)}）。
      暂存只在浏览器本地，没有写到磁盘上。
      <div class="inline" style="margin-top:6px">
        <button type="button" class="ghost" id="ed-draft-restore">恢复暂存的正文</button>
        <button type="button" class="ghost" id="ed-draft-drop">丢弃暂存</button>
      </div></div>`;
  $('ed-draft-restore').addEventListener('click', () => {
    const ta = $('ed-body');
    if (!ta) return;
    ta.value = draft.body;
    pending.body = draft.body;
    pending.bodyDirty = pending.body !== pending.bodyOriginal;
    $('ed-lint').innerHTML = lintHtml(pending.body);
    markDirty();
    // 恢复之后这块提示就该消失：内容已经在编辑器里了，再留着两个按钮毫无意义
    //（未保存的状态由头部的「未保存」徽章与左栏条目的标记继续表示）。
    // 暂存条目本身**不删** —— 现在编辑器里的内容与磁盘仍然不同，下次打开这个文件还要能恢复。
    el.innerHTML = '';
    toast('已恢复暂存的正文，别忘了点「保存」', 'ok');
  });
  $('ed-draft-drop').addEventListener('click', () => {
    dropDraft(pending.path);
    renderDraftNotice();
    toast('已丢弃暂存');
  });
}

// goPublish：保存成功后切到发布页 —— 「写完了」和「推上去」之间少一次找按钮。
// 保存失败时（catch 分支）不跳，免得把人送到一个还没有改动的发布页。
async function saveEditor({ goPublish = false } = {}) {
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
    // 服务端会把正文里 `\*`、`§`、圈号这类会让构建失败的写法顺手修掉（同一份实现：
    // scripts/fix-math-escapes.mjs）。同步回编辑器，否则下次保存又把坏文本写回去。
    // 注意：双重转义（`\\theta`）要跑 Hugo 验证，不在保存路径里修，发布时由真检 --fix 处理。
    const fixedCount = Number(res.mathFix?.count) || 0;
    if (fixedCount > 0 && typeof res.body === 'string') {
      p.body = res.body;
      const ta = $('ed-body');
      if (ta) ta.value = res.body;
    }
    p.bodyOriginal = p.body;
    p.bodyDirty = false;
    markDirty(); // 不脏了 → 顺便把本地暂存条目清掉
    if (fixedCount > 0) toast(`已保存，并自动修正 ${fixedCount} 处公式写法（\\* / § / 圈号）`, 'ok');
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
    if (goPublish) {
      activateTab('publish');
      toast('已保存，接着写提交说明就能发布', 'ok');
    }
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
    if (!pending) return;
    const dt = ev.dataTransfer;
    const img = [...(dt?.items ?? [])].some((i) => i.kind === 'file' && /^image\//.test(i.type));
    const strong = $('editor-drop').querySelector('strong');
    if (strong) strong.textContent = img ? '松开即把图片存进本页目录并插入 markdown' : '松开即用拖入的 .md 替换正文';
    $('editor-drop').hidden = false;
  });
  panel.addEventListener('dragleave', (ev) => {
    if (!panel.contains(ev.relatedTarget)) $('editor-drop').hidden = true;
  });
  panel.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    $('editor-drop').hidden = true;
    const file = fileFromDrop(ev);
    if (!file) return;
    // 图片与 .md 走两条路：图片存进本页目录并插 markdown，.md 是替换正文
    if (/^image\//.test(file.type)) await insertImageFile(file);
    else await onEditorDrop(file);
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
  initCreateOpenPref();
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
  initExtras();
})();

// ---------------- URL 深链 ----------------
//
// #edit/content/courses/…/index.md 这样的地址可以刷新、可以收藏。只做单向同步：
// 状态变化时写 hash，hash 变化时恢复状态——恢复时不回写，否则两边互相触发。
function setHash(tab, relPath = null) {
  const next = relPath ? `#${tab}/${relPath}` : `#${tab}`;
  if (location.hash !== next) history.replaceState(null, '', next);
}

async function restoreFromHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!raw) return false;
  const slash = raw.indexOf('/');
  const tab = (slash === -1 ? raw : raw.slice(0, slash)).trim();
  const rel = slash === -1 ? null : raw.slice(slash + 1);
  if (!TABS.includes(tab)) return false;
  activateTab(tab, { silent: true });
  if (tab === 'edit' && rel) {
    await loadTree();
    await selectFile(rel);
  }
  return true;
}

window.addEventListener('hashchange', () => {
  restoreFromHash().catch(() => {});
});

// 打开文件后把 hash 换成它，刷新回来还是同一篇
function syncEditHash() {
  if (store.tab === 'edit' && pending?.path) setHash('edit', pending.path);
}

// ---------------- 正文定位 ----------------

// 搜索与体检给的是**文件**行号，编辑器里只有正文，所以先减掉 front matter 的高度。
function revealBodyLine(fileLine) {
  const ta = $('ed-body');
  if (!ta || !pending) return;
  const bodyLine = Math.max(1, fileLine - (pending.bodyStartLine ?? 1) + 1);
  const lines = ta.value.split('\n');
  const before = lines.slice(0, bodyLine - 1).reduce((n, l) => n + l.length + 1, 0);
  ta.focus();
  ta.setSelectionRange(before, before + (lines[bodyLine - 1]?.length ?? 0));
  const lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
  ta.scrollTop = Math.max(0, (bodyLine - 6) * lh);
  toast(`已定位到正文第 ${bodyLine} 行`, 'ok');
}

// ---------------- 预览：拖宽 + 设备宽度 ----------------
const PREVIEW_W_KEY = 'admin-preview-w';
const PREVIEW_DEVICE_KEY = 'admin-preview-device';

function applyPreviewWidth(px) {
  const root = document.documentElement;
  if (px > 0) root.style.setProperty('--preview-w', String(Math.round(px)) + 'px');
  else root.style.removeProperty('--preview-w');
}

function initPreviewPane() {
  const saved = Number(localStorage.getItem(PREVIEW_W_KEY) || 0);
  if (saved > 0) applyPreviewWidth(saved);

  const gutter = $('preview-gutter');
  let dragging = false;
  gutter.addEventListener('mousedown', (ev) => {
    dragging = true;
    gutter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    ev.preventDefault();
  });
  // 双击复位：拖窄了以后不用把宽度一格一格拖回来
  gutter.addEventListener('dblclick', () => {
    localStorage.removeItem(PREVIEW_W_KEY);
    applyPreviewWidth(0);
  });
  window.addEventListener('mousemove', (ev) => {
    if (!dragging) return;
    const rect = $('main').getBoundingClientRect();
    const w = rect.right - 14 - ev.clientX; // 14 = #main 的右内边距
    applyPreviewWidth(Math.min(Math.max(w, 260), Math.max(320, window.innerWidth * 0.75)));
    ev.preventDefault();
  });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    gutter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--preview-w'), 10);
    if (v > 0) localStorage.setItem(PREVIEW_W_KEY, String(v));
  });

  const stage = $('preview-stage');
  const device = localStorage.getItem(PREVIEW_DEVICE_KEY) || 'desktop';
  stage.dataset.device = device;
  const markDevice = (d) => {
    for (const b of $('preview-device').querySelectorAll('button')) b.classList.toggle('active', b.dataset.device === d);
  };
  markDevice(device);
  $('preview-device').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-device]');
    if (!btn) return;
    stage.dataset.device = btn.dataset.device;
    markDevice(btn.dataset.device);
    localStorage.setItem(PREVIEW_DEVICE_KEY, btn.dataset.device);
  });
}

// ---------------- 图片：粘贴 / 拖入即落盘并插图 ----------------
//
// 存到当前编辑文件所在目录（Hugo 的 leaf bundle 约定），插入的是相对引用 `./name.png`，
// 这样文章搬家时图片跟着走，也不需要在 static/ 里维护一套按文章分目录的图床。
async function insertImageFile(file) {
  if (!pending) {
    toast('先选中一个文件，图片才知道该存哪', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    toast('图片超过 8 MB，先压一下再放', 'error');
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('读不出这个文件'));
    fr.readAsDataURL(file);
  });
  try {
    const res = await api.send('POST', '/api/asset/upload', {
      path: pending.path,
      name: file.name || 'pasted.png',
      dataUrl,
    });
    insertAtCursor('\n' + res.markdown + '\n');
    toast(`已存 ${res.path}，记得保存`, 'ok');
  } catch (err) {
    toast(`图片没存下：${err.message}`, 'error');
  }
}

function insertAtCursor(text) {
  const ta = $('ed-body');
  if (!ta || !pending) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  const caret = start + text.length;
  ta.setSelectionRange(caret, caret);
  pending.body = ta.value;
  pending.bodyDirty = pending.body !== pending.bodyOriginal;
  ta.focus();
  markDirty();
}

// ---------------- 命令面板（Ctrl+K） ----------------
//
// 动作、文件、正文命中混在一处：动作与文件是本地数据（store.items 早就有），
// 正文命中走 /api/search（服务端按 mtime 缓存，敲字时每 130ms 问一次也不会重读磁盘）。
// 命令面板选的「新建」：切到表单并把光标放进第一个字段（标题），省掉一次点击
function focusCreateForm() {
  $('create-fields')?.querySelector('input, textarea, select')?.focus();
}

const PALETTE_ACTIONS = [
  { label: '去「新建」', run: () => activateTab('create') },
  { label: '新建：切到表单并聚焦第一个字段', run: () => { activateTab('create'); focusCreateForm(); } },
  { label: '去「编辑」', run: () => activateTab('edit') },
  { label: '去「发布」', run: () => activateTab('publish') },
  { label: '去「体检」', run: () => activateTab('check') },
  { label: '跑一次快检', run: () => { activateTab('check'); runChecks('fast'); } },
  { label: '刷新预览', run: () => $('preview-reload').click() },
  { label: '重启预览', run: () => $('preview-restart').click() },
  { label: '显示 / 隐藏预览', run: () => $('preview-toggle').click() },
  { label: '保存当前文件', run: () => saveEditor() },
  { label: '保存并去发布', run: () => saveEditor({ goPublish: true }) },
  { label: '切换夜间模式', run: () => $('theme-toggle').click() },
];

const palette = { open: false, results: [], sel: 0, seq: 0, timer: null };

function initPalette() {
  $('palette-btn').addEventListener('click', paletteOpen);
  $('palette').addEventListener('mousedown', (ev) => {
    if (ev.target === $('palette')) paletteClose();
  });
  $('palette-input').addEventListener('input', () => {
    clearTimeout(palette.timer);
    palette.timer = setTimeout(() => paletteSearch($('palette-input').value), 130);
  });
  $('palette-input').addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowDown') { ev.preventDefault(); paletteMove(1); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); paletteMove(-1); }
    else if (ev.key === 'Enter') { ev.preventDefault(); paletteRun(); }
    else if (ev.key === 'Escape') { ev.preventDefault(); paletteClose(); }
  });
  $('palette-results').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-idx]');
    if (!li) return;
    palette.sel = Number(li.dataset.idx);
    paletteRun();
  });
}

function paletteOpen() {
  if (palette.open) return;
  palette.open = true;
  $('palette').hidden = false;
  $('palette-input').value = '';
  paletteSearch('');
  $('palette-input').focus();
}

function paletteClose() {
  palette.open = false;
  $('palette').hidden = true;
  palette.results = [];
  $('palette-results').innerHTML = '';
}

function paletteMove(d) {
  if (!palette.results.length) return;
  palette.sel = (palette.sel + d + palette.results.length) % palette.results.length;
  paletteRender();
  $('palette-results').querySelector('li.sel')?.scrollIntoView({ block: 'nearest' });
}

function paletteRun() {
  const item = palette.results[palette.sel];
  if (!item) return;
  // 先关面板再执行：动作可能切 tab 或弹确认框，开着面板会挡住
  paletteClose();
  Promise.resolve().then(() => item.run());
}

function paletteRender() {
  const list = $('palette-results');
  if (!palette.results.length) {
    list.innerHTML = '<li class="hint">没有匹配。换个词试试。</li>';
    return;
  }
  list.innerHTML = palette.results
    .map(
      (r, i) =>
        `<li data-idx="${i}" class="${i === palette.sel ? 'sel' : ''}"><span class="kind">${esc(r.kind)}</span>` +
        `<span class="body">${esc(r.body)}</span>${r.path ? `<span class="path">${esc(r.path)}${r.line ? ':' + r.line : ''}</span>` : ''}</li>`
    )
    .join('');
}

async function paletteSearch(q) {
  const kw = q.trim();
  const seq = ++palette.seq;
  const out = [];
  if (kw === '') {
    for (const a of PALETTE_ACTIONS) out.push({ kind: '动作', body: a.label, run: a.run });
    for (const i of store.items.slice(0, 12)) out.push({ kind: '文件', body: i.title, path: i.path, run: () => openInEditor(i.path) });
    $('palette-hint').textContent = store.items.length ? `${store.items.length} 个文件，敲字可搜正文` : '';
  } else {
    const low = kw.toLowerCase();
    for (const a of PALETTE_ACTIONS) if (a.label.toLowerCase().includes(low)) out.push({ kind: '动作', body: a.label, run: a.run });
    for (const i of store.items) {
      if (!`${i.title} ${i.path}`.toLowerCase().includes(low)) continue;
      out.push({ kind: '文件', body: i.title, path: i.path, run: () => openInEditor(i.path) });
    }
    try {
      const res = await api.get(`/api/search?q=${encodeURIComponent(kw)}`);
      if (seq !== palette.seq) return; // 期间又敲了字，这次结果作废
      const hits = res.hits ?? [];
      for (const hit of hits) {
        out.push({
          kind: hit.kind === 'title' ? '标题' : '正文',
          body: hit.text,
          path: hit.path,
          line: hit.line,
          run: () => openInEditor(hit.path, hit.kind === 'body' ? hit.line : 0),
        });
      }
      $('palette-hint').textContent = hits.length ? `正文命中 ${hits.length} 处` : '正文里没有，只有上面这些';
    } catch (err) {
      $('palette-hint').textContent = `正文搜索失败：${err.message}`;
    }
  }
  if (seq !== palette.seq) return;
  palette.results = out.slice(0, 60);
  palette.sel = 0;
  paletteRender();
}

// ---------------- 体检 ----------------
//
// 一次一项、跑完推一条（SSE）：慢项动辄几十秒，攒到最后一起返回的话界面全程是空的。
// 检查项表与调用命令都在服务端 lib/checks.mjs（与 push-blog.sh 同源），前端不复制一份。
const CHECK_ICON = { idle: '·', running: '◐', ok: '✓', fail: '✗' };

async function loadCheckItems() {
  if (!store.checks.items.length) {
    try {
      const res = await api.get('/api/check/items');
      store.checks.items = res.items ?? [];
    } catch (err) {
      $('check-items').innerHTML = `<li class="pending">读不到检查项：${esc(err.message)}</li>`;
      return;
    }
  }
  renderCheckItems();
  renderCheckLegend();
}

function checkStatusOf(id) {
  const r = store.checks.results.get(id);
  if (!r) return 'idle';
  return r.status === 'running' ? 'running' : r.ok ? 'ok' : 'fail';
}

function renderCheckItems() {
  const list = $('check-items');
  if (!list) return;
  const items = store.checks.items;
  if (!items.length) {
    list.innerHTML = '<li class="pending">载入中…</li>';
    return;
  }
  list.innerHTML = items
    .map((it) => {
      const st = checkStatusOf(it.id);
      const r = store.checks.results.get(it.id);
      const warns = (r?.issues ?? []).filter((i) => i.level === 'warn').length;
      const ms = r?.ms ? `${(r.ms / 1000).toFixed(1)}s` : '';
      const skipped = store.checks.activeIds && !store.checks.activeIds.has(it.id);
      const cls = [st === 'idle' ? 'pending' : '', st === 'fail' ? 'fail' : '', store.checks.selected === it.id ? 'active' : '']
        .filter(Boolean)
        .join(' ');
      return (
        `<li class="${cls}" data-id="${it.id}" title="${esc(it.hint || '')}"><span class="state">${CHECK_ICON[st]}</span>` +
        `<span class="lbl">${esc(it.label)}${skipped ? ' <span class="ms">未跑</span>' : ''}${warns ? ` <span class="ms">${warns} 警告</span>` : ''}</span>` +
        `<span class="ms">${ms}</span></li>`
      );
    })
    .join('');
}

function renderCheckLegend() {
  const box = $('check-legend');
  if (!box) return;
  box.innerHTML = store.checks.items
    .map(
      (it) =>
        `<div class="list-row"><span class="dot ${it.blocking ? 'err' : 'warn'}"></span><span class="t">${esc(it.label)}</span>` +
        `<span class="when">${it.blocking ? '阻断发布' : '只提醒'}${it.needsBuild ? ' · 需先构建' : ''}${it.fast ? '' : ' · 慢'}</span></div>`
    )
    .join('');
}

async function runChecks(mode) {
  if (store.checks.running) return;
  const btnFast = $('check-fast');
  const btnFull = $('check-full');
  store.checks.running = true;
  store.checks.mode = mode;
  store.checks.results = new Map();
  store.checks.selected = null;
  btnFast.disabled = true;
  btnFull.disabled = true;
  $('check-status').textContent = mode === 'full' ? '全检进行中（要一两分钟）…' : '快检进行中…';
  $('check-detail').innerHTML = '<p class="muted">慢的是 front matter（十几秒）与真实构建，剩下的都是秒级。</p>';
  const t0 = performance.now();
  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1' },
      body: JSON.stringify({ mode }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          let payload;
          try {
            payload = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (payload.event === 'start') {
            store.checks.activeIds = new Set((payload.items ?? []).map((i) => i.id));
            renderCheckItems();
          } else if (payload.event === 'item-start') {
            store.checks.results.set(payload.id, { status: 'running' });
            // 第一项开始时就把明细切过去，不然右边一直空着
            if (!store.checks.selected) store.checks.selected = payload.id;
            renderCheckItems();
            renderCheckDetail(store.checks.selected);
          } else if (payload.event === 'item-done') {
            store.checks.results.set(payload.id, { ...payload, status: 'done' });
            renderCheckItems();
            renderCheckDetail(store.checks.selected);
          } else if (payload.event === 'done') {
            store.checks.summary = payload;
          }
        }
      }
    }
    const s = store.checks.summary ?? {};
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const failed = [...store.checks.results.values()].filter((r) => r.status === 'done' && !r.ok);
    if (!failed.length) {
      $('check-status').textContent = `全部通过 · ${store.checks.results.size} 项 · ${secs}s`;
      toast('体检全绿', 'ok');
    } else {
      $('check-status').textContent = s.blockingFailed
        ? `${failed.length} 项未通过（${s.blockingFailed} 项会阻断发布）· ${secs}s`
        : `${failed.length} 项有提醒（不阻断）· ${secs}s`;
      toast(`${failed.length} 项需要看一眼，右侧有明细`, 'error');
    }
  } catch (err) {
    $('check-status').textContent = `体检中断：${err.message}`;
    toast(`体检失败：${err.message}`, 'error');
  } finally {
    store.checks.running = false;
    btnFast.disabled = false;
    btnFull.disabled = false;
  }
}

function checkIssueRow(i) {
  const cls = i.level === 'error' ? 'err' : i.level === 'warn' ? 'warn' : '';
  const icon = i.level === 'error' ? '✗' : i.level === 'warn' ? '⚠' : '·';
  const jump = i.path
    ? `<button type="button" class="ghost jump" data-open="${esc(i.path)}" data-line="${i.line ?? ''}">定位</button>`
    : '';
  return `<div class="check-issue ${cls}"><span class="lvl">${icon}</span><span class="txt">${esc(i.text)}</span>${jump}</div>`;
}

function renderCheckDetail(id) {
  const box = $('check-detail');
  if (!box) return;
  const item = store.checks.items.find((i) => i.id === id);
  if (!item) {
    box.innerHTML = '<p class="muted">左栏点一项看它的明细。</p>';
    return;
  }
  const r = store.checks.results.get(id);
  const state = !r ? '还没跑' : r.status === 'running' ? '跑着呢…' : (r.ok ? '通过' : '未通过') + ' · ' + (r.ms / 1000).toFixed(1) + 's';
  const head = `<h3>${esc(item.label)} <span class="hint">${state} · ${item.blocking ? '会阻断发布' : '只提醒'}</span></h3>`;
  if (!r || r.status === 'running') {
    box.innerHTML = head + `<p class="muted">${r ? '等它跑完。' : '这一项这次没跑（快检不含它）。'}</p>`;
    return;
  }
  const all = r.issues ?? [];
  // 没硬问题时不把脚本的整段日志倒出来（构建日志十几行、体积报表二十几行），只留最后三行
  // —— 那通常是「✓ 通过」之类的结论行。有 error/warn 时全留，给上下文。
  const bad = all.filter((i) => i.level !== 'info');
  const infos = all.filter((i) => i.level === 'info');
  const issues = bad.length ? all : infos.slice(-3);
  const byFile = new Map();
  const global = [];
  for (const i of issues) {
    if (!i.path) {
      global.push(i);
      continue;
    }
    if (!byFile.has(i.path)) byFile.set(i.path, []);
    byFile.get(i.path).push(i);
  }
  const fileBlocks = [...byFile.entries()]
    .map(([path, list]) => {
      const jump = `<button type="button" class="ghost jump" data-open="${esc(path)}">打开</button>`;
      return `<div class="check-file"><div class="file-head"><code>${esc(path)}</code>${jump}</div><div class="file-issues">${list
        .map(checkIssueRow)
        .join('')}</div></div>`;
    })
    .join('');
  const globalBlock = global.length
    ? `<div class="check-file"><div class="file-head"><strong>整体</strong></div><div class="file-issues">${global
        .map(checkIssueRow)
        .join('')}</div></div>`
    : '';
  const raw = ((r.stdout || '') + (r.stderr || '')).trim();
  box.innerHTML =
    head +
    (fileBlocks || globalBlock ? fileBlocks + globalBlock : '<p class="muted">没有输出。</p>') +
    (raw ? `<details class="about"><summary>原始输出</summary><pre class="diff">${esc(raw)}</pre></details>` : '');
}

function initCheckPanel() {
  $('check-fast').addEventListener('click', () => runChecks('fast'));
  $('check-full').addEventListener('click', () => runChecks('full'));
  $('check-items').addEventListener('click', (ev) => {
    const li = ev.target.closest('li[data-id]');
    if (!li) return;
    store.checks.selected = li.dataset.id;
    renderCheckItems();
    renderCheckDetail(li.dataset.id);
  });
  $('check-detail').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-open]');
    if (!btn) return;
    openInEditor(btn.dataset.open, Number(btn.dataset.line || 0));
  });
}

// ---------------- 发布页：草稿 / 提交历史 / CI ----------------

function renderDrafts() {
  const box = $('draft-box');
  if (!box) return;
  const s = store.state;
  const rows = [];
  for (const d of s?.drafts ?? []) rows.push(draftRow(d, 'draft'));
  for (const f of s?.futureDated ?? []) rows.push(draftRow(f, 'date'));
  box.innerHTML = rows.join('');
}

function draftRow(item, kind) {
  const path = typeof item === 'string' ? item : item.path;
  const title = typeof item === 'string' ? item : item.title || item.path;
  const when = kind === 'date' && item?.date ? `<span class="when">${esc(item.date)}</span>` : '';
  const act = kind === 'draft' ? `<button type="button" class="ghost" data-unmark="${esc(path)}">转正式</button>` : '';
  return `<div class="draft-row"><span class="dot warn"></span><span class="t">${esc(title)}${when}</span>${act}<button type="button" class="ghost" data-open-file="${esc(path)}">打开</button></div>`;
}

// 一键转正式：只改 draft 一个字段（值必须是布尔 false —— 服务端按真值判断写 true/false），
// 正文原样不动。
async function publishDraft(path) {
  try {
    await api.send('PUT', '/api/content/file', { path, changed: [{ key: 'draft', kind: 'bool', value: false }] });
    toast(`已取消草稿：${path}（提交仍在发布页）`, 'ok');
    await refreshState();
    await loadItems(true);
    renderTree();
  } catch (err) {
    toast(`改成正式失败：${err.message}`, 'error');
  }
}

function renderCommits() {
  const box = $('commit-list');
  if (!box) return;
  const commits = store.state?.recentCommits ?? [];
  if (!commits.length) {
    box.innerHTML = '<div class="list-empty">没有提交记录。</div>';
    return;
  }
  box.innerHTML = commits
    .map((line) => {
      const m = /^([0-9a-f]{7,40})\s+(.*)$/.exec(String(line).trim());
      return `<div class="list-row"><span class="sha">${esc(m ? m[1] : '')}</span><span class="t">${esc(m ? m[2] : String(line))}</span></div>`;
    })
    .join('');
}

function relTime(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.round(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.round(diff / 3600)} 小时前`;
  return `${Math.round(diff / 86400)} 天前`;
}

async function loadCi(force = false) {
  const box = $('ci-list');
  if (!box) return;
  if (store.ci && !force) {
    renderCi();
    return;
  }
  box.innerHTML = '<div class="list-empty">读取中…</div>';
  try {
    store.ci = await api.get('/api/ci');
  } catch (err) {
    store.ci = { ok: false, error: err.message };
  }
  renderCi();
}

function renderCi() {
  const box = $('ci-list');
  const ci = store.ci;
  if (!ci) {
    box.innerHTML = '<div class="list-empty">还没读取。</div>';
    return;
  }
  if (!ci.ok) {
    box.innerHTML = `<div class="list-empty">读不到 CI 状态：${esc(ci.error || '未知原因')}${
      ci.note ? `<br><span class="hint">${esc(ci.note)}</span>` : ''
    }</div>`;
    return;
  }
  if (!(ci.runs ?? []).length) {
    box.innerHTML = '<div class="list-empty">还没有 Actions 运行记录。</div>';
    return;
  }
  box.innerHTML = ci.runs
    .map((r) => {
      const done = r.status === 'completed';
      const dot = !done ? 'run' : r.conclusion === 'success' ? 'ok' : r.conclusion === 'cancelled' ? 'idle' : 'err';
      return (
        `<div class="list-row"><span class="dot ${dot}" title="${esc(done ? r.conclusion : r.status)}"></span>` +
        `<span class="t">${esc(r.title || r.name)}</span><span class="when">${esc(relTime(r.createdAt))}</span>` +
        `<a href="${esc(r.url)}" target="_blank" rel="noopener">打开</a></div>`
      );
    })
    .join('');
}

function initPublishExtras() {
  $('ci-refresh').addEventListener('click', () => loadCi(true));
  $('draft-box').addEventListener('click', (ev) => {
    const btn = ev.target.closest('button[data-unmark]');
    if (btn) {
      publishDraft(btn.dataset.unmark);
      return;
    }
    const open = ev.target.closest('button[data-open-file]');
    if (open) openInEditor(open.dataset.openFile);
  });
}

// ---------------- 快捷键与离开保护 ----------------

function initShortcuts() {
  window.addEventListener('keydown', (ev) => {
    const mod = ev.ctrlKey || ev.metaKey;
    if (mod && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      if (palette.open) paletteClose();
      else paletteOpen();
      return;
    }
    if (mod && ev.key.toLowerCase() === 's') {
      // 只在有打开的文件时接管：否则浏览器自己的「保存页面」不该被抢。
      // Shift 变体 = 保存并去发布，与编辑器头部那个按钮同一个动作。
      if (store.tab === 'edit' && pending) {
        ev.preventDefault();
        saveEditor({ goPublish: ev.shiftKey });
      }
      return;
    }
    if (ev.key === 'Escape' && palette.open) paletteClose();
  });
  // 有未保存改动时拦一下：这个界面的保存按钮不显眼，误关一次就等于白写
  window.addEventListener('beforeunload', (ev) => {
    // 关页面前把还在防抖里的本地暂存补上 —— 用户点「离开」时，最后几笔编辑也要留下来
    flushDraftNow();
    if (store.unsaved.size === 0 && !store.publishing) return;
    ev.preventDefault();
    ev.returnValue = '';
  });
}

// ---------------- 知识库（wiki）发布 ----------------

// 发布器是 tools/wiki-publish/publish.py：把知识库里「状态: 已验证」的卡片写进数学库 / CS 库。
// 界面只负责按钮与输出显示 —— 「发什么、发给谁、能不能发」的判据全在脚本里（一份实现，
// 与 CLI、CI 共用），界面复刻规则就必然漂移。
function initWikiPublish() {
  const status = $('wiki-status');
  if (!status) return;
  const log = $('wiki-log');
  const hint = $('wiki-hint');

  const show = (text) => {
    log.hidden = false;
    log.textContent = text;
  };

  const render = (data) => {
    if (data.unavailable) {
      status.textContent = `✗ 发布器不可用：${data.error}`;
      return;
    }
    const out = `${data.stdout ?? ''}${data.stderr ?? ''}`.trim();
    const tail = out.split('\n').filter(Boolean).slice(-1)[0] ?? '';
    status.textContent = data.ok ? `✓ 已同步。${tail}` : `⚠ 有差异或有问题。${tail}`;
    show(out || '（脚本没有输出）');
  };

  const refresh = async () => {
    status.textContent = '正在检查…';
    try {
      render(await api.get('/api/wiki/status'));
    } catch (err) {
      status.textContent = `✗ 检查失败：${err.message}`;
    }
  };

  $('wiki-check')?.addEventListener('click', refresh);
  $('wiki-publish')?.addEventListener('click', async () => {
    const btn = $('wiki-publish');
    btn.disabled = true;
    hint.textContent = '正在发布…';
    try {
      const data = await api.send('POST', '/api/wiki/publish');
      render(data);
      toast(data.ok ? '知识库发布完成，改动已进上面的清单' : '发布器报错，见下方输出', data.ok ? 'ok' : 'error');
    } catch (err) {
      status.textContent = `✗ 发布失败：${err.message}`;
      toast(`发布失败：${err.message}`, 'error');
    } finally {
      btn.disabled = false;
      hint.textContent = '';
    }
  });

  refresh();
}

// ---------------- 启动：新增部分 ----------------

function initExtras() {
  initPreviewPane();
  initPalette();
  initCheckPanel();
  initPublishExtras();
  initWikiPublish();
  initShortcuts();
  // 正文里直接粘贴截图：插图最顺手的路径，不必先存成文件再拖进来
  $('editor').addEventListener('paste', (ev) => {
    const items = [...(ev.clipboardData?.items ?? [])];
    const img = items.find((i) => i.kind === 'file' && /^image\//.test(i.type));
    if (!img) return;
    ev.preventDefault();
    insertImageFile(img.getAsFile());
  });
  restoreFromHash().catch(() => {});
  loadCheckItems().catch(() => {});
}


