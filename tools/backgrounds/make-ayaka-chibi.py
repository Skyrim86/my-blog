#!/usr/bin/env python3
# 首页立绘素材：从 tools/icons/source-ayaka-chibi.png 抠出绫华（白底 → 透明），
# 写 assets/images/ayaka-chibi.webp。用法（与 make-mascot.py 同一个解释器，需要 cv2）：
#   C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-ayaka-chibi.py
#
# 与 make-mascot.py（右下角看板娘）是同一类活，但**抠法刻意不同**，因为两张画的画法不同：
#
# 1. **必须用「从画布边缘灌水」，不能用全局色阈值**。看板娘那位的判据是「背景纯白 255、
#    水手服领子 ≤248」，直接按色差切、不要求连通 —— 那条之所以成立，是因为她身上没有纯白。
#    绫华有：**她的袜子实测 (255,255,255)，差 0**。全局阈值会把袜子整个打穿。而袜子被鞋与
#    轮廓围着、与画布边缘不连通，于是「只删与边缘连通的近白区域」正好放过它。
#
# 2. **容差取多少是量出来的，不是猜的**（实测这张图，差 = 255 - min(R,G,B)）：
#      背景与它周围的过渡带   差 0~32（占全图 ~7%）
#      最淡的头发（高光处）   差 33（(222,233,253)）
#      脸 / 雪花 / 袖子       差 41 / 89 / 140
#    所以容差取 20：吃掉白底与它的大部分过渡带，停在 33 之前。**容差不能再往 33 上面调**，
#    那会开始啃她的头发高光。换素材前先重量一遍这张表再改。
#
# 3. **不能按「暗 = 半透明」去反解 alpha**（看板娘那条 `alpha=(255-灰度)/(255-INK)` 在这里是错的）：
#    那位的轮廓是「墨线压在白上」，暗 = 覆盖度高；绫华是**厚涂的淡色**，没有墨线，
#    淡色就是她的本色，套那条公式会把整片淡色头发算成 11% 不透明。这里的做法是：
#    灌水后把前景 mask **向内收 1px**（cv2.erode）—— 被收掉的正是最白的那一圈混合像素
#    （它们本来离白最近）。1000px 的源图上少这 1px，缩到出图尺寸只剩半个像素，肉眼看不出来，
#    但白边没了。收完把 alpha 用 1px 高斯轻糊一下，边缘就不会有硬齿。
#
# 4. **缩放仍要在预乘 alpha 下做**（同 make-mascot.py 第 3 条）：否则透明的白会被平均进轮廓。
#
# 改完**必须看预览图**（写在仓库外的 ../lab/shots/ayaka_check.png，深底 / 浅底各一张）：
# 这张图的成败只能看图定 —— 头发有没有被啃、袜子还在不在、雪花的边缘干不干净。
import os
import sys

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:
    sys.exit("✗ 需要 cv2：C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-ayaka-chibi.py")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "icons", "source-ayaka-chibi.png")
DEST = os.path.join(ROOT, "assets", "images", "ayaka-chibi.webp")
PREVIEW = os.path.join(ROOT, os.pardir, "lab", "shots", "ayaka_check.png")

TOL = 20        # 灌水容差（差 = 255-min(RGB)）；见文件头第 2 条，别超过 33
ERODE = 1       # 前景向内收多少像素（收掉最白的混合边）
FEATHER = 1.0   # 收完之后 alpha 的高斯半径（只为了让边缘不硬）
PAD = 6         # 按 alpha 包围盒裁切时四周留的余量（留一点呼吸，雪花别贴边）
OUT_W = 480     # 出图宽度。**刻意比「显示宽度的 2 倍」（400）再宽一档**：模板按 2x 请求 400 宽，
#                 出图若正好 400，Hugo 的 Resize 会把它**放大**（实测 359→400，多花字节还发虚）；
#                 留出余量后两个档位（1x 200 / 2x 400）都是下采样。这张源资产不进产物（模板只引用
#                 Hugo 重编过的那两份），所以这里宽一点不影响访客流量。
QUALITY = 82    # 与看板娘（make-mascot.py）同一个档位

