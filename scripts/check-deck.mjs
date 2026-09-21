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
// 3D 查看器用的浮雕高度图（灰阶、与卡面同尺寸），由 tools/cards/make-depth.py 出。
// **路径是从 image 推导的，不是 YAML 里的字段** —— 所以它最容易出的错是「卡面改了名、
// 深度图没跟上」，而那种错的表现只是浮雕悄悄消失（平整卡面），页面上不会报任何东西。
// 这就是它必须在构建期被核一遍的原因。
const DEPTH_DIR = join(FACES_DIR, 'depth');
const depthOf = (image) => join(DEPTH_DIR, basename(image));

// 卡片组要用的词条：文案走 data-* 从模板传给 JS（JS 调不到 i18n），少一条就只剩兜底模板。
// 后 16 条是收藏库（/collection/）的卡片墙要用的：八种工艺的中文名 + 筛选条与格子按钮名。
const I18N_KEYS = ['deckNext', 'deckPrev', 'deckAnnounce', 'deckZoom', 'deckClose', 'deckCredit',
  'deckDialogLabel', 'deckFlip', 'deckFlipBack', 'deckRotate', 'deckGlFail',
  'deckRankCollector', 'deckRankRare', 'deckRankEpic', 'deckRankArcane', 'deckRankLegend', 'deckRankMiracle',
  'deckStyleFoil', 'deckStyleHoloPrism', 'deckStyleGold', 'deckStyleGlass',
  'deckStyleInk', 'deckStyleWashi', 'deckStyleYukika', 'deckStyleKintsugi',
  'deckStyleFiligree', 'deckStyleEnamel', 'deckStyleStarnight', 'deckStyleFrostcrack',
  'deckFilterLabel', 'deckFilterAll', 'deckFilterSeries', 'deckFilterStyle', 'deckFilterRank',
  'deckFilterCount', 'deckFilterEmpty', 'deckOpenCard'];
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
  const styleSection = css.slice(stylesOpen, stylesClose);
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
  for (const m of css.matchAll(/url\(#([\w-]+)\)/g)) ids.add(m[1]);
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
  const sec = css.slice(stylesOpen, stylesClose);
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
   它们在 assets/css/extended/20-card-ornaments.css 里，由 tools/cards/make-ornaments.py 生成。
   引用了不存在的令牌 = **静默失效**：mask 取不到图，那一层什么都不画（页面上只是「这一档没有
   那个纹样」，构建、控制台全绿）。所以两个方向都核：用到的必须存在、生成物里的最好都用上。 */
{
  const ORN = join('assets', 'css', 'extended', '20-card-ornaments.css');
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
    const used = new Set([...css.matchAll(/var\((--tex-[\w-]+)/g)].map((m) => m[1]));
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
  const stylesSec = css.slice(stylesOpen, stylesClose);
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
    const blk = rulesWith(stylesSec, `.home-card--${s}`);
    if (blk && /--fret-(rail|corner|line|band)/.test(blk)) {
      failures.push(
        `✗ ${CSS} 的风格「${s}」里出现了 --fret-*（边框的零件）—— 边框归**等级**管，` +
          `工艺只提供材质（--cframe-finish）。照旧写法加回去会让「同档的卡框一厚一薄」重现`
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
