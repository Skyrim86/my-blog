/* 课程材料页的左侧跟随目录：把服务端渲染在正文末尾的 .toc-rail 挪到 <body> 下。
 *
 * 为什么必须挪：.post-single 上的 backdrop-filter 会成为 fixed 后代的包含块
 * （实测：不挪的话目录跟着正文一起滚，滚动 2500px 后 top 从 170px 变成 -1943px），
 * 挂在 body 下才是真正的视口定位。
 *
 * 挪完才给 body 加 .has-toc-rail，CSS 里所有左栏样式都挂在这个类下：
 * 没有 JS 时不显示目录栏，正文顶部那份折叠目录照旧（渐进增强，与 nav-toggle.js 同一套做法）。
 *
 * 只在课程材料页加载（见 extend_head.html），这里不再判页面类型。
 */
(() => {
    const rail = document.getElementById('toc-rail');
    if (!rail) {
        return;
    }
    document.body.appendChild(rail);
    document.body.classList.add('has-toc-rail');
})();
