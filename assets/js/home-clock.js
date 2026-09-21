/* 首页右栏的时钟：把当前时间写进 .home-clock，并按秒更新。
 *
 * 由 extend_head.html 只在首页加载。结构在 layouts/_partials/home-clock.html，
 * 样式在 assets/css/extended/09-home.css 的「首页时钟」一节。
 *
 * 三条边界：
 * 1. **面板出厂是隐藏的**（模板上带 `data-pending="1"`），第一帧填好内容才摘掉 ——
 *    静态站没有「服务端时间」可用，先显示再纠正会闪一下错的时间，宁可晚一帧出现。
 *    没有 JS 时这块整个不出现（与 #bottom-link 同一套做法）。
 * 2. **对齐到整秒再加定时器**：直接 setInterval(1000) 会按「脚本启动时刻」切秒，
 *    页面上那一秒永远比系统时钟偏一点。先 setTimeout 到下一个整秒边界再起 interval。
 * 3. **回到前台要立刻补一次**：后台标签页里定时器被浏览器压到每分钟甚至冻结，
 *    切回来时若只等下一个 tick，会显示一段过期的时间。visibilitychange 里同步一次。
 *
 * 代价：每秒一次文本更新（三个短字符串，均在同一个面板内），无布局影响之外的开销。
 * 没有做「减少动效」分叉：这不是动画，是数值刷新（14-mascot / reveal 那类做法针对的是位移与淡入）。
 */
(() => {
    'use strict';

    const el = document.querySelector('.home-clock');
    if (!el) {
        return;
    }

    const read = (key) => (el.dataset[key] || '');
    const pad = (n) => (n < 10 ? '0' + n : String(n));

    let dows = [];
    try {
        dows = JSON.parse(read('dows') || '[]');
    } catch (e) {
        dows = [];
    }
    const dateTpl = read('date');

    const hm = el.querySelector('.home-clock-hm');
    const sec = el.querySelector('.home-clock-sec');
    const dateEl = el.querySelector('.home-clock-date');
    const greetEl = el.querySelector('.home-clock-greet');

    const greetFor = (h) => {
        if (h >= 5 && h < 11) return read('morning');
        if (h >= 11 && h < 13) return read('noon');
        if (h >= 13 && h < 18) return read('afternoon');
        if (h >= 18 && h < 23) return read('evening');
        return read('late');
    };

    const tick = () => {
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();

        hm.textContent = pad(h) + ':' + pad(m);
        sec.textContent = pad(now.getSeconds());
        dateEl.textContent = dateTpl
            .replace('{y}', String(now.getFullYear()))
            .replace('{m}', String(now.getMonth() + 1))
            .replace('{d}', String(now.getDate()));
        /* 星期几从 data-dows 里取：下标与 Date.getDay() 对齐（0 = 周日），
           取不到就留空，不退回英文或数字 —— 宁可不显示，也不显示一个语言不对的东西。 */
        greetEl.textContent = [dows[now.getDay()] || '', greetFor(h)].filter(Boolean).join(' · ');
    };

    const start = () => {
        tick();
        el.removeAttribute('data-pending');
        /* 先对齐到下一个整秒边界，再按秒走 */
        window.setTimeout(() => {
            tick();
            window.setInterval(tick, 1000);
        }, 1000 - (Date.now() % 1000));
    };

    start();

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            tick();
        }
    });
})();
