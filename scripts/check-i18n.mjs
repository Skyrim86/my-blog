#!/usr/bin/env node
// 模板 i18n 键守卫：layouts 里 `i18n "键"` 引用的每个**字面量**键，都必须在 i18n/zh.toml
// （或主题自带译文）里存在，且 zh.toml 里的值非空。
//
// ---- 为什么需要它 ----
// Hugo 的 i18n 对缺失键**不报错**：`{{ i18n "typo" }}` 构建全绿、页面上静默渲染成空串。
// 键改名/删键/拼错的那一刻，坏的只有页面观感 —— 正是本仓库最怕的那类失败
// （docs/traps.md 的风格）。卡组那几个模板此前有一条「i18n 整串绑定守卫」（check-deck.mjs 内），
// 但 baseof.html / 404.html / extend_head.html 等处引用的键（skipToContent、notFoundHint、
// searchNoScript …）没有任何东西检查，2026-09-26 补上这一条。
//
// ---- 判据 ----
//   1. 扫 layouts/** 全部文件（.html 与 index.json 这类模板都算），先剥掉 Hugo 注释
//      {{/* … */}} 与 HTML 注释 <!-- … -->（注释里的散文常提到 i18n，不算调用）；
//      剥除时按原行数补换行，行号不漂移。
//   2. `i18n "x"` / `i18n \`x\`` → 字面量键：必须可解析（zh.toml ∪ 主题 themes/*/i18n/）。
//      只在 zh.toml 里的键额外查「值非空」（主题译文的值是主题的事，不查）。
//   3. 其余形式（`i18n (index …)`、`i18n $var`）→ 动态键：**不判失败**，只列出调用点 ——
//      这类键没法静态定值（已知一处：_partials/type-label.html 的 relatedType*）。
//   4. 反向不查（zh.toml 里有键没人引用不算错）：键可能被主题模板用、或故意覆盖主题译文，
//      静态分不清「没人用」与「替主题用」。
//
// 用法：node scripts/check-i18n.mjs
// 退出码：0 = 无缺失/空值；1 = 有（或 i18n/zh.toml 读不出来）
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const LAYOUTS = 'layouts';
const SITE_TOML = 'i18n/zh.toml';
const THEME_I18N = 'themes';

if (!existsSync(LAYOUTS) || !existsSync(SITE_TOML)) {
  console.error(`✗ 找不到 ${LAYOUTS}/ 或 ${SITE_TOML} —— 这不是博客仓库根？`);
  process.exit(1);
}

// ---------- 注释剥除（保留行号） ----------
function stripComments(text) {
  const keepNl = (m) => '\n'.repeat((m.match(/\n/g) || []).length);
  return text
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, keepNl)
    .replace(/<!--[\s\S]*?-->/g, keepNl);
}

// ---------- 模板扫描 ----------
function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// 调用形态：i18n  后面紧跟 " / ` → 字面量；其余 → 动态。
// 前瞻排除 data-i18n 这类属性名（连字符也算词内）。
const CALL_RE = /(?<![A-Za-z0-9_-])i18n\s+/g;

const files = walk(LAYOUTS);
const missing = new Map(); // 键 → [file:line, …]
const dynamic = [];        // { where, expr }
const themeOnly = new Set();

// ---------- 站点 zh.toml：键 + 值非空 ----------
const siteText = readFileSync(SITE_TOML, 'utf8').replace(/\r\n/g, '\n');
const siteKeys = new Set([...siteText.matchAll(/^\s*\[([^\]\n]+)\]\s*$/gm)].map((m) => m[1].trim()));
if (!siteKeys.size) {
  console.error(`✗ ${SITE_TOML} 里一个 [键] 都没解析到 —— 解析规则失效，本次结果不可信。`);
  process.exit(1);
}
// 每个键块里只要有任何一个非空字符串值就算非空（one/other 复数块取其一即可）
const siteEmpty = new Set();
{
  const parts = siteText.split(/^\s*\[([^\]\n]+)\]\s*$/m); // [前言, key1, body1, key2, body2, …]
  for (let i = 1; i + 1 < parts.length; i += 2) {
    const key = parts[i].trim();
    const body = parts[i + 1];
    const vals = [...body.matchAll(/^\s*[A-Za-z0-9_]+\s*=\s*"([^"]*)"/gm)].map((m) => m[1]);
    if (!vals.length || vals.every((v) => v.trim() === '')) siteEmpty.add(key);
  }
}

