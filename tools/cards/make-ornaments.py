#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""卡面纹样的生成器：产出**变宽轮廓**的纹样令牌与数学曲线徽记。

## 现在这一批是什么（2026-09-25 清过一次）

只剩两类：**星屑夜天**（`--tex-starfield`，一张 mask 图）与**六档的数学曲线徽记**
（`--mark-*`，五个 `polygon()`；最低档的圆走 `border-radius: 50%`，不进这个文件）。

清掉的 13 个令牌（`--tex-flake1..3` / `--tex-crack` / `--tex-cloison` / `--tex-fret-*`）
在 2026-09-24 的等级层重做后全部失去了消费者：等级层把「框」统一成一副几何（花纹走 `--pat-*`、
色带走 `--rank-strip`），雕花框那套零件整副撤掉。**清除是按名字删的，所以删完必须重跑一次
并把令牌名单与原名单 diff**（`git diff --stat` 看不出删错没删错）。

## 下面三节是已删实现的历史记录（讲的是雪花 / 裂缝 / 雕花框）

留着是因为它们解释了 `band()`（变宽轮廓）为什么存在 —— 星屑的流星仍走它。

把「等宽描边画直线」换成**有粗细变化的填充轮廓**，并产出雕花框那套零件。

用法（与 tools/cards/ 那几个脚本同一个解释器）：
    C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/make-ornaments.py

产物（**生成物，入库；不要手改**）：`assets/css/decks/20-card-ornaments.css`
—— 一个只装自定义属性的令牌文件，里面的每个令牌都是一张 data-URI 的 SVG。
为什么单出一个**生成**的 CSS 文件：手写的 21-card-deck.css 里已经有一堆纹样令牌，
而这一批是脚本产出的（几百个坐标点）、且改了生成规则就该整体重出 —— 混在一个文件里
会让「哪些能手改、哪些不能」变得靠记忆。文件名以 20- 开头，主题按数字序合并，排在 21- 之前。

## 为什么要重做（2026-09-21，用户：「雪华、金边、金继的线条生硬」）

诊断在数据里：旧的三张纹样令牌全是**等宽描边画在直线段上** —— 雪花是 `L` 直线段 + 每条
统一 `stroke-width`（1.33/1.90/1.18/…）+ 完美镜像；金继是 5 条固定折线在 4 个固定线宽
（7.5/3.2/2.0/1.1）上重复、**没有一处交叉**。等宽 = 尺子画的，这是根本原因（不是审美偏好）。

三条可执行的几何规则（来源见下），每一条都能在下面的代码里找到对应参数：

1. **宽度必须变化，而且向尖端收到 0**（`band(w0, w1=0)`）。真雪花的枝是向尖端收细的
   paraboloid、末梢是一个点；真金继的缝是**裂缝的开口**，向两端收细、在交叉处变宽。
   —— snowcrystals.com（Libbrecht/Caltech）的 dendrite 生长页；arXiv 2501.07882（干裂纹层级结构）、
   cond-mat/0609104（脆性材料的分叉判据）。
2. **准对称，不是完美对称**：六枝各自 ±2° 抖动、长度 ±8%；同一枝**两侧不镜像**
   （真实生长里两侧的侧枝各自独立）。雪花的侧枝**越靠尖端越短**、递归只分两级
   （「real snowflakes are only slightly fractal」），等距平铺的侧枝正是机械感的来源。
   —— snowcrystals.com/branching（"erratically spaced, with little symmetry between the
   branches, or even between the two sides of a single branch"）。
3. **层级继承**：子缝比母缝细且短（本文件取 0.75 / 0.5），沿生长方向宽度递减，
   密度在一个起点附近最大 —— 这三点是 inconvergent.net/generative/fractures 描述的做法
   （它的代码是无授权声明的，所以这里按那篇的思路自己实现，没有抄代码）。

**但雕花框那套零件相反：那里等宽是**对的**。鎏金画框的边栏、宝石的切面、珐琅的格线
本来就是等宽线（真东西也是），所以那些零件照旧用 `stroke`，只有**有机形状**（雪、裂缝、
卷草）才用变宽的 band。

## 授权

