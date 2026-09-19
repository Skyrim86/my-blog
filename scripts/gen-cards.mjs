#!/usr/bin/env node
// 从 data/<库>-toolbox.json 生成卡片页（content/<库 path>/<id>/index.md）。
//
// 用法：node scripts/gen-cards.mjs <库 key> [--check] [--dry-run]
//   node scripts/gen-cards.mjs cs            生成 / 更新
//   node scripts/gen-cards.mjs cs --check    只比对，不一致退出 1（CI 用：防止改了 JSON 忘了重生成）
//   node scripts/gen-cards.mjs cs --dry-run  只列出会动哪些文件
//
// 为什么数学库不走这里：数学卡的正文由 tools/course-import/import_course.py 从课程项目抽出来
// （有源文件可抽），本脚本服务的是 JSON 手写维护的库（当前是 CS 库）。两者的卡片页 front matter
// 与 title 生成规则保持一致，改一处要同步另一处；「每张卡都要有名字」这条断言两边都有
// （数学侧在 require_name，这里在 main() 开头）。
//
// 卡片页 front matter 与数学卡同构：title（可读标题）/ layout: toolcard / date / weight /
// sitemap.disable / searchHidden。date 复用已存在页面的日期 —— 重复生成不会天天改日期。
//
// 零依赖：只读 data/ 下的 JSON 与那两个 yaml（yaml 只做行解析，不是通用解析器）。
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const DRY = argv.includes('--dry-run');
const libKey = argv.find((a) => !a.startsWith('--'));

if (!libKey) {
  console.error('用法：node scripts/gen-cards.mjs <库 key> [--check] [--dry-run]');
  console.error('库 key 见 data/libraries.yaml（例如 cs）');
  process.exit(1);
}

/* ---------- 读 data/libraries.yaml：只取这个库那一段 ---------- */
function readLibrary(key) {
  const text = readFileSync(join('data', 'libraries.yaml'), 'utf8');
  const lines = text.split(/\r?\n/);
  let inLib = false;
  const out = {};
  for (const line of lines) {
    const start = /^\s*-\s*key:\s*(\S+)\s*$/.exec(line);
    if (start) {
      inLib = start[1] === key;
      continue;
    }
    if (!inLib) continue;
    const kv = /^\s+([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv) out[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '').trim();
  }
  if (!out.path) throw new Error(`data/libraries.yaml 里没有库「${key}」或它缺 path 字段`);
  return out;
}

/* ---------- 读 data/<库 key>-branches.yaml：只为取分支/细分 key（防撞名） ---------- */
function readBranchKeys(key) {
  const file = join('data', `${key}-branches.yaml`);
  if (!existsSync(file)) return [];
  const keys = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*-\s*key:\s*(\S+)\s*$/.exec(line);
    if (m) keys.push(m[1]);
  }
  return keys;
}

/* ---------- title：与 import_course.py 的 plain_card_title 同一套规则 ---------- */
// span 里含反斜杠命令（`\hat\sigma^2`）就整段丢掉，其余取文字（「$F$ 检验」→「F 检验」）。
// 两侧必须逐字对齐：数学卡与 CS 卡的卡片页 title 是同一套规则产出的。
function plainTitle(card) {
  const raw = (card.title || '').trim();
  const stripped = raw.replace(/\$([^$]*)\$/g, (_, inner) => (inner.includes('\\') ? '' : inner.trim()));
  return stripped.replace(/\s{2,}/g, ' ').trim();
}

function pageFrontMatter(card, lib, weight, dateStr) {
  const name = plainTitle(card);
  // 标题是「名字（类别）」：**编号不进 UI**（编号只活在锚点 id、{{< tool >}} 参数与搜索关键词里，
  // 见 docs/features.md ㉑）。名字缺失由 main() 里的断言拦住，这里只为兜住类别也缺的极端情况。
  const kind = card.kind || '';
  const title = name ? (kind ? `${name}（${kind}）` : name) : kind || card.id;
  return (
    '---\n' +
    `# 卡片页：由 scripts/gen-cards.mjs 从 data/${lib.data}.json 生成，勿手改。\n` +
    `# 卡片内容在 data/${lib.data}.json，模板是 layouts/courses/toolcard.html。\n` +
    `title: ${JSON.stringify(title)}\n` +
    'layout: "toolcard"\n' +
    `date: ${dateStr}\n` +
    'draft: false\n' +
    `weight: ${weight}\n` +
    'sitemap:\n' +
    '  disable: true\n' +
    'searchHidden: true\n' +
    '---\n'
  );
}

