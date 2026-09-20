#!/usr/bin/env python3
# 卡片源图的抓取与归一化：把 safebooru 上的候选按 post id 取回来，压到**长边 ≤700px**、
# WebP q88，落到 tools/cards/sources/<系列>-NN.webp，并打印可以直接粘进 data/home-cards.yaml 的骨架。
#
# 用法（与 make-cards.py 同一个解释器）：
#   C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/fetch-sources.py kafka 4601052 4596259 ...
#   C:/Users/15350/miniconda3/envs/ml/python.exe tools/cards/fetch-sources.py kafka 4601052 --force
#   ...fetch-sources.py ayaka 4702242 --long-edge 1400 --out-name ayaka-15   # 替换某一张已有的源图
#
# ---- 为什么长边是 700，以及**横构图为什么要给更大的值** ----
# 卡面主图 600×840，模板要 272（1x）与 544（2x）两档。取景默认 `crop: figure`，取到的是
# 「刚好装下人物」的 5:7 窗 —— 窗的**高度受源图高度限制**：
#   · 竖构图源图（多数）：长边 700 落在高度上，5:7 窗高 700 → 出 600×840 是 1.2 倍、
#     再出 544 那档是 0.78 倍，**2x 屏上仍是降采样**，700 够用。
#   · **横构图源图**：700 落在宽度上、高度只剩 400 左右，5:7 窗高 400 → 544 那档要放大 1.7 倍，
#     高分屏会软（2026-09-20 在 ayaka-15 上踩到：1759×1126 的横图压成 700×448，人像只占右半边）。
#     这类源图要给 `--long-edge 1400`（高度回到 800 上下），代价是文件大三四倍。
#   · 源图长边低于 540 时脚本会警告：那意味着 2x 档一定要靠放大凑。
# 横幅特写那种「本可以整张横着看」的画，也可以干脆用 `crop: [x0,y0,x1,y1]` 手量窗（见 data/home-cards.yaml）。
#
# ---- 为什么单独一个脚本 ----
# 这一步以前是手工的（上一轮 18 张绫华源图是手压的，没留下工具），于是「现有源图是怎么来的」
# 只存在于交接文档的散文里。压图这件事有明确口径（长边、质量、命名），值得钉成可复现的一步。
#
# 候选池怎么来的：lab/shots/revamp/pick-deck.py（抓标签、打分、拼接触表，产物全在 lab 里）。
# 这个脚本只负责「把挑中的那几张拿回来」。**它要联网**，所以不在 CI 里跑（与其它生成器同一约定）。
import argparse
import io
import json
import os
import re
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(ROOT, "tools", "cards", "sources")
UA = {"User-Agent": "Mozilla/5.0 (blog-asset-fetch; personal use)"}
LONG_EDGE = 700
QUALITY = 88
MIN_NATIVE = 540     # 长边低于它，2x 档就得放大（见文件头）


def api(tags):
    url = ("https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=1&tags=%s"
           % urllib.parse.quote_plus(tags))
    raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45).read()
    got = json.loads(raw) if raw else []
    return got[0] if got else None


def get(url):
    if url.startswith("//"):
        url = "https:" + url
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()


def next_index(series):
    """接着已有的号往下编（kafka-01、kafka-02…）：号是**按加入顺序**编的，别用 post id 当文件名 ——
    文件名要能直接看出这是本系列的第几张，清单里 image 与 src 的编号才读得顺。"""
    pat = re.compile(rf"^{re.escape(series)}-(\d+)\.webp$")
    used = [int(m.group(1)) for f in os.listdir(OUT_DIR) if (m := pat.match(f))]
    return (max(used) + 1) if used else 1


def main():
    ap = argparse.ArgumentParser(description="抓取并归一化卡片源图")
    ap.add_argument("series", help="系列前缀，决定文件名与 YAML 里的 series 字段（如 kafka）")
    ap.add_argument("ids", nargs="+", help="safebooru post id（pick-deck.py 接触表上标的那个）")
    ap.add_argument("--force", action="store_true", help="已存在也重下")
    ap.add_argument("--long-edge", type=int, default=LONG_EDGE,
                    help=f"归一化后的长边（默认 {LONG_EDGE}；横构图给 1400，见文件头）")
    ap.add_argument("--out-name", help="指定输出文件名（如 ayaka-15.webp），替换已有源图时用；只能配一个 id")
    args = ap.parse_args()

    if args.out_name and len(args.ids) != 1:
        raise SystemExit("--out-name 只能配一个 id（它的用途是替换某一张已有的源图）")

    os.makedirs(OUT_DIR, exist_ok=True)
    idx = next_index(args.series)
    stubs = []

    for pid in args.ids:
        name = args.out_name or f"{args.series}-{idx:02d}.webp"
        dest = os.path.join(OUT_DIR, name)
        if os.path.exists(dest) and not args.force:
            print(f"· {name} 已存在，跳过（要重下加 --force）")
            idx += 1
            continue
        post = api(f"id:{pid}")
        if not post:
            print(f"✗ id={pid} 查不到（下架了？）")
            continue
        url = post.get("file_url") or post.get("sample_url")
        try:
            im = Image.open(io.BytesIO(get(url)))
        except Exception as e:
            print(f"✗ id={pid} 下载失败：{type(e).__name__} {str(e)[:60]}")
            continue

        long_edge = max(im.size)
        im.thumbnail((args.long_edge, args.long_edge), Image.LANCZOS)
        im.convert("RGB").save(dest, "WEBP", quality=QUALITY, method=6)
        kb = os.path.getsize(dest) // 1024
        # 横构图警告：长边在宽度上时高度可能不足以撑满 2x 档（见文件头）
        short = min(im.size)
        warn = ""
        if short < MIN_NATIVE:
            warn = f"  ⚠ 短边只有 {short}px（< {MIN_NATIVE}），2x 档要靠放大 —— 横构图请给 --long-edge 1400"
        print(f"✓ {name}  {long_edge}px → {im.size[0]}x{im.size[1]}  {kb} KB  (id={pid}){warn}")

        stubs.append(
            f"- image: images/cards/{name}\n"
            f"  src: tools/cards/sources/{name}\n"
            f"  crop: figure\n"
            f"  series: {args.series}\n"
            f"  name: 「自己取名」\n"
            f"  style: 「自己选风格」\n"
            f"  credit: safebooru {pid}\n"
        )
        idx += 1
        time.sleep(1)     # 别把站点的接口打急

    if stubs:
        print("\n---- 粘进 data/home-cards.yaml 的骨架（name / style 逐张定）----")
        print("\n".join(stubs))


if __name__ == "__main__":
    main()
