#!/usr/bin/env node
// 卡面工艺的渲染器：data/card-styles.yaml → ① 生成的 CSS 块 ② card-3d.js 里的 STYLE_3D 行。
//
// 用法（仓库根目录）：
//     node tools/cards/render-styles.mjs --write    # 写盘（默认）
//     node tools/cards/render-styles.mjs --check    # 只比对，不一致就退出码 1（scripts/check-deck.mjs 内部就是调它）
//     node tools/cards/render-styles.mjs --print    # 打到标准输出，不碰盘
//
// 设计口径（为什么这么做、代价多大，见 docs/exp-craft.md）：
//
//   · **产物分两种写法**。CSS 单出一个生成文件（assets/css/decks/21-card-styles.css）——
//     与 tools/cards/make-ornaments.py 的 20-card-ornaments.css 同一条规矩：生成物与手写物
//     不混在一个文件里，「哪些能手改」不靠记忆。文件名的 21- 前缀保证它排在手写的
//     21-card-deck.css **之后**（主题按数字序合并，见 themes/PaperMod/layouts/_partials/head.html
//     的 resources.Match）—— 工艺块与基类 `.home-card` 的优先级相同，靠顺序取胜。
//   · **card-3d.js 不另出文件**：STYLE_3D 是一张 16 行的表，抽 15 行到别的文件需要在运行时
//     合并（多一个 <script>、多一个全局名、多一层加载顺序），换不来任何好处。所以那些行
//     **就地重写**：生成块统一插到表头（`var STYLE_3D = {`）之后，前面加一条哨兵注释；
//     改一行的效果就是重新生成。手改过的那种行会被生成器覆盖，且首先会被 check-deck.mjs 拦下。
//   · **模型只吃「令牌层」，结构层仍手写**：13 种工艺的主块已全部搬进来（2026-09-22），
//     剩下的伪元素（.home-card--glass::before）、后代（.home-card--kintsugi .home-card-lens）与
//     深色主题覆写**留在 21-card-deck.css** —— 那是几何与主题，不是材质参数。foil 是特例：
//     它没有主块（`.home-card` 的基础声明本身就是全息），所以不在表里。
//   · 逐字复现旧值：YAML 里的标量一律按**字符串**收（与 scripts/check-deck.mjs 读
//     data/home-cards.yaml 的「只做行解析、不引 yaml 依赖」同一套做法）。所以 STYLE_3D 里
//     `0.20` 这种写法在生成物里仍是 `0.20`，不是 `0.2` —— 迁移那一版的 diff 才能按行读。
//   · 生成的 CSS 里**不写行内注释**，只有块头一行说明。工艺的「为什么」写在 YAML 的 note 里。

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const DATA_YAML = join(ROOT, 'data', 'card-styles.yaml');
export const CSS_OUT = join(ROOT, 'assets', 'css', 'decks', '21-card-styles.css');
export const CARD3D_JS = join(ROOT, 'assets', 'js', 'card-3d.js');

// STYLE_3D 那一段的两个锚点（生成块的插入点与 check-deck.mjs 的解析区间一致）
const T3_OPEN = 'var STYLE_3D = {';
const T3_CLOSE = '  };';
// 生成块的哨兵行：幂等重写靠它（先删旧的、再插新的）
const T3_SENTINEL =
  '    // ↓ 以下条目由 data/card-styles.yaml 生成（tools/cards/render-styles.mjs）—— 不要手改，check-deck.mjs 会核';

const PRINT_KINDS = new Set(['linear', 'radial', 'repeating-linear', 'repeating-radial', 'conic', 'repeating-conic', 'token']);
const THREE_D_KEYS = ['foil', 'scale', 'tint', 'spec', 'relief', 'sparkle', 'edge'];

/* ============================================================ 迷你 YAML 读取
   只支持 data/card-styles.yaml 用到的那一小撮：缩进映射 / 块序列（含 `- key: v` 开头的映射项）/ 标量。
   标量**一律按字符串**收（不转数字、不转布尔），引号只剥一层；` #` 之后按行尾注释丢（值里不含
   「空格 + #」是这份文件的约定，十六进制色值因此要加引号）。不引任何依赖：与
   scripts/check-deck.mjs 读 home-cards.yaml 的口径一致（那个脚本里写明过为什么不引 yaml 包）。 */

