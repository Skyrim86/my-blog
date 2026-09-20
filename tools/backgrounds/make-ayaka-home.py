#!/usr/bin/env python3
# 首页 hero 的**场景立绘**（透明底）：source-ayaka-desk.png → assets/images/ayaka-home.webp
#
# 用法（与 make-mascot.py 同一个解释器）：C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-ayaka-home.py
#
# 显不显示由 hugo.toml 的 [params.home].chara 决定（**当前留空 = 关着**，首页那块位置现在是
# 卡片组；两种形式的取舍见 docs/features.md ㉕）。出图宽度比「显示宽度的 2 倍」再宽一档：
# 正好等于 2x 时 Hugo 的 Resize 会把它放大，多花字节还发虚。
#
# 源图**本来就是透明底的**（官方春季立绘，实测 49.8% 全透明），所以没有抠图那一套（不灌水、
# 不去白边、不反解 alpha）——那些坑都属于「白底画稿」，判据与实测数字在 docs/traps.md。
# 它只做三件事：按 alpha 包围盒裁切 / **预乘 alpha** 下采样（不然透明区的 RGB 会被平均进边缘，
# 深色主题下就是一圈脏边）/ 出深浅两底的预览图。
#
# **卡面不在这里生成**（2026-09-20 移走）：这个脚本以前还出 4 张 5:7 卡面（ayaka-sword /
# -kimono / -veil / -desk，600×840），与 tools/cards/make-cards.py 写的是**同一批文件名** ——
# 谁后跑谁赢，卡面尺寸或取景一改，旧脚本就能把它们悄悄覆盖回去。卡面统一只走 make-cards.py
# （清单是 data/home-cards.yaml），这里只留立绘。
#
# 改完**必须看预览图**（写在仓库外的 ../lab/shots/ayaka_check.png，深底 / 浅底各一张）。
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BG = os.path.join(ROOT, "tools", "backgrounds")
IMAGES = os.path.join(ROOT, "assets", "images")
LAB = os.path.join(ROOT, os.pardir, "lab", "shots")

SRC_FIG = os.path.join(BG, "source-ayaka-desk.png")
DEST_FIG = os.path.join(IMAGES, "ayaka-home.webp")
FIG_PAD = 4        # 按包围盒裁切时四周留的余量
FIG_W = 560        # 显示宽度（hugo.toml 的 charaWidth=250）× 2 = 500，再留一档余量


def premul_resize(rgba, size):
    """预乘 alpha 的下采样：不这么做，透明区的 RGB 会被平均进轮廓，深色主题下就是一圈脏边。"""
    arr = np.asarray(rgba).astype(np.float32)
    an = arr[..., 3:4] / 255.0
    pre = np.dstack([arr[..., :3] * an, arr[..., 3]]).astype(np.uint8)
    pa = np.asarray(Image.fromarray(pre, "RGBA").resize(size, Image.LANCZOS)).astype(np.float32)
    an2 = pa[..., 3:4] / 255.0
    return Image.fromarray(
        np.dstack([np.clip(pa[..., :3] / np.maximum(an2, 1e-6), 0, 255), pa[..., 3:4]]).astype(np.uint8),
        "RGBA",
    )


def build_figure():
    im = Image.open(SRC_FIG).convert("RGBA")
    print(f"[立绘] 源图 {im.size[0]}x{im.size[1]}")
    al = np.asarray(im.getchannel("A"))
    ys, xs = np.where(al > 8)
    box = (max(0, xs.min() - FIG_PAD), max(0, ys.min() - FIG_PAD),
           min(im.width, xs.max() + 1 + FIG_PAD), min(im.height, ys.max() + 1 + FIG_PAD))
    print(f"[立绘] 包围盒 {box[2]-box[0]}x{box[3]-box[1]}（原图四周是空的，裁掉）")
    im = im.crop(box)
    out = premul_resize(im, (FIG_W, max(1, round(im.height * FIG_W / im.width))))
    out.save(DEST_FIG, "WEBP", quality=82, method=6)
    print(f"[立绘] ayaka-home.webp {out.size[0]}x{out.size[1]}  {os.path.getsize(DEST_FIG) // 1024} KB")
    tiles = [Image.alpha_composite(Image.new("RGBA", out.size, c), out).convert("RGB")
             for c in ((20, 19, 26, 255), (247, 245, 248, 255))]
    sheet = Image.new("RGB", (tiles[0].width * 2 + 12, tiles[0].height), (90, 90, 90))
    sheet.paste(tiles[0], (0, 0))
    sheet.paste(tiles[1], (tiles[0].width + 12, 0))
    sheet.save(os.path.join(LAB, "ayaka_check.png"))
    print("[立绘] 预览（深底 / 浅底）", os.path.join(LAB, "ayaka_check.png"))


if __name__ == "__main__":
    os.makedirs(LAB, exist_ok=True)
    build_figure()
    print("→ 首页显示它与否：hugo.toml 的 [params.home].chara（留空即不显示，那块位置给卡片组）")
