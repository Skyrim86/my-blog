// 改动查看与发布。发布完全交给 scripts/push-blog.sh：分支校验、构建校验、
// 草稿与词表警告、add/commit/push、CI 状态那条链路一行都不复制到这里。

import { git, spawnScript } from './exec.mjs';

export async function branch(repoRoot) {
  const { stdout, code } = await git(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return code === 0 ? stdout.trim() : '';
}

export async function aheadCount(repoRoot) {
  const { stdout, code } = await git(repoRoot, ['rev-list', '--count', '@{u}..HEAD']);
  if (code !== 0) return null;
  const n = Number.parseInt(stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export async function status(repoRoot) {
  const { stdout, code, stderr } = await git(repoRoot, ['status', '--porcelain', '-uall']);
  if (code !== 0) throw new Error(`git status 失败：${(stderr || stdout).trim()}`);
  const entries = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    const xy = line.slice(0, 2);
    let p = line.slice(3);
    if (p.includes(' -> ')) p = p.split(' -> ').pop();
    entries.push({
      xy,
      path: p.replace(/^"|"$/g, ''),
      staged: xy[0] !== ' ' && xy[0] !== '?',
      untracked: xy === '??',
    });
  }
  return { entries, branch: await branch(repoRoot), ahead: await aheadCount(repoRoot) };
}

export async function diff(repoRoot, relPath = null, { staged = false } = {}) {
  const args = ['diff', '--no-color'];
  if (staged) args.push('--cached');
  if (relPath) args.push('--', relPath);
  const { stdout, code, stderr } = await git(repoRoot, args, { maxBuffer: 16 * 1024 * 1024 });
  if (code !== 0) return { ok: false, error: (stderr || stdout).trim() };
  return { ok: true, diff: stdout };
}

// 未跟踪文件的 diff 要特殊处理：git diff 看不到它们。
export async function untrackedDiff(repoRoot, relPath, maxLines = 400) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  try {
    const text = await fs.readFile(path.join(repoRoot, relPath), 'utf8');
    const lines = text.split(/\r?\n/);
    const shown = lines.slice(0, maxLines).map((l) => `+${l}`);
    if (lines.length > maxLines) shown.push(`+…（还有 ${lines.length - maxLines} 行）`);
    return { ok: true, diff: `--- 新文件：${relPath} ---\n${shown.join('\n')}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// 起 push-blog.sh：调用方接 child.stdout / child.stderr 做流式回传。
// 注意 spawnScript 是 async 的（要先解析 bash），所以这里是同步返回不了的 ——
// 内部同步解析会阻塞事件循环，改用 spawnSync 也不合适；调用方必须 await。
export async function publish(repoRoot, message) {
  return spawnScript(repoRoot, 'scripts/push-blog.sh', [message || 'chore: 更新博客内容'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function recentCommits(repoRoot, limit = 5) {
  const { stdout, code } = await git(repoRoot, ['log', `-${limit}`, '--pretty=%h %s']);
  return code === 0 ? stdout.trim().split(/\r?\n/).filter(Boolean) : [];
}
