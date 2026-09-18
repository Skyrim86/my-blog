#!/usr/bin/env node
// 三处「校验清单」、时区、front matter 键表的**漂移检查**。
//
// ---- 为什么需要它 ----
// 同一套校验规则在本仓库里有三份独立登记（没有生成关系，是人工同步的）：
//   1. .github/actions/validate/action.yml —— CI 实际跑的（**唯一事实源**，见 AGENTS 规则 10）
//   2. scripts/push-blog.sh                —— 本地推送前跑的
//   3. tools/admin/lib/checks.mjs 的 ITEMS —— 管理页「体检」面板跑的
// 三处的注释里都写着「必须与另外两处保持一致」，但**没有任何东西验证它真的保持一致**。
// 漂移的代价是具体且已实测过的（checks.mjs 头部注释记着）：
//   · push-blog 少一项 → 本地全绿，推上去 CI 拦住（本次体检就抓到一处，见下）
//   · 体检面板少一项 → 面板显示「全部通过」，而发布会被拦
//   · 阻断口径不一致 → 一处当警告放行、另一处当错误拦截
//
// ---- 本次体检抓到的实际漂移（已修） ----
// `scripts/gen-cards.mjs cs --check` 在 CI 里是**阻断**项（卡片页与 data/cs-toolbox.json 不一致
// 会拦住部署），但 push-blog.sh 与 checks.mjs 都没有这一项 —— 也就是说改了 data/cs-toolbox.json
// 却忘记重生成卡片页时，本地会一路绿灯推到 CI 才炸。2026-09-18 已补进那两处。
//
// ---- 判定规则（有意不是「三份集合必须相等」） ----
//   A. CI 里**阻断**的每一项，push-blog 与 checks.mjs 都必须有。
//      这是唯一会造成「本地能推、CI 拒收」的方向，也是本检查的核心。
//   B. 同一脚本在多处的**阻断口径必须一致**（警告项不能被某处悄悄升级成阻断，反之亦然）。
//   C. push-blog 里出现的脚本必须在 CI 里也存在（本地不该有 CI 不认的规则）。
// 反向不做要求：CI 独有的**只警告**项（如 check-seo.mjs）不必同步到本地 —— 它拦不住发布，
// 本地缺它不会产生「本地绿 CI 红」，同步过去只是让推送变慢。
//
// 另外两项单源检查：
//   D. 时区：hugo.toml 的 timeZone 与 check-frontmatter.sh 里硬编码的 TZ 必须相同。
//      前者是站点权威值，后者决定「今天」怎么算；不一致时东八区早上的构建会把当天日期的页面
//      误判成未来日期。
//   E. front matter 键表：archetypes/ 与管理页字段表里出现的**顶层键**必须都在
//      check-frontmatter.sh 的 KNOWN_KEYS 里。漏登记不会报错，只会让新字段每次都被当成
//      「拼写可疑」警告一遍 —— 警告一多就没人看了，真拼错的那个也就混过去了。
//
// 用法：node scripts/check-consistency.mjs
// 退出码：0 = 无漂移；1 = 有漂移
//
// 解析方式说明：本脚本**读文本**而不是 import 那三个文件（checks.mjs 的 ITEMS 没导出，
// action.yml 是 YAML）。为了不让「解析规则过时」表现成「静默通过」，每个来源都有一条
// 下限断言（EXPECTED_MIN）：抽到的脚本数少于下限就直接失败，而不是拿空集合去比对。
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const ACTION = '.github/actions/validate/action.yml';
const PUSH = 'scripts/push-blog.sh';
const CHECKS = 'tools/admin/lib/checks.mjs';
const FRONTMATTER_SH = 'scripts/check-frontmatter.sh';
const HUGO_TOML = 'hugo.toml';

// 每个来源至少应抽到多少个脚本。低于它就是解析规则跟不上文件结构了。
// 取比当前实际数量略低的值：既能拦住解析失效，又不会因为以后合理地删掉一两条检查就误报。
const EXPECTED_MIN = { action: 11, push: 10, checks: 10 };

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// 从一段文本里取出被调用的校验脚本名（bash scripts/x.sh / node scripts/x.mjs）
const SCRIPT_RE = /(?:bash|node)\s+(scripts\/[A-Za-z0-9._-]+)/g;
function scriptNames(text) {
  const out = [];
  for (const m of String(text).matchAll(SCRIPT_RE)) out.push(m[1]);
  return out;
}

// ---------- 1. action.yml：按 run: 行取脚本，含 ::warning 的算只警告 ----------
function parseAction(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const m = /^\s*run:\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[1];
    const blocking = !value.includes('::warning');
    for (const name of scriptNames(value)) {
      // 同一行里同一脚本可能出现两次（--selftest && 真检），只登记一次
      map.set(name, { blocking });
    }
  }
  return map;
}

