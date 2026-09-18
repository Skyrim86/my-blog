/* 词条筛选框（标签 / 分类总览页）
   由 layouts/_partials/extend_head.html 在 Kind == "taxonomy" 时以 defer 加载。
   UI 文案通过 <script> 标签的 data-placeholder / data-empty 传入——JS 里无法调用 Hugo 的 i18n，
   这是把文案留在 i18n/zh.toml 的唯一办法。
   输入框复用主题 .searchbox input 的样式（search.css 已在全局样式表中）。

   2026-09-18：标签总览页改成按 data/tag-groups.yaml **分块**渲染（layouts/taxonomy.html），
   于是页面上会有多个 ul.terms-tags（每组一个）+ 各自的 h2.terms-group-title。
   这份脚本相应改成遍历**所有**列表，并把被筛空的组的标题一起收起。 */
(function () {
  'use strict';

  var lists = [].slice.call(document.querySelectorAll('ul.terms-tags'));
  if (!lists.length || !document.querySelector('ul.terms-tags li')) return; // 没有词条（如空 taxonomy）就不注入

  var self = document.currentScript || {};

  /* 每个列表带上它的组标题（主题版的 markup 里标题是列表的前一个兄弟节点；没有就不是分组页） */
  var groups = lists.map(function (list) {
    var prev = list.previousElementSibling;
    return {
      list: list,
      title: prev && prev.classList.contains('terms-group-title') ? prev : null
    };
  });

  var items = [];
  groups.forEach(function (group) {
    [].slice.call(group.list.querySelectorAll('li')).forEach(function (li) {
      // 预先取出词条名：结构是 <a>名字 <sup><strong><sup>数量</sup></strong></sup></a>，
      // 去掉尾部数字，否则输入数字会误命中计数。
      var link = li.querySelector('a');
      li.dataset.term = link ? link.textContent.replace(/\s*\d+\s*$/, '').trim().toLowerCase() : '';
      items.push(li);
    });
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
  /* 插在**第一块组标题之前**（而不是第一个列表之前）：后者会把输入框塞进「标题 ↔ 它的列表」
     中间（实测截图里「数学」下面先出现输入框、再出现数学的五个词条），而且会让下面
     「整组被筛空时收起标题」的配对（按 previousElementSibling 找标题）失效。
     没有分组时（单列表）退化成原来的行为。 */
  var firstGroup = groups[0];
  var anchor = firstGroup.title || firstGroup.list;
  anchor.parentNode.insertBefore(box, anchor);
  box.parentNode.insertBefore(empty, box.nextSibling);

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
    /* 一组被筛空时，连它的标题一起收起 —— 否则会出现「只剩标题、下面空着」的块 */
    groups.forEach(function (group) {
      if (!group.title) return;
      var any = [].slice.call(group.list.querySelectorAll('li')).some(function (li) {
        return !li.classList.contains('terms-filter-hidden');
      });
      group.title.hidden = !any;
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
