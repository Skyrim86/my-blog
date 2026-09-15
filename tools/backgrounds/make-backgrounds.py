#!/usr/bin/env python3
# 四张背景图生成器：站点两张（墨与蔷薇）+ 管理页两张（霜雪樱花）。
#
# 为什么要生成而不是去图库找：背景上压着 72%~95% 的蒙版，具象画面在这个位置上
# 剩下的不是「氛围」而是一块脏斑（试过夜色月轮插画、试过人物插画，都在浅色主题下
# 留下一块灰白斑或让面板后面露出人物的腿）。纯质感——底渐变 + 斜纹 + 落瓣——
# 既只剩气氛，又能压到 3~4 KB（背景是每个页面都要下载的资源，见 docs/features.md ⑫），
# 还完全不用管素材出处与许可。
#
# 用法：python tools/backgrounds/make-backgrounds.py
# 产物（直接覆盖仓库里的图，随机种子固定所以可复现）：
#   assets/images/bg-velvet-night.webp   深色主题（墨绒夜）
#   assets/images/bg-ivory-paper.webp    浅色主题（象牙纸）
#   tools/admin/ui/frost-dark.webp       管理页深色主题
#   tools/admin/ui/frost-light.webp      管理页浅色主题
#
# 改色/改密度就改文件末尾那两行 build() 的参数；改完回到页面上截图核对，
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
    im = ImageEnhance.Color(im).enhance(0.92)
    im = Image.blend(im, Image.new("RGB", im.size, (120, 165, 220)), 0.06)   # 冷调，压掉一点暖黄灯火
    save(im, os.path.join("assets", "images", "bg-night-city.webp"), quality=74)


def site_backgrounds():
    """站点两张：浅色象牙纸、深色墨绒夜。尺寸 1600×900（整屏铺满，只需够 cover）。"""
    w, h = 1600, 900
    random.seed(311)

    # 浅色：象牙纸——几乎纯色，只做质感（底色见 00-theme.css 的 --theme）
    light = base_gradient(w, h, (249, 246, 249), (240, 234, 241))
    light = diag_net(light, 96, (139, 62, 85), 7)          # 蔷薇色的淡斜纹
    light = soft_light(light, w * 0.22, h * 0.12, 620, (255, 255, 255), 44)
    light = petals(light, 16, (150, 78, 100), (12, 26), (16, 30), 2.2)
    save(light, "assets/images/bg-ivory-paper.webp")

    # 深色：墨绒夜——底色带一点紫，落瓣是暗蔷薇（不是亮粉）
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
    city_background()
    city_lady_background()
    # 管理页的「霜雪质感」两张是备选：管理页当前用的是绫华壁纸（见 docs/admin.md §20），
    # 只有想换回纯质感时才生成，所以要显式加 --frost。
    if "--frost" in sys.argv:
        admin_backgrounds()
