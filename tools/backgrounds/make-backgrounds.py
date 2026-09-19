#!/usr/bin/env python3
# 背景图生成器：站点两张（日间 / 夜间）+ 管理页两张（霜雪樱花，备选）。
#
# 为什么要生成而不是去图库找：背景上压着 55%~95% 的蒙版，具象画面在这个位置上
# 剩下的不是「氛围」而是一块脏斑（试过夜色月轮插画、试过人物插画，都在浅色主题下
# 留下一块灰白斑或让面板后面露出人物的腿）。**细碎**的结构才压得住——夜景那张照片之所以
# 成功，靠的是「亮窗对暗天」的小尺度明暗对比；日间这张对应的是「淡蓝灰剪影对近白天空」。
# 程序生成还有个好处：不用管素材出处与许可，而且能压到几 KB（背景是每页都要下载的资源，
# 见 docs/features.md ⑫）。
#
# 用法：python tools/backgrounds/make-backgrounds.py
# 产物（直接覆盖仓库里的图，随机种子固定所以可复现）：
#   assets/images/bg-daylight-city.webp  浅色主题（日间城市照片：积云 + 曼哈顿天际线，见 daylight_city_background）
#   assets/images/bg-daylight-sky.webp   浅色主题的程序生成备选（当前**未使用**）
#   assets/images/bg-night-city.webp     深色主题（夜景城市照片，见 city_background）
#   assets/images/bg-velvet-night.webp   深色主题的程序质感备选（当前**未使用**）
#   assets/images/bg-night-city-lady.webp 夜城 + 提灯少女（当前**未使用**）
#   assets/images/bg-daylight-girl.webp  「黑长直少女」套的浅色主题（见 girl_backgrounds）
#   assets/images/bg-night-girl.webp     「黑长直少女」套的深色主题（见 girl_backgrounds）
#   tools/admin/ui/frost-dark.webp       管理页深色主题（--frost 才生成）
#   tools/admin/ui/frost-light.webp      管理页浅色主题（--frost 才生成）
#
# 两张真图（日间城市 / 夜景城市）的源图都在本目录：source-daylight-city.jpg、source-night-city.jpg。
# **"为什么要生成"这条规则对不带人物的纯景照片不适用**：只要画面是「大团云」或「亮窗对暗天」
# 这类小尺度对比，就压得住蒙版（依据见下）。反过来，具象的插画/人物在浅色主题下会变成一块脏斑。
#
# 改色/改密度就改文件末尾那几行 build() 的参数；改完回到页面上截图核对，
# 别只看生成图——蒙版压过之后差得很远。
import math
import os
import random
import sys

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def base_gradient(w, h, top, bottom):
    im = Image.new("RGB", (w, h), top)
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([(0, y), (w, y)], fill=lerp(top, bottom, y / h))
    return im


def soft_light(im, cx, cy, r, color, alpha):
    """一团没有硬边的光：椭圆先画实心再大半径模糊，避免出现「一块斑」的边界。"""
    w, h = im.size
    layer = Image.new("L", (w, h), 0)
    ImageDraw.Draw(layer).ellipse([cx - r, cy - r, cx + r, cy + r], fill=alpha)
    layer = layer.filter(ImageFilter.GaussianBlur(r * 0.55))
    return Image.composite(Image.new("RGB", (w, h), color), im, layer)


def diag_net(im, step, color, alpha):
    """45° 双向细斜纹：丝绒/纸纹的质感来源，蒙版压过之后只剩一点点起伏。"""
    w, h = im.size
    net = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(net)
    for i in range(-h, w + h, step):
        d.line([(i, 0), (i + h, h)], fill=color + (alpha,), width=1)
        d.line([(i, 0), (i - h, h)], fill=color + (alpha,), width=1)
    return Image.alpha_composite(im.convert("RGBA"), net).convert("RGB")


def flake(d, cx, cy, r, color, alpha, width):
    """一枚六角霜花：六条主干，每条上两对分枝（角度带一点随机，不然像图标）。"""
    for k in range(6):
        a = math.radians(60 * k - 90 + random.uniform(-4, 4))
        d.line([(cx, cy), (cx + r * math.cos(a), cy + r * math.sin(a))],
               fill=color + (alpha,), width=width)
        for f, bl in ((0.45, 0.42), (0.72, 0.30)):
            bx, by = cx + r * f * math.cos(a), cy + r * f * math.sin(a)
            for s in (-1, 1):
                ba = a + s * math.radians(34)
                d.line([(bx, by), (bx + r * bl * math.cos(ba), by + r * bl * math.sin(ba))],
                       fill=color + (alpha,), width=width)