function existingDate(file) {
  if (!existsSync(file)) return null;
  const m = /^date:\s*(\S+)\s*$/m.exec(readFileSync(file, 'utf8'));
  return m ? m[1] : null;
}

function main() {
  const lib = readLibrary(libKey);
  const dataFile = join('data', `${lib.data}.json`);
  const json = JSON.parse(readFileSync(dataFile, 'utf8'));
  const cards = json.cards || [];
  if (!cards.length) throw new Error(`${dataFile} 里没有 cards`);

  /* 每张卡都必须有名字：无名卡在卡片墙上只是一个裸类别词，卡片页 h1 也不成形。
     数学卡那侧由 import_course.py 的 require_name 用同样两条判据拦住，这里同步。 */
  const nameless = cards.filter((c) => !(c.title || '').trim()).map((c) => c.id);
  if (nameless.length) {
    throw new Error(
      `卡片没有名字：${nameless.join('、')}\n` + `每张卡都要有名字 —— 在 ${dataFile} 里给它们补 title。`
    );
  }
  const formulaOnly = cards.filter((c) => (c.title || '').trim() && !plainTitle(c)).map((c) => c.id);
  if (formulaOnly.length) {
    throw new Error(
      `卡片的名字整段是公式，没有可读的纯文本部分：${formulaOnly.join('、')}\n` +
        `卡片页 h1 与 <title> 走的是纯文本降级，那里会变成空标题。`
    );
  }

  const branchKeys = readBranchKeys(libKey);
  const clash = cards.map((c) => c.id).filter((id) => branchKeys.includes(id));
  if (clash.length) {
    throw new Error(
      `卡片 id 与分支/细分 key 撞名：${clash.join('、')}\n` +
        `两者都会变成 /${libKey}/<key>/ 这一层 URL，撞上就互相覆盖。改卡片 id 或分支 key。`
    );
  }

  const base = join('content', lib.path.replace(/\/$/, ''));
  if (!existsSync(base)) throw new Error(`找不到内容目录 ${base}（libraries.yaml 里的 path 写对了吗？）`);

  const today = new Date().toISOString().slice(0, 10);
  const wanted = new Map();
  cards.forEach((card, i) => {
    const file = join(base, card.id, 'index.md');
    wanted.set(file, pageFrontMatter(card, lib, i + 1, existingDate(file) || today));
  });

  /* 现存卡片目录：数据里删掉的卡片要把页面也删掉（只删 index.md 与空目录） */
  const stale = [];
  for (const entry of readdirSync(base, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(base, entry.name);
    const file = join(dir, 'index.md');
    if (!existsSync(file)) continue;
    if (!wanted.has(file) && !readFileSync(file, 'utf8').includes('gen-cards.mjs')) continue;
    if (!wanted.has(file)) stale.push(dir);
  }

  const changed = [];
  // 比对时忽略行尾：本机 core.autocrlf=true，同一份内容在「checkout 出来的 CRLF」与
  // 「本脚本写出的 LF」之间会逐字节不同，而人眼与渲染都看不出差别 —— 那种不一致会让
  // 本地全绿、CI 炸。归一化之后再比，判据才落在真正的内容上。
  const norm = (s) => s.replace(/\r\n/g, '\n');
  for (const [file, text] of wanted) {
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (current === null || norm(current) !== norm(text)) changed.push(file);
  }

  if (CHECK) {
    if (!changed.length && !stale.length) {
      console.log(`✓ 卡片页与 ${dataFile} 一致：${wanted.size} 张卡`);
      process.exit(0);
    }
    for (const f of changed) console.log(`✗ ${f} 与 data/${lib.data}.json 不一致`);
    for (const d of stale) console.log(`✗ ${d} 在数据里已删除，页面还在`);
    console.log(`\n共 ${changed.length + stale.length} 处。跑 node scripts/gen-cards.mjs ${libKey} 重生成。`);
    process.exit(1);
  }

  for (const dir of stale) {
    if (DRY) {
      console.log(`  删 ${dir}`);
      continue;
    }
    rmSync(dir, { recursive: true, force: true });
    console.log(`  删 ${dir}`);
  }
  for (const [file, text] of wanted) {
    if (DRY) {
      if (changed.includes(file)) console.log(`  写 ${file}`);
      continue;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  console.log(
    (DRY ? '✓ 将写入 ' : '✓ 生成完成：') +
      `${wanted.size} 张卡` +
      (DRY ? `（其中 ${changed.length} 个会变）` : `，改动 ${changed.length} 个，删除 ${stale.length} 个`)
  );
}

try {
  main();
} catch (err) {
  console.error(`✗ ${err.message}`);
  process.exit(1);
}
