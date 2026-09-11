// 内容模型：类型判定、编辑器字段表、脚本参数拼装、预览 URL 推导。
//
// 这里集中了「哪些字段能改、tags 能不能写」的知识，它对应 AGENTS.md 第 5 节的三条硬红线：
//   - section 页（课程主页 / 章节入口页 / 分层项目主页 / 子项目页 / 列表页）不写 tags
//   - 被 cascade 覆盖的子孙页（课程笔记、作业）不写 tags
//   - cascade 只填空不合并，所以分层项目的文档页写 tags 会整体丢掉项目级标签

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  splitFrontMatter,
  getField,
  getChildField,
  getList,
  parseBool,
  parseNumber,
  resolveIndent,
} from './frontmatter.mjs';

export const CONTENT_DIR = 'content';

// ---------- 路径 ----------

export function contentRoot(repoRoot) {
  return path.join(repoRoot, CONTENT_DIR);
}

// 只允许操作 content/ 内的文件：拒绝 .. 与绝对路径逃逸。
export function resolveContentPath(repoRoot, relPath) {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw Object.assign(new Error('缺少 path 参数'), { status: 400 });
  }
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const root = contentRoot(repoRoot);
  const abs = path.resolve(root, normalized.startsWith('content/') ? normalized.slice('content/'.length) : normalized);
  const rel = path.relative(root, abs);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw Object.assign(new Error(`path 必须位于 ${CONTENT_DIR}/ 内：${relPath}`), { status: 400 });
  }
  if (!/\.md$/i.test(abs)) {
    throw Object.assign(new Error('只支持编辑 .md 文件'), { status: 400 });
  }
  return abs;
}

// 仓库根下的相对路径，统一用 / 分隔，供脚本与 git 使用。
export function relFromRoot(repoRoot, abs) {
  return path.relative(repoRoot, abs).replace(/\\/g, '/');
}

// ---------- 类型判定 ----------

