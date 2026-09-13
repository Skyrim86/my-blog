#!/usr/bin/env node
// 公式转义校验 / 自动修复：把数学区里会被 KaTeX 判错的写法改对。
//
// 用法：
//   node scripts/fix-math-escapes.mjs              # 只检查（CI 用，不改任何文件）
//   node scripts/fix-math-escapes.mjs --fix        # 原地修复 content/**/*.md
//   node scripts/fix-math-escapes.mjs --fix <路径…>
//   node scripts/fix-math-escapes.mjs --selftest   # 自测规则本身（不读内容）
// 退出码：0 = 没问题（或已修复）；1 = 检查模式发现问题 / 读写失败
//
// 三条规则（都只在数学区内生效，定义见下方 RULES）：
//   `\*` → `*`                KaTeX 没有 `\*` 这个命令
//   `§` → `\S`                KaTeX 的 `\S` 就是 §；紧跟字母时写成 `\S{}`
//   圈号 ①–⑳ → `\text{\textcircled{N}}`
//
// 双反斜杠（`\\theta` 这类 JSON 双重转义）**不在这里修**：`\\` 在 LaTeX 里是合法的换行符，
// 只能"改完试渲染通过才敢写"，那部分在 scripts/check-math-katex.mjs --fix。
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

// 机械可证的三条规则。共同前提：只在数学区里生效（区域由 mathRegions 给出，已剔除
// 围栏/行内代码与 front matter），三条规则互不重叠。
// 每条规则返回 {index, remove, insert, rule}：从 index 起删掉 remove 个字符、插入 insert。
//
// 为什么必须限定在数学区：散文里的 `\*`（想让星号原样显示）与 `§3.4` 都是合法的，
// 全局替换会把它们改坏；而 KaTeX 的 throwOnError=true，数学区里一处错就整站构建失败。
const RULES = [
  {
    rule: '\\* → *',
    // KaTeX 没有 `\*` 这个命令。`\\*`（换行符 + 普通星号）不能动，靠反斜杠奇偶判断。
    scan(masked, start, end) {
      const hits = [];
      for (let i = start; i + 1 < end; i++) {
        if (masked[i] !== '\\' || masked[i + 1] !== '*') continue;
        let bs = 0;
        for (let k = i - 1; k >= 0 && masked[k] === '\\'; k--) bs++;
        if (bs % 2 === 1) {
          i++;
          continue;
        }
        hits.push({ index: i, remove: 1, insert: '', rule: '\\* → *' });
      }
      return hits;
    },
  },
  {
    rule: '§ → \\S',
    // KaTeX 里 `\S` 的定义就是 §（math 与 text 两种模式都有），故 §3.4 → \S3.4 视觉不变。
    // 紧跟 ASCII 字母时必须补 `{}`：否则 `\SA` 会被并成一个未定义命令。
    scan(masked, start, end) {
      const hits = [];
      for (let i = start; i < end; i++) {
        if (masked[i] !== '\u00a7') continue;
        const next = masked[i + 1];
        const guard = next !== undefined && /[A-Za-z]/.test(next) ? '{}' : '';
        hits.push({ index: i, remove: 1, insert: `\\S${guard}`, rule: '§ → \\S' });
      }
      return hits;
    },
  },
  {
    rule: '圈号 → \\text{\\textcircled{N}}',
    // 圈号 ①–⑳ 不在 KaTeX 符号表内。`\textcircled` 是**文本模式**的 accent，直接写在数学区里会报
    // `LaTeX's accent \textcircled works only in text mode`（实测），所以必须包一层 `\text{}`。
    scan(masked, start, end) {
      const hits = [];
      for (let i = start; i < end; i++) {
        const code = masked.codePointAt(i);
        if (code < 0x2460 || code > 0x2473) continue;
        const n = code - 0x2460 + 1;
        hits.push({
          index: i,
          remove: 1,
          insert: `\\text{\\textcircled{${n}}}`,
          rule: '圈号 → \\text{\\textcircled{N}}',
        });
      }
      return hits;
    },
  },
];

const CIRCLED_ANY = /[\u2460-\u2473]/;

// 三个触发字符一个都没有，就不必做 maskCode + mathRegions（大文件的性能保护）。
function hasFixTrigger(src) {
  return src.includes('\\') || src.includes('\u00a7') || CIRCLED_ANY.test(src);
}

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

