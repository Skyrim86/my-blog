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

/* ---------------- Python ---------------- */
// 管理页本身是零依赖 Node，但 tools/ 下有一批 Python 生成器（课程导入、封面、图标），
// 知识库发布器（tools/wiki-publish/publish.py）也是 Python。所以这里只做一件事：
// 找到可用的 Python，并且**确认它装了 PyYAML** —— 缺依赖时要在这里说清楚，
// 而不是让脚本抛一堆 traceback 到界面上。
const PYTHON_CANDIDATES = [process.env.ADMIN_PYTHON, 'python', 'python3', 'py'].filter(Boolean);
let cachedPython = null;

export async function resolvePython() {
  if (cachedPython) return cachedPython;
  let sawPythonWithoutYaml = false;
  for (const candidate of PYTHON_CANDIDATES) {
    if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
    let withYaml;
    try {
      withYaml = await run(candidate, ['-c', 'import yaml'], { cwd: process.cwd(), timeoutMs: 20000 });
    } catch {
      continue; // 这个候选根本起不来（ENOENT 等），试下一个
    }
    if (withYaml.code === 0) {
      cachedPython = candidate;
      return candidate;
    }
    try {
      const plain = await run(candidate, ['-c', 'print(1)'], { cwd: process.cwd(), timeoutMs: 20000 });
      if (plain.code === 0) sawPythonWithoutYaml = true;
    } catch {
      /* 忽略：只是用来区分「没有 Python」与「Python 缺 PyYAML」 */
    }
  }
  if (sawPythonWithoutYaml) {
    throw new Error('找到了 Python，但它缺少 PyYAML。请运行：python -m pip install pyyaml（或用 ADMIN_PYTHON 指定另一个解释器）。');
  }
  throw new Error('找不到可用的 Python。发布知识库卡片需要 Python 3.11+ 与 PyYAML；可用 ADMIN_PYTHON 环境变量指定绝对路径。');
}

// 跑仓库里的一个 Python 脚本（相对仓库根，如 tools/wiki-publish/publish.py）。
export async function runPythonScript(repoRoot, scriptRelPath, args = [], opts = {}) {
  const python = await resolvePython();
  return run(python, [scriptRelPath, ...args], { cwd: repoRoot, ...opts });
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
