// 收藏库（/collection/）的卡片墙：三排筛选 + 格子升级成按钮 + 点开三维弹层。
//
// 与其它脚本同一套接线：清单由模板经 `data-deck` 以 JSON 传进来（每张卡的图 URL、名字、系列、
// 工艺、**档位**、等级、等级中文名），文案走 data-*（JS 调不到 i18n）—— 都在 `.deck-wall` 那个
// 容器上，所以这支脚本不需要自己的 data-*。
//
// 七条刻意的取舍：
//
//   1. **筛选项是现算的**，模板里不写三排按钮：清单里已经有 series / style / styleTier /
//      rankLabel，数一遍就有了 —— 加一张新系列的卡，筛选条自己多一项，不必回头改模板、也不会
//      出现「筛选条里挂了零张的项」（写死的清单会）。
//
//   2. **没有 JS 时不留点不动的控件**：格子由模板渲染成 <div>（静态卡册：63 张卡与名字都在），
//      这里才把它们换成 <button> 并插筛选条 —— 与首页卡片组「按钮由脚本注入」同一条口径。
//      换不成按钮的两种情况（卡片墙脚本先跑、或 home-deck.js 没加载）下**只插筛选条**：
//      筛还是能筛，只是点不开弹层（见下面 upgrade 的判据）。
//
//   3. **过滤用类名不用 [hidden]**：网格是 display:grid，[hidden] 的 display:none 会被它压过去
//      （踩过，见 16-list-tools.js 的注释与 docs/traps.md）。
//
//   4. **同一排之内是 OR、排与排之间是 AND**（2026-09-21 由「每排单选」改成多选）：三个维度
//      一起收窄才有用（「绫华的 · 玻璃或冰裂 · 秘藏以上」），而同一排里只允许选一项在本页是
//      真不够用 —— 系列那排 5 项、工艺 12 项，想比较「绫华那批和艾米莉亚那批」得来回点两次，
//      没法一起看。代价是多一层状态（一排里可以同时亮着几颗），取消的方式就是**再点一次那颗
//      chip**（选中的 chip 永远可点，见 apply 里那条不变量）。
//
//   5. **工艺那 12 项按普通/进阶分两组**，分组键是清单里的 `styleTier`（哪一种是哪一档的
//      **唯一事实源**在 layouts/_partials/deck-manifest.html 的 $styleTier 表，这里只是读它）。
//      档位是**分类口径**、不驱动卡面（边框归等级，见 21-card-deck.css 的「边框」一节）。
//      组标签本身是颗按钮：按一下把这一档**当前够得着的**工艺一次选中 / 取消 —— 十二项挨个点
//      太费事，而「够不着」的那些（在其它两排的当前组合下是 0 张）本来就置灰点不动。
//
//   6. **计数是实时的，0 张的项置灰点不动**：每颗 chip 上的数字按**其它两排**的当前选择重算
//      （不算自己这一排 —— 同排是 OR，自己这排的选择不会把自己排除掉），所以选了「绫华」之后
//      工艺那些数跟着变小；0 张的项直接 disabled，点不出空网格。两个副产品：
//        · 原本排头那颗「全部 63」撤掉了（它说的信息结果行已经写了），三排各少一颗噪声 chip；
//        · `deck-empty` 那句提示几乎成了兜底 —— 每次选择都是往 OR 里「加」一项，结果只会变多，
//          唯一能造出空结果的路径不存在（要留一个会把结果收窄的维度才会，见 i18n 那条注释）。
//
//   7. **不动焦点**：筛完焦点留在那颗 chip 上，接着按 Tab 会走到剩下的卡上；结果张数写进一个
//      role="status" 的节点播报（读屏用户看不到网格变短了）。置灰的 chip 用原生 disabled，
//      因此**退出 tab 序列**（键盘用户不会一路撞过 9 颗点不动的项）—— 这要求「可点的 chip 不会
//      因为自己这一下变成 disabled」，那条不变量在 apply 里写着。
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

  /* ---------- 筛选项：从清单现算 ---------- */

  // 等级按**稀有度**排（收藏 → 珍稀 → 史诗 → 秘藏 → 传世 → 奇迹）：这是它们的本义顺序，
  // 与张数多少无关。系列与工艺按张数从多到少 —— 找卡时的实际用法（「绫华那批里挑一张」）
  // 就是从大的开始。
  // 六档与 i18n 的 deckRank*、card-3d.js 的 RANK_3D、check-deck.mjs 的 RANKS 是同一份清单 ——
  // 少写一档的表现是那一档在筛选条里**排到最后**（顺序表里查不到就按首次出现排），页面上不报
  // 任何错，只能靠人看出顺序不对。
  var RANK_ORDER = ['collector', 'rare', 'epic', 'arcane', 'legend', 'miracle'];

  // 工艺两档的代码名与**呈现顺序**（组标签的中文名走 data-*）。这两个键必须与
  // deck-manifest.html 的 $styleTier 表对得上 —— 对不上时分组整片塌成一组（所有工艺挤进
  // 「查不到档位」那一组、且没有标签），页面上不报错，所以 check-deck.mjs 有一条守卫核它。
  var TIER_ORDER = ['basic', 'advanced'];
  var TIER_NAME = {
    basic: attr('tierBasic', '普通'),
    advanced: attr('tierAdvanced', '进阶'),
  };

  var FACETS = [
    { key: 'series', label: attr('bySeries') },
    { key: 'style', label: attr('byStyle'), group: 'styleTier', groups: TIER_ORDER },
    { key: 'rank', label: attr('byRank'), order: RANK_ORDER },
  ];

  // 某个取值属于哪一档（分组维度才用）。
  function tierOf(spec, value) {
    for (var n = 0; n < items.length; n++) {
      if (items[n][spec.key] === value) return items[n][spec.group] || '';
    }
    return '';
  }

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
      if (spec.group) {
        // 档位表里查不到的（清单漏写 styleTier）排到**最后**，而不是混进第一组 —— 漏项要看得见
        var ga = spec.groups.indexOf(tierOf(spec, a));
        var gb = spec.groups.indexOf(tierOf(spec, b));
        if (ga < 0) ga = spec.groups.length;
        if (gb < 0) gb = spec.groups.length;
        if (ga !== gb) return ga - gb;
      }
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

  // 某一档里都有哪些取值，**按筛选条里的显示顺序**（组内按张数从多到少）——
  // 与 chip 的实际顺序一致，整档选中/取消时不会与看到的对不上。
  function tierValues(spec, tier) {
    var out = [];
    items.forEach(function (it) {
      var v = it[spec.key];
      if (v && tierOf(spec, v) === tier && out.indexOf(v) < 0) out.push(v);
    });
    var order = facetValues(spec).keys;
    return out.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  }

  /* ---------- 状态与判定 ---------- */

  var state = {};    // 每个维度一个**数组**（多选）：state.series = ['绫华', '艾米莉亚']
  var facets = [];   // 真正渲染出来的维度（只有一种取值的那一排不渲染）
  var chips = [];    // {spec, value, btn, count}
  var tiers = [];    // {spec, tier, btn}

  // 一张卡是否通过筛选。`skipKey` 那一个维度跳过 —— 统计某颗 chip 上的数字时用（同排是 OR）。
  function matches(it, skipKey) {
    return facets.every(function (spec) {
      if (spec.key === skipKey) return true;
      var sel = state[spec.key];
      return !sel.length || sel.indexOf(it[spec.key]) >= 0;
    });
  }

  function countOf(spec, value) {
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (items[i][spec.key] === value && matches(items[i], spec.key)) n++;
    }
    return n;
  }

  function selectFacet(spec) { return state[spec.key]; }

  function toggle(spec, value) {
    var sel = selectFacet(spec);
    var n = sel.indexOf(value);
    if (n >= 0) sel.splice(n, 1);
    else sel.push(value);
  }

  // 组标签：整档选中 / 整档取消。**只收「够得着的」**（在其它两排的当前组合下张数 > 0，
  // 或者本来就选着）—— 否则会一次点亮几颗 0 张的 chip，看着像坏了。
  function toggleTier(spec, tier) {
    var sel = selectFacet(spec);
    var vals = tierValues(spec, tier);
    var reach = vals.filter(function (v) {
      return sel.indexOf(v) >= 0 || countOf(spec, v) > 0;
    });
    var all = reach.length > 0 && reach.every(function (v) { return sel.indexOf(v) >= 0; });
    if (all) {
      state[spec.key] = sel.filter(function (v) { return vals.indexOf(v) < 0; });
    } else {
      reach.forEach(function (v) { if (sel.indexOf(v) < 0) sel.push(v); });
    }
  }

  function specBy(key) {
    return facets.filter(function (spec) { return spec.key === key; })[0];
  }

  /* ---------- 界面 ---------- */

  var bar = document.createElement('div');
  bar.className = 'deck-filters';
  bar.setAttribute('role', 'group');
  bar.setAttribute('aria-label', attr('filterLabel'));

  FACETS.forEach(function (spec) {
    var values = facetValues(spec);
    if (values.keys.length < 2) return;      // 只有一种取值时这一排没有意义（全选 = 不筛）
    state[spec.key] = [];
    facets.push(spec);

    var row = document.createElement('div');
    row.className = 'deck-filter-row';
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', spec.label);

    var caption = document.createElement('span');
    caption.className = 'deck-filter-name';
    caption.textContent = spec.label;
    row.appendChild(caption);

    // 分组的维度（工艺）先把取值按档位切成几组，每组一个可点的组标签 + 一串 chip；
    // 不分组的维度就是一个没有标签的组 —— 两种走下面同一段渲染，不必写两遍。
    var groups = [{ key: '', label: '', values: values.keys }];
    if (spec.group) {
      groups = spec.groups.map(function (tier) {
        return { key: tier, label: TIER_NAME[tier] || tier, values: [] };
      });
      groups.push({ key: '', label: '', values: [] });   // 档位表里查不到的落这里（清单漏写时）
      values.keys.forEach(function (v) {
        var at = spec.groups.indexOf(tierOf(spec, v));
        groups[at < 0 ? groups.length - 1 : at].values.push(v);
      });
    }

    var host = row;
    if (spec.group) {
      host = document.createElement('div');
      host.className = 'deck-filter-groups';
      row.appendChild(host);
    }

    groups.forEach(function (g) {
      if (!g.values.length) return;            // 空档不渲染（含「查不到档位」那一组）
      var box = document.createElement('div');
      box.className = 'deck-filter-group';
      if (g.label) {
        // 组标签是**控件**（整档选中/取消），所以它同时是这一组的 aria-label ——
        // 读屏用户听到的是「普通, 分组」+「普通工艺：选中或取消这一档工艺, 切换按钮」。
        box.setAttribute('role', 'group');
        box.setAttribute('aria-label', g.label);
        var t = document.createElement('button');
        t.type = 'button';
        t.className = 'deck-filter-tier';
        t.setAttribute('data-facet', spec.key);
        t.setAttribute('data-tier', g.key);
        t.setAttribute('aria-pressed', 'false');
        t.setAttribute('aria-label', attr('tierHint', '{tier}').replace('{tier}', g.label));
        t.textContent = g.label;
        box.appendChild(t);
        tiers.push({ spec: spec, tier: g.key, btn: t });
      }
      g.values.forEach(function (value) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'deck-chip';
        b.setAttribute('data-facet', spec.key);
        b.setAttribute('data-value', value);
        b.setAttribute('aria-pressed', 'false');
        b.appendChild(document.createTextNode(displayName(spec, value)));
        var c = document.createElement('span');
        c.className = 'deck-chip-count';
        b.appendChild(c);
        box.appendChild(b);
        chips.push({ spec: spec, value: value, btn: b, count: c });
      });
      host.appendChild(box);
    });

    bar.appendChild(row);
  });

  // 结果行：张数走 role="status" 播报（读屏用户看不到网格变短了），「清空筛选」是颗按钮 ——
  // 它只在真有选中项时出现，所以**不能**把张数写在这一层的 textContent 上（会连按钮一起抹掉）。
  var result = document.createElement('p');
  result.className = 'deck-result';
  var resultText = document.createElement('span');
  resultText.setAttribute('role', 'status');
  resultText.setAttribute('aria-live', 'polite');
  var clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'deck-clear';
  clear.textContent = attr('clear', '清空筛选');
  clear.hidden = true;
  result.appendChild(resultText);
  result.appendChild(clear);

  var empty = document.createElement('p');
  empty.className = 'deck-empty';
  empty.textContent = attr('empty');
  empty.hidden = true;

  // 「共 12 张（艾米莉亚 · 金边+玻璃 · 传世）」：把当前选中的项按维度顺序摊开，
  // 同一个维度内用 +（OR）、维度之间用 ·（AND）—— 与筛选的语义同一个读法。
  function summary(shown) {
    var parts = [];
    facets.forEach(function (spec) {
      var sel = selectFacet(spec);
      if (!sel.length) return;
      parts.push(sel.map(function (v) { return displayName(spec, v); }).join('+'));
    });
    var text = attr('count', '共 {n} 张').replace('{n}', String(shown));
    return parts.length ? text + '（' + parts.join(' · ') + '）' : text;
  }

  function apply() {
    var shown = 0;
    tiles.forEach(function (tile) {
      var ok = matches(itemOf(tile));
      tile.classList.toggle('is-filtered', !ok);
      if (ok) shown++;
    });

    chips.forEach(function (c) {
      var n = countOf(c.spec, c.value);
      var on = selectFacet(c.spec).indexOf(c.value) >= 0;
      c.count.textContent = n;
      c.btn.classList.toggle('is-active', on);
      c.btn.classList.toggle('is-empty', !on && n === 0);
      c.btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      // 0 张且没选中的项点不动（点下去只有空网格）。**选中的那颗永远可点** —— 取消要靠它 ——
      // 而且它不可能是 0 张：结果集本来就含它（countOf 的口径里跳过了它自己那一排）。
      // 这条不变量顺带免掉了焦点处理：可点的 chip 不会因为「自己这一下」变成 disabled，
      // 所以按下去之后焦点不会掉到 body 上，也就不需要在 apply 末尾把焦点接回来。
      c.btn.disabled = !on && n === 0;
    });

    // 组标签的两态：这一档「够得着的」全都选着 = 按下（再按一下就是整档取消）。
    tiers.forEach(function (t) {
      var sel = selectFacet(t.spec);
      var reach = tierValues(t.spec, t.tier).filter(function (v) {
        return sel.indexOf(v) >= 0 || countOf(t.spec, v) > 0;
      });
      var all = reach.length > 0 && reach.every(function (v) { return sel.indexOf(v) >= 0; });
      t.btn.classList.toggle('is-active', all);
      t.btn.setAttribute('aria-pressed', all ? 'true' : 'false');
      t.btn.disabled = reach.length === 0;
    });

    resultText.textContent = summary(shown);
    clear.hidden = !facets.some(function (spec) { return selectFacet(spec).length; });
    empty.hidden = shown > 0;
  }

  bar.addEventListener('click', function (e) {
    var el = e.target;
    if (!el || !el.closest) return;
    // 置灰的 chips / 组标签自己拒绝：真实的指针与键盘事件根本到不了这里（disabled 的表单控件
    // 不派发 click），但**合成事件**（dispatchEvent）会绕过那一层 —— 与其靠浏览器那一层，
    // 不如在这里明写一句，置灰的语义才是这一支脚本自己保证的。
    var tierBtn = el.closest('.deck-filter-tier');
    if (tierBtn && bar.contains(tierBtn)) {
      if (tierBtn.disabled) return;
      var tSpec = specBy(tierBtn.getAttribute('data-facet'));
      if (tSpec) toggleTier(tSpec, tierBtn.getAttribute('data-tier'));
      apply();
      return;
    }
    var chip = el.closest('.deck-chip');
    if (!chip || !bar.contains(chip) || chip.disabled) return;
    var spec = specBy(chip.getAttribute('data-facet'));
    if (spec) toggle(spec, chip.getAttribute('data-value') || '');
    apply();
  });

  clear.addEventListener('click', function () {
    facets.forEach(function (spec) { state[spec.key] = []; });
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
