// 内容模型：类型判定、编辑器字段表、脚本参数拼装、预览 URL 推导。
//
// 这里集中了「哪些字段能改、tags 能不能写」的知识，它对应 AGENTS.md 规则 3、4 的三条硬红线：
//   - section 页（课程主页 / 章节入口页 / 分层项目主页 / 子项目页 / 列表页）不写 tags
//   - 被 cascade 覆盖的子孙页（课程笔记、作业、实验）不写 tags
//   - cascade 只填空不合并，所以分层项目的文档页写 tags 会整体丢掉项目级标签

import fs from 'node:fs/promises';
import path from 'node:path';
import { run } from './exec.mjs';
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
    // 章目录下的 leaf bundle 一律是材料页。不写死 notes/homework：
    // 材料类型可以再扩展（lab、用 --dir 建出的 lab-02…），模板本身也只认「章下面的 regular page」。
    if (seg.length === 5 && seg[4] === 'index.md' && /^chapter-/.test(seg[2])) {
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

// 与 scripts/check-frontmatter.sh 对齐的硬性要求：title 一律必填；content/posts|courses|projects
// 下非 _index.md 的页面还必须有 date 与 draft（缺了 CI 会以硬错误中止推送）。
// 管理页用它提示「这个文件缺什么、能不能一键补全」。
export function requiredFrontMatterKeys(relPath) {
  const rel = String(relPath ?? '').replace(/\\/g, '/').replace(/^content\//, '');
  const keys = ['title'];
  if (/^(posts|courses|projects)\//.test(rel) && !/(^|\/)_index\.md$/.test(rel)) {
    keys.push('date', 'draft');
  }
  return keys;
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
    // date 只暴露给 scripts/check-frontmatter.sh 要求它的那几类（posts/courses/projects 下非
    // _index.md 的页面，见 requiredFrontMatterKeys）。以前这些类型一律隐藏 date，导致「文件没有
    // front matter」时编辑器虽然提示日期、却给不出可改的输入框，补全后仍过不了校验。
    date: { key: 'date', label: '日期', kind: 'date', hint: '格式 2026-09-11；缺了会被 front matter 校验拦下' },
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
          base.date,
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
          listField('tags', '课程标签（写在 cascade 里）', '    ', { hint: '只下发给笔记/作业/实验这些 regular page' }),
          listField('categories', '分类（写在 cascade 里）', '    '),
        ],
        tagsPolicy: 'editable',
      };
    case 'chapter':
      return {
        fields: [base.title, base.description, base.weight, base.draft, base.math],
        tagsPolicy: 'forbidden',
        tagsReason: '章节入口页是 section，写 tags 只会让 /tags/ 计数虚高、词条页里并不出现（见 docs/content.md）。',
      };
    case 'material':
      return {
        fields: [
          base.title,
          base.date,
          base.description,
          base.weight,
          { key: 'icon', label: '图标', kind: 'text', hint: '📖 学习笔记 / 📝 作业 / 🧪 实验' },
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
          base.date,
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
        fields: [base.title, base.date, base.description, base.summary, base.weight, base.draft, base.math, listField('tags', '标签', '')],
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

// 「项目 → 子项目 → 文档」里可以作为 doc 目标的项目目录。
// 先确认路径确实在 content/projects/ 下：否则前缀替换会静默不生效，别的 section（如
// content/courses/...）会被当成项目目录混进来。
// 平铺单页项目（<目录>/index.md，leaf bundle）必须排除：leaf bundle 里不能有子页面，
// `hugo new content <它>/<文档>.md` 会以「target path conflicts with existing content」失败，
// 把这种目录列进下拉等于给用户一个点了就报错的选项。没有 index.md 的目录是 Hugo 的隐式
// section，可以正常放文档，所以判据是「该目录下直接有 index.md」而不是「必须有 _index.md」。
export function projectDirs(items) {
  const prefix = `${CONTENT_DIR}/projects/`;
  const dirs = new Set();
  const leafBundles = new Set();
  for (const item of items) {
    if (!item.path.startsWith(prefix)) continue;
    const rel = item.path.slice(prefix.length);
    const slash = rel.lastIndexOf('/');
    // 不带 / 的（projects/_index.md 这个列表页）自然被排除
    if (slash <= 0) continue;
    const dir = rel.slice(0, slash);
    dirs.add(dir);
    if (rel === `${dir}/index.md`) leafBundles.add(dir);
  }
  return [...dirs].filter((d) => !leafBundles.has(d)).sort((a, b) => a.localeCompare(b, 'zh'));
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

// 课程 → 已有章节目录（chapter-01…）。给「给已有章节补材料」的下拉用：
// 章节是 branch bundle（section），不是 regular page，所以前端不能从 item.type 自己推，
// 这里算好一起下发（与上面几个 options 同样的理由，见 server.mjs 的注释）。
export function chaptersByCourse(items) {
  const prefix = `${CONTENT_DIR}/courses/`;
  const map = {};
  for (const item of items) {
    if (item.type !== 'chapter' || !item.path.startsWith(prefix)) continue;
    const parts = item.path.slice(prefix.length).split('/');
    // <课程>/<章>/_index.md
    if (parts.length !== 3) continue;
    const [course, chapter] = parts;
    if (!course || !chapter) continue;
    if (!map[course]) map[course] = [];
    if (!map[course].includes(chapter)) map[course].push(chapter);
  }
  for (const course of Object.keys(map)) map[course].sort((a, b) => a.localeCompare(b, 'zh'));
  return map;
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
    // 缺哪些必填键（空数组 = 校验能过）。draft 只认「键不存在」，true/false 都算已写。
    missingRequired: requiredFrontMatterKeys(rel).filter((k) =>
      k === 'draft' ? parsed.values.draft === '' : parsed.values[k] === ''
    ),
    body: parsed.body,
    values: parsed.values,
    indents: parsed.indents,
    cover,
  };
}

// ---------- 拖入 .md 的解析 ----------
//
// 纯函数：不碰磁盘、不读词表（词表求交交给前端，它已经有 store.taxonomy），复用
// frontmatter.mjs 的行级读取，避免在浏览器里再写一遍 YAML 解析。
//
// 返回：
//   values        文件 front matter 里真实存在、且本工具认识的字段（「文件里原本是什么」）
//   fill          推荐填进表单的值：title/slug/date 允许从正文标题、文件名、站点今天兜底
//   notApplicable 文件里有、但新建/编辑表单都没有对应输入的键（如 layout / url），需要告诉用户
//   warnings      解析告警（块列表标签、日期格式、draft: false、没有 front matter…）
//   unknownKeys   front matter 里完全不认识的顶层键
//
// draft 特意不进 fill：是否发布由用户在表单里决定，不因为拖入一个文件就自动取消草稿
// （values.draft 仍然返回，用于提示「文件里其实是 draft: false」）。
const IMPORT_APPLICABLE = ['title', 'description', 'summary', 'date', 'math', 'weight', 'icon', 'unit', 'repo', 'slug', 'series', 'tags', 'categories'];
const IMPORT_SCALARS = ['title', 'description', 'summary', 'date', 'draft', 'math', 'weight', 'icon', 'unit', 'layout', 'repo', 'url', 'slug'];

export function analyzeImport(text, filename, { today = '' } = {}) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const name = String(filename ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop() ?? '';
  const stem = name.replace(/\.md$/i, '');
  const doc = splitFrontMatter(src);
  const warnings = [];
  const values = {};
  let unknownKeys = [];

  if (!doc.hasFm) {
    warnings.push(
      /^---[ \t]*(\r?\n|$)/.test(src)
        ? '文件以 --- 开头，但没有找到闭合的 ---：已按「没有 front matter」处理，请确认正文里的分隔线。'
        : '文件没有 front matter（首行不是 ---）：标题与日期按正文标题、文件名和站点今天推断。'
    );
  } else {
    for (const key of IMPORT_SCALARS) {
      const v = getField(doc, key).value;
      if (v !== '') values[key] = v;
    }
    const tagsIndent = resolveIndent(doc, 'tags', '');
    const catsIndent = resolveIndent(doc, 'categories', '');
    for (const [key, indent] of [
      ['tags', tagsIndent],
      ['categories', catsIndent],
      ['series', ''],
    ]) {
      const list = getList(doc, key, indent);
      if (list.length) values[key] = list;
      // 块列表（键后面换行再列 - 项）本模块读不出来：明确告警，而不是静默丢掉标签
      if (doc.fm.some((line) => new RegExp(`^${indent}${key}[ \\t]*:[ \\t]*$`).test(line))) {
        warnings.push(`${key} 用的是「块列表」写法（键后面换行再列 - 项），这里只识别行内数组 ["a", "b"]，这一项没有读出来。`);
      }
    }
    unknownKeys = [
      ...new Set(
        doc.fm
          .map((line) => (/^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:/.exec(line) ?? [])[1])
          .filter((k) => k && k !== 'cover' && !IMPORT_SCALARS.includes(k) && !['tags', 'categories', 'series'].includes(k))
      ),
    ];
  }

  const heading = (/^#[ \t]+(.+?)[ \t]*$/m.exec(doc.body.join('\n')) ?? [])[1] ?? '';
  const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(values.date ?? '');
  if (values.date && !dateMatch) {
    warnings.push(`date「${values.date}」不是 YYYY-MM-DD 开头，导入时改用今天${today ? `（${today}）` : ''}。`);
  }
  if (values.draft === 'false') {
    warnings.push('文件里写的是 draft: false；导入不会自动取消草稿，要直接发布请在表单里勾选「直接发布」（编辑页则取消「仍是草稿」）。');
  }

  const title = values.title || heading || stem;
  const asciiStem = /^[A-Za-z0-9._-]+$/.test(stem) ? stem : '';
  const fill = {};
  for (const key of IMPORT_APPLICABLE) {
    if (values[key] !== undefined) fill[key] = values[key];
  }
  fill.title = title;
  // slug 优先用文件里的；没有就用 ASCII 文件名，最后才退回标题的 Hugo 式 slug
  fill.slug = values.slug || asciiStem || hugoSlug(title) || stem;
  // date 用站点今天兜底：archetype 的 date 也是今天，补全后能直接过 front matter 校验
  fill.date = dateMatch ? dateMatch[1] : today;

  return {
    filename: name,
    hasFrontMatter: doc.hasFm,
    body: doc.body.join('\n'),
    bodyLines: doc.body.length,
    values,
    fill,
    // draft 有对应的勾选框，只是**有意**不自动填（是否发布由用户决定），所以不算「没有输入」
    notApplicable: Object.keys(values)
      .filter((k) => k !== 'draft' && !IMPORT_APPLICABLE.includes(k))
      .sort(),
    unknownKeys,
    warnings,
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
// 这只是**兜底**：权威做法是问 Hugo（见下面的 previewUrl）。
function previewUrlHeuristic(basePath, relPath, values) {
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

// ---------- 预览 URL（问 Hugo，别自己算） ----------
//
// `hugo list all` 直接给出每页的源文件路径与最终 permalink，permalinks 规则、pathToLower、
// front matter 的 url、中文的百分号编码全都在里面。早先这里自己实现了一遍 slugify +
// permalinks + pathToLower，任何一处配置改动都得记着同步改过来 —— 那是第二份事实源。
// 现在只在「Hugo 列不到这一页」（刚新建还没落盘、或 hugo 不可用）时才退回上面的启发式。
let permalinkCache = { at: 0, map: new Map() };
const PERMALINK_TTL_MS = 5000;

export function invalidatePermalinks() {
  permalinkCache = { at: 0, map: new Map() };
}

async function permalinkIndex(repoRoot) {
  const now = Date.now();
  if (permalinkCache.map.size > 0 && now - permalinkCache.at < PERMALINK_TTL_MS) {
    return permalinkCache.map;
  }
  const map = new Map();
  try {
    const { code, stdout } = await run('hugo', ['list', 'all'], { cwd: repoRoot, timeoutMs: 60000 });
    if (code === 0) {
      for (const line of stdout.split(/\r?\n/)) {
        // 首列是源文件路径，末三列是 permalink,kind,section。
        // ① 从行尾锚定 permalink——标题里可能有逗号，不能按逗号朴素切分；
        // ② section 对顶层页面（about 这类）是空字符串，所以最后一组必须允许为空。
        const m = /^([^,]+),.*,(https?:\/\/\S+),([a-z]+),([a-z]*)$/.exec(line.trim());
        if (!m) continue;
        map.set(m[1].replace(/\\/g, '/'), m[2]);
      }
    }
  } catch {
    // hugo 不可用（或没装）→ 整表退回启发式
  }
  permalinkCache = { at: now, map };
  return map;
}

// permalink 是绝对地址（含 baseURL 子路径）；预览只是换个 origin，所以去掉 scheme 与 host。
function sitePathOf(permalink) {
  return permalink.replace(/^https?:\/\/[^/]+/i, '');
}

export async function previewUrl(repoRoot, basePath, relPath, values) {
  const rel = relPath.replace(/\\/g, '/');
  const map = await permalinkIndex(repoRoot);
  const hit = map.get(rel);
  if (hit) return { url: sitePathOf(hit), exact: true, source: 'hugo' };
  return { ...previewUrlHeuristic(basePath, relPath, values), source: 'heuristic' };
}

// ---------- 新建参数拼装 ----------
//
// 严格对齐 scripts/new-content.sh 的签名与选项；值为空的选项一律不传。
// 除 add-term 之外，kind 的取值与脚本的子命令名一一对应（notes/homework/lab 各是一个子命令），
// 所以日志里显示的命令就是真正跑的那条。

const MATERIAL_KINDS = ['notes', 'homework', 'lab'];

export function buildCreateArgs(form) {
  const kind = String(form.kind ?? '');
  const KINDS = ['post', 'course', 'chapter', 'project', 'sub', 'doc', ...MATERIAL_KINDS];
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
    case 'chapter': {
      args.push(String(form.course ?? '').trim(), String(form.title ?? '').trim());
      // materials 缺省（老客户端 / 手敲的请求）时不传，交给脚本的默认值；
      // 明确传了空数组就说明用户在界面上取消了全部勾选 → `none`（只建入口页）。
      if (Array.isArray(form.materials)) {
        const picked = MATERIAL_KINDS.filter((m) => form.materials.includes(m));
        args.push('--materials', picked.length ? picked.join(',') : 'none');
      }
      bool('--publish', publish);
      break;
    }
    case 'notes':
    case 'homework':
    case 'lab':
      // 材料页：<课程> <章节>，材料目录默认与类型同名
      args.push(String(form.course ?? '').trim(), String(form.chapter ?? '').trim());
      flag('--dir', form.dir);
      flag('--title', form.title);
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

  // description / date 对所有类型都适用（每个 archetype 都有这两个键），放在 switch 之后统一追加。
  flag('--description', form.description);
  flag('--date', form.date);

  // 拖入 .md 的正文不进 argv（可能很大、也可能含任意字符），由调用方通过 stdin 传给脚本；
  // 这里只加一个开关，真正的文本在 server.mjs 里作为 input 喂进去。
  const bodyText = typeof form.body === 'string' ? form.body : '';
  if (bodyText !== '') args.push('--body-stdin');

  // 位置参数（子命令之后、第一个 -- 之前）不能是空串
  for (const a of args) {
    if (a === '') throw Object.assign(new Error('必填的名字/标题不能为空'), { status: 400 });
    if (a.startsWith('--')) break;
  }
  return args;
}

// ---------- 删除参数拼装 ----------
//
// 规则（哪些路径能删、能不能连目录删）只有 scripts/new-content.sh 的 cmd_remove 一份实现；
// 这里把「先 dry-run 拿清单、确认后再删」也交给同一个子命令，只做最小护栏。
export function buildRemoveArgs(form) {
  const rel = String(form.path ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (rel === '') throw Object.assign(new Error('缺少 path 参数'), { status: 400 });
  if (!rel.startsWith(`${CONTENT_DIR}/`)) {
    throw Object.assign(new Error(`只允许删除 ${CONTENT_DIR}/ 内的内容：${rel}`), { status: 400 });
  }
  if (rel.split('/').includes('..')) {
    throw Object.assign(new Error(`路径里不能出现 ..：${rel}`), { status: 400 });
  }
  const args = ['remove', rel];
  if (form.withBundle) args.push('--with-bundle');
  if (form.dryRun) args.push('--dry-run');
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

// 删除时脚本先打印删除计划（`  - content/...`，dry-run 也有），删除后再逐条打印 `  ✓ 已删除 content/...`。
export function planFiles(stdout) {
  const out = [];
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const m = /^\s*-\s+(content\/.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

export function removedFiles(stdout) {
  const out = [];
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const m = /^\s*✓\s+已删除\s+(content\/.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}
