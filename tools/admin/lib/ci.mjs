// CI（GitHub Actions）状态：发布页显示最近几次运行。
//
// 不用 gh CLI：本机的 gh 装过但没登录（`gh auth status` 报未登录），而仓库是公开的，
// 未认证的 GitHub REST 也能拿到运行结果；想提高限流额度时把 GH_TOKEN / GITHUB_TOKEN
// 放进环境变量即可，代码不用改。
//
// 用 curl 子进程而不是 fetch：这台机器上 Node 的 fetch 直连 api.github.com 会挂
// （实测 socket 超时 / 504），同一个地址走本地 HTTP 代理 7s 就回 200。curl 自己会读
// HTTPS_PROXY，也能用 --proxy 显式指定，所以「走不走代理」交给它，代码里不写死端口。
// 代理来源（按优先级）：ADMIN_PROXY → HTTPS_PROXY → https_proxy（start.sh 会自动探测
// 常见的本地端口并设 ADMIN_PROXY）。都没有也不影响别的功能：CI 面板只说「读不到」。
import { run, git } from './exec.mjs';

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_S = 25;
let cache = { at: 0, value: null };

export function invalidateActionsCache() {
  cache = { at: 0, value: null };
}

function proxyArgs() {
  const p = process.env.ADMIN_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy || '';
  return p ? ['--proxy', p] : [];
}

// origin 形如 git@github.com:owner/repo.git 或 https://github.com/owner/repo.git
async function ownerRepo(repoRoot) {
  const res = await git(repoRoot, ['remote', 'get-url', 'origin']);
  const url = (res.stdout || '').trim();
  const m = /github\.com[:/]+([^/]+)\/([^/?#]+?)(?:\.git)?$/i.exec(url);
  return m ? { owner: m[1], repo: m[2] } : null;
}

function shape(run_) {
  return {
    id: run_.id,
    name: run_.name,
    event: run_.event,
    status: run_.status,
    conclusion: run_.conclusion,
    branch: run_.head_branch,
    sha: String(run_.head_sha ?? '').slice(0, 7),
    title: (run_.display_title || run_.name || '').trim(),
    createdAt: run_.created_at,
    updatedAt: run_.updated_at,
    url: run_.html_url,
  };
}

export async function actionsStatus(repoRoot, { limit = 6, force = false } = {}) {
  if (!force && cache.value && Date.now() - cache.at < TTL_MS) return cache.value;

  let target = null;
  try {
    target = await ownerRepo(repoRoot);
  } catch {
    target = null;
  }
  if (!target) {
    const value = { ok: false, error: '这个仓库没有 GitHub origin，CI 状态不适用' };
    cache = { at: Date.now(), value };
    return value;
  }

  const url = `https://api.github.com/repos/${target.owner}/${target.repo}/actions/runs?per_page=${Math.min(Math.max(limit, 1), 20)}`;
  const args = [
    '-sS',
    '--max-time',
    String(TIMEOUT_S),
    '-H',
    'Accept: application/vnd.github+json',
    '-H',
    'User-Agent: blog-admin',
    ...proxyArgs(),
  ];
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (token) args.push('-H', `Authorization: Bearer ${token}`);
  args.push(url);

  let res;
  try {
    res = await run('curl', args, { cwd: repoRoot, timeoutMs: (TIMEOUT_S + 5) * 1000 });
  } catch (err) {
    const value = { ok: false, error: `调用 curl 失败：${err.message}` };
    cache = { at: Date.now(), value };
    return value;
  }

  const text = (res.stdout || '').trim();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (res.code !== 0 || !data) {
    const detail = text ? `：${text.slice(0, 200)}` : '';
    const value = {
      ok: false,
      error: `访问 GitHub API 失败（退出码 ${res.code}）${detail}`,
      note: '需要代理时设置 ADMIN_PROXY，例如 http://127.0.0.1:7891',
    };
    cache = { at: Date.now(), value };
    return value;
  }
  if (data.message) {
    // 未认证的限流（60 次/小时）或私有仓库：把 GitHub 的原话带上，别自己编原因
    const value = { ok: false, error: `GitHub 说：${String(data.message).slice(0, 200)}`, note: '设置 GH_TOKEN 可提高限流额度' };
    cache = { at: Date.now(), value };
    return value;
  }

  const value = {
    ok: true,
    repo: `${target.owner}/${target.repo}`,
    authenticated: Boolean(token),
    runs: (data.workflow_runs ?? []).map(shape),
  };
  cache = { at: Date.now(), value };
  return value;
}
