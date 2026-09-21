#!/usr/bin/env python3
# 首页卡片组的**深度图**生成器：为 3D 查看器（assets/js/card-3d.js）出「浮雕高度图」。
#
# 用法（与 make-cards.py 同一个解释器，**但依赖更重**，见 tools/requirements.txt）：
#   C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/make-depth.py
#   … make-depth.py ayaka-sword girl-ojou     # 只重跑某几张
#   … make-depth.py --force                   # 全部重出（默认已存在且比卡面新就跳过）
#
# 产物：assets/images/cards/depth/<卡面同名>.webp —— 灰阶、与卡面**同尺寸（600×840）**，
# 于是着色器用同一套 UV 采两张图，不需要任何对齐逻辑（对齐一错就是鬼影，且不会报错）。
# **路径由 image 字段推导，不是新加的 YAML 字段**：手写的路径字段会漏、会写错、会与产物
# 改名脱节；推导出来的路径由 scripts/check-deck.mjs 守卫兜着（缺图即构建失败）。
#
# 口径三条，都是踩过才知道要写下来的：
#
# 1. **背景必须钳平成 0**（`--clamp`）。深度模型给的是**相对深度**，背景不是 0 而是某个中灰；
#    直接拿去驱动网格位移，整张卡会一起鼓起来，变成「压凸的平面」而不是「一张真卡上立着一个人」。
#    阈值**不用固定魔数**：卡面四周那一圈几乎总是背景，所以取四边带的深度中位数当背景基准，
#    再把 (d - bg) / (1 - bg) 重映射到 0..1 —— 每张自适应，浅底深底都不用改参数。
#    想强制用绝对阈值（某一批图边缘不是背景时）再给 `--clamp 0.34`。
# 2. **抑制噪声**：模型的输出在发丝、花瓣边缘会有零星跳变，直接当高度场会出现颗粒状的假浮雕。
#    先做一次小半径高斯（sigma 2px），够平掉噪点又不糊掉五官。
# 3. **必须只吃「已取景的卡面」，不吃源图**：深度图要跟链接着色器的纹理逐像素对齐，而那张纹理
#    是 make-cards.py 裁过的。所以本脚本读 assets/images/cards/*.webp，**必须后跑**。
# 4. **轮廓处要倒角**（`--fillet`，2026-09-21 加）。高度场在「主体 ↔ 背景」之间是从 0 直接跳到
#    0.5 的**断崖**，着色器把它当位移用时，那道崖壁就是一堵竖直的墙 —— 位移一小还看不出来
#    （旧口径 2.2% 卡宽），一旦加高（现在传世/奇迹到 ~5%）就露馅，读作「贴上去的纸片」。
#    这就是项目里「5% 像纸板」那条结论的根因。做法照 holo3D-card 那套：找崖边 → 算到崖边的
#    距离 → 用 sin(π/2·u) 把高度沿距离压成圆坡（真卡压凸、铜章浮雕在边缘都是这么起的）。
#    **只对贴着背景的那一圈起坡**：发丝、褶皱这些画面内部的落差是细节，不是崖壁。这一步只改
#    灰阶、不动几何，所以不会引入对齐问题。判据用「离背景多远」而不是「崖边多陡」——后者会被
#    上一步的高斯摊平而**静默失效**（第一版 63 张里 58 张没倒上），细节见 fillet 的注释。
#
# 模型：Depth Anything V2 Small。huggingface.co 在本机不通，走 **hf-mirror.com**（HF_ENDPOINT）；
# 首次运行下载约 100 MB 到 HF 缓存，之后离线可用。本机 CUDA 可用（实测一张约 1~2 秒）。
import argparse
import os
import sys
import time

os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")   # 必须在这两个 import 之前

