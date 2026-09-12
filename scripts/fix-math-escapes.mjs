#!/usr/bin/env node
// 公式转义校验 / 自动修复：把数学区域里的 `\*` 改回裸 `*`。
//
// 用法：
//   node scripts/fix-math-escapes.mjs              # 只检查（CI 用，不改任何文件）
//   node scripts/fix-math-escapes.mjs --fix        # 原地修复 content/**/*.md
//   node scripts/fix-math-escapes.mjs --fix <路径…>
// 退出码：0 = 没问题（或已修复）；1 = 检查模式发现问题 / 读写失败
//
// 为什么不能直接用 `sed 's/\\\*/\\*/g'` 全局替换：
//   ① 正文里的 `\*` 是合法 markdown（想让星号原样显示、不被当强调符），代码块里也可能是
//      转义字符——全局替换会把它们改坏；
//   ② 只有数学区域里的 `\*` 是错的：KaTeX 没有 `\*` 这个命令，而渲染钩子
//      `throwOnError = true`，一处报错就整站构建中止（见 docs/formulas.md 第 3 节）。
//   所以本脚本先剔除围栏代码块与行内代码，再只对 `$$…$$` / `$…$` / `\(…\)` / `\[…\]`
//   内部动手；其余字节一律不碰。
//
// 本文件同时是模块：管理页（tools/admin/server.mjs）导入 fixMathEscapes()，
// 让「保存 / 新建」与「发布」共用同一份规则，不在别处再写一套实现。
//
// 已知不覆盖：四空格缩进的代码块（与列表缩进无法可靠区分，误判代价大于收益）。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const FIX_FROM = '\\*';
const FIX_TO = '*';

// 把围栏代码块与行内代码替换成等长空格。
// 长度不变 → 行列号仍然准；变成空格 → 后面的扫描看不见里面的 $ 与 \*。
export function maskCode(text) {
  const out = text.split('');

  // 围栏代码块：整行（含围栏标记行）都遮掉
  const bounds = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '\n') {
      bounds.push([start, i]);
      start = i + 1;
    }
  }
  let fence = null;
  for (const [s, e] of bounds) {
    const line = text.slice(s, e);
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      for (let i = s; i < e; i++) out[i] = ' ';
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len) fence = null;
      continue;
    }
    if (m) {
      fence = { ch: m[1][0], len: m[1].length };
      for (let i = s; i < e; i++) out[i] = ' ';
    }
  }

  // 行内代码：N 个反引号开到下一段恰好 N 个反引号（与 app.js 的 lintDollar 同口径，不跨行）
  let i = 0;
  while (i < text.length) {
    if (out[i] !== '`') {
      i++;
      continue;
    }
    let n = 0;
    while (out[i + n] === '`') n++;
    let j = i + n;
    let close = -1;
    while (j < text.length && text[j] !== '\n') {
      if (out[j] === '`') {
        let m = 0;
        while (out[j + m] === '`') m++;
        if (m === n) {
          close = j;
          break;
        }
        j += m;
        continue;
      }
      j++;
    }
    if (close === -1) {
      i += n;
      continue;
    }
    for (let k = i; k < close + n; k++) out[k] = ' ';
    i = close + n;
  }

  return out.join('');
}

// 在遮罩后的文本里找数学区域，返回 [start, end) 列表（不含定界符本身）。
// 定界符与 hugo.toml 的 passthrough 配置一致：$$…$$（可跨行）、$…$（同行）、
// \(…\)（同行）、\[…\]（可跨行）。
export function mathRegions(masked) {
  const regions = [];
  const n = masked.length;
  let i = 0;
  while (i < n) {
    const c = masked[i];
    const d = masked[i + 1];

    if (c === '\\') {
      if (d === '$' || d === '\\') {
        i += 2;
        continue;
      }
      if (d === '[') {
        const end = masked.indexOf('\\]', i + 2);
        if (end !== -1) {
          regions.push([i + 2, end]);
          i = end + 2;
          continue;
        }
      }
      if (d === '(') {
        const end = masked.indexOf('\\)', i + 2);
        const nl = masked.indexOf('\n', i + 2);
        if (end !== -1 && (nl === -1 || end < nl)) {
          regions.push([i + 2, end]);
          i = end + 2;
          continue;
        }
      }
      i += 2; // 其它 \x 整个跳过，避免把被转义的字符当定界符
      continue;
    }

    if (c === '$') {
      if (d === '$') {
        const end = masked.indexOf('$$', i + 2);
        if (end !== -1) {
          regions.push([i + 2, end]);
          i = end + 2;
          continue;
        }
        i += 2;
        continue;
      }
      let j = i + 1;
      let close = -1;
      while (j < n && masked[j] !== '\n') {
        if (masked[j] === '\\') {
          j += 2;
          continue;
        }
        if (masked[j] === '$') {
          close = j;
          break;
        }
        j++;
      }
      if (close !== -1) {
        regions.push([i + 1, close]);
        i = close + 1;
        continue;
      }
      i += 1;
      continue;
    }

    i += 1;
  }
  return regions;
}

