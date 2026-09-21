/* 正文图片灯箱：点正文里的图 → 在原生 <dialog> 里放大看。
 *
 * 由 extend_head.html 只在走单页模板的页面加载（判据与 reading-progress.js 同源）。
 * 样式在 assets/css/extended/26-lightbox.css。
 *
 * 四条边界：
 * 1. **不绑小图**。判据是「图在正文列里显示得够大」而不是「原图够大」：图表、示意图这类
 *    点开才有意义，而图标、表情、小徽章点开会很荒唐。480px 取的是正文列（720px）的三分之二
 *    —— 比它窄的图放大只会变糊，本来就看不清，灯箱帮不上忙。
 * 2. **包在链接里的图不绑**。那种图的点击语义是「去这个链接」，抢过来是破坏。作者的意图
 *    已经写在标记里了，别猜。
 * 3. **用 currentSrc 而不是 src**。响应式图（render-image.html 会出 srcset）在浏览器里
 *    已经挑好了一档，取 currentSrc 就是「把当前这张放大」，不会为了灯箱再下一次更大的图。
 * 4. **减少动效偏好下不做淡入**（样式那边用 media query 挡），功能照旧。
 *
 * 事件用**委托**挂在正文容器上，不给每张图各挂一个监听：正文里图的数量不定（有的页面几十张），
 * 委托只有一个监听器，而且后加的图（懒加载、参考实现里的动态内容）自动也有灯箱。
 */
(() => {
    'use strict';

    const content = document.querySelector('.post-content');
    if (!content) {
        return;
    }

    /* 文案经自己 <script> 标签的 data-* 传入（JS 里不硬编码中文，AGENTS 规则 7）；
       写法与 nav-toggle.js / terms-filter.js 一致。取不到就退化成空标签，
       功能不受影响（关闭按钮里还有 × 字形）。 */
    const self = document.currentScript || {};
    const label = (self.dataset && self.dataset.label) || '';
    const closeLabel = (self.dataset && self.dataset.closeLabel) || '';

    /* 图片要显示得够大才值得点开。用 getBoundingClientRect 而不是 naturalWidth：
       正文列宽是 720px，一张 3000px 的原图在这里可能只显示 200px 宽（比如并排的小图），
       那种图点开放大反而更奇怪。 */
    const MIN_DISPLAY_PX = 480;

    const dialog = document.createElement('dialog');
    dialog.className = 'lightbox';
    dialog.setAttribute('aria-label', label);
    const bigImg = document.createElement('img');
    bigImg.className = 'lightbox-img';
    bigImg.alt = '';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', closeLabel);
    closeBtn.textContent = '×';
    dialog.append(bigImg, closeBtn);
    document.body.appendChild(dialog);

    let opener = null;   /* 关闭后把焦点还给谁 */

    const open = (img) => {
        bigImg.src = img.currentSrc || img.src;
        /* alt 抄过来：放大后的图仍然是同一张图，读屏描述不该变。
           <dialog> 里的 img 是重复内容，所以正文那张不加 aria-hidden（两处都在 DOM 里，
           但同一时刻只有一处可见，读屏按可见性处理）。 */
        bigImg.alt = img.alt || '';
        opener = img;
        dialog.showModal();
    };

    content.addEventListener('click', (event) => {
        const img = event.target.closest('img');
        if (!img || !content.contains(img)) {
            return;
        }
        if (img.closest('a')) {
            return;   /* 链接里的图：点击语义是跳转 */
        }
        if (img.getBoundingClientRect().width < MIN_DISPLAY_PX) {
            return;
        }
        open(img);
    });

    /* 点大图本身 = 关闭（放大后最常见的动作是「看完了，收起来」）。
       点 dialog 的空白区（::backdrop 之外的内边距区）也关 —— 用 target 判定，
       不监听 backdrop 的点击（那要读鼠标坐标，边界情况多）。 */
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog || event.target === bigImg || event.target === closeBtn) {
            dialog.close();
        }
    });

    /* Esc 由 showModal 自己处理（close 事件照样触发）。
       close 时清掉 src：一张 1500px 的图留在 DOM 里没有意义，清掉后
       浏览器可以回收解码后的位图（也避免「关了还占着内存」）。 */
    dialog.addEventListener('close', () => {
        bigImg.removeAttribute('src');
        if (opener) {
            opener.focus({ preventScroll: true });
            opener = null;
        }
    });

    /* 可点开的图给一个放大镜光标 —— 只给够大的那些，否则「有的图能点、有的不能」
       完全没有视觉线索。用类而不是内联 style：样式归 CSS。 */
    const markZoomable = () => {
        for (const img of content.querySelectorAll('img')) {
            if (img.closest('a')) {
                continue;
            }
            if (img.getBoundingClientRect().width >= MIN_DISPLAY_PX) {
                img.classList.add('post-image-zoom');
            } else {
                img.classList.remove('post-image-zoom');
            }
        }
    };

    markZoomable();
    /* 图懒加载完成后尺寸才定，字体加载完也可能重排；两处都重标一次。 */
    window.addEventListener('load', markZoomable);
    if (document.fonts?.ready) {
        document.fonts.ready.then(markZoomable);
    }
})();
