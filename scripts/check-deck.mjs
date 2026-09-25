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
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const MANIFEST = join('data', 'home-cards.yaml');
const CSS = join('assets', 'css', 'decks', '21-card-deck.css');
const I18N = join('i18n', 'zh.toml');
const FACES_DIR = join('assets', 'images', 'cards');
// 3D 查看器用的浮雕高度图（灰阶、与卡面同尺寸），由 tools/cards/make-depth.py 出。
// **路径是从 image 推导的，不是 YAML 里的字段** —— 所以它最容易出的错是「卡面改了名、
// 深度图没跟上」，而那种错的表现只是浮雕悄悄消失（平整卡面），页面上不会报任何东西。
// 这就是它必须在构建期被核一遍的原因。
const DEPTH_DIR = join(FACES_DIR, 'depth');
const depthOf = (image) => join(DEPTH_DIR, basename(image));

// 卡片组要用的词条：文案走 data-* 从模板传给 JS（JS 调不到 i18n），少一条就只剩兜底模板。
// 后半批是收藏库（/collection/）的卡片墙要用的：**现役八种工艺**的中文名 + 筛选条与格子按钮名。
// 2026-09-24 工艺收敛（十六 → 八）时同步过这一行：汰除的十种词条仍留在 i18n/zh.toml 里（供旧文档
// 对读），但**不再登记**在这里 —— 这一栏的判据是「现役工艺必须有中文名」，不是「词条不能多」。
// 筛选条那几条里**没有「全部」**：三排都能多选，取消靠再点一次，整排清空走 deckFilterClear。
const I18N_KEYS = ['deckNext', 'deckPrev', 'deckAnnounce', 'deckZoom', 'deckClose', 'deckCredit',
  'deckDialogLabel', 'deckFlip', 'deckFlipBack', 'deckRotate', 'deckGlFail',
  'deckRankCollector', 'deckRankRare', 'deckRankEpic', 'deckRankArcane', 'deckRankLegend', 'deckRankMiracle',
  'deckStyleFoil', 'deckStyleHoloPrism', 'deckStyleSilver', 'deckStyleStarnight',
  'deckStyleEmboss', 'deckStylePearl', 'deckStyleGoldfoil', 'deckStyleInkwash',
  'deckFilterLabel', 'deckFilterSeries', 'deckFilterStyle', 'deckFilterRank',
  'deckFilterTierBasic', 'deckFilterTierAdvanced', 'deckFilterTierHint',
  'deckFilterCount', 'deckFilterClear', 'deckFilterEmpty', 'deckOpenCard',
  // 卡片墙第二轮（2026-09-21 晚）：序号 / 分组 / 抽卡 / 显形播报 / 出处清单
  'deckTileNo', 'deckGroupOn', 'deckGroupOff', 'deckGroupHead', 'deckDraw',
  'deckRevealAnnounce', 'deckCredits', 'deckCreditsNote'];
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

/* ---------- 参数化的工艺块（data/card-styles.yaml → 21-card-styles.css + card-3d.js 的 STYLE_3D 行）----------

   2026-09-21 加（样板，见 docs/exp-craft.md）。**参数化不等于少盯**：被参数化的那几种工艺
   仍然是「卡面风格」那一段的一部分，下面 ①③⑥ 三条纪律与 knownStyles 都要把它算进来 ——
   否则删掉手写块的那一刻，这几种工艺就悄悄脱离守卫了（漏 --fret-line、写了 --cframe 都不再报错，
   而这正是这个仓库最怕的那种静默失效）。 */
const GEN_CSS = join('assets', 'css', 'decks', '21-card-styles.css');
const genCss = existsSync(GEN_CSS) ? readFileSync(GEN_CSS, 'utf8') : '';
const cssAll = genCss ? `${css}\n${genCss}` : css;

/* ---------- ⓪ 声明有没有丢掉分号（手改 CSS 最容易犯、且**完全静默**的错）----------
   真事：用脚本往 `.home-card-rank--epic` 尾部插 `--fret-corner` 时，插入点落在「最后一个
   声明」与 `; }` 之间，于是 `--cframe: linear-gradient(...)` 丢了分号、下一个声明被并进它的
   值 —— **括号色成了非法值、卡框失去金属**，而浏览器、hugo、其它 11 个校验脚本一个字都不报
   （是在浏览器里读计算值才看出来的）。
   判据：一行以 `)` 收尾且没有分号，下一行又是声明。合法的换行续写只会以 `,` 或未闭合的
   括号收尾，所以这一条不误报。 */
{
  const bad = [];
  for (const [file, text] of [[CSS, css], [GEN_CSS, genCss]]) {
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length - 1; i++) {
      const a = lines[i].trim(), b = lines[i + 1].trim();
      if (a.startsWith('--') && a.endsWith(')') && !a.endsWith(';') && b.startsWith('--')) {
        bad.push(`${file} 第 ${i + 1} 行 ${a.slice(0, 44)}… 紧跟 ${b.slice(0, 26)}…`);
      }
    }
  }
  if (bad.length) {
    console.log('✗ 有声明没写分号（值会被并进上一行）');
    bad.slice(0, 4).forEach((x) => console.log('   · ' + x));
    process.exit(1);
  }
  console.log('· 声明分号：逐行查过，没有「值以 ) 收尾却没分号」的行');
}
const knownStyles = new Set([...cssAll.matchAll(/\.home-card--([a-z0-9-]+)/g)].map((m) => m[1]));
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

  // 2026-09-25 加的三个字段（work / role / added）：都**可选**，但写了就得合法 ——
  // added 走弹层信息卡，格式错了页面上不报错、只是印出一串怪字符串；work/role 写了空值
  // 会让信息卡多出一截没有内容的标签。

  if (c.added && !/^\d{4}-\d{2}-\d{2}$/.test(String(c.added))) {
    failures.push(`✗ ${where}：added「${c.added}」不是 YYYY-MM-DD`);
  }
  for (const key of ['work', 'role']) {
    if (key in c && !String(c[key]).trim()) {
      failures.push(`✗ ${where}：${key} 写了但值是空的 —— 要么删掉这一行，要么写值`);
    }
  }

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
    // 深度图（3D 查看器的浮雕）：缺了不会报错，只会「这张卡转起来是平的」
    const depth = depthOf(image);
    if (!existsSync(depth)) {
      failures.push(
        `✗ ${where}：深度图 ${depth} 不在 —— 先跑 tools/cards/make-depth.py。` +
          `缺它的表现是**静默**的：卡能转，但这一张是平的、没有浮雕`
      );
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

/* ---------- 等级：必填 + 值域 ----------

   为什么把 rank 做成**必填**：漏写它不会报错、只会按「收藏」渲染 —— 一张本该是传世的卡
   静默降级，而那种错在页面上完全看不出来（只有把三档摆在一起才发现某张的框不对）。
   这正是这个仓库反复强调要拦的那类静默失败。

   2026-09-21 从四档扩到六档（加了 rare 珍稀 / arcane 秘藏）。**「每一处消费点都要真的实现」
   那几条守卫在下面「等级与风格的消费点」一节里** —— 它们要用到 stylesOpen/stylesClose，
   而那两处切分在更靠后的「卡面风格的两条纪律」里才定义，所以不能放在这里。 */
const RANKS = new Set(['collector', 'rare', 'epic', 'arcane', 'legend', 'miracle']);
for (let i = 0; i < entries.length; i++) {
  const c = entries[i];
  const where = `${MANIFEST} 第 ${i + 1} 条（${c.name || c.series || c.image}）`;
  const r = String(c.rank ?? '');
  if (!RANKS.has(r)) {
    failures.push(
      `✗ ${where}：rank 缺失或拼错（现在是「${r}」）—— 合法值：${[...RANKS].join(' / ')}；` +
        `缺了会静默按 collector 处理`
    );
  }
}
{
  const cnt = {};
  for (const c of entries) cnt[c.rank] = (cnt[c.rank] || 0) + 1;
  notes.push('· 等级分布：' + [...RANKS].map((r) => `${r} ${cnt[r] || 0}`).join('，'));
}

/* ---------- 孤儿产物：目录里有、清单里没有 ---------- */
// 卡面与深度图**共用同一批文件名**，所以两边用同一份期望集合核（深度图目录里出现卡面没有的
// 名字，就说明撤卡时只删了一半）。
const expectedBase = new Set([...seenImage.keys()].map((p) => basename(p)));

for (const [dir, what] of [[FACES_DIR, '卡面'], [DEPTH_DIR, '深度图']]) {
  if (!existsSync(dir)) continue;
  const orphans = readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile() && !expectedBase.has(f))
    .sort();
  if (orphans.length) {
    failures.push(
      `✗ ${dir} 里有 ${orphans.length} 个${what}不在清单里（撤卡后忘了删？）：` +
        orphans.map((f) => `${f}(${Math.round(statSync(join(dir, f)).size / 1024)}KB)`).join('、')
    );
  }
}

