#!/usr/bin/env python3
# 首页卡片组的卡面生成器：读 data/home-cards.yaml（清单，含源图与取景），出 assets/images/cards/*.webp。
# 用法（与 make-mascot.py 同一个解释器）：C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/make-cards.py
#
# **清单是单一事实源**：模板（layouts/_partials/home-cards.html）读的是同一个 YAML 里的
# image / series / name / style，所以改卡片（换图、改风格、加一张）只改那个文件再跑一遍这里。
#
# 卡面统一 5:7（集换卡比例）。都是按**内容包围盒**取景，两个判据是量出来的：
# 阈值 45（低到 12 会把浅色花瓣与柔和渐变算成内容，包围盒直接等于整张图）、
# 坐标取 1%~99% 分位（min/max 会被零星花瓣撑大）。字段怎么选：
#   · crop: figure       **默认口径（2026-09-20 起）**：**填满**卡面、不留空带；窗口上沿贴住
#                        内容（留一点头顶），多出来的部分从下面裁掉（腿可以切、头不行）
#   · crop: auto         与 figure 同义（保留是为了不动老清单）
#   · zoom               构图放开倍数（默认 1.0 = 最紧）：>1 会多留背景，给高等级的卡用
#                        —— 留下的必须是**源图自己的背景**，不是补出来的色块
#   · crop: [x0,y0,x1,y1] 分数窗，给构图满、没法定「内容」的画手写
#   · flat: [[上],[下]]  垫底渐变：给透明源图，或 figure 装不下时手定底色；
#                        不写则按**实测四角颜色**取（必须按 alpha 挑像素，见 corners_flat）
#
# 出图 600×840（首页卡面显示 264px 宽的 2 倍再加一档），WebP q82；顺手把全部卡面拼一张接触表写到
# ../lab/结果/cards_check.png —— 取景对不对只能看图定。跑完还会报「目录里有、清单里没有」
# 的孤儿产物（撤掉一张卡时容易忘了删产物）。
import os
import sys

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MANIFEST = os.path.join(ROOT, "data", "home-cards.yaml")
LAB = os.path.join(ROOT, os.pardir, "lab", "shots", "cards_check.png")
# 600×840（2026-09-20 从 480×672 提上来）：首页显示宽度 16.5rem = 264px，模板要 264 与 528
# 两档，主图比 528 再宽一点才不至于在 2x 屏上被放大（Hugo 的 Resize 放大会发虚还多花字节）。
CARD_W, CARD_H = 600, 840
QUALITY = 82
AUTO_T = 45          # 内容判据：与四角底色差异大于它才算「内容」

# ---- 明度收极端（2026-09-26，docs/pending.md「卡面明度散度」方案①）----
# 只收两个尾巴、不动中段：L < DARK_KNEE 的抬、L > BRIGHT_KNEE 的压。两边都是
# f(knee)=knee、斜率 1−gain 的连续单调映射 —— 「只动极端」是结构性的，不是阈值硬跳
# （硬跳会让 114.9 与 115.1 的两张卡在墙上差出一截）。
# L 的口径 = scripts/deck-edit.py 的 card_lum（灰度 → 60×84 双线性 → 均值），
# 与管理页「明度体检」同一把尺。为什么不是全局拉平：lum12-norm 那版会把 #33 银霜 /
# #03 花信洗成白雾，判读已否；这里只把 57 张的两个尾巴收回来（37→103 起、230→217 止）。
DARK_KNEE, DARK_GAIN = 115.0, 0.85
BRIGHT_KNEE, BRIGHT_GAIN = 215.0, 0.85
HILITE_Y, HILITE_DESAT = 225.0, 0.35   # 亮卡「极轻中性底」：近白像素向自身亮度灰混的强度


def load():
    with open(MANIFEST, encoding="utf-8") as f:
        return yaml.safe_load(f)