def petals(im, n, color, alpha_range, size_range, blur, ry_ratio=0.55):
    """散落的花瓣：小椭圆随机旋转 + 轻微模糊，密度必须压得很低，否则像撒纸屑。"""
    w, h = im.size
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    for _ in range(n):
        x, y = random.uniform(0, w), random.uniform(0, h)
        rx = random.uniform(*size_range)
        ry = rx * ry_ratio
        box = Image.new("RGBA", (int(rx * 2) + 6, int(ry * 2) + 6), (0, 0, 0, 0))
        ImageDraw.Draw(box).ellipse([3, 3, rx * 2, ry * 2],
                                    fill=color + (random.randint(*alpha_range),))
        box = box.rotate(random.uniform(0, 180), expand=True, resample=Image.BICUBIC)
        layer.alpha_composite(box, (int(x), int(y)))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(im.convert("RGBA"), layer).convert("RGB")


def save(im, rel_path, quality=72):
    out = os.path.join(ROOT, rel_path)
    im.save(out, "WEBP", quality=quality, method=6)
    print(f"{rel_path}  {im.size[0]}x{im.size[1]}  {os.path.getsize(out) // 1024} KB")


def city_background():
    """深色主题那张真图：source-night-city.jpg → assets/images/bg-night-city.webp。

    只做压暗 + 轻冷调，不重绘。**它不是质感图**：夜景城市 + 星空，蒙版放松到 .54→.84
    才看得见（见 00-theme.css 的深色那段）。代价是 127 KB —— 这是一张每页都要下载的
    资源，换图前先算这笔账。
    """
    src = os.path.join(ROOT, "tools", "backgrounds", "source-night-city.jpg")
    im = Image.open(src).convert("RGB").resize((1600, 900), Image.LANCZOS)
    im = ImageEnhance.Brightness(im).enhance(0.85)
    im = ImageEnhance.Color(im).enhance(1.20)   # 2026-09-19 从 0.92 提起，理由同 daylight_city_background
    im = Image.blend(im, Image.new("RGB", im.size, (120, 165, 220)), 0.06)   # 冷调，压掉一点暖黄灯火
    save(im, os.path.join("assets", "images", "bg-night-city.webp"), quality=74)