// ---------- 2. push-blog.sh：按 if [ -f scripts/x ]; then … fi 区块判定阻断 ----------
// 区块内出现 exit 1 就是阻断；同一脚本出现多次时，任一处阻断即视为阻断
// （check-math-katex.mjs 就是这样：--fix 那次只警告，真检那次才 exit 1）。
function parsePushBlog(text) {
  const lines = text.split('\n');
  const map = new Map();
  for (let i = 0; i < lines.length; i++) {
    const head = /^(\s*)if\s+\[\s+-f\s+(scripts\/[A-Za-z0-9._-]+)\s+\]\s*;\s*then\s*$/.exec(lines[i]);
    if (!head) continue;
    const indent = head[1].length;
    const name = head[2];
    let blocking = false;
    for (let j = i + 1; j < lines.length; j++) {
      // 同级缩进的 fi 收尾（本文件的区块都是「if 与 fi 同缩进、内容缩进更深」的写法）
      if (new RegExp(`^\\s{0,${indent}}fi\\s*$`).test(lines[j]) && lines[j].match(/^\s*/)[0].length <= indent) break;
      if (/^\s*exit\s+1\s*$/.test(lines[j])) blocking = true;
    }
    const prev = map.get(name);
    map.set(name, { blocking: blocking || Boolean(prev && prev.blocking) });
  }
  return map;
}

// ---------- 3. checks.mjs：逐 ITEMS 条目取 argv[0] 与 blocking ----------
function parseChecks(text) {
  const start = text.indexOf('const ITEMS = [');
  if (start === -1) return new Map();
  const end = text.indexOf('\n];', start);
  const body = text.slice(start, end === -1 ? text.length : end);

  const map = new Map();
  let block = null;
  for (const line of body.split('\n')) {
    if (/^\s*\{\s*$/.test(line)) { block = []; continue; }
    if (/^\s*\},?\s*$/.test(line)) {
      if (block) {
        const joined = block.join('\n');
        const argv = /argv:\s*\[([^\]]*)\]/.exec(joined);
        // checks.mjs 的 argv 只写脚本路径、不带解释器（runtime 字段另说），所以这里不能复用
        // scriptNames —— 那个要求前面有 bash/node。
        const name = argv ? (/scripts\/[A-Za-z0-9._-]+/.exec(argv[1]) || [])[0] : null;
        if (name) map.set(name, { blocking: /blocking:\s*true/.test(joined) });
      }
      block = null;
      continue;
    }
    if (block) block.push(line);
  }
  return map;
}

// ---------- 收集 ----------
const action = parseAction(read(ACTION));
const push = parsePushBlog(read(PUSH));
const checks = parseChecks(read(CHECKS));

const failures = [];
const notes = [];

function expectAtLeast(label, map, min) {
  if (map.size < min) {
    failures.push(
      `从 ${label} 只抽到 ${map.size} 个脚本（下限 ${min}）—— 解析规则可能已跟不上文件结构，` +
        `本次比对结果不可信。请更新本脚本顶部的解析函数与 EXPECTED_MIN。`
    );
  }
}

expectAtLeast(ACTION, action, EXPECTED_MIN.action);
expectAtLeast(PUSH, push, EXPECTED_MIN.push);
expectAtLeast(CHECKS, checks, EXPECTED_MIN.checks);

// 规则 A：CI 阻断项必须在本地两处都跑到
for (const [name, info] of action) {
  if (!info.blocking) continue;
  if (!push.has(name)) {
    failures.push(`「${name}」在 CI 里是阻断项，但 ${PUSH} 没有跑它 —— 本地会全绿、推上去才被拦。`);
  }
  if (!checks.has(name)) {
    failures.push(`「${name}」在 CI 里是阻断项，但 ${CHECKS} 的 ITEMS 里没有 —— 管理页体检会谎报通过。`);
  }
}

// 规则 B：阻断口径一致（只比对 CI 与另外两处共有的脚本）
for (const [name, info] of action) {
  for (const [label, other] of [[PUSH, push], [CHECKS, checks]]) {
    if (!other.has(name)) continue;
    if (other.get(name).blocking !== info.blocking) {
      failures.push(
        `「${name}」的阻断口径不一致：CI 是${info.blocking ? '阻断' : '只警告'}，` +
          `${label} 是${other.get(name).blocking ? '阻断' : '只警告'}。`
      );
    }
  }
}

// 规则 C：本地独有的脚本（CI 不认的规则）
for (const name of push.keys()) {
  if (!action.has(name)) {
    failures.push(`「${name}」只在 ${PUSH} 里跑，${ACTION} 没有 —— 本地在执行的规则 CI 不认。`);
  }
}

