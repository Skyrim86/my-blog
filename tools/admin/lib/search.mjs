// 正文全文搜索：给命令面板用（Ctrl+K 里直接搜正文，命中后跳到编辑器打开的那一行）。
//
// 为什么放在服务端：内容是磁盘上的 .md，前端手里的 store.items 只有标题与路径；
// 把 39 个文件的正文塞进浏览器不值当，而且搜索要跟着磁盘变（保存后立刻能搜到新内容）。
//
// 实现按 mtime+size 缓存每个文件的行数组：连续搜索（每敲一个字符搜一次）时只重读改过的文件。
import fs from 'node:fs/promises';
import path from 'node:path';

import { contentRoot } from './content.mjs';

const cache = new Map(); // abs → { mtimeMs, size, lines }

async function walk(dir, out) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) await walk(abs, out);
    else if (e.isFile() && /\.md$/i.test(e.name)) out.push(abs);
  }
  return out;
}

async function linesOf(abs) {
  const st = await fs.stat(abs);
  const hit = cache.get(abs);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.lines;
  const text = await fs.readFile(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  cache.set(abs, { mtimeMs: st.mtimeMs, size: st.size, lines });
  return lines;
}

export function invalidateSearchCache() {
  cache.clear();
}

// 命中规则：标题（front matter 的 title 或第一个 # 标题）优先，其次正文行。
// 每个文件最多给 3 条正文命中——否则一篇公式密集的文章会把结果列表整个占满。
export async function searchContent(repoRoot, query, { limit = 60, perFile = 3 } = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  if (q.length < 1) return { query: '', hits: [], truncated: false, files: 0 };

  const root = contentRoot(repoRoot);
  const files = await walk(root, []);
  const hits = [];
  let truncated = false;

  for (const abs of files) {
    let lines;
    try {
      lines = await linesOf(abs);
    } catch {
      continue;
    }
    const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
    const title = titleOf(lines);
    if (title.toLowerCase().includes(q) || rel.toLowerCase().includes(q)) {
      hits.push({ kind: 'title', path: rel, title, line: 0, text: rel });
    }
    let bodyHits = 0;
    for (let i = 0; i < lines.length && bodyHits < perFile; i++) {
      const line = lines[i];
      if (!line.toLowerCase().includes(q)) continue;
      // front matter 里的 title/tags 已经在上面按「标题命中」处理过，不再重复列一遍
      hits.push({ kind: 'body', path: rel, title, line: i + 1, text: line.trim().slice(0, 200) });
      bodyHits += 1;
    }
    if (hits.length >= limit) {
      truncated = true;
      break;
    }
  }
  return { query: String(query ?? '').trim(), hits: hits.slice(0, limit), truncated, files: files.length };
}

function titleOf(lines) {
  let inFm = false;
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i];
    if (i === 0 && line.trim() === '---') {
      inFm = true;
      continue;
    }
    if (inFm) {
      if (line.trim() === '---') {
        inFm = false;
        continue;
      }
      const m = /^title:\s*(.+?)\s*$/.exec(line);
      if (m) return m[1].replace(/^["']|["']$/g, '');
      continue;
    }
    const h = /^#\s+(.+?)\s*$/.exec(line);
    if (h) return h[1];
  }
  return '';
}
