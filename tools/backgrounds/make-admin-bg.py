#!/usr/bin/env python3
# 管理页背景：把仓库里那张绫华插画（tools/admin/ui/ayaka-bg.webp，和风庭院 + 风铃 + 樱花）
# 处理成深/浅两版。
#
# 定位：**保留原构图与人物，不虚化、不洗白**——这版是挑过认可的。
# 只做轻度冷调，让它和界面的冰蓝/霜白落在同一个色温上（原图是庭院暖光 + 青绿植物）。
# 浅色主题仍是原图 + 白蒙版（蒙版在 style.css 里），深色主题是压暗冷调版。
#
# 用法：python tools/backgrounds/make-admin-bg.py
# 源图入库（tools/admin/ui/ayaka-bg.webp，150 KB），产物同目录：
#   ayaka-day.webp   （浅色主题）
#   ayaka-night.webp （深色主题）
import os

from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "tools", "admin", "ui")
SRC = os.path.join(OUT, "ayaka-bg.webp")


def cover(im, w=1920, h=1080):
    """等比缩放到铺满，再中心裁切（原图 2560×1459 与 16:9 差 1%，不会切到人）。"""
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    left = (im.width - w) // 2
    top = (im.height - h) // 2
    return im.crop((left, top, left + w, top + h))


def cool(im, blue):
    """冷调：压一层薄蓝，比整体 hue-rotate 温和，不会把樱花粉染成紫。"""
    tint = Image.new("RGB", im.size, (140, 190, 235))
    return Image.blend(im, tint, blue)


def main():
    im = cover(Image.open(SRC).convert("RGB"))

    day = ImageEnhance.Color(im).enhance(0.86)
    day = ImageEnhance.Brightness(day).enhance(1.02)
    day = cool(day, 0.07)
    day.save(os.path.join(OUT, "ayaka-day.webp"), "WEBP", quality=76, method=6)

    night = ImageEnhance.Color(im).enhance(0.80)
    night = ImageEnhance.Brightness(night).enhance(0.70)
    night = cool(night, 0.16)
    night.save(os.path.join(OUT, "ayaka-night.webp"), "WEBP", quality=76, method=6)

    for n in ("ayaka-day.webp", "ayaka-night.webp"):
        p = os.path.join(OUT, n)
        print(n, os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    main()
