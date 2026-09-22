// 背景切换（渐进增强）：**静态壁纸与动态背景各一个按钮、各存各的偏好**。
//
// 2026-09-22 晚改的口径（前一版把动态背景当成 presets 里的一「套」塞进同一个循环）：
// 一个按钮上同时管「换壁纸」和「开关动态背景」是拧的 —— 想固定看某张壁纸、又想偶尔开一下
// 动态，得点着循环数圈，而且数到哪一套完全看上一次停在哪。现在：
//   · #bg-switch  静态壁纸循环        → localStorage['pref-bg']（原有键，语义收窄为「静态套」）
//   · #bg-dyn     动态背景：关→套1→套2→…→关 → localStorage['pref-bg-dyn']（空串 = 关）
// 两个键**互相独立**（各存各的、互不覆盖），但**同一时刻只显示一套**：点壁纸会**把动态关掉**，
// 开动态则壁纸从画面上消失（生成 CSS 把 --bg-image-* 置成 none，那张图这次连下都不下）。
// 这是 2026-09-22 晚**第五版**的口径，用户的原话是「静态壁纸和动态壁纸是独立的，点了静态动态
// 就消失，反之亦然」。前三版的来回记在这里，免得下次又绕一圈：
//   · 一版：一个按钮循环里混着动态套（「换壁纸」和「开关动态」在同一根轴上，数到哪套看运气）；
//   · 二版：拆成两个按钮，但「点壁纸时顺带关掉动态」—— 被指出是拿隐式状态改写换「按钮有反应」；
//   · 三版：两根轴**零交叉写入**，于是动态开着时点壁纸画面完全不变，只靠按钮名 + 播报提示
//            「关掉动态才能看到」。用户的实际期待不是这个 —— 他要的是「一点就换过去」；
//   · 四版：拆开「空闲预取」与「意图预热」（那条与互斥无关，保留）；
//   · 五版（当前）：互斥。点壁纸按钮 = 关掉动态 + 显示按钮上写着的那张（**第一次点不换套**：
//            一次点击只做一件事，再点才轮到下一张）。点动态按钮 = 壁纸退场、偏好留着 ——
//            所以把它关掉回到的仍是你自己选的那张，不是默认套。
// 因此 `pref-bg` 的语义是「动态关掉之后要回到的那张」，而屏幕上是哪一套仍然只由
// <html data-bg> 一个属性决定（静态套写静态 id，动态开写动态 id，形如 `__dyn-xxx`）。
// 动态开着时**空闲期不预取静态壁纸**（第四版留下的口径：同一时刻只让一张背景占着下载与
// 解码位图），改由**意图预热**接手 —— 悬停/聚焦/按下任一个背景按钮时才取「点下去会落到的那张」
// （warmStaticIntent / warmDynIntent）。鼠标与键盘够用；触屏没有悬停，按下去那一刻才开始。
// 四个跑法的数字见 lab/结果/bg-shader-contrast/check-prefetch.py。
//
// 事实源仍然是 <html data-bg="..."> 一个属性：静态套写静态 id，动态开写动态 id（形如
// `__dyn-xxx`，前缀由模板给）。所以：
//   · 屏幕上是哪一套 = 读属性（首屏那段内联脚本已按偏好写好，含「存的套已删除」的兜底）；
//   · shader 跑不跑 **不在这里决定** —— 改完属性统一调 window.__bg.refresh()，由 bg-shader.js
//     自己读属性（原来那版是这里直接调 start()/stop()，两处状态容易对不上）。
//
// 交叉淡入两种模式（都是原来那套 ghost 图层，只是方向不同；background-image 是离散属性、
// 过渡不插值，只能靠叠层）：
//   · 当前是静态套 → ghost 快照**当前整个背景栈**（蒙版 + 旧图），改完属性让它淡出；
//   · 当前是动态背景（body::before 里没有 url 可快照）→ 先在**上面**画一张目标壁纸的 ghost，
//     从 0 淡到 1 盖住画布，落定后改属性、同一帧里把 ghost 换成「新套的已解析栈」再撤掉。
// 后者是必须的：画布在 body::before **之下**，壁纸一出现就把它整块盖住 —— 从动态切回壁纸
// 若照旧「淡出旧栈」，露出来的是瞬间出现的新壁纸，等于硬切。
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;

  function parseList(s) {
    try { return JSON.parse(s || '[]'); } catch (e) { return []; }
  }

  var presets = parseList(script.dataset.presets);   // 静态套（有图）
  var dyns = parseList(script.dataset.dyn);          // 动态套（无图，只有 id 与名字）
  if (!presets.length && !dyns.length) return;

  // 动态背景按钮只在 shader 真的挂上了才建：三条早退路径（减少动态 / 无 WebGL / GLSL 编译失败）
  // 下它点了不会有任何变化，那种按钮不如不出现。bg-shader.js 排在前面（模板保证顺序）。
  var bgOk = !!(window.__bg && window.__bg.ok);
  if (!bgOk) dyns = [];

  var root = document.documentElement;
  var ids = presets.map(function (p) { return p.id; });
  var dynIds = dyns.map(function (d) { return d.id; });
  var staticDefault = script.dataset.default || ids[0] || '';
  var dynOffName = script.dataset.dynOff || '—';
  var labelTpl = script.dataset.label || '{name}';
  // 动态开着时壁纸按钮那一下**不换套**（只把动态收起来），按钮名得说清楚，否则像坏了：
  // 「切换壁纸（点一下会关掉动态背景）：当前 城市」。
  var labelDynOnTpl = script.dataset.labelDynOn || labelTpl;
  var announceTpl = script.dataset.announce || '{name}';
  var dynLabelTpl = script.dataset.dynLabel || '{name}';
  var dynAnnounceTpl = script.dataset.dynAnnounce || '{name}';
  var dynOffNote = script.dataset.dynOffNote || '';

  /* ---------- 状态 ---------- */
  // 静态侧的当前值：屏幕上显示的是它，或者（动态开着时）是**下次会回来的那一套**。
  var staticId = root.getAttribute('data-bg');
  if (ids.indexOf(staticId) < 0) {
    try { staticId = localStorage.getItem('pref-bg'); } catch (e) { staticId = null; }
  }
  if (ids.indexOf(staticId) < 0) staticId = staticDefault;
  if (ids.indexOf(staticId) < 0) staticId = ids[0] || '';

  // 动态侧：只有 shader 活着、且屏幕上那个属性确实是这套动态套时才算「开着」——
  // 早退路径下 bg-shader.js 已经把属性换回静态套了，这里读属性自然不会误判。
  var dynId = root.getAttribute('data-bg');
  if (dynIds.indexOf(dynId) < 0) dynId = '';

  function themeKey() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function urlOf(id, theme) {
    var p = presets[ids.indexOf(id)];
    return (p && p[theme]) || '';
  }

  function fill(tpl, name) {
    return tpl.replace('{name}', name);
  }

  /* ---------- 两个按钮与一个播报节点 ---------- */
  var container = document.querySelector('.logo-switches') || document.querySelector('.logo');
  if (!container) return;

  var themeToggle = document.getElementById('theme-toggle');
  var prev = themeToggle && themeToggle.parentNode === container ? themeToggle : null;

  // 背景切换是纯视觉变化，读屏用户什么都得不到：一个 role="status" 的播报节点。
  // 挂在 <body> 末尾而不是按钮旁边 —— 放进 .logo-switches 会参与那一行的 flex 布局
  // （主题的 `.logo-switches > *` 会给它 min-height 与 inline-flex）。
  var live = document.createElement('span');
  live.id = 'bg-live';                 // 给回归测一个确定的抓手（页面上还有别处也用 role=status 播报）
  live.className = 'sr-only';
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');

  var SVG_ATTRS = ' xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24"' +
    ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' +
    ' aria-hidden="true"';

  function addButton(id, cls, icon, label, title) {
    var b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'theme-toggle ' + cls;
    b.innerHTML = '<svg' + SVG_ATTRS + '>' + icon + '</svg>';
    b.setAttribute('aria-label', label);
    b.setAttribute('title', title);
    if (prev && prev.parentNode === container) container.insertBefore(b, prev.nextSibling);
    else container.appendChild(b);
    prev = b;
    return b;
  }

  var btnStatic = null;
  var btnDyn = null;

  // 按钮由 JS 注入，不写进模板：没有 JS 时它不该出现（一个点不动的控件比没有更糟），
  // 而模板里加按钮就得覆盖主题的 header.html（AGENTS 规则 5 不允许）。
  if (ids.length >= 2) {
    btnStatic = addButton('bg-switch', 'bg-switch',
      '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>' +
      '<circle cx="8.5" cy="8.5" r="1.5"></circle>' +
      '<polyline points="21 15 16 10 5 21"></polyline>', '', '');
  }
  if (dynIds.length) {
    // 图标：四角星 + 小星（「会动的那一层」）。与壁纸那个「图片」图标一眼能分开。
    btnDyn = addButton('bg-dyn', 'bg-dyn',
      '<path d="M11 3.2l1.6 4.4 4.4 1.6-4.4 1.6L11 15.2 9.4 10.8 5 9.2l4.4-1.6z"></path>' +
      '<path d="M18 14.6l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8z"></path>', '', '');
  }

  if (btnStatic || btnDyn) document.body.appendChild(live);

  function nameOfStatic(id) {
    var p = presets[ids.indexOf(id)];
    return (p && p.name) || '';
  }
  function nameOfDyn(id) {
    if (!id) return dynOffName;
    var d = dyns[dynIds.indexOf(id)];
    return (d && d.name) || dynOffName;
  }

  function label(btn, text) {
    if (!btn) return;
    btn.setAttribute('aria-label', text);
    btn.setAttribute('title', text);
  }

  /* note：这次点的是壁纸按钮，而**刚才**动态背景开着 —— 这一下顺带把它关了（两条轴互斥，
     文件头第五版）。不说这一句，读屏用户只会听到「壁纸已切换到 X」，不知道画面为什么整个变了。 */
  function syncStatic(announce, note) {
    var name = nameOfStatic(staticId);
    label(btnStatic, fill(dynId ? labelDynOnTpl : labelTpl, name));
    if (announce) {
      var t = fill(announceTpl, name);
      if (note) t += dynOffNote;
      live.textContent = t;
    }
  }

  function syncDyn(announce) {
    var name = nameOfDyn(dynId);
    label(btnDyn, fill(dynLabelTpl, name));
    if (announce) live.textContent = fill(dynAnnounceTpl, name);
  }

  /* ---------- 预取：沿**当前这条轴**，且只在访客有动作时 ----------
     取「当前主题 × 要落地的那一张」。两套 × 两主题共 4 张全取，就把「省一次等待」变成了
     「多下几百 KB」，所以主题那一维交给 MutationObserver 重新预取。

     2026-09-22 晚第四版把「空闲期」与「意图」分开：
       · prefetchIdle()  空闲期只取**同轴**的下一套壁纸；动态开着就什么都不取
                         （跨轴的空闲预取 = 两根轴同时占着下载与解码位图，文件头 ③）。
       · warm*Intent()   访客够到按钮时才跨轴取 —— 那一下点下去要落到哪张，是能算出来的。
     省流量 / 慢网 / 后台标签页三条守卫照旧（canPrefetch）。动态套自己没有文件可预取。 */
  var prefetched = {};

  function canPrefetch() {
    var c = navigator.connection;
    if (!c) return true;                      // 浏览器不支持 Network Information API：按可预取处理
    if (c.saveData) return false;             // 访客明确开了省流量
    // 尽力而为：桌面浏览器基本不报这个值，报了就当慢网处理
    return !/^(slow-2g|2g|3g)$/.test(c.effectiveType || '');
  }

  function nextStaticId() {
    if (!ids.length) return '';
    var i = ids.indexOf(staticId);
    return ids[(i < 0 ? 0 : i + 1) % ids.length];
  }

  function warm(want) {
    if (!canPrefetch()) return;
    // 后台标签页不预取：访客没在看，先别花他的流量；等他切回来（visibilitychange）再补上
    if (document.visibilityState === 'hidden') return;
    var theme = themeKey();
    for (var i = 0; i < want.length; i++) {
      var id = want[i];
      var url = urlOf(id, theme);
      if (!url) continue;
      var key = id + '|' + theme;
      if (prefetched[key]) continue;
      prefetched[key] = true;
      var img = new Image();
      img.decoding = 'async';
      // 低优先级：别跟首屏关键资源抢带宽（Chromium 102+ 支持，其它浏览器忽略）
      if ('fetchPriority' in img) img.fetchPriority = 'low';
      img.src = url;
      // decode 一下：只下载不解码的话，切换那一帧仍要现解码（一百多 KB 的图足够掉一帧）
      if (img.decode) img.decode().catch(function () { /* 预取失败无所谓，切换时照旧按需加载 */ });
    }
  }

  function prefetchIdle() {
    if (dynId) return;                 // 动态开着：静态壁纸一张都不下（文件头 ③）
    warm([nextStaticId()]);
  }

  // 壁纸按钮：这一下点下去落到「下一套」。
  function warmStaticIntent() {
    warm([nextStaticId()]);
  }

  // 动态按钮：点下去可能是换套、也可能是**关**（停在最后一套时）；只有「关」才需要壁纸。
  // 顺手让引擎把上下文备好 —— bg-shader.js 惰性挂载，悬停时就挂好，点下去那一刻不花挂载的钱；
  // 真跑不了的话现在就会知道（它派发 bg:dyn-unavailable，按钮在点之前就消失）。
  function warmDynIntent() {
    if (window.__bg && window.__bg.prepare) window.__bg.prepare();
    var i = dynIds.indexOf(dynId);
    if (i < 0) return;                     // 动态没开：这一下点下去是「开」，落地不是壁纸
    if (i + 1 < dynIds.length) return;     // 还有下一套：点下去是换套，落地也不是壁纸
    warm([staticId]);                      // 停在最后一档：点下去就是「关」，落地是当前那张壁纸
  }

  function onIdle(fn) {
    if (window.requestIdleCallback) window.requestIdleCallback(fn, { timeout: 2000 });
    else window.setTimeout(fn, 1200);
  }

  /* ---------- 交叉淡入的两种模式 ---------- */
  var FADE_MS = 250;        // 与 00-theme.css 里 .bg-ghost 的 transition 时长一致
  var DECODE_MAX_MS = 600;  // 目标图没就绪时最多等这么久：超时就照切，宁可轻微跳一下也不要点了没反应
  var ghost = null;
  var ghostTimer = null;

  function reduced() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function pseudoCS() {
    try { return getComputedStyle(document.body, '::before'); } catch (e) { return null; }
  }

  // body::before 里现在有没有图。没有 = 动态背景正开着（那条 CSS 把 --bg-image-* 置成了 none），
  // 也就是「旧栈快照出来是空的」—— 由此决定用哪种淡入，不必另存一份状态。
  function hasImage() {
    var cs = pseudoCS();
    return !!(cs && cs.backgroundImage && cs.backgroundImage.indexOf('url(') >= 0);
  }

  // 建 ghost 图层。image 传 null = 快照当前 body::before 的**已解析**背景栈（这样 CSS 里不必
  // 再抄一份背景栈 —— 抄的第二份迟早与 00-theme.css 漂移）；传 url(...) = 用目标图。
  function makeGhost(image) {
    var cs = pseudoCS();
    var bg = image || (cs && cs.backgroundImage) || '';
    if (!bg || bg === 'none') return null;
    var el = document.createElement('div');
    el.className = 'bg-ghost';
    el.setAttribute('aria-hidden', 'true');
    el.style.backgroundImage = bg;
    if (cs) {
      el.style.backgroundSize = cs.backgroundSize;
      el.style.backgroundPosition = cs.backgroundPosition;
      el.style.backgroundRepeat = cs.backgroundRepeat;
    }
    document.body.insertBefore(el, document.body.firstChild);
    ghost = el;
    return el;
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

  /* 上纸（当前是动态背景）：目标壁纸先在 ghost 上从 0 淡到 1 盖住画布，落定后再改属性、
     并且**同一帧里**把 ghost 的背景换成新套的已解析栈（含蒙版）再撤掉 —— 两者像素等价，
     接缝为 0。不这么做的话撤 ghost 那一瞬会从「无蒙版的图」跳到「带蒙版的图」。 */
  function fadeInWallpaper(url, st, from) {
    var mine = makeGhost('url("' + url + '")');
    if (!mine) { commit(st, from); onIdle(prefetchIdle); return; }
    mine.style.opacity = '0';
    void mine.offsetHeight;                                  // 给下面的过渡确立起始值
    mine.style.opacity = '1';
    var finish = function () {
      if (ghost !== mine) return;
      commit(st, from);
      var cs = pseudoCS();
      if (cs) {
        mine.style.backgroundImage = cs.backgroundImage;
        mine.style.backgroundSize = cs.backgroundSize;
        mine.style.backgroundPosition = cs.backgroundPosition;
        mine.style.backgroundRepeat = cs.backgroundRepeat;
      }
      mine.remove();
      if (ghost === mine) ghost = null;
      if (ghostTimer) { window.clearTimeout(ghostTimer); ghostTimer = null; }
      onIdle(prefetchIdle);
    };
    mine.addEventListener('transitionend', finish);
    // 兜底同上：过渡被中断时也要落定，否则 data-bg 会一直不换（页面停在旧背景上）
    ghostTimer = window.setTimeout(finish, FADE_MS + 150);
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

  /* ---------- 落定（唯一改属性的地方） ---------- */
  // st = {static: <静态套 id>, dyn: <动态套 id 或 ''>}；from 说明是哪个按钮点的，只播报那一边。
  function commit(st, from) {
    var dynWas = dynId;                 // 点之前动态开着没有：决定播报里要不要说「已关掉动态背景」
    staticId = st.static;
    dynId = st.dyn;
    root.setAttribute('data-bg', dynId || staticId);
    // shader 跑不跑由它自己读属性决定（这个文件不认识「动态」以外的任何细节）
    if (window.__bg && window.__bg.refresh) window.__bg.refresh();
    // 隐私模式下 localStorage 会抛，存不上就只当次生效，不影响切换本身。
    try {
      localStorage.setItem('pref-bg', staticId);
      localStorage.setItem('pref-bg-dyn', dynId);
    } catch (e) { /* 忽略 */ }
    // 点了壁纸按钮而动态刚才开着：这一下把它关掉了，播报里要带上（第五版）。
    syncStatic(from === 'static', from === 'static' && !!dynWas);
    syncDyn(from === 'dyn');
  }

  /* ---------- 切换 ---------- */
  // 目标状态 → 过渡 → 落定。三种情形共用这一条路径：
  //   静态 → 静态：淡出旧栈；静态 → 动态：淡出旧栈；动态 → 静态：从上淡入新壁纸；
  //   动态 → 动态：没有图可淡，画布自己在换程序时压一下（bg-shader.js 里）。
  function go(st, from) {
    if (reduced()) { commit(st, from); onIdle(prefetchIdle); return; }
    var url = st.dyn ? '' : urlOf(st.static, themeKey());
    if (hasImage()) {
      var mine = makeGhost(null);
      if (!mine) { commit(st, from); onIdle(prefetchIdle); return; }
      // ghost 此刻已经盖住旧图（画面与点击前一致），所以这段等目标图就绪的时间里不会露底色
      decodeThen(url, function () {
        // 连点：这期间另一次切换已经把这一层收掉/换掉了，就交给那一次去收尾
        if (ghost !== mine) return;
        commit(st, from);
        void mine.offsetHeight;   // 强制一次样式计算，给下面的过渡确立起始值
        dropGhost(false);
        onIdle(prefetchIdle);
      });
      return;
    }
    if (!url) { commit(st, from); onIdle(prefetchIdle); return; }
    decodeThen(url, function () { fadeInWallpaper(url, st, from); });
  }

  if (btnStatic) {
    // 悬停/聚焦/按下就先预取：比点击早一步，多数情况下点下去时图已经就绪。
    btnStatic.addEventListener('pointerenter', warmStaticIntent);
    btnStatic.addEventListener('focus', warmStaticIntent);
    btnStatic.addEventListener('pointerdown', warmStaticIntent);
    btnStatic.addEventListener('click', function () {
      dropGhost(true);   // 连点：上一层的淡出立刻收掉，不叠层
      // **互斥**：这一下点下去，动态背景必须消失（文件头第五版）。
      // 动态开着时**不换套** —— 按钮上写着哪张就显示哪张，一次点击只做一件事（再点才轮到下一张）；
      // 动态本来就关着时照旧循环下一套。
      go({ static: dynId ? staticId : nextStaticId(), dyn: '' }, 'static');
    });
  }

  if (btnDyn) {
    // 意图：悬停/聚焦/按下时把引擎挂好、把「关掉之后要落到的壁纸」取好（warmDynIntent）。
    btnDyn.addEventListener('pointerenter', warmDynIntent);
    btnDyn.addEventListener('focus', warmDynIntent);
    btnDyn.addEventListener('pointerdown', warmDynIntent);
    btnDyn.addEventListener('click', function () {
      dropGhost(true);
      var i = dynIds.indexOf(dynId);
      var next = i < 0 ? 0 : i + 1;             // 关 → 套1 → 套2 → … → 关
      go({ static: staticId, dyn: next >= dynIds.length ? '' : dynIds[next] }, 'dyn');
    });
  }

  /* 动态引擎在**真正挂载**时才发现跑不了（惰性挂载：静态壁纸的访客不为它付一个 GL 上下文），
     那一刻 bg-shader.js 已经把 data-bg 换回静态套，并派发这个事件。这里收尾：撤掉那个按钮、
     对齐静态侧、把偏好落成「关」（它确实没跑起来，留着会让下次刷新又试一遍），并播报原因。
     不做这件事就会留下一个「点了没反应」的控件 —— 那比没有更糟（见上面建按钮那段）。 */
  document.addEventListener('bg:dyn-unavailable', function () {
    dyns = []; dynIds = [];
    dynId = '';
    var now = root.getAttribute('data-bg');
    if (ids.indexOf(now) >= 0) staticId = now;    // standDown 换回的是**他存的那张**
    if (btnDyn) { btnDyn.remove(); btnDyn = null; }
    try { localStorage.setItem('pref-bg-dyn', ''); } catch (e) { /* 存不进去不影响这次收尾 */ }
    syncStatic(false);
    live.textContent = fill(script.dataset.dynUnavailable || '{name}', nameOfStatic(staticId));
  });

  // 明暗按钮改的是 data-theme —— 换了主题，「下一套那一张」就换成另一张图了。
  if (window.MutationObserver) {
    new MutationObserver(function () { onIdle(prefetchIdle); })
      .observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (document.readyState === 'complete') onIdle(prefetchIdle);
  else window.addEventListener('load', function () { onIdle(prefetchIdle); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') onIdle(prefetchIdle);
  });

  syncStatic(false);
  syncDyn(false);
})();