// 把 front matter（文件开头的 --- 块）替换成等长空格。
// YAML 不走 markdown 管线，所以里面的 $ 不该被当成公式、\* 也不该被当成数学区里的误转义。
// **长度不变、换行保留**：前者保证下标仍对得上，后者保证「数 \n」得到的行号也还准
// （曾经漏了后者：换行一起被涂成空格，于是按行计数的检查报出了偏移的行号）。
export function maskFrontMatter(text) {
  const firstNl = text.indexOf('\n');
  const firstLine = (firstNl === -1 ? text : text.slice(0, firstNl)).replace(/^\uFEFF/, '').trim();
  if (firstLine !== '---') return text;

  const out = text.split('');
  let offset = firstNl + 1;
  while (offset <= text.length) {
    const nl = text.indexOf('\n', offset);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(offset, lineEnd).trim();
    if (line === '---' || line === '...') {
      for (let i = 0; i < lineEnd; i++) if (out[i] !== '\n') out[i] = ' ';
      return out.join('');
    }
    if (nl === -1) break;
    offset = nl + 1;
  }
  return text; // 没找到结束行：不遮罩，交给 Hugo 去报错
}

// 在遮罩后的文本里找数学区域，返回 [start, end, block] 列表（不含定界符本身）。
// 定界符与 hugo.toml 的 passthrough 配置一致：$$…$$（可跨行）、$…$（同行）、
// \(…\)（同行）、\[…\]（可跨行）。block 表示「display 模式」：渲染钩子按它设 displayMode，
// 真 KaTeX 预检（check-math-katex.mjs）也必须跟着设，否则个别命令（如 \tag）的合法性会判错。
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
          regions.push([i + 2, end, true]);
          i = end + 2;
          continue;
        }
      }
      if (d === '(') {
        const end = masked.indexOf('\\)', i + 2);
        const nl = masked.indexOf('\n', i + 2);
        if (end !== -1 && (nl === -1 || end < nl)) {
          regions.push([i + 2, end, false]);
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
          regions.push([i + 2, end, true]);
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
        regions.push([i + 1, close, false]);
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

// 行首下标表，供 O(1) 换算行列号（三个公式脚本共用这一份实现）。
export function lineStartsOf(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}

// 把字符下标换算成 1-based 的行列号。
export function positionOf(lineStarts, index) {
  let line = lineStarts.length - 1;
  while (line > 0 && lineStarts[line] > index) line--;
  return { line: line + 1, col: index - lineStarts[line] + 1 };
}

// 数学区域的一行摘要，报错时让人认得出是哪一处公式。
export function regionSnippet(region, max = 72) {
  const s = region.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// 收集一份正文里所有机械可证的修复编辑（已带行列号与所属规则名）。
function collectEdits(src) {
  const masked = maskCode(maskFrontMatter(src));
  const lineStarts = lineStartsOf(src);
  const edits = [];
  for (const [start, end] of mathRegions(masked)) {
    const region = regionSnippet(src.slice(start, end));
    for (const { scan } of RULES) {
      for (const e of scan(masked, start, end)) {
        edits.push({ ...e, ...positionOf(lineStarts, e.index), region });
      }
    }
  }
  edits.sort((a, b) => a.index - b.index);
  return edits;
}

// 对外只暴露位置与规则，不泄露内部的删/插细节。
const asFinding = ({ index, rule, line, col, region }) => ({ index, rule, line, col, region });

/**
 * 只扫描不修改。返回按出现顺序排列的问题列表。
 * @param {string} text 正文（可含 front matter，但只有数学区域会被检查）
 * @returns {{index:number,rule:string,line:number,col:number,region:string}[]}
 */
export function scanMathEscapes(text) {
  const src = text == null ? '' : String(text);
  if (!hasFixTrigger(src)) return [];
  return collectEdits(src).map(asFinding);
}

/**
 * 修复数学区域里会被 KaTeX 判错的写法：`\*` → `*`、`§` → `\S`、圈号 → `\textcircled{N}`。
 * 没有问题时原样返回。
 * @param {string} text
 * @returns {{text:string,count:number,fixes:ReturnType<typeof scanMathEscapes>}}
 */
export function fixMathEscapes(text) {
  const src = text == null ? '' : String(text);
  const edits = hasFixTrigger(src) ? collectEdits(src) : [];
  if (edits.length === 0) return { text: src, count: 0, fixes: [] };
  let out = src;
  // 从后往前改，前面的下标不受影响
  for (let k = edits.length - 1; k >= 0; k--) {
    const e = edits[k];
    out = out.slice(0, e.index) + e.insert + out.slice(e.index + e.remove);
  }
  return { text: out, count: edits.length, fixes: edits.map(asFinding) };
}

/**
 * 对**已知是数学区**的一段内容套用机械规则（不再做定界符识别）。
 * 给真检的「验证后才写」修复用——它拿到的 expr 本来就取自数学区，不必也不能再包一层 `$`。
 * @param {string} expr 数学区内容
 * @returns {{text:string,count:number}}
 */
export function fixMathRegion(expr) {
  const src = expr == null ? '' : String(expr);
  if (!hasFixTrigger(src)) return { text: src, count: 0 };
  const edits = [];
  for (const { scan } of RULES) edits.push(...scan(src, 0, src.length));
  if (edits.length === 0) return { text: src, count: 0 };
  edits.sort((a, b) => a.index - b.index);
  let out = src;
  for (let k = edits.length - 1; k >= 0; k--) {
    const e = edits[k];
    out = out.slice(0, e.index) + e.insert + out.slice(e.index + e.remove);
  }
  return { text: out, count: edits.length };
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

// 自测：纯字符串用例，不依赖 hugo。盯住"该改的改、不该碰的不碰"这两面。
const SELFTEST = [
  { name: '数学里的 \\* 改回裸 *', input: '设 $R\\*$ 为', want: '设 $R*$ 为' },
  { name: '数学里的 § 改成 \\S', input: '见 $§3.4$', want: '见 $\\S3.4$' },
  { name: '§ 紧跟字母时补 {}', input: '$§A$', want: '$\\S{}A$' },
  { name: '圈号改成 \\text{\\textcircled{N}}', input: '$①$', want: '$\\text{\\textcircled{1}}$' },
  { name: '散文里的 § 不动', input: '见 §3.4 节', want: '见 §3.4 节' },
  { name: '散文里的圈号不动', input: '① 见正文', want: '① 见正文' },
  { name: '行内代码里的 \\* 不动', input: '写法是 `\\*` 这样', want: '写法是 `\\*` 这样' },
  { name: '散文里的 \\* 转义不动', input: '\\*强调\\*', want: '\\*强调\\*' },
  { name: '数学里已是 \\\\* 的不动', input: '$a\\\\*b$', want: '$a\\\\*b$' },
];

function selftest() {
  const bad = [];
  for (const c of SELFTEST) {
    const got = fixMathEscapes(c.input).text;
    if (got !== c.want) bad.push({ c, got });
  }
  if (bad.length > 0) {
    console.log(`✗ 公式转义自测失败：${bad.length} / ${SELFTEST.length} 条与预期不一致`);
    for (const { c, got } of bad) {
      console.log(`    ${c.name}`);
      console.log(`      输入：${c.input}`);
      console.log(`      期望：${c.want}`);
      console.log(`      实际：${got}`);
    }
    return 1;
  }
  console.log(`✓ 公式转义自测通过：${SELFTEST.length} 条用例，该改的改、不该碰的不碰`);
  return 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();

  const useFix = argv.includes('--fix');
  const args = argv.filter((a) => !a.startsWith('-'));
  const { files, error } = collectFiles(args);
  if (error) {
    console.error(`✗ ${error}`);
    return 1;
  }

  const shown = [];
  const byRule = new Map();
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
    for (const f of fixes) byRule.set(f.rule, (byRule.get(f.rule) || 0) + 1);

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
      for (const f of fixes) shown.push(`${rel(file)}:${f.line}:${f.col}  [${f.rule}] ${f.region}`);
    }
  }

  if (totalFixes === 0) {
    console.log(`✓ 公式转义检查通过：${files.length} 个文件，数学区里没有要修的写法`);
    return 0;
  }

  if (useFix) {
    console.log(`✓ 公式转义自动修复：${touched} 个文件、${totalFixes} 处`);
    for (const [rule, n] of byRule) console.log(`    ${rule}：${n} 处`);
    return 0;
  }

  const LIMIT = 20;
  console.log(`✗ 数学区里有 ${totalFixes} 处会被 KaTeX 判错的写法（throwOnError=true，一处就让整站构建失败）：`);
  for (const line of shown.slice(0, LIMIT)) console.log(`    ${line}`);
  if (shown.length > LIMIT) console.log(`    …还有 ${shown.length - LIMIT} 处，共 ${touched} 个文件`);
  console.log(`✗ 公式转义检查未通过：${touched} 个文件、${totalFixes} 处。`);
  console.log(`  自动修正：node scripts/fix-math-escapes.mjs --fix`);
  console.log(`  手改口径见 docs/formulas.md 第 3 节与第 4.2 节`);
  return 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
