#!/usr/bin/env node
// 内部链接与锚点检查：扫构建产物里的 href/src，验证站内目标文件与 #锚点是否存在。
//
// 为什么用零依赖的 Node 脚本而不是 lychee：站内坏链（改名课程目录、移动文档后 URL 变化）
// 是本站真正会踩的那类问题，而它可以在本地被完整验证；lychee 更适合查外链，
// 那条放在 .github/workflows/links.yml 里按周跑（见 AGENTS）。本站已有 Node 依赖（管理页），
// 所以这里不引入任何新依赖、也不引入第三方 Action 的供应链面。
//
// 用法：node scripts/check-links.mjs [输出目录] [--no-anchors]
//   默认输出目录 public。--no-anchors 只查文件是否存在，跳过锚点校验。
// 退出码：0 = 无坏链；1 = 有坏链（锚点问题只警告，不阻断）
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, sep, extname } from 'node:path';

const argv = process.argv.slice(2);
const OUT = argv.find((a) => !a.startsWith('--')) || 'public';
const CHECK_ANCHORS = !argv.includes('--no-anchors');

if (!existsSync(OUT)) {
  console.error(`✗ 找不到输出目录 ${OUT}，先跑一次构建（hugo --minify --gc）`);
  process.exit(1);
}

// baseURL 的子路径（本站是 /my-blog/）：站内绝对链接都带这个前缀，
// 访问者从 /foo/ 这种不带前缀的绝对链接会 404，所以也要报出来。
let basePath = '';
try {
  const cfg = readFileSync('hugo.toml', 'utf8');
  const m = cfg.match(/^baseURL\s*=\s*['"]([^'"]+)['"]/m);
  if (m) basePath = m[1].replace(/^[a-z]+:\/\/[^/]+/i, '').replace(/\/+$/, '');
} catch {
  /* 没有 hugo.toml 就按根路径处理 */
}

function walkHtml(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkHtml(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

function decode(s) {
  let v = s;
  try {
    v = decodeURIComponent(v);
  } catch {
    /* 保留原样 */
  }
  return v
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

// 收集页面里的 id（供锚点校验）；只读一次并缓存
const idCache = new Map();
function idsOf(file) {
  if (idCache.has(file)) return idCache.get(file);
  const ids = new Set();
  let html = '';
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    idCache.set(file, ids);
    return ids;
  }
  const cleaned = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  for (const m of cleaned.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const raw = m[1] ?? m[2] ?? m[3] ?? '';
    ids.add(decode(raw));
  }
  for (const m of cleaned.matchAll(/<a\b[^>]*\sname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    ids.add(decode(m[1] ?? m[2] ?? m[3] ?? ''));
  }
  idCache.set(file, ids);
  return ids;
}

const pages = walkHtml(OUT);
const broken = [];
const badAnchors = [];
const badAbsolute = [];
let checked = 0;
let external = 0;

for (const page of pages) {
  const raw = readFileSync(page, 'utf8');
  // 去掉 script/style：内联脚本里的字符串可能含 href=，会造成误报
  const html = raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const pageUrlDir = '/' + relative(OUT, dirname(page)).split(sep).join('/');
  const pageRel = relative(OUT, page).split(sep).join('/');

  for (const m of html.matchAll(/\s(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!url) continue;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) {
      external++;
      continue;
    }
    if (url.startsWith('#')) {
      const frag = decode(url.slice(1));
      if (CHECK_ANCHORS && frag && !idsOf(page).has(frag)) {
        badAnchors.push({ page: pageRel, url });
      }
      continue;
    }

    const hashAt = url.indexOf('#');
    const frag = hashAt >= 0 ? decode(url.slice(hashAt + 1)) : '';
    let pathOnly = hashAt >= 0 ? url.slice(0, hashAt) : url;
    if (pathOnly === '') pathOnly = pageUrlDir + '/';

    let abs;
    if (pathOnly.startsWith('/')) {
      if (basePath && (pathOnly === basePath || pathOnly.startsWith(basePath + '/'))) {
        abs = pathOnly.slice(basePath.length) || '/';
      } else if (!basePath) {
        abs = pathOnly;
      } else {
        // 站内绝对链接但没带 baseURL 子路径 —— 部署到 /my-blog/ 下会 404
        badAbsolute.push({ page: pageRel, url, path: decode(pathOnly) });
        continue;
      }
    } else {
      const resolvedDir = relative(OUT, resolve(dirname(page), decode(pathOnly)));
      abs = '/' + resolvedDir.split(sep).join('/');
    }
    abs = decode(abs);
    checked++;

    const rel = abs.replace(/^\/+/, '');
    const candidates = [];
    if (abs.endsWith('/')) candidates.push(join(OUT, rel, 'index.html'));
    else if (extname(rel)) candidates.push(join(OUT, rel));
    else {
      candidates.push(join(OUT, rel, 'index.html'), join(OUT, rel), join(OUT, rel + '.html'));
    }

    const hit = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    if (!hit) {
      // 目录形式存在但首页缺失时，也把情况说清楚
      broken.push({ page: pageRel, url, path: decode(abs) });
      continue;
    }
    if (CHECK_ANCHORS && frag && !idsOf(hit).has(frag)) {
      badAnchors.push({ page: pageRel, url });
    }
  }
}

const show = (list, limit = 40) => {
  for (const it of list.slice(0, limit)) {
    console.log(`     ${it.page}\n       → ${it.url}`);
  }
  if (list.length > limit) console.log(`     … 另有 ${list.length - limit} 处`);
};

console.log(`▸ 内部链接检查：${pages.length} 个页面，检查 ${checked} 条站内链接（跳过外链 ${external} 条）`);

if (badAbsolute.length) {
  console.log(`\n  ✗ ${badAbsolute.length} 条绝对链接缺少 baseURL 子路径「${basePath}」，部署后会 404：`);
  show(badAbsolute);
}
if (broken.length) {
  console.log(`\n  ✗ ${broken.length} 条坏链（目标文件不存在）：`);
  show(broken);
}
if (badAnchors.length) {
  console.log(`\n  ⚠ ${badAnchors.length} 处锚点找不到对应 id（改名标题会让目录/分享链接失效）：`);
  show(badAnchors, 20);
}

if (!badAbsolute.length && !broken.length && !badAnchors.length) {
  console.log('\n✓ 链接检查通过：没有坏链，锚点全部命中');
  process.exit(0);
}
if (!badAbsolute.length && !broken.length) {
  console.log('\n✓ 没有坏链（锚点问题只警告，不阻断）');
  process.exit(0);
}
console.log('\n✗ 存在坏链，必须修复。');
process.exit(1);
