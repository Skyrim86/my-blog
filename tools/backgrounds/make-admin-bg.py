#!/usr/bin/env python3
# 管理页背景：把绫华壁纸处理成深浅两版。
#
#   tools/backgrounds/source-ayaka.jpg  →  tools/admin/ui/ayaka-night.webp（深色主题，原色调夜景）
#                                        tools/admin/ui/ayaka-snow.webp （浅色主题，霜白剪影）
#
# 为什么要处理成两版：直接把原图压在浅色蒙版下会变成一块灰——青绿冰晶遇上白蒙版就是脏。
# 浅色版是刻意做出来的「霜白」：先提亮、重度去饱和，再叠一层左上偏重的霜白渐变，
# 最后轻度模糊，人物只剩剪影，霜雪感反而比原图更像「神里」。深色版只做轻微降饱和/压暗。
#
# 用法：python tools/backgrounds/make-admin-bg.py [--fetch]
#   --fetch 用 --proxy 指定的代理重新下载源图（本机代理是 iKuuuVPN 的 127.0.0.1:7891，
#   VPN 没开时不通）。源图 1920×1080 的 JPEG 约 1 MB，**入库**——不存源图这两张就不可复现。
# 出处：Wallhaven `wallhaven.cc/w/6o2wkq`（神里绫华，画师作品，仅本地工具使用，不进站点构建）。
import os
import sys
import urllib.request

from PIL import Image, ImageEnhance, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "backgrounds", "source-ayaka.jpg")
OUT = os.path.join(ROOT, "tools", "admin", "ui")
SRC_URL = "https://w.wallhaven.cc/full/6o/wallhaven-6o2wkq.jpg"


def fetch(proxy="http://127.0.0.1:7891"):
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    opener.addheaders = [("User-Agent", "Mozilla/5.0")]
    with opener.open(SRC_URL, timeout=180) as r:
        open(SRC, "wb").write(r.read())
    print("fetched", SRC, os.path.getsize(SRC) // 1024, "KB")


def snow_wash(size):
    """霜白渐变遮罩：左上最白（面板常压在那里），右下留一点冰晶轮廓。"""
    wash = Image.new("L", size, 0)
    px = wash.load()
    w, h = size
    for y in range(h):
        for x in range(0, w, 4):
            v = int(62 + 86 * (1 - (x / w)) * (1 - (y / h)))
            for dx in range(4):
                if x + dx < w:
                    px[x + dx, y] = min(178, v)
    return wash


def main():
    if "--fetch" in sys.argv or not os.path.exists(SRC):
        fetch()
    im = Image.open(SRC).convert("RGB")
    print("src", im.size)

    # 深色主题：保留冰蓝，压一点亮度、轻微降饱和
    night = im.resize((1920, 1080), Image.LANCZOS)
    night = night.filter(ImageFilter.GaussianBlur(0.8))
    night = ImageEnhance.Color(night).enhance(0.88)
    night = ImageEnhance.Brightness(night).enhance(0.92)
    night.save(os.path.join(OUT, "ayaka-night.webp"), "WEBP", quality=74, method=6)

    # 浅色主题：霜白
    snow = im.resize((1920, 1080), Image.LANCZOS)
    snow = ImageEnhance.Color(snow).enhance(0.42)
    snow = ImageEnhance.Brightness(snow).enhance(1.16)
    snow = ImageEnhance.Contrast(snow).enhance(0.88)
    snow = Image.composite(Image.new("RGB", snow.size, (246, 251, 255)), snow, snow_wash(snow.size))
    snow = snow.filter(ImageFilter.GaussianBlur(1.6))
    snow.save(os.path.join(OUT, "ayaka-snow.webp"), "WEBP", quality=74, method=6)

    for n in ("ayaka-night.webp", "ayaka-snow.webp"):
        p = os.path.join(OUT, n)
        print(n, os.path.getsize(p) // 1024, "KB")


if __name__ == "__main__":
    main()
