/* 列表页的排序与标签筛选（2026-09-18）。
 *
 * 由 layouts/_partials/extend_head.html 在 Kind 为 section / term 的页面加载
 * （/courses/、/projects/、课程主页、分层项目主页、/tags/xxx/、/categories/xxx/）。
 * 文案经 <script> 的 data-* 传入 —— JS 里不能调 Hugo 的 i18n，与 terms-filter.js、
 * toolbox.js 是同一套做法。
 *
 * 已加载但页面没有列表时不注入任何东西（脚本直接返回）。
 *
 * ---- 条目的数据从哪来 ----
 * 两条路子，先看 data 属性、没有才从渲染出来的 DOM 里读：
 *   1. 我们自己的模板（course-index.html / project-index.html）会输出
 *      data-date="2006-01-02" 与 data-tags="A,B"。
 *   2. 主题 list.html 渲染的卡片没有 data 属性，这里读它的既有 DOM 契约：
 *      · 日期：`.entry-footer .post-meta span[title]` —— post_meta.html 就写的是
 *        <span title='2026-09-15 00:00:00 +0800 CST'>2026年9月15日</span>，取前 10 位即可。
 *      · 标签：`.card-chips .card-chip--tag` 的文字（card-chips.html 输出）。
 *      这样就不必覆盖主题的 list.html（那是第 6 处「有意覆盖」，为两个属性不值得）。
 *      注意：卡片只在课程/项目根页有标签 chips，所以词条页（如 /categories/课程/）只会出现
 *      排序按钮、不会出现标签筛选 —— 那里所有条目本来就同属一个标签，筛选也没意义。
 *
 * ---- 与分页的关系（别在 UI 上谎报）----
 * pagerSize = 10，排序只作用于**当前这一页**的条目：跨页排序需要关掉分页，做不到。
 * 当前各列表页基本都在一页内，所以按钮上不写误导性文案，这条限制记在 docs/features.md。
 */
