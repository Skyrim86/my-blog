#!/usr/bin/env python3
# 首页的绫华素材——**三样产出**（首页显示哪一样由 hugo.toml 的 [params.home] 决定）：
#
#   ① hero 立绘（透明底场景）：source-ayaka-desk.png  → assets/images/ayaka-home.webp
#   ② 全息卡片组（4 张卡面，2026-09-19 加）：四张画各裁一张 5:7 卡面 → assets/images/cards/*.webp
#      卡面的「全息」是 CSS 画的（09-home.css 的 .home-card），不是做进图的：图只管画面，
#      彩虹／镭射那层压在上面，这样换卡、调色都不用重出图。
#   ③ （已弃用）2.5:1 的宽幅单卡 —— 被卡片组取代，代码删了，源图仍留着（sword 那张做卡面在用）
#
# 用法（与 make-mascot.py 同一个解释器）：C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-ayaka-home.py
#
# ①的源图**本来就是透明底的**（官方春季立绘，实测 49.8% 全透明），所以没有抠图那一套（不灌水、
# 不去白边、不反解 alpha）——那些坑都属于「白底画稿」，判据与实测数字在 docs/traps.md。
# 它只做三件事：按 alpha 包围盒裁切 / **预乘 alpha** 下采样（不然透明区的 RGB 会被平均进边缘，
# 深色主题下就是一圈脏边）/ 出图比「显示宽度的 2 倍」再宽一档（正好等于 2x 时 Hugo 的 Resize
# 会把它放大，多花字节还发虚）。
#
# ②的每张画构图不同，所以裁切窗口是**逐张量出来的**（见 CARDS 的 box 与注释）：
#   统一裁成 5:7（集换式卡牌的比例），focus 一律对着人脸那个区域。透明的那张（desk）没有底色，
#   所以先铺一层渐变再贴上去，否则卡面会是透明的。
#
# 改完**必须看预览图**（写在仓库外的 ../lab/shots/：立绘深浅两底各一张 + 四张卡面拼一张）。
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
BG = os.path.join(ROOT, "tools", "backgrounds")
IMAGES = os.path.join(ROOT, "assets", "images")
LAB = os.path.join(ROOT, os.pardir, "lab", "shots")

# ---- ① hero 立绘（透明底场景） ----
SRC_FIG = os.path.join(BG, "source-ayaka-desk.png")
DEST_FIG = os.path.join(IMAGES, "ayaka-home.webp")
FIG_PAD = 4        # 按包围盒裁切时四周留的余量
FIG_W = 560        # 显示宽度（hugo.toml 的 charaWidth=250）× 2 = 500，再留一档余量

# ---- ② 卡片组：四张卡面，统一 5:7 ----
CARD_W, CARD_H = 600, 840          # 出图 600×840（显示约 150×210，即 4 倍，各档屏幕都够）
CARD_QUALITY = 82
CARDS = [
    # 出处与裁切理由都记在 docs/features.md ㉕
    dict(src="source-ayaka-sword.jpg", out="cards/ayaka-sword.webp",
         box=(1028, 0, 2671, 2300),          # 3508×2480 横构图：以她的脸为轴取 5:7（收在 y=2300，
         note="pixiv 98079154：白上衣 + 藏青袴、木刀搭肩"),   #   再往下就把作者署名框进来了）
    dict(src="source-ayaka-kimono.png", out="cards/ayaka-kimono.webp",
         auto=True, pad=1.06,                # 4637×6522 上人很小、四周大片白：按内容包围盒自动取景
         #   pad 不能给大：她的内容包围盒实测 3059×5656（高瘦），5:7 的窗本就需要 4039 宽，
         #   再乘 1.25 就超过画布宽度、被夹成整张图（踩到过）
         note="pixiv 91546278：黑和服跪坐"),
    dict(src="source-ayaka-veil.jpg", out="cards/ayaka-veil.webp",
         box=(0, 0, 2532, 3545),             # 2532×4096 是张特写：从顶开始取，头顶不切
         note="twitter wani_Dile：披纱正装"),
    dict(src="source-ayaka-desk.png", out="cards/ayaka-desk.webp",
         box=(117, 10, 1047, 1182),          # 透明底那张：按内容包围盒取，再补一层**竖向渐变**当底
         flat=(244, 241, 249), flat2=(220, 214, 234),
         note="官方春季立绘：书桌 / 台灯 / 便签板"),
]


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