def content_box(im):
    """量出「内容」（与四角底色差异明显的像素）的包围盒。判据见文件头：阈值 45 + 1%~99% 分位。"""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    diff = np.abs(rgb - rgb[0, 0]).max(axis=2)
    ys, xs = np.where(diff > AUTO_T)
    if len(xs) < 80:
        return None
    x0, x1 = np.percentile(xs, [1, 99])
    y0, y1 = np.percentile(ys, [1, 99])
    return float(x0), float(y0), float(x1), float(y1)


def fill_box(im, zoom=1.0, head_room=0.08, keep_min=0.55):
    """**填满卡面**的取景（2026-09-20 起是默认口径）：窗口铺满源图、不留任何空带，
    上沿贴住内容（留一点头顶空间），多出来的部分**从下面裁掉**。

    为什么推翻上一版：上一版是「把整幅装进卡面，装不下就补边」—— 而 32 张里 20 张装不下，
    卡面两侧/上下就有了空带。用户连续两轮指出这一点，**要的是没有空带**，不是把补边做好看。
    卡片的常规构图本来就是胸像/三分身，所以下沿裁掉腿是可以接受的；**头不能被切** ——
    所以窗口是「上对齐内容上沿、往下长」，而不是垂直居中。

    zoom > 1 把窗口放开一点、多留背景（用户：「高品质的卡可以保留好看的背景」）——
    注意留下的必须是**源图自己的背景**，不是补出来的色块。上限是源图装不下为止。"""
    b = content_box(im)
    if b is None:
        x0, y0, x1, y1 = 0.0, 0.0, float(im.width), float(im.height)
    else:
        x0, y0, x1, y1 = b
    cw, ch = x1 - x0, y1 - y0
    # 窗口高度分两步定，两步都是**为了别留白**：
    #   ① 优先**宽驱动** —— 先算「让内容正好填满卡面宽度」需要多高（cw × 7/5）。
    #      细长的全身立绘于是被裁成**胸像**（头 + 上身），两侧不留白；卡片的常规构图
    #      本来就是胸像/三分身，腿可以切、**头不能切**（靠上面的 head_room 保证）。
    #   ② 但**至少保留 keep_min 的内容高度**（0.55 ≈ 半身）：用户的优先级是
    #      「先保头像完整、其次半身完整」，所以宁可两侧留一点画面自己的背景，
    #      也不要把上身裁掉（0.42 那版实测裁到只剩头肩，太狠）。
    #   ③ 上限是「整个内容都装得下」（再大就是白给背景）。
    # 头像"完整"是**结构性保证**，不是调参调出来的：窗口上沿取 `y0 - head_room×h`
    # （y0 是内容最上面一行 = 头发/帽子顶），并且下面那个 clamp 只会把窗口往下推、
    # 不会推到 y0 以下 —— 所以头顶永远在窗口内，且总有一段留白。
    need_h = min(max(cw * CARD_H / CARD_W, ch * keep_min), ch) * zoom
    need_w = need_h * CARD_W / CARD_H
    if need_w > im.width:                      # 不能超过源图：超了就按源图的边界反过来定
        need_w = float(im.width)
        need_h = need_w * CARD_H / CARD_W
    if need_h > im.height:
        need_h = float(im.height)
        need_w = need_h * CARD_W / CARD_H
    cx = (x0 + x1) / 2
    x = min(max(0.0, cx - need_w / 2), im.width - need_w)
    y = min(max(0.0, y0 - head_room * need_h), im.height - need_h)
    return (int(x), int(y), int(x + need_w), int(y + need_h))


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


def label_font(size=13):
    """接触表的标签写的是**中文**（卡名与系列），而 PIL 的默认位图字体没有中文字形 —— 不换字体会
    把每个汉字画成一个方框（2026-09-20 出的那张送审图就是这么废掉的，标签全是 □□）。
    按平台找一份系统字体，找不到就退回默认（宁可方框，也不要因为字体缺失让脚本报错）。"""
    for path in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
                 "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def gradient(size, top, bottom):
    w, h = size
    ramp = np.linspace(0, 1, h)[:, None]
    arr = (np.asarray(top, np.float32)[None, None, :] * (1 - ramp[:, :, None])
           + np.asarray(bottom, np.float32)[None, None, :] * ramp[:, :, None])
    return Image.fromarray(np.repeat(arr, w, axis=1).astype(np.uint8), "RGB")


