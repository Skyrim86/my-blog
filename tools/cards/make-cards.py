#!/usr/bin/env python3
# 首页卡片组的卡面生成器：读 data/home-cards.yaml（清单，含源图与取景），出 assets/images/cards/*.webp。
# 用法（与 make-mascot.py 同一个解释器）：C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/make-cards.py
#
# **清单是单一事实源**：模板（layouts/_partials/home-cards.html）读的是同一个 YAML 里的
# image / series / name / style，所以改卡片（换图、改风格、加一张）只改那个文件再跑一遍这里。
#
# 卡面统一 5:7（集换卡比例）。四类处理，都在清单里由字段选：
#   · crop: auto        按**内容包围盒**自动取景（白底/素底的插画都适用）。两个判据是量出来的：
#                       阈值 45（低到 12 会把浅色花瓣与柔和渐变算成内容，包围盒直接等于整张图）、
#                       坐标取 1%~99% 分位（min/max 会被零星花瓣撑大）。
#   · crop: [x0,y0,x1,y1] 分数窗，给构图满、没法定「内容」的画手写。
#   · flat: [[上],[下]] 给**透明源图**垫一层竖向渐变（纯色看着像贴纸、渐变才像卡片自己的底）。
#                       垫底前按**实测最小 alpha** 判断是否真透明 —— 有的 PNG 有 alpha 通道但全 255。
#   · pixel: true       源图是 32×32 的像素小人：最近邻放大（双线性会糊成一团），
#                       并画一层棋盘网点底 + 一道内描边，做成「像素卡」。
#
# 出图 480×672（首页卡面显示约 240 宽，即 2 倍），WebP q82；顺手把 29 张拼一张接触表写到
# ../lab/shots/cards_check.png —— 取景对不对只能看图定。
import os
import sys

import numpy as np
import yaml
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MANIFEST = os.path.join(ROOT, "data", "home-cards.yaml")
LAB = os.path.join(ROOT, os.pardir, "lab", "shots", "cards_check.png")
CARD_W, CARD_H = 480, 672
QUALITY = 82
AUTO_T = 45          # 内容判据：与四角底色差异大于它才算「内容」
AUTO_PAD = 1.06      # 自动窗的余量（给大会被夹成整张图，见 make-ayaka-home.py 的注释）


def load():
    with open(MANIFEST, encoding="utf-8") as f:
        return yaml.safe_load(f)


def auto_box(im, pad=AUTO_PAD):
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    diff = np.abs(rgb - rgb[0, 0]).max(axis=2)
    ys, xs = np.where(diff > AUTO_T)
    if len(xs) < 80:
        return None
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    need_w = max(x1 - x0, (y1 - y0) * CARD_W / CARD_H) * pad
    w = min(im.width, int(need_w))
    h = int(w * CARD_H / CARD_W)
    if h > im.height:
        h, w = im.height, int(im.height * CARD_W / CARD_H)
    x = int(min(max(0, cx - w / 2), im.width - w))
    y = int(min(max(0, cy - h / 2), im.height - h))
    return (x, y, x + w, y + h)


def figure_box(im, pad=1.16):
    """**人像完整**的取景（2026-09-19 换成默认）：先量出内容包围盒，再把窗口放到「刚好装下它」
    的 5:7 —— 目的是**不许切人**（旧口径是填满卡面，结果经常只剩半张脸或切掉腿）。
    pad 给一点呼吸；窗口超出画布时返回 None，交给调用方用源图自己的底色补边（见 flat_from_corners）。"""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    diff = np.abs(rgb - rgb[0, 0]).max(axis=2)
    ys, xs = np.where(diff > AUTO_T)
    if len(xs) < 80:
        return None
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    cw, ch = x1 - x0, y1 - y0
    need_w = max(cw, ch * CARD_W / CARD_H) * pad
    need_h = need_w * CARD_H / CARD_W
    if need_w > im.width or need_h > im.height:
        return None
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x = int(min(max(0, cx - need_w / 2), im.width - need_w))
    y = int(min(max(0, cy - need_h / 2), im.height - need_h))
    return (x, y, int(x + need_w), int(y + need_h))


