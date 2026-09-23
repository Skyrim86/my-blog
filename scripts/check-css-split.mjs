#!/usr/bin/env node
// CSS 按页拆包核对：构建产物里「谁加载了哪张样式表」必须和「谁的 HTML 里真的出现了卡片类」一致。
//
// ---- 为什么需要它 ----
// 2026-09-23 把只服务少数页面的 CSS 从 assets/css/extended/（会被串成**每页都吃**的那张主表）
// 拆成了两组外链表：
//   · assets/css/decks/  卡片组工艺/雕花/等级令牌 → 只有首页与 /collection/
//   · assets/css/home/   首页版面与入站揭幕      → 只有首页
// 接线在 layouts/_partials/extend_head.html 里，判据是 `.IsHome` 与 `.Section == "collection"`。
// 这个判据**没有任何东西验证**：将来加一个渲染卡片的页面（或者有人把文件挪回 extended/），
// 症状是「没有任何报错、那一段样式静静失效」—— 正是本仓库最怕的那类失败（见 docs/traps.md 的风格）。
// 所以拿构建产物对账，而不是信任模板里的那两行条件。
//
// ---- 判据 ----
// 「这一页需要卡片样式表」= 页面的 class 里出现 `home-card*` 或 `deck-*`。
//   不用「被移出文件的类名全集」当判据：那里面混着 .main/.button/.profile 这类全站通用类，
//   会把 179 页全判成「需要卡片表」—— 这个错误本检查的实现过程中真的犯过一次（已改）。
// 「这一页需要首页样式表」= 它就是根 index.html（首页专用版面只在 .IsHome 下发）。
//
// 用法：node scripts/check-css-split.mjs [输出目录]
//   默认 public。必须先构建（hugo --minify --gc）。
// 退出码：0 = 一致；1 = 不一致（或产物缺表）
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const OUT = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'public';

if (!existsSync(OUT)) {
  console.error(`✗ 找不到输出目录 ${OUT}，先跑一次构建（hugo --minify --gc）`);
  process.exit(1);
}

// 产物里的表名（Concat 的目标路径 + 指纹）形如 assets/css/decks.min.<sha>.css
const DECKS_LINK_RE = /\/assets\/css\/decks\./;
const HOME_LINK_RE = /\/assets\/css\/home\./;
const MAIN_CSS_RE = /^stylesheet\.[0-9a-f]+\.css$/;

function htmlFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) htmlFiles(p, acc);
    else if (name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

const pages = htmlFiles(OUT);
const needCards = [];
const hasCardsLink = [];
const needHome = [];
const hasHomeLink = [];
const orphans = []; // 该加载而没加载
const waste = []; // 不该加载却加载了

for (const p of pages) {
  const rel = relative(OUT, p).split(sep).join('/');
  const t = readFileSync(p, 'utf8');
  let cards = false;
  for (const m of t.matchAll(/class=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const v = m[1] ?? m[2] ?? m[3] ?? '';
    if (/(?:^|\s)(?:home-card|deck-)/.test(v)) {
      cards = true;
      break;
    }
  }
  const decksLink = DECKS_LINK_RE.test(t);
  const homeLink = HOME_LINK_RE.test(t);
  const isHome = rel === 'index.html';

  if (cards) needCards.push(rel);
  if (decksLink) hasCardsLink.push(rel);
  if (isHome) needHome.push(rel);
  if (homeLink) hasHomeLink.push(rel);
  if (cards !== decksLink) orphans.push({ rel, cards, decksLink });
  if (isHome !== homeLink) orphans.push({ rel, isHome, homeLink, kind: 'home' });
}

const failures = [];
for (const o of orphans) {
  if (o.kind === 'home') {
    failures.push(
      o.isHome
        ? `首页没有加载 assets/css/home/ 那张表 —— 首页版面（09-home / 23-splash）会是裸的。`
        : `${o.rel} 不是首页却加载了 assets/css/home/ 那张表（首页专用版面白吃 3 KB gzip）。`
    );
  } else if (o.cards) {
    failures.push(
      `${o.rel} 渲染了卡片类（home-card* / deck-*）却没有加载 assets/css/decks/ 那张表 —— ` +
        `卡片会退化成没有工艺/雕花的素框，且不报错。加页面时记得在 extend_head.html 接上。`
    );
  } else {
    failures.push(
      `${o.rel} 没有卡片类却加载了 assets/css/decks/ 那张表 —— 每页白吃 20 KB gzip，` +
        `拆包的意义就在这里，别把它退回去。`
    );
  }
}

// 表的体积（顺便把收益打进日志，方便和 docs/pending.md 对账）
function bundle(prefix) {
  const dir = join(OUT, 'assets', 'css');
  const f = readdirSync(dir).find((n) => n.startsWith(prefix) && n.endsWith('.css'));
  if (!f) return null;
  const buf = readFileSync(join(dir, f));
  return { file: f, raw: buf.length, gz: gzipSync(buf, { level: 6 }).length };
}
const decks = bundle('decks.');
const home = bundle('home.');

for (const [label, b] of [['卡片表 decks', decks], ['首页表 home', home]]) {
  if (!b) failures.push(`产物里找不到 ${label}（assets/css/${label.split(' ').pop()}.min.*.css）—— 构建没跑或接线被删了。`);
}

// 主表里不该再有卡片/首页的选择器：防的是「有人把文件挪回 extended/」这个动作。
// 判据挑了三个**只在被移出文件里定义**的选择器（`.home-card`、`.deck-`、`.deck-splash`），
// 每个都先验证过「留下的 extended/*.css 里一个都没有」—— 别加 `.home-hero` 这类：它虽然
// 名字带 home，却在 00-theme.css 的玻璃底衬清单里有一条全站规则，加进来就会误报。
{
  const dir = join(OUT, 'assets', 'css');
  const main = readdirSync(dir).find((n) => MAIN_CSS_RE.test(n));
  if (!main) {
    failures.push('产物里找不到主样式表（assets/css/stylesheet.*.css）。');
  } else {
    const t = readFileSync(join(dir, main), 'utf8');
    for (const [cls, sheet] of [['.home-card', 'decks'], ['.deck-', 'decks'], ['.deck-splash', 'home']]) {
      if (t.includes(cls)) {
        failures.push(
          `主样式表里仍然有 ${cls} 的选择器 —— 定义它的文件该在 assets/css/${sheet}/ 里，` +
            `挪回 assets/css/extended/ 就等于每页又吃一遍（这条是拆包的底线）。`
        );
      }
    }
  }
}

console.log(`▸ 按页拆包：扫 ${pages.length} 个 HTML`);
console.log(`  · 需要卡片表的页：${needCards.length}（${needCards.slice(0, 3).join('、')}${needCards.length > 3 ? ' …' : ''}）`);
console.log(`  · 不吃卡片表的页：${pages.length - needCards.length}`);
if (decks) console.log(`  · decks 表：${(decks.raw / 1024).toFixed(1)} KB raw / ${(decks.gz / 1024).toFixed(1)} KB gzip`);
if (home) console.log(`  · home  表：${(home.raw / 1024).toFixed(1)} KB raw / ${(home.gz / 1024).toFixed(1)} KB gzip`);

if (failures.length) {
  console.log();
  for (const line of failures) console.log(`✗ ${line}`);
  console.log();
  console.log(`✗ 拆包接线与产物不一致（${failures.length} 处）。`);
  process.exit(1);
}
console.log();
console.log('✓ 按页拆包接线与产物一致：带卡片类的页面都加载了卡片表，其余页面一张都没多吃');