def face_lum(img):
    """与 scripts/deck-edit.py 的 card_lum 同款：灰度 → 60×84 双线性 → 均值（管理页那把尺）。"""
    return float(np.asarray(img.convert("L").resize((60, 84), Image.BILINEAR), dtype="float32").mean())


def lum_target(L):
    """这张卡的均值该落到哪：只收两端，中段原样返回。"""
    if L < DARK_KNEE:
        return L + DARK_GAIN * (DARK_KNEE - L)
    if L > BRIGHT_KNEE:
        return L - BRIGHT_GAIN * (L - BRIGHT_KNEE)
    return L


def apply_lum(face):
    """把一张成卡的均值收进区间（常数段注释见文件头）。返回 (新 face, 旧 L, 新 L)。"""
    L = face_lum(face)
    target = lum_target(L)
    if abs(target - L) < 1.0:
        return face, L, L
    rgb = np.asarray(face, dtype=np.float32)
    if L > BRIGHT_KNEE:
        # 亮卡：线性乘（luma 线性 → 均值精确落标、色相不动），再做「极轻中性底」——
        # 近白像素向自身亮度灰混，高调卡的纸底不再带色偏，贴白底页面时融不进去。
        out = np.clip(rgb * (target / max(L, 1.0)), 0, 255)
        luma = out[..., 0] * 0.299 + out[..., 1] * 0.587 + out[..., 2] * 0.114
        m = luma > HILITE_Y
        if m.any():
            for ch in range(3):
                v = out[..., ch]
                v[m] = v[m] * (1 - HILITE_DESAT) + luma[m] * HILITE_DESAT
    else:
        # 暗卡：线性抬黑场（levels，白点锚 255）—— out = RGB·a + b, a = 1 − b/255。
        # 为什么不是伽马：miku-01 初始之音是「大面积纯黑 + 亮主体」的双峰图，
        # 乘性变换抬不动纯黑（0×s=0），gamma 为凑均值会把亮部打曝，且解在 60×84 上、
        # 用在全分辨率上会差出 32 点。线性变换动黑护白，均值恒等 mean = a·L + b →
        # 闭式解 b = (target−L)·255/(255−L)，模型=实测，没有任何降采样交换误差；
        # y' = y + b(1−y/255) 恒 ≤ 255，也不会削顶。副作用是暗部往灰走一点
        # （纯黑→b 的中性灰），这正是「抬中间调」本身该有的样子。
        b = (target - L) * 255.0 / (255.0 - L)
        a = 1.0 - b / 255.0
        out = np.clip(rgb * a + b, 0, 255)
    new = Image.fromarray(out.astype(np.uint8), "RGB")
    return new, L, face_lum(new)