// 区域内所有「该改的」反斜杠位置：FIX_FROM 的第一个字符的下标。
// 反斜杠自身被转义时（`\\*` = 换行符 + 普通星号）不能动，否则会造出一个新的 `\*`。
function badEscapesIn(masked, start, end) {
  const hits = [];
  for (let i = start; i + 1 < end; i++) {
    if (masked[i] !== FIX_FROM[0] || masked[i + 1] !== FIX_FROM[1]) continue;
    let bs = 0;
    for (let k = i - 1; k >= 0 && masked[k] === '\\'; k--) bs++;
    if (bs % 2 === 1) {
      i++;
      continue;
    }
    hits.push(i);
  }
  return hits;
}

/**
 * 只扫描不修改。返回按出现顺序排列的问题列表。
 * @param {string} text 正文（可含 front matter，但只有数学区域会被检查）
 * @returns {{index:number,line:number,col:number,region:string}[]}
 */
export function scanMathEscapes(text) {
  const src = text == null ? '' : String(text);
  if (!src.includes(FIX_FROM)) return [];
  const masked = maskCode(src);

  // 行首下标表，供 O(1) 换算行列号
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);

  const fixes = [];
  for (const [start, end] of mathRegions(masked)) {
    for (const index of badEscapesIn(masked, start, end)) {
      let line = lineStarts.length - 1;
      while (line > 0 && lineStarts[line] > index) line--;
      const region = src.slice(start, end).replace(/\s+/g, ' ').trim();
      fixes.push({
        index,
        line: line + 1,
        col: index - lineStarts[line] + 1,
        region: region.length > 72 ? `${region.slice(0, 72)}…` : region,
      });
    }
  }
  return fixes;
}

/**
 * 修复数学区域里的 `\*` → `*`。没有问题时原样返回。
 * @param {string} text
 * @returns {{text:string,count:number,fixes:ReturnType<typeof scanMathEscapes>}}
 */
export function fixMathEscapes(text) {
  const src = text == null ? '' : String(text);
  const fixes = scanMathEscapes(src);
  if (fixes.length === 0) return { text: src, count: 0, fixes: [] };
  let out = src;
  // 从后往前删反斜杠，前面的下标不受影响
  for (let k = fixes.length - 1; k >= 0; k--) {
    const i = fixes[k].index;
    out = out.slice(0, i) + out.slice(i + 1);
  }
  return { text: out, count: fixes.length, fixes };
}

// ---------------- CLI ----------------

export function walkMarkdown(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'public' || ent.name === 'node_modules' || ent.name.startsWith('.')) continue;
      out.push(...walkMarkdown(p));
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

function collectFiles(args) {
  const targets = args.length > 0 ? args : ['content'];
  const files = [];
  for (const t of targets) {
    if (!fs.existsSync(t)) return { error: `找不到路径：${t}` };
    files.push(...(fs.statSync(t).isDirectory() ? walkMarkdown(t) : [t]));
  }
  return { files: files.sort() };
}

function rel(p) {
  const r = path.relative(process.cwd(), p);
  return (r === '' ? p : r).split(path.sep).join('/');
}

function main(argv) {
  const useFix = argv.includes('--fix');
  const args = argv.filter((a) => !a.startsWith('-'));
  const { files, error } = collectFiles(args);
  if (error) {
    console.error(`✗ ${error}`);
    return 1;
  }

  const shown = [];
  let totalFixes = 0;
  let touched = 0;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`✗ 读取失败 ${rel(file)}：${err.message}`);
      return 1;
    }
    const fixes = scanMathEscapes(text);
    if (fixes.length === 0) continue;

    if (useFix) {
      const { text: fixed, count } = fixMathEscapes(text);
      try {
        fs.writeFileSync(file, fixed, 'utf8');
      } catch (err) {
        console.error(`✗ 写入失败 ${rel(file)}：${err.message}`);
        return 1;
      }
      totalFixes += count;
      touched += 1;
      console.log(`  ✓ 已修正 ${rel(file)}：${count} 处`);
    } else {
      totalFixes += fixes.length;
      touched += 1;
      for (const f of fixes) shown.push(`${rel(file)}:${f.line}:${f.col}  ${f.region}`);
    }
  }

  if (totalFixes === 0) {
    console.log(`✓ 公式转义检查通过：${files.length} 个文件，没有 \`${FIX_FROM}\` 误转义`);
    return 0;
  }

  if (useFix) {
    console.log(`✓ 公式转义自动修复：${touched} 个文件、${totalFixes} 处（\`${FIX_FROM}\` → \`${FIX_TO}\`）`);
    return 0;
  }

  const LIMIT = 20;
  console.log(`✗ 公式里有 ${totalFixes} 处 \`${FIX_FROM}\` 误转义（KaTeX 没有这个命令，会让 Hugo 构建失败）：`);
  for (const line of shown.slice(0, LIMIT)) console.log(`    ${line}`);
  if (shown.length > LIMIT) console.log(`    …还有 ${shown.length - LIMIT} 处，共 ${touched} 个文件`);
  console.log(`✗ 公式转义检查未通过：${touched} 个文件、${totalFixes} 处。`);
  console.log(`  自动修正：node scripts/fix-math-escapes.mjs --fix`);
  console.log(`  手改口径：数学里直接写裸 ${FIX_TO}（如 $R^*$），不要写成 ${FIX_FROM}；见 docs/formulas.md 第 3 节`);
  return 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