function stripComment(line) {
  return line.replace(/\s+#(?=\s|$).*$/, '');
}

export function parseYaml(text) {
  const raw = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const body = stripComment(line).replace(/\s+$/, '');
    if (!body.trim()) continue;
    raw.push({ indent: body.match(/^ */)[0].length, text: body.trim() });
  }
  let i = 0;
  const scalar = (s) => {
    const t = s.trim();
    if (/^"(.*)"$/.test(t)) return t.slice(1, -1);
    if (/^'(.*)'$/.test(t)) return t.slice(1, -1);
    return t;
  };
  const keyed = (s) => {
    const m = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/.exec(s);
    return m ? { key: m[1], rest: m[2] === undefined ? '' : m[2] } : null;
  };
  const parseMap = (indent) => {
    const out = {};
    while (i < raw.length && raw[i].indent === indent && !raw[i].text.startsWith('-')) {
      const kv = keyed(raw[i].text);
      if (!kv) throw new Error(`data/card-styles.yaml 第 ${i + 1} 个有效行不是 key: value —— ${raw[i].text}`);
      if (kv.rest === '') {
        i++;
        out[kv.key] = i < raw.length && raw[i].indent > indent ? parseNode(raw[i].indent) : null;
      } else {
        out[kv.key] = scalar(kv.rest);
        i++;
      }
    }
    return out;
  };
  const parseSeq = (indent) => {
    const out = [];
    while (i < raw.length && raw[i].indent === indent && raw[i].text.startsWith('-')) {
      const rest = raw[i].text.slice(1).trim();
      if (rest === '') {
        i++;
        out.push(parseNode(raw[i].indent));
        continue;
      }
      const kv = keyed(rest);
      if (!kv) {
        out.push(scalar(rest));
        i++;
        continue;
      }
      // `- key: v` —— 把这一行当成虚拟缩进（dash + 2）的映射首行，交给 parseMap 接着读
      raw[i] = { indent: indent + 2, text: rest };
      out.push(parseMap(indent + 2));
    }
    return out;
  };
  const parseNode = (indent) =>
    raw[i].text.startsWith('-') ? parseSeq(indent) : parseMap(indent);

  const doc = parseMap(0);
  if (i < raw.length) throw new Error(`data/card-styles.yaml 有读不动的行：${raw[i].text}`);
  return doc;
}

/* ============================================================ 校验（失败的报错要能直接指路） */

export function validate(doc) {
  const errs = [];
  const styles = doc.styles;
  if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
    errs.push('✗ 顶层要有 styles:（一张工艺名 → 参数的表）');
    return errs;
  }
  for (const [name, s] of Object.entries(styles)) {
    const at = `工艺「${name}」`;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) errs.push(`✗ ${at}：名字只能是 a-z0-9- 且以字母开头（它是 CSS 类名 .home-card--${name} 的一段）`);
    for (const k of ['labelKey', 'tier', 'fretLine', 'plate', 'plateSolid', 'plateText', 'plateAccent', 'blend', 'opacity', 'filter', 'print', 'threeD']) {
      if (s[k] === undefined || s[k] === null || s[k] === '') errs.push(`✗ ${at}：缺字段 ${k}`);
    }
    if (s.tier && !['basic', 'advanced'].includes(s.tier)) errs.push(`✗ ${at}：tier 只能是 basic / advanced（现在是 ${s.tier}）`);
    if (s.labelKey && !/^deckStyle[A-Z]/.test(s.labelKey)) errs.push(`✗ ${at}：labelKey 得是 deckStyle<名> 那种 i18n 键（现在是 ${s.labelKey}）`);
    if (s.cframe !== undefined) errs.push(`✗ ${at}：不许写 cframe —— 那是**等级**的材质底色，工艺只能给 cframe-finish（见 21-card-deck.css 第 6 条规矩）`);
    if (s.filter && s.filter !== 'none' && !/^url\(#[\w-]+\)$/.test(s.filter)) {
      errs.push(`✗ ${at}：filter 只能是 none 或 url(#id)（现在是 ${s.filter}）`);
    }
    const checkPaint = (p, what) => {
      if (!p || typeof p !== 'object') { errs.push(`✗ ${at}：${what} 要是一个渐变（kind + stops）`); return; }
      if (!PRINT_KINDS.has(p.kind)) { errs.push(`✗ ${at}：${what} 的 kind「${p.kind}」不在 ${[...PRINT_KINDS].join(' / ')} 里`); return; }
      if (p.kind === 'token') {
        if (!/^--[\w-]+$/.test(p.ref || '')) errs.push(`✗ ${at}：${what} 的 token 层要写 ref: --某令牌（现在是 ${p.ref}）`);
        return;
      }
      if (p.kind === 'linear' || p.kind === 'repeating-linear' || p.kind === 'conic' || p.kind === 'repeating-conic') {
        if (!p.direction) errs.push(`✗ ${at}：${what} 是 ${p.kind}，要写 direction（140deg / to top，conic 写 from 0deg at 50% 34%）`);
      }
      if (p.kind === 'radial' || p.kind === 'repeating-radial') {
        if (!p.size || !p.at) errs.push(`✗ ${at}：${what} 是 radial，要写 size（120% 90%）与 at（42% 38%）`);
      }
      if (!Array.isArray(p.stops) || p.stops.length < 2) {
        errs.push(`✗ ${at}：${what} 的 stops 至少两个（一个停止点画不出渐变）`);
        return;
      }
      for (const st of p.stops) {
        if (!st || !st.color) errs.push(`✗ ${at}：${what} 有个停止点没写 color`);
        if (st && st.at !== undefined && !/^[\d.%\s\w-]+$/.test(st.at)) errs.push(`✗ ${at}：${what} 的停止点位置「${st.at}」看着不是长度/百分比`);
      }
    };
    checkPaint(s.finish, 'finish');
    checkPaint(s.plate, 'plate');
    if (s.mask !== undefined) {
      // mask 可以是多层（逗号分隔的 var() 列表，如 yukika 的十二片纹理），与 print 同构
      const ms = Array.isArray(s.mask) ? s.mask : [s.mask];
      ms.forEach((p, k) => checkPaint(p, `mask[${k}]`));
    }
    if (!Array.isArray(s.print) || !s.print.length) {
      errs.push(`✗ ${at}：print 至少一层（卡面的印纹就是它）`);
    } else {
      s.print.forEach((p, k) => checkPaint(p, `print[${k}]`));
    }
    const t3 = s.threeD || {};
    const missing = THREE_D_KEYS.filter((k) => t3[k] === undefined);
    const extra = Object.keys(t3).filter((k) => !THREE_D_KEYS.includes(k));
    if (missing.length) errs.push(`✗ ${at}：threeD 缺 ${missing.join(' / ')} —— 3D 侧漏一个通道不会报错，只会静默用兜底值`);
    if (extra.length) errs.push(`✗ ${at}：threeD 里有多余的键 ${extra.join(' / ')}（STYLE_3D 只认 ${THREE_D_KEYS.join(' / ')}）`);
  }
  return errs;
}

