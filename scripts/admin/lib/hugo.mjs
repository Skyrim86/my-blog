// 本地预览：托管 hugo server -D 子进程，供管理页 iframe 嵌入。
//
// 沿用 scripts/preview.sh 的语义（含草稿），站点在 baseURL 的子路径 /my-blog/ 下。
// 两点与 preview.sh 不同，都是为了嵌入 iframe：
//   - 不传 --navigateToChanged：那个功能会驱动浏览器跳转，在 iframe 里反而会打架；
//     Hugo 自带 livereload 脚本已经能让 iframe 在保存后自动刷新。
//   - 加 --disableFastRender：否则新建的文件不会真正出现在站点里（见下）。

import { spawn } from 'node:child_process';
import net from 'node:net';

export function probePort(port, host = '127.0.0.1', timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

export async function findFreePort(start, host = '127.0.0.1', tries = 25) {
  for (let p = start; p < start + tries; p++) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await probePort(p, host, 300))) return p;
  }
  throw new Error(`从 ${start} 起连续 ${tries} 个端口都被占用了`);
}

export class HugoPreview {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.child = null;
    this.port = null;
    this.ready = false;
    this.exited = false;
    this.exitCode = null;
    this.error = null;
    this.log = [];
    this.stopping = false;
  }

  status() {
    return {
      running: Boolean(this.child) && !this.exited,
      ready: this.ready,
      port: this.port,
      exitCode: this.exitCode,
      error: this.error,
      log: this.log.slice(-40),
    };
  }

  push(text) {
    for (const line of String(text).split(/\r?\n/)) {
      if (line.trim() !== '') this.log.push(line.trimEnd());
    }
    if (this.log.length > 400) this.log = this.log.slice(-200);
  }

  async start(preferredPort = 1313) {
    if (this.child && !this.exited) return this.status();
    this.error = null;
    this.exited = false;
    this.exitCode = null;
    this.ready = false;
    this.log = [];

    const port = await findFreePort(preferredPort);
    this.port = port;

    let child;
    try {
      // --disableFastRender 是必需的：Fast Render Mode 下新建的文件（管理页最常见的动作）
      // 只会触发一次局部重建，新页面拿不到 200，预览看上去像没生效。
      // --buildFuture：预览要能看到「日期写在未来」的排期文章（CI 不会发布它们，界面上有提醒）。
      child = spawn('hugo', ['server', '-D', '-F', '--disableFastRender', '--port', String(port), '--bind', '127.0.0.1'], {
        cwd: this.repoRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      this.error = `无法启动 hugo：${err.message}`;
      throw err;
    }
    this.child = child;
    child.stdout.on('data', (d) => this.push(d));
    child.stderr.on('data', (d) => {
      this.push(d);
      if (/Web Server is available at/i.test(String(d))) this.ready = true;
    });
    child.on('error', (err) => {
      this.error = `hugo 启动失败：${err.message}`;
      this.exited = true;
    });
    child.on('close', (code) => {
      this.ready = false;
      if (!this.stopping) {
        this.exited = true;
        this.exitCode = code;
      }
    });

    // 就绪判定：以端口真的能连上为准（hugo 的提示行会因版本而异）。
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      if (await probePort(port)) {
        this.ready = true;
        break;
      }
      if (this.exited) break;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!this.ready && !this.error && this.exited) {
      this.error = `hugo server 已退出（退出码 ${this.exitCode}）`;
    }
    return this.status();
  }

  async stop() {
    const child = this.child;
    if (!child || this.exited) {
      this.child = null;
      this.ready = false;
      return this.status();
    }
    this.stopping = true;
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (process.platform === 'win32' && child.pid) {
          const tk = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
          tk.on('close', () => resolve());
          tk.on('error', () => resolve());
        } else {
          try {
            child.kill('SIGKILL');
          } catch {
            /* 已经退出 */
          }
          resolve();
        }
      }, 2500);
      child.once('close', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        child.kill();
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
    this.child = null;
    this.ready = false;
    this.exited = true;
    this.stopping = false;
    return this.status();
  }
}
