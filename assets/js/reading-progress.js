/* 文章页阅读进度条 + 目录当前位置高亮。
 *
 * 由 extend_head.html 只在 .Kind == "page" 的页面加载（走单页模板的那些页面）。
 *
 * 滚动处理不套 requestAnimationFrame 节流：后台/隐藏标签页里 rAF 不触发，
 * 一旦用它兜住整个更新逻辑，切回页面时会拿到过期状态（仓库里已经在词条筛选上踩过这个坑）。
 *
 * 代价是每次 scroll 都会跑一遍 update()，所以它**必须是纯算术**：所有几何量（正文起止、
 * 顶栏高度、每个目录项的文档内偏移）预先量一次缓存起来，滚动时只读 window.scrollY。
 * 早先的写法在 scroll 里对每个目录项做 getBoundingClientRect()，实测在公式密集页
 * （DOM 两万多个节点）滚动时每秒触发上百次强制同步布局——这是滚动卡顿的主因。
 *
 * 缓存的失效点：resize、load（字体/图片换尺寸）、document.fonts.ready、以及正文自身的
 * ResizeObserver（图片加载完成撑高正文时靠它）。失效只打脏标记，下一次 scroll 量一次。
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

    let geo = null;
    let active = null;

    const measure = () => {
        const rect = article.getBoundingClientRect();
        const top = rect.top + window.scrollY;
        const header = document.querySelector('.header');
        geo = {
            top,
            span: article.offsetHeight - window.innerHeight * 0.85,
            line: (header?.offsetHeight || 60) + 24,
            marks: tocLinks.map((item) => ({
                link: item.link,
                top: item.el.getBoundingClientRect().top + window.scrollY,
            })),
        };
    };

    const invalidate = () => {
        geo = null;
    };

    const update = () => {
        const y = window.scrollY;
        if (!geo) {
            measure();
        }

        const ratio = geo.span > 80 ? (y - geo.top) / geo.span : 0;
        const value = Math.max(0, Math.min(1, ratio));

        bar.style.transform = `scaleX(${value})`;
        bar.dataset.active = value > 0.005 ? '1' : '0';

        if (!geo.marks.length) {
            return;
        }

        const line = y + geo.line;
        let current = null;
        for (const mark of geo.marks) {
            if (mark.top <= line) {
                current = mark.link;
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
    window.addEventListener('resize', () => {
        invalidate();
        update();
    });
    window.addEventListener('load', invalidate);
    if (document.fonts?.ready) {
        document.fonts.ready.then(invalidate);
    }
    if (window.ResizeObserver) {
        new ResizeObserver(invalidate).observe(article);
    }

    update();
})();
