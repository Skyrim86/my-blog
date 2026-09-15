#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成站点图标（Q 版神里绫华）：static/favicon.ico / favicon-16x16.png /
favicon-32x32.png / apple-touch-icon.png / safari-pinned-tab.svg。

为什么要有这个脚本：图标是二进制产物，手改一次就没人知道它从哪来。这里把「图」按风格定义成
可复现的输入，脚本负责栅格化成各尺寸——改裁切框、改色只改本文件。

两种风格（--style）：
  art（默认）从 tools/icons/source-ayaka-chibi.png 裁头部。出处与许可见 docs/architecture.md。
  pixel      脚本自绘的像素风（32x32 调色板网格），不依赖任何外部素材，许可干净。

用法：
  python tools/icons/make-icons.py                 # 写 static/ 下的全部图标
  python tools/icons/make-icons.py --style pixel   # 换成自绘像素风
  python tools/icons/make-icons.py --preview OUT   # 只渲染预览（各实际尺寸并排）
  python tools/icons/make-icons.py --check         # 不写盘，比对 static/ 是否与脚本一致（非零退出=漂移）

设计约定：
  - 16px 是下限：art 风格靠「大头裁切 + 冷色调压白底」，pixel 风格靠 32x32 主网格整数倍缩放。
  - 圆角由脚本加（art 风格），不靠素材自带的边框。
