/* 滚动出现动画：让首屏**之下**的列表项/卡片在滚进视口时淡入上浮一次。
 *
 * 由 extend_head.html 全站加载（很小，且各页型的目标元素各不相同，脚本自己找）。
 * 样式在 assets/css/extended/22-reveal.css（.reveal-pending / .is-revealed 两个互斥的类）。
 *
 * 三条边界，都是刻意的：
 *
 * 1. **只碰首屏之下的元素**。先量 rect，已经在视口里的一个都不动 —— 所以不会出现
 *    「先隐藏再淡入」的闪烁，首屏内容（含 LCP 元素）的绘制路径完全不变。
 *    失败方向也是安全的：量不到尺寸（display:none）的元素被当成「在首屏之上」跳过，
 *    结果是它一直可见、只是没有入场动画；反过来「JS 挂了导致正文隐身」在这套写法里
 *    不可能发生，因为隐藏类只由这个脚本挂上。
 *
 * 2. **减少动效偏好下整个脚本不介入**（连 IO 都不建）。22-reveal.css 里那段也包在
 *    prefers-reduced-motion: no-preference 里，两层都挡，与 09-home.css / 21-card-deck.css 同款做法。
 *
 * 3. **一页里只观察一次**：元素进入后立刻 unobserve，动画跑完再把两个类摘掉。
 *    摘掉是必要的 —— .is-revealed 上的 animation 若长期留着，会挡住元素自己的过渡
 *    （列表卡的 hover 位移走的是 transition）。
 *
 * 为什么不用 scroll 监听逐个算位置：reading-progress.js 那条滚动路径是「纯算术」量过的
 * （旧写法每秒上百次强制同步布局），全站再挂一个滚动监听就是在同一条最敏感的路上加开销。
 * IntersectionObserver 是零滚动开销的等价做法，而且用 rootMargin 留出下边距后，
 * 元素在「露出一点」时就触发，比按 scrollY 算更贴合观感。
 */
(() => {
    'use strict';

    /* 目标：铺开的列表/卡片。**不含正文段落** —— 长文（最重的公式页 HTML 一千多 KB、
       DOM 两万多节点）里逐段入场既吵又会真的花掉帧预算，收益也低：读者是顺序读的。

       卡片墙按**族**（.tb-family）而不是按卡（.tb-card）入场：工具库一页铺八十来张卡，
       逐张算入场就是在同一个视口里塞几十个同时起跑的动画，观感是「满屏乱闪」；
       按族入场是工具库自己的信息单元（主卡 + 它的附属结论），一格一格落下来更稳。 */
    const SELECTOR = [
        'article.post-entry',   /* 列表页的卡片（/courses/、/projects/、/posts/…） */
        '.page-header',         /* 列表页的标题区 */
        '.course-group',        /* 课程主页里的一组材料 */
        '.course-entry',        /* 章节入口页里的每条材料 */
        '.project-index-item',  /* 项目的目录条目 */
        '.tb-family',           /* 工具库 / 数学库卡片墙里的一格（含它展开后的附属卡） */
        '.lb-branch-card',      /* 数学库大类页的三张大类卡 */
        '.lb-sub-card'          /* 数学库细分页的细分卡 */
    ].join(',');

    if (!('IntersectionObserver' in window) || typeof window.matchMedia !== 'function') {
        return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
    }

    const pending = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
        /* 视口底边之上的都不碰。用 innerHeight 而不是「视口高度 - 偏移」：
           首屏判定要严格，宁可漏掉几个（它们就没有动画），不要误判成首屏之下（会闪）。 */
        if (el.getBoundingClientRect().top < window.innerHeight) {
            continue;
        }
        el.classList.add('reveal-pending');
        pending.push(el);
    }
    if (!pending.length) {
        return;
    }

    const reveal = (el, delay) => {
        if (delay) {
            el.style.setProperty('--reveal-delay', delay + 'ms');
        }
        /* 必须先摘 pending 再挂 is-revealed：两个类互斥（见 22-reveal.css 的文件头）。
           同一个任务里改完，浏览器只重算一次样式。 */
        el.classList.remove('reveal-pending');
        el.classList.add('is-revealed');

        /* 动画跑完把两个类都摘掉，恢复元素自己的过渡与 transform 语义。
           animationend 会从子元素冒泡上来，所以要比对 target。 */
        el.addEventListener('animationend', function done(event) {
            if (event.target !== el) {
                return;
            }
            el.removeEventListener('animationend', done);
            el.classList.remove('is-revealed');
            el.style.removeProperty('--reveal-delay');
        });
    };

    const io = new IntersectionObserver((entries) => {
        /* 同一批进来的元素错峰：它们在视觉上通常是一行/一列，同时淡入会显得是「一整块」。
           45ms 一档、最多 5 档（225ms）—— 再长就会让最后一张卡显得姗姗来迟。 */
        let step = 0;
        for (const entry of entries) {
            if (!entry.isIntersecting) {
                continue;
            }
            io.unobserve(entry.target);
            reveal(entry.target, Math.min(step, 5) * 45);
            step++;
        }
    }, {
        /* 下边距 -8%：元素要真正探进视口一小截才触发，避免在屏幕边缘「擦一下」就播完。 */
        rootMargin: '0px 0px -8% 0px'
    });

    for (const el of pending) {
        io.observe(el);
    }
})();
