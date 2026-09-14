/* 文章页阅读进度条 + 目录当前位置高亮。
 *
 * 由 extend_head.html 只在 .Kind == "page" 的页面加载（走单页模板的那些页面）。
 * 滚动处理不套 requestAnimationFrame 节流：后台/隐藏标签页里 rAF 不触发，
 * 一旦用它兜住整个更新逻辑，切回页面时会拿到过期状态（仓库里已经在词条筛选上踩过这个坑）。
 */
(() => {
    const article = document.querySelector('.post-single');
    const content = article?.querySelector('.post-content');
    if (!article || !content) {
        return;
    }

    const bar = document.createElement('div');
    bar.id = 'reading-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);

    const tocLinks = Array.from(document.querySelectorAll('.toc a[href^="#"]'))
        .map((link) => {
            let id = link.hash.slice(1);
            try {
                id = decodeURIComponent(id);
            } catch (e) {
                /* 非法转义：按原样找 */
            }
            return { link, el: document.getElementById(id) };
        })
        .filter((item) => item.el);

    let active = null;

    const headerOffset = () => {
        const header = document.querySelector('.header');
        return (header?.offsetHeight || 60) + 24;
    };

    const update = () => {
        const rect = article.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const span = article.offsetHeight - window.innerHeight * 0.85;
        const ratio = span > 80 ? (window.scrollY - top) / span : 0;
        const value = Math.max(0, Math.min(1, ratio));

        bar.style.transform = `scaleX(${value})`;
        bar.dataset.active = value > 0.005 && value < 1 ? '1' : value >= 1 ? '1' : '0';

        if (!tocLinks.length) {
            return;
        }

        const line = window.scrollY + headerOffset();
        let current = null;
        for (const item of tocLinks) {
            const itemTop = item.el.getBoundingClientRect().top + window.scrollY;
            if (itemTop <= line) {
                current = item.link;
            } else {
                break;
            }
        }

        if (current !== active) {
            if (active) {
                active.classList.remove('active');
            }
            if (current) {
                current.classList.add('active');
            }
            active = current;
        }
    };

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
})();
