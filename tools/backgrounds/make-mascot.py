#!/usr/bin/env python3
# 看板娘素材：从 tools/icons/source-ojou-chibi.png 抠出少女（白底 → 透明），写 assets/images/mascot.webp
# 用法：C:/Users/15350/miniconda3/envs/ml/python.exe tools/backgrounds/make-mascot.py（需要 cv2）
#
# 白底图不能只按亮度删：她的水手服领子也是白的，会一起被吃掉。
# 所以用「与画布边缘连通的白色区域」作为背景（flood fill 语义）——**必须排除 label 0**：
# connectedComponents 把「非前景（非白）」的像素都标成 label 0，而图像最外圈只要有一个
# 非白像素，0 就会被算进「边界标签」，于是整个暗色人物被判成背景、alpha 全 0。
# 踩过一次：预览里只剩脸和领子几个白块。
import os
import numpy as np
import cv2
from PIL import Image

ROOT = r"D:\blog\my-blog"
SRC = os.path.join(ROOT, "tools", "icons", "source-ojou-chibi.png")
DEST = os.path.join(ROOT, "assets", "images", "mascot.webp")

im = cv2.imread(SRC)
h, w = im.shape[:2]
im = im[:, : int(w * 0.74)]                      # 裁掉右上角的线稿草图
h, w = im.shape[:2]
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
near_white = (gray > 238).astype("uint8")

n, lab, stats, _ = cv2.connectedComponentsWithStats(near_white, 8)
edge_ids = (set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) |
            set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())) - {0}   # ← 关键
bg = np.isin(lab, sorted(edge_ids)).astype("uint8") * 255
bg = cv2.morphologyEx(bg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), iterations=2)
alpha = 255 - bg
alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
print("透明像素占比", float((alpha < 10).mean()))

img = Image.fromarray(np.dstack([cv2.cvtColor(im, cv2.COLOR_BGR2RGB), alpha]), "RGBA")
img = img.crop(img.getchannel("A").getbbox())
print("cropped", img.size)
small = img.copy()
small.thumbnail((720, 720), Image.LANCZOS)
small.save(DEST, "WEBP", quality=86, method=6)
print("mascot.webp", small.size, os.path.getsize(DEST) // 1024, "KB")

prev = Image.alpha_composite(Image.new("RGBA", small.size, (255, 0, 128, 255)), small).convert("RGB")
prev.save(os.path.join(os.path.dirname(DEST), "..", "..", ".shots", "mascot_check.png"))
print("check saved", prev.size)
