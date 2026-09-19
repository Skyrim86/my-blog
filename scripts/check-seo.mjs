#!/usr/bin/env node
// SEO 与订阅产物的体检：只查**构建产物**里那几件「错了也不会让构建失败、但会让站点不可被发现
// 或无法订阅」的事。跑在 hugo 构建之后、与 check-links.mjs 同批（都读 public/）。
//
// 为什么单列一个脚本：站点的检索/订阅能力全靠 hugo.toml 的 baseURL、`env`、outputs 与
// 主题模板里的几行判断（robots 模板按 hugo.IsProduction 决定 Disallow，rss.xml 按 hiddenInRss
// 过滤）。这些都不是「改内容」能碰到的地方，一旦改错（例如把 baseURL 的子路径去掉、
// 或 env 不是 production），站点会安静地变成「搜索引擎不收 + robots 全禁」，而所有既有校验都会通过。
//
// 起因是一份外部体检报告断言「sitemap.xml 不可访问」—— 实测线上返回的是合法 XML，报告是拿错了
// URL（漏了 /my-blog/ 子路径）。与其反复对账，不如把「sitemap 里的 URL 必须带 baseURL 前缀」
// 变成一条可执行的断言。
//
// 用法：node scripts/check-seo.mjs [输出目录]     默认 public
// 退出码：0 = 全部通过；1 = 有发现（CI 里按「只警告」接入，见 .github/actions/validate/action.yml）
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// 第一个非选项参数是输出目录。这里比 check-links.mjs 多一层过滤：某些 Windows 上的 node
// 垫片会把解释器路径也塞进 argv，直接取第一个参数会拿到 `…\node.exe`。
const OUT =
  process.argv
    .slice(2)
    .find((a) => !a.startsWith('--') && !/\.(exe|cmd|mjs|cjs|js)$/i.test(a)) || 'public';

if (!existsSync(OUT)) {
  console.error(`✗ 找不到输出目录 ${OUT}，先跑一次构建（hugo --minify --gc）`);
  process.exit(1);
}

const problems = [];
const bad = (what, detail) => problems.push(`${what}：${detail}`);
const read = (p) => readFileSync(p, 'utf8');

console.log(`▸ SEO 体检：输出目录 ${OUT}`);

// baseURL 是这一整套检查的基准：站内所有绝对 URL 都必须以它开头（本站部署在 /my-blog/ 子路径下，
// 漏掉子路径的 URL 会 404 —— 正是那份外部报告踩的坑）。
let baseURL = '';
let basePath = '';
try {
  const m = read('hugo.toml').match(/^baseURL\s*=\s*['"]([^'"]+)['"]/m);
  if (m) {
    baseURL = m[1].endsWith('/') ? m[1] : `${m[1]}/`;
    basePath = new URL(baseURL).pathname;
  }
} catch {
  /* 没有 hugo.toml 就只能做与 baseURL 无关的那些断言 */
}

// URL → public/ 下的文件路径。站点是「目录式 URL」，/foo/ 对应 foo/index.html。
function fileForURL(absURL) {
  let rel;
  try {
    rel = new URL(absURL).pathname;
  } catch {
    return null;
  }
  if (basePath && rel.startsWith(basePath)) rel = rel.slice(basePath.length);
  rel = decodeURIComponent(rel).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  return join(OUT, ...rel.split('/'));
}

// ---------- 1. sitemap.xml ----------
const sitemapPath = join(OUT, 'sitemap.xml');
if (!existsSync(sitemapPath)) {
  bad('sitemap', `${sitemapPath} 没生成（hugo.toml 是否动了 disableKinds / outputs？）`);
} else {
  const locs = [...read(sitemapPath).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) {
    bad('sitemap', 'sitemap.xml 里一个 <loc> 都没有');
  }
  if (baseURL) {
    const outside = locs.filter((u) => !u.startsWith(baseURL));
    if (outside.length) {
      bad(
        'sitemap',
        `${outside.length} 个 <loc> 不带 baseURL 前缀（${baseURL}），例如 ${outside[0]} —— 子路径漏写会让搜索引擎抓到 404 的 URL`
      );
    }
  }
  // sitemap 是给搜索引擎的入口清单，指向不存在的页面等于自报坏链
  const missing = locs.filter((u) => {
    const f = fileForURL(u);
    return !f || !existsSync(f);
  });
  if (missing.length) {
    bad('sitemap', `${missing.length} 个 <loc> 在构建产物里没有对应文件，例如 ${missing[0]}`);
  }
  console.log(`  · sitemap.xml：${locs.length} 条 url`);
}

// ---------- 2. robots.txt ----------
const robotsPath = join(OUT, 'robots.txt');
if (!existsSync(robotsPath)) {
  bad('robots', `${robotsPath} 没生成（hugo.toml 的 enableRobotsTXT 关掉了？）`);
} else {
  const robots = read(robotsPath);
  if (!/^\s*Sitemap:\s*\S+/m.test(robots)) {
    bad('robots', 'robots.txt 里没有 Sitemap: 行，搜索引擎找不到 sitemap');
  }
  // 主题的 robots 模板：非生产环境输出 `Disallow: /`（整站禁止抓取）。本地预览是故意的，
  // 但 CI 构建出来的产物必须不是 —— 所以这里只对「产物里的 URL 指向线上域名」时告警。
  if (baseURL && !baseURL.includes('localhost') && /^\s*Disallow:\s*\/\s*$/m.test(robots)) {
    bad('robots', 'robots.txt 里有 `Disallow: /`，整站会被搜索引擎屏蔽（hugo.toml 的 params.env 不是 production？）');
  }
  console.log('  · robots.txt：有 Sitemap 行，生产环境未禁用抓取');
}