cv2.setNumThreads(0)

im = cv2.imread(SRC)
if im is None:
    sys.exit(f"✗ 读不到源图：{SRC}")
h, w = im.shape[:2]
print(f"源图 {w}x{h}")

# ---- 1. 从四边灌水，标记与画布边缘连通的近白背景 ----
ff = im.copy()
mask = np.zeros((h + 2, w + 2), np.uint8)
flags = 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8)
seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
for sx, sy in seeds:
    if ff[sy, sx].min() < 255 - TOL:
        print(f"✗ 角点 ({sx},{sy}) 不是白底（{ff[sy, sx]}），换个容差或换素材")
        sys.exit(1)
    cv2.floodFill(ff, mask, (sx, sy), 0, (TOL,) * 3, (TOL,) * 3, flags)
bg = mask[1:-1, 1:-1] > 0
print(f"灌水吃掉背景 {bg.mean() * 100:.1f}%")

# ---- 2. 前景 mask 向内收 ERORE 像素，再把 alpha 轻糊一次 ----
fg = (~bg).astype(np.uint8)
if ERODE > 0:
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (ERODE * 2 + 1,) * 2)
    fg = cv2.erode(fg, k)
alpha = fg.astype(np.float32) * 255.0
if FEATHER > 0:
    alpha = cv2.GaussianBlur(alpha, (0, 0), FEATHER)
print(f"前景占比 {fg.mean() * 100:.1f}%（收 {ERODE}px 之后）")

# ---- 3. 预乘 alpha 缩放 + 按包围盒裁切 ----
rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32)


def premul_resize(arr_rgb, arr_a, size):
    """预乘 alpha 的缩放：不这么做，透明的白会被平均进轮廓，白圈换个环节又回来。"""
    an = (arr_a / 255.0)[..., None]
    pre = np.concatenate([arr_rgb * an, arr_a[..., None]], axis=2).astype(np.uint8)
    pa = np.asarray(Image.fromarray(pre, "RGBA").resize(size, Image.LANCZOS)).astype(np.float32)
    an2 = pa[..., 3:4] / 255.0
    return Image.fromarray(
        np.dstack([np.clip(pa[..., :3] / np.maximum(an2, 1e-6), 0, 255), pa[..., 3:4]]).astype(np.uint8),
        "RGBA",
    )


out_w = OUT_W
out_h = max(1, round(h * out_w / w))
out = premul_resize(rgb, alpha, (out_w, out_h))

bbox = out.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
if bbox:
    x0, y0, x1, y1 = bbox
    bbox = (max(0, x0 - PAD), max(0, y0 - PAD), min(out.width, x1 + PAD), min(out.height, y1 + PAD))
    out = out.crop(bbox)
out.save(DEST, "WEBP", quality=QUALITY, method=6)
print(f"ayaka-chibi.webp {out.size[0]}x{out.size[1]}  {os.path.getsize(DEST) // 1024} KB")
print(f"→ 显示尺寸按 hugo.toml 的 charaWidth 给；这张是它的 2 倍（改显示宽度要同步改 OUT_W={OUT_W}）")

# ---- 4. 预览：深底 / 浅底各一张，交给眼睛 ----
os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
tiles = []
for color in ((20, 19, 26, 255), (247, 245, 248, 255)):
    bgim = Image.new("RGBA", out.size, color)
    tiles.append(Image.alpha_composite(bgim, out).convert("RGB"))
sheet = Image.new("RGB", (tiles[0].width * 2 + 12, tiles[0].height), (90, 90, 90))
sheet.paste(tiles[0], (0, 0))
sheet.paste(tiles[1], (tiles[0].width + 12, 0))
sheet.save(PREVIEW)
print("预览（深色 / 浅色）", PREVIEW)
