#!/usr/bin/env node
// 公式内容预检：数学区里那些「必然让 KaTeX 报错、又没法自动修」的写法。
//
// 用法：
//   node scripts/check-math-syntax.mjs              # 只检查 content/
//   node scripts/check-math-syntax.mjs <路径…>
// 退出码：0 = 通过；1 = 发现问题 / 读写失败
//
// 为什么需要它：渲染钩子是 throwOnError = true，下面几类写法一处就让整站构建中止；而 Hugo 为这类
// 错误报出的 `文件:行:列` 是**模板渲染位置、不是公式位置**——实测问题二/问题三两页都报 19:13，
// 真缺陷在 107 行与 160 行，定位成本全落在人身上。本脚本给的是公式本体的行列号。
//
// 检查项（都会让构建失败，所以阻断；都不做自动修改，因为语义上无法机械替换）：
//   ① 数学区里 { } 不配对 —— 几乎总是「公式里又写了一个 $」把区域提前截断的指纹
//   ② 一行里 $ 的个数是奇数而该行又有数学区 —— 同样指向「数学区里嵌了 $」
//   ③ 数学区里出现 §      —— §(U+00A7) 不在 KaTeX 符号表内，包在 \text{} 里也照样报错
//   ④ 数学区里出现圈号 ①–⑳ —— 同上，要写成 \textcircled{N}
// 区域识别与遮罩（围栏代码块、行内代码）复用 scripts/fix-math-escapes.mjs，不再写第二套。
//
// 已知不覆盖：$ 出现在别处的畸形写法（例如 `$$\text{a$b}$$` 里那个多余的 $）、四空格缩进代码块。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { maskCode, mathRegions, walkMarkdown } from './fix-math-escapes.mjs';

const CIRCLED = /[\u2460-\u2473]/; // ①…⑳

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

function lineStartsOf(text) {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') out.push(i + 1);
  return out;
}

function positionOf(lineStarts, index) {
  let line = lineStarts.length - 1;
  while (line > 0 && lineStarts[line] > index) line--;
  return { line: line + 1, col: index - lineStarts[line] + 1 };
}

function snippet(region) {
  const s = region.replace(/\s+/g, ' ').trim();
  return s.length > 72 ? `${s.slice(0, 72)}…` : s;
}

/**
 * 只扫描不修改。
 * @param {string} text 正文（可含 front matter，只有数学区域会被检查）
 * @returns {{index:number,line:number,col:number,kind:string,message:string,region:string}[]}
 */
export function scanMathSyntax(text) {
  const src = text == null ? '' : String(text);
  if (!src.includes('$') && !src.includes('\\(') && !src.includes('\\[')) return [];

  const masked = maskCode(src);
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
        region: snippet(region),
      });
    }

    for (let i = 0; i < region.length; i++) {
      const ch = region[i];
      if (ch === '§') {
        findings.push({
          index: start + i,
          ...positionOf(lineStarts, start + i),
          kind: 'section',
          message: '数学区里不能写 §（不在 KaTeX 符号表内，包在 \\text{} 里也会报错）：移到公式外，或写成「第 3.4 节」',
          region: snippet(region),
        });
      } else if (CIRCLED.test(ch)) {
        findings.push({
          index: start + i,
          ...positionOf(lineStarts, start + i),
          kind: 'circled',
          message: `数学区里不能写圈号 ${ch}（不在 KaTeX 符号表内）：写成 \\textcircled{${ch.codePointAt(0) - 0x2460 + 1}}`,
          region: snippet(region),
        });
      }
    }
  }

  // 逐行数未转义的 $（在遮罩后的文本上数，所以代码块/行内代码里的 $ 不算）。
  // 只有「该行确实有数学区」时才看奇偶，避免把 front matter 或散文里的单个 $ 误报。
  const dollarsOnLine = new Map();
  let lineNo = 1;
  for (let i = 0; i < masked.length; i++) {
    const c = masked[i];
    if (c === '\n') {
      lineNo += 1;
      continue;
    }
    if (c === '\\') {
      const next = masked[i + 1];
      if (next !== undefined && next !== '\n') i += 1;
      continue;
    }
    if (c === '$') dollarsOnLine.set(lineNo, (dollarsOnLine.get(lineNo) || 0) + 1);
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
  section: '§',
  circled: '圈号',
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
  console.log(`  这三类都不会被自动修复，手改口径见 docs/formulas.md 第 4 节。`);
  return 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
