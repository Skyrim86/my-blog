// 收藏库（/collection/）的卡片墙：三排筛选 + 格子升级成按钮 + 点开三维弹层。
//
// 与其它脚本同一套接线：清单由模板经 `data-deck` 以 JSON 传进来（每张卡的图 URL、名字、系列、
// 工艺、**档位**、等级、等级中文名、主色、出处），文案走 data-*（JS 调不到 i18n）——
// 都在 `.deck-wall` 那个容器上，所以这支脚本不需要自己的 data-*。
//
// 十一条刻意的取舍：
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
//
//   8. **等级的显示口径是 rankWall，不是 rank**（2026-09-21 晚加）：隐藏档「奇迹」在显形前
//      借「收藏」的名字出现（清单里两个字段，理由写在 deck-manifest.html）。所以这里读数值一律
//      走 `field`（见 specOf/it[spec.field || spec.key]）—— `data-facet` 仍叫 `rank`，
//      对外契约不变；显形之后收 `deck:reveal` 事件，把那一格的名字行换回真名。
//
//   9. **键盘是网格漫游，不是 63 次 Tab**（2026-09-21 晚加）：roving tabindex —— 整面墙只有
//      一格在 tab 序列里，进墙之后用方向键走（← → 上下按当前列数算，Home/End 到首尾）。
//      列数**按几何现算**（数第一行有几格），不写死在 JS 里：网格是 auto-fill，列数随视口变，
//      写死的那个数在别的宽度上就是错的。分组视图下顺序按 `order` 走，见 navList()。
//
//   10. **筛选状态进 URL**（`?series=绫华&style=gold&rank=legend`，2026-09-21 晚加）：
//      筛完的墙能分享、能刷新。用 replaceState 而不是 pushState —— 每点一颗 chip 都塞一条历史，
//      后退键就废了。深链（`#deck-07`）同理，两者互不干扰（查询串管筛选、hash 管「打开哪一张」）。
//
//   11. **「随机翻一张」只从当前筛出来的那些里抽**（2026-09-21 晚加）：先筛「绫华的 · 玻璃」再
//      抽，抽出来的必然在眼前这批里 —— 否则那颗按钮与筛选条会互相打脸，抽到一张看不见的卡。
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

  // 清单里缺 rankWall / rankWallLabel 时的兜底：
  // 少了它们，隐藏档会以「奇迹」出现在墙上（旧清单 + 新脚本的混合态）。宁可退回显形前的口径。
  items.forEach(function (it) {
    if (!it.rankWall) it.rankWall = it.rank || 'collector';
    if (!it.rankWallLabel) it.rankWallLabel = it.rankLabel || it.rankWall;
  });

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

  // `field` = 这个维度**在清单里读哪个字段**（与 data-facet 用的 key 分开，见文件头第 8 条）。
  var FACETS = [
    { key: 'series', label: attr('bySeries') },
    { key: 'style', label: attr('byStyle'), group: 'styleTier', groups: TIER_ORDER },
    { key: 'rank', field: 'rankWall', label: attr('byRank'), order: RANK_ORDER },
  ];

  function valOf(it, spec) {
    return it[spec.field || spec.key];
  }

  // 某个取值属于哪一档（分组维度才用）。
  function tierOf(spec, value) {
    for (var n = 0; n < items.length; n++) {
      if (valOf(items[n], spec) === value) return items[n][spec.group] || '';
    }
    return '';
  }

  function facetValues(spec) {
    var counts = {};
    var keys = [];
    items.forEach(function (it) {
      var k = valOf(it, spec);
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

  // 工艺与等级显示中文名（清单里每条都带了 styleLabel / rankWallLabel），系列名本身就是中文。
  function nameOf(key, value) {
    if (key === 'style') return 'styleLabel';
    if (key === 'rank') return 'rankWallLabel';
    return null;
  }
  function displayName(spec, value) {
    var field = nameOf(spec.key, value);
    if (!field) return value;
    for (var n = 0; n < items.length; n++) {
      if (valOf(items[n], spec) === value) return items[n][field] || value;
    }
    return value;
  }

  // 某一档里都有哪些取值，**按筛选条里的显示顺序**（组内按张数从多到少）——
  // 与 chip 的实际顺序一致，整档选中/取消时不会与看到的对不上。
  function tierValues(spec, tier) {
    var out = [];
    items.forEach(function (it) {
      var v = valOf(it, spec);
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
  var grouped = false;   // 分组视图（按系列）是否开着

  // 一张卡是否通过筛选。`skipKey` 那一个维度跳过 —— 统计某颗 chip 上的数字时用（同排是 OR）。
  function matches(it, skipKey) {
    return facets.every(function (spec) {
      if (spec.key === skipKey) return true;
      var sel = state[spec.key];
      return !sel.length || sel.indexOf(valOf(it, spec)) >= 0;
    });
  }

  function countOf(spec, value) {
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (valOf(items[i], spec) === value && matches(items[i], spec.key)) n++;
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

  var rankBar = [];   // 等级那条比例条的分段（{value, seg}）；顺序 = chip 的顺序

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
        // 等级那颗 chip 借卡面自己的等级类：徽章的形状、大小、材质色**全部**从
        // `.home-card-rank--<档>` 那组令牌来（与卡面是同一份定义，不是另抄一套配色）。
        if (spec.key === 'rank') {
          b.className += ' deck-chip--rank home-card-rank--' + value;
          var badge = document.createElement('span');
          badge.className = 'deck-chip-mark';
          badge.setAttribute('aria-hidden', 'true');
          b.appendChild(badge);
        }
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

    // 等级那排末尾再挂一条**比例条**（纯装饰、aria-hidden）：六档各占多宽 = 当前筛出来那批里
    // 各档的张数。它是这页唯一的「稀有度有多稀有」的直观量 —— 文字那行只说得出档名。
    // 点击仍然只认 chip（不把比例条做成第二套控件：同一件事两个入口只会互相打架）。
    if (spec.key === 'rank') {
      var rbar = document.createElement('span');
      rbar.className = 'deck-rank-bar';
      rbar.setAttribute('aria-hidden', 'true');
      facetValues(spec).keys.forEach(function (value) {
        var seg = document.createElement('i');
        seg.className = 'home-card-rank--' + value;
        rbar.appendChild(seg);
        rankBar.push({ value: value, seg: seg });
      });
      row.appendChild(rbar);
    }

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
  var groupBtn = document.createElement('button');
  groupBtn.type = 'button';
  groupBtn.className = 'deck-group-toggle';
  groupBtn.textContent = attr('groupOn', '按系列分组');
  groupBtn.setAttribute('aria-pressed', 'false');
  result.appendChild(resultText);
  result.appendChild(clear);
  result.appendChild(groupBtn);

  // 抽卡按钮：角落那枚像素小人（图与文字都来自站点自己的导航图标语言）。
  // **没有 JS 时它不存在**（脚本注入）—— 与「按钮由脚本注入」同一条口径。
  var drawIcon = attr('drawIcon');
  var draw = document.createElement('button');
  draw.type = 'button';
  draw.className = 'deck-draw';
  draw.setAttribute('aria-label', attr('draw', '随机翻一张'));
  draw.title = attr('draw', '');
  if (drawIcon) {
    var di = document.createElement('img');
    di.src = drawIcon;
    di.width = 26;
    di.height = 26;
    di.alt = '';
    di.setAttribute('aria-hidden', 'true');
    draw.appendChild(di);
  }
  var drawText = document.createElement('span');
  drawText.textContent = attr('draw', '随机翻一张');
  draw.appendChild(drawText);
  result.appendChild(draw);

  var empty = document.createElement('p');
  empty.className = 'deck-empty';
  empty.textContent = attr('empty');
  empty.hidden = true;

  // 显形播报（奇迹在 3D 里转出来时）：`role="status"` 与结果行分开 —— 往同一个节点里写
  // 会把上一句话冲掉，而这两件事可能同时发生。
  var srStatus = document.createElement('span');
  srStatus.className = 'sr-only';
  srStatus.setAttribute('role', 'status');
  srStatus.setAttribute('aria-live', 'polite');

  /* ---------- 分组视图（按系列）----------
     63 张 21 行平铺、只有 5 个系列时，「我想看绫华那批」是一件很累的事。分组不给新数据，
     只是把顺序按系列排好、每组前面插一条小标题（标题是网格里的整行项）。
     实现走 CSS 的 `order` 而**不搬 DOM**：`data-i` 与清单下标的对应关系一个字都不动
     （搬 DOM 之后忘记同步下标，就是「点开花信看到雪舞」那类错），而 `<button>` 的
     tab 顺序仍是 DOM 顺序 —— 键盘漫游因此按**视觉顺序**走，见 navList()。 */
  var heads = [];
  var seriesSpec = specBy('series');

  function buildHeads() {
    if (!seriesSpec) return;
    var keys = facetValues(seriesSpec).keys;
    // 分组顺序 = 系列那排 chip 的顺序（张数从多到少），与筛选条的读法一致
    keys.forEach(function (value, gi) {
      var h = document.createElement('h3');
      h.className = 'deck-group-head';
      h.setAttribute('data-series', value);
      h.hidden = true;
      grid.appendChild(h);
      heads.push({ value: value, el: h, order: gi * 1000 });
    });
    // 分组的顺序键写在格子上：不分组时全部清掉（回到清单原序）
    if (!heads.length) groupBtn.hidden = true;
  }

  function applyGrouping() {
    groupBtn.textContent = grouped ? attr('groupOff', '改回平铺') : attr('groupOn', '按系列分组');
    groupBtn.setAttribute('aria-pressed', grouped ? 'true' : 'false');
    grid.classList.toggle('is-grouped', grouped);
    if (!grouped) {
      tiles.forEach(function (t) { t.style.order = ''; });
      heads.forEach(function (h) { h.hidden = true; });
      return;
    }
    heads.forEach(function (h, gi) {
      var n = 0;
      items.forEach(function (it, idx) {
        if (valOf(it, seriesSpec) !== h.value) return;
        n++;
        if (tiles[idx]) tiles[idx].style.order = String(gi * 1000 + n);
      });
      h.el.style.order = String(gi * 1000);
    });
  }

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

  // 当前**看得见**的格子，按视觉顺序（分组时是 order，平铺时是清单原序）。
  // 键盘漫游与「随机翻一张」都走它 —— 少一处口径，就少一次「抽到一张看不见的卡」。
  function navList() {
    return tiles
      .filter(function (t) { return !t.classList.contains('is-filtered'); })
      .sort(function (a, b) {
        var oa = parseInt(a.style.order, 10) || 0;
        var ob = parseInt(b.style.order, 10) || 0;
        if (oa !== ob) return oa - ob;
        return tileIndex(a) - tileIndex(b);
      });
  }
  function tileIndex(t) { return parseInt(t.getAttribute('data-i'), 10) || 0; }

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

    // 比例条：宽度按**当前**张数（其它排一改，这条也跟着改 —— 它说的是「眼下这批」的构成）
    rankBar.forEach(function (r) {
      var n = countOf(specBy('rank'), r.value);
      r.seg.style.flexGrow = String(n);
      r.seg.classList.toggle('is-zero', n === 0);
    });

    // 分组标题：那一组当前还剩几张（全被筛掉时标题也不该留着）
    if (grouped && seriesSpec) {
      heads.forEach(function (h) {
        var n = 0;
        items.forEach(function (it, idx) {
          if (valOf(it, seriesSpec) === h.value && tiles[idx] && !tiles[idx].classList.contains('is-filtered')) n++;
        });
        h.el.textContent = attr('groupHead', '{series} · {n} 张')
          .replace('{series}', h.value).replace('{n}', String(n));
        h.el.hidden = n === 0;
      });
    }

    resultText.textContent = summary(shown);
    clear.hidden = !facets.some(function (spec) { return selectFacet(spec).length; });
    empty.hidden = shown > 0;
    draw.disabled = shown === 0;
    syncURL();
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

  groupBtn.addEventListener('click', function () {
    grouped = !grouped;
    applyGrouping();
    apply();
  });

  wall.insertBefore(srStatus, grid);
  wall.insertBefore(empty, grid);
  wall.insertBefore(result, empty);
  wall.insertBefore(bar, result);

  /* ---------- 筛选状态 ↔ 地址栏 ----------
     格式：`?series=绫华,艾米莉亚&style=gold&rank=legend&group=series`（多选用逗号）。
     值一律用**清单里的原值**（不是中文显示名）：URL 与清单同一套词汇，改显示名不会改地址。
     自己解析而不用 URLSearchParams：这一支脚本与全站其它脚本一样只依赖最老的 DOM API，
     而且多值那种写法（逗号分隔）本来就要自己拆。 */
  var inited = false;

  function encodeState() {
    var parts = [];
    facets.forEach(function (spec) {
      var sel = selectFacet(spec);
      if (!sel.length) return;
      parts.push(spec.key + '=' + sel.map(encodeURIComponent).join(','));
    });
    if (grouped && seriesSpec) parts.push('group=series');
    return parts.length ? '?' + parts.join('&') : '';
  }

  function syncURL() {
    if (!inited || !window.history || !history.replaceState) return;
    try {
      // hash 要原样留着：它是「现在打开着哪一张卡」（home-deck.js 写的），与筛选是两回事
      history.replaceState(null, '', location.pathname + encodeState() + location.hash);
    } catch (e) { /* 改不了地址不影响筛选本身 */ }
  }

  function readURL() {
    var qs = location.search.replace(/^\?/, '');
    if (!qs) return;
    qs.split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq < 0) return;
      var key = pair.slice(0, eq);
      var raw = pair.slice(eq + 1);
      if (key === 'group') { grouped = raw === 'series'; return; }
      var spec = specBy(key);
      if (!spec) return;
      var known = facetValues(spec).keys;
      var vals = raw.split(',').map(function (v) {
        try { return decodeURIComponent(v); } catch (e) { return v; }
      }).filter(function (v) { return known.indexOf(v) >= 0; });   // 地址里带了不认识的项 = 忽略
      if (vals.length) state[spec.key] = vals;
    });
  }

  /* ---------- 格子：<div> → <button>（没有 JS 时不存在这一步） ---------- */

  var upgraded = false;
  var openFromHash = null;   // 由下面的 if 块赋值（严格模式下块里的函数声明外面看不见，所以走 var）

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
      // 等级用 `rankWallLabel`（显形前的隐藏档报「收藏」，见文件头第 8 条）。
      var meta = [it.series, it.rankWallLabel].filter(Boolean).join(' · ');
      var name = openTpl.replace('{label}', it.label || '');
      b.setAttribute('aria-label', meta ? name + '（' + meta + '）' : name);
      b.setAttribute('title', it.label || '');
      while (tile.firstChild) b.appendChild(tile.firstChild);
      tile.parentNode.replaceChild(b, tile);
      return b;
    });
    upgraded = true;

    grid.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('.deck-tile') : null;
      if (!btn || !grid.contains(btn)) return;
      // opener 传这一格：弹层关掉时焦点回到它（home-deck.js 的 lastOpener 机制）
      window.homeDeck.openAt(parseInt(btn.getAttribute('data-i'), 10), btn);
    });

    /* ---------- 意图预取：指针/键盘焦点停在某一格上 200 ms，就先把这一张的 xl + 深度图取回来 ----------
       这一页的卡片墙自己只带 272/412/544（`sizes` 206px），而点开弹层要的是 xl（760）+ 深度图，
       合计约 64 KB —— 原来一张都不预取（2026-09-22 之前的注释写着「他可能一张都不点开」，那是对的：
       一进页面就为 63 张卡各下 64 KB 是灾难）。悬停**加 200 ms 停留**才取，是这两者之间的中点：
       指针扫过不算意图，停住了才算。键盘用户在 focusin 上走同一条路。 */
    var intentTimer = null;
    function warmTile(el) {
      var idx = parseInt(el.getAttribute('data-i'), 10);
      if (!window.homeDeck || !window.homeDeck.prefetchAt || isNaN(idx)) return;
      // 只取**停住的这一张**（xl + 深度图，约 64 KB）：他还没点，多取一张就是白下。
      // 后面那几张由弹层自己管 —— 打开时会按「这一张先、后两张随后」的顺序补上（见 home-deck.js）。
      window.homeDeck.prefetchAt(idx, 1, true);
    }
    function armTile(e) {
      var el = e.target && e.target.closest ? e.target.closest('.deck-tile') : null;
      if (!el || !grid.contains(el)) return;
      if (intentTimer) window.clearTimeout(intentTimer);
      intentTimer = window.setTimeout(function () { intentTimer = null; warmTile(el); }, 200);
    }
    grid.addEventListener('pointerover', armTile);
    grid.addEventListener('focusin', armTile);
    grid.addEventListener('pointerleave', function () {
      if (intentTimer) { window.clearTimeout(intentTimer); intentTimer = null; }
    });

    /* ---------- 键盘：网格漫游（roving tabindex）----------
       整面墙只有一格在 tab 序列里（进墙一次 Tab），进来之后用方向键走。不这么做的话
       63 张卡就是 63 次 Tab —— 本站别的列表都没有这么长。 */
    function setTabStop(tile) {
      tiles.forEach(function (t) { t.tabIndex = t === tile ? 0 : -1; });
    }

    function columns() {
      var vis = navList();
      if (!vis.length) return 1;
      var top = vis[0].getBoundingClientRect().top;
      var n = 1;
      for (var i = 1; i < vis.length; i++) {
        if (Math.abs(vis[i].getBoundingClientRect().top - top) < 2) n++;
        else break;      // 第一行结束：这个数就是当前列数（auto-fill 随视口变，不能写死）
      }
      return n;
    }

    grid.addEventListener('keydown', function (e) {
      var tile = e.target && e.target.closest ? e.target.closest('.deck-tile') : null;
      if (!tile || !grid.contains(tile)) return;
      var vis = navList();
      var at = vis.indexOf(tile);
      if (at < 0) return;
      var to = -1;
      switch (e.key) {
        case 'ArrowRight': to = at + 1; break;
        case 'ArrowLeft': to = at - 1; break;
        case 'ArrowDown': to = at + columns(); break;
        case 'ArrowUp': to = at - columns(); break;
        case 'Home': to = 0; break;
        case 'End': to = vis.length - 1; break;
        default: return;
      }
      if (to < 0 || to >= vis.length || to === at) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      setTabStop(vis[to]);
      vis[to].focus();
    });

    // 指针点过之后，那个格子成为新的 tab 落点（roving tabindex 的常规做法：
    // 键盘用户从「上次看到的地方」继续，而不是每次都从第一格重来）。
    grid.addEventListener('focusin', function (e) {
      var tile = e.target && e.target.closest ? e.target.closest('.deck-tile') : null;
      if (tile && grid.contains(tile)) setTabStop(tile);
    });

    // 抽卡：从**当前看得见的**那些里随机开一张（文件头第 11 条）
    draw.addEventListener('click', function () {
      var vis = navList();
      if (!vis.length) return;
      var pick = vis[Math.floor(Math.random() * vis.length)];
      window.homeDeck.openAt(tileIndex(pick), pick);
    });

    /* ---------- 深链：/collection/#deck-07 直接开那一张 ----------
       序号口径与格子上的 `#07`、弹层里的 `07 / 63` 一致（清单顺序，1 起）。
       打开的时机在 apply() 之后（格子已就位、弹层才能量到画布尺寸）。
       写成 var 赋值的函数表达式而不是函数声明：这一段在 if 块里，而**严格模式下的块级函数声明
       只活在那个块里**，外面那句 `if (upgraded) openFromHash()` 会拿到一个未定义的名字。 */
    openFromHash = function () {
      var m = /^#deck-(\d{1,3})$/.exec(location.hash || '');
      if (!m) return;
      var idx = parseInt(m[1], 10) - 1;
      if (!(idx >= 0 && idx < items.length)) return;
      if (tiles[idx] && tiles[idx].classList.contains('is-filtered')) return;  // 筛掉了就不开
      window.homeDeck.openAt(idx, tiles[idx] || null);
    }

    /* ---------- 奇迹显形：把那一格的名字行换回真名 ----------
       显形只发生在 card-3d.js 的闭包里，它广播 `deck:reveal`（见那里的注释）。
       筛选项**不动**：隐藏档不进筛选条是这一页刻意的口径（deck-manifest.html 里写着），
       这里只更新那一格自己 —— 而且它就是「你找到了什么」的回报。 */
    document.addEventListener('deck:reveal', function (e) {
      var d = (e && e.detail) || {};
      items.forEach(function (it, n) {
        if (it.rank !== 'miracle') return;
        var tile = tiles[n];
        if (!tile) return;
        var meta = tile.querySelector('.deck-tile-meta');
        if (meta) meta.textContent = [it.series, it.rankLabel].filter(Boolean).join(' · ');
        tile.classList.add('is-revealed');
        srStatus.textContent = attr('reveal', '{label}：{rank}')
          .replace('{label}', it.label || d.label || '')
          .replace('{rank}', it.rankLabel || '');
      });
    });
  }

  // 指针与悬停的「可点」暗示挂在 html 上（同 nav-toggle.js 的 has-nav-toggle）：
  // 没有走到 Upgrade 那一步时不会出现「看着能点、点了没反应」。
  if (window.homeDeck) document.documentElement.classList.add('has-deck-wall');

  if (seriesSpec) buildHeads();
  else groupBtn.hidden = true;
  readURL();
  applyGrouping();
  // 第一格进 tab 序列 —— roving tabindex 的起点。**不是「第一格可见的」**：筛选会变，
  // 落点跟着变会让「进墙后第一个方向键从哪里开始」不可预测；固定第一格，方向键再走到想去的地方。
  if (upgraded) tiles.forEach(function (t, n) { t.tabIndex = n === 0 ? 0 : -1; });
  apply();
  inited = true;
  syncURL();
  if (openFromHash) openFromHash();
})();