/* ============================================================ 渲染：CSS */

const IND = '  ';
const MAXLEN = 104;

/** 在顶层逗号处切分（括号里的逗号不算）—— 只为了让生成物可读，不影响渲染 */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/** 一个渐变的 CSS 文本（不含换行） */
export function paint(p) {
  if (p.kind === 'token') return `var(${p.ref})`;
  const stops = p.stops.map((s) => (s.at === undefined ? s.color : `${s.color} ${s.at}`)).join(', ');
  switch (p.kind) {
    case 'linear': return `linear-gradient(${p.direction}, ${stops})`;
    case 'repeating-linear': return `repeating-linear-gradient(${p.direction}, ${stops})`;
    case 'radial': return `radial-gradient(${p.size} at ${p.at}, ${stops})`;
    case 'repeating-radial': return `repeating-radial-gradient(${p.size} at ${p.at}, ${stops})`;
    case 'conic': return `conic-gradient(${p.direction}, ${stops})`;
    case 'repeating-conic': return `repeating-conic-gradient(${p.direction}, ${stops})`;
    default: throw new Error(`不认识的 kind：${p.kind}`);
  }
}

/** 值过长时按顶层逗号折行（与手写版一个观感）：firstHead 是第一行前缀，contIndent 是续行前缀 */
function foldValue(value, firstHead, contIndent) {
  if (firstHead.length + value.length + 1 <= MAXLEN) return [firstHead + value];
  const open = value.indexOf('(');
  if (open < 0) return [firstHead + value];
  const prefix = value.slice(0, open + 1);
  const parts = splitTop(value.slice(open + 1, -1));
  const lines = [];
  let cur = firstHead + prefix + parts[0];
  for (let k = 1; k < parts.length; k++) {
    if ((cur + ', ' + parts[k]).length + 1 <= MAXLEN) cur += ', ' + parts[k];
    else { lines.push(cur + ','); cur = contIndent + parts[k]; }
  }
  lines.push(cur + ')');
  return lines;
}

/** 一条声明（值过长时折行） */
function decl(prop, value, indent) {
  const lines = foldValue(value, `${indent}${prop}: `, `${indent}  `);
  lines[lines.length - 1] += ';';
  return lines;
}