// 规则 D：时区单一来源
{
  const m = /^\s*timeZone\s*=\s*'([^']+)'/m.exec(read(HUGO_TOML));
  const tz = m ? m[1] : null;
  const m2 = /TZ=([A-Za-z][A-Za-z0-9_/+-]*)/.exec(read(FRONTMATTER_SH));
  const tzSh = m2 ? m2[1] : null;
  if (!tz || !tzSh) {
    failures.push(`时区检查取不到值：${HUGO_TOML} 的 timeZone=${tz}，${FRONTMATTER_SH} 的 TZ=${tzSh}。`);
  } else if (tz !== tzSh) {
    failures.push(
      `时区不一致：${HUGO_TOML} 写的是 ${tz}，而 ${FRONTMATTER_SH} 硬编码了 ${tzSh} —— ` +
        `后者决定「今天」怎么算，不一致会让当天日期的页面被误判成未来日期而静默不上线。`
    );
  } else {
    notes.push(`时区：${HUGO_TOML} 与 ${FRONTMATTER_SH} 都是 ${tz}`);
  }
}

// 规则 E：front matter 顶层键表
{
  // KNOWN_KEYS="..." 里含整行 `#` 注释，按行剔掉再切词，否则注释文字会被当成键名
  const m = /KNOWN_KEYS="([\s\S]*?)"/.exec(read(FRONTMATTER_SH));
  const known = new Set();
  if (m) {
    for (const line of m[1].split('\n')) {
      if (/^\s*#/.test(line)) continue;
      for (const token of line.trim().split(/\s+/)) if (token) known.add(token);
    }
  }

  // archetypes/ 的顶层键（只取顶层：缩进的子键不属于 KNOWN_KEYS 的粒度）
  const archetypeKeys = new Set();
  for (const file of readdirSync('archetypes').filter((f) => f.endsWith('.md'))) {
    let inFm = false;
    let seen = 0;
    for (const line of read(`archetypes/${file}`).split('\n')) {
      if (/^---[ \t]*$/.test(line)) {
        if (++seen === 2) break;
        inFm = true;
        continue;
      }
      if (!inFm) continue;
      const k = /^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*:/.exec(line);
      if (k) archetypeKeys.add(k[1]);
    }
  }

  // 管理页字段表的顶层键。类型清单从 check-editor-schema.mjs 的 MAP 取（那里是类型的事实源），
  // 取不到就让下面的下限断言兜住。
  const uiKeys = new Set();
  const typeList = [...read('scripts/check-editor-schema.mjs').matchAll(/^\s{2}'?([a-z][a-z-]*)'?:\s*\{\s*$/gm)].map(
    (x) => x[1]
  );
  if (!typeList.length) {
    failures.push('从 scripts/check-editor-schema.mjs 取不到编辑器类型清单 —— 规则 E 没法比对。');
  }
  const content = await import(pathToFileURL('tools/admin/lib/content.mjs').href);
  for (const type of typeList) {
    let schema;
    try {
      schema = content.editorSchema(type);
    } catch {
      continue;
    }
    for (const field of schema.fields ?? []) {
      uiKeys.add(String(field.key).split('.')[0]);
    }
  }

  const missing = [...new Set([...archetypeKeys, ...uiKeys])].filter((k) => !known.has(k)).sort();
  if (missing.length) {
    failures.push(
      `有 front matter 顶层键没登记进 ${FRONTMATTER_SH} 的 KNOWN_KEYS：${missing.join('、')} —— ` +
        `用它们的页面每次都会被当成「拼写可疑」警告一遍，警告一多真拼错的就混过去了。`
    );
  } else {
    notes.push(
      `front matter 键表：KNOWN_KEYS ${known.size} 项，覆盖 archetypes ${archetypeKeys.size} 键与 ` +
        `管理页 ${uiKeys.size} 键`
    );
  }
}

// ---------- 输出 ----------
console.log(`▸ 一致性检查：${ACTION} / ${PUSH} / ${CHECKS}`);
console.log(
  `  · 抽到脚本：CI ${action.size} 项、push-blog ${push.size} 项、体检面板 ${checks.size} 项`
);
for (const line of notes) console.log(`  · ${line}`);
if (failures.length) {
  console.log();
  for (const line of failures) console.log(`✗ ${line}`);
  console.log();
  console.log(`✗ 发现 ${failures.length} 处漂移。修的时候记住口径：CI 的 action.yml 是唯一事实源。`);
  process.exit(1);
}
console.log();
console.log('✓ 校验清单、阻断口径、时区与 front matter 键表均无漂移');
