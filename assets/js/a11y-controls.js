/* 主题模板里硬编码的英文可访问名，本地化。
 *
 * 背景：PaperMod 的 header.html 与 footer.html 把两个全站控件的可访问名写死成英文 ——
 *   #theme-toggle  aria-label="Toggle theme" title="(Alt + T)"
 *   #top-link      aria-label="go to top"     title="Go to Top (Alt + G)"
 * 搜索页（主题 search.html）的输入框与结果列表同样是 "search" / "search results"。
 * 中文站点上读屏用户听到的就是这几串英文；而项目自己注入的同类控件（extend_footer.html 的
 * #bottom-link、index_profile.html 的快捷入口导航）走的都是 i18n —— 即这是漏网的，不是有意的取舍。
 *
 * 为什么不覆盖主题模板：AGENTS 规则 5（不要整份复制主题模板）与规则 10（不改 themes/PaperMod/）。
 * 只为四个属性再添一处覆盖不划算 —— 与 #searchResults 的播报（a11y-announce.js）是同一个判断。
 *
 * 为什么补属性不会留下「无 JS 时缺失」的窗口：这两个控件本来就是 JS 才有意义的东西 ——
 * #theme-toggle 的点击逻辑与 #top-link 的显隐都在主题 footer.html 的内联脚本里，而没有 JS 时
 * 主题 head.html 的 <noscript> 会把 #theme-toggle 与 .top-link 一起藏掉。
 *
 * 文案经 <script> 的 data-* 传入 —— JS 里不能调 Hugo 的 i18n，与 terms-filter.js、list-tools.js
 * 是同一套做法。元素不存在时静默跳过（关掉主题切换、关掉滚动到顶部、或非搜索页）。
 */
(function () {
  'use strict';

  var ds = (document.currentScript || {}).dataset || {};

  /* 装饰性图标不参与可访问树：可访问名已经在按钮/链接上，不隐藏时部分读屏会把图标一起念出来 */
  function hideIcons(el) {
    var svgs = el.querySelectorAll('svg');
    for (var i = 0; i < svgs.length; i++) svgs[i].setAttribute('aria-hidden', 'true');
  }

  function apply(id, label, title) {
    var el = document.getElementById(id);
    if (!el) return;
    if (label) el.setAttribute('aria-label', label);
    if (title) el.setAttribute('title', title);
    hideIcons(el);
  }

  apply('theme-toggle', ds.themeToggleLabel, ds.themeToggleTitle);
  apply('top-link', ds.topLinkLabel, ds.topLinkTitle);

  var input = document.getElementById('searchInput');
  if (input && ds.searchInputLabel) input.setAttribute('aria-label', ds.searchInputLabel);

  var results = document.getElementById('searchResults');
  if (results && ds.searchResultsLabel) results.setAttribute('aria-label', ds.searchResultsLabel);
})();