def auto_box(im, pad=1.2):
    """按**内容包围盒**自动取 5:7 的窗：给「人很小、四周大片底色」那种画用（kimono 那张）。

    两个判据都是量出来的，不是拍脑袋：
      · 阈值取 45（不是 12）：白底画稿上还有浅色花瓣与柔和渐变，阈值太低会把它们算成内容，
        包围盒直接等于整张图（实测踩到：阈值 12 时返回 (0,0,4637,6491)，等于没裁）。
      · 坐标取 1%~99% 分位而不是 min/max：零星几片飘落的花瓣会把框撑大。
    窗宽取 max(内容宽, 内容高×5/7) × pad，以内容中心对中，最后夹回图内。"""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    diff = np.abs(rgb - rgb[0, 0]).max(axis=2)
    ys, xs = np.where(diff > 45)
    if len(xs) < 100:
        return None
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    need_w = max(x1 - x0, (y1 - y0) * CARD_W / CARD_H) * pad
    w = min(im.width, int(need_w))
    h = int(w * CARD_H / CARD_W)
    if h > im.height:                      # 高超出画布 → 反过来按高度定宽
        h = im.height
        w = int(h * CARD_W / CARD_H)
    x = int(min(max(0, cx - w / 2), im.width - w))
    y = int(min(max(0, cy - h / 2), im.height - h))
    return (x, y, x + w, y + h)


def flat_backdrop(size, top, bottom):
    """竖向渐变底：给透明素材当卡面底用。纯色看着像贴纸，渐变才像卡片自己的底。"""
    h, w = size[1], size[0]
    ramp = np.linspace(0, 1, h)[:, None]
    arr = (np.asarray(top, np.float32)[None, None, :] * (1 - ramp[:, :, None])
           + np.asarray(bottom, np.float32)[None, None, :] * ramp[:, :, None])
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8), "RGB")


def build_cards():
    os.makedirs(os.path.join(IMAGES, "cards"), exist_ok=True)
    faces = []
    for c in CARDS:
        im = Image.open(os.path.join(BG, c["src"]))
        # **注意：有 alpha 通道 ≠ 真的透明**。例如 source-ayaka-kimono.png 的 mode 是 RGBA 但实测
        # min(alpha)=255（全不透明），只看 mode 的话会给它铺一层多余的底色。按实测的最小 alpha 判。
        transparent = im.mode in ("RGBA", "LA") and np.asarray(im.convert("RGBA").getchannel("A")).min() < 250
        box = auto_box(im, c["pad"]) if c.get("auto") else c["box"]
        print(f"[卡片] {c['out']:26s} 取景框 {box}")
        crop = im.crop(box)
        ratio = crop.height / crop.width
        target = CARD_H / CARD_W
        # 裁切框的宽高比与 5:7 有微小出入时（手量的框），按目标比例再收一点，避免拉伸变形
        if abs(ratio - target) > 0.01:
            if ratio < target:                     # 太宽 → 收两边
                w = int(crop.height / target)
                x = (crop.width - w) // 2
                crop = crop.crop((x, 0, x + w, crop.height))
            else:                                  # 太高 → 收上下
                h = int(crop.width * target)
                y = (crop.height - h) // 2
                crop = crop.crop((0, y, crop.width, y + h))
        if transparent:                            # 真透明那张：铺一层渐变底，否则卡面透光
            flat = tuple(c.get("flat") or (244, 241, 249))
            flat2 = tuple(c.get("flat2") or (220, 214, 234))
            bg = flat_backdrop(crop.size, flat, flat2)
            crop = Image.composite(crop.convert("RGB"), bg, crop.convert("RGBA").getchannel("A"))
        else:
            crop = crop.convert("RGB")
        out = crop.resize((CARD_W, CARD_H), Image.LANCZOS)
        dest = os.path.join(IMAGES, c["out"])
        out.save(dest, "WEBP", quality=CARD_QUALITY, method=6)
        print(f"[卡片] {c['out']:26s} {out.size[0]}x{out.size[1]}  {os.path.getsize(dest) // 1024} KB  ← {c['note']}")
        faces.append((out, c["out"].split("/")[-1]))
    # 四张卡面拼一张接触表（2×2，带标签），方便一眼看全部
    pad, label = 10, 22
    sheet = Image.new("RGB", (CARD_W * 2 + pad * 3, (CARD_H + label) * 2 + pad * 3), (38, 38, 44))
    d = ImageDraw.Draw(sheet)
    for i, (im, name) in enumerate(faces):
        x = pad + (i % 2) * (CARD_W + pad)
        y = pad + (i // 2) * (CARD_H + label + pad)
        d.text((x, y), name, fill=(230, 230, 235))
        sheet.paste(im, (x, y + label))
    sheet.save(os.path.join(LAB, "ayaka_cards_check.png"))
    print("[卡片] 四张卡面的接触表", os.path.join(LAB, "ayaka_cards_check.png"))


if __name__ == "__main__":
    os.makedirs(LAB, exist_ok=True)
    build_figure()
    build_cards()
    print("→ 首页显示哪一样：hugo.toml 的 [params.home].chara（①立绘）与 .cards（②卡片组），留空即不显示")
