#!/usr/bin/env node
// 博客本地管理页的服务端。零依赖：只用 node: 内置模块。
//
// 它是现有脚本的「界面外壳」，不是替代品：
//   新建内容 → scripts/new-content.sh（front matter 来自 archetypes/，标签来自 data/taxonomy.yaml）
//   删除内容 → scripts/new-content.sh remove（能删什么、能不能连目录删，规则都在那边）
//   读词表   → scripts/new-content.sh tags
//   发布     → scripts/push-blog.sh（分支校验、构建校验、草稿与词表警告、commit、push、CI 状态）
//
// 因为本服务能执行 shell 命令，安全边界按「只在可信本地使用」设计：
//   - 默认只绑 127.0.0.1
//   - 校验 Host 白名单（防 DNS rebinding：外来域名解析到 127.0.0.1 也会被拒）
//   - 所有写操作要求自定义头 X-Admin-Request: 1（防其他网页对本地端口发跨站 POST）
//   - 所有 path 参数限制在 content/ 内

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  buildCreateArgs,
  buildRemoveArgs,
  chaptersByCourse,
  classify,
  courseDirs,
  createdFiles,
  editorSchema,
  layeredProjectDirs,
  listContent,
  invalidatePermalinks,
  parseFrontMatter,
  planFiles,
  previewUrl,
  projectDirs,
  readContentFile,
  relFromRoot,
  removedFiles,
  resolveContentPath,
} from './lib/content.mjs';
import { addTerm, checkTerm, readTaxonomy } from './lib/taxonomy.mjs';
import * as gitlib from './lib/git.mjs';
import { HugoPreview } from './lib/hugo.mjs';
import { resolveBash, runScript, git } from './lib/exec.mjs';
import { splitFrontMatter, setField, setChildField, yamlList, yamlStr } from './lib/frontmatter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.join(HERE, 'ui');

// ---------------- 参数 ----------------

