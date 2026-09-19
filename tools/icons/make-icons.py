#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成图标，分两条独立的线：

  站点图标（static/favicon.ico / favicon-16x16.png / favicon-32x32.png /
  apple-touch-icon.png / safari-pinned-tab.svg）：**Q 版黑长直大小姐**，
  素材 source-ojou-chibi.png，抠掉平灰背景压到酒红底板上。

  管理页图标（tools/admin/ui/ayaka.ico，只本地用 + 桌面快捷方式）：**Q 版神里绫华**，
  素材 source-ayaka-chibi.png，保留素材自带白底只压一层冷色。两条线互不影响：
  站点换人设时管理页可以继续用旧那张。

为什么要有这个脚本：图标是二进制产物，手改一次就没人知道它从哪来。这里把「图」按风格定义成
可复现的输入，脚本负责栅格化成各尺寸——改裁切框、改色只改本文件。

两种风格（--style）：
  art（默认）从 tools/icons/source-ojou-chibi.png 裁头部、抠掉平灰背景、压到酒红底板上。
            出处与许可见 docs/architecture.md。
  pixel      脚本自绘的像素风（32x32 调色板网格），不依赖任何外部素材，许可干净。

用法：
  python tools/icons/make-icons.py                 # 写 static/ 下的全部图标
  python tools/icons/make-icons.py --style pixel   # 换成自绘像素风
  python tools/icons/make-icons.py --preview OUT   # 只渲染预览（各实际尺寸并排）
  python tools/icons/make-icons.py --check         # 不写盘，比对 static/ 是否与脚本一致（非零退出=漂移）

设计约定：
  - 16px 是下限：art 风格靠「大头裁切 + 酒红底板上出黑发轮廓」，pixel 风格靠 32x32 主网格整数倍缩放。
  - 圆角由脚本加（art 风格），不靠素材自带的边框。