def corners_flat(im):
    """源图四角取色当垫底色：整幅收进卡面时四周露出来的那圈，用它自己的底色比自造渐变自然。

    **必须按 alpha 挑像素**：透明 PNG（官方立绘、看板娘）的四角是全透明的，转成 RGB 之后是**黑的** ——
    不挑 alpha 就会把一个浅色底的画面垫成黑底（实测踩到，书桌那张整个变黑）。全透明就退回中性浅灰。"""
    rgba = np.asarray(im.convert("RGBA")).astype(np.int16)
    h, w = rgba.shape[:2]
    k = max(2, min(h, w) // 40)
    bands = [rgba[:k, :], rgba[-k:, :]]                       # 上带 / 下带
    out = []
    for band in bands:
        opaque = band[band[..., 3] > 200]
        if len(opaque) < 10:
            out.append([236, 233, 242] if not out else [214, 209, 226])
        else:
            out.append(opaque[:, :3].mean(axis=0).round().astype(int).tolist())
    return out


def fit_ratio(im):
    """把裁好的窗收成 5:7（手量的分数窗难免差一点），居中收，不拉伸。"""
    target = CARD_H / CARD_W
    r = im.height / im.width
    if abs(r - target) < 0.01:
        return im
    if r < target:
        w = int(im.height / target)
        x = (im.width - w) // 2
        return im.crop((x, 0, x + w, im.height))
    h = int(im.width * target)
    y = (im.height - h) // 2
    return im.crop((0, y, im.width, y + h))


def gradient(size, top, bottom):
    w, h = size
    ramp = np.linspace(0, 1, h)[:, None]
    arr = (np.asarray(top, np.float32)[None, None, :] * (1 - ramp[:, :, None])
           + np.asarray(bottom, np.float32)[None, None, :] * ramp[:, :, None])
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8), "RGB")


