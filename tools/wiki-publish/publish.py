#!/usr/bin/env python3
"""发布（publish）：把知识库里**已验证**的卡片发布到博客的数学库 / CS 库。

它是「外部项目 → 博客内容」这条路上的第二个生成器，与 tools/course-import/import_course.py
同级同形（那份把课程项目抽成数学库，这份把知识库发布的卡片写进两个库）。

用法：
  python tools/wiki-publish/publish.py --check    只比对不写盘，有差异退出 1（CI / 管理页体检用）
  python tools/wiki-publish/publish.py --dry-run  打印计划，不写盘
  python tools/wiki-publish/publish.py            落盘
  python tools/wiki-publish/publish.py --wiki <路径>   指定知识库根（默认见 DEFAULT_WIKI）

设计约束（改之前先读）：
  · **只增改带 `source: wiki` 标记的条目** —— 博客原有的 88 张卡（课程导入的 + 手写的）
    一个字节都不碰，所以它可以和 import_course.py 共存，互不覆盖。
  · **只发 `状态: 已验证` 的卡**。草稿与已核对不发 —— 发布出去是公开读物，而博客的公式是
    构建期 KaTeX（throwOnError=true），一处坏公式会让整站构建失败。
  · 归类取 curriculum.yaml 节点的 `分类`，key 必须在 _meta/分类.yaml 里，且与博客的
    data/<库>-branches.yaml 一致；三张表不一致直接报错退出（宁可挡住，也不要发到错分支）。
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    import yaml
except ImportError:
    sys.exit("✗ 需要 PyYAML：pip install pyyaml（或 uv pip install pyyaml）")

REPO = Path(__file__).resolve().parents[2]
DEFAULT_WIKI = Path(r"D:\projects\wiki\statml-wiki")

PUBLISHED_STATE = "已验证"
SOURCE_TAG = "wiki"

CARD_RE = re.compile(r"^(?P<node>.+)\.card\.md$")
NOTE_RE = re.compile(r"^(?P<node>.+)\.note\.md$")
FM_RE = re.compile(r"\A---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?", re.S)
WIKILINK_RE = re.compile(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]")
MATH_RE = re.compile(r"\$([^$]*)\$")


# --------------------------------------------------------------------------- #
# 读知识库
# --------------------------------------------------------------------------- #
def read_page(path: Path):
    text = path.read_text(encoding="utf-8", errors="replace")
    m = FM_RE.match(text)
    if not m:
        return {}, text
    meta = yaml.safe_load(m.group(1)) or {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, text[m.end():]


def section(body: str, name: str) -> str:
    """取 `## name` 这一节的内容（到下一个同级或更高级标题为止）。"""
    m = re.search(rf"^#+\s*{re.escape(name)}\s*$", body, re.M)
    if not m:
        return ""
    rest = body[m.end():]
    nxt = re.search(r"^#+\s", rest, re.M)
    return (rest[:nxt.start()] if nxt else rest).strip()


def load_wiki(root: Path):
    tax_file = root / "_meta" / "分类.yaml"
    if not tax_file.exists():
        sys.exit(f"✗ 找不到分类表 {tax_file}（初始化时应从 skill 的 assets/taxonomy.yaml 落盘）")
    taxonomy = yaml.safe_load(tax_file.read_text(encoding="utf-8")) or {}
    sections = {}
    for b in taxonomy.get("大类") or []:
        for s in b.get("细分") or []:
            sections[s["key"]] = {"branch": b["key"], "branch_name": b["名"],
                                  "section_name": s["名"], "lib": b.get("库")}

    cur = root / "maps" / "curriculum.yaml"
    if not cur.exists():
        sys.exit(f"✗ 找不到节点地图 {cur}")
    curriculum = yaml.safe_load(cur.read_text(encoding="utf-8")) or {}
    nodes, courses = {}, {}
    for c in curriculum.get("课程") or []:
        cid = str(c.get("标识") or "")
        courses[cid] = str(c.get("标题") or cid)
        for n in c.get("节点") or []:
            nid = str(n.get("标识") or "")
            if nid:
                nodes[nid] = {**n, "课程": cid, "课程标题": courses[cid], "标识": nid}

    cards, notes = {}, {}
    wiki_dir = root / "wiki"
    if wiki_dir.exists():
        for p in sorted(wiki_dir.rglob("*.md")):
            m = CARD_RE.match(p.name)
            if m:
                cards[m.group("node")] = p
                continue
            m = NOTE_RE.match(p.name)
            if m:
                notes[m.group("node")] = p
    return sections, nodes, courses, cards, notes


# --------------------------------------------------------------------------- #
# 读博客
# --------------------------------------------------------------------------- #
def load_libraries() -> dict:
    cfg = yaml.safe_load((REPO / "data" / "libraries.yaml").read_text(encoding="utf-8")) or {}
    return {lib["key"]: lib for lib in cfg.get("libraries") or []}


def load_blog_branches(lib_key: str) -> dict:
    p = REPO / "data" / f"{lib_key}-branches.yaml"
    if not p.exists():
        return {}
    cfg = yaml.safe_load(p.read_text(encoding="utf-8")) or {}
    return {b["key"]: {**b, "sections": {s["key"]: s for s in b.get("sections") or []}}
            for b in cfg.get("branches") or []}


def check_tables(sections: dict, libs: dict, blog: dict) -> list[str]:
    """三张表必须同树：wiki 分类表 vs 博客 data/<库>-branches.yaml。"""
    problems = []
    for lib_key, tree in blog.items():
        mine = {k: v for k, v in sections.items() if v["lib"] == lib_key}
        if not mine and lib_key not in {v["lib"] for v in sections.values()}:
            continue
        for skey, info in mine.items():
            bkey = info["branch"]
            if bkey not in tree:
                problems.append(f"wiki 分类表的大类 {bkey} 不在 data/{lib_key}-branches.yaml 里")
                continue
            if skey not in tree[bkey]["sections"]:
                problems.append(f"wiki 分类表的细分 {skey} 不在 {lib_key}.{bkey} 里")
                continue
            blog_name = tree[bkey]["sections"][skey].get("name")
            if blog_name != info["section_name"]:
                problems.append(f"{skey} 的名字不一致：wiki={info['section_name']!r} 博客={blog_name!r}")
            if tree[bkey].get("name") != info["branch_name"]:
                problems.append(f"{bkey} 的名字不一致：wiki={info['branch_name']!r} 博客={tree[bkey].get('name')!r}")
    return problems


# --------------------------------------------------------------------------- #
# 组装卡片
# --------------------------------------------------------------------------- #
def plain(text: str) -> str:
    """标题降级成纯文本（与 gen-cards.mjs / import_course.py 同规则）。"""
    stripped = re.sub(r"\s{2,}", " ", MATH_RE.sub(lambda m: "" if "\\" in m.group(1) else m.group(1), text)).strip()
    return stripped if stripped and "\\" not in stripped else ""


def join_blocks(*blocks: str) -> str:
    return "\n\n".join(b.strip() for b in blocks if b and b.strip())


def rewrite_links(text: str, published: dict, titles: dict) -> tuple[str, list[str]]:
    """[[节点id]] / [[节点id|文字]] → 博客的 {{< card "标题" >}}。

    目标没在本次发布集合里就退化成**节点的标题**（纯文本），并记一条提醒 —— 留着 `[[…]]`
    会在页面上原样露出中括号。
    """
    missing = []

    def repl(m: re.Match) -> str:
        target, label = m.group(1).strip(), (m.group(2) or "").strip()
        card = published.get(target)
        if not card:
            missing.append(target)
            return label or titles.get(target, target)
        name = card["title"]
        if label:
            return '{{< card "%s" "%s" >}}' % (name, label)
        return '{{< card "%s" >}}' % name

    return WIKILINK_RE.sub(repl, text), missing


def build_entries(wiki_root: Path):
    sections, nodes, courses, card_files, note_files = load_wiki(wiki_root)
    libs = load_libraries()
    blog = {k: load_blog_branches(k) for k in libs}

    problems = check_tables(sections, libs, blog)

    # 第一遍：找出所有可发布的卡（只收 已验证）
    ready, skipped = {}, []
    for nid, path in sorted(card_files.items()):
        meta, body = read_page(path)
        if str(meta.get("状态") or "").strip() != PUBLISHED_STATE:
            skipped.append((nid, str(meta.get("状态") or "草稿")))
            continue
        node = nodes.get(nid)
        if node is None:
            problems.append(f"{nid}：已发布状态，但节点不在 maps/curriculum.yaml 里")
            continue
        info = sections.get(str((node.get("分类") or {}).get("细分") or "").strip())
        if info is None:
            problems.append(f"{nid}：节点的 `分类` 缺失或细分 key 不在分类表里")
            continue
        ready[nid] = {
            "node": node, "info": info, "meta": meta, "body": body,
            "note": note_files.get(nid), "path": path,
        }

    # 第二遍：建标题表供改写链接（未发布的引用退化成节点的标题）
    published = {nid: {"title": str(r["meta"].get("标题") or nid)} for nid, r in ready.items()}
    titles = {nid: str(n.get("标题") or nid) for nid, n in nodes.items()}

    entries, warnings = [], []
    for nid, r in ready.items():
        meta, body, info = r["meta"], r["body"], r["info"]
        note_body = ""
        if r["note"]:
            _, note_body = read_page(r["note"])

        kind = str(meta.get("陈述称谓") or meta.get("类型") or "定理").strip()
        # 卡的「链接」段也并进 body：那里的 [[…]] 正是要变成博客的行内卡片引用
        raw_body = join_blocks(section(body, "陈述"), section(body, "例"), section(body, "链接"))
        raw_usage = section(note_body, "动机与定位")
        raw_proof = section(note_body, "证明")
        raw_note = section(note_body, "边界与易错")

        parts = {}
        for key, raw in (("body", raw_body), ("usage", raw_usage),
                         ("proof", raw_proof), ("note", raw_note)):
            text, missing = rewrite_links(raw, published, titles)
            parts[key] = text
            for m in missing:
                warnings.append(f"{nid}：{key} 引用了未发布的节点 {m}，已退化成纯文本")

        title = str(meta.get("标题") or nid)
        aliases = [nid]
        if plain(title) and plain(title) != title:
            aliases.append(plain(title))
        for a in (meta.get("别名") or []):
            aliases.append(str(a))
        aliases = [a for i, a in enumerate(aliases) if a and a not in aliases[:i]]

        entry = {
            "id": nid,
            "kind": kind,
            "title": title,
            "aliases": aliases,
            "body": parts["body"],
            "usage": parts["usage"],
            "proof": parts["proof"],
            "note": parts["note"],
            "section": str((r["node"].get("分类") or {}).get("细分")),
            "branch": info["branch"],
            "source": SOURCE_TAG,
        }
        # `course` 只有数学库用（它靠这个字段找卡片页所在的工具箱）；CS 库没有课程维度
        if not libs.get(info["lib"], {}).get("cards"):
            entry["course"] = r["node"]["课程"]
        if not parts["body"]:
            warnings.append(f"{nid}：卡里没有可发布的 `## 陈述`，body 会是空的")
        entries.append(entry)

    return {
        "entries": entries, "skipped": skipped, "problems": problems,
        "warnings": warnings, "libs": libs, "sections": sections, "nodes": nodes,
    }


# --------------------------------------------------------------------------- #
# 写盘
# --------------------------------------------------------------------------- #
def card_page_md(card: dict, weight: int, date_str: str, lib_key: str, lib: dict) -> str:
    """卡片页 front matter。**两个库的格式不同，且都不是随便定的：**

    · CS 库：CI 里有 `node scripts/gen-cards.mjs cs --check`，它会把每张卡页与 JSON 逐字比对。
      所以发布器必须写出**与 gen-cards.mjs 完全一致**的文本（含那两行注释）—— 否则本地全绿、
      CI 炸。命名空间里的 title 规则（含省略编号的容错）也要与它同步。
    · 数学库：card 页由 import_course.py 生成，而发布不重跑它，所以这里自己写；
      CI 不校验数学卡页，格式沿用同一套骨架、注释改为指向本脚本。

    两个库的卡都没有课程章节号（`num`），所以标题里省略它 —— 与 gen-cards.mjs 的
    `[kind, num].filter(Boolean).join(' ')` 同规则。
    """
    name = plain(card["title"])
    suffix = " ".join(x for x in (card.get("kind", ""), str(card.get("num") or "")) if x)
    title = f"{name}（{suffix}）" if name else suffix
    title_json = json.dumps(title, ensure_ascii=False)

    if lib.get("cards"):
        head = (f"# 卡片页：由 scripts/gen-cards.mjs 从 data/{lib['data']}.json 生成，勿手改。\n"
                f"# 卡片内容在 data/{lib['data']}.json，模板是 layouts/courses/toolcard.html。\n")
    else:
        head = ("# 工具库卡片页：由 tools/wiki-publish/publish.py 从知识库发布，勿手改。\n"
                f"# 卡片内容在 data/{lib['data']}.json，模板是 layouts/courses/toolcard.html。\n")

    return (
        "---\n" + head
        + f"title: {title_json}\n"
        'layout: "toolcard"\n'
        f"date: {date_str}\n"
        "draft: false\n"
        f"weight: {weight}\n"
        "sitemap:\n"
        "  disable: true\n"
        "searchHidden: true\n"
        "---\n"
    )


TOOLBOX_PAGE = """---
# 课程工具箱入口（由 tools/wiki-publish/publish.py 补建）。
# 数学库的卡片页 URL 是 /courses/<课程>/toolbox/<id>/ —— 没有这个入口页，
# layouts/_partials/card-ref.html 会退回「全站第一个 layout: tools 的页面」，
# 于是卡片的链接指向别的课程的工具箱，点开 404。
layout: "tools"
title: "数学工具库"
description: "本科目用到的定理、定义与命题卡，可检索。"
cascade:
  - tags: []
    categories: []
    hiddenInRss: true
    comments: false
    math: true