import numpy as np  # noqa: E402
import torch  # noqa: E402
import yaml  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from scipy.ndimage import gaussian_filter, median_filter  # noqa: E402
from transformers import AutoImageProcessor, AutoModelForDepthEstimation  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MANIFEST = os.path.join(ROOT, "data", "home-cards.yaml")
FACES = os.path.join(ROOT, "assets", "images", "cards")
DEPTH = os.path.join(FACES, "depth")
LAB = os.path.join(ROOT, os.pardir, "lab", "shots", "cards_depth_check.png")
MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
QUALITY = 75          # 灰阶图没有细节纹理，q75 实测 600×840 约 6 KB（卡面画作本身 44 KB）
BLUR = 2.0
EDGE = 0.06           # 边缘带的宽度比例：取四周 6% 的深度中位数当「背景基准」
BG_EPS = 0.05         # 算作「背景」的高度上限：倒角只从贴着背景的那一圈起坡（见 fillet 的注释）
FILLET = 0.027        # 圆角半径 = 卡面宽度 × 这个比例（600px 上约 16px；0 = 不倒角，用于前后对比）
# 取值口径：它决定轮廓那道坡有多缓，也决定「浮雕轮廓比画面轮廓向内缩多少」（同一个数）。
# 参考站默认 14px / 1536 宽 ≈ 0.9%；我们取 2.7%（600px 上 16px），因为它的位移是卡高的
# 两成、我们是百分之几 —— 坡不够宽，位移一加大就还是「一堵墙」。代价是轮廓向内缩同样多，
# 所以「损失」那个体检数要盯着；真要改，一键重出 63 张只要 13 秒，别怕试。
LOSS_WARN = 1.5       # 倒角把多少比例的画面「压掉」算异常（%，超过就在接触表上盯着看）


def label_font(size=13):
    """接触表标签是中文，PIL 默认位图字体没有汉字字形（会把每个字画成方框）。
    与 make-cards.py 同一份候选列表，找不到就退回默认：宁可方框也不要因为字体缺失报错。"""
    from PIL import ImageFont
    for path in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
                 "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def load_model():
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"▸ 模型 {MODEL}（device={dev}，HF_ENDPOINT={os.environ['HF_ENDPOINT']}）")
    proc = AutoImageProcessor.from_pretrained(MODEL)
    model = AutoModelForDepthEstimation.from_pretrained(MODEL).eval().to(dev)
    return proc, model, dev


def infer(proc, model, dev, im):
    """一张卡面 → 与原图同尺寸的 float32 相对深度（值大 = 近）。"""
    inputs = proc(images=im, return_tensors="pt").to(dev)
    with torch.no_grad():
        pred = model(**inputs).predicted_depth
    pred = torch.nn.functional.interpolate(
        pred.unsqueeze(1), size=(im.height, im.width), mode="bicubic", align_corners=False
    ).squeeze()
    return pred.float().cpu().numpy()


def background_level(dn):
    """背景基准 = 卡面四边带的深度**低分位**。

    为什么不用中位数、也不用固定阈值：背景通常是画面里**最远**的东西，也就是边带上深度最小
    的那一批；而中位数会被边带里的主体（紧特写、全身塞满画面）拉高。实测「大小姐」那张卡的
    边带中位数是 0.57 —— 按它钳平会把身体一起铲平成黑，只剩一个白脑袋。
    低分位对这种构图稳得多：边带全是主体时它也不会高到把主体削掉。"""
    h, w = dn.shape
    b = max(2, int(min(h, w) * EDGE))
    band = np.concatenate([dn[:b, :].ravel(), dn[-b:, :].ravel(),
                           dn[:, :b].ravel(), dn[:, -b:].ravel()])
    return float(np.percentile(band, 10))


