#!/usr/bin/env node
// archetypes/ 与管理页编辑器字段表的**漂移检查**。
//
// 背景（为什么不是「直接派生」）：管理页的字段表不是 archetype 的副本，而是它的**策展子集**，
// 两个方向都有差异，实测：
//   · 只给 UI 的字段：post.slug、material.math、project-doc.tags —— archetype 里都没有；
//   · 故意不暴露的字段：layout（载重字段，不该随手改）、date（多数类型由 archetype 自动生成）、
//     cover.relative / cover.hiddenInList / cover.hiddenInSingle（易踩坑）。
// 所以「按 archetype 机械生成字段表」会把 layout/date 顶到表单里、又会丢掉 slug，
// 还会把每个类型的字段顺序换掉——那是行为回归，不是简化。
//
// 真正会发生的事故是**静默分叉**：往 archetype 里加了一个字段，管理页不知道，
// 于是 CLI 新建的内容有它、界面新建的内容没有。这个检查就是用来把这种分叉喊出来的。
//
// 用法：node scripts/check-editor-schema.mjs
// 退出码：0 = 无漂移；1 = 有 archetype 字段既没被 UI 暴露、也不在下面声明的 hidden 列表里
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// 类型 → archetype。hidden 是**有意不暴露**的字段（dot path），不是遗漏。
// archetypes 是数组：一个编辑器类型可能对应多个骨架（三种课程材料页共用 material 类型）。
const MAP = {
  post: { archetypes: ['default'], hidden: ['cover.relative', 'cover.hiddenInList', 'cover.hiddenInSingle'] },
  'course-home': {
    archetypes: ['courses'],
    hidden: ['layout', 'date', 'cascade.target', 'cascade.kind', 'cascade.math'],
  },
  chapter: { archetypes: ['chapter'], hidden: ['layout', 'date'] },
  // 三种材料页（笔记 / 作业 / 实验）共用一份字段表，键必须保持一致；逐个检查才不会漏掉新加的那个
  // material / project / project-doc 不再隐藏 date：check-frontmatter 要求这几类必须有 date，
  // 而「文件没有 front matter」时编辑器得给出可改的输入框才能补全（见 requiredFrontMatterKeys）。
  material: { archetypes: ['notes', 'homework', 'lab'], hidden: [] },
  project: { archetypes: ['projects'], hidden: [] },
  'project-home': { archetypes: ['project-home'], hidden: ['date', 'cascade.target', 'cascade.kind'] },
  'project-section': { archetypes: ['project-section'], hidden: ['date'] },
  'project-doc': { archetypes: ['project-doc'], hidden: [] },
  // section 列表页（/posts/、/courses/、/projects/、/tags/ 这类分区的入口页）：五种类型共用
  // content.mjs 里同一个 editorSchema 分支，骨架都是 archetypes/section.md（只有 title + description）。
  // 以前这几类根本不在 MAP 里 —— 骨架不过这条检查，就等于新旧两处事实源又分一次家。
  'posts-list': { archetypes: ['section'], hidden: [] },
  'courses-list': { archetypes: ['section'], hidden: [] },
  'projects-list': { archetypes: ['section'], hidden: [] },
  'taxonomy-page': { archetypes: ['section'], hidden: [] },
  'section-list': { archetypes: ['section'], hidden: [] },
};

// 取 front matter 里的键路径。只认「顶层键 + 其下第一层子键」：
// 这两级就够表达 cover / cascade 的形状，而且不会被 YAML 列表项（- target:）的缩进绕晕。
function archetypeKeys(file) {
  const lines = readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
  let inFm = false;
  let seen = 0;
  let top = null;
  const keys = [];
  for (const raw of lines) {
    if (/^---[ \t]*$/.test(raw)) {
      seen += 1;
      if (seen === 2) break;
      inFm = true;
      continue;
    }
    if (!inFm) continue;
    const m = /^([ \t]*)([A-Za-z_][A-Za-z0-9_.-]*)[ \t]*:(.*)$/.exec(raw);
    if (!m) continue; // 列表项、注释等一律忽略
    const indent = m[1].replace(/\t/g, '    ').length;
    const key = m[2];
    if (indent === 0) {
      top = key;
      keys.push(key);
    } else if (top) {
      keys.push(`${top}.${key}`);
    }
  }
  return keys;
}

const content = await import(pathToFileURL('tools/admin/lib/content.mjs').href);

let drift = 0;
const rows = [];
for (const [type, { archetypes, hidden }] of Object.entries(MAP)) {
  const schema = content.editorSchema(type);
  // 放宽匹配：字段表里 cascade 下的键写作 `tags`（靠 indent 表达层级），
  // 所以除了完整 dot path，也比对最后一段。
  const exposed = new Set();
  for (const f of schema.fields ?? []) {
    exposed.add(f.key);
    exposed.add(String(f.key).split('.').pop());
  }
  const hiddenSet = new Set(hidden);
  for (const archetype of archetypes) {
    const file = `archetypes/${archetype}.md`;
    const keys = archetypeKeys(file);
    // 容器键（cover: / cascade:）本身不是字段，它的子键才是——所以只检查叶子键，
    // 否则每次都会误报「cover 没暴露」。
    const containers = new Set(keys.filter((k) => keys.some((o) => o.startsWith(`${k}.`))));
    const missing = keys.filter(
      (k) => !containers.has(k) && !exposed.has(k) && !exposed.has(k.split('.').pop()) && !hiddenSet.has(k)
    );
    rows.push({ type, archetype, keys: keys.length, fields: (schema.fields ?? []).length, missing });
    drift += missing.length;
  }
}

for (const r of rows) {
  const status = r.missing.length ? '✗' : '✓';
  console.log(`${status} ${r.type.padEnd(16)} ${`archetypes/${r.archetype}.md`.padEnd(28)} archetype ${String(r.keys).padStart(2)} 键 / UI ${String(r.fields).padStart(2)} 字段`);
  for (const k of r.missing) {
    console.log(`    ✗ 「${k}」在 archetype 里有，但 UI 既没暴露也没列入 hidden —— 管理页需要跟上`);
  }
}

console.log();
if (drift === 0) {
  console.log('✓ 编辑器字段表与 archetypes 无漂移');
  process.exit(0);
}
console.log(`✗ 发现 ${drift} 处漂移。要么在 tools/admin/lib/content.mjs 的 editorSchema 里暴露它，`);
console.log('  要么在本脚本顶部的 MAP[type].hidden 里声明为「有意不暴露」。');
process.exit(1);
