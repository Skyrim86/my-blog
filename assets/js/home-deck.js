// 首页卡片组：一次一张，可手动切（点卡面 / ‹ › 按钮 / 键盘左右 / 触屏滑动），也会自己轮播。
//
// 与 extend_head.html 的接线方式同其它脚本：清单（每张卡的 1x/2x URL、名牌文字、风格）由模板经
// `data-deck` 以 JSON 传进来 —— 脚本不自己拼资源 URL（指纹在构建期算），文案走 data-* 传
// （JS 调不到 i18n）。
//
// 五条刻意的取舍：
//   1. **只有当前一张在 DOM 里**：换卡是改同一个 <img> 的 src/srcset，不是切换一堆 <img> 的显隐。
//      28 张卡全渲染的话它们叠在同一位置、全在视口内，lazy 也拦不住，首屏会白下 28 张。
//   2. **轮播的停与走**：鼠标悬停、键盘焦点进入、标签页切到后台都暂停；手动切过之后重新计时。
//      系统要求减少动态（prefers-reduced-motion: reduce）时**完全不自动轮播** —— 那也是一种动效，
//      而且这类偏好的人往往就是被自动动的东西干扰的人。
//   3. **预取后两张**：换过去时图已经在缓存里，不会先看到空白再出图。只预取两张，不是整副牌。
//   4. **换卡有过渡**：先给旧卡加 .is-out（淡出 + 轻微缩放），200ms 后换 src、切风格类，
//      再加 .is-in 淡入。不用 3D 翻转：跨浏览器的 backface 与层次问题不值得为一副牌去啃。
//   5. **按钮由脚本注入**：没有 JS 时只显示第一张卡（模板渲染的那张），不留下点不动的控件。
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
  var label = card && card.querySelector('.home-card-label');
  var indexEl = card && card.querySelector('.home-card-index');
  if (!card || !img) return;

  // 文案挂在**卡组容器**上（模板里 data-next / data-prev / data-announce 都在 .home-deck 上），
  // 不是挂在 <script> 上 —— 一开始写成 script.dataset，结果全取到 undefined、播报只剩兜底模板。
  var nextLabel = deck.dataset.next || 'next';
  var prevLabel = deck.dataset.prev || 'prev';
  var announceTpl = deck.dataset.announce || '{n}/{total} {label}';
  var AUTO_MS = 6000;
  var FADE_MS = 200;
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
  deck.appendChild(nav);

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
    if (label) label.textContent = it.label || '';
    if (indexEl) indexEl.textContent = pad(j + 1) + ' / ' + pad(items.length);
    // 风格类：**按前缀清掉旧的**，不写死风格清单 —— 写死过一次（新增 glass/gothic/… 时忘了同步），
    // 结果是四个风格类叠在同一个元素上、由样式表顺序决定谁赢，换卡拉不动观感，且不报错。
    Array.prototype.slice.call(card.classList).forEach(function (cls) {
      if (cls.indexOf('home-card--') === 0) card.classList.remove(cls);
    });
    card.classList.add('home-card--' + (it.style || 'foil'));
    if (other) announce(it);
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
    card.classList.remove('is-in');
    card.classList.add('is-out');
    window.setTimeout(function () {
      i = j;
      apply(j);
      card.classList.remove('is-out');
      card.classList.add('is-in');
      prefetch();
      busy = false;
      if (manual) restart();
    }, FADE_MS);
  }

  /* ---------- 自动轮播：悬停 / 焦点 / 后台都暂停，手动切过重新计时 ---------- */
  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (reduced() || timer) return;
    timer = window.setInterval(function () {
      if (document.visibilityState === 'hidden') return;   // 后台不切（切回来会一次跳好几张）
      go(1, false);
    }, AUTO_MS);
  }

  function restart() {
    stop();
    start();
  }

  deck.addEventListener('pointerenter', stop);
  deck.addEventListener('pointerleave', start);
  deck.addEventListener('focusin', stop);
  deck.addEventListener('focusout', start);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') start();
  });
  deck.addEventListener('click', function () { go(1, true); });

  // 键盘：焦点在卡组里时 ← → 翻卡
  deck.setAttribute('tabindex', '0');
  deck.setAttribute('role', 'group');
  deck.addEventListener('keydown', function (e) {
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