def build_pixel(im):
    """像素小人 → 像素卡：最近邻放大到卡面的一半宽，坐在一张棋盘网点底上。"""
    scale = max(1, (CARD_W // 2) // max(im.width, im.height))
    big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    board = Image.new("RGB", (CARD_W, CARD_H), (26, 24, 33))
    d = ImageDraw.Draw(board)
    step = 12                                    # 棋盘网点：像素画的底纹
    for yy in range(0, CARD_H, step):
        for xx in range(0, CARD_W, step):
            if (xx // step + yy // step) % 2 == 0:
                d.rectangle([xx, yy, xx + step - 1, yy + step - 1], fill=(32, 30, 41))
    board.paste(big, ((CARD_W - big.width) // 2, (CARD_H - big.height) // 2),
                big if big.mode == "RGBA" else None)
    return board


def main():
    cards = load()
    out_dir = os.path.join(ROOT, "assets", "images", "cards")
    os.makedirs(out_dir, exist_ok=True)
    faces, total = [], 0
    for c in cards:
        src = os.path.join(ROOT, c["src"])
        if not os.path.exists(src):
            print(f"✗ 源图不在：{c['src']}（{c['image']}）")
            continue
        im = Image.open(src)
        if c.get("pixel"):
            face = build_pixel(im.convert("RGBA"))
        else:
            transparent = (im.mode in ("RGBA", "LA")
                           and np.asarray(im.convert("RGBA").getchannel("A")).min() < 250)
            if c.get("crop") == "figure" and not c.get("pixel"):
                fb = figure_box(im, c.get("pad", 1.16))
                if fb:
                    box = fb
                    crop = im.crop(box).convert("RGB").resize((CARD_W, CARD_H), Image.LANCZOS)
                    dest = os.path.join(ROOT, "assets", c["image"])
                    crop.save(dest, "WEBP", quality=QUALITY, method=6)
                    kb = os.path.getsize(dest) // 1024
                    total += kb
                    faces.append((crop, f"{os.path.basename(c['image'])}  {c.get('name') or c['series']}  [{c['style']}]"))
                    print(f"  {c['image']:26s} {crop.size[0]}x{crop.size[1]}  {kb:3d} KB  {c['style']:7s} "
                          f"{c.get('name') or c['series']}  (figure, 原图裁切)")
                    continue
                flat = c.get("flat") or corners_flat(im)
                inner = im.convert("RGBA")
                r = min(CARD_W / inner.width, CARD_H / inner.height)
                inner = inner.resize((max(1, int(inner.width * r)), max(1, int(inner.height * r))), Image.LANCZOS)
                # **必须拿 alpha 当遮罩贴**：直接把 RGBA 转 RGB 会把透明区变成黑（官方立绘、看板娘
                # 这两张透明源图实测被垫成黑底），而这里要的是「画面本身 + 我给的底色/四角底色」。
                inner_rgb = Image.new("RGB", inner.size, tuple(flat[0]))
                inner_rgb = Image.composite(inner.convert("RGB"), inner_rgb, inner.getchannel("A"))
                bg = gradient((CARD_W, CARD_H), tuple(flat[0]), tuple(flat[1]))
                bg.paste(inner_rgb, ((CARD_W - inner_rgb.width) // 2, (CARD_H - inner_rgb.height) // 2))
                dest = os.path.join(ROOT, "assets", c["image"])
                bg.save(dest, "WEBP", quality=QUALITY, method=6)
                kb = os.path.getsize(dest) // 1024
                total += kb
                faces.append((bg, f"{os.path.basename(c['image'])}  {c.get('name') or c['series']}  [{c['style']}]"))
                print(f"  {c['image']:26s} {bg.size[0]}x{bg.size[1]}  {kb:3d} KB  {c['style']:7s} "
                      f"{c.get('name') or c['series']}  (figure, 整幅+底色)")
                continue
            box = auto_box(im) if c.get("crop") == "auto" else (
                tuple(int(round(v * s)) for v, s in zip(c["crop"], (im.width, im.height, im.width, im.height)))
                if isinstance(c.get("crop"), list) else None)
            if box is None:
                box = (0, 0, im.width, im.height)
            if c.get("crop") == "figure" or c.get("fit") in ("contain", "figure"):
                # 整幅收进卡面（横构图源图用）：缩到能放下，四周垫渐变——
                # 5:7 硬裁一张横构图的特写只会剩下眼睛与头发（踩到过）
                r = min(CARD_W / (box[2] - box[0]), CARD_H / (box[3] - box[1]))
                inner = im.crop(box).convert("RGB")
                inner = inner.resize((max(1, int(inner.width * r)), max(1, int(inner.height * r))), Image.LANCZOS)
                top, bottom = c.get("flat", [[248, 245, 250], [224, 218, 232]])
                bg = gradient((CARD_W, CARD_H), tuple(top), tuple(bottom))
                bg.paste(inner, ((CARD_W - inner.width) // 2, (CARD_H - inner.height) // 2))
                face = bg
                dest = os.path.join(ROOT, "assets", c["image"])   # image 是相对 assets/ 的路径
                face.save(dest, "WEBP", quality=QUALITY, method=6)
                kb = os.path.getsize(dest) // 1024
                total += kb
                faces.append((face, f"{os.path.basename(c['image'])}  {c.get('name') or c['series']}  [{c['style']}]"))
                print(f"  {c['image']:26s} {face.size[0]}x{face.size[1]}  {kb:3d} KB  {c['style']:6s} "
                      f"{c.get('name') or c['series']}  (contain)")
                continue
            crop = fit_ratio(im.crop(box))
            if transparent:
                top, bottom = c.get("flat", [[246, 243, 249], [222, 216, 232]])
                bg = gradient(crop.size, tuple(top), tuple(bottom))
                crop = Image.composite(crop.convert("RGB"), bg, crop.convert("RGBA").getchannel("A"))
            else:
                crop = crop.convert("RGB")
            face = crop.resize((CARD_W, CARD_H), Image.LANCZOS)
        dest = os.path.join(ROOT, "assets", c["image"])   # image 是相对 assets/ 的路径
        face.save(dest, "WEBP", quality=QUALITY, method=6)
        kb = os.path.getsize(dest) // 1024
        total += kb
        faces.append((face, f"{os.path.basename(c['image'])}  {c.get('name') or c['series']}  [{c['style']}]"))
        print(f"  {c['image']:26s} {face.size[0]}x{face.size[1]}  {kb:3d} KB  {c['style']:6s} "
              f"{c.get('name') or c['series']}")
    print(f"共 {len(faces)} 张，合计 {total} KB")

    cols = 6
    cw, ch = CARD_W // 2 + 20, CARD_H // 2 + 36
    rows = (len(faces) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * ch), (34, 34, 40))
    d = ImageDraw.Draw(sheet)
    for i, (face, label) in enumerate(faces):
        x, y = (i % cols) * cw, (i // cols) * ch
        d.text((x + 8, y + 8), label, fill=(235, 235, 240))
        sheet.paste(face.resize((CARD_W // 2, CARD_H // 2), Image.LANCZOS), (x + 10, y + 26))
    os.makedirs(os.path.dirname(LAB), exist_ok=True)
    sheet.save(LAB)
    print("接触表", LAB)


if __name__ == "__main__":
    main()
