#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""凸印压痕（emboss）的**受力图**生成器：由深度图算「高度场梯度」得到两张灰图。

依据 docs/card-redesign-brief.md §八 第 1 条：凸印不能拿原画当掩膜（会把人洗成白模），
正确做法是由**深度图**算法线与光线的点积 —— 画面颜色完整保留，压痕沿人物自身的起伏走。

两张图、两种混合（**不是随便叠**）：
    · <卡>-lit.webp   受光图（漫反射去掉整张的中位亮度，只留相对起伏）→ soft-light：改光不改色
    · <卡>-spec.webp  脊线镜面图（漫反射的高次幂，只留脊线）→ screen：亮脊线

产物**入库**（与 assets/images/cards/*.webp、20-card-ornaments.css 同一条规矩：本地生成、
产物可逐字节复现）。只给 `style: emboss` 的那几张出图 —— 别的工艺没有「压痕」这件事，
多出图就是白占体积。样式侧由 `--bump-lit` / `--bump-spec` 接（见 deck-manifest.html）。

用法（与 tools/cards/ 那几个脚本同一个解释器）：
    /d/DevEnv/toolchains/miniconda3/envs/ml/python.exe tools/cards/make-emboss.py
"""
import os
import numpy as np
import yaml
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CARDS = os.path.join(ROOT, "assets", "images", "cards")
OUT = os.path.join(CARDS, "emboss")

SCALE = 26.0        # 高度放大：越大压痕越深（与 lab/工具/bevelmap.py 同一组常数，别单改一处）
LIGHT = np.array([-0.52, -0.60, 0.61], dtype=np.float32)   # 左上方光源
GAIN = 2.2          # 受光图的斜率增益（进 tanh 前）。定值依据是 3× 判读的两轮对照：
                    #   1.6 → 「很克制，第一眼像柔光提亮」7/10；2.2 → 「一眼读出压印」7.5/10，
                    #   且两轮都没有过曝/斑块/硬边缺陷。所以取 2.2。
                    #   （注意别拿这一条去给 np.clip 版的旧公式加大增益：那一版两端硬裁，
                    #   加大增益只会糊得更白 —— 见 bump() 的 docstring。）
SPEC_POW = 26       # 镜面高次幂：只留脊线
SPEC_GAIN = 1.6     # 脊线镜面图的强度
TARGET_W = 412      # 出图宽度：卡在墙上最宽 206 CSS px，2× 屏 412 —— 再多一像素都是白占体积
QUALITY = 78


def bump(depth_path):
    """深度图 → (受光图, 脊线镜面图)。两张都是 8 位灰度。

    **受光图的基准必须是「平地」（法线朝正前方）**：那是 n·L = LIGHT.z。以中位数或 0.5 当基准
    都不对 —— 前者的结果随画面里平的/斜的各占多少漂移，后者把「平」判成了「亮」（0.5 vs
    真实 0.61），于是整张画被均匀提亮。核心是 e = lam - LZ：平地 → 0 → 输出 128 → 软光下
    什么也不改；只有真的有坡的地方才偏离中性。

    再用 tanh 做**软**饱和而不是 np.clip：硬裁会在两端造出大片纯 0/纯 255，soft-light 拿纯白
    去混就是糊一层白膜（2026-09-25 第一版实测：6.6% 像素贴在 255，判读直接说「覆白膜、不是
    压痕」）。tanh 只压缩极端值、不产生平台。"""
    im = Image.open(depth_path).convert("L").filter(ImageFilter.GaussianBlur(0.8))
    d = np.asarray(im).astype(np.float32) / 255.0
    gy, gx = np.gradient(d)
    n = np.stack([-gx * SCALE, -gy * SCALE, np.ones_like(d)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = LIGHT / np.linalg.norm(LIGHT)
    lam = (n * L).sum(-1)                                   # 不裁到 [0,1]：负值是背光面，要留着
    lit = 0.5 + 0.5 * np.tanh((lam - float(L[2])) * GAIN)
    spec = np.clip(lam, 0, 1) ** SPEC_POW * SPEC_GAIN
    return ((lit * 255).astype(np.uint8), (spec * 255).astype(np.uint8))


def main():
    with open(os.path.join(ROOT, "data", "home-cards.yaml"), encoding="utf-8") as f:
        cards = yaml.safe_load(f)
    os.makedirs(OUT, exist_ok=True)
    total = 0
    n = 0
    for c in cards:
        if c.get("style") != "emboss":
            continue
        base = os.path.splitext(os.path.basename(c["image"]))[0]
        dep = os.path.join(CARDS, "depth", base + ".webp")
        if not os.path.exists(dep):
            print(f"✗ 没有深度图：{base}（先跑 tools/cards/make-depth.py）")
            continue
        lit, spec = bump(dep)
        for arr, tag in ((lit, "lit"), (spec, "spec")):
            im = Image.fromarray(arr, "L")
            if im.width > TARGET_W:
                im = im.resize((TARGET_W, round(im.height * TARGET_W / im.width)), Image.LANCZOS)
            p = os.path.join(OUT, f"{base}-{tag}.webp")
            im.save(p, "WEBP", quality=QUALITY, method=6)
            total += os.path.getsize(p)
            n += 1
            print(f"   {base}-{tag}.webp  {os.path.getsize(p) // 1024:3d} KB")
    print(f"✓ {n} 张受力图，合计 {total // 1024} KB（{os.path.relpath(OUT, ROOT)}）")


if __name__ == "__main__":
    main()
