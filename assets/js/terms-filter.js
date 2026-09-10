/* 词条筛选框（标签 / 分类 / 系列总览页）
   由 layouts/_partials/extend_head.html 在 Kind == "taxonomy" 时以 defer 加载。
   UI 文案通过 <script> 标签的 data-placeholder / data-empty 传入——JS 里无法调用 Hugo 的 i18n，
   这是把文案留在 i18n/zh.toml 的唯一办法。
   输入框复用主题 .searchbox input 的样式（search.css 已在全局样式表中）。 */
(function () {
  'use strict';

  var list = document.querySelector('ul.terms-tags');
  if (!list || !list.querySelector('li')) return; // 没有词条（如空 taxonomy）就不注入

  var self = document.currentScript || {};
  var items = [].slice.call(list.querySelectorAll('li'));

  // 预先取出词条名：结构是 <a>名字 <sup><strong><sup>数量</sup></strong></sup></a>，
  // 去掉尾部数字，否则输入数字会误命中计数。
  items.forEach(function (li) {
    var link = li.querySelector('a');
    li.dataset.term = link ? link.textContent.replace(/\s*\d+\s*$/, '').trim().toLowerCase() : '';
  });

  var box = document.createElement('div');
  // searchbox：复用主题 .searchbox input 的样式；额外的间距规则挂在 terms-filter-box 上
  box.className = 'searchbox terms-filter-box';

  var input = document.createElement('input');
  input.type = 'search';
  input.id = 'termsFilter';
  input.autocomplete = 'off';
  input.placeholder = self.dataset ? (self.dataset.placeholder || '') : '';
  input.setAttribute('aria-label', input.placeholder);

  var empty = document.createElement('p');
  empty.className = 'terms-filter-empty';
  empty.textContent = self.dataset ? (self.dataset.empty || '') : '';
  empty.hidden = true;

  box.appendChild(input);
  list.parentNode.insertBefore(box, list);
  list.parentNode.insertBefore(empty, list);

  function apply() {
    var query = input.value.trim().toLowerCase();
    var shown = 0;
    items.forEach(function (li) {
      // 用 class 而不是 li.hidden：主题的 .terms-tags li 设了 display:inline-block，
      // 会压过浏览器默认的 [hidden] { display: none }，hidden 属性在这里不生效。
      var hit = !query || li.dataset.term.indexOf(query) !== -1;
      li.classList.toggle('terms-filter-hidden', !hit);
      if (hit) shown++;
    });
    empty.hidden = shown !== 0;
  }

  // 同步过滤：词条只有几十个，遍历成本可忽略。
  // 不用 requestAnimationFrame 节流——它在后台/隐藏标签页里不会触发，会导致筛选静默失效。
  input.addEventListener('input', apply);

  // Esc 清空并恢复（部分浏览器没有搜索框自带的清除按钮）
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && input.value) {
      input.value = '';
      apply();
    }
  });
})();
