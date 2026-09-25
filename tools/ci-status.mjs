#!/usr/bin/env node
// CI 结果复核：拿刚推上去的那个 SHA 去问 GitHub，等这次 run 跑完，把结论带回来。
//
// 为什么要它（2026-09-25）：push-blog.sh 原来靠 `gh run list` 报 CI 状态，而本机没装、也没登录 gh
// —— 于是「请到 Actions 页面查看」这句话跟着 13 次红色 run 一路打了 13 遍：本地每次都显示
// 「✓ 推送完成」，线上从 09-24 中午起再没部署过。复核一旦是可选的、静默的，它就等于没有。
//
// 用法：node tools/ci-status.mjs [sha] [--wait 秒] [--repo owner/name] [--api URL]
//   不带 sha 时取 HEAD；仓库默认从 origin 的 URL 推出来；--wait 默认 600 秒（CI_WAIT 可覆盖）。
//
// 退出码：0 = 这次 run 全部成功；1 = 有 run 失败（并列出失败的 job/step 与注解）；
//         0 但带 ⚠ = 问不到 GitHub（网络/额度）或等超时，**状态未复核**（措辞会写清，不含糊）。
//
// **不需要 token**：仓库是 public，匿名调 api.github.com 够用（一次复核 3~4 次请求，额度 60/小时）。
// 别走代理 —— 本机 127.0.0.1:7891 连 api.github.com 是失败的（直连才通），而 Node 自带的 fetch
// 默认忽略 HTTPS_PROXY，正好。
import { execFileSync } from 'node:child_process';

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const WAIT = Number(arg('--wait', process.env.CI_WAIT || 600));
const API = arg('--api', process.env.CI_API || 'https://api.github.com').replace(/\/+$/, '');
const REPO_ARG = arg('--repo', '');
const POLL_MS = 15000;

const git = (args) => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
};

function repoSlug() {
  if (REPO_ARG) return REPO_ARG;
  const url = git(['remote', 'get-url', 'origin']);
  // git@github.com:owner/name.git  |  https://github.com/owner/name(.git)
  const m = url.match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?$/);
  return m ? `${m[1]}/${m[2]}` : '';
}

const sha = arg('--sha', argv.find((a) => /^[0-9a-f]{7,40}$/.test(a)) || git(['rev-parse', 'HEAD']));
const repo = repoSlug();

const short = sha ? sha.slice(0, 7) : '';
const webUrl = `https://github.com/${repo || 'Skyrim86/my-blog'}/actions`;

if (!sha || !repo) {
  console.log(`⚠ CI 状态未复核：${!sha ? '拿不到 SHA' : '从 origin 推不出 owner/name'}。去 ${webUrl} 看`);
  process.exit(0);
}

// ---------- 取数 ----------
async function apiGet(path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'push-blog-ci-status' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

async function reportFailure(runs) {
  for (const run of runs) {
    console.log(`✗ ${run.name}：${run.conclusion}（${run.html_url}）`);
    try {
      const jobs = await apiGet(`/repos/${repo}/actions/runs/${run.id}/jobs`);
      for (const job of jobs.jobs || []) {
        if (job.conclusion === 'success' || job.conclusion === 'skipped') continue;
        console.log(`    JOB ${job.name} → ${job.conclusion}`);
        for (const st of job.steps || []) {
          if (st.conclusion === 'success' || st.conclusion === 'skipped' || !st.conclusion) continue;
          console.log(`      ✗ ${st.number}. ${st.name} → ${st.conclusion}`);
        }
      }
    } catch (e) {
      console.log(`    （拉 jobs 失败：${cut(e.message, 80)}）`);
    }
  }
  // 注解里往往就是那行真正的报错（`::error` / 原生异常），比 step 名更有用
  try {
    const cr = await apiGet(`/repos/${repo}/commits/${sha}/check-runs`);
    let shown = 0;
    for (const c of cr.check_runs || []) {
      if (c.conclusion === 'success' || c.conclusion === 'skipped' || !c.conclusion) continue;
      const a = await apiGet(`/repos/${repo}/check-runs/${c.id}/annotations`);
      for (const an of a || []) {
        if (shown >= 6) break;
        console.log(`    [${an.annotation_level}] ${cut(an.title, 60)} :: ${cut(an.message, 300)}`);
        shown++;
      }
    }
    if (!shown) console.log('    （这次 run 没有注解；点上面的链接看日志）');
  } catch (e) {
    console.log(`    （拉注解失败：${cut(e.message, 80)}）`);
  }
}

// ---------- 轮询 ----------
const t0 = Date.now();
let netFail = 0;
console.log(`▸ CI 复核：${repo}@${short}，最长等 ${WAIT}s（CI_WAIT 可改）`);

for (;;) {
  let data = null;
  try {
    data = await apiGet(`/repos/${repo}/actions/runs?per_page=30`);
    netFail = 0;
  } catch (e) {
    netFail++;
    if (netFail >= 3) {
      console.log(`⚠ CI 状态未复核：连着 3 次问不到 GitHub（${cut(e.message, 60)}，API ${API}）。`);
      console.log(`   直连试试：curl -s -o /dev/null -w '%{http_code}' ${API}/repos/${repo}；去 ${webUrl} 看`);
      process.exit(0);
    }
  }

  if (data) {
    const mine = (data.workflow_runs || []).filter((r) => r.head_sha === sha || r.head_sha.startsWith(sha));
    const running = mine.filter((r) => r.status !== 'completed');
    if (mine.length && !running.length) {
      const bad = mine.filter((r) => r.conclusion !== 'success');
      const secs = Math.round((Date.now() - t0) / 1000);
      if (!bad.length) {
        const names = mine.map((r) => `${r.name} ${r.conclusion}`).join('；');
        console.log(`✓ CI 复核通过（${secs}s）：${names}`);
        process.exit(0);
      }
      console.log(`✗ CI 复核不通过（${secs}s）：`);
      await reportFailure(bad);
      process.exit(1);
    }
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const state = mine.length
      ? mine.map((r) => `${r.name} ${r.status}`).join('；')
      : '还没有这次 SHA 的 run（刚推上去的几秒内是正常的）';
    console.log(`  · ${elapsed}s ${state}`);
  }

  if (Date.now() - t0 >= WAIT * 1000) {
    console.log(`⚠ CI 状态未复核：等了 ${WAIT}s 还没跑完（推送本身已完成）。去 ${webUrl} 看`);
    process.exit(0);
  }
  await sleep(POLL_MS);
}
