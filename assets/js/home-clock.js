/* 首页右栏的时间卡：把当前时间、「今天/今年已过多少」、本月打卡月历与「今日一卡」写进 .home-clock。
 *
 * 由 extend_head.html 只在首页加载。结构在 layouts/_partials/home-clock.html，
 * 样式在 assets/css/extended/09-home.css 的「首页时间卡」一节。
 *
 * 六条边界：
 * 1. **面板出厂是隐藏的**（模板上带 `data-pending="1"`），第一帧填好内容才摘掉 ——
 *    静态站没有「服务端时间」可用，先显示再纠正会闪一下错的时间，宁可晚一帧出现。
 *    没有 JS 时这块整个不出现（与 #bottom-link 同一套做法）。
 * 2. **对齐到整秒再加定时器**：直接 setInterval(1000) 会按「脚本启动时刻」切秒，
 *    页面上那一秒永远比系统时钟偏一点。先 setTimeout 到下一个整秒边界再起 interval。
 * 3. **回到前台要立刻补一次**：后台标签页里定时器被浏览器压到每分钟甚至冻结，
 *    切回来时若只等下一个 tick，会显示一段过期的时间。visibilitychange 里同步一次。
 * 4. **每秒真的动手的只有文本与两处变换**：进度条填充用 `scaleX(--p)`（不是改 width），
 *    今日轴的游标用 `translateX(calc(--p * 100cqw))`（不是改 left）—— 这两个量合成器能接管，
 *    改 width/left 会让浏览器每秒对面板做一次布局。轴的**百分比数字与剩余时间是文本**，
 *    那部分躲不开，是目前每秒唯一的重排来源。
 * 5. **只有「日」变了才重建月历 / mini 条 / 今日一卡**：这三块由「今天几号」决定，
 *    每秒重建三十来个节点纯属浪费。用一个「年-月-日」签名挡着。
 * 6. **今日一卡从卡片组的清单里抽，不另抄一份数据**：`.home-deck` 的 `data-deck` 已经带着
 *    全部 63 张的图 URL、名字、系列、等级（约 13KB），再抄一份进这块就是白涨体积。**2026-09-21
 *    起，抽的范围是「卡片组正在用的那一份」而不是整副**：首页每天只展示随机 12 张
 *    （home-deck.js 的 data-deck-daily），这块按下标调 openAt，池子不一致会静默点不动 ——
 *    所以走 `deckPool()`：优先读卡片组暴露的 `window.homeDeck.items`，读不到才退回整副 63 张。
 *    代价仍是两处耦合：清单读不到（卡片组那块被摘掉）时今日一卡整块不出现 —— 符合
 *    「宁可没有，也不给一个错的」；点击要调卡片组暴露的 `window.homeDeck.openAt`。
 *
 * 代价：每秒一次文本与两个 transform 更新，都在这块面板内。
 * 没有做「减少动效」分叉：这不是动画，是数值刷新（14-mascot / reveal 那类做法针对的是位移与淡入）；
 * 今日一卡抽到奇迹时的显形也只是换一组 CSS 令牌，没有过渡。
 */