// ---------- 主题译文（存在性参考，不查空值） ----------
const themeKeys = new Set();
if (existsSync(THEME_I18N)) {
  for (const f of walk(THEME_I18N)) {
    if (!/i18n[/\\].*\.(toml|yaml|yml|json)$/.test(f)) continue;
    const t = readFileSync(f, 'utf8');
    for (const m of t.matchAll(/^\s*-\s*id:\s*([^\s#]+)/gm)) themeKeys.add(m[1]); // PaperMod 的 - id: 列表
    for (const m of t.matchAll(/^\s*\[([^\]\n]+)\]\s*$/gm)) themeKeys.add(m[1].trim()); // toml 形态
  }
}

// ---------- 逐文件提取 ----------
let callCount = 0;
for (const f of files) {
  const rel = relative('.', f).split(sep).join('/');
  const text = stripComments(readFileSync(f, 'utf8'));
  CALL_RE.lastIndex = 0;
  for (const m of text.matchAll(CALL_RE)) {
    callCount++;
    const rest = text.slice(m.index + m[0].length);
    const q = rest[0];
    const where = `${rel}:${lineOf(text, m.index)}`;
    if (q === '"' || q === '`') {
      const end = rest.indexOf(q, 1);
      const key = end === -1 ? rest.slice(1) : rest.slice(1, end);
      if (!key) continue; // i18n "" —— 空键是另一种写法问题，Hugo 同样静默；归入缺失
      if (!siteKeys.has(key) && !themeKeys.has(key)) {
        if (!missing.has(key)) missing.set(key, []);
        missing.get(key).push(where);
      } else if (!themeKeys.has(key) && siteKeys.has(key)) {
        // 站点自有键：只在 zh.toml 解析得到，正常路径
      } else if (themeKeys.has(key) && !siteKeys.has(key)) {
        themeOnly.add(key);
      }
      if (siteKeys.has(key) && siteEmpty.has(key) && !missing.has(key)) {
        if (!missing.has(`∅${key}`)) missing.set(`∅${key}`, []);
        missing.get(`∅${key}`).push(where);
      }
    } else {
      // 动态：只记到行，截断表达式（可能跨行）
      const expr = rest.split('\n')[0].trim().slice(0, 60);
      dynamic.push({ where, expr });
    }
  }
}

// ---------- 输出 ----------
const missingKeys = [...missing.keys()].filter((k) => !k.startsWith('∅'));
const emptyKeys = [...missing.keys()].filter((k) => k.startsWith('∅')).map((k) => k.slice(1));

console.log(`▸ i18n 键守卫：扫 ${files.length} 个模板，字面量调用 ${callCount} 处`);
console.log(`  · zh.toml 键 ${siteKeys.size} 个、主题译文键 ${themeKeys.size} 个`);
if (themeOnly.size) {
  console.log(`  · 只在主题译文里解析的键 ${themeOnly.size} 个：${[...themeOnly].join('、')}`);
}
if (dynamic.length) {
  console.log(`  · 动态键调用 ${dynamic.length} 处（不判，键名静态取不到）：`);
  for (const d of dynamic) console.log(`      ${d.where}  i18n ${d.expr}`);
}

const failures = [];
for (const k of missingKeys) {
  failures.push(
    `键「${k}」在 ${SITE_TOML} 与主题译文里都不存在 —— 引用点 ${missing.get(k).join('、')}。` +
      `Hugo 对缺失键不报错，页面上会静默渲染成空串。`
  );
}
for (const k of emptyKeys) {
  failures.push(
    `键「${k}」在 ${SITE_TOML} 里存在但值为空 —— 引用点 ${missing.get(`∅${k}`).join('、')}。`
  );
}

if (failures.length) {
  console.log();
  for (const line of failures) console.log(`✗ ${line}`);
  console.log();
  console.log(`✗ 有 ${failures.length} 处 i18n 键缺失/空值。改名或删键时，把引用点一起改掉。`);
  process.exit(1);
}
console.log();
console.log('✓ 所有字面量 i18n 键都存在且非空（动态键已列出，反向不查）');