export function classify(relPath) {
  const p = relPath.replace(/\\/g, '/').replace(/^content\//, '');
  const seg = p.split('/');
  if (seg.length === 3 && seg[0] === 'posts' && seg[2] === 'index.md') return 'post';
  if (seg[0] === 'courses') {
    if (seg.length === 2 && seg[1] === '_index.md') return 'courses-list';
    if (seg.length === 3 && seg[2] === '_index.md') return 'course-home';
    if (seg.length === 4 && seg[3] === '_index.md') return 'chapter';
    if (seg.length === 5 && seg[4] === 'index.md' && (seg[3] === 'notes' || seg[3] === 'homework')) {
      return 'material';
    }
  }
  if (seg[0] === 'projects') {
    if (seg.length === 2 && seg[1] === '_index.md') return 'projects-list';
    if (seg.length === 3 && seg[2] === 'index.md') return 'project';
    if (seg.length === 3 && seg[2] === '_index.md') return 'project-home';
    if (seg.length >= 4 && seg[seg.length - 1] === '_index.md') return 'project-section';
    if (seg.length >= 4) return 'project-doc';
  }
  if (['tags', 'categories', 'series'].includes(seg[0]) && seg.length === 2 && seg[1] === '_index.md') {
    return 'taxonomy-page';
  }
  if (seg.length === 1) return 'page';
  return 'other';
}

const TYPE_LABEL = {
  post: '文章',
  'courses-list': '课程列表页',
  'course-home': '课程主页',
  chapter: '章节入口页',
  material: '课程材料页',
  'projects-list': '项目列表页',
  project: '项目（平铺单页）',
  'project-home': '分层项目主页',
  'project-section': '子项目页',
  'project-doc': '项目文档页',
  'taxonomy-page': '词条总览页',
  page: '单页',
  other: '其他',
};

export function typeLabel(type) {
  return TYPE_LABEL[type] ?? type;
}

// ---------- 编辑器字段表 ----------
//
// kind: text | textarea | bool | list | number | select
// indent: 该键在 front matter 里的缩进（课程主页 / 分层项目主页的 tags 在 cascade 里）
// tagsPolicy: editable | caution | forbidden

function listField(key, label, indent, extra = {}) {
  return { key, label, kind: 'list', indent, ...extra };
}

export function editorSchema(type) {
  const base = {
    title: { key: 'title', label: '标题', kind: 'text' },
    description: { key: 'description', label: '描述', kind: 'textarea', hint: '列表页与摘要使用' },
    summary: { key: 'summary', label: '摘要', kind: 'textarea', hint: '留空则由正文自动截取（公式多的页面建议手写）' },
    draft: { key: 'draft', label: '仍是草稿', kind: 'bool', hint: '草稿不会被 CI 发布' },
    weight: { key: 'weight', label: '排序 weight', kind: 'number' },
    math: { key: 'math', label: '加载 KaTeX 样式', kind: 'bool', hint: '公式本身在构建期渲染；这里只决定本页要不要加载 CSS' },
  };

  switch (type) {
    case 'post':
      return {
        fields: [
          base.title,
          {
            key: 'slug',
            label: '固定链接（slug）',
            kind: 'text',
            hint: '留空则 URL 由标题生成（中文标题会直接出现在 URL 里，如 /2026/09/我的第一篇文章/）；改标题会改 URL，要固定就填英文短横线',
          },
          base.description,
          base.draft,
          { key: 'date', label: '日期', kind: 'date', hint: '格式 2026-09-11' },
          listField('tags', '标签（来自词表）', ''),
          listField('categories', '分类', ''),
          listField('series', '系列', '', { hint: '填了会自动生成同系列导航' }),
          { key: 'cover.image', label: '封面图', kind: 'child', parent: 'cover', child: 'image', hint: '放在 index.md 同目录，如 cover.png' },
          { key: 'cover.alt', label: '封面 alt', kind: 'child', parent: 'cover', child: 'alt' },
          { key: 'cover.caption', label: '封面说明', kind: 'child', parent: 'cover', child: 'caption' },
        ],
        tagsPolicy: 'editable',
      };
    case 'course-home':
      return {
        fields: [
          base.title,
          base.description,
          base.summary,
          { key: 'unit', label: '分区单位', kind: 'select', options: ['章', '周'] },
          base.draft,
          base.math,
          listField('tags', '课程标签（写在 cascade 里）', '    ', { hint: '只下发给笔记/作业这些 regular page' }),
          listField('categories', '分类（写在 cascade 里）', '    '),
        ],
        tagsPolicy: 'editable',
      };
    case 'chapter':
      return {
        fields: [base.title, base.description, base.weight, base.draft, base.math],
        tagsPolicy: 'forbidden',
        tagsReason: '章节入口页是 section，写 tags 只会让 /tags/ 计数虚高、词条页里并不出现（AGENTS.md 4.2⑨）。',
      };
    case 'material':
      return {
        fields: [
          base.title,
          base.description,
          base.weight,
          { key: 'icon', label: '图标', kind: 'text', hint: '📖 学习笔记 / 📝 作业' },
          base.draft,
          base.math,
        ],
        tagsPolicy: 'forbidden',
        tagsReason: '课程材料页的标签由课程主页的 cascade 下发，而 cascade 只填空不合并：这里写了 tags 就会整体丢掉继承来的课程标签。',
      };
    case 'project':
      return {
        fields: [
          base.title,
          base.description,
          base.draft,
          listField('tags', '技术栈标签', ''),
          listField('categories', '分类', ''),
          { key: 'repo', label: '仓库地址', kind: 'text', hint: '填了才显示「查看源码」按钮' },
        ],
        tagsPolicy: 'editable',
      };
    case 'project-home':
      return {
        fields: [
          base.title,
          base.description,
          base.draft,
          listField('tags', '项目标签（写在 cascade 里）', '    '),
          listField('categories', '分类（写在 cascade 里）', '    '),
        ],
        tagsPolicy: 'editable',
      };
    case 'project-section':
      return {
        fields: [base.title, base.description, base.weight, base.draft],
        tagsPolicy: 'forbidden',
        tagsReason: '子项目页是 section，且标签由上层项目主页的 cascade 下发：这里写 tags 只会让计数虚高并让下级文档页丢掉继承。',
      };
    case 'project-doc':
      return {
        fields: [base.title, base.description, base.summary, base.weight, base.draft, base.math, listField('tags', '标签', '')],
        tagsPolicy: 'caution',
        tagsReason: '这是分层项目下的文档页：本页自己写了 tags，就会整体丢掉项目主页 cascade 下发的项目级标签。要保留就请把项目级标签一并写全。',
      };
    case 'courses-list':
    case 'projects-list':
    case 'taxonomy-page':
      return {
        fields: [base.title, base.description, base.summary, base.draft],
        tagsPolicy: 'forbidden',
        tagsReason: '这是 section / 列表页，写 tags 只会让 /tags/ 的计数虚高、词条页里并不出现。',
      };
    default:
      return {
        fields: [base.title, base.description, base.summary, base.draft, base.math],
        tagsPolicy: 'forbidden',
        tagsReason: '这个页面没有参与分类法继承，写 tags 只会让 /tags/ 计数虚高。',
      };
  }
}

// 「项目 → 子项目 → 文档」里可以作为 doc 目标的项目目录（cmd_doc 要求 content/projects/<这个> 是个目录）。
// 必须先确认路径确实在 content/projects/ 下：否则前缀替换会静默不生效，
// 别的 section（如 content/courses/...）会被当成项目目录混进来。
export function projectDirs(items) {
  const prefix = `${CONTENT_DIR}/projects/`;
  const set = new Set();
  for (const item of items) {
    if (!item.path.startsWith(prefix)) continue;
    const rel = item.path.slice(prefix.length);
    const slash = rel.lastIndexOf('/');
    // 不带 / 的（projects/_index.md 这个列表页）自然被排除
    if (slash > 0) set.add(rel.slice(0, slash));
  }
  return [...set].sort((a, b) => a.localeCompare(b, 'zh'));
}

export function courseDirs(items) {
  const prefix = `${CONTENT_DIR}/courses/`;
  return [
    ...new Set(
      items
        .filter((i) => i.type === 'course-home' && i.path.startsWith(prefix))
        .map((i) => i.path.slice(prefix.length).replace(/\/_index\.md$/, ''))
    ),
  ].sort((a, b) => a.localeCompare(b, 'zh'));
}

export function layeredProjectDirs(items) {
  const prefix = `${CONTENT_DIR}/projects/`;
  return [
    ...new Set(
      items
        .filter((i) => i.type === 'project-home' && i.path.startsWith(prefix))
        .map((i) => i.path.slice(prefix.length).replace(/\/_index\.md$/, ''))
    ),
  ].sort((a, b) => a.localeCompare(b, 'zh'));
}

// ---------- 读取 ----------

export function parseFrontMatter(text) {
  const doc = splitFrontMatter(text);
  const read = (key, indent = '') => getField(doc, key, indent).value;
  const tagsIndent = resolveIndent(doc, 'tags', '');
  const catsIndent = resolveIndent(doc, 'categories', '');
  return {
    doc,
    hasFm: doc.hasFm,
    body: doc.body.join(doc.eol),
    eol: doc.eol,
    values: {
      title: read('title'),
      description: read('description'),
      summary: read('summary'),
      date: read('date'),
      draft: read('draft'),
      math: read('math'),
      weight: read('weight'),
      icon: read('icon'),
      unit: read('unit'),
      layout: read('layout'),
      repo: read('repo'),
      url: read('url'),
      tags: getList(doc, 'tags', tagsIndent),
      categories: getList(doc, 'categories', catsIndent),
      series: getList(doc, 'series'),
      slug: read('slug'),
    },
    indents: { tags: tagsIndent, categories: catsIndent },
  };
}

export async function readContentFile(repoRoot, relPath) {
  const abs = resolveContentPath(repoRoot, relPath);
  const text = await fs.readFile(abs, 'utf8');
  const rel = relFromRoot(repoRoot, abs);
  const type = classify(rel);
  const parsed = parseFrontMatter(text);
  // cover 子字段单独读（只有文章骨架里有）
  const cover = {};
  if (type === 'post') {
    cover.image = getChildField(parsed.doc, 'cover', 'image');
    cover.alt = getChildField(parsed.doc, 'cover', 'alt');
    cover.caption = getChildField(parsed.doc, 'cover', 'caption');
  }
  return {
    path: rel,
    type,
    typeLabel: typeLabel(type),
    schema: editorSchema(type),
    hasFrontMatter: parsed.hasFm,
    body: parsed.body,
    values: parsed.values,
    indents: parsed.indents,
    cover,
  };
}

// ---------- 列表（文件树） ----------

async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(abs, out);
    else if (/\.md$/i.test(entry.name)) out.push(abs);
  }
  return out;
}

