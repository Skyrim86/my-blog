#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""卡面纹样的生成器：把「等宽描边画直线」换成**有粗细变化的填充轮廓**，并产出雕花框那套零件。

用法（与 tools/cards/ 那几个脚本同一个解释器）：
    C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/make-ornaments.py

产物（**生成物，入库；不要手改**）：`assets/css/extended/20-card-ornaments.css`
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
OUT = os.path.join(ROOT, "assets", "css", "extended", "20-card-ornaments.css")


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

def flake(seed, size=44.0):
    """一朵**真雪花**：六枝准对称的枝晶。

    与旧版的三处不同（都是上面第 1、2 条规则的落地）：
      · 每一枝与每一条侧枝都是**变宽轮廓**，末梢收到 0（旧版是等宽直线段的六向星号）；
      · 侧枝**越靠枝尖越短**，且同一枝两侧**各自独立**（不镜像）—— 真实生长里两侧互不相干；
      · 递归**只分两级**（不再有三级芽）：真雪花是「only slightly fractal」，越分越像机器。
    `size` 取 44 是为了**坐标都是两位数**（1 单位 = 1px，见 band 的字节账），
    放大到卡面上要多大由 CSS 的 mask-size 决定。
    """
    rng = random.Random(seed)
    parts = []
    for a in range(6):
        ang = a * math.pi / 3 + rng.uniform(-0.035, 0.035)          # 准对称：枝间轴线也会偏
        ln = size * rng.uniform(0.80, 0.98)
        tipx, tipy = math.cos(ang) * ln, math.sin(ang) * ln
        # 主枝：三个脊柱点（根 / 中 / 尖），中段略微外弓，避免笔直
        bow = rng.uniform(-0.06, 0.06)
        mid = (math.cos(ang + bow) * ln * 0.5, math.sin(ang + bow) * ln * 0.5)
        parts.append(band([(0, 0), mid, (tipx, tipy)], size * 0.125, 0.0, taper=0.8))
        # 侧枝：两侧独立取「位置 + 长度」，越靠枝尖越短
        for side in (-1, 1):
            for f in sorted(rng.uniform(0.3, 0.92) for _ in range(3)):
                bl = ln * (1.0 - f) * rng.uniform(0.45, 0.65)
                ba = ang + side * math.radians(60 + rng.uniform(-8, 8))
                bx, by = math.cos(ang) * ln * f, math.sin(ang) * ln * f
                parts.append(band([(bx, by),
                                   (bx + math.cos(ba) * bl, by + math.sin(ba) * bl)],
                                  size * 0.058, 0.0, taper=0.9))
    return parts


def crack_net(seed, w=272.0, h=381.0, starts=4, depth=2, w0=3.0):
    """一张**裂缝网**：从一个（或几个）起点生长，逐级分叉、越分越细。

    与旧版金继的差别就是「裂缝」这件事本身：旧版是 5 条固定折线在 4 个固定线宽上重复、
    彼此**没有一处交叉**；真裂缝是**层级网络** —— 分叉处宽度汇聚（子缝从母缝当前的宽度
    按比例继承，所以接口处自然比两边都宽）、子缝更细更短、密度在起点附近最大。
    分叉角取 ±48~70°（干裂纹的交叉角趋向 120°，arXiv 2609.11048）。

    **宽度按卡面真实像素给**（`w0=3.0`）：这张图的 viewBox 就是卡面尺寸（272×381）、不缩放。
    第一版按 `min(w,h)*0.03 ≈ 8px` 给根宽，整张图成了一团八像素宽的楔形（像闪电不像裂缝）；
    第二版收到 2.6px 又太淡、`starts=3` 太稀（218×305 上只在左下角一小丛，读作「一根小树枝」）。
    现在是 6 条起、`taper=1.15`（主缝在前三分之二保持宽度、末端才收），才铺得满一张卡。

    步数多、每步短（`step ≈ 15px`）才会走成曲折的裂；步长太大就成了一条直楔子。
    分叉概率与深度刻意压住（0.45 / depth 2）：`0.55 / depth 3` 会生出两百多条带、令牌 40 KB 起，
    而 272px 上根本看不出多出来的那些细枝。
    """
    rng = random.Random(seed)
    parts = []

    def grow(x, y, ang, width, length, d):
        pts = [(x, y)]
        steps = rng.randint(6, 9)
        step = length / steps
        for _ in range(steps):
            cx, cy = pts[-1]
            if d > 0 and rng.random() < 0.45:
                ba = ang + rng.choice((-1, 1)) * math.radians(rng.uniform(48, 70))
                grow(cx, cy, ba, width * 0.72, length * rng.uniform(0.6, 0.9), d - 1)
            ang += rng.uniform(-0.55, 0.55)          # 裂缝是**棱角**的，转得比藤蔓急
            pts.append((cx + math.cos(ang) * step, cy + math.sin(ang) * step))
        parts.append(band(pts, width, 0.0, taper=1.15))

    for _ in range(starts):
        # 起点落在画面边缘附近（裂缝从边上来、或在画面里一个「落点」）
        if rng.random() < 0.5:
            sx, sy = rng.choice((0.0, w)), rng.uniform(0.1, 0.9) * h
        else:
            sx, sy = rng.uniform(0.15, 0.85) * w, rng.uniform(0.1, 0.9) * h
        grow(sx, sy, rng.uniform(0, 2 * math.pi), w0 * rng.uniform(0.75, 1.15),
             min(w, h) * rng.uniform(0.5, 0.8), depth)
    return parts


