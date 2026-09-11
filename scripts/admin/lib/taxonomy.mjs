// 标签词表读写。
//
// 读：调用 scripts/new-content.sh tags，而不是在 Node 里再写一遍 YAML 解析 ——
//     词表的分节与缩进格式被脚本 grep 依赖，解析逻辑只应该有一份。
// 写：scripts/new-content.sh 没有「只加词条、不建内容」的入口（--new-tag 是建内容时的副作用），
//     所以追加逻辑在 Node 侧实现了一份，对应 new-content.sh 的 add_term()：
//     插到目标分节的末尾、该分节尾部空行之前。因为是第二份实现，写完会立刻用
//     new-content.sh tags 复核，复核不通过就把原文件恢复回去 —— 不允许悄悄写坏词表。

import fs from 'node:fs/promises';
import path from 'node:path';
import { runScript } from './exec.mjs';

export const TAXONOMY_REL = 'data/taxonomy.yaml';
export const SECTIONS = ['tags', 'categories'];

const SECTION_RE = /^[A-Za-z_]+:/;

export async function readTaxonomy(repoRoot) {
  const { code, stdout, stderr } = await runScript(repoRoot, 'scripts/new-content.sh', ['tags']);
  if (code !== 0) {
    throw new Error(`读取词表失败（new-content.sh tags 退出码 ${code}）：${(stderr || stdout).trim()}`);
  }
  const out = { tags: [], categories: [] };
  let section = null;
  for (const line of stdout.split(/\r?\n/)) {
    if (/^tags[（(]/.test(line)) {
      section = 'tags';
      continue;
    }
    if (/^categories[：:]/.test(line)) {
      section = 'categories';
      continue;
    }
    const m = /^\s*\d+\)\s*(.+)$/.exec(line);
    if (m && section) out[section].push(m[1].trim());
  }
  if (out.tags.length === 0 && out.categories.length === 0) {
    throw new Error('词表解析结果为空，new-content.sh tags 的输出格式可能变了');
  }
  return out;
}

// 词条校验：这些字符会破坏词表格式，或让 --tags A,B 的逗号切分出错。
export function validateTerm(term) {
  const t = String(term ?? '');
  if (t.trim() === '') return '词条不能为空';
  if (t !== t.trim()) return '词条首尾不能有空格';
  if (t.length > 60) return '词条太长了（超过 60 字符）';
  if (/[\r\n\t]/.test(t)) return '词条不能包含换行或制表符';
  if (t.includes(',')) return '词条不能包含逗号（词表用逗号拼成 --tags A,B）';
  if (t.includes('#')) return '词条不能包含 #（词表里的 # 会被当成行内注释）';
  if (t.startsWith('-')) return '词条不能以 - 开头（会和词表列表项符号混淆）';
  if (t.startsWith('"') || t.startsWith("'")) return '词条不要加引号（见 data/taxonomy.yaml 的格式约定）';
  if (/^[A-Za-z_]+:$/.test(t)) return '词条不能写成 key: 形式';
  return null;
}

function insertTerm(text, section, term) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r\n|\n/);
  const start = lines.findIndex((line) => line.trimEnd() === `${section}:`);
  if (start === -1) throw new Error(`词表里找不到分节：${section}:`);

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (SECTION_RE.test(lines[i])) {
      end = i;
      break;
    }
  }
  // 落在分节尾部空行之前，与 add_term 的 awk 行为一致
  let at = end;
  while (at - 1 > start && lines[at - 1].trim() === '') at--;

  const next = lines.slice();
  next.splice(at, 0, `  - ${term}`);
  return next.join(eol);
}

export async function addTerm(repoRoot, section, term) {
  if (!SECTIONS.includes(section)) {
    return { ok: false, error: `未知分节：${section}（只支持 ${SECTIONS.join(' / ')}）` };
  }
  const invalid = validateTerm(term);
  if (invalid) return { ok: false, error: invalid };

  const file = path.join(repoRoot, TAXONOMY_REL);
  const before = await fs.readFile(file, 'utf8');
  const current = await readTaxonomy(repoRoot);
  const lower = term.toLowerCase();
  const exact = current[section].find((t) => t === term);
  if (exact) return { ok: true, alreadyPresent: true, term, taxonomy: current };
  const ci = current[section].find((t) => t.toLowerCase() === lower);
  if (ci) {
    return { ok: false, error: `词表里已有「${ci}」（大小写不同就是同一个词条，请直接用它）` };
  }

  const after = insertTerm(before, section, term);
  const tmp = `${file}.admin-tmp`;
  await fs.writeFile(tmp, after, { encoding: 'utf8' });
  await fs.rename(tmp, file);

  // 复核：写进去的词必须真的能被 new-content.sh 读到，否则恢复原文件。
  let taxonomy;
  try {
    taxonomy = await readTaxonomy(repoRoot);
  } catch (err) {
    await fs.writeFile(file, before, { encoding: 'utf8' });
    return { ok: false, error: `写入后复核失败，已恢复原词表：${err.message}` };
  }
  if (!taxonomy[section].includes(term)) {
    await fs.writeFile(file, before, { encoding: 'utf8' });
    return { ok: false, error: '写入的词条没能被脚本读到，已恢复原词表' };
  }
  return { ok: true, term, section, taxonomy };
}