"""

import argparse
import math
import struct
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
STATIC = ROOT / "static"
# 管理页的图标（同时是桌面快捷方式用的那个）——放在 tools/admin/ui/ 下，由管理页直接提供服务
APP_ICO = ROOT / "tools" / "admin" / "ui" / "ayaka.ico"

ICO_SITE_SIZES = (16, 32)
ICO_APP_SIZES = (16, 32, 48, 64, 128, 256)

N = 32  # 主网格边长

# ---- 调色板（神里绫华配色：白蓝发、蓝眼、深蓝和服、金饰 + 深蓝圆角底板）----
PALETTE = {
    "o": (11, 16, 32, 255),        # 描边（近黑蓝，压在深蓝底板上仍有边界）
    "h": (244, 248, 255, 255),     # 头发
    "H": (205, 218, 238, 255),     # 头发中间调
    "d": (168, 187, 219, 255),     # 头发暗部
    "s": (253, 227, 211, 255),     # 皮肤
    "t": (242, 190, 168, 255),     # 皮肤暗部（脸颊/下眼睑）
    "b": (74, 144, 226, 255),      # 眼睛（蓝）
    "B": (42, 95, 174, 255),       # 眼睛暗部/上眼睑
    "w": (255, 255, 255, 255),     # 高光/白
    "k": (47, 79, 158, 255),       # 和服深蓝
    "K": (111, 146, 214, 255),     # 和服浅蓝
    "g": (233, 200, 119, 255),     # 金色发饰
    "r": (143, 196, 240, 255),     # 发带/樱花蓝
    "p": (246, 182, 168, 255),     # 腮红
    "P": (27, 35, 52, 255),        # 底板（深蓝黑）
    "G": (39, 50, 76, 255),        # 底板上的光晕
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
                p[x, y] = PALETTE[self.px[y][x]]
        return im


def rounded_plate(g, radius, color):
    for y in range(g.n):
        for x in range(g.n):
            cx = min(max(x, radius - 0.5), g.n - radius - 0.5)
            cy = min(max(y, radius - 0.5), g.n - radius - 0.5)
            if (x - cx) ** 2 + (y - cy) ** 2 <= (radius - 0.5) ** 2:
                g.set(x, y, color)


def draw_ayaka():
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
# 源图出处与许可见 docs/architecture.md「图标」一节；裁切框留在这里，换一张图只改这三个常量。
ART = Path(__file__).with_name("source-ayaka-chibi.png")
ART_CROP = (186, 21, 643, 479)      # 头部（含发饰与侧发），源图 1000x1000
ART_TINT = (228, 238, 252)          # 冷色乘算：白底素材在浅色标签栏里没有边界，压一层才认得出来
ART_RADIUS = 0.18                   # 圆角半径 = 0.18 * 边长


def art_source():
    """裁出头部。原始素材与裁切框都在 tools/icons/ 里，脚本不联网。"""
    im = Image.open(ART)
    if im.mode != "RGB":
        im = im.convert("RGB")
    return im.crop(ART_CROP)


def rounded_alpha(im, radius):
    """给方形图加圆角 alpha。radius=0 时原样返回。"""
    if radius <= 0:
        return im.convert("RGBA")
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, im.size[0] - 1, im.size[1] - 1], radius=radius, fill=255
    )
    out = im.convert("RGBA")
    out.putalpha(mask)
    return out


def art_render(base, size, radius_scale=ART_RADIUS):
    im = base.resize((size, size), Image.LANCZOS)
    im = ImageChops.multiply(im, Image.new("RGB", (size, size), ART_TINT))
    return rounded_alpha(im, max(2, round(size * radius_scale)))


def art_mask_grid(base, n=N, tol=228, cell=16, need=8):
    """从插画取人物剪影，供 safari-pinned-tab 用。

    用「从四边泛洪填掉近白背景」而不是「按亮度阈值」：绫华的头发本身就是近白的，
    阈值会直接把她剃成秃头。泛洪只吃掉与画布边缘连通的近白区域，头发被轮廓线包住，留得下来。
    """
    big = base.resize((n * cell, n * cell), Image.LANCZOS)
    w, h = big.size
    px = big.load()

    def bg(x, y):
        r, g, b = px[x, y]
        return r >= tol and g >= tol and b >= tol

    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not seen[x * h + y] and bg(x, y):
                seen[x * h + y] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not seen[x * h + y] and bg(x, y):
                seen[x * h + y] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not seen[nx * h + ny] and bg(nx, ny):
                seen[nx * h + ny] = 1
                q.append((nx, ny))

    g = Grid(n)
    step = 4
    total = len(range(0, cell, step)) ** 2
    for gy in range(n):
        for gx in range(n):
            hit = 0
            for yy in range(gy * cell, (gy + 1) * cell, step):
                for xx in range(gx * cell, (gx + 1) * cell, step):
                    if not seen[xx * h + yy]:
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
        f'width="{size}" height="{size}">\n<path d="{"".join(d)}" fill="#2f4f9e"/>\n</svg>\n'
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--style", choices=("art", "pixel"), default="art",
                    help="art = 裁 Q 版插画（默认）；pixel = 脚本自绘的 32x32 像素风")
    ap.add_argument("--preview", metavar="OUT", help="只渲染预览图，不写 static/")
    ap.add_argument("--check", action="store_true", help="比对 static/ 是否与脚本一致")
    a = ap.parse_args()

    if a.style == "art":
        base = art_source()

        def source_at(size):
            return art_render(base, size)

        mask_grid = art_mask_grid(base)
        flat = ImageChops.multiply(
            base.resize((8 * N, 8 * N), Image.LANCZOS),
            Image.new("RGB", (8 * N, 8 * N), ART_TINT),
        )
    else:
        grid, char_grid = draw_ayaka()

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
    app_ico = ico_bytes([(sz, source_at(sz)) for sz in ICO_APP_SIZES])

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
        if drift:
            print("\u2717 图标与生成脚本不一致：")
            for d in drift:
                print("  ", d)
            return 1
        print("\u2713 图标与生成脚本一致（style=%s）" % a.style)
        return 0

    for name, obj in outputs.items():
        path = STATIC / name
        if isinstance(obj, str):
            path.write_text(obj, encoding="utf-8")
        elif isinstance(obj, bytes):
            path.write_bytes(obj)
        else:
            obj.save(path)
        print("wrote", path.relative_to(ROOT).as_posix(), path.stat().st_size, "B")
    for path, blob in ((STATIC / "favicon.ico", ico), (APP_ICO, app_ico)):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(blob)
        print("wrote", path.relative_to(ROOT).as_posix(), path.stat().st_size, "B")
    return 0


def png_bytes(im, quantize=False):
    """PNG 字节（可量化）。--check 用同一函数重算，保证「比对」和「写盘」是同一条路径。"""
    import io

    if quantize:
        im = im.convert("RGBA").quantize(colors=256, method=Image.FASTOCTREE)
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
