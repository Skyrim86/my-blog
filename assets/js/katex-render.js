/* KaTeX 自动渲染（见 layouts/_partials/extend_head.html，按需加载）
   依赖同页面加载的 katex.min.js 与 contrib/auto-render.min.js，两者均为 defer，
   本脚本排在它们之后，因此执行时 renderMathInElement 通常已就绪；未就绪时轮询兜底。 */
(function () {
  var DELIMITERS = [
    { left: "$$", right: "$$", display: true },
    { left: "\\[", right: "\\]", display: true },
    { left: "$", right: "$", display: false },
    { left: "\\(", right: "\\)", display: false }
  ];

  // 代码块与 pre 内的 $ 不做渲染，避免误伤代码示例
  var IGNORED_TAGS = ["script", "noscript", "style", "textarea", "pre", "code", "option"];

  function render() {
    if (typeof window.renderMathInElement !== "function") {
      return false;
    }
    window.renderMathInElement(document.body, {
      delimiters: DELIMITERS,
      ignoredTags: IGNORED_TAGS,
      throwOnError: false
    });
    return true;
  }

  function boot() {
    if (render()) {
      return;
    }
    var tries = 0;
    var timer = setInterval(function () {
      if (render() || ++tries > 50) {
        clearInterval(timer);
      }
    }, 100);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
