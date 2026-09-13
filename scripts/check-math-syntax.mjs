#!/usr/bin/env node
// 公式内容预检：数学区里那些「必然让 KaTeX 报错、且真检只能给出原始消息」的写法。
//
// 用法：
//   node scripts/check-math-syntax.mjs              # 只检查 content/
//   node scripts/check-math-syntax.mjs <路径…>
// 退出码：0 = 通过；1 = 发现问题 / 读写失败
//
// 为什么需要它：渲染钩子是 throwOnError = true，下面几类写法一处就让整站构建中止；而 Hugo 为这类
// 错误报出的 `文件:行:列` 是**模板渲染位置、不是公式位置**——实测三个坏页都报 19:13，真缺陷在
// 107/109/160 行，定位成本全落在人身上。本脚本给的是公式本体的行列号；它只覆盖下面几类，
// **全部语法错误由 check-math-katex.mjs（真检）兜底**。
//
// 检查项（都会让构建失败，所以阻断）：
//   ① 数学区里 { } 不配对 —— 几乎总是「公式里又写了一个 $」把区域提前截断的指纹
//   ② 一行里 $ 的个数是奇数而该行又有数学区 —— 同样指向「数学区里嵌了 $」
//   ③ 数学区里连续多个反斜杠后紧跟字母 —— JSON 双重转义（`\\theta` 这类）的指纹；它还可能
//      "侥幸能解析"（`\\` 被当成换行符）而不被真检抓到，所以必须在这里报
//
// §（U+00A7）与圈号 ①–⑳ 这两类**已能自动修复**（`\S` / `\text{\textcircled{N}}`，都经 Hugo
// 实测），改由 scripts/fix-math-escapes.mjs 报告与修改，这里不再重复报一遍。
//
// 区域识别、遮罩与行列号换算复用 scripts/fix-math-escapes.mjs，不再写第二套。
//
// 已知不覆盖：$ 出现在别处的畸形写法（例如 `$$\text{a$b}$$` 里那个多余的 $）、四空格缩进代码块。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
  lineStartsOf,
  maskCode,
  maskFrontMatter,
  mathRegions,
  positionOf,
  regionSnippet,
  walkMarkdown,
} from './fix-math-escapes.mjs';

// 按 LaTeX 口径数花括号：\{ \} 与 \x 都跳过。
function braceBalance(region) {
  let bal = 0;
  for (let i = 0; i < region.length; i++) {
    if (region[i] === '\\') {
      i++;
      continue;
    }
    if (region[i] === '{') bal++;
    else if (region[i] === '}') bal--;
  }
  return bal;
}

/**
 * 只扫描不修改。
 * @param {string} text 正文（可含 front matter，只有数学区域会被检查）
 * @returns {{index:number,line:number,col:number,kind:string,message:string,region:string}[]}
 */
