#!/usr/bin/env node
// 首页卡片组（hero 底部那副牌）清单的不变量 —— **注意与 check-cards.mjs 不是一回事**：
// 那个管的是数学/CS 知识库的卡片数据（data/*-toolbox.json），这个只管 data/home-cards.yaml。
//
// 为什么单列一条：这份清单是**单一事实源**，但此前没有任何脚本读它 —— 生成器（tools/cards/
// make-cards.py）只把 style 原样打印一遍，模板（layouts/_partials/home-cards.html）对未知的
// style 直接退回兜底的 foil，于是下面这些错误全都是**静默**的：
//
//   · style 拼错（`frots`）→ 那张卡变成全息 foil，不报错、构建全绿，只能靠肉眼在 30 张里发现；
//   · crop 拼错（`figuer`）→ 生成器跳过 figure 分支、把整张图硬裁成 5:7，构图不对但图照出；
//   · src / 产物的路径写错 → 模板只 warnf 一下就把这张卡**整张跳过**，牌数悄悄少一张；
//   · 两条 entry 写同一个 image → 后写的那张覆盖前一张的产物，两张卡看起来一样；
//   · 同系列里名字重复 → 名牌上两张卡同名，翻卡时看不出换了。
//
// 还有一类不是错的、但会积下来的：**孤儿产物**（目录里有、清单里没有的 webp）。撤掉一张卡时
// 很容易忘了删产物 —— 2026-09-20 就清出 8 张退役的 px-*.webp。
//
// data/home-cards.yaml 只做行解析，不引 yaml 依赖（与 scripts/check-cards.mjs、gen-cards.mjs 同一套做法）。
//
// 用法：node scripts/check-deck.mjs
// 退出码：0 = 清单合规；1 = 有不合规的地方
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const MANIFEST = join('data', 'home-cards.yaml');
const CSS = join('assets', 'css', 'extended', '21-card-deck.css');
const I18N = join('i18n', 'zh.toml');
const FACES_DIR = join('assets', 'images', 'cards');

// 卡片组要用的词条：文案走 data-* 从模板传给 JS（JS 调不到 i18n），少一条就只剩兜底模板
const I18N_KEYS = ['deckNext', 'deckPrev', 'deckAnnounce', 'deckZoom', 'deckClose', 'deckCredit', 'deckDialogLabel'];
// 出处里能推出可点链接的几种写法（弹层里 credit_url 就用它核）；官方立绘 / 站点看板娘没有链接，留空是对的
const CREDIT_URLS = [
  [/^pixiv (\d+)/, (m) => `https://www.pixiv.net/artworks/${m[1]}`],
  [/^safebooru (\d+)/, (m) => `https://safebooru.org/index.php?page=post&s=view&id=${m[1]}`],
  [/^twitter (\S+)/, (m) => `https://twitter.com/${m[1]}`],
  [/^wallhaven (\w+)/, (m) => `https://wallhaven.cc/w/${m[1]}`],
];
const REQUIRED = ['image', 'src', 'series', 'name', 'style'];
// 行解析拿到的标量都是字符串：这几个字段要按数字收
const NUMERIC = new Set(['pad']);

const failures = [];
const notes = [];

/* ---------- 读清单 ---------- */
const raw = readFileSync(MANIFEST, 'utf8');
const entries = [];
let cur = null;

