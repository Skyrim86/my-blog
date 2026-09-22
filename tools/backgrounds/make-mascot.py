#!/usr/bin/env python3
# 看板娘素材：从 tools/icons/source-ojou-chibi.png 抠出少女（白底 → 透明），写 assets/images/mascot.webp
# 用法：C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-mascot.py（需要 cv2）
#
# 白底图的三个坑，按踩到的顺序：
#
# 1. **不能只按亮度删**：她的水手服领子也是白的（实测领子最亮处 240~248，背景是纯 255）。
#    原先用「与画布边缘连通的白色区域」当背景（flood fill 语义）绕开了领子，但那只能删**连通到画面外**
#    的白 —— 头发之间、脖子与马尾之间还夹着好几块纯白背景（最大一块 8.2 万像素），它们四面被人物围住，
#    于是留在图上成了白斑。现在直接按「背景是纯白 255、领子 ≤248」这条**色差**切：阈值取 250，
#    不要求连通。判据是量过的（238~250 之间只占全图 0.1%），换素材前先重新量一遍再改 250。
#
# 2. **只能删背景，不能只把背景变透明**：白底画稿的轮廓是「墨线压在白上」，抗锯齿那一圈像素本身就是
#    「墨 + 白」的混合，RGB 里带着白。直接把这些像素设成半透明，等于在深色背景上画一圈白光晕 ——
#    这就是之前那片白边。做法是**去污染**：在边缘带内按覆盖度反解 C = a·F + (1-a)·白，
#    得回 F（真正的墨色），a 则由像素自身的灰度算（覆盖度 = (255-灰度)/(255-墨色)）。
#    领子不在这条边缘带里（它被墨线围着），所以不会被算成半透明。
#
# 3. **缩放要在预乘 alpha 下做**：PIL 的 resize 直接把 RGBA 各自平均，边界上「透明的白」会被平均进
#    轮廓色，出图再压一次也还是白圈。所以先乘 alpha 再缩、缩完除回来。
#
# 改完回到页面上截图核对（深色主题 + 浅色主题各看一遍）：预览图写在仓库外的 ../lab/结果/mascot_check.png。
import os
import sys

import numpy as np
from PIL import Image

try:
    import cv2
except ImportError:
    sys.exit("✗ 需要 cv2：C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-mascot.py")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "tools", "icons", "source-ojou-chibi.png")
DEST = os.path.join(ROOT, "assets", "images", "mascot.webp")
PREVIEW = os.path.join(ROOT, os.pardir, "lab", "shots", "mascot_check.png")

CROP_X = 0.74      # 源图右侧是线稿草图，裁掉
T_BG = 250.0       # 亮于此值 = 背景（领子实测 ≤248）
INK = 40.0         # 反解覆盖度用的「最深的墨」，取 40 略保守：边缘只会更软一点
EDGE = 4           # 边缘带宽度（像素）：只有离背景 4px 以内的像素才按覆盖度算 alpha
MIN_HOLE = 32      # 小于此面积的「洞」当噪点填掉（人物内部的 1~5px 纯白杂点）
OUT_H = 720        # 出图高度；模板 extend_footer.html 里的 width/height 要跟着改

cv2.setNumThreads(0)

im = cv2.imread(SRC)
if im is None:
    sys.exit(f"✗ 读不到源图：{SRC}")
im = im[:, : int(im.shape[1] * CROP_X)]
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
rgb = cv2.cvtColor(im, cv2.COLOR_BGR2RGB).astype(np.float32)

# ---- 1. 背景 = 纯白（不要求连通，围在人物里的白块也要删）----
fg = (gray <= T_BG).astype(np.uint8)
print(f"背景占比 {1 - fg.mean():.3f}")

# 填掉人物内部极小的白点（阈值噪声），否则领子上会留一个透光的针眼
inv = (1 - fg).astype(np.uint8)
n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, 8)
border = (set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) |
          set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())) - {0}
filled = 0
for i in range(1, n):
    if i not in border and stats[i, 4] < MIN_HOLE:
        fg[lab == i] = 1
        filled += 1
print(f"填掉内部小白点 {filled} 处")

# ---- 2. 边缘带：按覆盖度算软 alpha，并把混进去的白反解出去 ----
dist = cv2.distanceTransform(fg, cv2.DIST_L2, 5)
edge = (dist <= EDGE) & (gray > 90)          # 只处理「离背景近、且本身够亮」的混合像素
alpha = fg.astype(np.float32)
alpha[edge] = np.clip((255.0 - gray[edge]) / (255.0 - INK), 0.0, 1.0)
print(f"轮廓软边 {((dist > 0) & (dist <= EDGE) & (gray > 90)).mean() * 100:.2f}%")

a = alpha[..., None]
decon = np.where(a > 0.004, (rgb - (1.0 - a) * 255.0) / np.maximum(a, 1e-6), rgb)
rgba = Image.fromarray(
    np.dstack([np.clip(decon, 0, 255), alpha * 255.0]).astype(np.uint8), "RGBA"
)
rgba = rgba.crop(rgba.getchannel("A").point(lambda v: 255 if v > 10 else 0).getbbox())


def premul_resize(image, size):
    """预乘 alpha 的下采样：不这么做，透明的白会被平均进轮廓，白圈换个环节又回来。"""
    arr = np.asarray(image).astype(np.float32)
    an = arr[..., 3:4] / 255.0
    pre = np.dstack([arr[..., :3] * an, arr[..., 3]]).astype(np.uint8)
    pa = np.asarray(Image.fromarray(pre, "RGBA").resize(size, Image.LANCZOS)).astype(np.float32)
    an2 = pa[..., 3:4] / 255.0
    return Image.fromarray(
        np.dstack([np.clip(pa[..., :3] / np.maximum(an2, 1e-6), 0, 255), pa[..., 3:4]]).astype(np.uint8),
        "RGBA",
    )


out = premul_resize(rgba, (round(rgba.width * OUT_H / rgba.height), OUT_H))
out.save(DEST, "WEBP", quality=82, method=6)
print(f"mascot.webp {out.size[0]}x{out.size[1]}  {os.path.getsize(DEST) // 1024} KB")

os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
tiles = []
for color in ((20, 19, 26, 255), (247, 245, 248, 255)):
    bg = Image.new("RGBA", out.size, color)
    tiles.append(Image.alpha_composite(bg, out).convert("RGB"))
sheet = Image.new("RGB", (tiles[0].width * 2 + 12, tiles[0].height), (90, 90, 90))
sheet.paste(tiles[0], (0, 0))
sheet.paste(tiles[1], (tiles[0].width + 12, 0))
sheet.save(PREVIEW)
print("预览（深色 / 浅色）", PREVIEW)