export function scanMathSyntax(text) {
  const src = text == null ? '' : String(text);
  if (!src.includes('$') && !src.includes('\\(') && !src.includes('\\[')) return [];

  const masked = maskCode(maskFrontMatter(src));
  const lineStarts = lineStartsOf(src);
  const findings = [];

  const regionsOnLine = new Set();
  for (const [start, end] of mathRegions(masked)) {
    const region = src.slice(start, end);
    regionsOnLine.add(positionOf(lineStarts, start).line);

    const bal = braceBalance(region);
    if (bal !== 0) {
      findings.push({
        index: start,
        ...positionOf(lineStarts, start),
        kind: 'brace',
        message: `数学区里 { } 不配对（差 ${bal}）——最常见的原因是公式里又写了一个 $，把区域提前截断了`,
        region: regionSnippet(region),
      });
    }

    // 双重转义指纹：连续 ≥2 个反斜杠后紧跟 ASCII 字母。
    // 合法的 `\\`（display 里的换行、矩阵里的分行）后面跟的是空白 / `&` / `[`，不会是字母；
    // 而 `\\theta` 这种，KaTeX 会把 `\\` 当换行符、把后面的命令拆散——运气好报错，运气不好
    // 静默渲染成"换行 + 文本"，真检也未必抓得到，所以在这里拦。一处公式只报一条（带处数）。
    let bsCount = 0;
    for (let i = 0; i + 1 < region.length; i++) {
      if (region[i] !== '\\' || region[i + 1] !== '\\') continue;
      let j = i;
      while (j < region.length && region[j] === '\\') j++;
      const next = region[j];
      if (next !== undefined && /[A-Za-z]/.test(next)) bsCount++;
      i = j - 1;
    }
    if (bsCount > 0) {
      findings.push({
        index: start,
        ...positionOf(lineStarts, start),
        kind: 'doublebs',
        message:
          `疑似 JSON 双重转义：这个数学区里有 ${bsCount} 处「连续反斜杠 + 字母」，` +
          `KaTeX 会把反斜杠对当成换行符而拆散命令。去掉一层转义即可` +
          `（本地跑 node scripts/check-math-katex.mjs --fix 会验证后自动修好）；` +
          `若你确实想要换行/分行，请在反斜杠对后面留一个空格`,
        region: regionSnippet(region),
      });
    }
  }

  // 逐行数未转义的 $（在遮罩后的文本上数，所以代码块/行内代码里的 $ 不算）。
  // 行号一律用 positionOf(index) 推，不要另外手数 \n——两份计数一旦不同步就会报出偏移的行号
  // （曾经踩过：遮罩把换行涂掉之后，手数的行号与下标推的行号差了两行）。
  // 只有「该行确实有数学区」时才看奇偶，避免把 front matter 或散文里的单个 $ 误报。
  const dollarsOnLine = new Map();
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '\\') {
      const next = masked[i + 1];
      if (next !== undefined && next !== '\n') i += 1;
      continue;
    }
    if (c === '$') {
      const { line } = positionOf(lineStarts, i);
      dollarsOnLine.set(line, (dollarsOnLine.get(line) || 0) + 1);
    }
  }
  const braceLines = new Set(findings.filter((f) => f.kind === 'brace').map((f) => f.line));
  for (const [line, count] of dollarsOnLine) {
    if (count % 2 === 0 || !regionsOnLine.has(line) || braceLines.has(line)) continue;
    const index = lineStarts[line - 1];
    findings.push({
      index,
      line,
      col: 1,
      kind: 'dollar',
      message: `本行的 $ 有 ${count} 个（奇数）而本行又有数学区——多半是公式里又嵌了一个 $，区域会被提前截断`,
      region: '',
    });
  }

  return findings.sort((a, b) => a.index - b.index);
}

// ---------------- CLI ----------------

const KIND_LABEL = {
  brace: '嵌套 $ / 括号不配对',
  dollar: '本行 $ 数为奇数',
  doublebs: '疑似双重转义',
};

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
  const args = argv.filter((a) => !a.startsWith('-'));
  const { files, error } = collectFiles(args);
  if (error) {
    console.error(`✗ ${error}`);
    return 1;
  }

  const entries = [];
  let touched = 0;

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      console.error(`✗ 读取失败 ${rel(file)}：${err.message}`);
      return 1;
    }
    const hits = scanMathSyntax(text);
    if (hits.length === 0) continue;
    touched += 1;
    for (const h of hits) {
      entries.push({
        header: `${rel(file)}:${h.line}:${h.col}  [${KIND_LABEL[h.kind]}] ${h.message}`,
        detail: h.region ? `      区域：${h.region}` : '',
      });
    }
  }

  if (entries.length === 0) {
    console.log(`✓ 公式内容预检通过：${files.length} 个文件，数学区里没有会让 KaTeX 报错的写法`);
    return 0;
  }

  const LIMIT = 10;
  console.log(
    `✗ 公式内容预检未通过：${touched} 个文件、${entries.length} 处（throwOnError=true，一处就让整站构建失败）：`,
  );
  for (const e of entries.slice(0, LIMIT)) {
    console.log(`    ${e.header}`);
    if (e.detail) console.log(e.detail);
  }
  if (entries.length > LIMIT) console.log(`    …还有 ${entries.length - LIMIT} 处，共 ${touched} 个文件`);
  console.log(`  双重转义可自动修复：node scripts/check-math-katex.mjs --fix（改完试渲染通过才写盘）`);
  console.log(`  § 与圈号由 node scripts/fix-math-escapes.mjs --fix 自动修；手改口径见 docs/formulas.md 第 4 节。`);
  return 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
