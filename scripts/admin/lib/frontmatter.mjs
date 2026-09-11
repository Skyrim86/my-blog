// front matter 的行级读写。
//
// 为什么是「行级替换」而不是「解析成对象再序列化」：仓库里的 front matter 带大量解释性注释
// （见 archetypes/ 生成的文件与 content/courses/numerical-analysis/_index.md 的 cascade），
// 整块重写会把注释全部抹掉，也会打乱原有缩进。这里的规则与 scripts/new-content.sh 的 fm_set
// 保持一致：首个 --- 区块内替换首个匹配行，没有匹配就插到结束 --- 之前。
//
// 与 fm_set 的两点差异（都是管理页需要的能力）：
//   1. 支持缩进匹配 —— 课程主页 / 分层项目主页的 tags 写在 cascade 里（缩进 4 空格）；
//   2. 文件本来没有 front matter 时，会新建一个区块，而不是像 fm_set 那样静默丢弃。

export function detectEol(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

export function toLines(text) {
  return text.split(/\r\n|\n/);
}

export function joinLines(lines, eol) {
  return lines.join(eol);
}

// 首个 --- 区块的位置。没有 front matter 时 hasFm=false，body 即整个文件。
export function splitFrontMatter(text) {
  const eol = detectEol(text);
  const lines = toLines(text);
  let close = -1;
  if (lines.length > 0 && /^---[ \t]*$/.test(lines[0])) {
    for (let i = 1; i < lines.length; i++) {
      if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) {
    return { hasFm: false, eol, fmEnd: -1, lines, fm: [], body: lines.slice() };
  }
  return {
    hasFm: true,
    eol,
    fmEnd: close,
    lines,
    fm: lines.slice(1, close),
    body: lines.slice(close + 1),
  };
}

// 去掉行内注释与包裹引号，得到可比对的值。
// 只处理管理页会读的几种形态：裸标量（可带 ` # 注释`）、双引号串、行内数组。
export function stripValue(raw) {
  const s = raw.trim();
  if (s === '') return '';
  if (s.startsWith('"')) {
    let out = '';
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c === '\\' && i + 1 < s.length) {
        const n = s[++i];
        if (n === 'n') out += '\n';
        else if (n === 't') out += '\t';
        else out += n;
      } else if (c === '"') {
        return out;
      } else {
        out += c;
      }
    }
    return out;
  }
  if (s.startsWith('[')) {
    const end = s.lastIndexOf(']');
    return end === -1 ? s : s.slice(0, end + 1);
  }
  if (s.startsWith("'")) {
    const end = s.indexOf("'", 1);
    return end === -1 ? s.slice(1) : s.slice(1, end);
  }
  const hash = s.indexOf(' #');
  return (hash === -1 ? s : s.slice(0, hash)).trim();
}