def main():
    cards = load()
    out_dir = os.path.join(ROOT, "assets", "images", "cards")
    os.makedirs(out_dir, exist_ok=True)
    faces, total = [], 0
    tuned = []
    for c in cards:
        src = os.path.join(ROOT, c["src"])
        if not os.path.exists(src):
            print(f"✗ 源图不在：{c['src']}（{c['image']}）")
            continue
        im = Image.open(src)
        transparent = (im.mode in ("RGBA", "LA")
                       and np.asarray(im.convert("RGBA").getchannel("A")).min() < 250)
        # 取景只有两条路：**手量窗**（构图满、没法定「内容」的几张）与**填满**
        # （figure 与 auto 现在是同一件事，见 fill_box 的注释）。上一版那两条
        # 「整幅缩进 + 补边」的退路已删除 —— 它们正是空带的来源。
        crop_spec = c.get("crop")
        if isinstance(crop_spec, list):
            box = tuple(int(round(v * s2)) for v, s2 in
                        zip(crop_spec, (im.width, im.height, im.width, im.height)))
            note = "手量窗"
        else:
            # pad 是旧字段名（语义相同），保留兼容；高等级的卡用 zoom 放开构图
            box = fill_box(im, float(c.get("zoom", c.get("pad", 1.0))))
            note = "填满"
        crop = fit_ratio(im.crop(box))
        if transparent:
            top, bottom = c.get("flat", [[246, 243, 249], [222, 216, 232]])
            bg = gradient(crop.size, tuple(top), tuple(bottom))
            crop = Image.composite(crop.convert("RGB"), bg, crop.convert("RGBA").getchannel("A"))
        else:
            crop = crop.convert("RGB")
        face = crop.resize((CARD_W, CARD_H), Image.LANCZOS)
        face, L0, L1 = apply_lum(face)          # 明度收极端：只收尾巴（见 DARK_KNEE 注释）
        if L1 != L0:
            tuned.append(c["series"])
        dest = os.path.join(ROOT, "assets", c["image"])   # image 是相对 assets/ 的路径
        face.save(dest, "WEBP", quality=QUALITY, method=6)
        kb = os.path.getsize(dest) // 1024
        total += kb
        faces.append((face, f"{os.path.basename(c['image'])}  {c.get('name') or c['series']}  [{c['style']}]"))
        b2 = content_box(face)
        head = f"头顶 {b2[1] / CARD_H * 100:4.1f}%" if b2 else "头顶  n/a"
        if b2 and b2[1] < CARD_H * 0.015:
            print(f"  ⚠ {c['image']} 的头顶几乎贴着卡的上边缘（{b2[1]}px）—— 看一眼取景")
        lum = f"  L {L0:.0f}→{L1:.0f}" if L1 != L0 else ""
        print(f"  {c['image']:26s} {face.size[0]}x{face.size[1]}  {kb:3d} KB  {c['style']:6s} "
              f"{c.get('name') or c['series']}  ({note}, {head}){lum}")
    print(f"共 {len(faces)} 张，合计 {total} KB")
    # 明度对账（deck-edit.card_lum 同口径）：收完的 min/std 要落在「无黑洞、无白洞」区间，
    # 具体卡面的观感仍以接触表 + 管理页「明度体检」的判读为准。
    Ls = [face_lum(f) for f, _ in faces]
    if Ls:
        print(f"明度体检：min {min(Ls):.1f} / max {max(Ls):.1f} / std {np.std(Ls):.1f}"
              f"（收极端 {len(tuned)} 张：{'、'.join(tuned)}）")

    # 清单里有、但没出图的（源图缺失在上面逐条报过，这里兜住别的失败路径）
    missing = [c["image"] for c in cards
               if not os.path.exists(os.path.join(ROOT, "assets", c["image"]))]
    if missing:
        print(f"✗ 清单里有 {len(missing)} 条没出图：" + "、".join(missing))

    # 孤儿产物：目录里有、清单里没有的（撤掉一张卡时容易忘记删产物）。**只报告、不自动删** ——
    # 产物是入库的资产，删之前该看一眼它是不是刚被改名（ayaka-15 → ayaka-23 就是这种）。
    expected = {os.path.basename(c["image"]) for c in cards}
    orphans = sorted(f for f in os.listdir(out_dir)
                     if f not in expected and os.path.isfile(os.path.join(out_dir, f)))
    if orphans:
        print(f"⚠ assets/images/cards/ 里有 {len(orphans)} 个不在清单里的产物（撤卡后忘了删？）：")
        for f in orphans:
            print(f"    {f}  {os.path.getsize(os.path.join(out_dir, f)) // 1024} KB")

    cols = 6
    cw, ch = CARD_W // 2 + 20, CARD_H // 2 + 36
    rows = (len(faces) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * ch), (34, 34, 40))
    d = ImageDraw.Draw(sheet)
    font = label_font()
    for i, (face, label) in enumerate(faces):
        x, y = (i % cols) * cw, (i // cols) * ch
        d.text((x + 8, y + 8), label, fill=(235, 235, 240), font=font)
        sheet.paste(face.resize((CARD_W // 2, CARD_H // 2), Image.LANCZOS), (x + 10, y + 26))
    os.makedirs(os.path.dirname(LAB), exist_ok=True)
    sheet.save(LAB)
    print("接触表", LAB)


if __name__ == "__main__":
    main()