outputs: ["HTML"]
---
"""


def plan_writes(result: dict) -> list[tuple[Path, str, str]]:
    """返回 [(路径, 内容, 说明)]。"""
    writes = []
    for lib_key, lib in sorted(result["libs"].items()):
        mine = [e for e in result["entries"] if result["sections"][e["section"]]["lib"] == lib_key]
        if not mine:
            continue
        json_path = REPO / "data" / f"{lib['data']}.json"
        data = json.loads(json_path.read_text(encoding="utf-8"))
        others = [c for c in data.get("cards") or [] if c.get("source") != SOURCE_TAG]
        merged = others + mine
        new_data = dict(data)
        new_data["cards"] = merged
        writes.append((json_path, json.dumps(new_data, ensure_ascii=False, indent=2) + "\n",
                       f"{lib_key}：{len(mine)} 张 wiki 卡（原有 {len(others)} 张保留）"))

        today = date.today().isoformat()
        for i, card in enumerate(mine, 1):
            # 权重排在原有卡片之后（gen-cards.mjs 用的是「在合并后数组里的下标 + 1」）
            weight = len(others) + i
            if lib.get("cards"):
                page = REPO / "content" / lib["cards"].strip("/") / card["id"] / "index.md"
            else:
                page = (REPO / "content" / "courses" / card["course"] / "toolbox"
                        / card["id"] / "index.md")
                # 数学卡的 URL 是 /courses/<课程>/toolbox/<id>/，得先有工具箱入口页，
                # 否则 card-ref.html 会退回「全站第一个 layout: tools 的页面」→ 链接指向别处 → 404
                tb = REPO / "content" / "courses" / card["course"] / "toolbox" / "_index.md"
                if not tb.exists():
                    writes.append((tb, TOOLBOX_PAGE, f"补建工具箱入口页（{card['course']}）"))
            # 沿用已存在页面的日期，重复发布不会天天改日期（与 gen-cards.mjs 同规则）
            existing = page.read_text(encoding="utf-8") if page.exists() else ""
            m = re.search(r"^date:\s*(\S+)\s*$", existing, re.M)
            writes.append((page, card_page_md(card, weight, m.group(1) if m else today, lib_key, lib),
                           f"卡片页 {card['id']} → /{lib_key}/…"))
    return writes


def write_lf(path: Path, text: str) -> None:
    """一律以 LF 写盘。

    必须显式指定：Python 在 Windows 上默认把 `\\n` 翻译成 `\\r\\n`，而仓库里
    `scripts/gen-cards.mjs cs --check` 是**逐字节**比对卡片页的 —— 写出 CRLF 会让本地全绿、
    CI 炸（"卡片页与数据不一致"，但肉眼看不出差别）。仓库本身的约定也是 LF（见 .gitattributes）。
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


