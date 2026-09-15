#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""生成列表卡片用的封面图（assets/images/covers/*.webp）。

为什么要有这个脚本：封面是**生成产物**（渐变 + 网格底纹 + 标题字），
手改一张就没人知道它从哪来、配色是不是还和站点一致。这里把封面定义成可复现的输入：
改标题、改配色只改本文件的 TITLES / PALETTES。

用法：
  python tools/covers/make-covers.py            # 写 assets/images/covers/
  python tools/covers/make-covers.py --preview  # 生成到 .shots 供挑选，不写仓库

设计约定：
  - 尺寸 1200x600（2:1，卡片里不会太高）；站点正文最宽 44rem，2:1 在两种主题下都不喧宾夺主。
  - 配色与站点令牌同源：底色取 00-theme.css 的 --theme/--code-block-bg 一系（深蓝黑），
    强调色一个用 --accent（#5b6ee0），一个用酒红（与站点图标底板同色系）。
  - 中文用 Windows 自带的微软雅黑；找不到字体时退回 PIL 默认字（会难看，所以先报错提示）。
"""

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "assets" / "images" / "covers"

W, H = 1200, 600

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",   # 微软雅黑 Bold
    r"C:\Windows\Fonts\msyh.ttc",     # 微软雅黑
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
]

COVERS = {
    "numerical-analysis": {
        "label": "课程 · COURSE",
        "title": "数值分析",
        "subtitle": "误差 · 收敛 · 稳定性",
        "bg": ((16, 19, 31), (37, 48, 90)),
        "accent": (91, 110, 224),
    },
    "my-blog": {
        "label": "项目 · PROJECT",
        "title": "本博客",
        "subtitle": "Hugo + PaperMod 的工程记录",
        "bg": ((14, 20, 26), (26, 52, 66)),
        "accent": (91, 110, 224),
    },
    "cmc2026": {
        "label": "项目 · PROJECT",
        "title": "CMC2026",
        "subtitle": "数学建模：选题分析与建模思路",
        "bg": ((18, 14, 22), (74, 20, 34)),
        "accent": (150, 30, 48),
    },
}


def font(size, bold=True):
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    raise SystemExit("找不到中文字体（试过：" + "、".join(FONT_CANDIDATES) + "）")


def gradient(size, top, bottom):
    im = Image.new("RGB", (1, size[1]))
    px = im.load()
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return im.resize(size, Image.BILINEAR)


def build(spec):
    im = gradient((W, H), spec["bg"][0], spec["bg"][1])
    d = ImageDraw.Draw(im, "RGBA")

    # 底纹：细网格 + 右上角同心弧，作用是让纯色渐变不至于像色卡
    for x in range(0, W, 40):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 10), width=1)
    for y in range(0, H, 40):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 10), width=1)
    for r in (180, 260, 340):
        d.ellipse([W - 160 - r, -r + 60, W - 160 + r, r + 60], outline=(255, 255, 255, 16), width=2)

    # 左侧强调色竖条 + 顶部标签
    d.rectangle([72, 150, 78, 450], fill=spec["accent"] + (255,))
    d.text((104, 150), spec["label"], font=font(26, bold=False), fill=(255, 255, 255, 190))
    d.text((104, 214), spec["title"], font=font(96), fill=(255, 255, 255, 255))
    d.text((110, 356), spec["subtitle"], font=font(34, bold=False), fill=(255, 255, 255, 205))
    return im


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--preview", metavar="DIR", help="写到指定目录，不动仓库")
    a = ap.parse_args()

    out = Path(a.preview) if a.preview else OUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    for name, spec in COVERS.items():
        path = out / f"{name}.webp"
        build(spec).save(path, format="WEBP", quality=88, method=6)
        print(f"wrote {path} ({path.stat().st_size // 1024} KB)")
    if not a.preview:
        print("提示：front matter 里写 cover.image = 'images/covers/<name>.webp' 即可生效")
    return 0


if __name__ == "__main__":
    sys.exit(main())