function parseArgs(argv) {
  const out = { port: 1414, host: '127.0.0.1', preview: true, previewPort: 1313, repo: null, basePath: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--port') out.port = Number(next());
    else if (a.startsWith('--port=')) out.port = Number(a.slice(7));
    else if (a === '--host') out.host = next();
    else if (a.startsWith('--host=')) out.host = a.slice(7);
    else if (a === '--preview-port') out.previewPort = Number(next());
    else if (a.startsWith('--preview-port=')) out.previewPort = Number(a.slice(15));
    else if (a === '--repo') out.repo = next();
    else if (a.startsWith('--repo=')) out.repo = a.slice(7);
    else if (a === '--base-path') out.basePath = next();
    else if (a.startsWith('--base-path=')) out.basePath = a.slice(12);
    else if (a === '--no-preview') out.preview = false;
    else if (a === '-h' || a === '--help') {
      console.log(`用法：node scripts/admin/server.mjs [选项]
  --port N          管理页端口（默认 1414）
  --host H          绑定地址（默认 127.0.0.1；只有显式传 0.0.0.0 才会暴露到局域网）
  --preview-port N  预览端口（默认 1313，被占用时自动顺延）
  --no-preview      不启动 hugo server
  --base-path P     站点子路径（默认从 hugo.toml 的 baseURL 推导）
  --repo PATH       仓库根（默认取 git rev-parse --show-toplevel）`);
      process.exit(0);
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

async function findRepoRoot() {
  if (args.repo) return path.resolve(args.repo);
  const { stdout, code } = await git(process.cwd(), ['rev-parse', '--show-toplevel']);
  if (code === 0 && stdout.trim()) return stdout.trim();
  // scripts/admin/server.mjs → 上溯三级
  return path.resolve(HERE, '..', '..');
}

async function readBasePath(repoRoot) {
  if (args.basePath) return args.basePath;
  try {
    const toml = await fs.readFile(path.join(repoRoot, 'hugo.toml'), 'utf8');
    const m = /^\s*baseURL\s*=\s*['"]([^'"]+)['"]/m.exec(toml);
    if (m) {
      const u = new URL(m[1]);
      return u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`;
    }
  } catch {
    /* 回退到默认值 */
  }
  return '/my-blog/';
}

// 站点时区（hugo.toml 的 timeZone）。用它算「站点的今天」，用于提醒排期在未来日期的页面：
// 那种页面 push 上去 CI 也不会构建（Hugo 默认 buildFuture = false），是静默不上线的典型。
async function readSiteTimeZone(repoRoot) {
  try {
    const toml = await fs.readFile(path.join(repoRoot, 'hugo.toml'), 'utf8');
    const m = /^\s*timeZone\s*=\s*['"]([^'"]+)['"]/m.exec(toml);
    if (m) return m[1];
  } catch {
    /* 用默认值 */
  }
  return 'UTC';
}

function todayInTz(timeZone) {
  try {
    // en-CA 的格式就是 YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// date 只写到日（archetypes 就是这样），字符串比较即可
function isFutureDate(dateValue, today) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateValue ?? ''));
  if (!m) return false;
  return `${m[1]}-${m[2]}-${m[3]}` > today;
}

const REPO_ROOT = await findRepoRoot();
const BASE_PATH = await readBasePath(REPO_ROOT);
const SITE_TZ = await readSiteTimeZone(REPO_ROOT);
const preview = new HugoPreview(REPO_ROOT);

let bashInfo = { ok: false, path: null, error: null };
try {
  bashInfo = { ok: true, path: await resolveBash(), error: null };
} catch (err) {
  bashInfo = { ok: false, path: null, error: err.message };
}

// ---------------- listContent 的短缓存（state 会频繁轮询） ----------------

let listCache = { at: 0, value: null };
async function listContentCached(force = false) {
  if (!force && listCache.value && Date.now() - listCache.at < 1500) return listCache.value;
  const value = await listContent(REPO_ROOT);
  listCache = { at: Date.now(), value };
  return value;
}
// 内容变化后要失效的缓存：文件清单，以及由 `hugo list all` 得来的 permalink 表
// （新建/保存会改变页面 URL，尤其是改 date / title / slug 时）。
function invalidateList() {
  listCache = { at: 0, value: null };
  invalidatePermalinks();
}

// ---------------- HTTP 工具 ----------------

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function fail(res, status, message) {
  json(res, status, { error: message });
}

async function readJsonBody(req, limit = 8 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('请求体过大'), { status: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 });
  }
}

// Host 白名单：本机名称 + 本机所有网卡地址。外来域名（哪怕解析到 127.0.0.1）一律拒绝。
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', os.hostname().toLowerCase()]);
for (const list of Object.values(os.networkInterfaces())) {
  for (const ni of list ?? []) {
    if (ni.address) ALLOWED_HOSTS.add(ni.address.toLowerCase());
  }
}

function hostAllowed(req) {
  const raw = req.headers.host;
  if (!raw) return false;
  let host = raw.trim().toLowerCase();
  if (host.startsWith('[')) host = host.slice(0, host.indexOf(']') + 1);
  else host = host.split(':')[0];
  return ALLOWED_HOSTS.has(host);
}

// ---------------- 业务处理 ----------------

async function handleState() {
  const st = await gitlib.status(REPO_ROOT);
  let items = [];
  try {
    items = await listContentCached();
  } catch {
    items = [];
  }
  const siteToday = todayInTz(SITE_TZ);
  return {
    repoRoot: REPO_ROOT,
    basePath: BASE_PATH,
    branch: st.branch,
    ahead: st.ahead,
    entries: st.entries,
    drafts: items.filter((i) => i.draft).map((i) => ({ path: i.path, title: i.title })),
    futureDated: items
      .filter((i) => !i.draft && isFutureDate(i.date, siteToday))
      .map((i) => ({ path: i.path, title: i.title, date: i.date })),
    siteTimeZone: SITE_TZ,
    siteToday,
    recentCommits: await gitlib.recentCommits(REPO_ROOT),
    preview: preview.status(),
    adminPort: args.port,
    previewPort: args.previewPort,
    previewEnabled: args.preview,
    bash: bashInfo,
    host: args.host,
  };
}

async function handleCreate(body) {
  if (!bashInfo.ok) throw Object.assign(new Error(bashInfo.error), { status: 500 });

  // 新标签：先写进词表，再建内容。
  // 这样做的两个好处：① 词表不会因为「用了一次的新词」而漏登记；
  // ② 校验发生在建文件之前，失败时不会留下半成品（与 new-content.sh 的设计一致）。
  const addedTerms = [];
  const requested = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
  if (body.allowNewTags && requested.length > 0) {
    const current = await readTaxonomy(REPO_ROOT);
    const known = new Set(current.tags.map((t) => t.toLowerCase()));
    const unknown = requested.filter((t) => !known.has(t.toLowerCase()));
    // 校验规则只有一份（在 new-content.sh 的 validate_term 里），这里只是先问一遍，
    // 好在建文件之前把不合格的新词一次性报出来。
    const invalid = [];
    for (const t of unknown) {
      // eslint-disable-next-line no-await-in-loop
      const error = await checkTerm(REPO_ROOT, 'tags', t);
      if (error) invalid.push({ term: t, error });
    }
    if (invalid.length > 0) {
      return {
        ok: false,
        code: 1,
        stdout: '',
        stderr: invalid.map((x) => `✗ 新标签「${x.term}」不能写入词表：${x.error}`).join('\n'),
        files: [],
        kind: body.kind,
      };
    }
    for (const term of unknown) {
      // eslint-disable-next-line no-await-in-loop
      const r = await addTerm(REPO_ROOT, 'tags', term);
      if (!r.ok) {
        return { ok: false, code: 1, stdout: '', stderr: `✗ 写入新标签「${term}」失败：${r.error}`, files: [], kind: body.kind };
      }
      addedTerms.push(term);
    }
  }

  const argv = buildCreateArgs({ ...body, allowNewTags: false });
  // 上面已经把新词写进词表了，所以这里不再传 --new-tag：脚本不会遇到「词表外的标签」，
  // 日志里显示的也就是真正需要的那条命令。
  let result;
  try {
    result = await runScript(REPO_ROOT, 'scripts/new-content.sh', argv);
  } finally {
    invalidateList();
  }
  return {
    ok: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    scriptArgs: argv,
    files: createdFiles(result.stdout),
    addedTerms,
    kind: body.kind,
  };
}

// 删除：规则（能删什么、能不能连目录删）都在 cmd_remove 里，这里只拼参数。
// dryRun=1 时脚本只列出会删掉哪些文件 —— 前端靠它做「先看清单、再确认」那一步。
async function handleDelete(body) {
  if (!bashInfo.ok) throw Object.assign(new Error(bashInfo.error), { status: 500 });
  const argv = buildRemoveArgs(body);
  let result;
  try {
    result = await runScript(REPO_ROOT, 'scripts/new-content.sh', argv);
  } finally {
    invalidateList();
    invalidatePermalinks();
  }
  return {
    ok: result.code === 0,
    code: result.code,
    stdout: result.stdout,
    stderr: result.stderr,
    scriptArgs: argv,
    plan: planFiles(result.stdout),
    removed: removedFiles(result.stdout),
    dryRun: Boolean(body.dryRun),
    path: argv[1],
  };
}

// 保存：只写「客户端声明改过」的字段，行级替换，其余内容（含注释、缩进）原样保留。
async function handleSave(body) {
  const abs = resolveContentPath(REPO_ROOT, body.path);
  const before = await fs.readFile(abs, 'utf8');
  const rel = relFromRoot(REPO_ROOT, abs);
  const type = classify(rel);
  const schema = editorSchema(type);
  const allowed = new Map(schema.fields.map((f) => [f.key, f]));
  let text = before;

  for (const change of Array.isArray(body.changed) ? body.changed : []) {
    const field = allowed.get(change.key);
    if (!field || field.kind === 'child') continue;
    const indent = typeof change.indent === 'string' ? change.indent : field.indent ?? '';
    let line;
    if (field.kind === 'list') {
      const list = (Array.isArray(change.value) ? change.value : []).map((v) => String(v).trim()).filter(Boolean);
      line = `${indent}${field.key}: ${yamlList(list)}`;
    } else if (field.kind === 'bool') {
      line = `${indent}${field.key}: ${change.value ? 'true' : 'false'}`;
    } else if (field.kind === 'number') {
      const n = Number.parseInt(String(change.value), 10);
      if (!Number.isFinite(n)) continue;
      line = `${indent}${field.key}: ${n}`;
    } else if (field.kind === 'date') {
      const v = String(change.value ?? '').trim();
      if (v === '') continue;
      // 与 archetypes 的写法一致：能裸写就裸写，避免把日期变成带引号的字符串
      line = /^\d{4}-\d{2}-\d{2}([T ].*)?$/.test(v)
        ? `${indent}${field.key}: ${v}`
        : `${indent}${field.key}: ${yamlStr(v)}`;
    } else {
      line = `${indent}${field.key}: ${yamlStr(change.value ?? '')}`;
    }
    text = setField(text, field.key, line, { indent });
  }

  for (const change of Array.isArray(body.coverChanges) ? body.coverChanges : []) {
    const key = `cover.${change.child}`;
    if (!allowed.has(key)) continue;
    text = setChildField(text, 'cover', change.child, change.value ?? '', { childIndent: '  ' });
  }

  if (typeof body.body === 'string') {
    const doc = splitFrontMatter(text);
    const currentBody = doc.hasFm ? doc.body.join(doc.eol) : text;
    if (currentBody !== body.body) {
      const bodyLines = body.body.split(/\r\n|\n/);
      const lines = doc.hasFm ? doc.lines.slice(0, doc.fmEnd + 1).concat(bodyLines) : bodyLines;
      text = lines.join(doc.eol);
    }
  }

  if (text !== before) {
    await fs.writeFile(abs, text, 'utf8');
    invalidateList();
  }
  const finalDoc = splitFrontMatter(text);
  return {
    ok: true,
    path: rel,
    changed: text !== before,
    hasFrontMatter: finalDoc.hasFm,
  };
}

async function handlePreviewUrl(query) {
  const rel = query.get('path');
  if (!rel) throw Object.assign(new Error('缺少 path 参数'), { status: 400 });
  const abs = resolveContentPath(REPO_ROOT, rel);
  const text = await fs.readFile(abs, 'utf8');
  const { values } = parseFrontMatter(text);
  const st = preview.status();
  // 地址由 Hugo 说了算（hugo list all 的 permalink）；列不到这一页时才退回启发式。
  const computed = await previewUrl(REPO_ROOT, BASE_PATH, rel, values);
  return {
    ...computed,
    previewRunning: st.running,
    previewReady: st.ready,
    previewPort: st.port,
    // hugo server 在 localhost 上仍然按 baseURL 的子路径提供服务，所以直接把同一路径换个 origin。
    href: st.running && st.port ? `http://127.0.0.1:${st.port}${computed.url}` : null,
  };
}

// ---------------- 发布（SSE 流式） ----------------

async function handlePublish(req, res, body) {
  const message = typeof body.message === 'string' && body.message.trim() !== '' ? body.message.trim() : 'chore: 更新博客内容';
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  let child;
  try {
    child = await gitlib.publish(REPO_ROOT, message);
  } catch (err) {
    send({ stream: 'err', text: `无法启动 push-blog.sh：${err.message}\n` });
    send({ event: 'done', code: 1 });
    res.end();
    return;
  }
  send({ event: 'start', message, command: `bash scripts/push-blog.sh "${message}"` });

  let finished = false;
  child.stdout.on('data', (d) => send({ stream: 'out', text: String(d) }));
  child.stderr.on('data', (d) => send({ stream: 'err', text: String(d) }));
  child.on('error', (err) => {
    send({ stream: 'err', text: `无法启动 push-blog.sh：${err.message}\n` });
  });
  child.on('close', (code) => {
    finished = true;
    invalidateList();
    send({ event: 'done', code });
    res.end();
  });
  // 客户端断开才杀进程。注意监听 res 而不是 req：req 的 'close' 在请求体读完时就会触发，
  // 那样会在发布刚开始时就把 push-blog.sh 杀掉。
  res.on('close', () => {
    if (!finished) {
      try {
        child.kill();
      } catch {
        /* 已退出 */
      }
    }
  });
}

// ---------------- 静态资源 ----------------

const STATIC_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function serveStatic(res, urlPath) {
  const name = urlPath === '/' || urlPath === '' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (!/^[A-Za-z0-9._-]+$/.test(name)) {
    fail(res, 403, '非法静态资源路径');
    return;
  }
  const abs = path.join(UI_DIR, name);
  try {
    const data = await fs.readFile(abs);
    res.writeHead(200, {
      'Content-Type': STATIC_TYPES[path.extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch {
    fail(res, 404, `找不到 ${name}`);
  }
}

// ---------------- 路由 ----------------

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  } catch {
    fail(res, 400, '非法 URL');
    return;
  }
  const { pathname, searchParams } = url;

  if (!hostAllowed(req)) {
    fail(res, 403, 'Host 不在白名单内（本服务只接受 localhost / 本机地址访问）');
    return;
  }

  const mutating = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE';
  if (mutating && req.headers['x-admin-request'] !== '1') {
    fail(res, 403, '缺少 X-Admin-Request 头：本服务只接受管理页自身的请求');
    return;
  }

  try {
    if (!pathname.startsWith('/api/')) {
      if (req.method !== 'GET') {
        fail(res, 405, '只支持 GET');
        return;
      }
      await serveStatic(res, pathname);
      return;
    }

    const route = `${req.method} ${pathname}`;
    switch (route) {
      case 'GET /api/state':
        json(res, 200, await handleState());
        return;
      case 'GET /api/taxonomy':
        json(res, 200, await readTaxonomy(REPO_ROOT));
        return;
      case 'POST /api/taxonomy/add': {
        const body = await readJsonBody(req);
        const result = await addTerm(REPO_ROOT, body.section, body.term);
        invalidateList();
        json(res, result.ok ? 200 : 400, result);
        return;
      }
      case 'GET /api/content/list': {
        const items = await listContentCached(true);
        // 表单里「所属课程 / 所属章节 / 所属项目 / 所属目录」的下拉选项由服务端算好一起下发，
        // 免得前端再实现一遍路径推导（两处实现必然漂移）。
        json(res, 200, {
          items,
          options: {
            courses: courseDirs(items),
            chapters: chaptersByCourse(items),
            projectHomes: layeredProjectDirs(items),
            projectDirs: projectDirs(items),
          },
        });
        return;
      }
      case 'GET /api/content/file': {
        const rel = searchParams.get('path');
        const data = await readContentFile(REPO_ROOT, rel);
        json(res, 200, { ...data, futureDate: isFutureDate(data.values.date, todayInTz(SITE_TZ)) });
        return;
      }
      case 'PUT /api/content/file':
        json(res, 200, await handleSave(await readJsonBody(req)));
        return;
      case 'POST /api/content':
        json(res, 200, await handleCreate(await readJsonBody(req)));
        return;
      case 'POST /api/content/delete':
        json(res, 200, await handleDelete(await readJsonBody(req)));
        return;
      case 'GET /api/git/diff': {
        const rel = searchParams.get('path');
        const st = await gitlib.status(REPO_ROOT);
        const entry = st.entries.find((e) => e.path === rel);
        const result = entry?.untracked
          ? await gitlib.untrackedDiff(REPO_ROOT, rel)
          : await gitlib.diff(REPO_ROOT, rel, { staged: searchParams.get('staged') === '1' });
        json(res, 200, result);
        return;
      }
      case 'POST /api/publish':
        await handlePublish(req, res, await readJsonBody(req));
        return;
      case 'GET /api/preview/url':
        json(res, 200, await handlePreviewUrl(searchParams));
        return;
      case 'GET /api/preview/status':
        json(res, 200, preview.status());
        return;
      case 'POST /api/preview/start':
        json(res, 200, await preview.start(args.previewPort));
        return;
      case 'POST /api/preview/stop':
        json(res, 200, await preview.stop());
        return;
      case 'GET /api/ping':
        json(res, 200, { ok: true });
        return;
      default:
        fail(res, 404, `未知接口：${route}`);
    }
  } catch (err) {
    const status = err?.status ?? 500;
    if (status >= 500) console.error(`[admin] ${req.method} ${pathname} 失败：`, err);
    // SSE（发布）已经发过响应头了，这时不能再写 JSON 错误，否则会抛 ERR_HTTP_HEADERS_SENT
    if (res.headersSent) {
      try {
        res.end();
      } catch {
        /* 连接已断 */
      }
      return;
    }
    fail(res, status, err?.message ?? String(err));
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`✗ 端口 ${args.port} 已被占用。多半是上一次的管理页还在跑：`);
    console.error(`  查占用：netstat -ano | findstr :${args.port}`);
    console.error(`  或换端口：bash scripts/admin.sh --port ${args.port + 1}`);
  } else {
    console.error(`✗ 服务启动失败：${err.message}`);
  }
  process.exit(1);
});

server.listen(args.port, args.host, async () => {
  const shown = args.host === '0.0.0.0' ? '127.0.0.1' : args.host;
  console.log(`▸ 管理页：http://${shown}:${args.port}/`);
  console.log(`  仓库根：${REPO_ROOT}`);
  console.log(`  站点子路径：${BASE_PATH}`);
  if (!bashInfo.ok) console.error(`✗ bash 不可用：${bashInfo.error}`);
  if (args.host === '0.0.0.0') {
    console.error('⚠ 已绑定 0.0.0.0：同网段的任何设备都能打开管理页，而它是可以执行命令的。用完请尽快关闭。');
  }
  if (args.preview) {
    console.log(`▸ 正在启动预览（hugo server -D）…`);
    try {
      const st = await preview.start(args.previewPort);
      if (st.ready) console.log(`  ✓ 预览就绪：http://127.0.0.1:${st.port}${BASE_PATH}`);
      else console.error(`  ✗ 预览未就绪：${st.error ?? '超时'}（管理页仍可用，只是没有内嵌预览）`);
    } catch (err) {
      console.error(`  ✗ 预览启动失败：${err.message}`);
    }
  }
});

async function shutdown() {
  console.log('\n▸ 正在关闭…');
  await preview.stop().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
