#!/usr/bin/env node
// 把 GitHub Actions 的 uses 从可变标签（@v4）改成 commit SHA 固定（@<sha> # v4.2.2）。
//
// 为什么要固定：标签是**可变的**——上游把 v4 这个标签移到别的提交上，你的 CI 就会在
// 没有改任何代码的情况下跑到另一份代码。固定 SHA 是唯一不可变的锚点。
// 固定后靠 .github/dependabot.yml 保持更新（只固定不给更新通道等于假安全）。
//
// 用法：
//   node scripts/pin-actions.mjs --dry-run   # 只打印将要做的改动
//   node scripts/pin-actions.mjs             # 实际改写
//
// 需要网络（GitHub API）。未认证时每小时 60 次，够用；如需更高额度可设 GITHUB_TOKEN。
// 幂等：已是 40 位 SHA 的条目会跳过，重复运行不会二次改写。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const DRY = process.argv.includes('--dry-run');
const TOKEN = process.env.GITHUB_TOKEN || '';

// 直接走文件系统而不是 git ls-files：新增但还没 git add 的 workflow 也必须能被固定
function collect() {
  const out = [];
  const wf = '.github/workflows';
  if (existsSync(wf)) {
    for (const f of readdirSync(wf)) if (/\.ya?ml$/.test(f)) out.push(`${wf}/${f}`);
  }
  const acts = '.github/actions';
  if (existsSync(acts)) {
    for (const d of readdirSync(acts, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      for (const f of ['action.yml', 'action.yaml']) {
        if (existsSync(`${acts}/${d.name}/${f}`)) out.push(`${acts}/${d.name}/${f}`);
      }
    }
  }
  return out.sort();
}
const FILES = collect();

if (!FILES.length) {
  console.error('✗ 没有找到 workflow / action 文件');
  process.exit(1);
}

const USES_RE = /^(\s*(?:-\s*)?uses:\s*)([^\s@]+)@([^\s#]+)\s*(?:#\s*(.*))?\s*$/;
const SHA_RE = /^[0-9a-f]{40}$/;

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'my-blog-pin-actions',
      ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`);
  return res.json();
}

const cache = new Map();
async function shaOfTag(repo, tag) {
  // tag 可能是轻量 tag（直接指向 commit）或 annotated tag（还要再指一层）
  const r = await api(`/repos/${repo}/git/ref/tags/${tag}`);
  if (r.object.type === 'tag') {
    const t = await api(`/repos/${repo}/git/tags/${r.object.sha}`);
    return t.object.sha;
  }
  return r.object.sha;
}

async function resolve(repo, ref) {
  const key = `${repo}@${ref}`;
  if (cache.has(key)) return cache.get(key);

  let result;
  // 形如 v4 的移动大版本标签 → 尽量换成该线内最新的具体版本（注释里写 v4.2.2 比 v4 有用得多）
  const major = ref.match(/^v(\d+)$/);
  if (major) {
    try {
      const tags = await api(`/repos/${repo}/tags?per_page=100`);
      const versions = tags
        .map((t) => t.name)
        .filter((n) => new RegExp(`^v${major[1]}\\.\\d+\\.\\d+$`).test(n))
        .sort((a, b) => {
          const pa = a.slice(1).split('.').map(Number);
          const pb = b.slice(1).split('.').map(Number);
          return pb[0] - pa[0] || pb[1] - pa[1] || pb[2] - pa[2];
        });
      if (versions.length) {
        const v = versions[0];
        result = { sha: await shaOfTag(repo, v), label: v };
      }
    } catch {
      /* 拿不到具体版本就退回按原 ref 解析 */
    }
  }
  if (!result) {
    try {
      result = { sha: await shaOfTag(repo, ref), label: ref };
    } catch {
      // 不是 tag 就按分支/任意 ref 解析
      const c = await api(`/repos/${repo}/commits/${ref}`);
      result = { sha: c.sha, label: ref };
    }
  }
  cache.set(key, result);
  return result;
}

let changed = 0;
let skipped = 0;
const report = [];

for (const file of FILES) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let dirty = false;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(USES_RE);
    if (!m) continue;
    const [, prefix, target, ref, comment] = m;
    if (target.startsWith('./') || target.startsWith('docker://')) continue; // 本地动作/容器镜像
    if (SHA_RE.test(ref)) {
      skipped++;
      continue;
    }
    const repo = target;
    let resolved;
    try {
      resolved = await resolve(repo, ref);
    } catch (e) {
      console.error(`✗ 无法解析 ${repo}@${ref}：${e.message}`);
      process.exitCode = 1;
      continue;
    }
    // 已经写了版本注释就保留，否则用解析到的具体版本
    const label = comment && comment.trim() ? comment.trim() : resolved.label;
    lines[i] = `${prefix}${repo}@${resolved.sha} # ${label}`;
    report.push(`  ${file}:${i + 1}  ${repo}@${ref}  →  ${resolved.sha.slice(0, 12)}… # ${label}`);
    changed++;
    dirty = true;
  }

  if (dirty && !DRY) writeFileSync(file, lines.join('\n'));
}

if (report.length) {
  console.log(DRY ? '▸ 将要固定（--dry-run，未改写）：' : '▸ 已固定为 commit SHA：');
  for (const r of report) console.log(r);
} else {
  console.log('· 所有 uses 都已是 commit SHA，无需改动');
}
if (skipped) console.log(`· 跳过 ${skipped} 条已固定的引用`);
if (DRY && report.length) console.log('\n去掉 --dry-run 即可实际改写。');