def scroll(seed, size=64.0, lines=3):
    """卷草（雕花金/雕花框的有机线条）：每条是一根**变宽的卷曲藤**，不是等宽圆环。

    做法：沿一段螺旋取脊柱点，宽度从粗到细收到 0 —— 真卷草的末梢也是收尖的，
    这正是它比「一串圆环」耐看的原因。
    """
    rng = random.Random(seed)
    parts = []
    for i in range(lines):
        cx = rng.uniform(0.2, 0.8) * size
        cy = rng.uniform(0.2, 0.8) * size
        r0 = size * rng.uniform(0.10, 0.16)
        turns = rng.uniform(1.1, 1.7)
        pts = []
        n = 14
        for k in range(n):
            t = k / (n - 1)
            a = t * turns * 2 * math.pi
            r = r0 * (1.0 + 0.55 * t)          # 越卷越开
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        parts.append(band(pts, size * 0.045, 0.0, taper=1.0, per_seg=3))
    return parts


# ---------------------------------------------------------------- 雕花框零件（等宽**是对的**）

def fret_rail(seed, tile=48.0, band_h=20.0):
    """雕花边栏的一格瓦片（横排；竖向的由 `rot90()` 转出来，不再写第二套生成逻辑）。

    这一件**用等宽 stroke**：真鎏金画框的边栏、缠枝、双线本来就是等宽线，等宽在这里是对的
    （「生硬」那条只针对雪、裂缝这类有机形状）。

    **尺寸按 1:1 的真实像素设计**（瓦片 48×20、笔画 1.0~1.6px，卡面上不缩放）：第一版把瓦片
    设计成 56×20 却在对照图里被拉到 320px 宽（放大 5.7 倍），笔画粗成一片 —— 那次是**看的方法**
    错了，但结论一样：这套零件必须按它真正显示的尺寸设计，否则「细线」在放大后全是块面。

    一格之内：上下两条边线（横贯整格，保证平铺无缝）、一条正弦缠枝（取**整数个周期**，
    两端的 y 与斜率才接得上）、波峰波谷各挂一个小卷与一个小点（疏密不匀，但左右成对）。
    """
    rng = random.Random(seed)
    mid = band_h / 2
    amp = 3.0
    strokes = []
    for yy in (1.0, band_h - 1.0):
        strokes.append((f"M0 {yy:.0f}H{tile:.0f}", 1.4))
    n = 13
    sp = [(k / (n - 1) * tile,
           mid + math.sin(k / (n - 1) * 2 * math.pi) * amp) for k in range(n)]
    strokes.append(("M" + "L".join(f"{x:.0f} {y:.1f}" for x, y in sp), 1.6))
    for k in range(2):
        t = (k + 0.5) / 2
        x, y = t * tile, mid + math.sin(t * 2 * math.pi) * amp
        up = 1 if math.cos(t * 2 * math.pi) > 0 else -1
        r = rng.uniform(1.7, 2.2)
        strokes.append((circle(x + 1.8, y + up * 3.0, r), 1.1))
        strokes.append((f"M{x - 2.4:.0f} {y:.0f}c-1.2 {-1.2 * up:.0f} -2.4 {-1.8 * up:.0f} "
                        f"-3.2 {-0.5 * up:.0f}", 1.0))
        strokes.append((f"M{x + 5.5:.0f} {mid:.0f}a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0", 1.0))
    return "".join(f'<path d="{d}" stroke="#fff" fill="none" stroke-width="{sw}"/>'
                   for d, sw in strokes)