def main() -> int:
    ap = argparse.ArgumentParser(description="发布：知识库 → 博客数学库 / CS 库")
    ap.add_argument("--wiki", default=str(DEFAULT_WIKI), help="知识库根目录")
    ap.add_argument("--check", action="store_true", help="只比对不写盘，有差异退出 1")
    ap.add_argument("--dry-run", action="store_true", help="打印计划，不写盘")
    args = ap.parse_args()

    root = Path(args.wiki)
    if not root.exists():
        sys.exit(f"✗ 知识库不存在：{root}")

    result = build_entries(root)

    print(f"=== 发布检查：{root} → {REPO}")
    print(f"  可发布（状态 {PUBLISHED_STATE}）：{len(result['entries'])} 张")
    if result["skipped"]:
        by_state = {}
        for nid, st in result["skipped"]:
            by_state.setdefault(st, []).append(nid)
        for st, ids in sorted(by_state.items()):
            print(f"  不发（{st}）：{len(ids)} 张")

    for w in result["warnings"]:
        print(f"  ⚠ {w}")

    if result["problems"]:
        print("\n✗ 有问题，已停止（不会写盘）：")
        for p in result["problems"]:
            print(f"  ✗ {p}")
        return 1

    writes = plan_writes(result)
    if not writes:
        print("\n没有要发布的内容（可发布的卡为 0，或都已同步）。")
        return 0

    changed, unchanged = [], []
    for path, text, why in writes:
        current = path.read_text(encoding="utf-8") if path.exists() else None
        (changed if current != text else unchanged).append((path, text, why))

    print(f"\n计划：{len(changed)} 个文件会变，{len(unchanged)} 个已一致")
    for path, _, why in changed:
        print(f"  · {path.relative_to(REPO).as_posix()}  —— {why}")

    if args.check:
        if changed:
            print(f"\n✗ 有 {len(changed)} 处待发布。跑 python tools/wiki-publish/publish.py 落盘。")
            return 1
        print("\n✓ 博客与知识库已同步。")
        return 0

    if args.dry_run:
        print("\n（--dry-run，未写盘）")
        return 0

    for path, text, _ in changed:
        write_lf(path, text)
    print(f"\n✓ 已写入 {len(changed)} 个文件。")
    print("  接着必须跑博客的校验（公式是构建期 KaTeX，坏一处会让整站构建失败）：")
    print("    node scripts/check-math-katex.mjs && hugo --minify --gc --cleanDestinationDir")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