(() => {
    'use strict';

    const el = document.querySelector('.home-clock');
    if (!el) {
        return;
    }

    const read = (key) => (el.dataset[key] || '');
    const pad = (n) => (n < 10 ? '0' + n : String(n));
    /* 占位符替换：一律**单花括号** {n} / {p}{h}{m}（与 searchResultCount 同一套写法）。
       用正则一次替全部，而不是逐条 .replace —— 「已过 {p} · 还剩 {h} 小时 {m} 分」有三个不同的
       占位符，漏一个就会把 {m} 原样显示给访客，而且不报错。 */
    const tpl = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));

    const json = (key, fallback) => {
        try {
            const v = JSON.parse(read(key) || '');
            return v == null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    };

    const dows = json('dows', []);
    const calDows = json('calDows', []);
    /* 打卡日：模板按 .Lastmod（git 时间）去重后的「年-月-日」字符串。放进 Set 里按日期查，
       比每次遍历数组干净（月历每次重建要查三十来次）。 */
    const markedDays = new Set(json('days', []));

    const hm = el.querySelector('.home-clock-hm');
    const sec = el.querySelector('.home-clock-sec');
    /* 注意：要写进 `.home-clock-date-main` 这个**子 span**，不能写 `.home-clock-date` ——
       后者里面还装着问候语那个 span，往父节点写 textContent 会把兄弟节点一起抹掉
       （实测：问候语从此再也不显示，而 DOM 里那个 span 也消失了）。 */
    const dateEl = el.querySelector('.home-clock-date-main');
    const greetEl = el.querySelector('.home-clock-greet-inline');
    const footEl = el.querySelector('.home-clock-foot');
    const barYear = el.querySelector('[data-meter="year"]');
    const valYear = el.querySelector('[data-val="year"]');

    /* 今日 24 小时轴 */
    const axisFill = el.querySelector('[data-axis-fill]');
    const axisCursor = el.querySelector('[data-axis-cursor]');
    const axisVal = el.querySelector('[data-axis-val]');
    /* 打卡月历（高档）与「本月 mini 条」（矮档）：两套标记都在文档里，由 CSS 按断点二选一 */
    const calMonth = el.querySelector('[data-cal-month]');
    const calStat = el.querySelector('[data-cal-stat]');
    const calGrid = el.querySelector('[data-cal-grid]');
    const monthEl = el.querySelector('.home-clock-month');
    const monthVal = el.querySelector('[data-month-val]');
    const monthStrip = el.querySelector('[data-month-strip]');
    /* 今日一卡 */
    const dailyBtn = el.querySelector('.home-clock-daily');
    const dailyFace = el.querySelector('.home-clock-daily-face');
    const dailyArt = el.querySelector('.home-clock-daily-art');
    const dailyName = el.querySelector('.home-clock-daily-name');
    const dailyMeta = el.querySelector('.home-clock-daily-meta');
    const dailyStatus = el.querySelector('[data-daily-status]');

    const DAY = 86400000;

    /* 卡片组清单：读同页 `.home-deck` 已经带在文档里的那份（见文件头第 6 条）。
       注意它不在 `.home-clock` 上，所以不能走 read()/json() 那两个按 el.dataset 取的助手。
       读不到就整块不出 —— 按钮一直带着 data-pending，CSS 里就是 display:none。

       **2026-09-21：优先用卡片组算好的那一份**（`window.homeDeck.items`）。首页每天只展示清单里
       随机 12 张（见 home-deck.js 的 data-deck-daily），而这里的抽取是**按下标**调 openAt 的 ——
       两边池子不一致的表现是「点微卡没反应」：下标在那 12 张里越界，被 openAt 的边界判断挡掉，
       不报任何错。所以池子只有「卡片组正在用的那一份」这一个来源，下面这份 63 张只是它没跑起来时的兜底。
       取用时机是安全的：deckPool() 在 tick() 里被调，而首次 tick 排在「字体就绪 + 对齐到整秒」之后，
       那时 home-deck.js（同为 defer，排在本文件之后）早已执行完。 */
    const deckEl = document.querySelector('.home-deck');
    let fullItems = [];
    if (deckEl) {
        try {
            const parsed = JSON.parse(deckEl.dataset.deck || '[]');
            if (Array.isArray(parsed)) fullItems = parsed;
        } catch (e) {
            fullItems = [];
        }
    }

    function deckPool() {
        const live = window.homeDeck && window.homeDeck.items;
        return (Array.isArray(live) && live.length) ? live : fullItems;
    }

    const greetFor = (h) => {
        if (h >= 5 && h < 11) return read('morning');
        if (h >= 11 && h < 13) return read('noon');
        if (h >= 13 && h < 18) return read('afternoon');
        if (h >= 18 && h < 23) return read('evening');
        return read('late');
    };

    const ymd = (y, m0, d) => y + '-' + pad(m0 + 1) + '-' + pad(d);

    /* ---------- 本月打卡月历 ---------- */

    /* 「连续 N 天」的口径：**从今天往回数**；今天还没记录就从昨天起算（那是「正在继续的那一段」），
       昨天也没有就是 0。与 GitHub 贡献图那套直觉一致：昨天写了、今天还没写，不该把连续清零。 */
    function streakEndingToday(y, m0, d) {
        const start = new Date(y, m0, d);
        if (!markedDays.has(ymd(y, m0, d))) {
            start.setDate(start.getDate() - 1);          // 今天还没写：退到昨天看
            if (!markedDays.has(ymd(start.getFullYear(), start.getMonth(), start.getDate()))) return 0;
        }
        let n = 0;
        const cur = new Date(start);
        while (markedDays.has(ymd(cur.getFullYear(), cur.getMonth(), cur.getDate()))) {
            n += 1;
            cur.setDate(cur.getDate() - 1);
        }
        return n;
    }

    /* 网格按**周一起排**（第一列是周一，与表头那组单字 key 对齐）：
       `getDay()` 是 0=周日，所以 (dow + 6) % 7 换成「周一=0」，否则整张表会错位一格。 */
    function renderCalendar(y, m0, today) {
        const daysInMonth = new Date(y, m0 + 1, 0).getDate();
        const lead = (new Date(y, m0, 1).getDay() + 6) % 7;
        const frag = document.createDocumentFragment();
        const add = (cls, text) => {
            const s = document.createElement('span');
            if (cls) s.className = cls;
            if (text != null) s.textContent = text;
            frag.appendChild(s);
        };
        calDows.forEach((d) => add('home-clock-cal-dow', d));
        for (let k = 0; k < lead; k += 1) add('');            // 月首前那几个空格
        let marks = 0;
        for (let d = 1; d <= daysInMonth; d += 1) {
            const on = markedDays.has(ymd(y, m0, d));
            if (on) marks += 1;
            let cls = 'home-clock-cal-day';
            if (on) cls += ' is-mark';
            if (d === today) cls += ' is-today';
            add(cls, d);
        }
        /* 用 replaceChildren 一次换掉整棵子树，而不是 `textContent = ''` + append：
           这一步以后要重建很多次，一次性换掉最不容易留下半截旧节点。（别往**有兄弟节点**的
           父节点写 textContent —— 那是 features.md ㊾。） */
        calGrid.replaceChildren(frag);
        calMonth.textContent = tpl(read('calMonth'), { y: y, m: m0 + 1 });
        const streak = streakEndingToday(y, m0, today);
        calStat.textContent = marks === 0
            ? read('calEmpty')
            : [tpl(read('calRecords'), { n: marks })]
                .concat(streak > 0 ? [tpl(read('calStreak'), { n: streak })] : [])
                .join(' · ');
    }

    /* ---------- 矮档（1024~1400px）的「本月 mini 条」 ---------- */

    let monthTicks = null;
    function renderMonthStrip(y, m0, today, dayPct) {
        const daysInMonth = new Date(y, m0 + 1, 0).getDate();
        const frag = document.createDocumentFragment();
        for (let d = 1; d <= daysInMonth; d += 1) {
            const i = document.createElement('i');
            if (d < today) i.className = 'is-past';
            else if (d === today) {
                i.className = 'is-today';
                i.style.setProperty('--p', dayPct.toFixed(4));
            }
            frag.appendChild(i);
        }
        monthStrip.replaceChildren(frag);
        monthVal.textContent = Math.floor(((today - 1 + dayPct) / daysInMonth) * 100) + '%';
        /* 刻度 1 / 10 / 20 / 当月最后一天：最后那个跟着月份走（28~31），所以它在脚本里生成
           而不是模板里写死。刻度容器只建一次，之后只换里面的文字。 */
        if (!monthTicks) {
            monthTicks = document.createElement('div');
            monthTicks.className = 'home-clock-month-ticks';
            monthTicks.setAttribute('aria-hidden', 'true');
            monthEl.appendChild(monthTicks);
        }
        monthTicks.replaceChildren.apply(monthTicks, [1, 10, 20, daysInMonth].map((n) => {
            const s = document.createElement('span');
            s.textContent = n;
            return s;
        }));
    }

    /* ---------- 今日一卡 ---------- */

    /* 等级权重：与 data/home-cards.yaml 里实际的张数一致（六档 24/13/11/8/6/1 张 → 100 的权重表）。
       它决定「今天翻到哪个档」，所以**必须跟着阶梯一起改**：漏掉一档的表现是那一档的卡永远抽不到
       （档内为空时会退回收藏档，所以不会抽不出东西 —— 只是那一档静默消失了，页面上看不出来）。
       奇迹那张「1 张」翻成 1% 的档位权重是刻意的：一年里大约 3~4 天能抽到，而它仍是全场唯一一张。 */
    const RANK_WEIGHT = [['collector', 38], ['rare', 21], ['epic', 17],
                         ['arcane', 13], ['legend', 10], ['miracle', 1]];

    /* 定值散列 → [0,1)：**不能用 Math.random**（同一个日期要抽出同一张），也不能依赖浮点中间
       结果（不同引擎的最后一位可能不同）。这个混合是纯整数运算（Math.imul 保证 32 位）。 */
    function hash01(n) {
        let x = n | 0;
        x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
        x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
        x ^= x >>> 16;
        return (x >>> 0) / 4294967296;
    }

    /* 先按权重落档，再在档内均匀取一张 —— 与「稀有度」这个说法对得上。
       档内为空（比如清单里还没有奇迹卡）就退回收藏档，不至于抽不出东西。 */
    function pickDaily(seed) {
        const total = RANK_WEIGHT.reduce((a, t) => a + t[1], 0);
        const r = hash01(seed) * total;
        let acc = 0;
        let rank = 'collector';
        for (let k = 0; k < RANK_WEIGHT.length; k += 1) {
            acc += RANK_WEIGHT[k][1];
            if (r < acc) { rank = RANK_WEIGHT[k][0]; break; }
        }
        const items = deckPool();
        let pool = [];
        items.forEach((it, idx) => { if ((it.rank || 'collector') === rank) pool.push(idx); });
        if (!pool.length) {
            items.forEach((it, idx) => { if ((it.rank || 'collector') === 'collector') pool.push(idx); });
        }
        if (!pool.length) return null;
        return pool[Math.floor(hash01(seed ^ 0x51ed270b) * pool.length)];
    }

    /* 抽到奇迹**就显形**：这是刻意加的第三条显形入口（另两条在卡片组）。前两条是「自己发现」
       （转满一圈之类），这一条是「抽到的那一下告诉你」—— 每日一卡没有回报时刻就只是个随机器。
       显形只是换一组 CSS 令牌（.is-revealed），没有动画。播报**只在换日时**做：
       首屏不播 —— 页面刚打开就念一串话会打断读屏用户正在做的事。 */
    function renderDaily(seed, announce) {
        const items = deckPool();
        if (!dailyBtn || !items.length) return;
        const idx = pickDaily(seed);
        if (idx == null) return;
        const it = items[idx];
        if (!it || !it.s) return;
        dailyArt.src = it.s;
        dailyArt.srcset = it.s + ' 1x, ' + (it.l || it.s) + ' 2x';
        dailyName.textContent = it.label || '';
        dailyMeta.textContent = [it.series, it.rankLabel].filter(Boolean).join(' · ');
        /* 等级类按前缀清掉旧的再加新的 —— 与卡片组 apply() 同一套做法：写死清单就会漏，
           而漏了不报错，只是这块的框停在上一个等级上。 */
        Array.prototype.slice.call(dailyFace.classList).forEach((cls) => {
            if (cls.indexOf('home-card-rank--') === 0) dailyFace.classList.remove(cls);
        });
        dailyFace.classList.add('home-card-rank--' + (it.rank || 'collector'));
        const miracle = it.rank === 'miracle';
        dailyFace.classList.toggle('is-revealed', miracle);
        dailyBtn.setAttribute('aria-label', tpl(read('dailyAria'), {
            label: it.label || '', series: it.series || '', rank: it.rankLabel || ''
        }));
        dailyBtn.dataset.deckIndex = String(idx);
        if (miracle && announce && dailyStatus) {
            dailyStatus.textContent = tpl(read('dailyReveal'), { label: it.label || '' });
        }
        dailyBtn.removeAttribute('data-pending');
    }

    /* 点击：开那张卡的 3D 弹层（并让左栏卡片组翻到它）。入口由 home-deck.js 暴露 ——
       弹层与当前索引都在那个闭包里，不开这个口子外面拿不到。第二个参数是触发者，
       弹层关闭时焦点才还得到这颗按钮（见 home-deck.js 里 closeDialog 的注释）。 */
    if (dailyBtn) {
        dailyBtn.addEventListener('click', () => {
            const idx = parseInt(dailyBtn.dataset.deckIndex, 10);
            if (Number.isNaN(idx)) return;
            if (window.homeDeck && typeof window.homeDeck.openAt === 'function') {
                window.homeDeck.openAt(idx, dailyBtn);
            }
        });
    }

    /* ---------- 每秒那一次 ---------- */

    /* 上一次渲染「按日」内容的签名：只有跨日（或跨月）才重建月历、mini 条与今日一卡 ——
       今日一卡也挂在这里，它由「今天是第几天」决定，页面开着过夜时该跟着换一张。 */
    let daySig = '';

    const tick = () => {
        const now = new Date();
        const h = now.getHours();
        const y = now.getFullYear();

        hm.textContent = pad(h) + ':' + pad(now.getMinutes());
        sec.textContent = pad(now.getSeconds());
        /* 日期行带上星期几：星期从 data-dows 里取，下标与 Date.getDay() 对齐（0 = 周日），
           取不到就只显示日期，不退回英文或数字 —— 宁可不显示，也不显示一个语言不对的东西。 */
        dateEl.textContent = [
            tpl(read('date'), { y: y, m: now.getMonth() + 1, d: now.getDate() }),
            dows[now.getDay()] || ''
        ].filter(Boolean).join(' ');
        greetEl.textContent = greetFor(h);

        /* 今年这条进度按「本地时间的今年」算：长度用「明年的起点减今年的起点」，
           闰年自动是 366 天，不必自己判断。今天的起点用 new Date(y, m, d)，
           它按本地时区构造，跨夏令时那天也不会差一小时（直接减 86400000 会差）。 */
        const dayStart = new Date(y, now.getMonth(), now.getDate());
        const dayEnd = new Date(y, now.getMonth(), now.getDate() + 1);
        const yearStart = new Date(y, 0, 1);
        const yearEnd = new Date(y + 1, 0, 1);
        const dayPct = (now - dayStart) / DAY;                 // 0~1，直接给变换用
        const yearPct = (now - yearStart) / (yearEnd - yearStart);
        const dayOfYear = Math.floor((now - yearStart) / DAY) + 1;
        const yearDays = Math.round((yearEnd - yearStart) / DAY);

        if (barYear) barYear.style.setProperty('--p', yearPct.toFixed(4));
        if (valYear) valYear.textContent = Math.floor(yearPct * 100) + '%';

        /* 今日那条 24 小时轴：填充与游标都只动 transform（见文件头第 4 条），
           右端那句是「已过 46% · 还剩 12 小时 57 分」。 */
        const leftMin = Math.max(0, Math.floor((dayEnd - now) / 60000));
        if (axisFill) axisFill.style.setProperty('--p', dayPct.toFixed(4));
        if (axisCursor) axisCursor.style.setProperty('--p', dayPct.toFixed(4));
        if (axisVal) {
            axisVal.textContent = tpl(read('axisLast'), {
                p: Math.floor(dayPct * 100) + '%',
                h: Math.floor(leftMin / 60),
                m: pad(leftMin % 60)
            });
        }

        const sig = ymd(y, now.getMonth(), now.getDate());
        if (sig !== daySig) {
            const first = daySig === '';            // 首屏不播报（见 renderDaily 的注释）
            daySig = sig;
            renderCalendar(y, now.getMonth(), now.getDate());
            renderMonthStrip(y, now.getMonth(), now.getDate(), dayPct);
            renderDaily(y * 1000 + dayOfYear, !first);
        } else if (monthStrip) {
            /* 同一天之内：只有「今天」那一格与百分比在动，重建整条没必要 */
            const cell = monthStrip.querySelector('.is-today');
            if (cell) cell.style.setProperty('--p', dayPct.toFixed(4));
            const daysInMonth = new Date(y, now.getMonth() + 1, 0).getDate();
            monthVal.textContent = Math.floor(((now.getDate() - 1 + dayPct) / daysInMonth) * 100) + '%';
        }

        footEl.textContent = [
            tpl(read('dayOfYear'), { n: dayOfYear }),
            tpl(read('yearLeft'), { n: yearDays - dayOfYear })
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

    /* 宽度跨过 1400 那条断点时，卡会从 306 高跳到 436（竖直方向可分配的空间变了），
       月历与 mini 条由 CSS 二选一显示、脚本不用换数据 —— 但显示的那一套要重排一次。 */
    if (window.matchMedia) {
        const mq = window.matchMedia('(min-width: 1024px) and (max-width: 1400px)');
        const onTier = () => { if (daySig) tick(); };
        if (mq.addEventListener) mq.addEventListener('change', onTier);
        else if (mq.addListener) mq.addListener(onTier);
    }
})();