raw.split(/\r?\n/).forEach((line, i) => {
  const n = i + 1;
  const body = line.replace(/\s+#.*$/, ''); // 行尾注释；值里不含 " #" 是这份文件的既有约定
  if (!body.trim() || /^\s*#/.test(body)) return;

  let m = /^-\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(body);
  if (m) {
    cur = {};
    entries.push(cur);
  } else {
    m = /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(body);
    if (!m || !cur) return;
  }
  const key = m[1];
  const value = m[2].trim();

  if (value.startsWith('[')) {
    try {
      cur[key] = JSON.parse(value);
    } catch {
      failures.push(`✗ ${MANIFEST}:${n}：「${key}」的方括号值不是合法 JSON —— ${value}`);
      cur[key] = value;
    }
  } else if (NUMERIC.has(key) && /^-?\d+(\.\d+)?$/.test(value)) {
    // 行解析拿到的都是字符串，数字字段要自己转 —— 不转的话 pad 会是 "1.3"，
    // 生成器里 `c.get("pad", 1.16)` 拿到字符串就会把乘法定成重复字符串（这里踩到过一次）
    cur[key] = Number(value);
  } else {
    cur[key] = value.replace(/^['"]|['"]$/g, '');
  }
});

if (!entries.length) {
  failures.push(`✗ ${MANIFEST} 里一条卡片都没解析出来 —— 清单格式变了？`);
}

/* ---------- 清单里的 style 必须真有对应的 CSS 类 ---------- */
const css = readFileSync(CSS, 'utf8');
const knownStyles = new Set([...css.matchAll(/\.home-card--([a-z0-9-]+)/g)].map((m) => m[1]));
// foil 是个特例：它**没有** .home-card--foil 这条规则 —— .home-card 的基础声明（彩虹 conic +
// color-dodge）本身就是全息的观感，`style: foil` 出来的类名没规则可命中，正好落在基础样式上。
// 模板与 JS 的兜底值也都是 'foil'，所以它是合法值，不能算「拼错了」。
knownStyles.add('foil');
const usedStyles = new Set();
const seenImage = new Map();
const seenName = new Map();

for (const [idx, c] of entries.entries()) {
  const where = `${MANIFEST} 第 ${idx + 1} 条（${c.name || c.image || '没有 image'}）`;

  for (const key of REQUIRED) {
    if (!String(c[key] ?? '').trim()) {
      failures.push(
        `✗ ${where}：缺字段「${key}」—— ` +
          (key === 'style'
            ? '没写 style 会被模板退回兜底的 foil，要显式写一个存在的风格'
            : '生成器与模板都靠它，缺了这张卡出不来')
      );
    }
  }

  if (c.style && !knownStyles.has(String(c.style))) {
    failures.push(
      `✗ ${where}：style「${c.style}」在 ${CSS} 里没有对应的 .home-card--${c.style} 类 —— ` +
        `这张卡会静默退回全息 foil。现有风格：${[...knownStyles].sort().join(' / ')}`
    );
  }
  if (c.style) usedStyles.add(String(c.style));

  // crop：三种合法写法。拼错会静默走「整幅硬裁 5:7」那条路（构图不对但图照出）
  const crop = c.crop;
  const cropOk =
    crop === 'figure' ||
    crop === 'auto' ||
    (Array.isArray(crop) && crop.length === 4 && crop.every((v) => typeof v === 'number'));
  if (crop !== undefined && !cropOk) {
    failures.push(
      `✗ ${where}：crop 只能是 figure / auto / [x0,y0,x1,y1] 四个分数，现在是 ${JSON.stringify(crop)}`
    );
  }
  if (c.pad !== undefined && typeof c.pad !== 'number') {
    failures.push(`✗ ${where}：pad 要是数字（figure 取景的余量），现在是 ${JSON.stringify(c.pad)}`);
  }
  if (c.flat !== undefined) {
    const ok =
      Array.isArray(c.flat) &&
      c.flat.length === 2 &&
      c.flat.every((row) => Array.isArray(row) && row.length === 3 && row.every((v) => typeof v === 'number'));
    if (!ok) failures.push(`✗ ${where}：flat 要写成 [[上 R,G,B], [下 R,G,B]]，现在是 ${JSON.stringify(c.flat)}`);
  }

  // image 相对 assets/：写成 assets/xxx 或 /xxx 时模板的 resources.Get 会找不到（traps.md 第 14 条）
  const image = String(c.image || '');
  if (image && (image.startsWith('/') || image.startsWith('assets/'))) {
    failures.push(`✗ ${where}：image 要相对 assets/（现在 ${image}）—— 前缀会让 resources.Get 找不到它`);
  }
  if (image && !image.endsWith('.webp')) {
    notes.push(`· ${where}：image 不是 .webp（${image}）—— 生成器只出 webp，写错后缀这张卡渲染不出来`);
  }
  if (image) {
    if (seenImage.has(image)) {
      failures.push(`✗ ${where}：image「${image}」与第 ${seenImage.get(image)} 条重复 —— 后出的产物会覆盖前一张`);
    }
    seenImage.set(image, idx + 1);

    const face = join('assets', image);
    if (!existsSync(face)) {
      failures.push(`✗ ${where}：产物 ${face} 不在 —— 先跑 tools/cards/make-cards.py（这张卡会被整张跳过）`);
    }
  }

  if (c.src && !existsSync(String(c.src))) {
    failures.push(`✗ ${where}：源图 ${c.src} 不在 —— 生成器会跳过它（上面那条产物报错多半就是这个引起的）`);
  }

  if (c.name) {
    const key = `${c.series || ''}\u0000${c.name}`;
    if (seenName.has(key)) {
      failures.push(`✗ ${where}：第 ${seenName.get(key)} 条已经叫「${c.name}」了 —— 同系列重名，翻卡时看不出换了`);
    }
    seenName.set(key, idx + 1);
  }

  if (!String(c.credit || '').trim()) {
    notes.push(`· ${where}：没写 credit（出处）—— docs/features.md ㉕ 与卡片弹层都从它取`);
  } else {
    // credit_url 是弹层里那个可点外链。写错的代价是「点开跳到别处」，而页面看起来完全正常，
    // 所以这里把能推导的几种写法核一遍：有 credit 却漏了 url 只提示，url 与 credit 对不上则阻断。
    const url = c.credit_url;
    if (url === undefined) {
      const derivable = CREDIT_URLS.some(([re]) => re.test(String(c.credit)));
      if (derivable) notes.push(`· ${where}：credit 能推出链接（${c.credit}），但没写 credit_url —— 弹层里只会显示文字`);
    } else if (!/^https:\/\//.test(String(url))) {
      failures.push(`✗ ${where}：credit_url 要以 https:// 开头，现在是 ${url}`);
    } else {
      for (const [re, build] of CREDIT_URLS) {
        const m = re.exec(String(c.credit));
        if (m && build(m) !== String(url)) {
          failures.push(`✗ ${where}：credit_url 与 credit 对不上（credit「${c.credit}」应是 ${build(m)}，现在是 ${url}）`);
        }
      }
    }
  }
}

/* ---------- 孤儿产物：目录里有、清单里没有 ---------- */
if (existsSync(FACES_DIR)) {
  const orphans = readdirSync(FACES_DIR)
    .filter((f) => statSync(join(FACES_DIR, f)).isFile() && !seenImage.has(`images/cards/${f}`))
    .sort();
  if (orphans.length) {
    failures.push(
      `✗ ${FACES_DIR} 里有 ${orphans.length} 个产物不在清单里（撤卡后忘了删？）：` +
        orphans.map((f) => `${f}(${Math.round(statSync(join(FACES_DIR, f)).size / 1024)}KB)`).join('、')
    );
  }
}

/* ---------- 词条 ---------- */
const i18n = readFileSync(I18N, 'utf8');
for (const key of I18N_KEYS) {
  if (!new RegExp(`^\\[${key}\\]`, 'm').test(i18n)) {
    failures.push(`✗ ${I18N} 里缺词条 [${key}] —— 卡片组的按钮名/播报会退回兜底英文`);
  }
}

/* ---------- 报告 ---------- */
const unused = [...knownStyles].filter((s) => !usedStyles.has(s)).sort();
notes.push(
  `· 清单 ${entries.length} 张卡，用到 ${usedStyles.size} 种风格` +
    (unused.length ? `；CSS 里还有没用上的：${unused.join(' / ')}` : '')
);

for (const line of notes) console.log(line);

if (failures.length) {
  console.log();
  for (const line of failures) console.log(line);
  console.log();
  console.log(
    `✗ ${failures.length} 处卡片组清单不合规。清单是单一事实源：改完 data/home-cards.yaml 要跑 ` +
      `tools/cards/make-cards.py 重出图；风格只改 YAML 的 style 字段，不必重出图。`
  );
  process.exit(1);
}

console.log(`✓ 卡片组清单 ${entries.length} 张：字段齐、风格都有对应 CSS 类、源图与产物都在、无重名重复产物`);