def corner_shard(seed, size=26.0):
    """**棱角碎星款**角花：给星芒全息用 —— 它的性格是放射与棱面，不该戴一朵圆花。

    两枚交叉的梭形（四角星）+ 中心一个小棱面 + 四个斜向小棱片，全用等宽 stroke 与直线，
    **故意不做圆**：这一款与圆花心的区别就是「有棱」。
    """
    c = size / 2
    out = []
    for a0 in (0.0, math.pi / 2):
        pts = []
        for k in range(4):
            a = a0 + k * math.pi / 2
            r = size * (0.47 if k % 2 == 0 else 0.16)
            pts.append((c + math.cos(a) * r, c + math.sin(a) * r))
        out.append(f'<path d="M{"L".join(f"{x:.1f} {y:.1f}" for x, y in pts)}Z" fill="#fff"/>')
    out.append(f'<path d="{circle(c, c, size * 0.115, 1)}" fill="#fff"/>')
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        px, py = c + math.cos(a) * size * 0.30, c + math.sin(a) * size * 0.30
        out.append(f'<path d="M{px:.1f} {py:.1f}l{math.cos(a) * 3.4:.1f} {math.sin(a) * 3.4:.1f}" '
                   f'stroke="#fff" stroke-width="1.4" fill="none"/>')
    return "".join(out)


def rot90(body, w, h):
    """把一张瓦片整体转 90°（给竖向边栏用）。返回 (body, 新的宽, 新的高)。"""
    return f'<g transform="translate({h:.0f} 0) rotate(90)">{body}</g>', h, w


# ============================================================
# 曲线角花（2026-09-21 第三轮）
# ============================================================
#
# **这一层必须先说清楚尺寸**：`--fret-corner` 会被 mask 成 `--fret-w × --fret-w`，而它是
# 「卡边到画面」那段环厚（= max(--rank-mat, --rank-band)），六档实测 6px（史诗）/ 9px（珍稀、
# 秘藏）/ 11px（传世）/ 12px（收藏、奇迹）。**6px 上画不出花瓣** —— 那不是曲线不够真，
# 是像素不够。所以这一层能改的只是形状的**家族**：
#   圆盘（现在的圆花心）→ 凹口（星形线）→ 带齿的环（外摆线）
# 三者在大尺寸下是三条完全不同的曲线，缩到 6~11px 之后剩下的是「有没有角」「边是不是凹的」
# 「外缘有没有齿」这三种可分辨的差别。验收就按这个口径看（lab/结果/deck9/corner.py），
# 不假装能读出五瓣。


def _curve_pts(fn, scale, c):
    """把曲线函数给的点集平移到角花瓦片的中心并缩放（角花是 1:1 的 26px 小图）。"""
    pts = fn()
    return [(c + x * scale, c + y * scale) for x, y in pts]


def corner_astroid_notch(size=26.0):
    """角花·**凹角**：星形线 x = cos³t, y = sin³t 直接当轮廓（四尖、边向内凹）。

    与圆花心的差别就是「边是凹的」—— 缩到 6px 之后，这个差别仍然看得出来（圆盘 vs 凹边梭形），
    这是曲线在这么小的尺寸上还能保住的少数性质之一。角心留一个小圆孔，给宝石层透气。"""
    c = size / 2
    pts = _curve_pts(lambda: curve_astroid(n=48), size * 0.47, c)
    d = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"
    return (f'<path d="{d}" fill="#fff"/>'
            + f'<path d="{circle(c, c, size * 0.10, 1)} {circle(c, c, size * 0.045, 1)}" '
              f'fill="#fff" fill-rule="evenodd"/>')


def corner_rose_disc(size=26.0, k=5):
    """角花·**玫瑰盘**：玫瑰线 r = cos kθ 当轮廓（k = 5，五瓣）。

    9px 下五瓣缩成「边上有点起伏的圆盘」—— 比纯圆盘多一点信息，但不指望能数出瓣数。"""
    c = size / 2
    pts = _curve_pts(lambda: curve_rose(k=k, n=64), size * 0.47, c)
    d = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"
    return (f'<path d="{d}" fill="#fff"/>'
            + f'<path d="{circle(c, c, size * 0.13, 1)}" fill="#fff"/>')


