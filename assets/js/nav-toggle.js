// 窄屏导航折叠（渐进增强）。
//
// 起因：主题这份 PaperMod 的 #menu 在窄屏是 flex-wrap 换行，7 个菜单项会折成两行，
// 顶栏被顶高、还把正文往下推。这里在窄屏插一个按钮把 #menu 收起来，点开才铺开。
//
// 不影响无 JS 的情况：脚本跑起来才给 <html> 加 has-nav-toggle，CSS 里的收起规则全挂在它下面，
// 所以禁用 JS 时菜单照主题原样显示。
(function () {
  var menu = document.getElementById('menu');
  if (!menu) return;

  var nav = menu.closest('.header-nav') || menu.parentNode;
  var label = document.currentScript && document.currentScript.dataset.label;
  var wide = window.matchMedia('(min-width: 641px)');

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'nav-toggle';
  btn.setAttribute('aria-controls', 'menu');
  btn.setAttribute('aria-expanded', 'false');
  if (label) btn.setAttribute('aria-label', label);
  btn.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" ' +
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
    '<line x1="4" y1="7" x2="20" y2="7"></line>' +
    '<line x1="4" y1="12" x2="20" y2="12"></line>' +
    '<line x1="4" y1="17" x2="20" y2="17"></line></svg>';

  function close() {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
  }

  btn.addEventListener('click', function () {
    var open = menu.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // 回到宽屏就还原，避免「窗口拉宽了菜单还锁在折叠状态」。
  wide.addEventListener('change', function (e) {
    if (e.matches) close();
  });

  document.documentElement.classList.add('has-nav-toggle');
  nav.insertBefore(btn, menu);
})();