/* ---------- 卡面风格的两条纪律（2026-09-20 重做时定的） ----------

   它们是**观感问题**，构建期与浏览器都不会报错，只能靠脚本盯：
   ① 用 1px 硬停的 repeating 渐变「画直线」——那是尺子画的，272px 下像纱窗（重做前织锦一张卡
      有约 394 条这样的线）。线要写成「亮芯偏在一侧 + 一圈淡晕」的软渐变停。
   ② `filter: url(#某id)` 里的 id 在模板里不存在 —— **静默失效**，页面照样渲染，只是没有任何手抖感。 */
const stylesOpen = css.indexOf('---------- 卡面风格');
const stylesClose = css.indexOf('/* ---------- 减少动态');
if (stylesOpen < 0 || stylesClose < 0 || stylesClose <= stylesOpen) {
  failures.push(`✗ ${CSS} 里找不到卡面风格段（分隔注释被改过？）—— 这两条纪律的扫描范围就失效了，请同步调整 check-deck.mjs`);
} else {
  const styleSection = css.slice(stylesOpen, stylesClose) + genCss;
  const hard = [];
  for (const m of styleSection.matchAll(/repeating-(?:linear|conic|radial)-gradient\(/g)) {
    const chunk = styleSection.slice(m.index, m.index + 420);
    if (/\s0\s+1(?:\.\d+)?px/.test(chunk)) hard.push(m.index);
  }
  if (hard.length) {
    failures.push(
      `✗ ${CSS} 的卡面风格里还有 ${hard.length} 处 1px 硬停的 repeating 渐变 —— 那是「尺子画的直线」，` +
        `改成软渐变停（亮芯 + 淡晕，见该文件顶部第 2 条规矩）`
    );
  }

  // 滤镜 id：CSS 里 url(#x) 的每个 x，**定义处**都要有对应的 id。
  // 2026-09-21：这两个滤镜原先是内联在 home-cards.html 里的（收藏库的卡片墙要用同一套，
  // 于是抽成了 deck-filters.html），所以「定义处」换成了那个文件；同时**用它的人必须都 include**
  // 它 —— 少 include 的那一页不会报错，只是那一页的卡悄悄没有手抖/颗粒感（就是下面这条纪律
  // 要防的静默失效）。所以这里两件事一起核：id 在不在、用它的模板有没有引到。
  const ids = new Set();
  for (const m of cssAll.matchAll(/url\(#([\w-]+)\)/g)) ids.add(m[1]);
  if (ids.size) {
    const FILTERS = join('layouts', '_partials', 'deck-filters.html');
    const have = new Set(
      [...readFileSync(FILTERS, 'utf8').matchAll(/id="([\w-]+)"/g)].map((m) => m[1])
    );
    for (const id of ids) {
      if (!have.has(id)) {
        failures.push(
          `✗ ${CSS} 引用了 url(#${id})，但 ${FILTERS} 里没有 id="${id}" —— ` +
            `滤镜找不到就是**静默失效**（页面照常渲染，只是没有手抖/颗粒效果）`
        );
      }
    }
    // 用到这套滤镜的模板：首页卡片组与收藏库的卡片墙
    for (const user of ['home-cards.html', 'deck-wall.html']) {
      const path = join('layouts', '_partials', user);
      if (!existsSync(path)) continue;
      if (!/partial\s+"deck-filters\.html"/.test(readFileSync(path, 'utf8'))) {
        failures.push(
          `✗ ${path} 没有 include deck-filters.html —— 那一页的 filter: url(#…) 会静默失效`
        );
      }
    }
  }
}

/* ---------- 等级与风格的消费点：**每一处都要真的实现** ----------

   这一节守的是同一件事：「清单里/样式里有一个档或一种风格，而某个消费点没有它」——
   每一处的表现都是**静默降级**，页面上不报错，只能靠人肉摆在一起看才发现：
     · CSS 里没有 .home-card-rank--<档>     → 那张卡按**收藏**的观感渲染（框细一档、没有内衬线、
                                              徽章是圆点），看不出是漏了还是设计如此
     · 某一档少了某个令牌                  → 那一个通道静默沿用上一层（三重编码退化成只靠颜色）
     · 风格写了 --cframe 而不是 --cframe-finish → 等级的材质底色被整片盖掉
     · deck-manifest.html 的两张中文名表里没有 → 卡片墙上那格显示「系列 · 」后面空一截
   还有两处守不到的（顺序表在 JS 里，正则核不动，只能在代码里写对照注释）：
     · deck-wall.js 的 RANK_ORDER —— 少一档 = 那一档在筛选条里排到最后
     · home-clock.js 的 RANK_WEIGHT —— 少一档 = 那一档的卡**永远抽不到** */

/* 按 `}` 粗切规则，取出选择器里含某个类的**全部**规则并接起来。
   为什么不能只取第一条：一个风格/等级可以有多条规则，而第一条未必是声明令牌的那条 ——
   星芒全息的第一条恰好是 `:hover::before` 的过渡规则（它排在令牌块前面），只取第一条会
   误报「没有 --cframe-finish」。粗切 `}` 在这里是安全的：这份 CSS 没有嵌套规则，
   data-URI 里的 SVG 也全是百分号转义（不含花括号）。 */
function rulesWith(sec, cls) {
  return sec.split('}').filter((chunk) => chunk.includes(cls)).join('}');
}

/* ① CSS 里的档位类 */
const cssRanks = new Set([...css.matchAll(/\.home-card-rank--([a-z0-9-]+)/g)].map((m) => m[1]));
for (const r of RANKS) {
  if (!cssRanks.has(r)) {
    failures.push(
      `✗ ${CSS} 里没有 .home-card-rank--${r} —— 这一档的卡会**静默按收藏渲染**` +
        `（框细一档、没有内衬线、徽章是圆点），页面上看不出是漏了还是设计如此`
    );
  }
}
for (const r of cssRanks) {
  if (!RANKS.has(r)) notes.push(`· ${CSS} 里有清单用不到的档位类：${r}`);
}

/* ② 每档的令牌是否齐 */
{
  const rankOpen = css.indexOf('---------- 等级');
  const rankClose = css.indexOf('/* ---------- 深色主题');
  if (rankOpen < 0 || rankClose <= rankOpen) {
    failures.push(
      `✗ ${CSS} 里找不到「等级」段（分隔注释被改过？）—— 每档令牌完整性那一条就失效了，请同步 check-deck.mjs`
    );
  } else {
    const sec = css.slice(rankOpen, rankClose);
    for (const r of RANKS) {
      if (!cssRanks.has(r)) continue;              // ① 已经报过
      const blk = rulesWith(sec, `.home-card-rank--${r}`);
      // --cframe 是六档色阶（颜色通道）、--rank-mark 是徽章形状、--rank-craft 是工艺强度、
      // --rank-mat 是画框收窄 —— 四者构成三重编码，缺一条就是「只靠颜色」。
      const toks = ['--rank-mark', '--rank-craft', '--rank-mat'];
      // 收藏档特例（与 foil 之于风格同一个道理）：它的材质底色就是 .home-card 的基础声明那份
      // —— 那一份同时也是「漏挂等级类」的兜底值，两处都写就是两处都要改，故只留基础声明那一处。
      if (r !== 'collector') toks.push('--cframe');
      for (const tok of toks) {
        if (!blk.includes(tok)) {
          failures.push(
            `✗ ${CSS} 的等级「${r}」的规则里没有 ${tok} —— 那一档的这个通道会静默沿用上一层的值` +
              `（三重编码要求颜色 / 形状 / 材质同时区分，缺一条就退化成只靠颜色）`
          );
        }
      }
    }
  }
}

/* ③ 风格的框值必须走 --cframe-finish、不许写 --cframe */
{
  const sec = css.slice(stylesOpen, stylesClose) + genCss;  // 生成区也要被同一条纪律盯住
  for (const s of knownStyles) {
    if (s === 'foil') continue;   // 特例：foil 的质感层就是 .home-card 的基础声明
    const blk = rulesWith(sec, `.home-card--${s}`);
    if (!blk) continue;
    if (!blk.includes('--cframe-finish')) {
      failures.push(
        `✗ ${CSS} 的风格「${s}」没有 --cframe-finish —— 要么没写框的质感层，要么写了 --cframe：` +
          `后者会把**等级的材质底色**整片盖掉（14 张金边卡会一起变金，与它们是不是传世无关）`
      );
    }
    if (/^\s*--cframe:/m.test(blk)) {
      failures.push(`✗ ${CSS} 的风格「${s}」写了 --cframe —— 那是等级拥有的材质底色，见该文件第 7 条规矩`);
    }
  }
}

/* ④ deck-manifest.html 的两张中文名表 */
{
  const MANIFEST_HTML = join('layouts', '_partials', 'deck-manifest.html');
  const mh = readFileSync(MANIFEST_HTML, 'utf8');
  const grab = (prefix) =>
    new Set([...mh.matchAll(new RegExp(`"([a-z0-9-]+)"\\s*\\(i18n\\s*"${prefix}`, 'g'))].map((m) => m[1]));
  const dRanks = grab('deckRank');
  const dStyles = grab('deckStyle');
  if (!dRanks.size || !dStyles.size) {
    failures.push(
      `✗ ${MANIFEST_HTML} 里没解析出 rankLabel / styleLabel 的键 —— 那条正则与模板结构脱节了，请同步`
    );
  }
  for (const r of RANKS) {
    if (!dRanks.has(r)) {
      failures.push(`✗ ${MANIFEST_HTML} 的 rankLabel 表里没有「${r}」—— 卡片墙那格会显示「系列 · 」后空一截`);
    }
  }
  for (const s of knownStyles) {
    if (!dStyles.has(s)) {
      failures.push(`✗ ${MANIFEST_HTML} 的 styleLabel 表里没有「${s}」—— 卡片墙的工艺副标题会缺中文名`);
    }
  }
}

/* ⑤ 生成的纹样令牌（雪花 / 裂缝 / 星屑 / 珐琅格 / 雕花边栏 / 角花 / 宝石）
   它们在 assets/css/decks/20-card-ornaments.css 里，由 tools/cards/make-ornaments.py 生成。
   引用了不存在的令牌 = **静默失效**：mask 取不到图，那一层什么都不画（页面上只是「这一档没有
   那个纹样」，构建、控制台全绿）。所以两个方向都核：用到的必须存在、生成物里的最好都用上。 */
{
  const ORN = join('assets', 'css', 'decks', '20-card-ornaments.css');
  if (!existsSync(ORN)) {
    failures.push(
      `✗ 找不到 ${ORN} —— 卡面纹样令牌都在那里（雪花 / 裂缝 / 星屑 / 珐琅格 / 雕花框零件）。` +
        `跑 tools/cards/make-ornaments.py 生成`
    );
  } else {
    const gen = new Set([...readFileSync(ORN, 'utf8').matchAll(/^\s*(--[\w-]+):/gm)].map((m) => m[1]));
    if (!gen.size) {
      failures.push(`✗ ${ORN} 里一个令牌都没解析出来 —— 生成器的输出格式变了？这条守卫会失效，请同步`);
    }
    // 生成物里的令牌**统一用 --tex- 前缀**（雕花框那四件也是 --tex-fret-*），所以按前缀收窄即可 ——
    // 手写在 21-card-deck.css 里的长度类令牌（--fret-off / --fret-corner-off）不带这个前缀，
    // 不会被误判成「引用了不存在的图」（第一版就是这么误报的）。
    //
    // 2026-09-21 起再加 `--mark-` 一组（数学曲线徽记，值是 `polygon(...)` 而不是 `url(...)`，
    // 它走 clip-path 不走 mask）—— 这一组的失效方式比 mask 那种更阴：令牌名写错时
    // `clip-path: var(--rank-mark)` 在计算值阶段变成非法 → 退回初始值 `none` →
    // **徽记渲染成一个方块**，而构建、控制台照样全绿。
    const used = new Set([...css.matchAll(/var\((--(?:tex|mark)-[\w-]+)/g)].map((m) => m[1]));
    const missing = [...used].filter((t) => !gen.has(t)).sort();
    if (missing.length) {
      failures.push(
        `✗ ${CSS} 引用了生成物里没有的纹样令牌：${missing.join(' / ')} —— mask 取不到图是**静默失效**` +
          `（那一层什么都不画），跑 tools/cards/make-ornaments.py`
      );
    }
    const unused = [...gen].filter((t) => !used.has(t)).sort();
    if (unused.length) notes.push(`· 生成物里有没被引用的纹样令牌：${unused.join(' / ')}`);
  }
}

/* ⑥ 边框的归属：**等级管结构、工艺管材质**（2026-09-21 第二次重做后定的口径）
   上一版把边框挂在工艺轴上（进阶工艺 = 一条 20px 深色雕花带），后果是同档的卡框一厚一薄、
   稀有度读不出来，而且六种工艺六副框（系列不统一）。现在带宽、装饰线、角饰都由 --rank-* 给，
   工艺只提供框的**材质**（--cframe-finish，它会自动铺到整条边上）。两条守卫盯住这件事：
     · 每个等级必须声明 --rank-band 与 --rank-line（漏了就没有边框阶梯，或装饰线颜色不对）
     · 风格里**不该**再出现 --fret-*（那是边框的零件，归等级）—— 防止有人照旧写法加回去 */
{
  const rankOpen = css.indexOf('---------- 等级');
  const rankClose = css.indexOf('/* ---------- 深色主题');
  const sec = rankOpen >= 0 && rankClose > rankOpen ? css.slice(rankOpen, rankClose) : '';
  const stylesSec = css.slice(stylesOpen, stylesClose) + genCss;  // 生成区同样算「卡面风格」
  for (const r of RANKS) {
    if (!cssRanks.has(r)) continue;
    // 收藏档特例：带宽与装饰线的值就是 `.home-card` 基础声明那一份（与 --rank-frame 的
    // `var(..., 2px)` 兜底、--cframe 的基础色同一个道理：漏挂等级类时按收藏渲染）。
    if (r === 'collector') continue;
    const blk = rulesWith(sec, `.home-card-rank--${r}`);
    for (const tok of ['--rank-band', '--rank-line']) {
      if (!blk.includes(tok)) {
        failures.push(
          `✗ ${CSS} 的等级「${r}」没有声明 ${tok} —— 边框的分量（层数/宽度）与装饰线是**稀有度阶梯**` +
            `的主要载体，漏了这一档的边框就与别的档分不开`
        );
      }
    }
  }
  for (const s of knownStyles) {
    if (s === 'foil') continue;   // foil 没有规则块：它的线色就是基类默认那一份
    const blk = rulesWith(stylesSec, `.home-card--${s}`);
    if (!blk) continue;
    // ① **结构**令牌（边栏瓦片、角花）不许由工艺给 —— 那是等级的，一旦回到「每种工艺一副框」，
    //    「同档的卡框一厚一薄」就会重现（这正是上一版被打回的那件事）。
    if (/--fret-(rail|corner)/.test(blk)) {
      failures.push(
        `✗ ${CSS} 的风格「${s}」里出现了 --fret-rail / --fret-corner（边框的**结构**）——` +
          `结构归等级：带宽、角饰显隐、淡入都由 .home-card-rank--* 给`
      );
    }
    // ② 但装饰线的**颜色**必须由工艺给（它是材质）—— 用户 2026-09-21 选的口径：
    //    「不喜欢全部都是金色」，于是十六种工艺各有一条自己的线色。漏写的表现是
    //    「这颗卡沿用默认的珠白」，页面上只是颜色不太对，看不出是漏了。
    if (!blk.includes('--fret-line')) {
      failures.push(
        `✗ ${CSS} 的风格「${s}」没有声明 --fret-line —— 边框装饰线的颜色归**工艺**（材质），` +
          `漏了会沿用默认的珠白。见「边框：等级管结构、工艺管材质」那一节`
      );
    }
  }
}

/* ---------- 词条 ---------- */
const i18n = readFileSync(I18N, 'utf8');
for (const key of I18N_KEYS) {
  if (!new RegExp(`^\\[${key}\\]`, 'm').test(i18n)) {
    failures.push(`✗ ${I18N} 里缺词条 [${key}] —— 卡片组的按钮名/播报会退回兜底英文`);
  }
}

/* ---------- 卡片墙的 data-* 契约（deck-wall.js ↔ deck-wall.html）----------

   2026-09-21 晚加。JS 侧一律用 `attr('bySeries')` 这种键名读文案，而模板那侧写成
   `data-by-series` —— **中间那层 camelCase ↔ kebab-case 的对应是隐式的**：模板里漏写一条，
   表现不是报错而是「那一处退回兜底英文（或空串）」，页面上只少一句提示语。
   第二轮又往这个契约里加了四条（分组、抽卡、显形播报、抽卡图标），所以把它核起来。 */
{
  const WALL_JS = join('assets', 'js', 'deck-wall.js');
  const WALL_TMPL = join('layouts', '_partials', 'deck-wall.html');
  if (!existsSync(WALL_JS) || !existsSync(WALL_TMPL)) {
    failures.push(`✗ 找不到 ${WALL_JS} 或 ${WALL_TMPL} —— data-* 契约这条守卫失效`);
  } else {
    const js = readFileSync(WALL_JS, 'utf8');
    const tmpl = readFileSync(WALL_TMPL, 'utf8');
    const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
    const keys = new Set([...js.matchAll(/attr\('([A-Za-z]+)'/g)].map((m) => m[1]));
    for (const k of [...keys].sort()) {
      if (!tmpl.includes(`data-${kebab(k)}`)) {
        failures.push(
          `✗ ${WALL_TMPL} 缺 data-${kebab(k)}（deck-wall.js 用 attr('${k}') 读它）—— ` +
            `那一处会静默退回兜底文案`
        );
      }
    }
    // 反方向只提示：模板里多给一条 data-* 不一定是错（弹层那几条 home-deck.js 也在读）
  }
}

/* ---------- 3D 查看器的风格参数表 ----------

   YAML 里的 style 字段有**两处**消费点：首页那张卡走 CSS 类（home-card--<style>），
   弹层里的 3D 卡走 assets/js/card-3d.js 里的 STYLE_3D 表。少写一种风格**不会报错**，
   只会静默套用兜底（foil）—— 表现是「这张卡在首页看着是金边、转起来却是普通全息」，
   而那种不一致只有把两种视图摆在一起才看得出来。所以这里核一次键。 */
const CARD3D = join('assets', 'js', 'card-3d.js');
if (!existsSync(CARD3D)) {
  failures.push(`✗ 找不到 ${CARD3D} —— 3D 查看器的风格参数表没了，这条守卫会失效`);
} else {
  const js = readFileSync(CARD3D, 'utf8');
  const block = js.slice(js.indexOf('var STYLE_3D'), js.indexOf('var STYLE_FALLBACK'));
  const table = new Set();
  for (const m of block.matchAll(/^\s{4}'?([a-z][a-z0-9-]*)'?\s*:\s*\{/gm)) table.add(m[1]);
  if (!table.size) {
    failures.push(`✗ ${CARD3D} 里没能解析出 STYLE_3D 的键 —— 那条正则与代码结构脱节了，请同步`);
  }
  const missing = [...usedStyles].filter((s) => !table.has(s)).sort();
  if (missing.length) {
    failures.push(
      `✗ 这些风格在清单里用到了，但 ${CARD3D} 的 STYLE_3D 里没有条目：${missing.join(' / ')} —— ` +
        `3D 卡会静默套用兜底的 foil 参数（首页看着是它、转起来不是它）`
    );
  }
  const extra = [...table].filter((s) => !knownStyles.has(s)).sort();
  if (extra.length) {
    notes.push(`· ${CARD3D} 的 STYLE_3D 里有 CSS 中不存在的风格：${extra.join(' / ')}`);
  }
}

/* ---------- 3D 查看器的**等级**参数表（2026-09-21 补上，与上面 STYLE_3D 那条同一个道理） ----------

   原先只守了风格那一张表，等级那张没人核 —— 六档之后「少一档」的代价更大：新增的珍稀/秘藏
   如果在 RANK_3D 里没有条目，3D 里会静默套用兜底（collector），表现是「首页看着是珍稀的框、
   转起来是纸白切口」，而这两种视图永远不会同时出现在一屏里，所以只有摆在一起才发现。 */
{
  const js = readFileSync(CARD3D, 'utf8');
  const a = js.indexOf('var RANK_3D');
  const b = js.indexOf('var BACK_RING_A');
  const block = a >= 0 && b > a ? js.slice(a, b) : '';
  const table = new Set();
  for (const m of block.matchAll(/^\s{4}'?([a-z][a-z0-9-]*)'?\s*:\s*\{/gm)) table.add(m[1]);
  if (!table.size) {
    failures.push(
      `✗ ${CARD3D} 里没能解析出 RANK_3D 的键 —— 那条正则与代码结构脱节了（RANK_3D 到 BACK_RING_A 之间），请同步`
    );
  }
  const usedRanks = new Set(entries.map((c) => String(c.rank || 'collector')));
  const missing = [...usedRanks].filter((r) => !table.has(r)).sort();
  if (missing.length) {
    failures.push(
      `✗ 这些等级在清单里用到了，但 ${CARD3D} 的 RANK_3D 里没有条目：${missing.join(' / ')} —— ` +
        `3D 卡会静默套用兜底的 collector 参数（首页看着是这一档、转起来不是）`
    );
  }
  const extra = [...table].filter((r) => !RANKS.has(r)).sort();
  if (extra.length) {
    notes.push(`· ${CARD3D} 的 RANK_3D 里有清单用不到的等级：${extra.join(' / ')}`);
  }
  // 卡背的分级靠 back 序号取 BACK_RING_A/BACK_RING_W 两张表的值 —— 序号超出表长会取到 undefined，
  // canvas 那边会静默画不出那圈环。所以顺便核一下两表的长度盖得住所有档位。
  const lens = [...js.matchAll(/var BACK_RING_[AW]\s*=\s*\[([^\]]*)\]/g)]
    .map((m) => m[1].split(',').length);
  const maxBack = Math.max(0, ...[...block.matchAll(/back:\s*(\d+)/g)].map((m) => Number(m[1])));
  if (lens.length !== 2 || Math.min(...lens) <= maxBack) {
    failures.push(
      `✗ ${CARD3D} 的 BACK_RING_A / BACK_RING_W 长度（${lens.join('/')}）盖不住最大档位序号 back: ${maxBack} —— ` +
        `超出的档位取到 undefined，卡背那圈徽记环会**静默画不出来**`
    );
  }

  /* ⑧ 立体通道的**完整性**与**单调性**（2026-09-21 加，与用户那条「不同级别的立体效果要有
     差异体现」一一对应）。两条都是静默失败：
       · 某一档漏写一个通道 → 那一档的那一项沿用 undefined → gl.uniform1f(undefined) 静默无效
         （效果就是没有），页面上看不出来；
       · 某一档的数值比下一档还小 → 阶梯反了，而只有把两档摆在一起才看得出来。
     再核一条**名称对齐**：initGL 里的 uniform 名单与 draw() 里实际设置的必须一一对应 ——
     名字拼错时 getUniformLocation 返回 null，而 uniform1f(null, x) 只是静默无效。 */
  const FX_LEGACY = ['metal', 'emis', 'diff', 'relief', 'back', 'shadow', 'sweep'];
  // 注：「基础 2 层」（主体浮在背景之上）用的是 bgZoom/bgPar/drift 三条，它们**全档位都有**
  // （2026-09-24 从传世/奇迹放开，brief 四.4「基础（全部档位）：2 层」），单调性由下面这段守卫兜着。
  // 后四项是 2026-09-21 第二轮加的（透明盖 + 「好像要脱离卡面」）：
  //   lid 盖子（**唯一多一遍混合绘制**的通道）  wall 侧壁取色  cast 卡面接触投影  drift 主体/背景微视差
  const FX_NEW = ['steps', 'sparkle', 'holo', 'halo', 'cliff', 'glint', 'bgZoom', 'bgPar',
    'wall', 'cast', 'lid', 'cone', 'drift',
    // 第三轮（2026-09-21）：两个**曲线场**的权重 —— 光锥上的玫瑰线花瓣（coneC）与
    // 全息流光走的对数螺线（holoC）。收藏/珍稀为 0，也就是「与加这批之前逐像素一致」。
    'coneC', 'holoC',
    // 第四轮（2026-09-21）：**画质**两项。disp = 主体色散（按 POM 位移把 RGB 分开采样）、
    // sharp = 卡面锐化（纹理源头只有 700px 高，放大到 840、xl 档 1064）。低三档同样是 0 ——
    // 「低档不许被顺手美化」这条纪律对它们一样成立。
    'disp', 'sharp'];
  const FX_ALL = FX_LEGACY.concat(FX_NEW);
  // 单调不减的通道（back 是序号、glint 只在拖动时有值，都参与；metal/emis/diff 本来就是阶梯）
  const MONO = FX_ALL.filter((f) => f !== 'glint');
  const objs = [...block.matchAll(/([a-z]+)\s*:\s*\{([^}]*)\}/g)];
  if (!objs.length) {
    failures.push(`✗ ${CARD3D} 里没能解析出 RANK_3D 每档的字段 —— 解析正则与代码结构脱节了，请同步`);
  }
  const perRank = new Map();
  for (const m of objs) {
    const fields = new Map();
    for (const f of m[2].matchAll(/([a-zA-Z][a-zA-Z0-9]*)\s*:\s*(-?[\d.]+)/g)) {
      fields.set(f[1], Number(f[2]));
    }
    perRank.set(m[1], fields);
  }
  for (const [rank, fields] of perRank) {
    const miss = FX_ALL.filter((f) => !fields.has(f));
    if (miss.length) {
      failures.push(
        `✗ ${CARD3D} 的 RANK_3D.${rank} 缺字段：${miss.join(' / ')} —— ` +
          `缺的那一项会被当成 undefined，gl.uniform1f 静默无效（那一档就是没有这个效果）`
      );
    }
  }
  // 单调性：按 RANKS 的顺序（Set 的插入顺序就是阶梯顺序）逐通道比
  const order = [...RANKS].filter((r) => perRank.has(r));
  for (const f of MONO) {
    for (let i = 1; i < order.length; i++) {
      const prev = perRank.get(order[i - 1]).get(f), cur = perRank.get(order[i]).get(f);
      if (prev === undefined || cur === undefined) continue;
      if (cur < prev) {
        failures.push(
          `✗ ${CARD3D} 的 RANK_3D 通道「${f}」不单调：${order[i]} = ${cur} < ${order[i - 1]} = ${prev} —— ` +
            `这是「等级越高立体效果越强」的骨架，反了就只有把两档摆在一起才看得出来`
        );
      }
    }
  }
  // POM 上限必须装得下「档位最大步数 × 掠射角倍数」。
  // 写小了**不会报错**：循环边界是编译期常量，掠射角那一档会被静默截到上限 ——
  // 页面上只表现为「最高档在侧面看还是有条纹状的步进误差」，没人会想到是上限写小了。
  {
    const maxSteps = Math.max(...[...perRank.values()].map((f) => f.get('steps') || 0));
    const capM = js.match(/var\s+POM_STEPS_MAX\s*=\s*(\d+)/);
    const multM = js.match(/var\s+POM_GRAZE_MAX\s*=\s*([\d.]+)/);
    if (!capM) {
      failures.push(`✗ ${CARD3D} 里没解析出 POM_STEPS_MAX —— 解析正则与代码结构脱节了，请同步`);
    } else {
      const need = Math.ceil(maxSteps * (multM ? Number(multM[1]) : 1));
      if (Number(capM[1]) < need) {
        failures.push(
          `✗ ${CARD3D} 的 POM_STEPS_MAX = ${capM[1]} 装不下「档位最大步数 ${maxSteps} × 掠射角倍数 ` +
            `${multM ? multM[1] : '?'}」= ${need} —— 超出的部分会被**静默截掉**（最高档在侧面看仍有步进条纹）`
        );
      } else {
        notes.push(`· POM 上限 ${capM[1]} ≥ 最大步数 ${maxSteps} × ${multM ? multM[1] : 1}（掠射角那档装得下）`);
      }
    }
  }

  // uniform 名单 vs draw() 里真正设置的。draw() 的函数体**按两个函数头切片**取，不用花括号
  // 配平的正则：这个仓库的工作区是 CRLF，`\n  }\n` 那样的正则匹配不到（第一版就这么假绿过 ——
  // 它报的是「解析不出」，而不是「对不上」）。
  const listM = js.match(/\[([^\]]*uProj[^\]]*)\]\s*\.forEach\(\s*function\s*\(n\)/);
  const listed = listM ? [...listM[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [];
  const di = js.indexOf('function draw()');
  const dj = js.indexOf('function rankOf()', di);
  const drawBody = di >= 0 && dj > di ? js.slice(di, dj) : '';
  const used = [...new Set([...drawBody.matchAll(/\bU\.(\w+)/g)].map((m) => m[1]))];
  if (!listed.length || !used.length) {
    failures.push(`✗ ${CARD3D} 里没能解析出 uniform 名单或 draw() 的用法 —— 解析正则与代码结构脱节了，请同步`);
  } else {
    const notSet = listed.filter((n) => !used.includes(n));
    const notListed = used.filter((n) => !listed.includes(n));
    if (notSet.length || notListed.length) {
      failures.push(
        `✗ ${CARD3D} 的 uniform 名单与 draw() 对不上：` +
          (notSet.length ? `名单里有但从未设置：${notSet.join(' / ')}；` : '') +
          (notListed.length ? `draw() 设了但不在名单里：${notListed.join(' / ')}` : '') +
          ` —— 后者的名字查不到 location，uniform1f(null, x) **静默无效**`
      );
    }
    notes.push(`· 立体通道 ${FX_NEW.length} 项 × ${perRank.size} 档，uniform 名单 ${listed.length} 个（与 draw() 对齐）`);
  }
}

/* ---------- ⑦ 工艺的两档（收藏库筛选条的分组） ----------

   deck-manifest.html 的 $styleTier 是「哪种工艺算哪一档」的**唯一事实源** —— 筛选条按它把
   十二项分成「普通 / 进阶」两组，JS 侧读的是清单里那个 styleTier 字段。三种漏法都是静默的：

     · 表里漏一种风格 → 那张卡在筛选条里**排到所有工艺之后、没有档位标签**（页面上只是顺序怪）；
     · 表里写了 CSS 里不存在的风格 → 与风格表脱节（多半是改名后忘删）；
     · 档位名与 deck-wall.js 的 TIER_ORDER 对不上 → 分组**整片塌成一组**，两个组标签一个都不显示。

   所以核三件事：与 CSS 的风格集合**双向**对齐、与清单里用到的风格一致（前者已覆盖）、
   以及两个键与 TIER_ORDER 逐字相同。 */
{
  const MANIFEST_HTML = join('layouts', '_partials', 'deck-manifest.html');
  const mh = readFileSync(MANIFEST_HTML, 'utf8');
  const a = mh.indexOf('$styleTier := dict');
  const b = a >= 0 ? mh.indexOf('}}', a) : -1;
  const block = b > a ? mh.slice(a, b) : '';
  const tierOf = new Map();
  for (const m of block.matchAll(/"([a-z0-9-]+)"\s+"([a-z]+)"/g)) {
    if (tierOf.has(m[1])) {
      failures.push(`✗ ${MANIFEST_HTML} 的 $styleTier 里「${m[1]}」出现了两次 —— 后一条会盖掉前一条`);
    }
    tierOf.set(m[1], m[2]);
  }
  if (!tierOf.size) {
    failures.push(`✗ ${MANIFEST_HTML} 里没解析出 $styleTier 的键 —— 那条正则与模板结构脱节了，请同步`);
  }
  const missTier = [...knownStyles].filter((s) => !tierOf.has(s)).sort();
  if (missTier.length) {
    failures.push(
      `✗ 这些风格在 $styleTier 里查不到档位：${missTier.join(' / ')} —— ` +
        `它们在收藏库的筛选条里会**没有档位标签、排到所有工艺之后**`
    );
  }
  const extraTier = [...tierOf.keys()].filter((s) => !knownStyles.has(s)).sort();
  if (extraTier.length) {
    failures.push(`✗ $styleTier 里有 CSS 中不存在的风格：${extraTier.join(' / ')} —— 档位表与风格表脱节了`);
  }

  // 档位名要与 deck-wall.js 的 TIER_ORDER 一致（那是筛选条里两组的呈现顺序）
  const WALL_JS = join('assets', 'js', 'deck-wall.js');
  const wallJs = readFileSync(WALL_JS, 'utf8');
  const om = wallJs.match(/var TIER_ORDER\s*=\s*\[([^\]]*)\]/);
  const order = om ? [...om[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]) : [];
  if (!order.length) {
    failures.push(`✗ ${WALL_JS} 里没解析出 TIER_ORDER —— 那条正则与代码结构脱节了，请同步`);
  } else {
    const usedTiers = [...new Set([...tierOf.values()])].sort();
    const onlyMap = usedTiers.filter((t) => !order.includes(t));
    const onlyJs = order.filter((t) => !usedTiers.includes(t));
    if (onlyMap.length || onlyJs.length) {
      failures.push(
        `✗ 档位名对不上：$styleTier 用 ${usedTiers.join(' / ')}，${WALL_JS} 的 TIER_ORDER 用 ` +
          `${order.join(' / ')} —— 对不上的档在筛选条里**整组塌掉**（没有组标签、混进别的组），页面上不报错`
      );
    }
  }

  const perTier = {};
  for (const c of entries) {
    const t = tierOf.get(String(c.style));
    if (t) perTier[t] = (perTier[t] || 0) + 1;
  }
  notes.push(
    '· 工艺两档：' +
      order
        .map((t) => `${t} ${[...tierOf.values()].filter((v) => v === t).length} 种 / ${perTier[t] || 0} 张`)
        .join('，')
  );
}

/* ---------- ⑧ 参数化的工艺：数据 → 生成物（2026-09-21 加，样板见 docs/exp-craft.md）----------

   data/card-styles.yaml 是「已参数化工艺」的单一事实源（样板里是 nacre / silk），
   tools/cards/render-styles.mjs 读它出两样东西：assets/css/decks/21-card-styles.css、
   以及 card-3d.js 的 STYLE_3D 里那几行。两条纪律：

     · **数据与生成物必须逐字一致**：手改生成物、或改了 YAML 忘了重跑渲染器 —— 都在这里拦下。
       做法是把渲染器当模块调（不另开子进程），拿到与 --write 完全相同的预期文本再比。
     · **同一种工艺不许既有手写块又有生成块**：两处都在的话后写的赢，改另一处「没有反应」，
       构建全绿、只是那几张卡的工艺不对 —— 正是这个仓库最怕的静默失效。

   顺带把数据里那两个「将来要接管手写表」的字段与现状对拍：labelKey ↔ i18n 词条 ↔
   deck-manifest.html 的 styleLabel 表；tier ↔ 同一文件的 $styleTier 表。写岔了在迁移完成前就看得见。 */
{
  const DATA_STYLES = join('data', 'card-styles.yaml');
  const RENDERER = join('tools', 'cards', 'render-styles.mjs');
  const MANIFEST_HTML = join('layouts', '_partials', 'deck-manifest.html');
  if (!existsSync(DATA_STYLES) || !existsSync(RENDERER)) {
    failures.push(`✗ 缺 ${DATA_STYLES} 或 ${RENDERER} —— 参数化工艺的事实源/渲染器不见了，这一节守卫失效`);
  } else {
    const mod = await import(pathToFileURL(RENDERER).href);
    const styles = mod.loadStyles();
    const names = Object.keys(styles);
    for (const p of mod.checkSync(styles).problems) failures.push(p);

    // ① 手写块与生成块不许并存。
    // 判据是「**恰好是主块**」（行首 .home-card--<名> {）而不是「出现过」：伪元素
    // （.home-card--holo-prism::before）、后代与深色主题覆写（:root[data-theme="dark"] .home-card--X
    // { --coverlay-op }）都是结构层/主题层，与参数化的令牌块**本来就该并存** ——
    // 按「出现过」判会在这几种上误报。
    const handwritten = new Set(
      [...css.matchAll(/^[.]home-card--([a-z0-9-]+)[ \t]*\{/gm)].map((m) => m[1])
    );
    const both = names.filter((n) => handwritten.has(n));
    if (both.length) {
      failures.push(
        `✗ 这些工艺**同时**有手写块与生成块：${both.join(' / ')} —— ` +
          `${CSS} 里那一处要删掉：后写的赢，改另一处不会有反应，页面上也不报错`
      );
    }
    const noClass = names.filter((n) => !knownStyles.has(n));
    if (noClass.length) failures.push(`✗ 生成的 CSS 里没有这些工艺的类：${noClass.join(' / ')}`);

    // ② labelKey / tier 与还在手写的那两张表对拍
    const mh = readFileSync(MANIFEST_HTML, 'utf8');
    const labelOf = new Map(
      [...mh.matchAll(new RegExp('"([a-z0-9-]+)"[ ]*[(]i18n[ ]*"(deckStyle[A-Za-z]+)"', 'g'))].map(
        (m) => [m[1], m[2]]
      )
    );
    const tierOpen = mh.indexOf('$styleTier := dict');
    const tierBlock = tierOpen < 0 ? '' : mh.slice(tierOpen, mh.indexOf('}}', tierOpen));
    const tierOf = new Map(
      [...tierBlock.matchAll(new RegExp('"([a-z0-9-]+)"[ ]+"([a-z]+)"', 'g'))].map((m) => [m[1], m[2]])
    );
    const i18nText = readFileSync(I18N, 'utf8');
    for (const n of names) {
      const s = styles[n];
      if (!i18nText.includes(`[${s.labelKey}]`)) {
        failures.push(
          `✗ ${DATA_STYLES} 的「${n}」写了 labelKey ${s.labelKey}，但 ${I18N} 里没有这个词条 —— 卡片墙那格会缺中文名`
        );
      }
      const inMh = labelOf.get(n);
      if (inMh && inMh !== s.labelKey) {
        failures.push(
          `✗ 「${n}」的中文名词条：${DATA_STYLES} 写 ${s.labelKey}，${MANIFEST_HTML} 的 styleLabel 表写 ${inMh} —— 卡片墙显示的是模板那一套`
        );
      }
      const t = tierOf.get(n);
      if (t && t !== s.tier) {
        failures.push(
          `✗ 「${n}」的档位：${DATA_STYLES} 写 ${s.tier}，${MANIFEST_HTML} 的 $styleTier 写 ${t} —— 筛选条分组按模板那一套`
        );
      }
    }
    notes.push(
      `· 参数化的工艺 ${names.length} 种（${names.join(' / ')}）：CSS 块与 STYLE_3D 行都由 ${DATA_STYLES} 出，已核与生成物逐字一致`
    );
  }
}

/* ---------- ⑨ 工艺 × 卡面明度（2026-09-24 加；规则与实测见 docs/card-redesign-brief.md §十八）----------

   卡面明度分三档，各档有一个「允许工艺」集合（亮 ≥185 / 中 140~185 / 暗 <140）。这条规则的
   **唯一一份实现**是 scripts/deck-edit.py 的 CRAFT_RULE —— 管理页的收藏库面板也读它。
   这里**不抄第二份**（抄一份 = 迟早两份不一样，而症状是「面板说没事、墙上那张是脏的」），
   两条腿都踩在同一处：

     · **一致性（纯 Node，永远跑）**：从 deck-edit.py 的源码里解析 CRAFT_RULE / CRAFT_CODES，
       与工艺表（data/card-styles.yaml 那几种 + foil 这个特例）对拍 —— 两边认得的代码名必须
       **恰好相等**。少一个 = 新加的工艺落在判定表之外、永远不体检；多一个 = 判定表还留着
       已汰除的代码（收敛时漏删）。
     · **体检（Python + Pillow）**：明度**现算**（卡面灰度均值，缩到 60×84 再取均值），
       不写死进清单 —— 换图后自动重算。算法、阈值、建议工艺都在 deck-edit.py 里，这里只跑它、
       读它 `list --json` 的输出。所以要一个装了 Pillow 的 Python（scripts/deck-edit.py 与
       管理页本来就要求同一个；CI 在 .github/actions/validate/action.yml 里先装 pillow）。

   为什么值得逐张现算：乱配的表现不是报错，而是 205px 上「脏 / 糊 / 像坏了」（brief §十六 那张
   实测表），构建与控制台全绿、只是难看 —— 正是这个仓库最怕的那类失败。
   要破例（例如暗卡偏要珠光）就在清单里写 `craft_exempt: true`：守卫放行，但每次都把名字打出来。 */
{
  const DECK_EDIT = join('scripts', 'deck-edit.py');
  const pySrc = existsSync(DECK_EDIT) ? readFileSync(DECK_EDIT, 'utf8') : '';
  const mRule = /CRAFT_RULE\s*=\s*\[([\s\S]*?)\n\]/.exec(pySrc);
  const mCodes = /CRAFT_CODES\s*=\s*\{([\s\S]*?)\n\}/.exec(pySrc);
  const stylesMod = await import(pathToFileURL(join('tools', 'cards', 'render-styles.mjs')).href);
  const tableCodes = new Set([...Object.keys(stylesMod.loadStyles()), 'foil']);
  if (!mRule || !mCodes) {
    failures.push(
      `✗ 从 ${DECK_EDIT} 里解析不出 CRAFT_RULE / CRAFT_CODES —— 「工艺 × 明度」这条守卫会**静默失效**，` +
        `请同步那个脚本与这里的正则（它们必须是同一份规则，见本节说明）`
    );
  } else {
    const bands = [...mRule[1].matchAll(/\(\s*"([a-z]+)"\s*,\s*"([^"]+)"\s*,\s*(None|\d+)\s*,\s*(None|\d+)\s*,\s*\[([^\]]*)\]/g)]
      .map((m) => ({ key: m[1], label: m[2], lo: m[3] === 'None' ? null : Number(m[3]), hi: m[4] === 'None' ? null : Number(m[4]), crafts: [...m[5].matchAll(/"([^"]+)"/g)].map((x) => x[1]) }));
    const groups = [...mCodes[1].matchAll(/"([^"]+)"\s*:\s*\[([^\]]*)\]/g)]
      .map((m) => ({ craft: m[1], codes: [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]) }));
    const ruleCodes = new Set(groups.flatMap((g) => g.codes));
    const named = groups.map((g) => g.craft);
    if (bands.length !== 3) {
      failures.push(`✗ ${DECK_EDIT} 的明度档不是三档（解析出 ${bands.length} 档）—— 守卫的判据与表结构脱节了`);
    }
    const inBands = new Set(bands.flatMap((b) => b.crafts));
    const notInBands = named.filter((c) => !inBands.has(c));
    if (notInBands.length) failures.push(`✗ ${DECK_EDIT} 里这些工艺没被任何明度档收下：${notInBands.join(' / ')} —— 它们落在三档之外，永远不会被判违规`);
    const ghosts = [...inBands].filter((c) => !named.includes(c));
    if (ghosts.length) failures.push(`✗ ${DECK_EDIT} 的三档表里有 CRAFT_CODES 不认得的工艺名：${ghosts.join(' / ')} —— 名字写岔了就等于漏判`);
    const noCode = [...tableCodes].filter((c) => !ruleCodes.has(c)).sort();
    if (noCode.length) failures.push(`✗ 这些工艺代码不在 ${DECK_EDIT} 的判定表里：${noCode.join(' / ')} —— 它们的明度档**永远不会被体检**（加一种工艺要同时进那张表）`);
    const codeGhosts = groups.map((g) => g.codes[0]).filter((c) => !tableCodes.has(c)).sort();
    if (codeGhosts.length) failures.push(`✗ ${DECK_EDIT} 的判定表还认得工艺表里已经没有的代码：${codeGhosts.join(' / ')} —— 收敛时漏删（先删这里、再删别处，否则那份「允许集合」会一直列着它）`);
    const unjudged = [...usedStyles].filter((s) => !ruleCodes.has(s)).sort();
    if (unjudged.length) failures.push(`✗ ${MANIFEST} 里这些 style 不在判定表里：${unjudged.join(' / ')} —— 它们的明度档是白填的`);
    /* 体检：跑 deck-edit.py（明度那半边的唯一实现），读它的 JSON。 */
    const PY = [process.env.DECK_PYTHON, process.env.ADMIN_PYTHON, 'python', 'python3', 'py'].filter(Boolean);
    let py = null;
    for (const cand of PY) {
      const probe = spawnSync(cand, ['-c', 'import PIL, numpy'], { encoding: 'utf8' });
      if (!probe.error && probe.status === 0) { py = cand; break; }
    }
    if (!py) {
      failures.push(
        `✗ 找不到「装了 Pillow 的 Python」，跑不了「工艺 × 明度」体检 —— 明度必须现算（与 ${DECK_EDIT} 同一套算法）。` +
          `装一下：python -m pip install pillow；或用 DECK_PYTHON / ADMIN_PYTHON 指定解释器`
      );
    } else {
      const run = spawnSync(py, [DECK_EDIT, 'list', '--json'], {
        cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
      });
      let data = null;
      if (run.status !== 0) {
        failures.push(`✗ ${DECK_EDIT} list --json 跑不起来（${py} 退出码 ${run.status}）：${String(run.stderr || '').trim().split('\n').slice(-2).join(' / ')}`);
      } else {
        try { data = JSON.parse(run.stdout); } catch { data = null; }
        if (!data) failures.push(`✗ 读不懂 ${DECK_EDIT} list --json 的输出 —— 那个脚本的 JSON 形状变了？这条守卫会失效，请同步`);
      }
      if (data) {
        const s = data.summary || {};
        const byBand = s.byBand || {};
        const bad = (data.cards || []).filter((c) => c.violation);
        for (const c of bad) {
          failures.push(
            `✗ 「${c.name}」（${c.series}，明度 ${c.L} = ${c.bandLabel}档）挂着 ${c.style}（${c.styleLabel}）—— ` +
              `这一档允许的是 ${(c.allowed || []).map((a) => a.label).join(' / ')}；建议换成 ${c.recommendCraft}（${c.recommended}）` +
              `。要保留现状就在 ${MANIFEST} 那一张上写 craft_exempt: true`
          );
        }
        const exempt = (data.cards || []).filter((c) => c.exempt);
        notes.push(
          `· 工艺 × 明度：${s.total ?? data.count} 张卡面**现算**明度（亮 ${byBand['亮'] ?? 0} / 中 ${byBand['中'] ?? 0} / 暗 ${byBand['暗'] ?? 0}），` +
            `三档允许集合取自 ${DECK_EDIT} 的 CRAFT_RULE —— ${bad.length ? `有 ${bad.length} 张越档` : '逐张都落在自己那档的允许集合里'}` +
            (exempt.length ? `；显式豁免 ${exempt.length} 张（craft_exempt）：${exempt.map((c) => c.name).join(' / ')}` : '')
        );
      }
    }
  }
}

/* ---------- 报告 ---------- */
const unused = [...knownStyles].filter((s) => !usedStyles.has(s)).sort();
notes.push(
  `· 清单 ${entries.length} 张卡，用到 ${usedStyles.size} 种风格` +
    (unused.length ? `；CSS 里还有没用上的：${unused.join(' / ')}` : '')
);

// 工艺分布：2026-09-21 做过一次重排（金边 14 / 和纸 13 → 墨 1 / 星芒全息 1 的偏态），
// 目标写成可核的数：**每种至少 3 张**。它不阻断（内容口径、不是错），但要看得见 ——
// 卡片墙存在的一条理由就是「一眼看出这些不是同一种卡」，分布塌回两三种时那条理由就没了。
{
  const perStyle = new Map();
  for (const c of entries) perStyle.set(String(c.style), (perStyle.get(String(c.style)) || 0) + 1);
  const thin = [...perStyle.entries()].filter(([, n]) => n < 3).sort((a, b) => a[1] - b[1]);
  const max = Math.max(...perStyle.values());
  notes.push(
    `· 工艺分布：最多 ${max} 张，最少 ${Math.min(...perStyle.values())} 张` +
      (thin.length ? ` —— **${thin.map(([s, n]) => s + ' ' + n).join(' / ')} 少于 3 张**` : '（每种都 ≥ 3 张）')
  );
}

/* ---------- 日期种子的**两份副本**（2026-09-25）----------
   home-deck.js 用它抽「首页今天的 12 张」，deck-wall.js 用它做「今日一抽」的顺序。
   两处都是经典脚本、没有模块可共享，所以只能靠这条守卫防漂移 ——
   漂移的表现是两种「今天」给出不同的顺序，**页面上不会有任何报错**。
   （只比函数体、不比名字：deck-wall 那份叫 todaySeed，名字不同是故意的。） */
const SEED_A = readFileSync(join('assets', 'js', 'home-deck.js'), 'utf8');
const SEED_B = readFileSync(join('assets', 'js', 'deck-wall.js'), 'utf8');
function seedBody(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return null;
  const j = src.indexOf('\n  }', i);
  if (j < 0) return null;
  return src.slice(i, j).replace(/function \w+/, 'function').replace(/\s+/g, ' ').trim();
}
for (const [na, nb] of [['hash01', 'hash01'], ['daySeed', 'todaySeed']]) {
  const a = seedBody(SEED_A, na), b = seedBody(SEED_B, nb);
  if (!a || !b) {
    failures.push(`✗ 日期种子的 ${na}() / ${nb}() —— 两份副本里有一份找不到了（home-deck.js 与 deck-wall.js 必须各有一份）`);
  } else if (a !== b) {
    failures.push(
      `✗ 日期种子的两份副本漂移了：home-deck.js 的 ${na}() 与 deck-wall.js 的 ${nb}() 必须逐行相同 —— ` +
        `它们决定「首页今天的 12 张」与「今日一抽」用的是不是同一个「今天」`
    );
  }
}
const STEP = /hash01\(seed \+ k \* 0x9e3779b1\)/;
if (!STEP.test(SEED_A) || !STEP.test(SEED_B)) {
  failures.push('✗ 洗牌步长的那个黄金比例常数（0x9e3779b1）在两份副本里对不上');
}

// 2026-09-25：玩法层那几条（搜索 / 卡册翻页 / 对比 / 存图 / 开包）的文字都靠 data-* 从
// 模板传进 JS，模板里写的又是 i18n 的**键名**。少一个键的后果是静默的：段落的默认值会
// 退回英文（data-save 没写 → 按钮上出现 "save"），构建全绿、守卫也全绿。
// 所以这里两边都查：键在不在 zh.toml、用到的模板有没有声明这个值。
{
  const toml = readFileSync(join('i18n', 'zh.toml'), 'utf8');
  const DIALOG_KEYS = ['deckSave', 'deckCompare', 'deckCompareClear', 'deckCompareGo', 'deckCompareTitle', 'deckCompareFail'];
  const WALL_KEYS = ['deckSearch', 'deckSearchHint', 'deckSearchHit', 'deckBookOn', 'deckBookOff',
    'deckPage', 'deckPagePrev', 'deckPageNext'];
  for (const key of DIALOG_KEYS.concat(WALL_KEYS)) {
    if (!toml.split(/\r?\n/).some((l) => l.trim() === '[' + key + ']')) {
      failures.push(`✗ i18n/zh.toml 少了 [${key}] —— 对应的控件会静默回落成英文`);
    }
  }
  const need = [
    ['layouts/_partials/home-cards.html', [
      ['data-save', 'deckSave'], ['data-compare', 'deckCompare'], ['data-compare-clear', 'deckCompareClear'],
      ['data-compare-go', 'deckCompareGo'], ['data-compare-title', 'deckCompareTitle'], ['data-compare-fail', 'deckCompareFail'],
    ]],
    ['layouts/_partials/deck-wall.html', [
      ['data-search', 'deckSearch'], ['data-search-hint', 'deckSearchHint'], ['data-search-hit', 'deckSearchHit'],
      ['data-book-on', 'deckBookOn'], ['data-book-off', 'deckBookOff'],
      ['data-page', 'deckPage'], ['data-page-prev', 'deckPagePrev'], ['data-page-next', 'deckPageNext'],
      ['data-save', 'deckSave'], ['data-compare', 'deckCompare'], ['data-compare-clear', 'deckCompareClear'],
      ['data-compare-go', 'deckCompareGo'], ['data-compare-title', 'deckCompareTitle'], ['data-compare-fail', 'deckCompareFail'],
    ]],
  ];
  for (const [rel, pairs] of need) {
    const src = readFileSync(rel, 'utf8');
    for (const [attr, key] of pairs) {
      const binding = attr + '="{{ i18n "' + key + '" }}"';
      if (!src.includes(binding)) {
        failures.push(`✗ ${rel} 少了一条绑定：${binding} —— 那条路的文字会静默退回默认值`);
      }
    }
  }
}

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
