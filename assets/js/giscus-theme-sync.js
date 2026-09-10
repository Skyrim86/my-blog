// Giscus 主题跟随 PaperMod 明暗切换
// 由 layouts/_partials/extend_head.html 仅在有评论区的页面以 defer 加载（执行时 DOM 已就绪）
//
// PaperMod 的明暗机制：<html data-theme="light|dark">。主题在页面加载时就把 auto 解析成
// light/dark，切换按钮改的也是这个属性，CSS 用 :root[data-theme="dark"] 匹配。
// 因此这里只判断该属性，与 CSS 保持完全一致。
(function () {
  'use strict';

  function currentTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
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

  // 发两次：首次可能被 iframe 加载竞态吞掉
  function sync() {
    var theme = currentTheme();
    send(theme);
    setTimeout(function () { send(theme); }, 600);
  }

  // 主题切换：PaperMod 改的是 html 的 data-theme 属性
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  // Giscus 是懒加载 iframe，轮询等它出现（最多 30 秒），出现后每次加载都同步主题
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var iframe = document.querySelector('iframe.giscus-frame');
    if (iframe) {
      iframe.addEventListener('load', sync);
      sync();
      clearInterval(timer);
    } else if (tries > 100) {
      clearInterval(timer);
    }
  }, 300);
})();