// ---------- 3. 首页 meta ----------
const homePath = join(OUT, 'index.html');
if (!existsSync(homePath)) {
  bad('首页', `${homePath} 没生成`);
} else {
  const html = read(homePath);
  const meta = (name) => {
    const tag = html.match(new RegExp(`<meta[^>]*name=["']?${name}["']?[^>]*>`, 'i'));
    if (!tag) return null;
    const c = tag[0].match(/content=["']?([^"'>]*)/i);
    return c ? c[1].trim() : '';
  };
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1].trim();
  if (!title) bad('首页', '<title> 是空的');
  const desc = meta('description');
  if (!desc) bad('首页', '没有 meta description');
  const robots = meta('robots');
  if (robots && /noindex/i.test(robots)) {
    bad('首页', `首页 meta robots 是「${robots}」，整站首页不会被收录（hugo.toml 的 params.env 不是 production？）`);
  }
  console.log(`  · 首页：title「${title}」，description ${desc ? '非空' : '缺失'}`);
}

// ---------- 4. 首页 RSS ----------
const rssPath = join(OUT, 'index.xml');
if (!existsSync(rssPath)) {
  bad('rss', `${rssPath} 没生成（hugo.toml 的 [outputs] home 少了 'RSS'？）`);
} else {
  const xml = read(rssPath);
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  if (items.length === 0) bad('rss', 'index.xml 里一个 <item> 都没有（订阅者收到空 feed）');
  // 零值日期：没有 date 的页面会输出 `Mon, 01 Jan 0001`，阅读器会把它排到最后或直接报格式错
  const zeroDate = items.filter((it) => /<pubDate>[^<]*\b0001\b/.test(it));
  if (zeroDate.length) {
    bad(
      'rss',
      `${zeroDate.length} 条 pubDate 是零值年份 0001（这些页面没有 date，应加 hiddenInRss: true），例如 ${(zeroDate[0].match(/<link>([^<]+)/) || [])[1]}`
    );
  }
  // 空描述：正文为空的生成页（工具卡片）会这样 —— 订阅列表里是一排没有摘要的标题
  const emptyDesc = items.filter((it) => /<description>\s*<\/description>/.test(it));
  if (emptyDesc.length) {
    bad(
      'rss',
      `${emptyDesc.length} 条 description 是空的（正文为空的生成页应加 hiddenInRss: true），例如 ${(emptyDesc[0].match(/<link>([^<]+)/) || [])[1]}`
    );
  }
  const missing = items
    .map((it) => (it.match(/<link>([^<]+)<\/link>/) || [])[1])
    .filter((u) => {
      const f = u && fileForURL(u);
      return !f || !existsSync(f);
    });
  if (missing.length) {
    bad('rss', `${missing.length} 条 <link> 指向构建产物里不存在的页面，例如 ${missing[0]}`);
  }
  console.log(`  · index.xml：${items.length} 条 item`);
}

// ---------- 5. 页面里的 JSON-LD ----------
// 起因：结构化数据是「坏了也不报错」的典型 —— 删字段时留下的悬空逗号、少一个逗号、
// 或者零值日期（0001-01-01，没有 front matter date 的页面会这样），构建全都过，
// 爬虫那边则整块静默失效。改 layouts/_partials/templates/schema_json.html 之后必须靠这条复核
// （docs/features.md ㉟ 原先记的就是「check-seo.mjs 不查 JSON-LD 的语法」这个缺口）。
//
// 用 fs 直接遍历产物，不为每个文件开子进程（AGENTS 规则 12：Windows Git Bash 里一次 fork 约 21ms）。
const htmlFiles = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.html')) htmlFiles.push(p);
  }
})(OUT);

const LD_RE = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
const rel = (p) => p.slice(OUT.length + 1).split('\\').join('/');
const isBlank = (v) =>
  v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

let ldBlocks = 0;
let ldPages = 0;
let ldPostings = 0;
let ldBad = 0;

for (const file of htmlFiles) {
  const found = [...read(file).matchAll(LD_RE)];
  if (found.length) ldPages += 1;
  found.forEach((m, i) => {
    ldBlocks += 1;
    const where = `${rel(file)} 第 ${i + 1} 个 ld+json 块`;
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (err) {
      ldBad += 1;
      bad('JSON-LD', `${where} 不是合法 JSON（${err.message}）—— 爬虫会整块静默忽略`);
      return;
    }
    // 日期字段只在非零时才该输出：零值意味着这一页没有 date，@type 也该退回 WebPage
    for (const key of ['datePublished', 'dateModified']) {
      if (data[key] && /\b0001\b/.test(String(data[key]))) {
        bad('JSON-LD', `${where} 的 ${key} 是零值日期（${data[key]}），该页没有 date 时应整行不输出`);
      }
    }
    if (data['@type'] === 'BlogPosting') {
      ldPostings += 1;
      // 这三个是 Google 富结果看重的字段；首页/列表页的 Organization 与 BreadcrumbList 不在其列
      for (const key of ['headline', 'author', 'image']) {
        if (isBlank(data[key])) bad('JSON-LD', `${where}（BlogPosting）缺 ${key}`);
      }
    }
  });
}
console.log(
  `  · JSON-LD：${htmlFiles.length} 个 HTML 里 ${ldPages} 页共 ${ldBlocks} 块（BlogPosting ${ldPostings} 块），` +
    (ldBad ? `${ldBad} 块语法坏` : '全部可 JSON.parse')
);

// ---------- 结果 ----------
console.log('');
if (problems.length === 0) {
  console.log('✓ SEO 体检通过：sitemap / robots / 首页 meta / RSS / JSON-LD 均正常');
  process.exit(0);
}
for (const p of problems) console.log(`✗ ${p}`);
console.log(`\n共 ${problems.length} 项发现。`);
process.exit(1);
