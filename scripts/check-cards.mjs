#!/usr/bin/env node
// 卡片数据的不变量：**每张卡都要有名字** —— 外加 id / kind 非空、id 不重复。
//
// ---- 为什么单列一条 ----
// 2026-09-19 之前，数学库里有 30 张卡在课程笔记里就没写名字（写成 `**引理 4.1**`、
// 没有 `（名字）`），导入器照收，于是卡片墙上显示的是一片「引理 4.1」「命题 4.6」——
// 类别词加课程编号，等于没有名字。名字的**源头**在仓库外的课程项目 md 里，CI 的机器上
// 没有那个项目，所以 CI 只能查**产物**：data/*-toolbox.json。
//
// 两处生成器在写盘那一侧拦（tools/course-import/import_course.py 的 require_name、
// scripts/gen-cards.mjs 开头的断言，判据一致）；这条在产物这一侧拦 —— 知识库（wiki）
// 发布、管理页手改都不会经过那两处，也就只有它能兜住。
//
// 「名字整段是公式」那一条**不在这里**：它只在生成 front matter 标题时才有意义，
// 判据留在两个生成器里（CI 跑的 `gen-cards.mjs cs --check` 会连带跑到 CS 库那一条）。
//
// 用法：node scripts/check-cards.mjs
// 退出码：0 = 每张卡都有名字；1 = 有卡片缺名字或字段不全
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// data/libraries.yaml 只做行解析，不引 yaml 依赖（与 scripts/gen-cards.mjs 同一套做法）
function readLibraries() {
  const text = readFileSync(join('data', 'libraries.yaml'), 'utf8');
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const start = /^\s*-\s*key:\s*(\S+)\s*$/.exec(line);
    if (start) {
      cur = { key: start[1] };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const kv = /^\s+([A-Za-z]+):\s*(.*)$/.exec(line);
    if (kv) cur[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

const failures = [];
const notes = [];
let total = 0;

for (const lib of readLibraries()) {
  // 有的库只借这套模板、卡片数据在别处（libraries.yaml 的 data 字段才是「读哪份 JSON」）
  if (!lib.data) continue;
  const rel = join('data', `${lib.data}.json`);
  if (!existsSync(rel)) {
    failures.push(`✗ ${rel} 不存在（data/libraries.yaml 里「${lib.key}」的 data 指向它）`);
    continue;
  }

  const cards = JSON.parse(readFileSync(rel, 'utf8')).cards || [];
  total += cards.length;
  const seen = new Map();
  let bad = 0;

  for (const card of cards) {
    const id = String(card.id || '').trim();
    if (!id) {
      failures.push(`✗ ${rel}：有一张卡没有 id —— 卡片页地址是按 id 生成的，没有它这张卡进不了库`);
      bad += 1;
      continue;
    }
    if (seen.has(id)) {
      failures.push(`✗ ${rel}：id「${id}」重复（第 ${seen.get(id)} 张与另一张）—— 两张卡会抢同一个页面地址`);
      bad += 1;
    }
    seen.set(id, seen.size + 1);

    if (!String(card.kind || '').trim()) {
      failures.push(`✗ ${rel}：${id} 没有类别（kind）—— 卡片的左色条与徽章配色都靠它`);
      bad += 1;
    }
    if (!String(card.title || '').trim()) {
      failures.push(
        `✗ ${rel}：${id} 没有名字（类别 ${card.kind || '?'}${card.num ? ' · 编号 ' + card.num : ''}）—— ` +
          `每张卡都要有名字，卡片墙上才有东西可读`
      );
      bad += 1;
    }
  }

  notes.push(`· ${lib.label}（${rel}）：${cards.length} 张卡${bad ? `，其中 ${bad} 处不合规` : ''}`);
}

for (const line of notes) console.log(line);

if (failures.length) {
  console.log();
  for (const line of failures) console.log(line);
  console.log();
  console.log(
    `✗ ${failures.length} 处卡片数据不合规。` +
      `数学卡的名字写在课程项目的 md 里（\`**引理 4.1（名字）**\`）再重跑导入；` +
      `CS 卡直接补 data/cs-toolbox.json 的 title。`
  );
  process.exit(1);
}

console.log(`✓ ${total} 张卡都有名字（id / kind 也齐、id 无重复）`);
