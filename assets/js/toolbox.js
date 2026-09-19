/* ============================================
   数学工具库交互：
     ① 工具库主页（layouts/courses/tools.html）—— 关键词搜索 + 分组筛选
     ② 任意页 —— 点击正文里的卡片引用（.card-ref）、卡片底部关系列表里的链接（.tb-rel-link）
        或卡片墙上的索引卡（.tb-teaser-link），把对应**卡片页**抓成弹窗。
     ③ 卡片墙上的「配件折叠」（.tb-family-toggle）——引理/推论/性质默认收起，点箭头才铺开。

   卡片正文只在卡片页存在一份（content/courses/<课程>/toolbox/<id>/），抓取结果按 URL 缓存，
   所以同一页反复点开不同卡片最多各请求一次；没有 JS 时链接照常跳到卡片页。

   弹窗是**多栏**的：从卡片里再点一张，那张在旁边新开一栏（原来那张留在左边），
   栏数不设上限、多了横向滚动（窄屏改上下堆叠，见 11-toolbox.css）。同一张卡已经开着就
   不再重复开一栏，只是把它滚到看得见 —— 否则「点了像没反应」。

   文案经 <script> 的 data-title / data-close / data-pane-close / data-result 传入
   （JS 里不能调 i18n）。
   ============================================ */