def skyline(im, horizon, color, top_alpha, bot_alpha, blur, min_w, max_w, min_h, max_h):
    """底缘一条细密的城市剪影，从天际线往下一路渐实。

    为什么是剪影而不是具象插画：浅色主题的蒙版压到 55%~85%，具象画面在这个位置剩下的不是
    「氛围」而是一块灰白斑（见文件头）。夜景那张照片之所以压得住，靠的是「亮窗对暗天」的
    **小尺度**明暗对比；这里对应的是「淡蓝灰建筑对近白天空」，同样细碎，所以能活过蒙版。

    上缘用 alpha 渐变收（越靠天际线越淡）+ 一点高斯模糊：剪影的顶边本来是硬的，
    而蒙版会把硬边放大成一条「贴上去的剪纸」，模糊掉之后才像远景。
    """
    w, h = im.size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    x = -random.randint(0, max_w)
    while x < w:
        bw = random.randint(min_w, max_w)
        bh = random.randint(min_h, max_h)
        d.rectangle([x, horizon - bh, x + bw, h], fill=255)
        # 偶尔来一座明显更高的塔，天际线才有节奏而不像一排等高的积木
        if random.random() < 0.12:
            tw = max(10, bw // 4)
            th = bh + random.randint(int(max_h * 0.5), int(max_h * 1.6))
            d.rectangle([x + bw // 2 - tw // 2, horizon - th, x + bw // 2 + tw // 2, h], fill=255)
        x += bw + random.randint(2, 16)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))

    # 纵向 alpha 渐变：天际线处几乎透明，越往下越实
    ramp = Image.new("L", (w, h), 0)
    rd = ImageDraw.Draw(ramp)
    for y in range(horizon - max_h * 3, h):
        t = (y - (horizon - max_h * 3)) / max(1, (h - (horizon - max_h * 3)))
        t = min(1.0, max(0.0, t))
        rd.line([(0, y), (w, y)], fill=int(top_alpha + (bot_alpha - top_alpha) * t))
    mask = ImageChops.multiply(layer, ramp)
    return Image.composite(Image.new("RGB", (w, h), color), im, mask)


def daylight_background():
    """浅色主题的**程序生成备选**：日间 —— 淡天青到象牙的天空 + 底缘城市剪影 + 右上日光晕。

    当前**未使用**（浅色主题用的是 daylight_city_background 那张日间城市照片），保留是为了
    想换回「纯生成」时不必重写：把 hugo.toml 的 backgroundImageLight 指过来即可。
    """
    w, h = 1600, 900
    random.seed(917)

    im = base_gradient(w, h, (206, 224, 242), (250, 247, 250))   # 天青 → 象牙
    im = soft_light(im, w * 0.74, h * 0.13, 700, (255, 253, 246), 74)  # 日光晕，位置对齐夜间的月亮
    im = diag_net(im, 96, (139, 62, 85), 6)                     # 与夜间同源的蔷薇淡斜纹
    im = skyline(im, horizon=int(h * 0.70), color=(126, 142, 168),
                 top_alpha=10, bot_alpha=96, blur=1.1,
                 min_w=34, max_w=96, min_h=40, max_h=132)
    im = petals(im, 16, (150, 78, 100), (12, 26), (16, 30), 2.2)
    save(im, os.path.join("assets", "images", "bg-daylight-sky.webp"))


def daylight_city_background():
    """浅色主题那张真图：source-daylight-city.jpg → assets/images/bg-daylight-city.webp。

    与夜间那张成对（都是城市），方向相反：夜间是「暗天 + 亮窗」，这里是「亮天 + 暗城」。
    选它的理由是它**压得住蒙版**：上半张是大团积云的边缘，下半张是牙签一样细的天际线轮廓——
    这两样都是小尺度明暗对比，正是 55%~85% 白蒙版吃不掉的东西（依据见文件头）。蒙版压过之后
    剩下的是一层「有云的日光」，而不是一块灰白斑。

    取景裁到 16:9 时**贴底裁**（丢掉画面上缘的云）：bg 的 background-position 是 center 30%，
    窄高视口里露出来的是图的上半部分，天际线本来就在靠下位置，贴底裁才不会把它顶出去。

    出处：Unsplash，Carli Jean，https://unsplash.com/photos/Gk6YgzmrLgM（Unsplash License，
    可自由使用）。原始 5000×3333 压到 2048 宽存 tools/backgrounds/source-daylight-city.jpg（346 KB，
    与 source-night-city.jpg 的 358 KB 同一量级；留 1.28 倍出图宽度的余量，将来想换取景还有得裁）。
    调色只做轻微去饱和 + 掺一点主题底色，不重绘。
    """
    src = os.path.join(ROOT, "tools", "backgrounds", "source-daylight-city.jpg")
    im = Image.open(src).convert("RGB")
    w, h = im.size
    ch = round(w * 9 / 16)
    im = im.crop((0, h - ch, w, h)).resize((1600, 900), Image.LANCZOS)
    im = ImageEnhance.Brightness(im).enhance(1.02)
    # 2026-09-19 从 0.86 提到 1.15。**彩度与亮度是两个旋钮**：蒙版只压亮度、保住了文字对比度，
    # 但它同时把彩度也洗掉了（叠加这里的降彩度 = 削两轮），「灰蒙蒙」主要来自这里。
    # ImageEnhance.Color 按 luma 混合，逐像素亮度不变 → 提彩度不动对比度，不必重量那张表。
    # 实拍图提太狠会出色带，所以比少女套保守。
    im = ImageEnhance.Color(im).enhance(1.15)
    im = Image.blend(im, Image.new("RGB", im.size, (250, 247, 250)), 0.07)   # 掺主题底色，与蒙版同温
    save(im, os.path.join("assets", "images", "bg-daylight-city.webp"), quality=72)


def site_backgrounds():
    """站点背景：日间（生成备选）与夜间质感备选（生成）。尺寸 1600×900（整屏铺满，够 cover 即可）。"""
    w, h = 1600, 900

    daylight_background()

    # 深色主题的程序质感备选：墨绒夜——底色带一点紫，落瓣是暗蔷薇（不是亮粉）。
    # 当前**未使用**（深色主题用的是 city_background 那张夜景照片），保留是为了将来想换回
    # 「纯质感」时不必重写：把 hugo.toml 的 backgroundImage 指过来即可。
    random.seed(311)
    dark = base_gradient(w, h, (10, 9, 15), (23, 18, 32))
    dark = diag_net(dark, 88, (255, 255, 255), 8)
    dark = soft_light(dark, w * 0.72, h * 0.10, 700, (86, 70, 110), 58)
    dark = petals(dark, 20, (150, 60, 92), (26, 62), (14, 28), 2.6)
    save(dark, "assets/images/bg-velvet-night.webp")


def city_lady_background():
    """城市夜景 + 黑发少女（提灯背影）：把 source-lady-slice.webp 大羽化叠到 bg-night-city.webp 右侧。

    为什么不抠干净再叠：人物周围的夜空/山体在城市夜景的暗部里本来就看不见，
    大羽化（inset 0.24 + 高斯 38）之后只有白裙、黑发和提灯这几个高对比部分浮出来，
    抠图留下的那点背景反而成了「她站的山坡」。抠太干净反而会出现一圈贴纸边。
    蒙版（CSS 里那层）不在这里压——它由 00-theme.css 负责，这样换蒙版不用重跑脚本。"""
    night = Image.open(os.path.join(ROOT, "assets", "images", "bg-night-city.webp")).convert("RGB").resize((1600, 900), Image.LANCZOS)
    sl = Image.open(os.path.join(ROOT, "tools", "backgrounds", "source-lady-slice.webp")).convert("RGBA")
    h = int(900 * 0.86)
    w = int(sl.width * h / sl.height)
    rgb = ImageEnhance.Color(sl.convert("RGB")).enhance(0.85)
    a = np.asarray(rgb).astype("float32")
    a[..., 2] = np.clip(a[..., 2] + 14, 0, 255)          # 加蓝，和夜景色温统一
    p = Image.fromarray(a.astype("uint8"), "RGB").resize((w, h), Image.LANCZOS).convert("RGBA")
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx / (w - 1) * 2 - 1)) ** 2 + ((yy / (h - 1) * 2 - 1)) ** 2)
    alpha = Image.fromarray(((np.clip((1 - d) / 0.76, 0, 1) ** 1.9) * 255).astype("uint8"), "L").filter(ImageFilter.GaussianBlur(38))
    p.putalpha(alpha)
    inner = alpha.filter(ImageFilter.MinFilter(11))
    edge = ImageChops.subtract(alpha, inner).filter(ImageFilter.GaussianBlur(3))
    glow = Image.new("RGBA", p.size, (150, 205, 255, 0))
    glow.putalpha(edge.point(lambda v: int(v * 0.35)))
    p = Image.alpha_composite(p, glow)
    canvas = night.convert("RGBA")
    canvas.alpha_composite(p, (1600 - w - 40, 900 - h + 30))
    save(canvas.convert("RGB"), os.path.join("assets", "images", "bg-night-city-lady.webp"), quality=78)


