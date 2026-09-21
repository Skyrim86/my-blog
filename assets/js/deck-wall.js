// 收藏库（/collection/）的卡片墙：三排筛选 + 格子升级成按钮 + 点开三维弹层。
//
// 与其它脚本同一套接线：清单由模板经 `data-deck` 以 JSON 传进来（每张卡的图 URL、名字、系列、
// 工艺、等级、等级中文名），文案走 data-*（JS 调不到 i18n）—— 都在 `.deck-wall` 那个容器上，
// 所以这支脚本不需要自己的 data-*。
//
// 五条刻意的取舍：
//
//   1. **筛选项是现算的**，模板里不写三排按钮：清单里已经有 series / styleLabel / rankLabel，
//      数一遍就有了 —— 加一张新系列的卡，筛选条自己多一项，不必回头改模板、也不会出现
//      「筛选条里挂了零张的项」（写死的清单会）。
//
//   2. **没有 JS 时不留点不动的控件**：格子由模板渲染成 <div>（静态卡册：63 张卡与名字都在），
//      这里才把它们换成 <button> 并插筛选条 —— 与首页卡片组「按钮由脚本注入」同一条口径。
//      换不成按钮的两种情况（卡片墙脚本先跑、或 home-deck.js 没加载）下**只插筛选条**：
//      筛还是能筛，只是点不开弹层（见下面 upgrade 的判据）。
//
//   3. **过滤用类名不用 [hidden]**：网格是 display:grid，[hidden] 的 display:none 会被它压过去
//      （踩过，见 16-list-tools.js 的注释与 docs/traps.md）。
//
//   4. **三排之间是 AND，每排内部单选**：三个维度一起收窄才有用（「绫华的 · 玻璃 · 传世」）；
//      同一排里选两项（绫华 OR 艾米莉亚）在本页的用途（找一张卡）里不值得多一套状态。
//
//   5. **不动焦点**：筛完焦点留在那颗 chip 上，接着按 Tab 会走到剩下的卡上；结果张数写进一个
//      role="status" 的节点播报（读屏用户看不到网格变短了）。
(function () {
  'use strict';

  var wall = document.querySelector('.deck-wall');
  if (!wall) return;
  var grid = wall.querySelector('.deck-wall-grid');
  if (!grid) return;

  var items;
  try {
    items = JSON.parse(wall.dataset.deck || '[]');
  } catch (e) {
    return;
  }
  if (!items.length) return;

  var tiles = Array.prototype.slice.call(grid.querySelectorAll('.deck-tile'));
  // 格子数必须与清单一一对应：不对应说明模板与清单脱节了，这时**什么都不做**（静态卡册还能看），
  // 而不是按位置硬配 —— 配错了就是「点开木刀看到墨羽」，而那种错没人会立刻发现。
  if (tiles.length !== items.length) {
    console.warn('[deck-wall] 格子数（' + tiles.length + '）与清单（' + items.length + '）不一致，筛选与弹层都不挂');
    return;
  }

  function attr(key, fallback) {
    return wall.dataset[key] || fallback || '';
  }
  function itemOf(tile) {
    return items[parseInt(tile.getAttribute('data-i'), 10)] || {};
  }

  /* ---------- 三排筛选项：从清单现算 ---------- */

  // 等级按**稀有度**排（收藏 → 史诗 → 传世 → 奇迹）：这是它们的本义顺序，与张数多少无关。
  // 系列与工艺按张数从多到少 —— 找卡时的实际用法（「绫华那批里挑一张」）就是从大的开始。
  var RANK_ORDER = ['collector', 'epic', 'legend', 'miracle'];
  var FACETS = [
    { key: 'series', label: attr('bySeries') },
    { key: 'style', label: attr('byStyle') },
    { key: 'rank', label: attr('byRank'), order: RANK_ORDER },
  ];

  function facetValues(spec) {
    var counts = {};
    var keys = [];
    items.forEach(function (it) {
      var k = it[spec.key];
      if (!k) return;
      if (!(k in counts)) {
        counts[k] = 0;
        keys.push(k);
      }
      counts[k]++;
    });
    var first = {};
    keys.forEach(function (k, n) { first[k] = n; });
    keys.sort(function (a, b) {
      if (spec.order) return spec.order.indexOf(a) - spec.order.indexOf(b);
      return counts[b] - counts[a] || first[a] - first[b];
    });
    return { keys: keys, counts: counts };
  }

  // 工艺与等级显示中文名（清单里每条都带了 styleLabel / rankLabel），系列名本身就是中文。
  function nameOf(key, value) {
    if (key === 'style') return 'styleLabel';
    if (key === 'rank') return 'rankLabel';
    return null;
  }
  function displayName(spec, value) {
    var field = nameOf(spec.key, value);
    if (!field) return value;
    for (var n = 0; n < items.length; n++) {
      if (items[n][spec.key] === value) return items[n][field] || value;
    }
    return value;
  }

  /* ---------- 界面 ---------- */

  var bar = document.createElement('div');
  bar.className = 'deck-filters';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', attr('filterLabel'));

  var state = {};
  var chipRows = [];

  FACETS.forEach(function (spec) {
    var values = facetValues(spec);
    if (values.keys.length < 2) return;      // 只有一种取值时这一排没有意义（全选 = 不筛）
    state[spec.key] = '';

    var row = document.createElement('div');
    row.className = 'deck-filter-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', spec.label);

    var caption = document.createElement('span');
    caption.className = 'deck-filter-name';
    caption.textContent = spec.label;
    row.appendChild(caption);

    var chips = [''].concat(values.keys);     // 第一颗是「全部」
    chips.forEach(function (value) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'deck-chip' + (value === '' ? ' is-active' : '');
      b.setAttribute('data-facet', spec.key);
      b.setAttribute('data-value', value);
      b.setAttribute('aria-pressed', value === '' ? 'true' : 'false');
      b.appendChild(document.createTextNode(value === '' ? attr('all', '全部') : displayName(spec, value)));
      var c = document.createElement('span');
      c.className = 'deck-chip-count';
      c.textContent = value === '' ? items.length : values.counts[value];
      b.appendChild(c);
      row.appendChild(b);
    });

    chipRows.push(row);
    bar.appendChild(row);
  });

  var result = document.createElement('p');
  result.className = 'deck-result';
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');

  var empty = document.createElement('p');
  empty.className = 'deck-empty';
  empty.textContent = attr('empty');
  empty.hidden = true;

  function apply() {
    var shown = 0;
    tiles.forEach(function (tile) {
      var it = itemOf(tile);
      var ok = Object.keys(state).every(function (k) {
        return !state[k] || it[k] === state[k];
      });
      tile.classList.toggle('is-filtered', !ok);
      if (ok) shown++;
    });
    result.textContent = attr('count', '共 {n} 张').replace('{n}', String(shown));
    empty.hidden = shown > 0;
  }

  bar.addEventListener('click', function (e) {
    var chip = e.target && e.target.closest ? e.target.closest('.deck-chip') : null;
    if (!chip || !bar.contains(chip)) return;
    var facet = chip.getAttribute('data-facet');
    var value = chip.getAttribute('data-value') || '';
    state[facet] = value;
    // 一排之内只有一颗选中：按下别的就换过去（再按一次「全部」等于取消这一维）
    bar.querySelectorAll('.deck-chip[data-facet="' + facet + '"]').forEach(function (other) {
      var on = (other.getAttribute('data-value') || '') === value;
      other.classList.toggle('is-active', on);
      other.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    apply();
  });

  wall.insertBefore(empty, grid);
  wall.insertBefore(result, empty);
  wall.insertBefore(bar, result);

  /* ---------- 格子：<div> → <button>（没有 JS 时不存在这一步） ---------- */

  // 弹层是 home-deck.js 提供的（它同时是首页那支）。它没加载时**不升级**：
  // 一个按下去没反应的按钮比一张普通的卡更糟（与「按钮由脚本注入」同一条理由）。
  if (window.homeDeck && typeof window.homeDeck.openAt === 'function') {
    var openTpl = attr('open', '{label}');
    tiles = tiles.map(function (tile) {
      var i = parseInt(tile.getAttribute('data-i'), 10);
      var it = items[i];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'deck-tile';
      b.setAttribute('data-i', String(i));
      // 按钮名把「谁」与「点开会怎样」都说全：读屏用户听到的不是一串没有主语的「按钮」。
      var meta = [it.series, it.rankLabel].filter(Boolean).join(' · ');
      var name = openTpl.replace('{label}', it.label || '');
      b.setAttribute('aria-label', meta ? name + '（' + meta + '）' : name);
      b.setAttribute('title', it.label || '');
      while (tile.firstChild) b.appendChild(tile.firstChild);
      tile.parentNode.replaceChild(b, tile);
      return b;
    });

    grid.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.deck-tile') : null;
      if (!btn || !grid.contains(btn)) return;
      // opener 传这一格：弹层关掉时焦点回到它（home-deck.js 的 lastOpener 机制）
      window.homeDeck.openAt(parseInt(btn.getAttribute('data-i'), 10), btn);
    });
  }

  // 指针与悬停的「可点」暗示挂在 html 上（同 nav-toggle.js 的 has-nav-toggle）：
  // 没有走到 Upgrade 那一步时不会出现「看着能点、点了没反应」。
  if (window.homeDeck) document.documentElement.classList.add('has-deck-wall');

  apply();
})();