def to_height(d, bg=None, toe=0.14):
    """相对深度 → 高度场（float 0~1，**还没量化**：倒角要在浮点上做，之后才乘 255）。

    把背景钳平成 0，同时**完整保留主体内部的高低层次**。

    那个 toe（软脚）必须是**乘法**而不是单调坡：`t * smoothstep(0, toe, t)` ——
    大值几乎原样留下、只有背景附近的小值被连续压到 0。
    反面写法是 `smoothstep(0, toe, t)` 单用，那是把 toe 以上的全部推到 1：实测三张卡都被压成
    一块**白剪影**，人物内部的起伏全没了（网格位移会变成平顶台地，POM 也没有细节可采）。"""
    dn = (d - d.min()) / max(1e-6, float(d.max() - d.min()))
    if bg is None:
        bg = background_level(dn)
    t = np.clip((dn - bg) / max(1e-3, 1.0 - bg), 0.0, 1.0)
    s = np.clip(t / toe, 0.0, 1.0)
    return t * (s * s * (3.0 - 2.0 * s)), bg


def _shift(a, dy, dx):
    """取 a 的邻域（越界用边缘值补）。

    **不能用 np.roll**：它把对边卷过来，在画面边界处凭空造出崖边 —— 而那正是倒角要动手的地方，
    结果是边框一圈被凭空压平。这个坑与着色器那边「位移必须在边缘收敛到 0」是同一条道理。"""
    p = np.pad(a, 1, mode="edge")
    h, w = a.shape
    return p[1 + dy:1 + dy + h, 1 + dx:1 + dx + w]


NEIGH = ((1, 0, 1.0), (-1, 0, 1.0), (0, 1, 1.0), (0, -1, 1.0),
         (1, 1, 1.4142), (1, -1, 1.4142), (-1, 1, 1.4142), (-1, -1, 1.4142))


