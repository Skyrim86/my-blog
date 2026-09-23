#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""收藏卡的**客观定级**：data/home-cards.yaml 里那个 rank 字段是怎么来的。

用法（与 tools/cards/ 那几个脚本同一个解释器）：
    C:/Users/15350/miniconda3/envs/ml/python.exe scripts/rank-deck.py           # 算分、报名单、出接触表
    C:/Users/15350/miniconda3/envs/ml/python.exe scripts/rank-deck.py --apply    # 再把 rank 写回清单
    C:/Users/15350/miniconda3/envs/ml/python.exe scripts/rank-deck.py --check     # 只看清单与建议差在哪

为什么要有这个脚本：六档阶梯（收藏 / 珍稀 / 史诗 / 秘藏 / 传世 / 奇迹）是**视觉系统的骨架**，
而骨架必须有一个可复算、可复核的分级依据 —— 否则「哪张该是哪档」只能凭手感，下次想调就无从下手。
依据沿用 2026-09-20 首版定级那三条**能量出来的东西**，刻意不含「角色人气」这类主观项：

    · 画面梯度    mean|∇I|（卡面灰度图的平均梯度）—— 细节量最直接的代理量，权重最高
    · 卡面字节    产物 webp 的大小 —— 同一套编码参数下细节越多压出来越大（带一点编码噪声，故次之）
    · 源图分辨率  源图像素数 —— 画作本身的天花板；官方大图会在这里被抬起来

三项各自取**百分位**（0~1）再按权重合成，所以分数是**相对**的：它只说「这张比那张细」，
不含绝对门槛。加卡、换图之后重跑，阶梯仍然连续。

分档口径：**只在原来的档内部切**（收藏 37 → 收藏/珍稀，史诗 19 → 史诗/秘藏），
传世 6 与奇迹 1 **一律不动** —— 那 7 张是按设计挑的，重排会把「隐藏等级」这类语义弄乱。
切的张数是常量（见 TARGETS），改它就是改分布。

产物：
    data/rank-scores.json            三项子分 + 合成分 + 当前档 + 建议档（入库，可复核）
    ../lab/结果/rank-pick/sheet.png 六档接触表（每档一段、按分数降序、带分数与改档标记）
