#!/usr/bin/env node
// 公式真检：把 content 里每个数学区**逐条交给 Hugo 内嵌的 KaTeX 试渲染**。
//
// 用法：
//   node scripts/check-math-katex.mjs              # 检查 content/
//   node scripts/check-math-katex.mjs <路径…>
//   node scripts/check-math-katex.mjs --selftest   # 只自测机制本身（不读内容）
// 退出码：0 = 全部能渲染（或本机这套机制跑不起来，见「失败开放」）；1 = 有公式 KaTeX 解析失败
//
// 与 check-math-syntax.mjs 的分工：
//   快检（那个脚本）= 正则，不依赖 hugo，只认已知最容易踩的几类，但给的是人话改法；
//   真检（本脚本）= 用与线上**完全同一套 KaTeX**（Hugo 二进制内嵌）逐条渲染，覆盖全部语法错误
//   （缺参数、环境没闭合、\left 没 \right、命令拼错…），代价是只有 KaTeX 的原始消息。两者都阻断，快检先跑。
//
// 为什么要自己搭一个临时站点：Hugo 没有「把字符串交给 KaTeX 试解析」的命令行入口，但模板里的
// `try (transform.ToMath …)`（Hugo ≥ 0.141）能捕获错误。于是把数学区收集成 JSON，用一个最小站点
// 渲染，每条失败打一行 `MATHFAIL|下标|消息`，再映射回 文件:行:列。
// 临时站点建在系统临时目录、用 `--renderToMemory`、`--source` 指向它，所以既不写也不读仓库里的东西。
//
// 失败开放：缺 hugo、或临时站点自己没跑起来（Hugo 太老没有 try、配置解析失败…）而没有任何 MATHFAIL
// 时，只打警告并退出 0——诊断工具坏了不该拦住发布；只有确认的 KaTeX 解析错误才退出 1。
// 代价是「机制静默失效」也会退 0，所以另有 `--selftest`（CI 跑，那里 Hugo 版本是钉死的）来盯这件事。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
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

// 最小站点：一个只有 single 模板的页面，模板里对每条公式 try 一次。
const TEMPLATE = [
  '{{- range $i, $r := .Site.Data.regions -}}',
  '{{- $opts := dict "displayMode" $r.display "output" "htmlAndMathml" "throwOnError" true -}}',
  '{{- with try (transform.ToMath $r.expr $opts) -}}',
  '{{- with .Err -}}',
  '{{- warnf "MATHFAIL|%d|%s" $i (replace . "\\n" " ") -}}',
  '{{- end -}}',
  '{{- end -}}',
  '{{- end -}}',
  '',
].join('\n');

const CONFIG = [
  "baseURL = 'https://example.invalid/'",
  "title = 'math-verify'",
  "disableKinds = ['home', 'section', 'taxonomy', 'term', 'rss', 'sitemap', 'robotsTXT', '404']",
  '',
].join('\n');

// --selftest 用的片段：这些是**实测**结论（前三处坏片段就是 2026-09-12 那三个坏页的真身）。
const SELFTEST = [
  { expr: 'a+b', display: false, bad: false },
  { expr: 'R^*', display: false, bad: false },
  { expr: '\\text{中文与全角标点（，）：都在符号表内}', display: false, bad: false },
  { expr: '\\tag{1}\\ x', display: true, bad: false },
  { expr: '= (\\text{', display: false, bad: true },
  {
    expr:
      '\\text{严格档（第 5 版）：}\\ 5a+3b\\ \\ge\\ 35\\ \\text{s}\\quad\\text{（}b=0\\ \\text{时 }a\\ge7\\text{，见 §3.4）}.',
    display: true,
    bad: true,
  },
  { expr: ' 后，位于 ', display: false, bad: true },
  { expr: '\\frac{1}', display: false, bad: true },
];

// ---------------- 收集数学区 ----------------

function collectRegions(files) {
  const entries = [];
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      throw new Error(`读取失败 ${file}：${err.message}`);
    }
    const masked = maskCode(maskFrontMatter(text));
    const lineStarts = lineStartsOf(text);
    for (const [start, end, block] of mathRegions(masked)) {
      entries.push({
        expr: text.slice(start, end),
        display: !!block,
        ...positionOf(lineStarts, start),
        file,
      });
    }
  }
  return entries;
}

