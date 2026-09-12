// 起子进程的公共层：解析 bash、统一 execFile/spawn 参数。
//
// 所有脚本调用都走 execFile + 参数数组，不经 shell、不做字符串拼接 —— 表单里的标题、
// 文件名会直接变成 argv，拼接字符串就等于给自己开了命令注入口子。

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASH_CANDIDATES = [
  process.env.ADMIN_BASH,
  'bash',
  path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
  path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'bin', 'bash.exe'),
];

let cachedBash = null;

function probe(candidate) {
  return new Promise((resolve) => {
    let child;
    try {
      child = execFile(candidate, ['--version'], { windowsHide: true, timeout: 10000 });
    } catch {
      resolve(null);
      return;
    }
    let out = '';
    child.stdout?.on('data', (d) => {
      out += d;
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => {
      resolve(code === 0 && /bash/i.test(out) ? candidate : null);
    });
  });
}

export async function resolveBash() {
  if (cachedBash) return cachedBash;
  for (const candidate of BASH_CANDIDATES) {
    if (!candidate) continue;
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    const ok = await probe(candidate);
    if (ok) {
      cachedBash = ok;
      return ok;
    }
  }
  throw new Error(
    '找不到可用的 bash。请确认已安装 Git for Windows，或用 ADMIN_BASH 环境变量指定 bash.exe 的绝对路径。'
  );
}

// 跑一个命令并等它结束。非零退出码不抛异常，交给调用方判断（脚本的 ✗ 提示在 stderr 里）。
export function run(cmd, args, { cwd, input = null, timeoutMs = 300000, maxBuffer = 32 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      cmd,
      args,
      { cwd, windowsHide: true, timeout: timeoutMs, maxBuffer, encoding: 'utf8' },
      (err, stdout, stderr) => {
        if (err && err.code === 'ENOENT') {
          reject(new Error(`找不到可执行文件：${cmd}`));
          return;
        }
        const code = err && typeof err.code === 'number' ? err.code : err ? 1 : 0;
        resolve({ code, stdout: stdout ?? '', stderr: stderr ?? '', timedOut: Boolean(err?.killed) });
      }
    );
    if (input != null) {
      child.stdin.end(input);
    } else {
      child.stdin.end();
    }
  });
}

// 跑 scripts/ 下的一个 bash 脚本。
export async function runScript(repoRoot, scriptRelPath, args = [], opts = {}) {
  const bash = await resolveBash();
  return run(bash, [scriptRelPath, ...args], { cwd: repoRoot, ...opts });
}

// 起一个长时间运行的脚本（发布、hugo server），调用方自己接 stdout/stderr。
export async function spawnScript(repoRoot, scriptRelPath, args = [], opts = {}) {
  const bash = await resolveBash();
  return spawn(bash, [scriptRelPath, ...args], {
    cwd: repoRoot,
    windowsHide: true,
    ...opts,
  });
}

// git 包装：core.quotePath=false 让中文路径原样返回，而不是 \346\226\207 这种转义。
export async function git(repoRoot, args, opts = {}) {
  return run('git', ['-c', 'core.quotePath=false', ...args], { cwd: repoRoot, ...opts });
}