def girl_backgrounds():
    """「黑长直少女」那套：source-girl-day.jpg / source-girl-night.jpg →
    assets/images/bg-daylight-girl.webp（浅色主题）/ bg-night-girl.webp（深色主题）。

    这一套与城市那套的区别是**画面里有人**，于是有三处不一样：

    一、蒙版必须压厚（hugo.toml 里单独给了 maskLight/maskDark）。具象人物在一整块 55~85% 的
        白蒙版下会剩一块灰白斑 —— 这是文件头记着的老经验，「城市 + 提灯少女」那版就是因此撤回过。
        压厚不是补救，是这套图能上线的**前提**：不压厚，浅色主题下人物的脸和衣服就是一块脏色。

    二、处理时去饱和要更克制。城市照片是实拍，去饱和到 .86 只是「收一收」；插画的饱和度本身
        就是它的卖点，压过头会变成一张褪色的画。这里只做 .95（日）/ 1.0（夜），再用 4~5% 的
        主题底色混一下，让它在「墨与蔷薇」的配色里不显得外挂。

    三、**人物要留在画面横向的 60~80% 处**，因为 background-position 的横向取值决定了窄屏露哪一块：
        视口比 16:9 窄时（几乎全部设备）cover 是「按高度铺满、横向裁掉两边」，实测 375px 宽的手机
        只露出图片宽度的 25%。人物若靠边，手机上就只剩一片天空。所以 hugo.toml 里这两套的
        position 都写成 `6x% 25%`，把人物挪到可视窗口中间 —— 两张的人物都在右侧同一带，
        切主题时她不会跳位置（观感是「换了个时辰」，与城市那套同理）。

    取景理由：两张都是「少女 + 城市全景 + 天空」，日间是白天俯瞰海湾城市、夜间是屋顶看星空下的
    夜城，母题一致、时辰相反。日间那张只裁掉底部 200px（上缘留 90px 给她头顶，不裁脸）；
    夜间那张源图本就接近 16:9，只裁掉 77px 里的一小半。

    出处（都是同人插画，版权在画师手里；个人非商业使用并保留出处）：
      source-girl-day.jpg   pixiv https://www.pixiv.net/artworks/87155937
                            （经 safebooru post 3336910，2048×1352）
      source-girl-night.jpg pixiv https://www.pixiv.net/artworks/77002104
                            （经 safebooru post 2921614，原图 2500×1500 压到 2048×1229 存）
    抓候选与筛选的过程留在 ../lab/shots/pick-girl-bg.py 与 ../lab/shots/finalists.py（仓库外）。
    """
    day = Image.open(os.path.join(ROOT, "tools", "backgrounds", "source-girl-day.jpg")).convert("RGB")
    w, _ = day.size
    ch = round(w * 9 / 16)
    # 贴顶裁（y0=0）：源图 2048×1352，裁掉的是底部 200px 的甲板栏杆；上缘只留 90px 给她头顶，
    # 再往下裁就切到头发了。
    day = day.crop((0, 0, w, ch)).resize((1600, 900), Image.LANCZOS)
    day = ImageEnhance.Color(day).enhance(1.35)   # 见 daylight_city_background 的注释：彩度是独立旋钮
    day = Image.blend(day, Image.new("RGB", day.size, (250, 247, 250)), 0.05)
    save(day, os.path.join("assets", "images", "bg-daylight-girl.webp"), quality=72)

    night = Image.open(os.path.join(ROOT, "tools", "backgrounds", "source-girl-night.jpg")).convert("RGB")
    w, h = night.size
    ch = round(w * 9 / 16)
    # 源图 2048×1229 本就接近 16:9，只需裁掉 77px：取中，上下的星空与屋顶各让一点。
    y0 = max(0, (h - ch) // 2)
    night = night.crop((0, y0, w, y0 + ch)).resize((1600, 900), Image.LANCZOS)
    # 密集星场是这张图压不下来的原因：q74 要 176 KB，而背景是**每个访客都要下**的资源。
    # 0.4px 的亚像素模糊只削掉星点的单像素高频噪（对画面是「噪点少了」而不是「糊了」），
    # 实测 q64 从 156 KB 降到 132 KB（与城市套那张 125 KB 同量级）；两种画法在页面上的差别
    # 由截图核对，不是靠 RMSE —— 蒙版压到 .66~.90 之后这个量级的差异看不见。
    night = night.filter(ImageFilter.GaussianBlur(0.4))
    night = ImageEnhance.Color(night).enhance(1.30)   # 2026-09-19 新增：原来这张只掺墨色、没提彩度
    night = Image.blend(night, Image.new("RGB", night.size, (11, 10, 15)), 0.05)   # 掺墨色，压住城市灯火的橙
    save(night, os.path.join("assets", "images", "bg-night-girl.webp"), quality=64)


def frost_background(name, top, bottom, flake_color, flake_alpha, petal_color,
                     light_color, light_alpha, net_alpha):
    """管理页一张：霜雪樱花。1920×1200（管理页是本地工具，尺寸放宽一点无所谓）。"""
    w, h = 1920, 1200
    im = base_gradient(w, h, top, bottom)
    im = diag_net(im, 74, (255, 255, 255), net_alpha)
    im = soft_light(im, w * 0.74, h * 0.16, 520, light_color, light_alpha)
    im = soft_light(im, w * 0.16, h * 0.92, 460, light_color, int(light_alpha * 0.55))

    fl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fd = ImageDraw.Draw(fl)
    for _ in range(46):
        r = random.uniform(9, 30)
        flake(fd, random.uniform(-20, w + 20), random.uniform(-20, h + 20), r,
              flake_color, random.randint(*flake_alpha), 1 if r < 18 else 2)
    fl = fl.filter(ImageFilter.GaussianBlur(0.4))
    im = Image.alpha_composite(im.convert("RGBA"), fl).convert("RGB")

    im = petals(im, 26, petal_color, (34, 78), (7, 15), 1.2)
    save(im, f"tools/admin/ui/{name}", quality=74)


def admin_backgrounds():
    random.seed(2026)
    # 浅色：霜白 → 淡冰蓝，霜花是冰蓝（白线在雪白底上看不见）
    frost_background("frost-light.webp", (247, 251, 254), (222, 236, 248),
                     (120, 176, 214), (30, 64), (231, 168, 198),
                     (255, 255, 255), 46, 15)
    # 深色：夜蓝 → 深青蓝，霜花转白
    frost_background("frost-dark.webp", (8, 22, 38), (18, 46, 72),
                     (203, 232, 250), (28, 68), (228, 172, 200),
                     (150, 200, 240), 38, 16)


if __name__ == "__main__":
    site_backgrounds()
    daylight_city_background()
    city_background()
    city_lady_background()
    girl_backgrounds()
    # 管理页的「霜雪质感」两张是备选：管理页当前用的是绫华壁纸（见 docs/admin.md §20），
    # 只有想换回纯质感时才生成，所以要显式加 --frost。
    if "--frost" in sys.argv:
        admin_backgrounds()
