// 首页卡片组：一次一张，可手动切（点卡面 / ‹ › 按钮 / 键盘左右 / 触屏滑动），也会自己轮播；
// 卡下的 ⤢ 按钮打开弹层看大图，弹层里带名字、系列、序号与出处（可点外链）。
//
// 与 extend_head.html 的接线方式同其它脚本：清单（每张卡的 1x/2x URL、名牌文字、风格、出处）由模板经
// `data-deck` 以 JSON 传进来 —— 脚本不自己拼资源 URL（指纹在构建期算），文案走 data-* 传
// （JS 调不到 i18n）。
//
// 六条刻意的取舍：
//   1. **只有当前一张在 DOM 里**：换卡是改同一个 <img> 的 src/srcset，不是切换一堆 <img> 的显隐。
//      三十多张卡全渲染的话它们叠在同一位置、全在视口内，lazy 也拦不住，首屏会白下三十多张。
//   2. **轮播的停与走**：鼠标悬停、键盘焦点进入、标签页切到后台、弹层打开时都暂停；手动切过之后
//      重新计时。系统要求减少动态（prefers-reduced-motion: reduce）时**完全不自动轮播** —— 那也是一种
//      动效，而且这类偏好的人往往就是被自动动的东西干扰的人。
//   3. **预取后两张**：换过去时图已经在缓存里，不会先看到空白再出图。只预取两张，不是整副牌。
//   4. **换卡是交叉淡入**：`.home-card-ghost` 装住刚显示过的那一张（URL 已在缓存里），主图立刻换成
//      新的，两张在 320ms 里交叉 —— 中间没有空白帧（旧做法是先淡出到 10%、换 src、再淡入，
//      那一瞬卡上几乎没东西）。同时按方向给位移：新卡从来的那一侧滑进来、旧卡往反方向退。
//      不用 3D 翻转：跨浏览器的 backface 与层次问题不值得为一副牌去啃。
//   5. **按钮由脚本注入**：没有 JS 时只显示第一张卡（模板渲染的那张），不留下点不动的控件。
//   6. **弹层用 `hidden` 属性开关**，不是只改类名：`hidden` 会让对比度脚本（只遍历可见元素）
//      跳过它 —— 一块藏在屏外的面板不该进对比度表；键盘焦点也靠它才真的出得去。
(function () {
  'use strict';

  var script = document.currentScript;
  var deck = document.querySelector('.home-deck');
  if (!script || !deck) return;

  var items;
  try {
    items = JSON.parse(deck.dataset.deck || '[]');
  } catch (e) {
    return;
  }
  if (!items || items.length < 2) return;

  var card = deck.querySelector('.home-card');
  var img = card && card.querySelector('img');
  var ghost = card && card.querySelector('.home-card-ghost');
  var label = card && card.querySelector('.home-card-label');
  var indexEl = card && card.querySelector('.home-card-index');
  if (!card || !img) return;

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
  var FADE_MS = 320;     // 与 CSS 里 deck-in / deck-ghost-out 的时长一致
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
  deck.appendChild(live);

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
  deck.appendChild(progress);

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
  deck.appendChild(nav);

  /* ---------- 弹层（看大图 + 名字 / 系列 / 序号 / 出处） ----------
     大图用**已有的 2x 产物**（544px 宽，卡在页内只有 272）—— 页内 272 → 弹层 430 已经是 1.6 倍，
     不额外出一档「大图」产物：那要给每张卡多生成一个 ~720px 的文件，三十多张就是 1.3 MB 左右，
     会把体积预算吃掉一大截（见 docs/features.md ㉕ 的账）。 */
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

  panel.appendChild(bigImg);
  panel.appendChild(meta);
  panel.appendChild(closeBtn);
  dlg.appendChild(backdrop);
  dlg.appendChild(panel);
  document.body.appendChild(dlg);

  backdrop.addEventListener('click', closeDialog);

  function fillDialog(item) {
    if (!item) return;
    bigImg.src = item.l || item.s;
    // 2x 产物的真实尺寸 = 模板给的 1x 尺寸 ×2（srcset 里就是这么配对的）
    bigImg.width = (item.w || 0) * 2;
    bigImg.height = (item.h || 0) * 2;
    metaName.textContent = item.label || '';
    metaSeries.textContent = item.series || '';
    metaIndex.textContent = pad(i + 1) + ' / ' + pad(items.length);
    if (item.url) {
      creditLink.href = item.url;
      creditLink.textContent = creditLabel + ' ' + (item.credit || '');
      creditLink.hidden = false;
      creditText.hidden = true;
    } else if (item.credit) {
      // 官方立绘与站点自己的看板娘没有可点的出处：显示文字，不编一个链接上去
      creditText.textContent = creditLabel + ' ' + item.credit;
      creditText.hidden = false;
      creditLink.hidden = true;
    } else {
      creditLink.hidden = true;
      creditText.hidden = true;
    }
    dlg.setAttribute('aria-label', dialogTpl.replace('{label}', item.label || ''));
  }

  function openDialog() {
    fillDialog(items[i]);
    dlg.hidden = false;
    deck.classList.add('is-dialog');
    stop();                        // 弹层开着时不要在背后换卡
    progress.classList.add('is-paused');
    closeBtn.focus();
  }

  function closeDialog() {
    if (dlg.hidden) return;
    dlg.hidden = true;
    deck.classList.remove('is-dialog');
    // 焦点**还给放大按钮**，而不是「记下打开前谁有焦点」：这个弹层只有放大按钮能打开，而
    // 程序化触发的点击不会移动焦点，于是「打开前的焦点」往往在别处（实测回到 .list 上，
    // 键盘用户按 Esc 之后按 Tab 会从页面开头重来）。
    zoomBtn.focus({ preventScroll: true });
    start();                       // 关掉之后接着轮播，进度条跟着重来
  }

  /* 弹层里的键盘：Esc 关、左右切（切的是同一副牌，弹层里的大图跟着换）。 */
  document.addEventListener('keydown', function (e) {
    if (dlg.hidden) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeDialog();
      return;
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1, true);
      return;
    }
    if (e.key === 'Tab') {
      // 焦点锁在弹层里：只有这两个按钮（+ 可能的出处链接）该被 tab 到，出了弹层就等于跑到背后去了
      var f = dlg.querySelectorAll('button, a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- 预取后两张：换过去时图已在缓存 ---------- */
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
    if (other) announce(it);
    if (!dlg.hidden) fillDialog(it);   // 弹层开着时换卡：大图跟着换
    restartProgress();                 // 新的一张开始计时，进度条从头走
  }

  function go(dir, manual) {
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

  announce(items[0]);
  prefetch();
  start();
})();