function keyPattern(key, indent) {
  return new RegExp('^' + indent + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*:');
}

// 读一个标量字段。indent 用来区分顶层键与 cascade 里缩进的同名键。
export function getField(doc, key, indent = '') {
  const re = keyPattern(key, indent);
  for (let i = 0; i < doc.fm.length; i++) {
    if (re.test(doc.fm[i])) {
      const colon = doc.fm[i].indexOf(':', indent.length + key.length);
      return { index: i, value: stripValue(doc.fm[i].slice(colon + 1)) };
    }
  }
  return { index: -1, value: '' };
}

// 找出某个键实际使用的缩进。课程主页 / 分层项目主页的 tags 在 cascade 里（缩进 4 空格），
// 而 cascade 的缩进可能被人改过；按实际缩进回写，才不会在顶层偷偷多出一个同名的 tags。
export function resolveIndent(doc, key, fallback = '') {
  const re = new RegExp('^([ \\t]*)' + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[ \\t]*:');
  for (const line of doc.fm) {
    const m = re.exec(line);
    if (m) return m[1];
  }
  return fallback;
}

export function getList(doc, key, indent = '') {
  const { value } = getField(doc, key, indent);
  if (!value.startsWith('[')) return [];
  const inner = value.slice(1, value.endsWith(']') ? -1 : undefined);
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (quote) {
      if (c === '\\') {
        cur += c + (inner[++i] ?? '');
        continue;
      }
      if (c === quote) quote = null;
      cur += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
      cur += c;
      continue;
    }
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (c === ',' && depth === 0) {
      out.push(stripValue(cur));
      cur = '';
      continue;
    }
    cur += c;
  }
  out.push(stripValue(cur));
  return out.map((s) => s.trim()).filter((s) => s !== '');
}

export function yamlStr(value) {
  return JSON.stringify(String(value));
}

export function yamlList(items) {
  return '[' + items.map((v) => yamlStr(v)).join(', ') + ']';
}

// 替换（或插入）一行。newLine 不含换行符。
// 返回新的文件全文。
export function setField(text, key, newLine, { indent = '' } = {}) {
  const doc = splitFrontMatter(text);
  if (!doc.hasFm) {
    // 原本没有 front matter（如 content/projects/CMC2026/问题一/问题一.md）：
    // 新建区块，正文原样接在后面。
    const head = ['---', newLine, '---'];
    return joinLines(head.concat(doc.lines), doc.eol);
  }
  const re = keyPattern(key, indent);
  const fm = doc.fm.slice();
  const at = fm.findIndex((line) => re.test(line));
  if (at !== -1) fm[at] = newLine;
  else fm.push(newLine);
  // 只保留开头那一个 ---，中间换成改过的 fm 行，再接结尾 --- 与正文。
  const lines = [doc.lines[0]].concat(fm, doc.lines.slice(doc.fmEnd));
  return joinLines(lines, doc.eol);
}

// 一次设置多个字段（同一份文本上顺序应用，避免重复拆分）。
export function setFields(text, entries) {
  let out = text;
  for (const entry of entries) {
    out = setField(out, entry.key, entry.line, { indent: entry.indent ?? '' });
  }
  return out;
}

// 读一个嵌套小节的子字段（管理页只用到 cover.image / cover.alt / cover.caption）。
export function getChildField(doc, parent, child) {
  const pref = keyPattern(parent, '');
  let start = -1;
  for (let i = 0; i < doc.fm.length; i++) {
    if (pref.test(doc.fm[i])) {
      start = i;
      break;
    }
  }
  if (start === -1) return '';
  const re = keyPattern(child, '  ');
  for (let i = start + 1; i < doc.fm.length; i++) {
    const line = doc.fm[i];
    if (line.trim() !== '' && !/^[ \t]/.test(line)) break; // 回到顶层键，结束
    if (re.test(line)) {
      const colon = line.indexOf(':', child.length + 2);
      return stripValue(line.slice(colon + 1));
    }
  }
  return '';
}

export function setChildField(text, parent, child, value, { childIndent = '  ' } = {}) {
  const doc = splitFrontMatter(text);
  const newLine = `${childIndent}${child}: ${yamlStr(value)}`;
  if (!doc.hasFm) {
    return joinLines(['---', `${parent}:`, newLine, '---'].concat(doc.lines), doc.eol);
  }
  const fm = doc.fm.slice();
  const pref = keyPattern(parent, '');
  let start = fm.findIndex((line) => pref.test(line));
  if (start === -1) {
    fm.push(`${parent}:`);
    fm.push(newLine);
  } else {
    const re = keyPattern(child, childIndent);
    let at = -1;
    let end = start + 1;
    for (let i = start + 1; i < fm.length; i++) {
      const line = fm[i];
      if (line.trim() !== '' && !/^[ \t]/.test(line)) break;
      end = i + 1;
      if (at === -1 && re.test(line)) at = i;
    }
    if (at !== -1) fm[at] = newLine;
    else fm.splice(end, 0, newLine);
  }
  const lines = [doc.lines[0]].concat(fm, doc.lines.slice(doc.fmEnd));
  return joinLines(lines, doc.eol);
}

export function parseBool(value, fallback = false) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function parseNumber(value, fallback = 0) {
  const n = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : fallback;
}
