// 图片落盘：编辑器里粘贴/拖入的图片存到**该文章所在目录**（Hugo 的 leaf bundle 约定：
// 与 index.md 同目录的图片可以被同目录的页面直接引用），并回传一段可直接插入正文的 markdown。
//
// 只接受图片类型与 8MB 以内的数据：管理页是本地可信服务，但没有理由让它把任意二进制
// 写成任意文件名的 content/ 附件。
import fs from 'node:fs/promises';
import path from 'node:path';

import { resolveContentPath, relFromRoot } from './content.mjs';

const MAX_BYTES = 8 * 1024 * 1024;

// mime → 扩展名。不在表里的一律拒绝（svg 也收，本站主题与 Hugo 都能处理）。
const MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/avif': '.avif',
};

function parseDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(dataUrl ?? ''));
  if (!m) throw Object.assign(new Error('数据格式不对：需要一个 data: URL'), { status: 400 });
  const mime = m[1].toLowerCase();
  const isBase64 = Boolean(m[2]);
  const buf = isBase64 ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]), 'utf8');
  return { mime, buf };
}

// 文件名清洗：去掉目录分隔符与控制字符，空格转短横线；中文保留（本站正文本来就是中文文件名，
// 转成拼音反而对不上源文件）。清完为空就按时间戳给一个。
function safeName(raw, ext) {
  let name = String(raw ?? '')
    .replace(/\\/g, '/')
    .split('/')
    .pop()
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .trim();
  if (name === '') name = `image-${Date.now()}`;
  if (path.extname(name) === '') name += ext;
  return name;
}

export async function saveAsset(repoRoot, body) {
  const relMd = body?.path;
  if (!relMd) throw Object.assign(new Error('缺少 path：图片要存进哪篇文章所在目录'), { status: 400 });
  const mdAbs = resolveContentPath(repoRoot, relMd);
  const dir = path.dirname(mdAbs);

  const { mime, buf } = parseDataUrl(body.dataUrl ?? body.data);
  const ext = MIME_EXT[mime];
  if (!ext) {
    throw Object.assign(new Error(`不支持的图片类型：${mime}（只能存 png / jpg / webp / gif / svg / avif）`), { status: 400 });
  }
  if (buf.length > MAX_BYTES) {
    throw Object.assign(new Error(`图片太大：${Math.round(buf.length / 1024)}KB，上限 ${MAX_BYTES / 1024 / 1024}MB`), { status: 413 });
  }

  const wanted = safeName(body.name, ext);
  // 目录里已有同名文件时不覆盖（会悄悄改掉正文里已有的引用），改叫 name-2、name-3…
  const stem = wanted.slice(0, wanted.length - path.extname(wanted).length);
  const suffix = path.extname(wanted);
  let name = wanted;
  for (let i = 2; i < 100; i++) {
    try {
      await fs.access(path.join(dir, name));
    } catch {
      break;
    }
    name = `${stem}-${i}${suffix}`;
  }

  const abs = path.join(dir, name);
  await fs.writeFile(abs, buf);

  const rel = relFromRoot(repoRoot, abs);
  // 同目录引用写相对路径（Hugo 的 bundle 约定），alt 先用文件名，用户可以再改
  return {
    ok: true,
    path: rel,
    name,
    bytes: buf.length,
    mime,
    markdown: `![${stem}](./${encodeURI(name)})`,
    dir: relFromRoot(repoRoot, dir),
  };
}
