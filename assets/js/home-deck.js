// 首页卡片组：一次一张，可手动切（点卡面 / ‹ › 按钮 / 键盘左右 / 触屏滑动），也会自己轮播；
// 卡下的 ⤢ 按钮打开弹层看大图，弹层里带名字、系列、序号与出处（可点外链）。
//
// **两支模式（2026-09-21）**：根节点是「带 data-deck 的容器」而不是写死的 .home-deck ——
//   · 首页（.home-deck）：有页内轮播卡 → 全套行为都在。**清单会被抽成「今天的 12 张」**
//     （`data-deck-daily="12"`，按访客本地日期作种子，见下面那段），所以首页的序号是 `01 / 12`；
//   · 收藏库 /collection/（.deck-wall）：**没有**页内轮播卡（63 张各自是一个格子、点哪张看哪张）
//     → 只提供「弹层 + 3D 查看器」，轮播相关的初始化全部跳过；清单是全部 63 张，不抽。
//   弹层与 3D 查看器只有这一份实现：卡片墙上的格子点一下，走的就是 openAt（与「今日一卡」同一条路）。
//
// 与 extend_head.html 的接线方式同其它脚本：清单（每张卡的 1x/2x URL、名牌文字、风格、出处）由模板经
// `data-deck` 以 JSON 传进来 —— 脚本不自己拼资源 URL（指纹在构建期算），文案走 data-* 传
// （JS 调不到 i18n）。
//
// 六条刻意的取舍（都是首页那支的；卡片墙上不适用的一条见上面）：
//   1. **只有当前一张在 DOM 里**：换卡是改同一个 <img> 的 src/srcset，不是切换一堆 <img> 的显隐。
//      三十多张卡全渲染的话它们叠在同一位置、全在视口内，lazy 也拦不住，首屏会白下三十多张。
//   2. **轮播的停与走**：鼠标悬停、键盘焦点进入、标签页切到后台、弹层打开时都暂停；手动切过之后
//      重新计时。系统要求减少动态（prefers-reduced-motion: reduce）时**完全不自动轮播** —— 那也是一种
//      动效，而且这类偏好的人往往就是被自动动的东西干扰的人。
//   3. **预取后两张**：换过去时图已经在缓存里，不会先看到空白再出图。只预取两张，不是整副牌。
//   4. **换卡是画面交叉淡入 + 方向位移**：`.home-card-ghost` 装住刚显示过的那一张（URL 已在缓存里），
//      主图从 0 淡入、残影从 1 淡出，两张在 340ms 里交叉 —— 中间没有空白帧（旧做法是先淡出到 10%、
//      换 src、再淡入，那一瞬卡上几乎没东西）。**整卡不进 opacity**（只走位移）：卡框要在换卡期间
//      保持稳定，整卡一起淡入会把残影一起乘算、中段两张都只剩半透明。动的开关是
//      `card.classList.add('is-in')` —— 这一行 2026-09-21 之前漏了，整套动画其实一次都没跑过。
//      不用 3D 翻转：跨浏览器的 backface 与层次问题不值得为一副牌去啃。
//   5. **按钮由脚本注入**：没有 JS 时只显示第一张卡（模板渲染的那张），不留下点不动的控件。
//   6. **弹层用 `hidden` 属性开关**，不是只改类名：`hidden` 会让对比度脚本（只遍历可见元素）
//      跳过它 —— 一块藏在屏外的面板不该进对比度表；键盘焦点也靠它才真的出得去。
(function () {
  'use strict';

  var script = document.currentScript;
  // 根节点 = 「带着清单的那个容器」。2026-09-21 从写死的 `.home-deck` 放宽到任何 [data-deck]：
  // 收藏库（/collection/）的卡片墙（.deck-wall）也把同一份清单挂在 data-deck 上，它没有轮播卡，
  // 但要**同一个弹层与同一个 3D 查看器**（见 docs/features.md ㊿）。
  var deck = document.querySelector('.home-deck[data-deck]') || document.querySelector('[data-deck]');
  if (!script || !deck) return;

  var items;
  try {
    items = JSON.parse(deck.dataset.deck || '[]');
  } catch (e) {
    return;
  }
  if (!items || items.length < 2) return;

  // 轮播卡只可能是**容器的直接子元素**（首页那处：.home-deck > .home-card）。
  // 用 :scope > 而不是后代选择器：收藏库的卡片墙里，每一格的卡面**自己就是** .home-card
  // （63 个），后代选择器会取到第一格那张，把「这一页有没有轮播卡」判成真。
  var card = deck.querySelector(':scope > .home-card');
  var img = card && card.querySelector('img');
  var ghost = card && card.querySelector('.home-card-ghost');
  var label = card && card.querySelector('.home-card-label');
  var indexEl = card && card.querySelector('.home-card-index');
  // **有没有页内轮播卡**：由模板显式声明（首页那个容器带 data-deck-carousel），而不是靠
  // 「容器里有没有 .home-card」去猜 —— 卡片墙的每一格里就有一个 .home-card，那种判据会让它
  // 误入轮播分支，表现是**点一格开弹层的同时，墙根节点上的点击监听又把卡翻到下一张**
  // （弹层里显示的比点的那张晚一张），而且首屏就开始 6 秒自动轮播、反复改写第一格。实测踩到过。
  // 没有轮播卡时这个脚本只提供「弹层 + 3D 查看器」：轮播的按钮、进度条、自动播放、键盘与触屏
  // 滑动一律不初始化。下面的分支都挂在这个判据上，首页那一路全为真。
  var carousel = deck.hasAttribute('data-deck-carousel') && !!(card && img);

  /* ---------- 首页每天只展示 12 张（2026-09-21 用户要求）----------

     一副 63 张的牌轮一圈是 6s × 63 ≈ 6 分钟，而且**天天一样**；首页那一格要的是「今天长什么样」，
     整副浏览是收藏库（/collection/）的事。所以首页每天从清单里随机抽 12 张当这一天的展示集。

     四条刻意的选择：
       1. **张数由模板声明**（`data-deck-daily="12"`），不在这里写死，也**不按 DOM 形状猜** ——
          这一轮已经因为「猜容器里有没有 .home-card」吃过一次静默的亏（见下面 carousel 那条）。
       2. **种子 = 「年 × 1000 + 一年中的第几天」**（访客本地日期），与时间卡「今日一卡」用的是同一个
          —— 两边必须同一天换、且**同池**（见 window.homeDeck.items 的注释）。
       3. **不重新构建也能换日**：抽签在浏览器里按日期做，日期一变就换批；静态站没有「今天」，
          这是唯一不依赖每日 CI 重构建的做法。
       4. **抽完按清单原序排回来**：这一天 12 张在首页的先后与收藏库里的顺序一致，一眼能对上
          「今天挑的是这几张」。 */

  /* 与时间卡同款：整数雪崩散列 → [0,1)。用它而不是 Math.random()，是为了「同一天所有访客、
     同一次访问里的每次刷新，看到的都是同一批」。 */
  function hash01(n) {
    var x = n | 0;
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  function daySeed(d) {
    d = d || new Date();
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var dayOfYear = Math.floor((d - yearStart) / 86400000) + 1;
    return d.getFullYear() * 1000 + dayOfYear;
  }

  /* 按日期种子做一次 Fisher–Yates（只洗**下标**），取前 n 个再排回原序。
     每一步用不同的种子（seed 加一个黄金比例常数乘步号），否则同一天的洗牌会退化成固定置换。 */
  function pickDailySubset(all, n, seed) {
    var idx = [];
    for (var i = 0; i < all.length; i++) idx.push(i);
    for (var k = idx.length - 1; k > 0; k--) {
      var j = Math.floor(hash01(seed + k * 0x9e3779b1) * (k + 1));
      var t = idx[k]; idx[k] = idx[j]; idx[j] = t;
    }
    idx = idx.slice(0, n).sort(function (a, b) { return a - b; });
    return idx.map(function (p) { return all[p]; });
  }

  var DAILY = parseInt(deck.getAttribute('data-deck-daily') || '0', 10);
  // 张数 ≥ 清单长度时整副照旧（清单还小的时候不该「抽」出重样的东西）
  var dailySubset = DAILY > 0 && DAILY < items.length;
  if (dailySubset) items = pickDailySubset(items, DAILY, daySeed());

  // 文案挂在**卡组容器**上（模板里 data-next / data-prev / data-announce 都在 .home-deck 上），
  // 不是挂在 <script> 上 —— 一开始写成 script.dataset，结果全取到 undefined、播报只剩兜底模板。
  var nextLabel = deck.dataset.next || 'next';
  var prevLabel = deck.dataset.prev || 'prev';
  var announceTpl = deck.dataset.announce || '{n}/{total} {label}';
  var zoomLabel = deck.dataset.zoom || 'zoom';
  var closeLabel = deck.dataset.close || 'close';
  var creditLabel = deck.dataset.credit || 'credit';
  var dialogTpl = deck.dataset.dialog || '{label}';
  var AUTO_MS = 6000;
  var FADE_MS = 340;     // 与 CSS 里 deck-in / deck-art-in / deck-ghost-out 的时长一致（0.34s）
  var i = 0;
  var timer = null;
  var busy = false;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ---------- 播报节点（换卡是纯视觉变化，读屏用户什么都得不到） ---------- */
  var live = document.createElement('span');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  if (carousel) deck.appendChild(live);

  function announce(item) {
    live.textContent = announceTpl
      .replace('{n}', i + 1).replace('{total}', items.length)
      .replace('{label}', item.label || '');
  }

  /* ---------- 进度条：卡下一条 2px 细线，跟着 6s 的定时器走 ----------
     用 CSS 动画而不是把宽度一帧帧写进 style：动画在合成层上跑，不掉帧；时长由 JS 按 AUTO_MS 写进
     元素（两处只有一个事实源）。暂停由 CSS 的 :hover / :focus-within 与 .is-paused 负责，
     与 JS 侧 stop() 一一对应 —— 两边不同步的话会出现「线满了但卡没换」。 */
  var progress = document.createElement('div');
  progress.className = 'home-deck-progress';
  progress.setAttribute('aria-hidden', 'true');
  progress.appendChild(document.createElement('span'));
  if (carousel) deck.appendChild(progress);

  function restartProgress() {
    if (reduced()) return;
    var bar = progress.firstElementChild;
    bar.style.animationDuration = AUTO_MS + 'ms';
    // 去掉再加同一个类**不会**重播动画，中间必须强制一次回流（读 offsetWidth）——
    // 这是 CSS 动画重播的标准做法，少了它只有第一张卡有进度条。
    progress.classList.remove('is-running');
    void progress.offsetWidth;
    progress.classList.add('is-running');
    progress.classList.remove('is-paused');
  }

  /* ---------- 切换按钮（脚本注入：没有 JS 时不该出现） ---------- */
  var nav = document.createElement('div');
  nav.className = 'home-deck-nav';
  [['prev', '‹', prevLabel], ['next', '›', nextLabel]].forEach(function (spec) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-deck-btn home-deck-btn--' + spec[0];
    b.textContent = spec[1];
    b.setAttribute('aria-label', spec[2]);
    b.setAttribute('title', spec[2]);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      go(spec[0] === 'next' ? 1 : -1, true);
    });
    nav.appendChild(b);
  });
  var zoomBtn = document.createElement('button');
  zoomBtn.type = 'button';
  zoomBtn.className = 'home-deck-btn home-deck-btn--zoom';
  zoomBtn.setAttribute('aria-label', zoomLabel);
  zoomBtn.setAttribute('title', zoomLabel);
  // 四角外扩的形状用内联 SVG 画：用字符（⤢ / ⛶）会受字体影响，方框字与基线都会飘。
  zoomBtn.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">' +
    '<path d="M6.3 1.9H1.9v4.4M9.7 1.9h4.4v4.4M6.3 14.1H1.9V9.7M9.7 14.1h4.4V9.7" ' +
    'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  zoomBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    openDialog();
  });
  nav.appendChild(zoomBtn);
  if (carousel) deck.appendChild(nav);

  /* ---------- 弹层（看大图 + 名字 / 系列 / 序号 / 出处） ----------
     大图用**已有的 2x 产物**（544px 宽，卡在页内只有 272）—— 页内 272 → 弹层 430 已经是 1.6 倍，
     不额外出一档「大图」产物：那要给每张卡多生成一个 ~720px 的文件，三十多张就是 1.3 MB 左右，
     会把体积预算吃掉一大截（见 docs/features.md ㉕ 的账）。

     谁打开的弹层，关闭时焦点就还给谁（`lastOpener`）。2026-09-21 之前这个弹层只有放大按钮
     能打开，所以 closeDialog 里写死 `zoomBtn.focus()` 是对的；那一天起「今日一卡」（时间卡里的
     微卡）也会调 openAt 打开它，写死的焦点目标就会把键盘用户丢到左栏那个 ⤢ 上。 */
  var lastOpener = zoomBtn;
  var dlg = document.createElement('div');
  dlg.className = 'home-deck-dialog';
  dlg.setAttribute('role', 'dialog');
  dlg.setAttribute('aria-modal', 'true');
  dlg.hidden = true;

  var backdrop = document.createElement('div');
  backdrop.className = 'home-deck-dialog-backdrop';

  var panel = document.createElement('div');
  panel.className = 'home-deck-dialog-panel';

  var bigImg = document.createElement('img');
  bigImg.setAttribute('draggable', 'false');
  bigImg.alt = '';

  /* ---------- 3D 检视台 ----------
     弹层里放的是一个「台面」：正常情况下里面是 canvas（assets/js/card-3d.js 渲染的可转动真卡），
     没有 WebGL 或着色器编译失败时里面是上面的平面大图 —— 两者占地口径一致（都是 5:7 的盒子），
     所以回退时布局不会跳。 */
  var stage = document.createElement('div');
  stage.className = 'home-deck-stage';
  stage.appendChild(bigImg);

  // 翻面按钮：**由脚本注入**（禁 JS 时不存在，也就不会留下点不动的控件）。
  // 它同时是「转动」的无障碍入口 —— 拖拽手势读屏用户拿不到，键盘用户只能靠它和方向键。
  var flipBtn = document.createElement('button');
  flipBtn.type = 'button';
  flipBtn.className = 'home-deck-flip';
  flipBtn.setAttribute('aria-pressed', 'false');
  flipBtn.textContent = deck.dataset.flip || 'flip';
  flipBtn.addEventListener('click', function () {
    if (!viewer) return;
    var back = viewer.flip();
    flipBtn.setAttribute('aria-pressed', back ? 'true' : 'false');
    flipBtn.textContent = (back ? deck.dataset.flipBack : deck.dataset.flip) || flipBtn.textContent;
  });
  var actions = document.createElement('div');
  actions.className = 'home-deck-actions';
  actions.hidden = true;              // 只有 3D 可用时才现身（见 ensureViewer）
  actions.appendChild(flipBtn);

  // 只在**第一次打开**时才建 WebGL 上下文：绝大多数访客不会点 ⤢，
  // 为他们每人建一个 GL 上下文 + 上传两张纹理会白占显存。
  var viewer = null, viewerTried = false;
  function ensureViewer() {
    if (viewerTried) return viewer;
    viewerTried = true;
    if (!window.card3d || typeof window.card3d.attach !== 'function') {
      // 脚本没加载（被拦截、或改坏了）：等同于「没有 3D」，但要留痕，不静默
      console.warn('[home-deck] card-3d.js 没加载，弹层里只能看平面大图');
      return null;
    }
    viewer = window.card3d.attach(stage, deck) ? window.card3d : null;
    if (viewer) {
      bigImg.hidden = true;            // 3D 可用时平面大图退居幕后（卡背信息仍有等价的 DOM 文本）
      actions.hidden = false;
    } else {
      stage.classList.add('is-gl-failed');
      stage.setAttribute('data-gl-note', deck.dataset.glFail || '');
    }
    return viewer;
  }

  var meta = document.createElement('div');
  meta.className = 'home-deck-dialog-meta';
  var metaName = document.createElement('span');
  metaName.className = 'home-deck-dialog-name';
  var metaSeries = document.createElement('span');
  metaSeries.className = 'home-deck-dialog-series';
  var metaIndex = document.createElement('span');
  metaIndex.className = 'home-deck-dialog-index';
  var creditLink = document.createElement('a');
  creditLink.className = 'home-deck-dialog-credit';
  creditLink.target = '_blank';
  creditLink.rel = 'noopener noreferrer';
  var creditText = document.createElement('span');
  creditText.className = 'home-deck-dialog-credit';
  meta.appendChild(metaName);
  meta.appendChild(metaSeries);
  meta.appendChild(metaIndex);
  meta.appendChild(creditLink);
  meta.appendChild(creditText);

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'home-deck-dialog-close';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label', closeLabel);
  closeBtn.setAttribute('title', closeLabel);
  closeBtn.addEventListener('click', closeDialog);

  [['prev', '‹', prevLabel], ['next', '›', nextLabel]].forEach(function (spec) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'home-deck-btn home-deck-dialog-step home-deck-btn--' + spec[0];
    b.textContent = spec[1];
    b.setAttribute('aria-label', spec[2]);
    b.setAttribute('title', spec[2]);
    b.addEventListener('click', function () {
      go(spec[0] === 'next' ? 1 : -1, true);
    });
    panel.appendChild(b);
  });

  panel.appendChild(stage);
  panel.appendChild(actions);
  panel.appendChild(meta);
  panel.appendChild(closeBtn);
  dlg.appendChild(backdrop);
  dlg.appendChild(panel);
  document.body.appendChild(dlg);

  backdrop.addEventListener('click', closeDialog);

  function fillDialog(item) {
    if (!item) return;
    // 平面大图用 xl（760px）那一档：台面 2026-09-21 放大到 600px 之后，544px 的 2x 会被拉到
    // 1.9 倍（2x 屏上更糊），而这张图是「没有 WebGL 时」访客唯一能看到的东西。
    // 它不进 srcset，所以列表页不会因为这一档变重（账见 docs/features.md ㊳）。
    bigImg.src = item.xl || item.l || item.s;
    // xl 的真实宽度 = 760（1x 那张 272 的 2.79 倍）；拿不到就退回按 2x 估
    bigImg.width = Math.round((item.w || 0) * 2.79) || 760;
    bigImg.height = Math.round((item.h || 0) * 2.79) || 1064;
    metaName.textContent = item.label || '';
    metaSeries.textContent = item.series || '';
    metaIndex.textContent = pad(i + 1) + ' / ' + pad(items.length);
    // 卡背上的信息与这里**是同一份**：卡背是 canvas 画出来的，对比度脚本与读屏都看不见它，
    // 所以这一行 DOM 文本必须留着（少了它，卡背上的字就成了只有看得见的人拿得到的信息）。
    var credit = item.url ? creditLabel + ' ' + (item.credit || '') : (item.credit ? creditLabel + ' ' + item.credit : '');
    if (item.url) {
      creditLink.href = item.url;
      creditLink.textContent = credit;
      creditLink.hidden = false;
      creditText.hidden = true;
    } else if (item.credit) {
      // 官方立绘与站点自己的看板娘没有可点的出处：显示文字，不编一个链接上去
      creditText.textContent = credit;
      creditText.hidden = false;
      creditLink.hidden = true;
    } else {
      creditLink.hidden = true;
      creditText.hidden = true;
    }
    dlg.setAttribute('aria-label', dialogTpl.replace('{label}', item.label || ''));
    if (viewer) {
      viewer.setItem({
        // `xl` 这一档**只给 3D 查看器用**（760×1064，不生进 srcset）。2026-09-21 之前这里
        // 漏了它 —— 于是 card-3d.js 里 `next.xl || next.l || next.s` 每次都回退到 544 宽
        // 的 l 档，760 档那 63 张 2.4 MB 从头到尾没有任何页面加载过：既是「卡面糊」的
        // 头号根因，也让那份产物白白占着体积（见 docs/traps.md 的「静默回退」一节）。
        s: item.s, l: item.l, xl: item.xl || '', d: item.d || '',
        label: item.label || '', series: item.series || '', style: item.style || 'foil',
        rank: item.rank || 'collector', rankLabel: item.rankLabel || '',
        indexText: pad(i + 1) + ' / ' + pad(items.length),
        creditText: credit
      });
      // 读屏用户看不到画布，用 aria-label 把「这张卡是谁、能怎么操作」说全
      var c = stage.querySelector('canvas');
      if (c) {
        c.setAttribute('aria-label', (deck.dataset.rotate || '{label}')
          .replace('{label}', item.label || '')
          .replace('{n}', i + 1).replace('{total}', items.length));
      }
      flipBtn.setAttribute('aria-pressed', 'false');
      flipBtn.textContent = deck.dataset.flip || flipBtn.textContent;
    }
  }

  function openDialog(opener) {
    lastOpener = opener || zoomBtn;
    // 顺序要紧：viewer 必须先建好（attach 之后 setItem 才有效），而 setOpen 要在弹层**可见之后**
    // 再调 —— 画布尺寸取自 clientWidth，hidden 的时候它是 0。
    ensureViewer();
    dlg.hidden = false;
    deck.classList.add('is-dialog');
    // 弹层是模态：页面上的浮动控件（返回顶部 / 滚到底部，z-index 比弹层高）要收起来。
    // 实测窄屏下「滚到底部」那个圆正好盖住弹层右下角的「01 / 32」，而且它们在模态里还可点 ——
    // 点一下会把背后的页面滚走。用 html 上的类控制（CSS 里一条规则收掉它们）。
    document.documentElement.classList.add('is-deck-dialog');
    fillDialog(items[i]);
    if (viewer) viewer.setOpen(true);
    stop();                        // 弹层开着时不要在背后换卡
    // 背景 shader 与卡的 rAF 之间没有任何协调（各跑各的），而卡的调速器判据是它自己的
    // p75 > refresh×1.25 就降档 —— 弹层期间把帧预算全留给卡是零风险的选择：背景是缓慢流动的，
    // 停几秒看不出来。恢复放在 closeDialog（bg-shader.js 的 start() 自己会看页面是否可见）。
    if (window.__bg && window.__bg.stop) window.__bg.stop();
    progress.classList.add('is-paused');
    syncHash(true);                // 收藏库：把「打开的是哪一张」写进地址（首页那支不写，见那个函数）
    closeBtn.focus();
  }

  /* ---------- 深链（`#deck-07`）----------
     **只有收藏库那支写**：63 张卡的下标是稳定的（与清单同序），所以 `#deck-07` 是一个能分享的
     地址 —— 此前 63 张收藏卡一张地址都没有（知识卡每张都有 URL）。首页那支不能写：它的清单是
     「今天的 12 张」（按日期种子抽的），同一个下标换一天就是另一张卡，分享出去会指错。
     用 `replaceState` 而不是改 `location.hash`：后者会附赠一次「滚到锚点」的行为，而锚点在页面上
     根本不存在（不存在的锚点不滚，但依赖这一点不如根本别触发）。 */
  function syncHash(set) {
    if (carousel || !window.history || !history.replaceState) return;
    var id = '#deck-' + pad(i + 1);
    try {
      if (set) {
        if (location.hash !== id) history.replaceState(null, '', id);
      } else if (location.hash.indexOf('#deck-') === 0) {
        history.replaceState(null, '', location.pathname + location.search);
      }
    } catch (e) { /* file:// 之类改不了地址：不影响弹层本身 */ }
  }

  function closeDialog() {
    if (dlg.hidden) return;
    if (viewer) viewer.setOpen(false);   // 停掉动画循环：弹层关着时不该占着 GPU
    if (window.__bg && window.__bg.start) window.__bg.start();   // 背景 shader 恢复（见 openDialog）
    dlg.hidden = true;
    document.documentElement.classList.remove('is-deck-dialog');
    deck.classList.remove('is-dialog');
    syncHash(false);                     // 关掉就把深链收掉，别让刷新又开一次弹层
    // 焦点**还给打开它的那个控件**，而不是「记下打开前谁有焦点」：程序化触发的点击不会移动焦点，
    // 于是「打开前的焦点」往往在别处（实测回到 .list 上，键盘用户按 Esc 之后按 Tab 会从页面开头重来）。
    // lastOpener 默认是放大按钮；「今日一卡」从时间卡那边开的时候传的是它自己那颗按钮，
    // 收藏库的卡片墙传的是被点的那一格。
    var backTo = (lastOpener && document.contains(lastOpener)) ? lastOpener : zoomBtn;
    // zoomBtn 在卡片墙上不存在（那颗 ⤢ 是轮播 UI 的一部分、没有注入），所以这里要判一次 ——
    // 否则 backTo 是个游离的节点，调用 focus() 什么也不会发生（不报错，但焦点丢在 body 上）。
    if (backTo && document.contains(backTo)) backTo.focus({ preventScroll: true });
    start();                       // 关掉之后接着轮播，进度条跟着重来
  }

  /* 弹层里的键盘：Esc 关、左右切（切的是同一副牌，弹层里的大图跟着换）。
     注意**焦点在画布上时左右键归画布**（那是转卡，不是换卡）—— 两个监听都在 document 上，
     不分开的话按一下会既转卡又换卡。 */
  document.addEventListener('keydown', function (e) {
    if (dlg.hidden) return;
    var onCanvas = e.target && e.target.classList && e.target.classList.contains('home-deck-canvas');
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
      return;
    }
    if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !onCanvas) {
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1, true);
      return;
    }
    if (e.key === 'Tab') {
      // 焦点锁在弹层里：只有这几个控件该被 tab 到，出了弹层就等于跑到背后去了。
      // 画布也在名单里 —— 它 tabindex=0 且方向键能用，漏掉它会让 Tab 顺序断在中间。
      var f = dlg.querySelectorAll('button, a[href], canvas[tabindex]');
      if (!f.length) return;
      var list = Array.prototype.filter.call(f, function (el) { return !el.hidden; });
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- 预取后两张：换过去时图已在缓存 ----------
     卡片墙也走这条路：在弹层里按 → 时下一张已经在缓存里（一次最多两张、按 URL 记账，不会
     把 63 张全抓下来）。 */
  var prefetched = {};
  function prefetch() {
    for (var k = 1; k <= 2; k++) {
      var it = items[(i + k) % items.length];
      if (!it || prefetched[it.s]) continue;
      prefetched[it.s] = true;
      var im = new Image();
      im.src = it.l || it.s;                    // 预取 2x：高分屏换过去就是清楚的
    }
  }

  function apply(j) {
    var it = items[j];
    var other = items[i];
    // 卡片墙（没有页内卡）：只挪索引，弹层开着就把弹层里的内容换掉 —— 弹层里的左右键走
    // go → apply 这条路，所以「在弹层里按 →」在收藏库上一样能翻到下一张。
    if (!carousel) {
      i = j;
      if (!dlg.hidden) fillDialog(it);
      return;
    }
    img.src = it.s;
    img.srcset = it.s + ' 1x, ' + (it.l || it.s) + ' 2x';
    img.width = it.w;
    img.height = it.h;
    // 玻璃的「厚度」层靠 `--art` 再铺一遍同一张画作（模板首次渲染也给了这个变量）。
    // 与 src 同一个 URL，所以不多一次请求；换卡时必须一起换，否则厚度层还停在上一张画上。
    card.style.setProperty('--art', "url('" + (it.l || it.s) + "')");
    if (label) label.textContent = it.label || '';
    if (indexEl) indexEl.textContent = pad(j + 1) + ' / ' + pad(items.length);
    // 风格类：**按前缀清掉旧的**，不写死风格清单 —— 写死过一次（新增 glass/gothic/… 时忘了同步），
    // 结果是四个风格类叠在同一个元素上、由样式表顺序决定谁赢，换卡拉不动观感，且不报错。
    Array.prototype.slice.call(card.classList).forEach(function (cls) {
      if (cls.indexOf('home-card--') === 0) card.classList.remove(cls);
    });
    card.classList.add('home-card--' + (it.style || 'foil'));
    // 等级类同样按前缀清掉旧的（与风格类同一套做法：写死清单就会漏，而漏了不报错、
    // 只是某张卡的框还停在上一个等级上）。前缀与 home-card-- 不同，所以两者互不干扰。
    Array.prototype.slice.call(card.classList).forEach(function (cls) {
      if (cls.indexOf('home-card-rank--') === 0) card.classList.remove(cls);
    });
    card.classList.add('home-card-rank--' + (it.rank || 'collector'));
    if (other) announce(it);
    if (!dlg.hidden) fillDialog(it);   // 弹层开着时换卡：大图跟着换
    restartProgress();                 // 新的一张开始计时，进度条从头走
  }

  /* 弹层里换卡（收藏库的卡片墙、以及弹层内按左右键）：**台面与文字做一次短交叉**。
     3D 台面换的是 GL 纹理、无 WebGL 那一支换的是 img.src，两者都做不了透明度交叉
     （纹理要两张同时在场，得两份 GL 上下文，不值）。所以这里给的是「整块的一次呼吸」：
     台面短暂压暗回亮 + meta 文字淡入 —— 比硬切柔和，且完全不碰渲染管线。
     2026-09-21 之前这里是硬切（原注释就写着「不做淡入淡出」）。 */
  var swapTimer = null;
  function swapDialog() {
    if (reduced() || dlg.hidden) return;
    stage.classList.remove('is-swapping');
    void stage.offsetWidth;          // 去掉再加不会重播动画，中间要强制一次回流
    stage.classList.add('is-swapping');
    dlg.classList.add('is-swapping');
    if (swapTimer) window.clearTimeout(swapTimer);
    swapTimer = window.setTimeout(function () {
      stage.classList.remove('is-swapping');
      dlg.classList.remove('is-swapping');
      swapTimer = null;
    }, FADE_MS);
  }

  function go(dir, manual) {
    // 卡片墙：页内没有卡可翻，切的就是弹层里那一张（左右键 / 弹层里的 ‹ › 都走这里）。
    // 不碰 busy —— 变化的只有弹层里的大图与 3D 卡，那一下由 swapDialog 柔化。
    if (!carousel) {
      swapDialog();
      apply((i + dir + items.length) % items.length);
      prefetch();          // 弹层里连着往下翻时，下一张已经在缓存（见 prefetch 的注释）
      return;
    }
    if (busy) return;
    busy = true;
    var j = (i + dir + items.length) % items.length;
    if (reduced()) {                            // 减少动态：直接换，不做淡出淡入
      i = j;
      apply(j);
      prefetch();
      busy = false;
      if (manual) restart();
      return;
    }
    // 方向感：新卡从来的那一侧滑进来、旧卡往反方向退（两个方向原来长得一样，看不出往哪边翻）
    card.classList.toggle('is-next', dir > 0);
    card.classList.toggle('is-prev', dir < 0);
    // **动画的开关**：CSS 里整套换卡动效（位移 + 画面交叉 + 扫光）全挂在 .is-in 下面。
    // 2026-09-21 之前这里只有下面的 remove('is-in')、没有这一行 add —— 动画一次都没跑过，
    // 换卡实际退化成「新图瞬切 → 旧图盖着 → 340ms 后啪一下消失」（用户报「切换生硬」）。
    // 类名缺失不报错、CSS 规则又齐全，所以它一直静默着（见 docs/traps.md）。
    card.classList.add('is-in');
    // 把**当前这一张**交给残影，主图立刻换成新的 —— 两张交叉，没有空白帧
    if (ghost) {
      ghost.src = img.src;
      ghost.srcset = img.srcset;
      ghost.width = img.width;
      ghost.height = img.height;
      ghost.classList.add('is-on');
    }
    i = j;
    apply(j);
    prefetch();
    window.setTimeout(function () {
      if (ghost) ghost.classList.remove('is-on');   // 收掉残影：别留着上一张的像素
      card.classList.remove('is-in');
      busy = false;
      if (manual) restart();
    }, FADE_MS);
  }

  /* ---------- 自动轮播：悬停 / 焦点 / 后台 / 弹层都暂停，手动切过重新计时 ---------- */
  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    // 卡片墙不自动轮播：没有「当前这一张」可轮（页内 63 张全摆着），起点也只能是 openAt 指定的一张。
    if (!carousel) return;
    if (reduced() || timer || !dlg.hidden) return;
    timer = window.setInterval(function () {
      if (document.visibilityState === 'hidden') return;   // 后台不切（切回来会一次跳好几张）
      go(1, false);
    }, AUTO_MS);
    restartProgress();     // 计时器从头开始，进度条也从头走（两处必须一起重置）
  }

  function restart() {
    stop();
    start();
  }

  /* 下面这一整段都是「页内那一张卡」的交互：悬停/焦点暂停、后台暂停、点卡翻下一张、
     键盘左右、触屏滑动。卡片墙上一个都不适用 —— 尤其**不能**给 .deck-wall 加 tabindex 与
     role="group"（那会让整面墙变成一个可聚焦的整体、还吞掉格子上的方向键）。 */
  if (carousel) {
    deck.addEventListener('pointerenter', stop);
    deck.addEventListener('pointerleave', function () { if (dlg.hidden) start(); });
    deck.addEventListener('focusin', stop);
    deck.addEventListener('focusout', function () { if (dlg.hidden) start(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        start();
      } else {
        stop();
        progress.classList.add('is-paused');
      }
    });
    deck.addEventListener('click', function () { go(1, true); });

    // 键盘：焦点在卡组里时 ← → 翻卡（弹层开着时由上面那个监听接管）
    deck.setAttribute('tabindex', '0');
    deck.setAttribute('role', 'group');
    deck.addEventListener('keydown', function (e) {
      if (!dlg.hidden) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1, true); }
    });

    // 触屏滑动：横向位移超过 30px 才算翻卡
    var x0 = null;
    deck.addEventListener('touchstart', function (e) {
      x0 = e.touches[0].clientX;
    }, { passive: true });
    deck.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 30) go(dx < 0 ? 1 : -1, true);
    });
  }

  /* ---------- 对外入口（2026-09-21 加）----------
     两个用处：首页时间卡里的「今日一卡」微卡点一下要开**那张卡**的三维弹层；收藏库的卡片墙
     的每一格点一下也是同一个意思（那里传的 opener 是被点的那一格，关弹层时焦点回到它）。
     弹层、当前索引、apply/openDialog 全在这个闭包里，不开个口子外面拿不到；也不值得为这一处
     把整个模块改成导出式（那要动这 500 行里的十几处引用）。

     顺序：先把 i 挪过去再 apply —— apply 里 `announce` 靠 `items[i]`（旧的）当「不是首次」的判据，
     i 先更新会让播报念到新的一张（正确），而它要读的 it 是参数传进去的那个。apply 之后 i 就是
     新的了，openDialog 里的 `fillDialog(items[i])` 才会填对。

     不检查 busy（正在做交叉淡入）：apply 只是换 src 与类，那个等待中的 320ms 回调也只会清掉
     ghost / is-in 并把 busy 放掉，不会把卡片换回去。 */
  window.homeDeck = {
    /* **当前这一页真正在用的那份清单**（下标口径的唯一来源）。
       首页那支是「今天的 12 张」（见上面 data-deck-daily 那段），收藏库那支是全部 63 张。
       时间卡的「今日一卡」必须用它、而不是自己再解析一遍 data-deck：那是**按下标**调 openAt 的，
       池子不一致的表现是「点微卡没反应」—— 下标越界被 openAt 里的边界判断挡掉，不报任何错。 */
    items: items,
    openAt: function (index, opener) {
      if (typeof index !== 'number' || index < 0 || index >= items.length) return false;
      i = index;
      apply(index);
      prefetch();
      openDialog(opener || zoomBtn);     // 与放大按钮走同一条路（它自己会 stop() 停轮播）
      return true;
    }
  };

  // 首页：先把第一张的序号播报出去、再预取后两张、然后开轮播。
  // 卡片墙三件都不做（没有「第一张」可播报、没有轮播；预取等第一次打开弹层时再开始，
  // 否则每个访客一进这一页就先多下两张 2x 图，而他可能一张都不点开）。
  if (carousel) {
    /* **首帧要把服务端那张换掉**：模板渲染的是**整副的第一张**（它不知道今天是哪 12 张），
       而这里已经在轮今天这 12 张 —— 不补这一下的话，首屏显示的是一张**不在今天这批里**的卡
       （序号却写着 `01 / 12`），而且按一次 → 会跳过今天的第一张直接到第二张。
       同步换、不做交叉淡入：这一步几乎总在首帧之前完成（defer 脚本在解析结束时执行，
       而那张卡的图通常还在下载 —— 换 src 等于把那个请求掐掉，不产生「空白一瞬」），
       真要做淡入反而会在首屏硬加 320ms 动画。 */
    if (dailySubset) apply(0);
    announce(items[0]);
    prefetch();
    start();
  }

  /* 入站揭幕的退场（结构与样式在 layouts/_partials/deck-splash.html 与 23-splash.css）。
     就绪判据取「window load 且首张卡面 decode 完成」—— 缺一个都会露出半成品：只等 load
     的话首卡图可能还在解码（视口内的图不阻塞 load 事件），只等图的话字体与布局还没到位。
     三条边界：最短 MIN_MS（页面太快时遮罩闪一下就没了，比不加还难看）、最长 MAX_MS
     （网络慢也先放人进门）、以及 CSS 里那条 3.2s 的兜底 animation —— 最后这条负责
     JS 整个没跑起来的情况，这里一个字都不用做。 */
  (function initSplash() {
    var el = document.getElementById('deck-splash');
    if (!el) return;                                     // 非首页没有这个节点
    var MIN_MS = 420, MAX_MS = 2600;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    var img = document.querySelector('.home-card img');
    function retreat() {
      var now = (window.performance && performance.now) ? performance.now() : Date.now();
      window.setTimeout(function () { el.classList.add('is-done'); },
                        Math.max(0, MIN_MS - (now - t0)));
    }
    var loadDone = new Promise(function (r) {
      if (document.readyState === 'complete') r();
      else window.addEventListener('load', r, { once: true });
    });
    var imgDone = (img && img.decode) ? img.decode().catch(function () {}) : Promise.resolve();
    Promise.race([
      Promise.all([loadDone, imgDone]),
      new Promise(function (r) { window.setTimeout(r, MAX_MS); })
    ]).then(retreat);
  })();
})();
