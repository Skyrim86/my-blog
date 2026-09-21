/* 顶栏吸顶后的状态标记（给 <html> 加 .is-scrolled）。
 *
 * 由 extend_head.html 全站加载（脚本很小，且每个页面都有顶栏）。
 *
 * 分工：顶栏「粘住」本身是纯 CSS（10-nav.css 的 `position: sticky`），滚不滚它都在上面；
 * 这个脚本只负责判断「页面是否已离开顶部」，让顶栏在那里加深底色、补一道投影。
 * 所以禁用 JS 时页面照旧吸顶，只是不加深 —— 这是有意的降级方向：吸顶是布局，加深是装饰。
 *
 * **为什么用哨兵 + IntersectionObserver，而不是 scroll 监听**：
 * reading-progress.js 里那条滚动路径是「纯算术、每次 scroll 都跑」量过的（旧写法每秒上百次
 * 强制同步布局，是滚动卡顿的主因）。全站再挂一个 scroll 监听，等于在同一条最敏感的路上加开销。
 * 哨兵 + IO 是零滚动开销的等价做法，而且比 scroll 监听更准：以「元素是否已滚出视口顶部」
 * 判定，不受滚动容器、缩放、动态工具栏的影响。
 *
 * 哨兵由脚本自己插入（1px 的绝对定位方块，落在文档顶部），所以模板不用改 ——
 * 与 reading-progress.js 注入进度条、toc-rail.html 内联脚本给 body 加类是同一种做法。
 * 绝对定位的元素不参与流，不会带来任何布局位移。
 */
(() => {
    'use strict';

    const root = document.documentElement;

    /* 没有 IO 就什么都不做（很老的浏览器）：顶栏照旧吸顶，只是没有加深那一档。 */
    if (!('IntersectionObserver' in window)) {
        return;
    }

    /* 1px、无底色、不吃指针事件 —— 看不见，也不会挡住顶栏的点击。
       刻意**不写** display: none / visibility: hidden：前者会让元素没有盒、IO 永远不会回调，
       后者依赖实现细节；只有「有盒且透明」是各浏览器都一定会观察到的形态。 */
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
    document.body.insertBefore(sentinel, document.body.firstChild);

    /* rootMargin 全 0、不设 threshold：哨兵在视口内 = 还在页面顶部，
       完全出去 = 已滚动。1px 的元素在默认 threshold 下就是进/出两态。
       初值不写死：IO 在观察时会立刻回调一次，带哈希打开（或在滚动位置刷新）也能一次判对。 */
    new IntersectionObserver(([entry]) => {
        root.classList.toggle('is-scrolled', !entry.isIntersecting);
    }).observe(sentinel);
})();