"""

import argparse
import math
import struct
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "static"
# 管理页的图标（同时是桌面快捷方式用的那个）——放在 tools/admin/ui/ 下，由管理页直接提供服务
APP_ICO = ROOT / "tools" / "admin" / "ui" / "ayaka.ico"

ICO_SITE_SIZES = (16, 32)
ICO_APP_SIZES = (16, 32, 48, 64, 128, 256)

N = 32  # 主网格边长

# ---- 调色板（黑长直配色：黑紫发、紫眼、酒红和服、金饰 + 冷白圆角底板）----
# 底板必须浅：黑发压在深底板上，16px 就是一团糊，看不出有人。
PALETTE = {
    "o": (12, 10, 16, 255),        # 描边（近黑，压在浅底板上才有边界）
    "h": (58, 50, 66, 255),        # 头发（黑，留一点紫调才不会被描边吃掉）
    "H": (40, 34, 46, 255),        # 头发中间调
    "d": (26, 22, 32, 255),        # 头发暗部
    "s": (253, 227, 211, 255),     # 皮肤
    "t": (242, 190, 168, 255),     # 皮肤暗部（脸颊/下眼睑）
    "b": (152, 110, 214, 255),     # 眼睛（紫）
    "B": (98, 64, 162, 255),       # 眼睛暗部/上眼睑
    "w": (255, 255, 255, 255),     # 高光/白
    "k": (110, 24, 44, 255),       # 和服深酒红
    "K": (160, 48, 72, 255),       # 和服浅酒红
    "g": (233, 200, 119, 255),     # 金色发饰
    "r": (176, 44, 62, 255),       # 发带（酒红）
    "p": (246, 182, 168, 255),     # 腮红
    "P": (240, 236, 244, 255),     # 底板（冷白）
    "G": (214, 208, 222, 255),     # 底板上的光晕
    ".": (0, 0, 0, 0),             # 透明
}


class Grid:
    """32x32 的像素网格。所有图元都在整数格上落到像素中心，天然无抗锯齿。"""

    def __init__(self, n=N):
        self.n = n
        self.px = [["." for _ in range(n)] for _ in range(n)]

    def set(self, x, y, c):
        if 0 <= x < self.n and 0 <= y < self.n:
            self.px[y][x] = c

    def get(self, x, y):
        if 0 <= x < self.n and 0 <= y < self.n:
            return self.px[y][x]
        return "."

    def rect(self, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.set(x, y, c)

    def ellipse(self, cx, cy, rx, ry, c, only_empty=False):
        for y in range(self.n):
            for x in range(self.n):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                    if only_empty and self.get(x, y) != ".":
                        continue
                    self.set(x, y, c)

    def hline(self, y, x0, x1, c):
        self.rect(x0, y, x1, y, c)

    def outline(self, c="o"):
        """非空像素的四邻空白 → 描边。只描外轮廓，脸在头发内部因此不会被描。"""
        add = []
        for y in range(self.n):
            for x in range(self.n):
                if self.get(x, y) != ".":
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    if self.get(x + dx, y + dy) not in (".", c):
                        add.append((x, y))
                        break
        for x, y in add:
            self.set(x, y, c)

    def to_image(self):
        im = Image.new("RGBA", (self.n, self.n), (0, 0, 0, 0))
        p = im.load()
        for y in range(self.n):
            for x in range(self.n):
                c = self.px[y][x]
                # 既认调色板字符，也认直接给的 RGBA 元组：导航栏那 8 个角色的发色/眼色
                # 各不相同，塞进全局 PALETTE 会让那张表变成二十几个一次性键。
                p[x, y] = c if isinstance(c, tuple) else PALETTE[c]
        return im


def rounded_plate(g, radius, color):
    for y in range(g.n):
        for x in range(g.n):
            cx = min(max(x, radius - 0.5), g.n - radius - 0.5)
            cy = min(max(y, radius - 0.5), g.n - radius - 0.5)
            if (x - cx) ** 2 + (y - cy) ** 2 <= (radius - 0.5) ** 2:
                g.set(x, y, color)


def draw_chibi():
    """返回最终网格。先在透明网格上画人物并描边，再叠到圆角底板上——
    分开画的原因：outline() 会把「非空 vs 透明」的边界全描一圈，直接把底板也算进去
    会给底板外缘加一圈黑边。"""
    c = Grid()

    # ---- 头发轮廓：宽扁的圆顶 + 垂直侧发（y>=14 起两侧走直线）----
    def half(y):
        if y < 2 or y > 26:
            return -1.0
        if y <= 14:
            t = (14 - y) / 13.0
            return 12.5 * (1.0 - t**3) ** 0.5
        return 12.5 - 1.5 * max(0, y - 25)

    for y in range(2, 27):
        hw = half(y)
        if hw <= 0:
            continue
        for x in range(math.ceil(15.5 - hw), math.floor(15.5 + hw) + 1):
            c.set(x, y, "h")

    # 呆毛
    c.set(16, 1, "h")
    c.set(17, 0, "h")
    c.set(17, 1, "h")

    # ---- 下巴到肩之间留出颈部：把中间那段头发挖掉（脸和脖子随后补回来）----
    for y in (25, 26):
        for x in range(11, 21):
            c.set(x, y, ".")

    # ---- 脸 ----
    c.ellipse(15.5, 18.0, 7.5, 7.0, "s")

    # ---- 齐刘海：逐列不等的下缘。只落在头发轮廓内——写成矩形会让头变成一个方盒 ----
    def bang_bottom(x):
        if 10 <= x <= 21:
            return 12
        if 8 <= x <= 23:
            return 13
        return 14

    for x in range(2, 30):
        for y in range(1, bang_bottom(x) + 1):
            if c.get(x, y) != ".":
                c.set(x, y, "h")
        if c.get(x, bang_bottom(x)) == "h":
            c.set(x, bang_bottom(x), "H")

    # 侧发：由内到外三层，把头发和脸分开（脸在头发内部，outline() 不碰它）
    for y in range(14, 27):
        c.set(8, y, "H")
        c.set(23, y, "H")
    for y in range(16, 26):
        c.set(3, y, "d")
        c.set(28, y, "d")

    # ---- 眼睛：3 宽 4 高。上眼睑一条重线、虹膜上部一点白高光——
    #      画成 5 宽的整块蓝会变成「护目镜」，这是小尺寸下最典型的翻车形态。
    for x0 in (10, 19):
        c.hline(15, x0, x0 + 2, "B")
        c.set(x0, 16, "b")
        c.set(x0 + 1, 16, "w")
        c.set(x0 + 2, 16, "b")
        c.hline(17, x0, x0 + 2, "b")
        c.hline(18, x0, x0 + 2, "B")

    # 腮红 + 嘴
    c.set(9, 20, "p")
    c.set(22, 20, "p")
    c.hline(21, 15, 16, "o")

    # ---- 樱花发饰（左侧：深色底 + 蓝花瓣 + 金花心）----
    c.ellipse(6.0, 8.0, 4.0, 3.6, "o")
    c.ellipse(6.0, 8.0, 3.2, 2.8, "r")
    for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
        c.set(6 + dx, 8 + dy, "w")
    c.set(6, 8, "g")
    c.set(6, 5, "w")
    c.set(2, 9, "w")
    c.set(10, 11, "w")

    # ---- 脖子 + 和服 ----
    c.rect(14, 24, 17, 27, "s")
    c.hline(25, 13, 18, "t")  # 下颌投影，把下巴和脖子分开
    c.rect(4, 27, 27, 31, "k")
    for i in range(5):
        c.set(15 - i, 27 + i, "w")
        c.set(16 + i, 27 + i, "w")
        c.set(14 - i, 27 + i, "K")
        c.set(17 + i, 27 + i, "K")

    c.outline()

    g = Grid()
    rounded_plate(g, 7, "P")
    g.ellipse(15.5, 14.5, 12.0, 13.0, "G", only_empty=True)
    for y in range(g.n):
        for x in range(g.n):
            if c.get(x, y) != ".":
                g.set(x, y, c.get(x, y))
    return g, c


# ---- art 风格：Q 版插画裁头部 ----
# 源图出处与许可见 docs/architecture.md「图标」一节；换一张图只需要改这一组常量。
ART = Path(__file__).with_name("source-ojou-chibi.png")
ART_CROP = (230, 45, 2050, 1865)    # 头部（含刘海、侧发与领结一角），源图 2894x4093
ART_KEY = (255, 255, 255)           # 素材背景是纯白：按到它的距离抠掉，换成下面的底板
ART_KEY_TOL = 6                     # 通道差 <= 此值算背景，全透明
ART_KEY_SOFT = 14                   # 到 TOL 与 TOL+SOFT 之间线性过渡，避免硬锯齿
# 容差必须**远低于肤色到白的距离**：肤白（约 255,232,228）到白只差 ~27 个通道，
# 早先 tol=40 把脸一起抠成半透明，酒红底板透上来整张脸红掉。判据：先跑 --preview 看脸。
ART_PLATE = (150, 30, 48)           # 酒红底板：黑发压浅底太软、压深底会糊，中深红才出轮廓
ART_RADIUS = 0.18                   # 圆角半径 = 0.18 * 边长


def art_source():
    """裁出头部并抠掉平灰背景，返回 RGBA。素材与裁切框都在 tools/icons/ 里，脚本不联网。"""
    im = Image.open(ART)
    if im.mode != "RGB":
        im = im.convert("RGB")
    im = im.crop(ART_CROP)
    diff = ImageChops.difference(im, Image.new("RGB", im.size, ART_KEY))
    r, g, b = diff.split()
    # 取三通道最大差当距离：比 convert("L") 的加权亮度可靠（背景是灰的，人物有红有黑）
    m = ImageChops.lighter(ImageChops.lighter(r, g), b)
    alpha = m.point(
        lambda v: 0 if v <= ART_KEY_TOL
        else (255 if v >= ART_KEY_TOL + ART_KEY_SOFT
              else round((v - ART_KEY_TOL) * 255 / ART_KEY_SOFT))
    )
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out


def art_render(base, size, radius_scale=ART_RADIUS):
    """圆角底板 + 人物：人物先贴上去，圆角由底板切，换底板色不用改任何一张图。"""
    radius = max(0, round(size * radius_scale))
    plate = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(plate)
    if radius > 0:
        draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=ART_PLATE + (255,))
    else:
        draw.rectangle([0, 0, size - 1, size - 1], fill=ART_PLATE + (255,))
    plate.alpha_composite(base.resize((size, size), Image.LANCZOS))
    return plate


# ---- 管理页图标（独立素材：Q 版神里绫华） ----
# 与站点那条线无关：站点换了人设，管理页仍用这张。白底素材在浅色标签栏里没有边界，
# 所以保留素材自己的白底、只压一层冷色乘算（这也是站点图标早先的做法）。
APP_ART = Path(__file__).with_name("source-ayaka-chibi.png")
APP_ART_CROP = (186, 21, 643, 479)   # 头部（含发饰与侧发），源图 1000x1000
APP_ART_TINT = (228, 238, 252)


def app_source():
    """裁出绫华的头部，保留素材自带的白底。"""
    im = Image.open(APP_ART)
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im.crop(APP_ART_CROP)


def app_render(size, radius_scale=ART_RADIUS):
    im = app_source().resize((size, size), Image.LANCZOS)
    im = ImageChops.multiply(im, Image.new("RGB", (size, size), APP_ART_TINT))
    radius = max(2, round(size * radius_scale))
    out = im.convert("RGBA")
    mask = Image.new("L", out.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, out.size[0] - 1, out.size[1] - 1], radius=radius, fill=255
    )
    out.putalpha(mask)
    return out


def art_mask_grid(base, n=N, cell=16):
    """从抠好的人物取剪影，供 safari-pinned-tab 用。

    直接读 alpha：背景已经按 ART_KEY 抠掉，不必再猜哪些像素算背景；脸是浅色但 alpha 是满的，
    不会被吃掉（这正是不用「亮度阈值」的原因）。
    """
    big = base.split()[-1].resize((n * cell, n * cell), Image.LANCZOS)
    px = big.load()
    g = Grid(n)
    step = 4
    total = len(range(0, cell, step)) ** 2
    for gy in range(n):
        for gx in range(n):
            hit = 0
            for yy in range(gy * cell, (gy + 1) * cell, step):
                for xx in range(gx * cell, (gx + 1) * cell, step):
                    if px[xx, yy] > 96:
                        hit += 1
            if hit >= total // 4:
                g.set(gx, gy, "k")
    return g


def render(g, size):
    """整数倍放大用 NEAREST；非整数（16/48 之类）先按目标尺寸重采样再阈值化，保持硬边。"""
    src = g.to_image()
    if size % g.n == 0:
        return src.resize((size, size), Image.NEAREST)
    big = src.resize((g.n * 8, g.n * 8), Image.NEAREST)
    out = big.resize((size, size), Image.BOX)
    # BOX 会带出中间色；量化回调色板，去掉抗锯齿灰边
    pal = [tuple(v) for v in PALETTE.values()]
    px = out.load()
    for y in range(size):
        for x in range(size):
            r, g_, b, a = px[x, y]
            if a < 96:
                px[x, y] = (0, 0, 0, 0)
                continue
            best = min(pal, key=lambda c: (c[0] - r) ** 2 + (c[1] - g_) ** 2 + (c[2] - b) ** 2)
            px[x, y] = best if best[3] else (0, 0, 0, 0)
    return out


def mask_svg(g, size):
    """safari-pinned-tab 只认单色路径：把非透明像素并成一条 path。
    注意这里必须用**不含底板**的人物网格——直接用带底板的网格会得到一整块圆角方块，
    固定标签上就看不出是什么。"""
    d = []
    for y in range(g.n):
        x = 0
        while x < g.n:
            if g.get(x, y) == ".":
                x += 1
                continue
            n = 1
            while x + n < g.n and g.get(x + n, y) != ".":
                n += 1
            d.append(f"M{x} {y}h{n}v1h-{n}z")
            x += n
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {g.n} {g.n}" '
        f'width="{size}" height="{size}">\n<path d="{"".join(d)}" fill="#8e1f2c"/>\n</svg>\n'
    )


def ico_bytes(images):
    """手写 ICO：Windows Vista+ 的 256 以下条目用 PNG 负载。PIL 的 ico 写出会 LANCZOS
    重采样，把像素风的硬边糊掉；这里自己组容器，每个尺寸都来自 render() 的硬边结果。"""
    entries = []
    for size, im in images:
        buf = _png_bytes(im)
        entries.append((size, buf))
    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + 16 * len(entries)
    dirs = b""
    data = b""
    for size, buf in entries:
        w = 0 if size >= 256 else size
        h = 0 if size >= 256 else size
        dirs += struct.pack(
            "<BBBBHHII", w, h, 0, 0, 1, 32, len(buf), offset + len(data)
        )
        data += buf
    return header + dirs + data


def _png_bytes(im):
    import io

    b = io.BytesIO()
    im.save(b, format="PNG", optimize=True)
    return b.getvalue()


# ============================================
# 导航栏像素小人（第三条线，与 --style 无关 —— 它永远是像素风）
# ============================================
# 为什么自绘而不是找现成的像素图：safebooru 上这几个角色的 pixel_art 少到凑不成一套
# （艾米莉娅 0 张、蕾姆 6 张、派蒙 15 张），而把精细的 Q 版插画压到 32×32 也试过 ——
# 五官会糊成一团、边缘还会留一圈灰毛边（实测对比留在 .shots/navtest/sweep-emilia.png）。
# 自绘顺带把许可问题解决干净：不复制任何官方素材，只是按角色的配色与特征自己画。
#
# 16px 显示时整张脸只有约 6×6 像素，**认人靠的不是五官，而是发色 + 配饰剪影 + 发长**
# 这三件事，所以八个角色的差异全做在这三处：发色刻意拉开（奶白 / 白绿 / 淡蓝紫 / 天蓝 /
# 金 / 暖棕 / 深紫 / 银白），配饰剪影各不相同（王冠 / 叶芽 / 双角 / 女仆头饰 / 便帽 /
# 梅花 / 女巫帽 / 花）。眼睛只保留「上眼睑重线 + 虹膜 + 一点高光」的 3×4 结构 ——
# 画成 5 宽的整块色会变成护目镜，这条经验见 draw_chibi() 的注释。
NAV_DIR = ROOT / "assets" / "images" / "nav"
NAV_COLORS = 32   # 每张实际只有 13~15 色，32 色量化无损，体积减半以上（见 png_bytes）

SKIN = PALETTE["s"]
SKIN_D = PALETTE["t"]
BLUSH = PALETTE["p"]
WHITE = PALETTE["w"]
GOLD = PALETTE["g"]
INK = PALETTE["o"]

# (导航项 id, 备注, 规格)。id 与 hugo.toml 的菜单 identifier 一一对应，
# 图标文件名就是 <id>.png —— 模板按 identifier 去找图，不加一张映射表。
# hair 前三个是主色/亮色/暗色，第四个（可选）是发梢的渐变色。
NAV_CHARS = [
    ("home", "派蒙", dict(
        hair=((250, 238, 208), (255, 250, 232), (214, 192, 146)),
        eye=((60, 76, 142), (32, 44, 90)), cloth=((244, 247, 252), (108, 142, 210)),
        style="bob", acc="crown", acc_c=(236, 196, 100))),
    ("library", "纳西妲", dict(
        hair=((238, 238, 246), (252, 252, 255), (198, 200, 214), (124, 198, 140)),
        eye=((92, 174, 116), (44, 116, 70)), cloth=((246, 250, 244), (96, 168, 116)),
        style="side_tail", acc="leaf", acc_c=(104, 186, 118))),
    ("cs", "甘雨", dict(
        hair=((172, 182, 222), (206, 214, 242), (124, 134, 180)),
        eye=((168, 120, 200), (106, 68, 146)), cloth=((54, 64, 106), (214, 198, 150)),
        style="long", acc="horns", acc_c=((80, 62, 96), (204, 72, 86)))),
    ("courses", "蕾姆", dict(
        hair=((132, 186, 236), (178, 214, 248), (74, 130, 190)),
        eye=((86, 158, 216), (44, 106, 164)), cloth=((46, 46, 56), (238, 242, 250)),
        style="bob", acc="headband", acc_c=(250, 250, 252))),
    ("projects", "可莉", dict(
        hair=((238, 208, 128), (252, 232, 176), (194, 158, 80)),
        eye=((214, 86, 74), (156, 42, 38)), cloth=((196, 72, 64), (248, 244, 238)),
        style="twins", acc="cap", acc_c=(196, 68, 60))),
    ("tags", "胡桃", dict(
        hair=((96, 68, 48), (128, 94, 66), (62, 44, 32), (156, 78, 58)),
        eye=((212, 82, 72), (150, 38, 34)), cloth=((62, 46, 38), (196, 72, 74)),
        style="twins", acc="plum", acc_c=(196, 62, 76))),
    ("search", "莫娜", dict(
        hair=((92, 74, 116), (120, 100, 148), (58, 46, 78)),
        eye=((92, 186, 156), (44, 122, 100)), cloth=((64, 50, 86), (204, 176, 96)),
        style="long", acc="witch", acc_c=((38, 30, 56), (204, 176, 96)))),
    ("about", "艾米莉娅", dict(
        hair=((230, 228, 240), (250, 250, 255), (188, 186, 204)),
        eye=((150, 112, 202), (94, 60, 148)), cloth=((246, 246, 250), (138, 106, 190)),
        style="long", acc="flower", acc_c=((255, 255, 255), (138, 106, 190)))),
]


def _eye(c, x0, ec, ed):
    c.hline(15, x0, x0 + 2, ed)
    c.set(x0, 16, ec)
    c.set(x0 + 1, 16, WHITE)
    c.set(x0 + 2, 16, ec)
    c.hline(17, x0, x0 + 2, ec)
    c.hline(18, x0, x0 + 2, ed)


def draw_nav_chibi(spec):
    """画一个 32×32 的角色半身。**不垫底板**：它贴在半透明的毛玻璃顶栏上，底板会显脏。"""
    c = Grid()
    hair = spec["hair"]
    hm, hl, hd = hair[0], hair[1], hair[2]
    tip = hair[3] if len(hair) > 3 else None
    ec, ed = spec["eye"]
    cm, cd = spec["cloth"]
    style, acc = spec["style"], spec["acc"]

    long_hair = style in ("long", "twins", "side_tail")
    if long_hair:                      # 后发：长发的底层，免得两侧只到下巴像短发
        for y in range(10, 32):
            for x in range(3, 29):
                c.set(x, y, hd)

    def half(y):                       # 宽扁圆顶 + 两侧直下
        if y < 2 or y > 26:
            return -1.0
        if y <= 14:
            t = (14 - y) / 13.0
            return 12.5 * (1.0 - t ** 3) ** 0.5
        return 12.5 - 1.5 * max(0, y - 25)

    for y in range(2, 27):
        hw = half(y)
        if hw <= 0:
            continue
        for x in range(math.ceil(15.5 - hw), math.floor(15.5 + hw) + 1):
            c.set(x, y, hm)

    if acc not in ("cap", "witch"):    # 呆毛（戴帽子的两位不画，会被帽子吃掉）
        c.set(16, 1, hm)
        c.set(17, 0, hm)
        c.set(17, 1, hm)

    for y in (25, 26):                 # 颈部挖空，脸和脖子随后补回来
        for x in range(11, 21):
            c.set(x, y, ".")
    c.ellipse(15.5, 18.0, 7.5, 7.0, SKIN)

    def bang(x):                       # 齐刘海逐列不等下缘：写成矩形头会变成一个方盒
        if 10 <= x <= 21:
            return 12
        if 8 <= x <= 23:
            return 13
        return 14

    for x in range(2, 30):
        for y in range(1, bang(x) + 1):
            if c.get(x, y) != ".":
                c.set(x, y, hm)
        if c.get(x, bang(x)) == hm:
            c.set(x, bang(x), hd)

    for y in range(14, 27):            # 侧发：内层中间调、外层暗色，把头发和脸分开
        c.set(8, y, hm)
        c.set(23, y, hm)
    for y in range(16, 26):
        c.set(3, y, hd)
        c.set(28, y, hd)

    if tip:                            # 发梢渐变色（纳西妲/胡桃）
        for y in range(22, 27):
            for x in (2, 3, 4, 27, 28, 29):
                if c.get(x, y) == hd:
                    c.set(x, y, tip)

    _eye(c, 10, ec, ed)                # 眼睛
    _eye(c, 19, ec, ed)
    c.set(9, 20, BLUSH)                # 腮红
    c.set(22, 20, BLUSH)
    c.hline(21, 15, 16, INK)           # 嘴

    # ---- 配饰：剪影是辨识度的主要来源 ----
    if acc == "crown":                 # 派蒙：三尖小金冠（第一版只画了一条线，16px 下看不见）
        for x in range(11, 21):
            c.set(x, 2, spec["acc_c"])
        for x in (11, 15, 19):
            c.set(x, 1, spec["acc_c"])
            c.set(x, 0, spec["acc_c"])
    elif acc == "leaf":
        c.set(19, 0, spec["acc_c"])
        c.set(20, 0, spec["acc_c"])
        c.set(19, 1, (150, 206, 158))
    elif acc == "horns":               # 甘雨：两只角 + 一枚红发饰。
        # 角必须**立到头顶轮廓之上**（y0~5）：第一版把它们画在头两侧的头发上（y4~10、x5/25），
        # 那里正好是头发外缘、紧贴描边，32px 下整个被吃掉，看不出长角。
        hc, rc = spec["acc_c"]
        for x0, d in ((10, -1), (21, 1)):
            for k in range(6):
                y = 5 - k
                x = x0 + (k // 2) * d
                c.set(x, y, hc)
                c.set(x + 1, y, hc)
        c.set(23, 11, rc)
        c.set(24, 11, rc)
        c.set(23, 12, rc)
    elif acc == "headband":            # 蕾姆：白色女仆头饰（带齿）
        for x in range(9, 23):
            c.set(x, 4, spec["acc_c"])
        for x in range(10, 23, 2):
            c.set(x, 3, spec["acc_c"])
    elif acc == "cap":                 # 可莉：红贝雷帽 + 白球（圆顶，不是方块 —— 方块像顶轿子）
        for y in range(0, 7):
            w = 9 - abs(y - 3)
            for x in range(16 - w, 16 + w):
                c.set(x, y, spec["acc_c"])
        for x in range(8, 24):
            c.set(x, 6, spec["acc_c"])
        c.set(15, 0, WHITE)
        c.set(16, 0, WHITE)
    elif acc == "plum":                # 胡桃：梅花发饰（深色底 + 红瓣 + 金心）
        c.ellipse(6.0, 8.0, 3.6, 3.2, INK)
        c.ellipse(6.0, 8.0, 2.8, 2.4, spec["acc_c"])
        for dx, dy in ((-1, -1), (1, -1), (-1, 1), (1, 1)):
            c.set(6 + dx, 8 + dy, WHITE)
        c.set(6, 8, GOLD)
    elif acc == "witch":               # 莫娜：宽檐女巫帽 + 金帽带（剪影最独特的一顶）。
        # 帽色必须**明显深于发色**：第一版帽子(62,48,84)与头发(92,74,116)太近，
        # 32px 下帽檐和头顶连成一片，看不出戴了帽子。
        hc, band = spec["acc_c"]
        for x in range(3, 29):
            c.set(x, 6, hc)
            c.set(x, 7, hc)
        for y in range(0, 7):
            w = 5 + y // 2
            for x in range(16 - w, 16 + w):
                c.set(x, y, hc)
        for x in range(10, 23):
            c.set(x, 5, band)
            c.set(x, 4, band)
    elif acc == "flower":              # 艾米莉娅：白花 + 紫缎带。
        # 花必须垫一层深色底：银发上的白花等于没有（第一版就是这样，整个发饰看不见）。
        fc, rc = spec["acc_c"]
        c.ellipse(6.0, 8.0, 3.6, 3.2, INK)
        for dx, dy in ((0, -2), (0, 2), (-2, 0), (2, 0)):
            c.set(6 + dx, 8 + dy, fc)
        c.set(6, 8, rc)
        for y in range(11, 15):
            c.set(3, y, rc)

    c.rect(14, 24, 17, 27, SKIN)       # 脖子
    c.hline(25, 13, 18, SKIN_D)        # 下颌投影，把下巴和脖子分开
    c.rect(4, 27, 27, 31, cm)          # 衣领
    for i in range(4):
        c.set(15 - i, 27 + i, cd)
        c.set(16 + i, 27 + i, cd)

    # 长发/马尾**压在衣领之上**再画一遍。第一版把它们画在衣领之前，结果被 y27..31 的衣领
    # 整片盖掉 —— 四个长发角色在剪影上全变成了短发，只能靠发色分辨，等于白做「发长」这条线索。
    if long_hair:
        for y in range(23, 32):
            for x in list(range(2, 8)) + list(range(25, 31)):
                c.set(x, y, hd)
    if style == "twins":               # 双马尾：外侧两条，垂到画面底
        for y in range(18, 32):
            for x in (1, 2, 3, 29, 30, 28):
                c.set(x, y, hd)
    if style == "side_tail":           # 侧马尾：只在右侧，且发梢带渐变色
        for y in range(18, 32):
            for x in range(24, 30):
                c.set(x, y, hd)
        if tip:
            for y in range(27, 32):
                for x in range(24, 30):
                    if c.get(x, y) == hd:
                        c.set(x, y, tip)

    c.outline()
    return c.to_image()


def nav_icons():
    """返回 [(id, 备注, Image)]，32×32 透明底。"""
    return [(key, note, draw_nav_chibi(spec)) for key, note, spec in NAV_CHARS]


def nav_preview(out):
    """浅底/深底各一行（顶栏是半透明毛玻璃，深色主题下必须也看得清），末行是 16px 实尺。"""
    icons = nav_icons()
    cell, pad = 132, 8
    w = pad + len(icons) * (cell + pad)
    canvas = Image.new("RGB", (w, pad * 4 + cell * 2 + 30), (255, 255, 255))
    d = ImageDraw.Draw(canvas)
    # 底色要**离开近白**：顶栏是 `--surface` 近白（浅色）/ 近黑（深色）的毛玻璃，
    # 而好几个角色的衣领就是近白 —— 用纯白垫底时领口会和底糊在一起，看不出边界。
    for row, (bg, label) in enumerate((((206, 212, 224), "浅色主题顶栏（近似：近白毛玻璃压在照片上）"),
                                       ((30, 27, 38), "深色主题顶栏（近似）"))):
        y0 = pad + row * (cell + pad + 15)
        d.rectangle([0, y0 - 2, w, y0 + cell + 2], fill=bg)
        d.text((pad, y0 + cell + 2), label, fill=(120, 120, 130))
        for i, (_key, _note, im) in enumerate(icons):
            x = pad + i * (cell + pad)
            canvas.paste(im.resize((cell, cell), Image.NEAREST), (x, y0),
                         im.resize((cell, cell), Image.NEAREST))
    y0 = pad * 3 + cell * 2 + 30
    d.rectangle([0, y0 - 4, w, y0 + 24], fill=(206, 212, 224))
    for i, (_key, _note, im) in enumerate(icons):
        x = pad + i * (cell + pad)
        small = im.resize((16, 16), Image.NEAREST)
        canvas.paste(small, (x, y0), small)
        d.text((x + 22, y0 + 2), NAV_CHARS[i][0], fill=(60, 60, 70))
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)
    print("preview:", out)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", choices=("art", "pixel"), default="art",
                    help="art = 裁 Q 版插画（默认）；pixel = 脚本自绘的 32x32 像素风")
    ap.add_argument("--preview", metavar="OUT", help="只渲染预览图，不写 static/")
    ap.add_argument("--preview-nav", metavar="OUT", help="只渲染导航像素小人预览（浅底/深底各一行）")
    ap.add_argument("--check", action="store_true", help="比对 static/ 与 assets/images/nav/ 是否与脚本一致")
    a = ap.parse_args()

    if a.preview_nav:
        return nav_preview(Path(a.preview_nav))

    if a.style == "art":
        base = art_source()

        def source_at(size):
            return art_render(base, size)

        mask_grid = art_mask_grid(base)
        flat = art_render(base, 8 * N)
    else:
        grid, char_grid = draw_chibi()

        def source_at(size):
            return render(grid, size)

        mask_grid = char_grid
        flat = render(grid, 8 * N)

    if a.preview:
        out = Path(a.preview)
        out.parent.mkdir(parents=True, exist_ok=True)
        sizes = [16, 24, 32, 48, 64, 128]
        canvas = Image.new(
            "RGBA", (8 * N + 40 + sum(sizes) + 40, 8 * N + 40), (24, 26, 32, 255)
        )
        canvas.alpha_composite(flat.convert("RGBA"), (20, 20))
        x = 8 * N + 40
        for sz in sizes:
            canvas.alpha_composite(source_at(sz), (x, 20))
            x += sz + 6
        canvas.save(out)
        print("preview:", out, "style:", a.style)
        return 0

    apple = art_render(base, 180, 0) if a.style == "art" else _apple_pixel(source_at(180))
    outputs = {
        "favicon-16x16.png": source_at(16),
        "favicon-32x32.png": source_at(32),
        # iOS 自己会切圆角，这里给不带圆角、不透明的整幅。
        # 180x180 的真彩 PNG 有 61 KB，而它只在「加入主屏幕/收藏」时下载一次；
        # 量化到 256 色后 13 KB，180px 下肉眼无差（对比图见提交说明）。
        "apple-touch-icon.png": png_bytes(apple, quantize=True),
    }
    outputs["safari-pinned-tab.svg"] = mask_svg(mask_grid, 64)
    # 站点 favicon.ico 只放小尺寸。ICO 是「所有条目一起下载」的容器，加一张 256x256
    # 的真图会让每个访客多下 ~160 KB——图标本身成了页面上最重的东西。
    ico = ico_bytes([(sz, source_at(sz)) for sz in ICO_SITE_SIZES])
    # 管理页那个图标兼作 Windows 桌面快捷方式图标，需要大尺寸（资源管理器的大图标视图）。
    # 管理页图标走自己那条线（绫华）：与站点人设解耦，站点换图不影响它
    app_ico = ico_bytes([(sz, app_render(sz)) for sz in ICO_APP_SIZES])

    drift = []
    if a.check:
        for name, obj in outputs.items():
            path = STATIC / name
            if not path.exists():
                drift.append(f"缺失 {name}")
                continue
            if isinstance(obj, str):
                if path.read_text(encoding="utf-8") != obj:
                    drift.append(f"内容不一致 {name}")
            elif isinstance(obj, bytes):
                if path.read_bytes() != obj:
                    drift.append(f"内容不一致 {name}")
            else:
                import io

                b = io.BytesIO()
                obj.save(b, format=path.suffix.lstrip(".").upper())
                if path.read_bytes() != b.getvalue():
                    drift.append(f"内容不一致 {name}")
        for path, blob in ((STATIC / "favicon.ico", ico), (APP_ICO, app_ico)):
            if not path.exists() or path.read_bytes() != blob:
                drift.append("内容不一致 " + path.relative_to(ROOT).as_posix())
        for key, _note, im in nav_icons():
            path = NAV_DIR / f"{key}.png"
            if not path.exists():
                drift.append("缺失 " + path.relative_to(ROOT).as_posix())
            elif path.read_bytes() != png_bytes(im, quantize=True, colors=NAV_COLORS):
                drift.append("内容不一致 " + path.relative_to(ROOT).as_posix())
        if drift:
            print("\u2717 图标与生成脚本不一致：")
            for d in drift:
                print("  ", d)
            return 1
        print("\u2713 图标与生成脚本一致（style=%s）" % a.style)
        return 0

    for name, obj in outputs.items():
        path = STATIC / name
        write_atomic(path, obj)
        print("wrote", path.relative_to(ROOT).as_posix(), path.stat().st_size, "B")
    for path, blob in ((STATIC / "favicon.ico", ico), (APP_ICO, app_ico)):
        write_atomic(path, blob)
        print("wrote", path.relative_to(ROOT).as_posix(), path.stat().st_size, "B")
    for key, _note, im in nav_icons():
        path = NAV_DIR / f"{key}.png"
        write_atomic(path, png_bytes(im, quantize=True, colors=NAV_COLORS))
        print("wrote", path.relative_to(ROOT).as_posix(), path.stat().st_size, "B")
    return 0


def write_atomic(path, data):
    """原子写：先落到同目录的 .tmp 再换名。

    直接写目标文件时，正在跑的 hugo server（watch）会读到写了一半的图，
    报 "failed to load image config: image: unknown format" 并中断那一次重建（实测踩过）。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    if isinstance(data, str):
        tmp.write_text(data, encoding="utf-8")
    elif isinstance(data, bytes):
        tmp.write_bytes(data)
    else:  # PIL.Image：临时文件名没有扩展名，格式要显式给
        data.save(tmp, format=path.suffix.lstrip(".").upper())
    tmp.replace(path)


def png_bytes(im, quantize=False, colors=256):
    """PNG 字节（可量化）。--check 用同一函数重算，保证「比对」和「写盘」是同一条路径。

    `colors` 只给导航小人用：那 8 张每张只有 13~15 种颜色，量化到 32 色是无损的，
    而它们在**每个页面**都要下载 —— 实测从 10.3 KB 降到 4.1 KB。
    """
    import io

    if quantize:
        im = im.convert("RGBA").quantize(colors=colors, method=Image.FASTOCTREE)
    else:
        im = im.convert("RGBA")
    b = io.BytesIO()
    im.save(b, format="PNG", optimize=True)
    return b.getvalue()


def _apple_pixel(im):
    """pixel 风格的 apple-touch-icon：iOS 不透明，垫一层底色。"""
    bg = Image.new("RGBA", im.size, (238, 242, 250, 255))
    bg.alpha_composite(im)
    return bg


if __name__ == "__main__":
    sys.exit(main())