export function renderStyleBlock(name, s) {
  const out = [];
  const note = s.note ? `：${s.note}` : '';
  out.push(`/* ${name}${note}`);
  out.push(`   生成产物 —— 由 data/card-styles.yaml 出（tools/cards/render-styles.mjs）。不要手改。 */`);
  out.push(`.home-card--${name} {`);
  out.push(...decl('--fret-line', s.fretLine, IND));
  if (s.gemColor) out.push(...decl('--craft-gem-color', s.gemColor, IND));
  out.push(...decl('--cframe-finish', paint(s.finish), IND));
  out.push(...decl('--cplate', paint(s.plate), IND));
  out.push(...decl('--cplate-solid', s.plateSolid, IND));
  out.push(...decl('--cplate-text', s.plateText, IND));
  out.push(...decl('--cplate-accent', s.plateAccent, IND));
  // --coverlay：图层栈一行一层（最后一层收分号），顺序 = YAML 里 print 的顺序
  const layers = s.print.map((p) => paint(p));
  out.push(`${IND}--coverlay:`);
  layers.forEach((L, k) => {
    const tail = k === layers.length - 1 ? ';' : ',';
    const body = foldValue(L, IND + IND, IND + IND + IND);
    body[body.length - 1] += tail;
    out.push(...body);
  });
  out.push(...decl('--cblend', s.blend, IND));
  out.push(...decl('--coverlay-op', s.opacity, IND));
  // --coverlay-mask 一族：印纹层的遮罩（和纸/玻璃那种「只在下半张显」）。可选 —— 不给就是全卡。
  // 顺序与手写版一致：mask → size → position → repeat → filter → box-shadow。
  if (s.mask) out.push(...decl('--coverlay-mask', (Array.isArray(s.mask) ? s.mask : [s.mask]).map(paint).join(', '), IND));
  if (s.maskSize) out.push(...decl('--cmask-size', s.maskSize, IND));
  if (s.maskPosition) out.push(...decl('--cmask-position', s.maskPosition, IND));
  if (s.maskRepeat) out.push(...decl('--cmask-repeat', s.maskRepeat, IND));
  out.push(...decl('--cfilter', s.filter, IND));
  // 玻璃的倒角/体积光是它材质的一部分，但落在盒模型上（不是自定义属性）—— 原样透传，逐字来自 YAML。
  if (s.boxShadow) out.push(...decl('box-shadow', s.boxShadow, IND));
  out.push('}');
  return out.join('\n');
}

export function renderCss(styles, eol = '\r\n') {
  const names = Object.keys(styles);
  const head = [
    '/* 生成的卡面工艺块 —— **不要手改**（改 data/card-styles.yaml 后跑 node tools/cards/render-styles.mjs --write）。',
    '',
    `   现在由数据驱动的工艺（${names.length} 种）：${names.join(' / ')}。`,
    '   其余工艺仍是 21-card-deck.css 里的手写块 —— 两种形式在同一个类上只能存在一处（check-deck.mjs 会核）。',
    '',
    '   这个文件为什么单出、为什么排在 21-card-deck.css 之后（靠顺序压过基类 .home-card 的默认令牌）、',
    '   以及参数模型的字段表与代价，见 docs/exp-craft.md 与 tools/cards/render-styles.mjs 的文件头。 */',
    '',
  ];
  const blocks = names.map((n) => renderStyleBlock(n, styles[n]));
  // 换行符跟兄弟文件走：/工作区/ 里是 CRLF（core.autocrlf=true，见 .gitattributes 的说明），
  // 索引里一律 LF。生成物不按这个来的话，git 会把整个文件标成改动过的。
  return (head.join('\n') + '\n' + blocks.join('\n\n') + '\n').replace(/\n/g, eol);
}

/* ============================================================ 渲染：card-3d.js 的 STYLE_3D 行 */

export function renderThreeDLine(name, t3) {
  // 能省引号的条件是「**合法 JS 标识符**」，不是「合法类名段」：`holo-prism` 是合法类名段、
  // 却不是合法标识符，省了引号就是 `holo-prism: {…}` —— 只在 hugo 的 minify 阶段炸。
  const key = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? `${name}:` : `'${name}':`;
  const pad = key.padEnd(14);
  return `    ${pad}{ ${THREE_D_KEYS.map((k) => `${k}: ${t3[k]}`).join(', ')} },`;
}

/** 把托管工艺的行从 STYLE_3D 里删掉、统一插到**表头之后**（幂等）。原文的换行符原样保留。
 *
 * 插在表头（`var STYLE_3D = {`）之后而不是表末：表末那一条手写条目**没有逗号**，
 * 往它后面插会得到 `aurora: {…}` 紧跟 `nacre: {…}` —— 语法错误，而且只在 hugo 的
 * minify 阶段炸（`unexpected nacre in object literal`，第一版就是这么炸的）。
 * 插在开头则不需要动任何手写行：`{` 后面本来就可以直接跟条目。 */