def corner_epicycloid_ring(size=26.0, ratio=5):
    """角花·**齿轮环**：外缘是外摆线 R/r = 5（尖朝外），内缘是圆 —— evenodd 出一个带齿的环。

    传世那一档的环厚是 11px，是六档里最宽的，所以把最「有齿」的那条曲线放在这里：
    11px 下能看出外缘不是圆的。"""
    c = size / 2
    outer = _curve_pts(lambda: curve_epicycloid(ratio=ratio, n=72), size * 0.47, c)
    d = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in outer) + "Z"
    return (f'<path d="{d} {circle(c, c, size * 0.30, 0)}" fill="#fff" fill-rule="evenodd"/>'
            + f'<path d="{circle(c, c, size * 0.38, 0)}" fill="none" stroke="#fff" '
              f'stroke-width="1.0"/>')


def corner_boss(seed, size=26.0):
    """角花：一枚圆形花心 + 四片叶 + 外圈。宝石坐在中心（宝石由另一层画）。

    等宽 stroke + 一个 evenodd 的圆环 —— 这是**画框**的语言，不是有机纹样。
    尺寸同样按 1:1 给（26px，约卡宽的 1/10，与参考图里角花的比例相当）；笔画 0.9~1.3px。
    """
    rng = random.Random(seed)
    c = size / 2
    out = [
        # 外圈（evenodd 的环）+ 内圈：两层细线的「双线」感
        f'<path d="{circle(c, c, size * 0.46, 0)} {circle(c, c, size * 0.40, 0)}" fill="#fff" fill-rule="evenodd"/>',
        f'<path d="{circle(c, c, size * 0.29, 0)}" fill="none" stroke="#fff" stroke-width="1.0"/>',
    ]
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        px, py = c + math.cos(a) * size * 0.235, c + math.sin(a) * size * 0.235
        out.append(f'<ellipse cx="{px:.1f}" cy="{py:.1f}" rx="{size * 0.045:.1f}" '
                   f'ry="{size * 0.085:.1f}" transform="rotate({math.degrees(a):.0f} {px:.1f} {py:.1f})" fill="#fff"/>')
    # 四角的小点：疏密不匀（同一个角花上也不等距）
    for k in range(5):
        a = rng.uniform(0, 2 * math.pi)
        r = size * rng.uniform(0.33, 0.43)
        out.append(f'<circle cx="{c + math.cos(a) * r:.1f}" cy="{c + math.sin(a) * r:.1f}" '
                   f'r="{size * 0.026:.1f}" fill="#fff"/>')
    return "".join(out)


def gem(seed=7, size=9.0):
    """宝石：六边明亮式切工的**轮廓 + 切面线**。轮廓给形状，切面线给「有刻面」的那点暗示。"""
    c = size / 2
    pts = [(c + math.cos(math.pi / 3 * k - math.pi / 2) * c * 0.94,
            c + math.sin(math.pi / 3 * k - math.pi / 2) * c * 0.94) for k in range(6)]
    outer = "M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z"
    inner = "M" + "L".join(f"{c + (x - c) * 0.5:.1f} {c + (y - c) * 0.5:.1f}" for x, y in pts) + "Z"
    facets = "".join(f'M{x:.1f} {y:.1f}L{c + (x - c) * 0.5:.1f} {c + (y - c) * 0.5:.1f}'
                     for x, y in pts)
    return (f'<path d="{inner}" fill="#fff"/>'
            f'<path d="{facets}" stroke="#fff" stroke-width="0.5" fill="none"/>'
            f'<path d="{outer}" stroke="#fff" stroke-width="0.8" fill="none"/>')


