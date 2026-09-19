// 明暗切换的过渡（样式在 assets/css/extended/20-theme-fade.css，接线在 extend_head.html）。
//
// 主题的明暗由 `<html data-theme>` 决定：点 #theme-toggle 时 themes/PaperMod 的 footer.html
// 里那段脚本直接翻转属性并写 localStorage。那是主题模板，**不能改**（AGENTS 规则 10），
// 所以这里只做两件「观察式」的事：
//
//   一、颜色过渡：点一下按钮就给 <html> 加 .theme-fading（CSS 里那份 transition 只在这个类下
//       生效），FADE_MS 后撤掉。**加类的时机是「捕获阶段，属性翻转之前」**，不是等
//       MutationObserver 的通知 —— 理由见下面接线处那段注释（一句话：observer 回调是微任务，
//       任何在这之前碰一次样式的代码都会让过渡来不及启动）。observer 那边只作为兜底保留，
//       覆盖「不经过这个按钮改主题」的情况。
//
//   二、壁纸交叉淡入：日/夜两张壁纸是 body::before 的 background-image，离散属性、过渡不插值
//       （理由见 bg-switch.js 的文件头）。做法照抄那边已经验证过的一整套 —— 把「当前
//       body::before 的已解析背景栈」快照进一个 .bg-ghost 临时图层，再让它淡出，露出来的就是
//       新图。**但快照必须在属性翻转之前取**：MutationObserver 的回调是微任务、跑在翻转之后，
//       那时 getComputedStyle 读到的已经是新图。所以这一条走**捕获阶段**的 click 监听 ——
//       捕获必然早于挂在按钮自身上（target 阶段）的那个主题监听器，此刻读到的确定是旧图。
//       两条路径分开的另一个好处：万一漏掉点击，颜色照样平滑过渡，只是壁纸不做交叉淡入。
//
// 与 bg-switch.js 的三处同源取舍（那边各有一段更长的注释，这里不重复）：
//   · ghost 是 body 的子节点、负 z-index，画在旧壁纸之上、玻璃质感层（body::after）之下；
//   · 等目标图 decode 就绪再淡出，等待期间画面被 ghost 盖着，不会露底色；
//   · afterPaint 必须「rAF 优先、定时器兜底」——后台标签页里 rAF 完全不跑。
//
// 降级：prefers-reduced-motion: reduce 时两条都不做（照旧硬切）；读不到背景（配置里把背景套
// 清空了）时只做颜色过渡，不建 ghost。
(function () {
  'use strict';

  var root = document.documentElement;
  var FADE_MS = 320;              // 与 20-theme-fade.css 的 300ms 对齐（略长，见那里的注释）
  var GHOST_MS = 250;             // 与 00-theme.css 里 .bg-ghost 的 transition 时长一致
  var DECODE_MAX_MS = 600;        // 目标壁纸没就绪时最多等这么久，超时就照淡（同 bg-switch.js）
  var SAFETY_MS = 1500;           // 兜底：万一 observer 没等到翻转，别让 ghost 永远盖着页面

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ---------- 一、颜色过渡 ---------- */

  var fadeTimer = null;

  function pulseFadeClass() {
    root.classList.add('theme-fading');
    if (fadeTimer) window.clearTimeout(fadeTimer);
    fadeTimer = window.setTimeout(function () {
      fadeTimer = null;
      root.classList.remove('theme-fading');
    }, FADE_MS);
  }

  /* ---------- 二、壁纸交叉淡入 ---------- */

  var ghost = null;
  var ghostTimer = null;
  var safetyTimer = null;

  // 读当前 body::before 的**已解析**背景栈（含蒙版渐变与图片 URL），CSS 里不抄第二份。
  function bgStack() {
    var cs;
    try {
      cs = getComputedStyle(document.body, '::before');
    } catch (e) {
      return null;
    }
    if (!cs) return null;
    var bg = cs.backgroundImage;
    if (!bg || bg === 'none') return null;
    return {
      image: bg,
      size: cs.backgroundSize,
      position: cs.backgroundPosition,
      repeat: cs.backgroundRepeat
    };
  }

  function makeGhost(stack) {
    dropGhost(true);            // 连点：上一层的淡出立刻收掉，不叠层
    var el = document.createElement('div');
    el.className = 'bg-ghost';
    el.setAttribute('aria-hidden', 'true');
    el.style.backgroundImage = stack.image;
    el.style.backgroundSize = stack.size;
    el.style.backgroundPosition = stack.position;
    el.style.backgroundRepeat = stack.repeat;
    document.body.insertBefore(el, document.body.firstChild);
    ghost = el;
    safetyTimer = window.setTimeout(function () {
      safetyTimer = null;
      dropGhost(true);
    }, SAFETY_MS);
  }

  function dropGhost(immediately) {
    if (safetyTimer) {
      window.clearTimeout(safetyTimer);
      safetyTimer = null;
    }
    if (!ghost) return;
    if (ghostTimer) {
      window.clearTimeout(ghostTimer);
      ghostTimer = null;
    }
    var el = ghost;
    ghost = null;
    if (immediately) {
      el.remove();
      return;
    }
    el.classList.add('bg-ghost--out');
    var done = function () { el.remove(); };
    el.addEventListener('transitionend', done);
    // 兜底：过渡被中断（掉帧、中途改了「减少动态」设置）时别把图层永久留在页面上
    ghostTimer = window.setTimeout(done, GHOST_MS + 150);
  }

  // 等「下一帧」，但必须有定时器兜底：后台标签页里 rAF 不跑。要的只是「ghost 先被画过一次」，
  // 不画就加 class，浏览器会认为前后样式属于同一帧、过渡不成立、直接跳变。
  function afterPaint(fn) {
    var done = false;
    var fire = function () {
      if (done) return;
      done = true;
      fn();
    };
    if (window.requestAnimationFrame) window.requestAnimationFrame(fire);
    window.setTimeout(fire, 120);
  }

  // 背景栈是「渐变, url("…")」，取出图片 URL 先 decode 一下：只下载不解码的话，淡出那一刻
  // 仍要现解码。取不到 URL（纯渐变 = 背景被关掉）就直接进下一步，不等。
  function bgUrl(stack) {
    var m = stack.image.match(/url\((["']?)([^"')]+)\1\)/g);
    if (!m || !m.length) return '';
    var last = m[m.length - 1];
    return last.replace(/^url\((["']?)/, '').replace(/["']?\)$/, '');
  }

  function decodeThen(url, cb) {
    if (!url || !window.Image) {
      afterPaint(cb);
      return;
    }
    var img = new Image();
    var called = false;
    var fire = function () {
      if (called) return;
      called = true;
      afterPaint(cb);
    };
    img.src = url;
    window.setTimeout(fire, DECODE_MAX_MS);
    if (img.decode) img.decode().then(fire, fire);
    else if (img.complete) fire();
    else img.onload = img.onerror = fire;
  }

  /* ---------- 接线 ---------- */

  // 快照旧背景栈：必须赶在主题翻转属性之前，所以用捕获阶段、挂在整个 document 上。
  //
  // **过渡类也在这里加，而不是只在 observer 里加**：observer 的回调是微任务，正常时序下它跑在
  // 下一次样式计算之前，类赶得上；但只要有人在这两者之间读一次样式（`getComputedStyle`、
  // 量一次尺寸都会强制样式计算），属性翻转就会被先算掉 —— 类到时已经是「旧值 → 新值」都发生过
  // 之后了，过渡不会启动，页面照样是硬切。实测踩到过（giscus 的主题跟随脚本、以及量尺寸的
  // 检查脚本都可能在那个窗口里碰样式）。捕获阶段在翻转**之前**加类，时序上就不可能来不及。
  document.addEventListener('click', function (e) {
    if (reduced()) return;
    var t = e.target;
    if (!t || !t.closest || !t.closest('#theme-toggle')) return;
    pulseFadeClass();
    var stack = bgStack();
    if (stack) makeGhost(stack);
  }, true);

  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (reduced()) {
        dropGhost(true);
        return;
      }
      // 兜底：主题被别的方式改掉（不经过那个按钮）时，颜色过渡仍然要有。类已存在时是幂等的。
      pulseFadeClass();
      var mine = ghost;
      if (!mine) return;                    // 没建到 ghost（背景关掉、或漏了点击）：只做颜色过渡
      // 此刻属性已经翻过，读到的就是**新**背景栈 —— 要等的正是它的图
      var next = bgStack();
      decodeThen(bgUrl(next || { image: '' }), function () {
        // 连点：这期间另一次切换已经把它收掉/换掉了，就交给那一次收尾
        if (!ghost || ghost !== mine) return;
        void mine.offsetHeight;             // 强制一次样式计算，给下面的过渡确立起始值
        dropGhost(false);
      });
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }
})();
