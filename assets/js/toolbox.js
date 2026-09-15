/* ============================================
   数学工具库交互：
     ① 工具库主页（layouts/courses/tools.html）—— 关键词搜索 + 分组筛选
     ② 任意页 —— 点击正文里的卡片引用（.card-ref）或工具库主页的索引卡（.tb-teaser-link），
        把对应**卡片页**抓成弹窗。

   卡片正文只在卡片页存在一份（content/courses/<课程>/toolbox/<id>/），抓取结果按 URL 缓存，
   所以同一页反复点开不同卡片最多各请求一次；没有 JS 时链接照常跳到卡片页。

   文案经 <script> 的 data-title / data-close / data-result 传入（JS 里不能调 i18n）。
   ============================================ */

(function () {
  "use strict";

  var REF_SEL = ".card-ref[data-card]";
  var TRIGGER_SEL = ".card-ref[data-card], .tb-teaser-link";
  var self = document.currentScript || {};
  var state = { cache: {}, lastFocus: null, modal: null };

  /* UI 文案经 <script> 的 data-* 传给脚本，见 extend_head.html */
  function label(key, fallback) {
    var ds = self.dataset || {};
    return ds[key] || fallback || key;
  }

  /* ---------- 触发元素 → {id, url} ---------- */
  function targetOf(el) {
    var ref = el.closest(REF_SEL);
    if (ref) {
      return { id: ref.dataset.card, url: pathOf(ref.getAttribute("href")) };
    }
    var teaser = el.closest(".tb-teaser");
    if (teaser) {
      return { id: teaser.dataset.id, url: pathOf(el.getAttribute("href")) };
    }
    var link = el.closest('.tb-modal-content a[href*="/toolbox/"]');
    if (link) {
      return { id: idFromUrl(link.getAttribute("href")), url: pathOf(link.getAttribute("href")) };
    }
    return null;
  }

  function pathOf(href) {
    try {
      return new URL(href, window.location.href).pathname;
    } catch (err) {
      return href;
    }
  }

  function idFromUrl(href) {
    var path = pathOf(href).replace(/\/+$/, "");
    return path.substring(path.lastIndexOf("/") + 1);
  }

  /* ---------- 抓卡片页并缓存其中的 .tb-card ---------- */
  function loadCard(id, url) {
    var local = document.querySelector('.tb-card[data-id="' + id + '"]');
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
        var node = doc.querySelector('.tb-card[data-id="' + id + '"]') || doc.querySelector(".tb-card");
        if (!node) throw new Error("card not found: " + id);
        state.cache[url] = node;
        return node;
      });
  }

  /* ---------- 弹窗 ---------- */
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
      '<div class="tb-modal-content"></div>' +
      "</div>";
    wrap.querySelector(".tb-modal-title").textContent = label("title", "Toolbox");
    wrap.querySelector(".tb-modal-close").setAttribute("aria-label", label("close", "Close"));
    document.body.appendChild(wrap);
    wrap.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) close();
    });
    state.modal = wrap;
    return wrap;
  }

  function openCard(id, url, opts) {
    if (!opts || !opts.keepFocus) state.lastFocus = document.activeElement;
    loadCard(id, url)
      .then(function (node) {
        var modal = ensureModal();
        var content = modal.querySelector(".tb-modal-content");
        content.innerHTML = "";
        content.appendChild(node.cloneNode(true));
        modal.hidden = false;
        document.body.classList.add("tb-modal-open");
        modal.querySelector(".tb-modal-close").focus();
      })
      .catch(function () {
        if (url) window.location.href = url;
      });
  }

  function close() {
    if (!state.modal || state.modal.hidden) return;
    state.modal.hidden = true;
    document.body.classList.remove("tb-modal-open");
    if (state.lastFocus && state.lastFocus.focus) state.lastFocus.focus();
    state.lastFocus = null;
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
          total++;
          var hitText = !q || (card.dataset.search || "").toLowerCase().indexOf(q) !== -1;
          var show = inGroup && hitText;
          card.hidden = !show;
          if (show) visible++;
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
    initFilter();

    document.addEventListener("click", function (e) {
      var target = targetOf(e.target);
      if (target && target.id) {
        e.preventDefault();
        openCard(target.id, target.url, { keepFocus: !!e.target.closest(".tb-modal-content") });
      }
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });

    // 从别处分享来的深链：#card-tool-1-4（卡片页上内容本来就在，主页则开弹窗）
    if (location.hash.indexOf("#card-") === 0) {
      var id = location.hash.replace("#card-", "");
      if (!document.querySelector('.tb-card[data-id="' + id + '"]')) {
        var teaser = document.querySelector('.tb-teaser[data-id="' + id + '"] a');
        if (teaser) openCard(id, pathOf(teaser.getAttribute("href")));
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
