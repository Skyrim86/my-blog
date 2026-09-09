// Giscus 主题跟随 PaperMod 明暗切换
// 由 layouts/_partials/extend_head.html 以 defer 方式加载（执行时 body 已存在）
(function () {
  'use strict';

  // 信号源优先级：PaperMod 存的用户偏好 → body/html 的 dark class（auto 模式）→ 系统偏好
  function isDark() {
    var pref = localStorage.getItem('pref-theme');
    if (pref === 'dark')  return true;
    if (pref === 'light') return false;
    return (document.body && document.body.classList.contains('dark')) ||
           document.documentElement.classList.contains('dark') ||
           window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function send(theme) {
    var iframe = document.querySelector('iframe.giscus-frame');
    if (!iframe) return;
    try {
      iframe.contentWindow.postMessage(
        { giscus: { setConfig: { theme: theme } } },
        'https://giscus.app'
      );
    } catch (e) { /* iframe 跨域或未就绪，忽略 */ }
  }

  function sync() {
    var theme = isDark() ? 'dark' : 'light';
    send(theme);
    // 同步可能被 iframe 加载竞态吞掉，600ms 后重发一次兜底
    setTimeout(function () { send(theme); }, 600);
  }

  // PaperMod 切换主题时给 body/html 加 class
  var observer = new MutationObserver(sync);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  // 兜底：主题按钮点击后延迟同步（等 class 落盘）
  document.addEventListener('click', function (e) {
    if (e.target.closest('#theme-toggle, .theme-toggle, [id*="theme"]')) {
      setTimeout(sync, 50);
    }
  });

  // Giscus 懒加载：轮询等 iframe 出现，加载完成后同步初始主题（最多等 30 秒）
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var iframe = document.querySelector('iframe.giscus-frame');
    if (iframe) {
      iframe.addEventListener('load', function () {
        send(isDark() ? 'dark' : 'light');
      });
      clearInterval(timer);
    } else if (tries > 100) {
      clearInterval(timer); // 页面可能没有评论区，放弃
    }
  }, 300);
})();
