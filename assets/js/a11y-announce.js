/* 搜索结果的读屏播报。
 *
 * 背景：#searchResults 在主题模板里（themes/PaperMod/layouts/search.html），它没有 aria-live，
 * 而结果又由主题的 fastsearch.js 异步写入 —— 读屏用户敲完关键词听不到任何反馈，
 * 只能自己摸索着往列表里找。这里**不覆盖主题模板**：为一条播报再加一处覆盖不划算
 * （本次为跳过链接与 lang 已经加了 layouts/baseof.html 这一处），改为挂一个 MutationObserver
 * 观察结果列表的子节点变化，把条数写进一个 .sr-only 的 role="status" 节点。
 *
 * 文案经 <script> 的 data-count / data-none 传入 —— JS 里不能调 Hugo 的 i18n，
 * 与 terms-filter.js、list-tools.js 是同一套做法。
 *
 * ---- 一个必须处理的歧义 ----
 * fastsearch.js 的 renderResults([]) 被两条路径共用：输入框为空（performSearch 里 query 为空）
 * 与没有匹配结果（results.length === 0）。两种情况产生的 DOM 都是「零个 li」，
 * 所以零条时必须回头看输入框：为空说明是清空操作，什么都不该播报；
 * 有输入才是真的没搜到。
 *
 * 只由 extend_head.html 在 layout == "search" 的页面加载。
 */
(function () {
  'use strict';

  var list = document.getElementById('searchResults');
  var input = document.getElementById('searchInput');
  if (!list || !input) return;

  var self = document.currentScript || {};
  var ds = self.dataset || {};
  var countTpl = ds.count || '';
  var noneText = ds.none || '';

  var status = document.createElement('p');
  status.className = 'sr-only';
  /* role="status" 自带 aria-live="polite" 与 aria-atomic="true"，不再重复声明 */
  status.setAttribute('role', 'status');
  list.parentNode.insertBefore(status, list.nextSibling);

  var last = null;

  function announce(text) {
    if (text === last) return; // 同样的文本重复写入会让部分读屏反复播报
    last = text;
    status.textContent = text;
  }

  function update() {
    var n = list.querySelectorAll("li").length;
    if (n === 0) {
      announce(input.value.trim() ? noneText : '');
      return;
    }
    announce(countTpl.replace('{count}', String(n)));
  }

  /* childList 即可：fastsearch 每次都重建整个列表（innerHTML = '' 后 append 一个 fragment），
     两个变更在同一批微任务里送达，回调只会触发一次。 */
  new MutationObserver(update).observe(list, { childList: true });

  /* 但只靠观察者会漏掉两种「列表本来就没有变化」的情形 —— innerHTML = '' 清一个**已经空**的
     列表不产生任何 DOM 变更，观察者不会触发：
       ① 页面刚打开就直接搜一个没有结果的词（列表本来就是空的）；
       ② 搜完无结果后再把输入框清空。
     这两种恰恰覆盖了「没有找到结果」与「撤销播报」两个状态。后果不只是文本陈旧：
     last 会一直记着旧值，把下一次同样的播报去重吞掉，用户从此听不到「没有找到结果」。
     所以再挂一个输入监听兜底，延迟比主题 fastsearch 的 150ms 稍长一点，保证列表已经渲染完
     （它的 performSearch 是 debounce(150)，见 themes/PaperMod/assets/js/fastsearch.js）。 */
  var timer = null;
  input.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(update, 250);
  });
})();
