#!/usr/bin/env node
/* 正文守卫：产物里不许出现字面 `**`（goldmark emphasis 失配泄漏）与被截断的属性。
 *
 * 为什么要有这个：`.md` 里的 `**粗**` 在 CommonMark 的 flanking 规则下有四种失配形态，
 * 闭合与开定界符各两种（详见 lab/工具/find-strongleak.py 的文件头）。失配时那一对
 * `**` 会**原样进 HTML**，而且同一段文字还会经 .Summary 进 meta description、分类页与
 * 标签页的摘要行、搜索索引 —— 一处源泄漏在产物里会复制 4~6 次。
 *
 * 现有守卫的盲区（本轮实测）：
 *   · check-math-katex.mjs 查 7371 个数学区，全绿，但它只看数学区；
 *   · check-frontmatter.sh / check-seo.mjs 都不看正文文本。
 * 所以这类泄漏此前**没有任何东西挡着**，2026-10-03 产物里累计 41 处。
 *
 * 查两件事：
 *   1. 正文（剔除 <pre>/<code>）与 meta description 里的字面 `**`；
 *   2. data-* 属性值被从引号内部截断的痕迹 —— 表现为属性值里出现未转义的 `"` 收尾，
 *      即 `… **命题">` 这种（修法见 layouts/_partials/toolbox-{card,teaser}.html）。
 *
 * 退出码：0 = 干净；1 = 有问题（阻断）。
 * 用法：node scripts/check-prose.mjs [--public public]
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};

const ROOT = process.cwd();
const PUBLIC = opt('public', 'public');

if (!existsSync(PUBLIC)) {
  console.error(`✗ 找不到产物目录 ${PUBLIC} —— 先 hugo 构建（push-blog.sh 里构建在本检查之前）。`);
  process.exit(1);
}

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* htmlFiles(p);
    else if (name.endsWith('.html')) yield p;
  }
}

const problems = [];

for (const file of htmlFiles(PUBLIC)) {
  const rel = '/' + relative(PUBLIC, file).replace(/\\/g, '/').replace(/index\.html$/, '');
  const html = readFileSync(file, 'utf8');

  // ---- 1. 正文与 meta description 里的字面 ** ----
  const main = /<main[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (main) {
    // 剔除代码块：里面的 ** 是代码，不是泄漏
    const prose = main[1]
      .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
      .replace(/<code[\s\S]*?<\/code>/g, ' ')
      .replace(/<[^>]+>/g, ' ');
    for (const m of prose.matchAll(/\*\*/g)) {
      const seg = prose.slice(Math.max(0, m.index - 45), m.index + 55).replace(/\s+/g, ' ').trim();
      problems.push({ kind: 'leak', rel, where: '正文', snippet: seg });
    }
  }
  const meta = /<meta name=description content="([^"]*)"/.exec(html);
  if (meta) {
    const t = meta[1];
    if (t.includes('**')) {
      problems.push({
        kind: 'leak', rel, where: 'meta description',
        snippet: t.replace(/\s+/g, ' ').slice(0, 110),
      });
    }
  }

  // ---- 2. 属性被从引号内部截断 ----
  // 形态：data-xxx="值" 后面紧跟 `>` 之前的引号缺失，或值里出现未转义的 "。
  // **不能用 /\sdata-[a-z-]+="([^"]*)"/g 来找** —— 2026-10-03 第一版就是这么写的，
  // 结果自己注入的坏产物它**没报出来**：`[^"]*` 撞上提前闭合的那个引号就停，
  // 于是「属性被截断 + 后面漏出文本」这种形态在它眼里是**一个完全正常的属性**。
  // 注入测试：把 `data-search="…"` 改成 `data-search="…**命题">`，rc 仍是 0。
  //
  // 改用「标签级」判据：把该标签的属性区整段抠出来，看它自身能不能闭合。
  // 正常形态： data-a="1" data-b="2" >     —— 引号成对、数目为偶
  // 坏形态：   data-a="1**命题">            —— 落单的引号后面不是属性名
  for (const m of html.matchAll(/<[a-z][^<>]*?\sdata-[a-z-]+=[^<>]*>/gi)) {
    const tag = m[0];
    const inner = tag.slice(1, -1);
    const q = (inner.match(/"/g) || []).length;
    if (q % 2 === 1) {
      // 落单引号：截出来看看漏了什么
      const firstQ = inner.indexOf('"');
      const secondQ = inner.indexOf('"', firstQ + 1);
      const leaked = secondQ < 0 ? inner.slice(firstQ + 1) : '';
      problems.push({
        kind: 'attr', rel, where: '标签属性区（引号落单）',
        snippet: (leaked || inner).slice(-70),
      });
    }
  }
}

if (problems.length === 0) {
  console.log(`✓ 正文守卫通过：产物里没有字面 **，data-* 属性也没有未转义的引号`);
  process.exit(0);
}

const byKind = (k) => problems.filter((p) => p.kind === k);
for (const k of ['leak', 'attr']) {
  const ps = byKind(k);
  if (!ps.length) continue;
  console.log(`\n✗ ${k === 'leak' ? '正文/meta 里出现字面 **' : 'data-* 属性里有未转义的引号'}：${ps.length} 处`);
  const seen = new Set();
  for (const p of ps) {
    const key = p.rel + p.where + p.snippet.slice(0, 30);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`  ${p.rel}  [${p.where}]`);
    console.log(`      …${p.snippet}…`);
  }
}
console.log(`
修法（别手改产物）：
  · .md 里的：在 goldmark emphasis 失配的那对 ** 之一旁**补一个空格。判据与四种形态见
    lab/工具/find-strongleak.py 的文件头；批量修用 lab/工具/fix-strongleak.py --apply。
  · data-* 属性的：先 substr 截断、**再** htmlEscape（顺序反了会把实体从中间切开），
    见 layouts/_partials/toolbox-card.html 与 toolbox-teaser.html 的注释。`);
process.exit(1);