(function () {
  'use strict';

  var self = document.currentScript || {};
  function label(key, fallback) {
    var ds = self.dataset || {};
    return ds[key] || fallback || key;
  }

  /* 每个列表：容器 + 它的条目 + 工具条插在哪 */
  var LISTS = [
    { container: 'main.main', item: ':scope > .post-entry', anchor: ':scope > .page-header' },
    { container: '.course-index-list', item: ':scope > li' },
    { container: '.project-index-list', item: ':scope > li' }
  ];

  function readDate(item) {
    var explicit = item.getAttribute('data-date');
    if (explicit) return explicit;
    /* 卡片页脚里那枚带 title 的日期 span（post_meta.html 输出）。
       注意它**没有** .post-meta 外层容器 —— 那是详情页元信息块的类，列表页脚里只有这串裸 span。 */
    var span = item.querySelector('.entry-footer span[title], .post-meta span[title]');
    var raw = span ? span.getAttribute('title') : '';
    var m = /^(\d{4}-\d{2}-\d{2})/.exec(raw || '');
    return m ? m[1] : '';
  }

  function readTags(item) {
    var explicit = item.getAttribute('data-tags');
    if (explicit !== null) {
      return explicit.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    }
    var out = [];
    item.querySelectorAll('.card-chips .card-chip--tag').forEach(function (chip) {
      var name = (chip.textContent || '').trim();
      if (name && out.indexOf(name) === -1) out.push(name);
    });
    return out;
  }

  function buildBar(list, items, info) {
    var bar = document.createElement('div');
    bar.className = 'lt-bar';

    var order = items.map(function (item) { return { item: item, date: readDate(item) }; });
    var hasDate = order.some(function (entry) { return entry.date; });

    var current = { order: null, tags: [] };
    var buttons = [];

    function makeButton(text, key, onClick) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lt-btn';
      b.textContent = text;
      b.dataset.key = key;
      b.addEventListener('click', function () {
        current.order = key === 'default' ? null : key;
        buttons.forEach(function (other) { other.classList.toggle('is-active', other === b); });
        apply();
        onClick && onClick();
      });
      return b;
    }

    /* 排序按钮：默认顺序 = 页面原本的顺序（服务端按 weight / 日期排好的那份） */
    var sortWrap = document.createElement('div');
    sortWrap.className = 'lt-group';
    sortWrap.setAttribute('role', 'group');
    sortWrap.setAttribute('aria-label', label('sort', 'Sort'));
    var defBtn = makeButton(label('default', 'Default'), 'default');
    buttons.push(defBtn);
    sortWrap.appendChild(defBtn);
    if (hasDate) {
      buttons.push(makeButton(label('newest', 'Newest'), 'newest'));
      buttons.push(makeButton(label('oldest', 'Oldest'), 'oldest'));
      for (var i = 1; i < buttons.length; i++) sortWrap.appendChild(buttons[i]);
    }
    defBtn.classList.add('is-active');
    bar.appendChild(sortWrap);

    /* 标签 chips：所有条目标签的并集，选中任意一个即显示（OR） */
    var tagNames = [];
    items.forEach(function (item) {
      readTags(item).forEach(function (t) { if (tagNames.indexOf(t) === -1) tagNames.push(t); });
    });
    var tagButtons = [];
    var empty = null;
    var result = null;

    function apply() {
      var selected = current.tags;
      var shown = 0;
      order.forEach(function (entry) {
        var tags = readTags(entry.item);
        var hit = !selected.length || tags.some(function (t) { return selected.indexOf(t) !== -1; });
        entry.item.classList.toggle('lt-hidden', !hit);
        if (hit) shown++;
      });
      if (current.order) {
        var sorted = order.slice().sort(function (a, b) {
          if (a.date === b.date) return 0;
          if (!a.date) return 1;
          if (!b.date) return -1;
          return current.order === 'newest' ? (a.date < b.date ? 1 : -1) : (a.date > b.date ? 1 : -1);
        });
        sorted.forEach(function (entry) { list.appendChild(entry.item); });
      } else {
        order.forEach(function (entry) { list.appendChild(entry.item); });
      }
      if (result) {
        var filtered = selected.length > 0;
        result.hidden = !filtered;
        result.textContent = label('result', '{shown}/{total}')
          .replace('{shown}', String(shown))
          .replace('{total}', String(order.length));
      }
      if (empty) empty.hidden = shown !== 0;
    }

    if (tagNames.length > 1) {
      var tagWrap = document.createElement('div');
      tagWrap.className = 'lt-group';
      tagWrap.setAttribute('role', 'group');
      tagWrap.setAttribute('aria-label', label('tagsLabel', 'Filter by tag'));
      var allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'lt-chip is-active';
      allBtn.textContent = label('all', 'All');
      allBtn.addEventListener('click', function () {
        current.tags = [];
        tagButtons.forEach(function (b) { b.classList.toggle('is-active', b === allBtn); });
        apply();
      });
      tagButtons.push(allBtn);
      tagWrap.appendChild(allBtn);
      tagNames.forEach(function (name) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'lt-chip';
        chip.textContent = name;
        chip.addEventListener('click', function () {
          var at = current.tags.indexOf(name);
          if (at === -1) current.tags.push(name); else current.tags.splice(at, 1);
          chip.classList.toggle('is-active', at === -1);
          allBtn.classList.toggle('is-active', current.tags.length === 0);
          apply();
        });
        tagButtons.push(chip);
        tagWrap.appendChild(chip);
      });
      bar.appendChild(tagWrap);

      result = document.createElement('p');
      result.className = 'lt-result';
      result.hidden = true;
      bar.appendChild(result);

      empty = document.createElement('p');
      empty.className = 'lt-empty';
      empty.textContent = label('empty', 'No matching entries');
      empty.hidden = true;
      bar.appendChild(empty);
    }

    document.querySelectorAll('.lt-bar').forEach(function (node) {
      if (node.__ltApply === apply) node.remove();
    });
    bar.__ltApply = apply;

    /* 插在哪：卡片列表插在页头之后（不然会插到页头上方），其余插在列表前面 */
    var anchor = info.anchor ? list.querySelector(info.anchor) : null;
    if (anchor && anchor.parentNode) {
      anchor.parentNode.insertBefore(bar, anchor.nextSibling);
    } else {
      list.parentNode.insertBefore(bar, list);
    }
    return bar;
  }

  function init() {
    var found = false;
    LISTS.forEach(function (info) {
      document.querySelectorAll(info.container).forEach(function (list) {
        if (list.dataset.ltReady) return;
        var items = Array.prototype.slice.call(list.querySelectorAll(info.item));
        if (!items.length) return;
        list.dataset.ltReady = '1';
        buildBar(list, items, info);
        found = true;
      });
    });
    return found;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