// 同一条公式（同模式同文本）只渲染一次，但保留全部出现位置。
function dedupe(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.display ? 'D' : 'I'}\u0000${e.expr}`;
    let rec = byKey.get(key);
    if (!rec) {
      rec = { expr: e.expr, display: e.display, locations: [] };
      byKey.set(key, rec);
    }
    rec.locations.push({ file: e.file, line: e.line, col: e.col });
  }
  return [...byKey.values()];
}

// ---------------- 真渲染 ----------------

/**
 * 用临时站点把每条记录交给 Hugo 内嵌的 KaTeX 试渲染。
 * @returns {{ran:boolean, note:string, failures:{index:number,message:string}[]}}
 */
function renderWithHugo(records) {
  let tmp;
  try {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'math-katex-'));
    fs.mkdirSync(path.join(tmp, 'content'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'layouts', '_default'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'hugo.toml'), CONFIG, 'utf8');
    fs.writeFileSync(
      path.join(tmp, 'content', 'verify.md'),
      '---\ntitle: verify\n---\n',
      'utf8',
    );
    fs.writeFileSync(path.join(tmp, 'layouts', '_default', 'single.html'), TEMPLATE, 'utf8');
    fs.writeFileSync(
      path.join(tmp, 'data', 'regions.json'),
      JSON.stringify(records.map((r) => ({ expr: r.expr, display: r.display }))),
      'utf8',
    );

    const res = spawnSync('hugo', ['--renderToMemory', '--source', tmp, '--logLevel', 'warn'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (res.error) {
      return { ran: false, note: `跑不了 hugo（${res.error.message}）`, failures: [] };
    }
    const output = `${res.stdout || ''}\n${res.stderr || ''}`;
    const seen = new Set();
    const failures = [];
    for (const line of output.split(/\r?\n/)) {
      const m = /MATHFAIL\|(\d+)\|(.*)$/.exec(line);
      if (!m) continue;
      const index = Number(m[1]);
      if (seen.has(index)) continue;
      seen.add(index);
      // 去掉 Hugo 模板链的前缀，只留 KaTeX 自己的消息
      const message = m[2].replace(/^.*?error calling ToMath:\s*/, '').trim();
      failures.push({ index, message });
    }
    if (res.status !== 0 && failures.length === 0) {
      const head = output.trim().split(/\r?\n/).slice(0, 6).join('\n        ');
      return { ran: false, note: `临时站点没跑起来（exit ${res.status}）：\n        ${head}`, failures: [] };
    }
    return { ran: true, note: '', failures };
  } catch (err) {
    return { ran: false, note: `临时站点建不起来：${err.message}`, failures: [] };
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------- CLI ----------------

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

function selftest() {
  const records = dedupe(
    SELFTEST.map((s) => ({ expr: s.expr, display: s.display, file: '(selftest)', line: 0, col: 0 })),
  );
  const { ran, note, failures } = renderWithHugo(records);
  if (!ran) {
    console.log(`✗ 公式真检自测失败：${note}`);
    return 1;
  }
  const failedIndex = new Set(failures.map((f) => f.index));
  const misses = [];
  for (let i = 0; i < records.length; i++) {
    const wantBad = SELFTEST.find(
      (s) => s.expr === records[i].expr && s.display === records[i].display,
    ).bad;
    const gotBad = failedIndex.has(i);
    if (wantBad !== gotBad) misses.push(`${wantBad ? '漏报' : '误报'}：${regionSnippet(records[i].expr, 60)}`);
  }
  if (misses.length > 0) {
    console.log(`✗ 公式真检自测失败：机制与预期不一致（Hugo/KaTeX 行为变了吗？）`);
    for (const m of misses) console.log(`    ${m}`);
    return 1;
  }
  console.log(`✓ 公式真检自测通过：${records.length} 条片段，该抓的抓住、该放的放行`);
  return 0;
}

function main(argv) {
  if (argv.includes('--selftest')) return selftest();

  const args = argv.filter((a) => !a.startsWith('-'));
  const { files, error } = collectFiles(args);
  if (error) {
    console.error(`✗ ${error}`);
    return 1;
  }

  let entries;
  try {
    entries = collectRegions(files);
  } catch (err) {
    console.error(`✗ ${err.message}`);
    return 1;
  }

  const records = dedupe(entries);
  const { ran, note, failures } = renderWithHugo(records);
  if (!ran) {
    console.log(`  ⚠ 跳过公式真检：${note}`);
    console.log(`    （只警告不阻断：诊断工具跑不起来不该拦住发布；CI 里另有 --selftest 盯这件事）`);
    return 0;
  }

  if (failures.length === 0) {
    console.log(
      `✓ 公式真检通过：${files.length} 个文件、${entries.length} 个数学区（去重后 ${records.length} 条），全部能被 KaTeX 解析`,
    );
    return 0;
  }

  console.log(
    `✗ 公式真检未通过：${failures.length} 条公式 KaTeX 解析失败（与线上同一套 KaTeX，throwOnError=true）：`,
  );
  const LIMIT = 10;
  for (const f of failures.slice(0, LIMIT)) {
    const rec = records[f.index];
    const locs = rec.locations;
    console.log(`    ${rel(locs[0].file)}:${locs[0].line}:${locs[0].col}  ${f.message}`);
    console.log(`      公式：${regionSnippet(rec.expr, 90)}`);
    if (locs.length > 1) {
      const more = locs.slice(1, 4).map((l) => `${rel(l.file)}:${l.line}`).join('、');
      console.log(`      同一公式还出现在：${more}${locs.length > 4 ? ` 等 ${locs.length - 1} 处` : ''}`);
    }
  }
  if (failures.length > LIMIT) console.log(`    …还有 ${failures.length - LIMIT} 条`);
  console.log(`  这几条一定会让 hugo 构建失败；手改口径见 docs/formulas.md 第 4 节。`);
  return 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