export function syncCard3d(text, styles) {
  const names = Object.keys(styles);
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const open = lines.findIndex((l) => l.includes(T3_OPEN));
  if (open < 0) throw new Error(`${CARD3D_JS}: 找不到 ${T3_OPEN}`);
  let close = -1;
  for (let k = open + 1; k < lines.length; k++) if (lines[k] === T3_CLOSE) { close = k; break; }
  if (close < 0) throw new Error(`${CARD3D_JS}: 找不到 STYLE_3D 的收尾行「${T3_CLOSE}」`);

  const isManaged = (l) => names.some((n) => new RegExp(`^\\s*'?${n}'?\\s*:\\s*\\{`).test(l));
  const kept = [];
  for (let k = 0; k < lines.length; k++) {
    if (k > open && k < close && (isManaged(lines[k]) || lines[k].includes(T3_SENTINEL.trim()))) continue;
    kept.push(lines[k]);
  }
  const newOpen = kept.findIndex((l) => l.includes(T3_OPEN));
  const block = [T3_SENTINEL, ...names.map((n) => renderThreeDLine(n, styles[n].threeD))];
  kept.splice(newOpen + 1, 0, ...block);
  const out = kept.join(eol);
  // 自己先做一次语法体检：这个文件是浏览器脚本，语法错只会在 hugo 的 minify 阶段暴露
  try { new Function(out); } catch (e) { throw new Error(`${CARD3D_JS}: 生成后语法不过 —— ${e.message}`); }
  return out;
}

/* ============================================================ 读文件 / 比对 / 写盘 */

export function loadStyles() {
  const doc = parseYaml(readFileSync(DATA_YAML, 'utf8'));
  const errs = validate(doc);
  if (errs.length) throw new Error(errs.join('\n'));
  return doc.styles;
}

export function checkSync(styles) {
  const haveJs = readFileSync(CARD3D_JS, 'utf8');
  const haveCss = existsSync(CSS_OUT) ? readFileSync(CSS_OUT, 'utf8') : null;
  // 生成物沿用**现有文件**的换行符（没有则按兄弟文件的 CRLF）；比对一律按 LF 归一，
  // 于是「只差换行符」不会被当成不一致。
  const eol = haveCss === null ? '\r\n' : /\r\n/.test(haveCss) ? '\r\n' : '\n';
  const norm = (t) => (t === null ? null : t.replace(/\r\n/g, '\n'));
  const want = { css: renderCss(styles, eol), js: syncCard3d(haveJs, styles) };
  const problems = [];
  if (haveCss === null) problems.push(`✗ 缺 ${CSS_OUT} —— 跑 node tools/cards/render-styles.mjs --write`);
  else if (norm(haveCss) !== norm(want.css)) problems.push(`✗ ${CSS_OUT} 与 data/card-styles.yaml 不一致 —— 跑 node tools/cards/render-styles.mjs --write`);
  if (norm(haveJs) !== norm(want.js)) problems.push(`✗ ${CARD3D_JS} 的 STYLE_3D 里托管工艺的行与 data/card-styles.yaml 不一致 —— 跑 node tools/cards/render-styles.mjs --write`);
  return { problems, wantCss: want.css, wantJs: want.js };
}

function main(argv) {
  const mode = argv.includes('--check') ? 'check' : argv.includes('--print') ? 'print' : 'write';
  const styles = loadStyles();
  if (mode === 'print') {
    process.stdout.write(renderCss(styles));
    for (const n of Object.keys(styles)) process.stdout.write(renderThreeDLine(n, styles[n].threeD) + '\n');
    return 0;
  }
  const { problems, wantCss, wantJs } = checkSync(styles);
  if (mode === 'check') {
    for (const p of problems) console.log(p);
    if (problems.length) return 1;
    console.log(`· 工艺参数 ${Object.keys(styles).length} 种（${Object.keys(styles).join(' / ')}）：生成的 CSS 与 card-3d.js 的 STYLE_3D 行都与 data/card-styles.yaml 一致`);
    return 0;
  }
  writeFileSync(CSS_OUT, wantCss, 'utf8');
  writeFileSync(CARD3D_JS, wantJs, 'utf8');
  console.log(`✓ 已写出 ${CSS_OUT}（${Object.keys(styles).length} 种工艺）并同步 ${CARD3D_JS} 的 STYLE_3D`);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.log(`✗ ${e.message}`);
    process.exit(1);
  }
}
