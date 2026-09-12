// 标签词表读写。
//
// 读、写、校验**全部**走 scripts/new-content.sh，Node 侧不再自己解析或拼装 YAML：
//   读   ：new-content.sh tags
//   写   ：new-content.sh add-term <tags|categories> <词条>  （脚本内有写入后复核与失败回滚）
//   校验 ：new-content.sh add-term --check <tags|categories> <词条>
//
// 为什么这样拆：词表的分节与缩进格式被脚本按行 grep 依赖，解析/写入逻辑只应该有一份。
// 早先 Node 侧自己实现了一份「插到分节末尾、尾部空行之前」的写入逻辑（对应 add_term），
// 那是第二份实现，只靠「写完再复核」兜底 —— 现在统一交给 add-term，重复实现已经删掉。

import { runScript } from './exec.mjs';

export const SECTIONS = ['tags', 'categories'];

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

// 取出脚本报错里的第一句「✗ …」作为给用户看的理由
function cleanError(text) {
  const raw = String(text ?? '');
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith('✗'));
  const msg = (line ?? raw.trim()).replace(/^✗\s*/, '');
  return msg || '词表校验失败';
}

// 只校验（含重名与大小写检查），不写文件。返回 null = 可用，否则返回错误说明。
export async function checkTerm(repoRoot, section, term) {
  const { code, stdout, stderr } = await runScript(repoRoot, 'scripts/new-content.sh', [
    'add-term',
    '--check',
    section,
    term,
  ]);
  if (code === 0) return null;
  return cleanError(stderr || stdout);
}

export async function addTerm(repoRoot, section, term) {
  if (!SECTIONS.includes(section)) {
    return { ok: false, error: `未知分节：${section}（只支持 ${SECTIONS.join(' / ')}）` };
  }

  const { code, stdout, stderr } = await runScript(repoRoot, 'scripts/new-content.sh', [
    'add-term',
    section,
    term,
  ]);
  if (code !== 0) {
    return { ok: false, error: cleanError(stderr || stdout) };
  }

  // 已存在时脚本会打印「…已在…里，未改动」，管理页把它当成功处理（重复提交是正常操作）
  const alreadyPresent = /已在/.test(stdout);

  let taxonomy;
  try {
    taxonomy = await readTaxonomy(repoRoot);
  } catch (err) {
    return { ok: false, error: `词条已写入，但重新读取词表失败：${err.message}` };
  }
  return { ok: true, term, section, alreadyPresent, taxonomy };
}