「去网上搜好素材」这条路的结果是：没有能直接用的。Kenney 的 Fantasy UI Borders 是 CC0 但
是方块游戏 UI 的九宫格；game-icons.net 是 CC BY 3.0（要页脚署名 + NOTICE 文件）且只有单件花纹、
没有整张卡框；Wikimedia / Openclipart / SVG Repo 从本机连不上；Pixabay 只发 PNG 且条款里
「改色缩放仍算原样分发」对「把素材提交进公开仓库」有风险。所以这里**自己生成**：
零授权负担、参数可调、和仓库里 tools/ 那套「本地生成、产物入库」的做法一致。
"""
import math
import os
import random
from urllib.parse import quote

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "assets", "css", "decks", "20-card-ornaments.css")


# ---------------------------------------------------------------- 基础：平滑与变宽轮廓

def spline(pts, per_seg=7):
    """Catmull-Rom 过点插值 → 平滑折线。**不要手写贝塞尔控制点**：控制点手凑出来的曲线
    曲率变化不自然（这是上一版看着「硬」的第二个原因）。过点插值只需给几个「脊柱点」，
    剩下的交给样条。"""
    if len(pts) == 2:
        return [pts[0], pts[1]]
    P = [pts[0]] + list(pts) + [pts[-1]]
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for j in range(per_seg):
            t = j / per_seg
            t2, t3 = t * t, t * t * t
            out.append((
                0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t
                       + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
                       + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
                0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t
                       + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
                       + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
            ))
    out.append(pts[-1])
    return out


def band(pts, w0, w1=0.0, taper=0.85, per_seg=1, dec=0):
    """一条**脊柱折线** → 有粗细变化的**闭合填充轮廓**（一段 `d`）。

    这是整个文件的核心：`w(t) = w0 + (w1-w0)·t^taper`，沿法线左右各偏移半宽，
    首尾相接成一个闭合多边形。`w1=0` 时末梢收成一个点 —— 真雪花的枝、真裂缝的尖端都是这样。
    等宽描边（旧做法）无论怎么调参数都画不出这个收尖，这是「生硬」的根源。

    taper < 1 让收细发生得更早（靠近根部就明显变细），> 1 则大部分长度保持宽度、末端才收。

    **`per_seg=1` 表示不做样条重采样**（脊柱点直接当轮廓顶点），这是默认值，理由是字节账：
    第一版每条线都过样条、坐标留一位小数，整批令牌 95 KB（单张雪花 20 KB）。而 272px 上
    让线条读起来「手画的」是收尖 + 抖动 + 侧枝渐短这三件事，样条那点平滑在那个尺寸**看不见**；
    反过来裂缝、冰裂在真实里本来就是两三个折点一段的**棱角**线（平滑反而不像）。
    只有卷草那种要「圆」的地方才给 per_seg>1。坐标取整（dec=0）：1 单位 = 1px，误差看不出来。
    """
    sp = spline(pts, per_seg) if per_seg > 1 else pts
    n = len(sp)
    left, right = [], []
    for i, (x, y) in enumerate(sp):
        t = i / max(1, n - 1)
        hw = (w0 + (w1 - w0) * (t ** taper)) / 2
        if i == 0:
            dx, dy = sp[1][0] - x, sp[1][1] - y
        elif i == n - 1:
            dx, dy = x - sp[-2][0], y - sp[-2][1]
        else:
            dx, dy = sp[i + 1][0] - sp[i - 1][0], sp[i + 1][1] - sp[i - 1][1]
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L, dx / L
        left.append((x + nx * hw, y + ny * hw))
        right.append((x - nx * hw, y - ny * hw))
    poly = left + right[::-1]
    d = "M" + "L".join(f"{px:.{dec}f} {py:.{dec}f}" for px, py in poly) + "Z"
    return d


def circle(cx, cy, r, dec=1):
    return f"M{cx - r:.{dec}f} {cy:.{dec}f}a{r:.{dec}f} {r:.{dec}f} 0 1 0 {2 * r:.{dec}f} 0a{r:.{dec}f} {r:.{dec}f} 0 1 0 {-2 * r:.{dec}f} 0Z"


# ---------------------------------------------------------------- 有机纹样



def starfield(seed, w=272.0, h=381.0, n=26):
    """星屑夜天：疏密不匀的星点 + 几道流星痕。

    刻意**不做等距平铺**（用户对「整齐排列铺满」的评价是「很呆」，见 yukika 那条旧注释）：
    星点位置随机、大小差 4 倍、亮度分三档，另加 3 道短促的流星（两头收尖的变宽轮廓）。
    """
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = rng.uniform(0, w), rng.uniform(0, h)
        r = rng.choice((0.9, 1.3, 1.9, 2.8))
        out.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="#fff" opacity="{rng.choice((0.45, 0.7, 1.0)):.2f}"/>')
    for _ in range(3):
        x, y = rng.uniform(0.1, 0.9) * w, rng.uniform(0.1, 0.9) * h
        a = rng.uniform(0, 2 * math.pi)
        L = rng.uniform(0.10, 0.20) * w
        out.append(band([(x, y), (x + math.cos(a) * L, y + math.sin(a) * L)], 2.6, 0.0, taper=1.2))
    return "".join(out)


# ---------------------------------------------------------------- 打包

def svg(body, w, h, viewbox=None):
    vb = viewbox or f"0 0 {w:.0f} {h:.0f}"
    return (f"<svg xmlns='http://www.w3.org/2000/svg' width='{w:.0f}' height='{h:.0f}' "
            f"viewBox='{vb}' preserveAspectRatio='none'>{body}</svg>")


def uri(body, w, h, viewbox=None):
    """data-URI。转义集照抄 21-card-deck.css 里那批已有令牌的写法：`<` `>` `=` `"` 与**空格**
    都要转（空格转成 `%20`），不转的话在部分解析器里会被当成参数分隔。`safe` 里留的都是
    data-URI 里合法的字符，`'` 留着（SVG 属性用单引号，比 `%22` 省两个字节）。"""
    s = svg(body, w, h, viewbox)
    return "url(\"data:image/svg+xml," + quote(s, safe="/:;,'()-._~!*") + "\")"


# ============================================================
# 数学曲线徽记（2026-09-21 第三轮：把「等级标」从手搓多边形换成真曲线）
# ============================================================
#
# 为什么换成**真曲线采样**而不是继续手写 polygon：
#   六档的徽记原来是一串手搓的百分比（圆点靠 border-radius、菱形/星/盾/皇冠各一串
#   `polygon(50% 0%, 61% 35%, …)`）。那些形状**没有方程** —— 想调整一下「星芒的凹度」
#   就只能重数一遍坐标，而每次手改都可能把对称性碰坏（且看不出来）。
#   换成真曲线之后，形状由方程定，参数只有一个（k、R/r、采样密度），改「五瓣还是七瓣」
#   是一行的事。这一条与 tools/ 那套「本地生成、产物入库」完全同构。
#
# 采样成**密多边形**而不是别的载体，有两个硬理由：
#   1. **可缩放**：clip-path 的 polygon 用百分比，13px 与 22px 共用一条令牌；
#      `path()` 是用户单位、不随元素缩放，`mask-image` 又多一层合成，都不如它直接。
#   2. **零新机制**：`--rank-mark` 本来就吃 clip-path，六个令牌只是换掉值，
#      六档阶梯、三处用法（卡面徽章 / 卡片墙筛选条 / 首页名牌）一处都不用改。
#
# **自交曲线靠 nonzero 填充规则**：玫瑰线（奇 k）与双纽线在原点自交、蝴蝶曲线在
# r(t)<0 的区间会绕回原点另一侧 —— 这些在 clip-path 里都按 nonzero 填充，正是想要的效果
# （两瓣/五瓣都被填满）。这一点必须实测（见 lab 里那组 20px/96px 对照图），
# 因为「填充规则判反」的表现是「徽记缺一半」，而它不会报错。
#
# 密度按曲线本身的曲率给：圆 64 点就够（每点 5.6°），玫瑰线 120 点（花瓣尖端要拐得急），
# 蝴蝶曲线 480 点（它有 24π 的行程与六对翅尖，点数少了翅尖会变成折线）。


def _fit(pts, margin=0.02):
    """把曲线点集**等比**缩放并居中到 [margin, 1-margin]² 里。

    等比而不是分别拉伸到宽高各 1：徽记要的是「这条曲线本来的形状」，拉成正方会把
    星形线压成另一个图形（而且看不出是被拉过的）。宽扁/高瘦的曲线因此留空边 —— 那是对的，
    方框只是容器。y 要翻转：数学的 y 向上，clip-path 的 y 向下。"""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    w = max(xs) - min(xs)
    h = max(ys) - min(ys)
    s = (1 - 2 * margin) / max(w, h, 1e-9)
    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    return [(0.5 + (x - cx) * s, 0.5 - (y - cy) * s) for x, y in pts]


def polygon(pts, dec=0):
    """点集 → CSS `polygon(x% y%, …)`。

    **默认 0 位小数（整数百分比）**：徽记最大的用法是 26px，1% = 0.26px，量化误差 0.13px
    —— 看不出来；而字符串短了 40%（12.8 KB → 5.6 KB），这份文件是**全站每页都要吃**的
    全局样式表（gzip 实测差 4.6 KB → 2.0 KB）。密度靠点数补，不靠小数位。"""
    def f(v):
        s = f"{v * 100:.{dec}f}"
        if "." in s:
            s = s.rstrip("0").rstrip(".")
        return s or "0"
    return "polygon(" + ", ".join(f"{f(x)}% {f(y)}%" for x, y in pts) + ")"


def _ts(t0, t1, n):
    return [t0 + (t1 - t0) * i / n for i in range(n)]


def _polar(rf, t0, t1, n):
    return [(rf(t) * math.cos(t), rf(t) * math.sin(t)) for t in _ts(t0, t1, n)]


def curve_ring(n=64):
    """圆（r = 1）。最低档的「素背」，也是这次唯一没动的形状 —— 它本来就是曲线。"""
    return _polar(lambda t: 1.0, 0.0, 2 * math.pi, n)


def curve_lemniscate(n=96):
    """双纽线（伯努利）：x = cos t / (1 + sin²t), y = sin t cos t / (1 + sin²t)。
    ∞ 形，在原点自交 —— 自交处两瓣都靠 nonzero 填充留白，实测见对照图。"""
    return [(math.cos(t) / (1 + math.sin(t) ** 2),
             math.sin(t) * math.cos(t) / (1 + math.sin(t) ** 2)) for t in _ts(0.0, 2 * math.pi, n)]


def curve_astroid(n=64):
    """星形线：x = cos³t, y = sin³t。四尖、边向内凹 —— 与「四角星」是同一个轮廓，
    但它是**解析的**：凹度没法手调，也就不会被手调坏。"""
    return [(math.cos(t) ** 3, math.sin(t) ** 3) for t in _ts(0.0, 2 * math.pi, n)]


def curve_rose(k=5, n=160):
    """玫瑰线 r = cos(kθ)，θ ∈ [0, π]。奇数 k 出 k 瓣、偶数 k 出 2k 瓣 ——
    这里取 k = 5（五瓣），走一遍 π 就画全（奇 k 的 r 以 π 为周期）。"""
    return _polar(lambda t: math.cos(k * t), 0.0, math.pi, n)


def curve_epicycloid(ratio=5, n=160):
    """外摆线（圆在圆外滚）：尖**朝外**，R/r = 5 出 5 个尖。
    与下面的内摆线成对生成，哪个更配「传世」看对照图再定。"""
    rr, R = 1.0, float(ratio)
    return [((R + rr) * math.cos(t) - rr * math.cos((R + rr) / rr * t),
             (R + rr) * math.sin(t) - rr * math.sin((R + rr) / rr * t))
            for t in _ts(0.0, 2 * math.pi, n)]


def curve_hypocycloid(ratio=5, n=160):
    """内摆线（圆在圆内滚）：R/r = 5 出 5 个尖，尖**朝里收**、整体像五角星的花体。"""
    rr, R = 1.0, float(ratio)
    return [((R - rr) * math.cos(t) + rr * math.cos((R - rr) / rr * t),
             (R - rr) * math.sin(t) - rr * math.sin((R - rr) / rr * t))
            for t in _ts(0.0, 2 * math.pi, n)]


def curve_butterfly(n=480):
    """蝴蝶曲线（Fay）：r = e^{sin t} − 2cos(4t) + sin⁵((2t − π)/24)，t ∈ [0, 24π]。
    24π 是它的完整行程（六对翅），r 在若干区间为负 —— 那正是翅的形状，不是错。"""
    def rf(t):
        return (math.exp(math.sin(t)) - 2 * math.cos(4 * t)
                + math.sin((2 * t - math.pi) / 24) ** 5)
    return _polar(rf, 0.0, 24 * math.pi, n)


# 阶梯要用的那两条带参数曲线的固定取值：参数写在**函数名**里（curve_rose5 / curve_hypocycloid5），
# 这样六档阶梯读起来是「一档一条曲线」，而不是「一档一次带参调用」——调参数时只改这里一处。
def curve_rose5(n=160):
    return curve_rose(k=5, n=n)


def curve_hypocycloid5(n=160):
    return curve_hypocycloid(ratio=5, n=n)


def main():
    toks = []

    def add(name, body, w, h, note, viewbox=None):
        u = uri(body, w, h, viewbox)
        toks.append((name, u, note))

    # —— 星屑夜天（这一批里唯一的 mask 图）——
    add("--tex-starfield", starfield(83), 272, 381,
        "星屑夜天（星点大小差 4 倍、亮度三档、另加 3 道收尖的流星）", viewbox="0 0 272 381")


    # —— 数学曲线徽记（clip-path，不是 mask：它们是**实心**形状，直接当裁剪路径用）——
    # 令牌是 CSS 值（polygon），不是 data-URI，所以不能走 add()（那个包的是 url(...)）。这里单出一组。
    # 六档与尺寸的对应见 21-card-deck.css 的「等级」那一节；这里只负责形状本身。
    for name, pts, note in (
        ("--mark-astroid", curve_astroid(),
         "徽记·星形线 x = cos³t, y = sin³t（珍稀）—— 四芒、边内凹，13px 下仍读得出"),
        ("--mark-lemniscate", curve_lemniscate(),
         "徽记·双纽线（伯努利）x = cos t/(1+sin²t), y = sin t cos t/(1+sin²t)（史诗）—— ∞，在原点自交"),
        ("--mark-hypocycloid5", curve_hypocycloid5(),
         "徽记·内摆线 R/r = 5（秘藏）—— 五角星花，尖朝里收（「藏」）"),
        ("--mark-rose5", curve_rose5(),
         "徽记·玫瑰线 r = cos 5θ（传世）—— 五瓣；奇 k 的 r 以 π 为周期，走一遍就画全"),
        ("--mark-butterfly", curve_butterfly(n=240),
         "徽记·蝴蝶曲线 r = e^{sin t} − 2cos4t + sin⁵((2t−π)/24)（奇迹显形后）—— 24π 行程"),
    ):
        poly = polygon(_fit(pts))
        toks.append((name, poly, f"{note}；{len(pts)} 点 / {len(poly)} B"))
    # 收藏档的圆**不进这个文件**：`border-radius: 50%` 是零字节的真圆，比 64 点的多边形更准也更省
    # （形状清单里那六个「圆/星形线/双纽线/内摆线/玫瑰线/蝴蝶」是设计口径，实现上圆那一档不走多边形）。

    lines = [
        "/* ============================================",
        "   卡面纹样的**生成物** —— 由 tools/cards/make-ornaments.py 产出，**不要手改这个文件**。",
        "",
        "   改纹样：改那个脚本里的参数（宽度、抖动、分叉比例…）再跑一遍；",
        "   这一份入库的理由与图片产物一样：访客拿到的是结果，而结果要能逐字节复现。",
        "   `node scripts/check-deck.mjs` 会核这里该有的令牌齐不齐。",
        "",
        "   为什么单独一个文件而不是塞进 21-card-deck.css：这一批是脚本产出的（几百个坐标点），",
        "   手写那个文件里则是人写的逻辑与参数；混在一起会让「哪些能改」只能靠记忆。",
        "   文件名以 20- 开头，主题按数字序合并，排在 21- 之前。",
        "   ============================================ */",
        ":root {",
    ]
    total = 0
    for name, u, note in toks:
        total += len(u)
        lines.append(f"  /* {note} */")
        lines.append(f"  {name}: {u};")
    lines.append("}")
    lines.append("")
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print(f"✓ {os.path.relpath(OUT, ROOT)}：{len(toks)} 个令牌，data-URI 合计 {total // 1024} KB")
    for name, u, _ in toks:
        print(f"   {name:20s} {len(u) // 1024:3d} KB")


if __name__ == "__main__":
    main()
