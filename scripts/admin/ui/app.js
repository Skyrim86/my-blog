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
  options: { courses: [], projectHomes: [], projectDirs: [] },
  kind: 'post',
  createTags: new Set(),
  createCats: new Set(),
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

const KINDS = {
  post: {
    label: '文章',
    tags: true,
    cats: true,
    series: true,
    fields: [
      { k: 'slug', label: '目录名（slug）', required: true, hint: '英文短横线；决定 URL /:year/:month/:slug/' },
      { k: 'title', label: '标题' },
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
    ],
  },
  chapter: {
    label: '章节（笔记+作业）',
    tags: false,
    cats: false,
    fields: [
      { k: 'course', label: '所属课程', type: 'select', source: 'courses', required: true },
      { k: 'title', label: '章节标题', required: true },
    ],
  },
  project: {
    label: '项目',
    tags: true,
    cats: true,
    fields: [
      { k: 'name', label: '项目目录名', required: true },
      { k: 'title', label: '项目名' },
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
      { k: 'noMath', label: '纯文字（不加载 KaTeX 样式）', type: 'bool' },
    ],
  },
};

// 下拉选项由服务端下发（见 GET /api/content/list 的 options），前端不重复实现路径推导。
function sourceOptions(source) {
  return store.options[source] ?? [];
}

function renderKindPicker() {
  $('kind-picker').innerHTML = Object.entries(KINDS)
    .map(([k, spec]) => `<button type="button" data-kind="${k}" class="${k === store.kind ? 'active' : ''}">${esc(spec.label)}</button>`)
    .join('');
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
      if (f.type === 'select') {
        const opts = f.source
          ? sourceOptions(f.source)
          : f.options ?? [];
        const body = opts.length
          ? opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('')
          : '<option value="">（没有可选项，请先创建上层内容）</option>';
        return `<div class="field"><label for="${id}">${esc(f.label)} ${req} ${hint}</label><select id="${id}" data-field="${f.k}">${body}</select></div>`;
      }
      return `<div class="field"><label for="${id}">${esc(f.label)} ${req} ${hint}</label><input type="text" id="${id}" data-field="${f.k}"></div>`;
    })
    .join('');
  $('create-fields').innerHTML = html;
  restoreCreateFields(snapshot);
  $('create-tags-wrap').hidden = !spec.tags;
  $('create-cats-wrap').hidden = !spec.cats;
  $('create-series-wrap').hidden = !spec.series;
  if (spec.cats && store.createCats.size === 0) {
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
    snap[el.dataset.field] = el.type === 'checkbox' ? el.checked : el.value;
  }
  return snap;
}

function restoreCreateFields(snap) {
  for (const el of document.querySelectorAll('#create-fields [data-field]')) {
    const v = snap[el.dataset.field];
    if (v === undefined) continue;
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

$('kind-picker').addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-kind]');
  if (!btn) return;
  store.kind = btn.dataset.kind;
  store.createTags.clear();
  store.createCats.clear();
  renderKindPicker();
  renderCreateFields();
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

  $('create-pending').textContent = '正在创建…';
  $('create-log').hidden = false;
  $('create-log').textContent = `▸ bash scripts/new-content.sh ${store.kind} …\n`;
  try {
    const res = await api.send('POST', '/api/content', form);
    printScriptResult(res);
    if (res.ok) {
      toast('创建成功' + (form.publish ? '（已标记为发布）' : '（草稿）'), 'ok');
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
        control = `<label class="check"><input type="checkbox" id="${id}" data-ekey="${f.key}" data-kind="bool" ${p.values[f.key] === 'true' ? 'checked' : ''}> ${esc(f.label)}</label>`;
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
        control = `<input type="text" id="${id}" data-ekey="${f.key}" data-kind="list" value="${esc((p.values[f.key] ?? []).join(', '))}">`;
        return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label>${control}</div>`;
      }
      if (f.kind === 'select') {
        control = `<select id="${id}" data-ekey="${f.key}" data-kind="text">${(f.options ?? []).map((o) => `<option ${p.values[f.key] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
        return `<div class="field"><label for="${id}">${esc(f.label)} ${hint}</label>${control}</div>`;
      }
      const type = f.kind === 'number' ? 'number' : 'text';
      control = `<input type="${type}" id="${id}" data-ekey="${f.key}" data-kind="${f.kind}" value="${esc(p.values[f.key] ?? '')}">`;
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
      <h3>${esc(p.values.title || p.path)}</h3>
      <span class="chip">${esc(p.typeLabel)}</span>
      <span class="chip ${p.values.draft === 'true' ? 'warn' : 'ok'}">${p.values.draft === 'true' ? '草稿' : '已发布'}</span>
      ${p.values.math === '' ? '<span class="chip">math 继承</span>' : ''}
      <span class="badge" id="dirty-badge" hidden>未保存</span>
      <div class="preview-actions" style="margin-left:auto">
        <button type="button" class="ghost" id="ed-preview">预览</button>
        <button type="button" class="primary" id="ed-save">保存</button>
      </div>
    </div>
    <p class="hint">${esc(p.path)}${p.hasFrontMatter ? '' : '　（这个文件原本没有 front matter，保存带字段的改动会自动补一个区块）'}</p>
    ${warn}
    ${futureNotice}
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
      <textarea id="ed-body" spellcheck="false"></textarea>
      <div id="ed-lint"></div>
    </div>`;

  $('ed-body').value = p.body;
  $('ed-lint').innerHTML = lintHtml(p.body);

  // 标签 chips（可编辑策略）
  if (p.schema.tagsPolicy !== 'forbidden') {
    const tagsEl = $('ef-tags');
    if (tagsEl) {
      const selected = new Set(p.values.tags);
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
      const selected = new Set(p.values.categories);
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
  $('md-toolbar').addEventListener('click', onToolbar);
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
    const indent = key === 'tags' ? p.indents.tags : key === 'categories' ? p.indents.categories : field.indent ?? '';
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
    p.bodyOriginal = p.body;
    p.bodyDirty = false;
    markDirty();
    toast(res.changed ? '已保存' : '没有变化，未写盘', 'ok');
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
