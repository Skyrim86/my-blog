#!/usr/bin/env python3
# 左侧看板娘：从 wallhaven 1jm3ew（黑白漫画风的黑发公主切少女）抠出人物
#   → assets/images/mascot-left.webp
# 背景是均匀的浅灰白，所以用「与画布边缘连通的近白区域」判背景（和 make-mascot.py 同一套）。
# 注意 connectedComponentsWithStats 的 label 0 陷阱：非前景像素都算 0，边界标签集合要减掉 0。
import os
import numpy as np
import cv2
from PIL import Image

ROOT = r"D:\blog\my-blog"
SRC = os.path.join(ROOT, "tools", "backgrounds", "source-mascot-left.jpg")
DEST = os.path.join(ROOT, "assets", "images", "mascot-left.webp")
PREVIEW = r"D:\Study\projects\blog\lab\shots\mascot_left_check.png"

im = cv2.imread(SRC)
h, w = im.shape[:2]
print("src", w, h)
gray = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY)
near_white = (gray > 232).astype("uint8")
n, lab, stats, _ = cv2.connectedComponentsWithStats(near_white, 8)
edge_ids = (set(lab[0, :].tolist()) | set(lab[-1, :].tolist()) |
            set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())) - {0}
bg = np.isin(lab, sorted(edge_ids)).astype("uint8") * 255
bg = cv2.morphologyEx(bg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8), iterations=2)
alpha = 255 - bg
# 只留最大的一块（人物），去掉零星碎片
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(alpha, 8)
if n2 > 1:
    big = 1 + int(np.argmax(st2[1:, 4]))
    alpha = np.where(lab2 == big, alpha, 0).astype("uint8")
# 原图右侧那块漫画背景黑块：纯黑，与她的黑发同色，按颜色分不开。
# 整列裁掉它（x > 0.68）——她的头在 0.15~0.65，只损失一点发梢；
# 这样得到的是「头 + 肩」的竖构图，比原来那张横图更贴近右侧看板娘的比例。
alpha[:, int(w * 0.76):] = 0

alpha = cv2.GaussianBlur(alpha, (3, 3), 0)
print("透明占比", float((alpha < 10).mean()))

img = Image.fromarray(np.dstack([cv2.cvtColor(im, cv2.COLOR_BGR2RGB), alpha]), "RGBA")
img = img.crop(img.getchannel("A").getbbox())
print("cropped", img.size)
small = img.copy(); small.thumbnail((720, 720), Image.LANCZOS)
small.save(DEST, "WEBP", quality=88, method=6)
print("mascot-left.webp", small.size, os.path.getsize(DEST) // 1024, "KB")
Image.alpha_composite(Image.new("RGBA", small.size, (0, 180, 120, 255)), small).convert("RGB").save(PREVIEW)
print("check saved")