// front matter 里没写 title 时，退而取正文的第一个一级标题
// （content/projects/CMC2026/问题一/问题一.md 这类文件就是没有 front matter 的）。
function titleFromBody(body) {
  const m = /^#[ \t]+(.+?)[ \t]*$/m.exec(body);
  return m ? m[1] : '';
}

export async function listContent(repoRoot) {
  const root = contentRoot(repoRoot);
  const files = await walk(root, []);
  const items = [];
  for (const abs of files.sort()) {
    const rel = relFromRoot(repoRoot, abs);
    const type = classify(rel);
    const parsed = parseFrontMatter(await fs.readFile(abs, 'utf8'));
    items.push({
      path: rel,
      type,
      typeLabel: typeLabel(type),
      title: parsed.values.title || titleFromBody(parsed.body) || rel.replace(/^content\//, ''),
      draft: parseBool(parsed.values.draft, false),
      math: parseBool(parsed.values.math, false),
      weight: parseNumber(parsed.values.weight, 0),
      date: parsed.values.date,
      tags: parsed.values.tags,
      hasFrontMatter: parsed.hasFm,
    });
  }
  // 文章按日期倒序，其余按类型分组后按 weight、路径排。
  const order = ['post', 'course-home', 'chapter', 'material', 'project', 'project-home', 'project-section', 'project-doc', 'page', 'taxonomy-page', 'courses-list', 'projects-list', 'other'];
  items.sort((a, b) => {
    const d = order.indexOf(a.type) - order.indexOf(b.type);
    if (d !== 0) return d;
    if (a.weight !== b.weight && a.weight && b.weight) return a.weight - b.weight;
    return a.path.localeCompare(b.path, 'zh');
  });
  return items;
}

// ---------- 预览 URL ----------

function lowerSegments(relDir) {
  return relDir
    .split('/')
    .filter((s) => s !== '')
    .map((s) => encodeURIComponent(s.toLowerCase()))
    .join('/');
}

// 近似 Hugo 的 urlize：小写、非字母数字折成连字符、去掉首尾连字符。
// 中文属于 \p{L}，会原样保留（Hugo 的行为就是这样：标题「我的第一篇文章」出来的 URL 就是
// /2026/09/我的第一篇文章/）。
export function hugoSlug(text) {
  return String(text ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}

// Hugo 默认 pathToLower 生效：URL 里的 ASCII 会全部变成小写（CMC2026 → cmc2026）。
export function previewUrl(basePath, relPath, values) {
  const base = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const p = relPath.replace(/\\/g, '/').replace(/^content\//, '');

  if (values?.url) {
    const u = String(values.url).replace(/^\/+/, '');
    return { url: base + u.split('/').map((s) => encodeURIComponent(s)).join('/'), exact: true };
  }

  const parts = p.split('/');
  const file = parts.pop();
  const name = file.replace(/\.md$/i, '');
  let segments = parts;
  if (name !== 'index' && name !== '_index') segments = [...parts, name];

  // 文章的固定链接是 /:year/:month/:slug/，而 :slug 取的是 front matter 的 slug，
  // 没写就用标题生成 —— 与目录名无关（content/posts/my-first-post/ 的 URL 是
  // /2026/09/我的第一篇文章/）。所以这里必须按标题算，不能用目录名。
  if (parts[0] === 'posts') {
    const m = /^(\d{4})-(\d{2})/.exec(String(values?.date ?? ''));
    const dirSlug = parts[1] ?? name;
    const slug = hugoSlug(values?.slug || values?.title) || hugoSlug(dirSlug) || dirSlug;
    if (m) return { url: `${base}${m[1]}/${m[2]}/${encodeURIComponent(slug)}/`, exact: true };
    return { url: `${base}${lowerSegments(segments.join('/'))}/`, exact: false, note: 'front matter 里没有可解析的 date，预览地址是猜的' };
  }
  return { url: `${base}${lowerSegments(segments.join('/'))}/`, exact: true };
}

// ---------- 新建参数拼装 ----------
//
// 严格对齐 scripts/new-content.sh 的签名与选项；值为空的选项一律不传。

export function buildCreateArgs(form) {
  const kind = String(form.kind ?? '');
  const KINDS = ['post', 'course', 'chapter', 'project', 'sub', 'doc'];
  if (!KINDS.includes(kind)) {
    throw Object.assign(new Error(`未知内容类型：${kind || '(空)'}`), { status: 400 });
  }
  // 第一个参数就是脚本的子命令，且 kind 的取值与子命令名一一对应
  const args = [kind];
  const flag = (name, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      args.push(name, String(value));
    }
  };
  const bool = (name, on) => {
    if (on) args.push(name);
  };
  const tags = Array.isArray(form.tags) ? form.tags.filter((t) => String(t).trim() !== '') : [];
  const cats = Array.isArray(form.categories) ? form.categories.filter((c) => String(c).trim() !== '') : [];
  const publish = Boolean(form.publish);
  const allowNewTags = Boolean(form.allowNewTags);

  switch (kind) {
    case 'post':
      args.push(String(form.slug ?? '').trim());
      flag('--title', form.title);
      if (tags.length) flag('--tags', tags.join(','));
      if (cats.length) flag('--categories', cats.join(','));
      flag('--series', form.series);
      bool('--publish', publish);
      bool('--new-tag', allowNewTags);
      break;
    case 'course':
      args.push(String(form.name ?? '').trim());
      flag('--title', form.title);
      flag('--unit', form.unit);
      if (tags.length) flag('--tags', tags.join(','));
      if (cats.length) flag('--categories', cats.join(','));
      bool('--publish', publish);
      bool('--new-tag', allowNewTags);
      break;
    case 'chapter':
      args.push(String(form.course ?? '').trim(), String(form.title ?? '').trim());
      bool('--publish', publish);
      break;
    case 'project':
      args.push(String(form.name ?? '').trim());
      flag('--title', form.title);
      if (tags.length) flag('--tags', tags.join(','));
      if (cats.length) flag('--categories', cats.join(','));
      flag('--repo', form.repo);
      bool('--layered', form.layered);
      bool('--publish', publish);
      bool('--new-tag', allowNewTags);
      break;
    case 'sub':
      args.push(String(form.project ?? '').trim(), String(form.name ?? '').trim());
      flag('--title', form.title);
      bool('--publish', publish);
      break;
    case 'doc':
      args.push(String(form.projectPath ?? '').trim(), String(form.name ?? '').trim());
      flag('--title', form.title);
      if (tags.length) flag('--tags', tags.join(','));
      bool('--no-math', form.noMath);
      bool('--publish', publish);
      bool('--new-tag', allowNewTags);
      break;
    default:
      // 上面的 allowlist 已经拦住了，这里只是兜底
      throw Object.assign(new Error(`未知内容类型：${kind}`), { status: 400 });
  }

  // 位置参数（子命令之后、第一个 -- 之前）不能是空串
  for (const a of args) {
    if (a === '') throw Object.assign(new Error('必填的名字/标题不能为空'), { status: 400 });
    if (a.startsWith('--')) break;
  }
  return args;
}

// 新建后从脚本输出里取出实际创建的文件（脚本对每个文件打印 `  ✓ content/...`）。
export function createdFiles(stdout) {
  const out = [];
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const m = /^\s*✓\s+(content\/.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}
