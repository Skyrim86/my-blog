// 背景套切换（渐进增强）。
//
// 背景套的事实源是 hugo.toml 的 [params.appearance].presets，模板（extend_head.html）把
// 「有哪些套」与套名经 data-* 传进来（JS 调不到 i18n，与 nav-toggle.js / list-tools.js 同一做法）。
//
// 三件事刻意这么做：
//   1. 按钮由 JS 注入，不写进模板。没有 JS 时它不该出现（一个点不动的控件比没有更糟），
//      而模板里加按钮就得覆盖主题的 header.html（AGENTS 规则 5 不允许）。
//   2. 当前套读的是 <html data-bg="...">，不是 localStorage：那个属性已被首屏前置脚本
//      （extend_head.html 里那段内联）按存的偏好写好，读属性才与「屏幕上正在显示的图」一致。
//      存的值若指向已删除的套，这里会落回默认套，与前置脚本的校验同一套判据。
//   3. 切换只改属性 + 存偏好，不做过渡动画：背景是 position: fixed 的整屏图层，
//      做淡入淡出要叠两层，而切主题本来就是瞬时的，保持一致。
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

  btn.addEventListener('click', function () {
    var i = ids.indexOf(current);
    current = ids[(i + 1) % ids.length];
    root.setAttribute('data-bg', current);
    // 隐私模式下 localStorage 会抛，存不上就只当次生效，不影响切换本身。
    try {
      localStorage.setItem('pref-bg', current);
    } catch (e) { /* 忽略 */ }
    sync(true);
  });

  sync(false);

  if (themeToggle && themeToggle.parentNode === container) {
    container.insertBefore(btn, themeToggle.nextSibling);
  } else {
    container.appendChild(btn);
  }
  document.body.appendChild(live);
})();
