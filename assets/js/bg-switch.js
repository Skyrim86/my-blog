// 背景套切换（渐进增强）。
//
// 背景套的事实源是 hugo.toml 的 [params.appearance].presets，模板（extend_head.html）把
// 「有哪些套」「套名」以及每套两个主题的图片 URL 经 data-* 传进来（JS 调不到 i18n，与
// nav-toggle.js / list-tools.js 同一做法；图片 URL 必须由模板给，脚本不能自己拼）。
//
// 四件事刻意这么做：
//   1. 按钮由 JS 注入，不写进模板。没有 JS 时它不该出现（一个点不动的控件比没有更糟），
//      而模板里加按钮就得覆盖主题的 header.html（AGENTS 规则 5 不允许）。
//   2. 当前套读的是 <html data-bg="...">，不是 localStorage：那个属性已被首屏前置脚本
//      （extend_head.html 里那段内联）按存的偏好写好，读属性才与「屏幕上正在显示的图」一致。
//      存的值若指向已删除的套，这里会落回默认套，与前置脚本的校验同一套判据。
//   3. **空闲预取另一套**：访客切过去时要等的那张图，本可以在他读页面的空闲时间里先取回来。
//      跳过三种情况 —— 省流量模式、2G/3G、以及页面在后台（后台标签页里预取等于白花流量，
//      等他切回来再补）。代价写在 docs/features.md ⑫：不切换的访客也会多下一张
//      （日间 63 KB / 夜间 128 KB，只在空闲且可见时）。
//   4. **切换做交叉淡入，而不是硬切**：background-image 是离散属性、过渡不会插值，所以做法是
//      把「当前 body::before 的已解析背景栈」快照到一个临时 ghost 图层上，改掉 data-bg 之后让它
//      淡出 —— 露出的就是新图。副产物是切换前先 decode 目标图，不会再出现「切过去先露一下底色」。
//      关掉背景、只有一套、系统要求减少动态这三种情况走原来的硬切。
//   5. **动态背景也在这个循环里**：extend_head.html 往 data-presets 里追加一项
//      `{id:'__shader', name:'动态', light:'', dark:''}` —— 它是唯一 url 为空的「套」，
//      所以预取会自动跳过它去找下一张真图，而「切到它 / 切走它」由这里调
//      window.__bg.start()/stop()：shader 自己不管「我该不该跑」。
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  var presets;
  try {
    presets = JSON.parse(script.dataset.presets || '[]');
  } catch (e) {
    return;
  }
  if (!presets || presets.length < 2) return;

  var root = document.documentElement;
  var ids = presets.map(function (p) { return p.id; });
  var defaultId = script.dataset.default || ids[0];
  var labelTpl = script.dataset.label || '{name}';
  var announceTpl = script.dataset.announce || '{name}';

  var current = root.getAttribute('data-bg');
  if (ids.indexOf(current) < 0) current = defaultId;
  if (ids.indexOf(current) < 0) current = ids[0];

  // 主题机制是 <html data-theme="dark">（不是 prefers-color-scheme），所以「当前主题用哪张图」
  // 只能读属性。
  function themeKey() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function urlOf(id, theme) {
    var p = presets[ids.indexOf(id)];
    return (p && p[theme]) || '';
  }

  function nextId() {
    return ids[(ids.indexOf(current) + 1) % ids.length];
  }

  /* ---------- 按钮与播报节点 ---------- */

  // 与明暗按钮同一个位置（.logo-switches，主题 header.html 里的 .logo 内），排在它后面。
  var themeToggle = document.getElementById('theme-toggle');
  var container = document.querySelector('.logo-switches') || document.querySelector('.logo');
  if (!container) return;

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'bg-switch';
  btn.className = 'theme-toggle bg-switch';
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
    '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
    '<polyline points="21 15 16 10 5 21"></polyline></svg>';

  // 背景切换是纯视觉变化，读屏用户什么都得不到：给一个 role="status" 的播报节点。
  // 挂在 <body> 末尾而不是按钮旁边 —— 放进 .logo-switches 会参与那一行的 flex 布局
  // （主题的 `.logo-switches > *` 会给它 min-height 与 inline-flex）。
  var live = document.createElement('span');
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  function fill(tpl, name) {
    return tpl.replace('{name}', name);
  }

  function sync(announce) {
    var i = ids.indexOf(current);
    var name = (presets[i] || presets[0]).name;
    var text = fill(labelTpl, name);
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
    if (announce) live.textContent = fill(announceTpl, name);
  }

  if (themeToggle && themeToggle.parentNode === container) {
    container.insertBefore(btn, themeToggle.nextSibling);
  } else {
    container.appendChild(btn);
  }
  document.body.appendChild(live);

  /* ---------- 空闲预取 ----------
     只预取「当前主题 + 下一套」那一张：两套 × 两主题共 4 张全取，就把「省一次等待」变成了
     「多下几百 KB」。主题切换（明暗按钮改的也是 data-theme）后由 MutationObserver 重新预取。 */
  var prefetched = {};

  function canPrefetch() {
    var c = navigator.connection;
    if (!c) return true;                      // 浏览器不支持 Network Information API：按可预取处理
    if (c.saveData) return false;             // 访客明确开了省流量
    // 尽力而为：桌面浏览器基本不报这个值，报了就当慢网处理
    return !/^(slow-2g|2g|3g)$/.test(c.effectiveType || '');
  }

  /* 要找的是「点了按钮之后真正会用到的那张图」。按钮的循环里掺进了动态背景（它没有图），
     所以不能只看 nextId() —— 那可能正好是它，于是什么都不预取。往后逐个找，第一个有图的就是。 */
  function nextImageTarget(theme) {
    for (var k = 1; k <= ids.length; k++) {
      var id = ids[(ids.indexOf(current) + k) % ids.length];
      var url = urlOf(id, theme);
      if (url) return { id: id, url: url };
    }
    return null;
  }

  function prefetchNext() {
    if (!canPrefetch()) return;
    // 后台标签页不预取：访客没在看，先别花他的流量；等他切回来（visibilitychange）再补上
    if (document.visibilityState === 'hidden') return;
    var theme = themeKey();
    var target = nextImageTarget(theme);
    if (!target) return;
    var id = target.id;
    var url = target.url;
    var key = id + '|' + theme;
    if (prefetched[key]) return;
    prefetched[key] = true;
    var img = new Image();
    img.decoding = 'async';
    img.src = url;
    // decode 一下：只下载不解码的话，切换那一帧仍要现解码（一百多 KB 的图足够掉一帧）
    if (img.decode) img.decode().catch(function () { /* 预取失败无所谓，切换时照旧按需加载 */ });
  }

  function onIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 2000 });
    else window.setTimeout(fn, 1200);
  }

  if (document.readyState === 'complete') onIdle(prefetchNext);
  else window.addEventListener('load', function () { onIdle(prefetchNext); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') onIdle(prefetchNext);
  });

  /* ---------- 切换 ---------- */
  var FADE_MS = 250;        // 与 00-theme.css 里 .bg-ghost 的 transition 时长一致
  var DECODE_MAX_MS = 600;  // 目标图没就绪时最多等这么久：超时就照切，宁可轻微跳一下也不要点了没反应
  var ghost = null;
  var ghostTimer = null;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  // 把当前 body::before 的**已解析**背景栈（蒙版渐变 + 图片 URL + size/position/repeat）快照到
  // ghost 上。这样 CSS 里不必再抄一份背景栈 —— 抄的第二份迟早与 00-theme.css 漂移。
  // 拿不到（关掉背景、或浏览器不返回伪元素的 computed 背景）就返回 false，调用方退回硬切。
  function makeGhost() {
    var cs;
    try {
      cs = getComputedStyle(document.body, '::before');
    } catch (e) {
      return false;
    }
    var bg = cs && cs.backgroundImage;
    if (!bg || bg === 'none') return false;
    var el = document.createElement('div');
    el.className = 'bg-ghost';
    el.setAttribute('aria-hidden', 'true');
    el.style.backgroundImage = bg;
    el.style.backgroundSize = cs.backgroundSize;
    el.style.backgroundPosition = cs.backgroundPosition;
    el.style.backgroundRepeat = cs.backgroundRepeat;
    document.body.insertBefore(el, document.body.firstChild);
    ghost = el;
    return true;
  }

  function dropGhost(immediately) {
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
    // 兜底：过渡被中断（切页、掉帧、中途改了「减少动态」设置）时别把图层永久留在页面上
    ghostTimer = window.setTimeout(done, FADE_MS + 150);
  }

  function apply(id) {
    root.setAttribute('data-bg', id);
    // 动态背景那一套没有图：切到它要启动 shader 的 rAF，切走就停（停着不花 GPU）。
    // 脚本可能根本不在（没开 shader，或它自己早退了 reduced-motion / 无 WebGL），所以全程判空。
    if (window.__bg && window.__bgOpts && id === window.__bgOpts.id && window.__bg.start) {
      window.__bg.start();
    } else if (window.__bg && window.__bg.stop) {
      window.__bg.stop();
    }
    current = id;
    // 隐私模式下 localStorage 会抛，存不上就只当次生效，不影响切换本身。
    try {
      localStorage.setItem('pref-bg', id);
    } catch (e) { /* 忽略 */ }
    sync(true);
  }

  /* 等「下一帧」，但**必须**有定时器兜底：标签页在后台时 rAF 完全不跑（实测：加了 rAF 的切换
     会停在中途，ghost 留在页面上、data-bg 一直不换）。这里要的只是「ghost 先被画过一次」——
     不画就改 class，浏览器会认为前后样式属于同一帧，过渡不成立、直接跳变。 */
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

  function switchTo(id) {
    if (reduced() || !makeGhost()) {
      apply(id);
      onIdle(prefetchNext);
      return;
    }
    // ghost 此刻已经盖住旧图（画面与点击前一致），所以这段等目标图就绪的时间里不会露底色 ——
    // 它下面的 body::before 也还是旧图。
    var mine = ghost;
    decodeThen(urlOf(id, themeKey()), function () {
      // 连点：这期间另一次切换已经把这一层收掉/换掉了，就交给那一次去收尾
      if (ghost !== mine) return;
      apply(id);
      void mine.offsetHeight;   // 强制一次样式计算，给下面的过渡确立起始值
      dropGhost(false);
      onIdle(prefetchNext);
    });
  }

  // 悬停/聚焦就先预取：比点击早一步，多数情况下点下去时图已经就绪。
  btn.addEventListener('pointerenter', prefetchNext);
  btn.addEventListener('focus', prefetchNext);

  btn.addEventListener('click', function () {
    dropGhost(true);   // 连点：上一层的淡出立刻收掉，不叠层
    switchTo(nextId());
  });

  // 明暗按钮改的是 data-theme —— 换了主题，「下一套那一张」就换成另一张图了。
  if (window.MutationObserver) {
    new MutationObserver(function () { onIdle(prefetchNext); })
      .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  sync(false);
})();
