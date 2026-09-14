/* 搜索快捷键 + 搜索页 URL 预填。
 *
 * 全站：Ctrl/⌘ + K，或不在输入框里时按 "/"，跳到搜索页（URL 经 data-search-url 传入，
 *       由 extend_head.html 用 relLangURL 填值，站点在子路径下也正确）。
 * 搜索页：读取 ?q=…，预填输入框并触发一次 input 事件，让主题的 fastsearch 立刻出结果。
 *         主题的 fastsearch.js 在 window.load 后才建 Fuse 索引，所以这里也挂在 load 上、
 *         并且晚一拍派发，避免在索引就绪前触发。
 */
(() => {
    const script = document.currentScript;
    const searchURL = script?.dataset.searchUrl || '';
    const input = document.getElementById('searchInput');

    if (input) {
        const query = new URLSearchParams(window.location.search).get('q');
        if (query) {
            window.addEventListener('load', () => {
                window.setTimeout(() => {
                    input.value = query;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }, 60);
            });
        }
    }

    const isTyping = (el) => {
        if (!el) {
            return false;
        }
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    document.addEventListener('keydown', (event) => {
        const wantsSearch =
            (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey)) ||
            (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey);

        if (!wantsSearch || isTyping(event.target)) {
            return;
        }

        event.preventDefault();

        if (input && input.offsetParent !== null) {
            input.focus();
            input.select();
            return;
        }

        if (searchURL) {
            window.location.href = searchURL;
        }
    });
})();