def cloison(seed, tile=30.0, w=272.0, h=381.0):
    """珐琅彩的**格子**：一张铺满卡面的六边形格子，每个格子**实心**、彼此留 1.4px 的缝 ——
    缝就是那条金线（掐丝）。

    为什么是实心格子而不是格线：这个令牌当 mask 用，而 mask 上**有 alpha 的地方才会被上色**。
    第一版画的是六边形的**边**（stroke），于是被上色的是线、格子是空的 —— 正好反了：
    珐琅彩要的是「宝石色填在格子里、金线在缝上」。改成实心格子之后，格子被涂上多色渐变，
    缝里露出来的是卡自己的框色（等级给的金属色阶），金线于是自然出现、而且跟着档位变。

    做成**整卡一张**（不平铺）是为了躲开接缝：六边形网格要在瓦片边界上对齐，得把 tile 与
    每行的偏移都算准，而这里只要一张静态图。
    """
    hh = tile * math.sqrt(3) / 2
    out = []
    for r in range(-1, int(h / hh) + 2):
        for k in range(-1, int(w / tile) + 2):
            cx = k * tile + (tile / 2 if r % 2 else 0)
            cy = r * hh
            pts = [(cx + math.cos(math.pi / 3 * i) * (tile * 0.5 - 1.4),
                    cy + math.sin(math.pi / 3 * i) * (tile * 0.5 - 1.4)) for i in range(6)]
            out.append('M' + 'L'.join(f"{x:.0f} {y:.0f}" for x, y in pts) + 'Z')
    return f'<path d="{"".join(out)}" fill="#fff"/>'


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

    # —— 有机纹样（变宽轮廓）——
    # 雪花出**三朵**、各自成一个令牌，由 CSS 用多张 mask 层、不同大小与位置铺成一张卡面：
    # 那样「九朵疏密不匀」的排布留在 CSS 里（改排布不用重跑生成器），而每朵的坐标都很小。
    for i, seed in enumerate((11, 23, 37)):
        add(f"--tex-flake{i + 1}",
            "".join(f'<path d="{d}" fill="#fff"/>' for d in flake(seed, 44.0)),
            88, 88,
            f"雪花 {i + 1}（六枝准对称、枝梢收到 0、侧枝越靠尖越短且两侧不镜像、只分两级）",
            viewbox="-44 -44 88 88")
    add("--tex-crack",
        "".join(f'<path d="{d}" fill="#fff"/>' for d in crack_net(101)),
        272, 381, "金继/冰裂的裂缝网（根宽 2.6px、分叉处宽度汇聚、子缝 0.72 倍宽）",
        viewbox="0 0 272 381")
    # 暗侧不再单独出一张：那和上面是**同一份几何**，旧版靠 CSS 里把同一张图偏移 1.3px 压暗，
    # 生成两份就是白花几 KB。CSS 侧继续用 background-position 错位。
    add("--tex-starfield", starfield(83), 272, 381,
        "星屑夜天（星点大小差 4 倍、亮度三档、另加 3 道收尖的流星）", viewbox="0 0 272 381")
    add("--tex-cloison", cloison(19, tile=30.0), 272, 381,
        "珐琅格线（铺满卡面的六边形掐丝，等宽笔触；颜色由底下的多色渐变给）", viewbox="0 0 272 381")

    # —— 雕花框零件（等宽是对的）——
    rail = fret_rail(43, tile=48.0, band_h=20.0)
    add("--tex-fret-h", rail, 48, 20,
        "雕花边栏瓦片·横（上下双线 + 正弦缠枝 + 小卷与小点；1:1 尺寸、可平铺）")
    body, vw, vh = rot90(rail, 48, 20)
    add("--tex-fret-v", body, vw, vh, "雕花边栏瓦片·竖（横向那格的 90° 版本）")
    add("--tex-fret-corner", corner_boss(71), 26, 26,
        "角花·圆花心（双圈 + 四叶 + 疏密不匀的点；中心留给宝石）—— 雕花金/金边/玻璃/金继/珐琅彩")
    add("--tex-fret-shard", corner_shard(89), 26, 26,
        "角花·棱角碎星（交叉梭形 + 棱片，故意不做圆）—— 给星芒全息：它的性格是放射与棱面")
    # —— 曲线角花（三条曲线各自的「轮廓家族」；尺寸说明见上面那一节）——
    add("--tex-fret-notch", corner_astroid_notch(), 26, 26,
        "角花·凹角（星形线 cos³t/sin³t 直接当轮廓）—— 给史诗：边向内凹，6px 下与圆盘仍分得开")
    add("--tex-fret-rosedisc", corner_rose_disc(), 26, 26,
        "角花·玫瑰盘（玫瑰线 r = cos 5θ）—— 给秘藏：9px 下是「边上有点起伏的盘」")
    add("--tex-fret-gearring", corner_epicycloid_ring(), 26, 26,
        "角花·齿轮环（外摆线 R/r = 5，外缘带齿、内缘是圆）—— 给传世：11px 下看得出外缘不是圆的")
    add("--tex-fret-gem", gem(7, 9.0), 9, 9, "宝石（六边明亮式：轮廓 + 切面线）")

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