"""
import argparse
import json
import os
import re
import sys

import numpy as np
import yaml
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "data", "home-cards.yaml")
SCORES = os.path.join(ROOT, "data", "rank-scores.json")
SHEET = os.path.join(ROOT, os.pardir, "lab", "shots", "rank-pick", "sheet.png")

# 六档，从低到高。`cn` 用于报告与接触表（面向访客的中文名在 i18n/zh.toml），`hex` 是该档的框色
# —— 与 assets/css/decks/21-card-deck.css 的 `.home-card-rank--*` 是一套，改色要两处一起改。
TIERS = [
    ("collector", "收藏", "#b9bec7"),
    ("rare", "珍稀", "#84b795"),
    ("epic", "史诗", "#93aed8"),
    ("arcane", "秘藏", "#a08fca"),
    ("legend", "传世", "#c8a258"),
    ("miracle", "奇迹", "#d8b76a"),
]
TIER_ORDER = [t[0] for t in TIERS]
CN = {t[0]: t[1] for t in TIERS}
HEX = {t[0]: t[2] for t in TIERS}


def rgb(hex_color):
    return tuple(int(hex_color[i:i + 2], 16) for i in (1, 3, 5))

# 只在原档内部切：收藏 37 张里**分数最高的 13 张**升为珍稀；史诗 19 张里最高的 8 张升为秘藏。
# 切完是 收藏24 / 珍稀13 / 史诗11 / 秘藏8 / 传世6 / 奇迹1 = 63。
# 张数用常量而不是百分比：百分比会随加卡漂移，而「珍稀留几张」是设计决定，不该被数据量带着走。
TARGETS = {"collector": ("rare", 13), "epic": ("arcane", 8)}

# 三项权重。画面梯度占一半：它是「细节量」最直接的代理量；字节是它的同族但更糙（编码噪声、
# 大片渐变也占字节）；源图分辨率是天花板，只在官方大图上抬分，故最轻。
WEIGHTS = {"grad": 0.50, "bytes": 0.30, "src_px": 0.20}


def metrics(card):
    """一张卡的三项原始量。卡面不在就返回 None —— 缺图那条由 check-deck.mjs 拦。"""
    face = os.path.join(ROOT, "assets", card["image"])
    if not os.path.exists(face):
        return None
    # 先轻微高斯模糊再求梯度：不然 webp 的块效应会被当成「细节」，白送分给压得糙的图。
    with Image.open(face) as im:
        a = np.asarray(im.convert("L").filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32)
    gy, gx = np.gradient(a)
    grad = float(np.sqrt(gx * gx + gy * gy).mean())

    src = os.path.join(ROOT, card["src"])
    src_px = 0
    if os.path.exists(src):
        with Image.open(src) as s:
            src_px = s.width * s.height
    return {"grad": grad, "bytes": os.path.getsize(face), "src_px": src_px}


def pct_rank(values):
    """一列原始量 → 0~1 的百分位（并列取平均位次）。用百分位而不是 min-max：换一张图产生的
    极端值不该把其他 62 张全压到低分那一头。"""
    n = len(values)
    order = sorted(range(n), key=lambda i: values[i])
    out = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and values[order[j + 1]] == values[order[i]]:
            j += 1
        avg = (i + j) / 2 / max(1, n - 1)
        for k in range(i, j + 1):
            out[order[k]] = avg
        i = j + 1
    return out


def score_all(cards):
    raw = [metrics(c) for c in cards]
    live = [i for i, m in enumerate(raw) if m]
    if not live:
        sys.exit("✗ 一张卡面都没找到 —— 先跑 tools/cards/make-cards.py")
    cols = {k: {} for k in WEIGHTS}
    for key in WEIGHTS:
        col = [raw[i][key] for i in live]
        if key == "src_px":
            # 源图丢失时 src_px = 0，那是「不知道」而不是「最小」—— 直接算会让它白拿最低位次，
            # 所以先补成已知识的中位数再排名。
            known = [v for v in col if v > 0]
            if known:
                med = float(np.median(known))
                col = [v if v > 0 else med for v in col]
        for i, p in zip(live, pct_rank(col)):
            cols[key][i] = p
    out = []
    for i in range(len(cards)):
        if i not in cols["grad"]:
            out.append(None)
            continue
        sub = {k: cols[k][i] for k in WEIGHTS}
        out.append({**sub, "score": round(sum(WEIGHTS[k] * sub[k] for k in WEIGHTS) * 100, 2)})
    return out


def assign(cards, scores):
    """先按原档分组，再在组内按分数降序切。返回建议档列表（与 cards 同序）。"""
    suggested = [c["rank"] for c in cards]
    for src_rank, (dest, n_take) in TARGETS.items():
        idx = [i for i, c in enumerate(cards) if c["rank"] == src_rank]
        idx.sort(key=lambda i: (-scores[i]["score"], i))
        for i in idx[:n_take]:
            suggested[i] = dest
    return suggested


def tier_rows(cards, scores, suggested):
    """{档: [(分, 卡, 子分), …]}，每档内按分数降序。"""
    rows = {t: [] for t in TIER_ORDER}
    for c, s, sg in zip(cards, scores, suggested):
        rows[sg].append((s["score"], c, s))
    for t in rows:
        rows[t].sort(key=lambda r: -r[0])
    return rows


def report(cards, scores, suggested):
    rows = tier_rows(cards, scores, suggested)
    print("六档名单（分数 0~100；括号里是三项子分的百分位 梯度/字节/分辨率）\n")
    for t in TIER_ORDER:
        r = rows[t]
        if not r:
            print(f"— {CN[t]} {t}：0 张\n")
            continue
        print(f"— {CN[t]} {t}（{len(r)} 张，分数 {r[-1][0]:.1f}~{r[0][0]:.1f}）")
        for sc, c, s in r:
            mark = "←" if c["rank"] != t else " "
            print(f"   {sc:5.1f} {mark} {c['series']}·{c.get('name', '')}"
                  f"  [{c['style']}/{c['rank']}]  ({s['grad']:.2f}/{s['bytes']:.2f}/{s['src_px']:.2f})")
        print()

    # 相邻档的分数区间重叠：**只在原档内部切**的必然结果 —— 原来那 4 档本身在客观分上并不单调
    # （史诗里有分很低的、收藏里有分很高的），而传世/奇迹那 7 张是按设计挑的、不重排。
    # 所以这里不报「错误」，只报重叠有多大：观众看到的是**按档位给的观感**，客观分只决定了成员。
    print("相邻档的分数重叠（只报区间，不阻断）：")
    for lo, hi in zip(TIER_ORDER, TIER_ORDER[1:]):
        if not rows[lo] or not rows[hi]:
            continue
        lo_rng, hi_rng = (rows[lo][-1][0], rows[lo][0][0]), (rows[hi][-1][0], rows[hi][0][0])
        overlap = [sc for sc, _, _ in rows[lo] if sc > hi_rng[0]]
        note = f"，其中 {len(overlap)} 张高于{CN[hi]}最低分" if overlap else ""
        print(f"   {CN[lo]} {lo_rng[0]:.1f}~{lo_rng[1]:.1f}  ↗  {CN[hi]} {hi_rng[0]:.1f}~{hi_rng[1]:.1f}{note}")
    print()


def label_font(size=13):
    """中文标签必须换系统字体，否则汉字全变方框（PIL 默认位图字体没有中文字形）。"""
    for path in (r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf",
                 "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"):
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def sheet(cards, scores, suggested):
    # 13 列：当前的档容量刚好是 24/13/11/8/6/1，取 13 让最大的一档只折一次、其余各一行排完，
    # 不会出现「某档第 13 张单独占一行、右下角空一大块」。
    cols, tw, th, pad, lab, head = 13, 160, 224, 8, 20, 30
    cw, ch = tw + pad, th + lab + pad
    rows = tier_rows(cards, scores, suggested)
    n_rows = {t: max(1, (len(rows[t]) + cols - 1) // cols) for t in TIER_ORDER}
    img = Image.new("RGB", (cols * cw + pad, sum(n_rows[t] * ch + head for t in TIER_ORDER) + 44),
                    (26, 25, 31))
    d = ImageDraw.Draw(img)
    f, fh = label_font(13), label_font(16)
    d.text((pad, 10), "收藏卡六档定级（每档按分数降序；● = 本次改档，口径见 scripts/rank-deck.py）",
           fill=(232, 230, 238), font=fh)
    y = 44
    for t in TIER_ORDER:
        r = rows[t]
        span = f"分数 {r[-1][0]:.1f}~{r[0][0]:.1f}" if r else "—"
        d.rectangle([0, y, 4, y + head - 8], fill=rgb(HEX[t]))
        d.text((pad + 8, y + 4), f"{CN[t]} {t}   {len(r)} 张   {span}", fill=(240, 238, 245), font=fh)
        y += head
        for k, (sc, c, s) in enumerate(r):
            x, yy = pad + (k % cols) * cw, y + (k // cols) * ch
            face = os.path.join(ROOT, "assets", c["image"])
            try:
                with Image.open(face) as im:
                    img.paste(im.convert("RGB").resize((tw, th), Image.LANCZOS), (x, yy))
            except Exception:
                d.rectangle([x, yy, x + tw, yy + th], outline=(150, 70, 70))
            moved = c["rank"] != t
            d.text((x, yy + th + 2), f"{sc:.1f} {'●' if moved else ' '} {(c.get('name') or c['series'])[:7]}",
                   fill=(255, 208, 138) if moved else (196, 194, 204), font=f)
        y += n_rows[t] * ch
    os.makedirs(os.path.dirname(SHEET), exist_ok=True)
    img.save(SHEET)
    print("接触表", os.path.normpath(SHEET))


def apply_ranks(cards, suggested):
    """只改 `rank:` 那一行的值 —— 行尾注释、其余字段与行序一律不动。清单是单一事实源，
    手写过的取景注释（crop 那几行的「手量：…」）比新字段金贵。"""
    with open(MANIFEST, encoding="utf-8") as f:
        lines = f.read().splitlines()
    starts = [i for i, l in enumerate(lines) if l.startswith("- ")]
    bounds = list(zip(starts, starts[1:] + [len(lines)]))
    if len(bounds) != len(cards):
        sys.exit(f"✗ 行解析出 {len(bounds)} 条、YAML 里是 {len(cards)} 条 —— "
                 f"条目识别与 YAML 脱节了，先看 data/home-cards.yaml 的格式")
    out = list(lines)
    inserts = []
    changed = 0
    for (a, b), want in zip(bounds, suggested):
        hit = style_at = None
        for i in range(a, b):
            if hit is None and re.match(r"^\s+rank:", lines[i]):
                hit = i
            elif style_at is None and re.match(r"^\s+style:", lines[i]):
                style_at = i
        if hit is not None:
            val = lines[hit].split(":", 1)[1]
            tail = ""
            if " #" in val:                      # rank 行目前没有行尾注释，但别哪天加了就丢掉
                val, tail = val.split(" #", 1)
                tail = " #" + tail
            if val.strip() != want:
                out[hit] = f"  rank: {want}{tail}"
                changed += 1
        elif style_at is not None:               # 老清单里可能整条没有 rank（漏写会静默按收藏渲染）
            inserts.append((style_at + 1, f"  rank: {want}"))
            changed += 1
        else:
            sys.exit("✗ 有一条 entry 连 style 都没有，rank 不知道该插哪 —— 先跑 node scripts/check-deck.mjs")
    for at, text in sorted(inserts, reverse=True):
        out.insert(at, text)
    with open(MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    print(f"✓ {MANIFEST} 已更新：{changed} 行 rank 改动")
    return changed


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="把建议档写回 data/home-cards.yaml")
    ap.add_argument("--check", action="store_true", help="只报清单与建议的差异，不写任何文件")
    a = ap.parse_args()

    with open(MANIFEST, encoding="utf-8") as f:
        cards = yaml.safe_load(f)
    scores = score_all(cards)
    missing = [c["image"] for c, s in zip(cards, scores) if not s]
    if missing:
        sys.exit("✗ 这些卡面不在：" + "、".join(missing) + "（先跑 tools/cards/make-cards.py）")
    suggested = assign(cards, scores)

    if a.check:
        n = sum(1 for c, s in zip(cards, suggested) if c["rank"] != s)
        print(f"清单与建议档的差异：{n} 张")
        for c, s in zip(cards, suggested):
            if c["rank"] != s:
                print(f"   · {c['series']}·{c.get('name', '')}  {c['rank']} → {s}")
        return
    if a.apply:
        apply_ranks(cards, suggested)
        return

    report(cards, scores, suggested)
    with open(SCORES, "w", encoding="utf-8") as f:
        json.dump({
            "note": "由 scripts/rank-deck.py 生成；三项子分是百分位，score 是加权合成（0~100）。",
            "weights": WEIGHTS,
            "targets": {k: {"to": v[0], "take": v[1]} for k, v in TARGETS.items()},
            "cards": [{"image": c["image"], "series": c["series"], "name": c.get("name", ""),
                       "style": c["style"], "rank": c["rank"], "suggested": sg,
                       **{k: round(v, 4) for k, v in s.items()}}
                      for c, s, sg in zip(cards, scores, suggested)],
        }, f, ensure_ascii=False, indent=1)
    print("分数表", os.path.relpath(SCORES, ROOT))
    sheet(cards, scores, suggested)
    print(f"\n清单里 {sum(1 for c, s in zip(cards, suggested) if c['rank'] != s)} 张会改档"
          f"（--apply 写回；--check 只看差异）")


if __name__ == "__main__":
    main()
