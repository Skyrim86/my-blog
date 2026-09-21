/* 首页右栏的时间卡：把当前时间与「今天/今年已过多少」写进 .home-clock，并按秒更新。
 *
 * 由 extend_head.html 只在首页加载。结构在 layouts/_partials/home-clock.html，
 * 样式在 assets/css/extended/09-home.css 的「首页时间卡」一节。
 *
 * 四条边界：
 * 1. **面板出厂是隐藏的**（模板上带 `data-pending="1"`），第一帧填好内容才摘掉 ——
 *    静态站没有「服务端时间」可用，先显示再纠正会闪一下错的时间，宁可晚一帧出现。
 *    没有 JS 时这块整个不出现（与 #bottom-link 同一套做法）。
 * 2. **对齐到整秒再加定时器**：直接 setInterval(1000) 会按「脚本启动时刻」切秒，
 *    页面上那一秒永远比系统时钟偏一点。先 setTimeout 到下一个整秒边界再起 interval。
 * 3. **回到前台要立刻补一次**：后台标签页里定时器被浏览器压到每分钟甚至冻结，
 *    切回来时若只等下一个 tick，会显示一段过期的时间。visibilitychange 里同步一次。
 * 4. **进度条的填充只动 transform**（`scaleX(--p)`），不改 width：这条每秒都在更新，
 *    改 width 会让浏览器每秒对面板做一次布局，而 scaleX 是合成器能接管的量。
 *
 * 代价：每秒一次文本与两个 transform 更新，都在这块面板内。
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
    const fillOf = (tpl, n) => tpl.replace('{n}', String(n));

    let dows = [];
    try {
        dows = JSON.parse(read('dows') || '[]');
    } catch (e) {
        dows = [];
    }

    const hm = el.querySelector('.home-clock-hm');
    const sec = el.querySelector('.home-clock-sec');
    /* 注意：要写进 `.home-clock-date-main` 这个**子 span**，不能写 `.home-clock-date` ——
       后者里面还装着问候语那个 span，往父节点写 textContent 会把兄弟节点一起抹掉
       （实测：问候语从此再也不显示，而 DOM 里那个 span 也消失了）。 */
    const dateEl = el.querySelector('.home-clock-date-main');
    const greetEl = el.querySelector('.home-clock-greet-inline');
    const footEl = el.querySelector('.home-clock-foot');
    const barDay = el.querySelector('[data-meter="day"]');
    const barYear = el.querySelector('[data-meter="year"]');
    const valDay = el.querySelector('[data-val="day"]');
    const valYear = el.querySelector('[data-val="year"]');

    const DAY = 86400000;

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
        const y = now.getFullYear();

        hm.textContent = pad(h) + ':' + pad(now.getMinutes());
        sec.textContent = pad(now.getSeconds());
        /* 日期行带上星期几：星期从 data-dows 里取，下标与 Date.getDay() 对齐（0 = 周日），
           取不到就只显示日期，不退回英文或数字 —— 宁可不显示，也不显示一个语言不对的东西。 */
        dateEl.textContent = [
            read('date')
                .replace('{y}', String(y))
                .replace('{m}', String(now.getMonth() + 1))
                .replace('{d}', String(now.getDate())),
            dows[now.getDay()] || ''
        ].filter(Boolean).join(' ');
        greetEl.textContent = greetFor(h);

        /* 两条进度都按「本地时间的今天/今年」算：
           今天的起点用 new Date(y, m, d)，它按本地时区构造，跨夏令时那天也不会差一小时
           （直接减 86400000 会差）。今年的长度同理：用「明年的起点减今年的起点」，
           闰年自动是 366 天，不必自己判断。 */
        const dayStart = new Date(y, now.getMonth(), now.getDate());
        const yearStart = new Date(y, 0, 1);
        const yearEnd = new Date(y + 1, 0, 1);
        const dayPct = ((now - dayStart) / DAY) * 100;
        const yearPct = ((now - yearStart) / (yearEnd - yearStart)) * 100;
        const dayOfYear = Math.floor((now - yearStart) / DAY) + 1;
        const yearDays = Math.round((yearEnd - yearStart) / DAY);

        if (barDay) barDay.style.setProperty('--p', (dayPct / 100).toFixed(4));
        if (barYear) barYear.style.setProperty('--p', (yearPct / 100).toFixed(4));
        if (valDay) valDay.textContent = Math.floor(dayPct) + '%';
        if (valYear) valYear.textContent = Math.floor(yearPct) + '%';
        footEl.textContent = [
            fillOf(read('dayOfYear'), dayOfYear),
            fillOf(read('yearLeft'), yearDays - dayOfYear)
        ].join(' · ');
    };

    /* **等字体就绪再填第一帧**：数字用的是自托管的艺术字体（font-display: block），
       字体没到就先填内容的话，会先按系统字体画一遍、字体到了再跳一下。
       面板本来就是隐藏的，等多这一下不花额外代价；给 1.2s 上限是为了万一字体加载失败
       也让时钟照常出现（退回系统字体总比空着强）。 */
    const fontReady = (document.fonts && document.fonts.load)
        ? Promise.race([
            document.fonts.load('600 3.1rem RoseClock').catch(() => {}),
            new Promise((r) => window.setTimeout(r, 1200))
        ])
        : Promise.resolve();

    const boot = () => {
        tick();
        el.removeAttribute('data-pending');
        /* 先对齐到下一个整秒边界，再按秒走 */
        window.setTimeout(() => {
            tick();
            window.setInterval(tick, 1000);
        }, 1000 - (Date.now() % 1000));
    };

    fontReady.then(boot);

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            tick();
        }
    });
})();