def fillet(t, radius):
    """轮廓倒角：让主体的边缘**从背景（0）平滑地长起来**，于是断崖变成 sin 圆坡。

    口径是「**离背景多远**」，不是「崖边有多陡」：`h_new = h · sin(π/2 · d/radius)`，
    d = 到最近背景像素的距离（限到 radius 就够，再远权重已饱和成 1）。贴着背景处高度为 0，
    向内 radius 像素完全恢复原高 —— 就是真卡压凸 / 铜章浮雕在边缘的起坡。

    **为什么不判崖边（踩过，别改回去）**：第一版照参考站的做法按「单像素落差 ≥ 0.15」找崖边，
    而本脚本上一步刚做过 sigma 2 的高斯 —— 一个 0.8 的台阶被摊到 6~8 像素，每像素只走约 0.16，
    阈值正好卡在边缘上：**63 张里 58 张一个崖边都没找到，静默没倒角**（字节与改前一模一样，
    页面上也看不出来）。而参考站那份深度图是双边滤波（保边）出来的，崖是真的垂直，所以同样的
    阈值在那边有效。合成测试图用的是硬台阶，因此当时是假绿 —— 判据本身对「已经平滑过」的输入
    不成立，换个阈值也只是把失败边界挪个位置。改成距离场之后，无论上一步平滑多狠都成立。

    只对**贴着背景**的部分起坡，画面内部的落差（发丝、衣褶）不动 —— 那些是细节不是崖壁。
    代价要认清：**离背景 radius 以内的细线一定会被压低**（3px 宽的发丝整体落在 radius 内），
    所以 radius 不能贪大，而且要拿 `损失` 那个体检数盯着（main 里算、超阈值打 ⚠）。"""
    if radius < 1:
        return t
    bg = t <= BG_EPS
    if not bg.any():
        return t
    dist = np.where(bg, 0.0, np.inf).astype(np.float32)
    for _ in range(int(radius)):
        for dy, dx, w in NEIGH:
            dist = np.minimum(dist, _shift(dist, dy, dx) + w)
    u = np.clip(dist / float(radius), 0.0, 1.0)
    return t * np.sin(u * (np.pi / 2.0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*", help="只处理这几张（按 image 的文件名或去掉扩展名）；不给就全部")
    ap.add_argument("--force", action="store_true", help="已存在也重出（默认比卡面新就跳过）")
    ap.add_argument("--clamp", type=float, default=None,
                    help="强制用这个绝对背景阈值（0~1），不给就按四边带自动估")
    ap.add_argument("--quality", type=int, default=QUALITY)
    ap.add_argument("--fillet", type=float, default=FILLET,
                    help="轮廓倒角半径（卡面宽度的比例，默认 0.02；给 0 就是不倒角）")
    args = ap.parse_args()

    with open(MANIFEST, encoding="utf-8") as f:
        cards = yaml.safe_load(f)

    want = set()
    for n in args.names:
        want.add(n if n.endswith(".webp") else n + ".webp")
    todo = [c for c in cards if not want or os.path.basename(c["image"]) in want]
    if want:
        got = {os.path.basename(c["image"]) for c in todo}
        for miss in sorted(want - got):
            print(f"✗ 清单里没有这一张：{miss}")

    os.makedirs(DEPTH, exist_ok=True)
    pairs, total, skipped = [], 0, 0
    proc = model = dev = None
    t0 = time.time()

    for c in todo:
        base = os.path.basename(c["image"])
        face_path = os.path.join(ROOT, "assets", c["image"])
        dest = os.path.join(DEPTH, base)
        if not os.path.exists(face_path):
            print(f"✗ 卡面不在：{c['image']}（先跑 make-cards.py）")
            continue
        if (not args.force and os.path.exists(dest)
                and os.path.getmtime(dest) >= os.path.getmtime(face_path)):
            skipped += 1
            continue
        if model is None:
            proc, model, dev = load_model()

        im = Image.open(face_path).convert("RGB")
        d = infer(proc, model, dev, im)
        hf, bg = to_height(d, args.clamp)
        radius = max(0, int(round(im.width * args.fillet)))
        lost = 0.0
        if radius:
            f = fillet(hf, radius)
            # 「倒角铲掉了多少」——倒角**会**压低轮廓与细线，这是它的代价，所以量出来而不是感觉：
            # 统计「原本有明显高度（>0.3）、倒角后掉了两成以上」的像素占比。它一异常（比如某张卡
            # 满画都是细线）就能在接触表上一眼看出来，而不是悄悄把一张卡的细节磨平。
            lost = float(((f < hf - 0.2) & (hf > 0.3)).mean()) * 100.0
            hf = f
        if BLUR:
            # **顺序是「先倒角、再高斯」**（2026-09-21 与第一版相反，实测定的）：
            # 倒角的公式 `h · sin(π/2 · d/R)` 只压「贴着背景的那一段」。若先高斯再倒角，
            # 落差早被高斯摊进 6~8 像素，乘法项就只剩「砍坡脚」——实测坡宽仍 6px、最大每像素
            # 落差仍 0.160，与完全不倒角一模一样，等于白做（第一版 63 张里 58 张如此）。
            # 先倒角（在**锐场**上按 R 起一道坡）再高斯，坡度才真的随 R 变缓：
            # R=7 → 坡宽 7px / 落差 0.120；R=16 → 11px / 0.070；R=25 → 15px / 0.047。
            # 高斯在这里的职责也因此多了一条：把 sin 坡的拐点抹圆。
            # 代价：背景贴轮廓的一圈被抬起约 0.05（按现在的位移约 1px），可忽略。
            # 用 scipy 而不是 ImageFilter：PIL 的 GaussianBlur 不支持 "F"（32 位浮点）模式，
            # 实测直接 ValueError: image has wrong mode。
            # 中值 3×3 在**高斯之前**：深度模型（ViT）的补丁网格在高度场上留下一道
            # 16 像素周期、约 1 个灰度级的台阶，而着色器的法线是 ±1 像素的梯度 —— 那道台阶
            # 被放大成一道道等距直线（在「所有立体通道全关」的基线上也看得见，所以一度被
            # 误当成新效果的锅）。实测（8 张卡的平均）：16 取模的梯度峰/谷 1.61 → 中值 3×3
            # 后 1.20 → 再叠高斯 1.09。**它比「把高斯加大」对症**：高斯 4.0 也能压到 1.04，
            # 但那把 6 像素级的真细节（发丝、花瓣边）一起糊了。中值是保边的，专治 1 像素台阶。
            hf = median_filter(hf.astype(np.float32), 3, mode="nearest")
            hf = gaussian_filter(hf, BLUR, mode="nearest")
        h8 = (hf * 255.0).round().astype(np.uint8)
        Image.fromarray(h8, "L").save(dest, "WEBP", quality=args.quality, method=6)
        kb = os.path.getsize(dest) // 1024
        total += kb
        # 背景占比是个有用的体检数：钳平过头（>95%）说明阈值吃掉了主体，几乎没钳到（<20%）
        # 说明这张卡几乎没有背景可钳 —— 两种情况都该在接触表上多看一眼，而不是等渲染出来才发现。
        flat = float((h8 == 0).mean()) * 100
        flag = '  ⚠ 细节损失偏多' if lost >= LOSS_WARN else ''
        pairs.append((
            im, Image.fromarray(h8, "L"),
            f"{base}  {c.get('name') or c['series']}  bg={bg:.2f}  背景 {flat:.0f}%  损失 {lost:.1f}%{flag}"))
        print(f"  {base:22s} {im.size[0]}x{im.size[1]}  {kb:3d} KB  背景基准 {bg:.2f}  "
              f"背景占比 {flat:3.0f}%  倒角 {radius}px 损失 {lost:.1f}%  "
              f"{c.get('name') or c['series']}{flag}")

    if skipped:
        print(f"（跳过 {skipped} 张：深度图比卡面新，--force 可强制重出）")
    print(f"共出 {len(pairs)} 张，合计 {total} KB，用时 {time.time() - t0:.1f}s")

    # 清单里有、深度图不在的：这条守卫在 scripts/check-deck.mjs 里也有（构建时阻断），
    # 这里报一遍是为了让「生成阶段」就把话说清楚，而不是等构建才红。
    missing = [os.path.basename(c["image"]) for c in cards
               if not os.path.exists(os.path.join(DEPTH, os.path.basename(c["image"])))]
    if missing:
        print(f"✗ 有 {len(missing)} 张卡没有深度图：" + "、".join(missing))

    expected = {os.path.basename(c["image"]) for c in cards}
    orphans = sorted(f for f in os.listdir(DEPTH)
                     if f not in expected and os.path.isfile(os.path.join(DEPTH, f)))
    if orphans:
        print(f"⚠ assets/images/cards/depth/ 里有 {len(orphans)} 个不在清单里的产物（撤卡后忘了删？）：")
        for f in orphans:
            print(f"    {f}  {os.path.getsize(os.path.join(DEPTH, f)) // 1024} KB")

    # 接触表：左边是卡面、右边是喂给着色器的高度场（背景应当已平整为黑）。
    # 「取景/风格」看图定，而「深度对不对」也只能看图定 —— 尤其是模型在某些构图上翻车时
    # （特写、多人、大面积同色背景），只有把 32 张摆在一起才看得出来。
    if pairs:
        cw, ch = 200, 280
        per_row = 4
        rows = (len(pairs) + per_row - 1) // per_row
        sheet = Image.new("RGB", (per_row * (cw * 2 + 26), rows * (ch + 30)), (34, 34, 40))
        d = ImageDraw.Draw(sheet)
        font = label_font()
        for i, (face, height, label) in enumerate(pairs):
            x = (i % per_row) * (cw * 2 + 26)
            y = (i // per_row) * (ch + 30)
            d.text((x + 8, y + 6), label, fill=(235, 235, 240), font=font)
            sheet.paste(face.resize((cw, ch), Image.LANCZOS), (x + 8, y + 26))
            sheet.paste(height.convert("RGB").resize((cw, ch), Image.LANCZOS), (x + cw + 16, y + 26))
        os.makedirs(os.path.dirname(LAB), exist_ok=True)
        sheet.save(LAB)
        print("接触表（左=卡面，右=高度场）", LAB)


if __name__ == "__main__":
    main()