(function () {
  "use strict";

  /* 所有「带身份的卡片链接」共用一条路：链接自己带 data-card（正文引用徽章 .card-ref、
     卡内交叉引用、弹窗里克隆出来的那些都是），地址取它自己的 href。
     以前这里靠 `[href*="/toolbox/"]` 猜 —— CS 库的卡片页在 /cs/<id>/、不含 /toolbox/，
     于是 CS 卡正文里的交叉引用不被拦截，点一下就整页跳走。
     用 `a[data-card]` 这一个判据就能同时覆盖「卡片页上的交叉引用」与「弹窗里的交叉引用」，
     两种场景行为一致（都在弹窗里打开目标卡）。 */
  var CARD_LINK_SEL = "a[data-card]";
  var self = document.currentScript || {};
  var state = { cache: {}, lastFocus: null, modal: null, manual: {} };

  /* UI 文案经 <script> 的 data-* 传给脚本，见 extend_head.html */
  function label(key, fallback) {
    var ds = self.dataset || {};
    return ds[key] || fallback || key;
  }

  /* ---------- 触发元素 → {id, url} ----------

     链接一律从**组件自己的 <a>** 上取，绝不从 e.target 取。真实鼠标点在卡片上时，点到的是
     标题或徽章的 <span>（没有 href），取 e.target 的 href 会得到 null；而 pathOf(null) 不报错，
     它把字符串 "null" 当相对地址解析成一个**看起来正常、其实不存在**的 URL：
     `/<当前目录>/null`。2026-09-19 实测：两个库的每一张索引卡都因此跳到 404 页，
     只有恰好点在 <a> 自己的内边距空白处才成功 —— 症状就是「很多卡片点开都是 404」。 */
  function targetOf(el) {
    var ref = el.closest(CARD_LINK_SEL);
    if (ref) {
      return { id: ref.dataset.card, url: pathOf(ref.getAttribute("href")) };
    }
    var teaser = el.closest(".tb-teaser");
    if (teaser) {
      var anchor = teaser.querySelector("a[href]");
      return { id: teaser.dataset.id, url: anchor ? pathOf(anchor.getAttribute("href")) : "" };
    }
    return null;
  }

  // 空/缺失的 href 一律给空串：**绝不把 null 交给 URL 解析**（那是上面那个 404 的根）
  function pathOf(href) {
    if (!href) return "";
    try {
      return new URL(href, window.location.href).pathname;
    } catch (err) {
      return href;
    }
  }

  /* ---------- 抓卡片页并缓存其中的 .tb-card ---------- */
  function loadCard(id, url) {
    /* 本页已有完整卡片就直接用（卡片页自己 + 深链场景）。
       必须排除 .tb-teaser：索引卡也是 .tb-card 且带 data-id，但它只有抬头、没有正文 ——
       2026-09-18 之前这里没排除，于是工具库页 / 卡片库细分页上点开卡片只弹出抬头
       （弹窗里空空如也），得跳到卡片页才看得到正文。 */
    var local = document.querySelector('.tb-card[data-id="' + id + '"]:not(.tb-teaser)');
    if (local) return Promise.resolve(local);
    if (!url) return Promise.reject(new Error("no url for " + id));
    if (state.cache[url]) return Promise.resolve(state.cache[url]);
    return fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        if (!res.ok) throw new Error("card page " + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, "text/html");
        var node = doc.querySelector('.tb-card[data-id="' + id + '"]:not(.tb-teaser)') || doc.querySelector(".tb-card:not(.tb-teaser)");
        if (!node) throw new Error("card not found: " + id);
        state.cache[url] = node;
        return node;
      });
  }

  /* ---------- 弹窗（多栏） ---------- */
  function ensureModal() {
    if (state.modal) return state.modal;
    var wrap = document.createElement("div");
    wrap.className = "tb-modal";
    wrap.hidden = true;
    wrap.innerHTML =
      '<div class="tb-modal-backdrop" data-close="1"></div>' +
      '<div class="tb-modal-panel" role="dialog" aria-modal="true">' +
      '<p class="tb-modal-title"></p>' +
      '<button type="button" class="tb-modal-close" data-close="1">×</button>' +
      '<div class="tb-modal-panes"></div>' +
      "</div>";
    wrap.querySelector(".tb-modal-title").textContent = label("title", "Toolbox");
    wrap.querySelector(".tb-modal-close").setAttribute("aria-label", label("close", "Close"));
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) {
      /* 先判每栏的关闭按钮：它的 data-* 与弹窗那个不同名（data-close 只精确匹配自己），
         所以顺序其实无关紧要，但意图上「关这一栏」优先于「关整个弹窗」。 */
      var paneClose = e.target.closest("[data-close-pane]");
      if (paneClose) {
        closePane(paneClose.closest(".tb-pane"));
        return;
      }
      if (e.target.closest("[data-close]")) close();
    });
    state.modal = wrap;
    return wrap;
  }

  function panesEl() {
    return state.modal ? state.modal.querySelector(".tb-modal-panes") : null;
  }

  function paneOf(id) {
    return state.modal ? state.modal.querySelector('.tb-pane[data-card="' + id + '"]') : null;
  }

  /* 栏数变了要同步两件事：面板放宽、每栏的关闭按钮现身（都挂在 data-multi 上，见 CSS） */
  function syncPanes() {
    if (!state.modal) return;
    var n = state.modal.querySelectorAll(".tb-pane").length;
    state.modal.dataset.multi = n > 1 ? "true" : "false";
  }

  function makePane(id) {
    var pane = document.createElement("div");
    pane.className = "tb-pane";
    pane.dataset.card = id;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tb-pane-close";
    btn.setAttribute("data-close-pane", "1");
    btn.setAttribute("aria-label", label("paneClose", "Close pane"));
    btn.textContent = "×";
    pane.appendChild(btn);
    return pane;
  }

  /* opts.fromPane：从哪一栏里点出来的 —— 新栏插在它**右边**（用户要的「展开在左边或右边」）。
     没有来源（页面上直接点引用、深链）就追加到最右边。 */
  function openCard(id, url, opts) {
    opts = opts || {};
    if (!opts.keepFocus) state.lastFocus = document.activeElement;
    loadCard(id, url)
      .then(function (node) {
        var modal = ensureModal();
        var panes = panesEl();
        var firstOpen = modal.hidden;
        modal.hidden = false;
        document.body.classList.add("tb-modal-open");

        var open = paneOf(id);
        if (open) {
          /* 已经在栏里：不再开一栏（同一个东西摆两份只会让人怀疑是不是点错了），
             把它滚到看得见的地方就算回应了这次点击。 */
          open.scrollIntoView({ block: "nearest", inline: "nearest" });
          syncPanes();
          return;
        }

        var pane = makePane(id);
        pane.appendChild(node.cloneNode(true));
        var host = opts.fromPane;
        if (host && host.parentNode === panes) {
          panes.insertBefore(pane, host.nextSibling);
        } else {
          panes.appendChild(pane);
        }
        syncPanes();
        /* 只有「弹窗刚刚打开」才把焦点挪到面板上：之后每开一栏都把焦点拽回弹窗角落，
           键盘与读屏用户会跟丢自己点的是哪一张。 */
        if (firstOpen) modal.querySelector(".tb-modal-close").focus();
      })
      .catch(function () {
        /* 抓不到就退化成普通跳转（无 JS 时本来就该这样）。url 由 pathOf 保证是空串或
           真实地址，空串说明连链接都没解析出来 —— 那时什么都不做，绝不能拿一个算坏的
           地址去跳转（`/null` 那个 404 就是这么跳出来的）。 */
        if (url) window.location.href = url;
      });
  }

  function closePane(pane) {
    var panes = panesEl();
    if (!pane || !panes || pane.parentNode !== panes) return;
    /* 焦点若在被删掉的那一栏里，删完会掉到 body 上 —— 先记下来，之后挪到弹窗的关闭按钮 */
    var lostFocus = pane.contains(document.activeElement);
    panes.removeChild(pane);
    if (!panes.querySelector(".tb-pane")) {
      close();
      return;
    }
    syncPanes();
    if (lostFocus) state.modal.querySelector(".tb-modal-close").focus();
  }

  function close() {
    if (!state.modal || state.modal.hidden) return;
    var panes = panesEl();
    if (panes) panes.innerHTML = "";   /* 下次打开是干净的，不留上一轮的栏 */
    state.modal.hidden = true;
    document.body.classList.remove("tb-modal-open");
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    state.lastFocus = null;
  }

  /* ---------- 卡片墙：配件折叠（引理 / 推论 / 性质默认收起） ---------- */

  function setFamilyOpen(fam, open) {
    fam.setAttribute("data-open", open ? "true" : "false");
    var btn = fam.querySelector(".tb-family-toggle");
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /* 收起这件事**只有脚本在时才做**：按钮出厂带 hidden，收起的 CSS 挂在 body.tb-collapsible 上，
     两件事在同一个函数里、中间没有 await —— 否则会出现「箭头已经在、配件还开着」的一帧，
     或者更糟：没有 JS 时配件被藏起来又点不开。 */
  function initFamilies() {
    var fams = Array.prototype.slice.call(document.querySelectorAll(".tb-family"));
    var openables = fams.filter(function (fam) {
      return fam.querySelector(".tb-family-toggle");
    });
    if (!openables.length) return;
    document.body.classList.add("tb-collapsible");
    openables.forEach(function (fam) {
      var btn = fam.querySelector(".tb-family-toggle");
      btn.hidden = false;
      setFamilyOpen(fam, false);
      btn.addEventListener("click", function () {
        var open = fam.getAttribute("data-open") !== "true";
        setFamilyOpen(fam, open);
        /* 用户点过的家从此归用户管：搜索不再自动改它的开合（见 apply 里的说明） */
        state.manual[fam.getAttribute("data-family")] = true;
      });
    });
  }

  /* ---------- 工具库主页筛选 ---------- */
  function initFilter() {
    var search = document.getElementById("tb-search");
    var chips = Array.prototype.slice.call(document.querySelectorAll(".tb-chip[data-group]"));
    var groups = Array.prototype.slice.call(document.querySelectorAll(".tb-group[data-group]"));
    if (!search || !chips.length) return;

    var result = document.getElementById("tb-result");
    var empty = document.getElementById("tb-empty");
    var activeGroup = "all";
    var timer = null;

    function apply() {
      var q = search.value.trim().toLowerCase();
      var shown = 0;
      var total = 0;
      groups.forEach(function (group) {
        var inGroup = activeGroup === "all" || group.dataset.group === activeGroup;
        var visible = 0;
        Array.prototype.forEach.call(group.querySelectorAll(".tb-card"), function (card) {
          /* 重复份（tb-teaser--dup）是同一张配件挂在别的正主下面的副本：不单独计数
             （否则面板上的「N/80」跟分组按钮上的张数对不上），可见性也交给下面按家处理 */
          if (card.classList.contains("tb-teaser--dup")) return;
          total++;
          var hitText = !q || (card.dataset.search || "").toLowerCase().indexOf(q) !== -1;
          var show = inGroup && hitText;
          card.hidden = !show;
          if (show) visible++;
        });
        /* 一家子（正主 + 挂在它下面的配件）按**整体**筛：家里任何一张命中，整家都显示。
           配件命中而正主没命中时，不至于在页面上留一张孤零零的缩进小卡、看不出挂在哪；
           反过来正主命中、配件没命中时配件也留着 —— 它本来就属于这一家。
           筛空的家与分组一起藏起来，别留一段空的虚线区域。 */
        Array.prototype.forEach.call(group.querySelectorAll(".tb-family"), function (fam) {
          var cards = Array.prototype.slice.call(fam.querySelectorAll(".tb-card"));
          var real = cards.filter(function (card) { return !card.classList.contains("tb-teaser--dup"); });
          var hit = real.some(function (card) { return !card.hidden; });
          cards.forEach(function (card) { card.hidden = !hit; });
          fam.hidden = !hit;
          /* 配件是收起来的：命中的如果正是**被收起来的配件**，不替访客展开就等于没命中
             （搜索框说「匹配到了」，眼前却什么都没有）。用户自己点过箭头的家不碰 ——
             他手动设过的开合状态，不该被敲键盘改掉。 */
          var id = fam.getAttribute("data-family");
          if (!fam.querySelector(".tb-family-toggle") || state.manual[id]) return;
          setFamilyOpen(fam, !!q && Array.prototype.some.call(
            fam.querySelectorAll(".tb-family-kids .tb-card"),
            function (kid) { return (kid.dataset.search || "").toLowerCase().indexOf(q) !== -1; }
          ));
        });
        group.hidden = visible === 0;
        /* 数学库是「大类 → 细分」两级：细分小节里卡全被筛掉就整块收起，
           否则筛「概率论」时会在别的分支下留下一个空的细分标题。 */
        Array.prototype.forEach.call(group.querySelectorAll("[data-subgroup]"), function (sub) {
          var has = Array.prototype.some.call(sub.querySelectorAll(".tb-card"), function (card) {
            return !card.hidden;
          });
          sub.hidden = !has;
        });
        if (inGroup) shown += visible;
      });
      if (q || activeGroup !== "all") {
        result.hidden = false;
        result.textContent = label("result", "{shown}/{total}")
          .replace("{shown}", String(shown))
          .replace("{total}", String(total));
      } else {
        result.hidden = true;
      }
      if (empty) empty.hidden = shown !== 0;
    }

    search.addEventListener("input", function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(apply, 120);
    });

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        activeGroup = chip.dataset.group;
        chips.forEach(function (c) {
          c.classList.toggle("is-active", c === chip);
        });
        apply();
      });
    });

    apply();
  }

  /* ---------- 事件接线 ---------- */
  function init() {
    initFamilies();
    initFilter();

    document.addEventListener("click", function (e) {
      var target = targetOf(e.target);
      /* 解析不出可靠地址就**不拦截**：让浏览器按链接自己走（也就是「没有 JS 时」那条路）。
         以前这里只判 target.id，于是算坏的地址照样被 preventDefault 接管，把访客送去 404。
         折叠箭头没有 href、也不在 .tb-teaser 里，targetOf 对它返回 null —— 那条路不用特意排。 */
      if (target && target.id && target.url) {
        e.preventDefault();
        /* 从弹窗里某一栏点出来的，就把新卡开在那一栏右边 */
        var fromPane = e.target.closest(".tb-pane");
        openCard(target.id, target.url, { keepFocus: !!fromPane, fromPane: fromPane });
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      /* Esc 先收最后开的那一栏（一层一层退回去），只剩一栏时才关掉整个弹窗 */
      var panes = state.modal && state.modal.querySelectorAll(".tb-pane");
      if (panes && panes.length > 1) {
        closePane(panes[panes.length - 1]);
      } else {
        close();
      }
    });

    // 从别处分享来的深链：#card-tool-1-4（卡片页上内容本来就在，主页则开弹窗）
    if (location.hash.indexOf("#card-") === 0) {
      var id = location.hash.replace("#card-", "");
      /* 判据必须排除 .tb-teaser：索引卡也是 .tb-card 且带 data-id，否则在卡片库细分页上
         它会被当成「本页已有完整卡片」，深链直接静默失效（2026-09-19 修，与 loadCard
         里那条 :not(.tb-teaser) 是同一个坑的第三处）。 */
      if (!document.querySelector('.tb-card[data-id="' + id + '"]:not(.tb-teaser)')) {
        // 地址同样取卡片自己的 <a>，拿不到就什么都不做
        var anchor = document.querySelector('.tb-teaser[data-id="' + id + '"] a[href]');
        var url = pathOf(anchor && anchor.getAttribute("href"));
        if (url) openCard(id, url);
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
