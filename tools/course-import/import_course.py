#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「回归分析」课程项目的 Markdown 导入博客，并生成「数学工具库」数据。

用法（在仓库根执行）：
    python tools/course-import/import_course.py            # 生成 / 更新内容与数据
    python tools/course-import/import_course.py --check    # 只比对，与源不一致时退出码 1（CI 用）
    python tools/course-import/import_course.py --dry-run  # 只打印将要改动的文件

唯一事实源是**课程项目目录**（默认 D:\\1.Study\\course\\回归分析，可用 --project 覆盖）：

  - 笔记 / 作业 / 实验的 Markdown  ──▶ content/courses/regression-analysis/<chapter>/<material>/index.md 的**正文**
  - 工具/00_数学工具.md 的条目      ──▶ data/math-toolbox.json（工具卡）
  - 笔记里的定理 / 命题 / 推论 / 定义块 ──▶ data/math-toolbox.json（课程定理卡）
  - 实验的 figs/*.png              ──▶ 同名材料页 bundle 下

front matter 不归本脚本管：材料页骨架由 scripts/new-content.sh 生成，脚本只替换正文；
data/math-toolbox.json 是纯数据文件。**不要在博客里手改这些产物**——下次导入会覆盖。
改内容请改课程项目里的源文件，然后重跑本脚本。
"""
from __future__ import annotations

import argparse
import datetime
import json
import re
import shutil
import sys
from pathlib import Path

try:
    import yaml  # 读 data/math-branches.yaml；CI 不跑导入，只有本地需要
except ImportError:  # pragma: no cover
    yaml = None

REPO = Path(__file__).resolve().parents[2]
DEFAULT_PROJECT = Path(r"D:\1.Study\course\回归分析")
COURSE = "regression-analysis"

# 模块 → 博客章节目录 / 材料页目录 / 源文件
MODULES = [
    {
        "module": "M1",
        "chapter": "chapter-01",
        # 一篇笔记拆成多页：单页 1575 行、2500 多个数学区渲染出来约 2.5 MB，
        # 超过 scripts/report-size.sh 的单页预算；按 § 号切在自然边界上（split_notes
        # 只保留 first..last 之间的 § 小节），每页回到 1 MB 以内。
        "notes": [
            {"src": "笔记/M1_简单线性回归.md", "dir": "notes", "first": 1, "last": 6},
            {"src": "笔记/M1_简单线性回归.md", "dir": "notes-02", "first": 7, "last": 11},
            {"src": "笔记/M1_简单线性回归.md", "dir": "notes-03", "first": 12, "last": 999},
        ],
        "homework": ("作业/M1_习题选解.md", "homework"),
        "labs": [("实验/REG_Lab02/笔记.md", "lab", "实验/REG_Lab02/figs")],
    },
]

# 工具库引用纪律：正文只写结论的名字（「由全方差律」「见 Fisher 引理」），
# 不写「工具 k.m」这类编号——编号只在卡片角落出现。这个正则是「旧写法残留」的探测器。
STRAY_TOOL_REF = re.compile(r"【工具\s*(\d+)\.(\d+)】")
TOOL_HEAD = re.compile(r"^###\s+(\S.*?)\s*\{#((?:tool|thm)-[0-9-]+)\}\s*$")
ALIAS_RE = re.compile(r"^<!--\s*别名\s*[:：]\s*(.+?)\s*-->\s*$")
KIND_PRIMARY = ("定义", "定理", "命题", "引理", "推论", "性质")
KIND_FALLBACK = ("设定", "注", "注意", "例")
THM_HEAD = re.compile(
    r"^\*\*(定理|命题|推论|引理|定义|性质)\s*([0-9]+(?:\.[0-9]+)*)?\s*(?:（([^）]*)）)?\*\*\s*"
)
TOOL_JSON = REPO / "data" / "math-toolbox.json"
# 数学库（/library/）的分支体系：卡片 → 数学分支的归属规则（改这里，不改生成产物）
BRANCHES_FILE = REPO / "data" / "math-branches.yaml"

FM_RE = re.compile(r"\A---\r?\n.*?\r?\n---\r?\n", re.S)


# --------------------------------------------------------------------------- #
# 通用工具
# --------------------------------------------------------------------------- #
def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")


SEC_HEAD = re.compile(r"^##\s+§\s*(\d+)")


def split_notes(text: str, first: int, last: int) -> str:
    """只保留 `## §first` 到 `## §last` 之间的小节（理由见 MODULES["notes"]）。

    切分点是二级标题；没有 § 号的二级标题（附录）**归到最后一组**（`last >= 999`），
    否则附录会被静默丢掉——页面的 description 里写着「附…索引与陷阱清单」，
    正文里却没有，两边对不上（2026-09-15 修）。
    """
    keep: list[str] = []
    taking = False
    for ln in text.split("\n"):
        if ln.startswith("## "):
            m = SEC_HEAD.match(ln)
            if m:
                taking = first <= int(m.group(1)) <= last
            else:
                taking = last >= 999
        if taking:
            keep.append(ln)
    body = "\n".join(keep).strip()
    if not body:
        raise SystemExit("✗ split_notes：§%d–§%d 之间没有内容，检查源文件的二级标题格式" % (first, last))
    return body + "\n"


def clean_body(text: str, *, drop_h1: bool = True) -> str:
    """把课程项目的 Markdown 正文整理成博客正文：去 BOM、统一换行、去行尾空白。"""
    text = read_text_text(text)
    lines = text.split("\n")
    while lines and not lines[0].strip():
        lines.pop(0)
    if drop_h1 and lines and lines[0].startswith("# "):
        lines.pop(0)
    lines = [ln.rstrip() for ln in lines]
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines) + "\n"


def read_text_text(text: str) -> str:
    return text.replace("\ufeff", "").replace("\r\n", "\n").replace("\r", "\n")


def first_kind(*texts: str) -> str:
    """卡片的第一类别标签：优先 定义/定理/命题/…，其次 设定/注，都没有就叫「结论」。"""
    tags: list[str] = []
    for text in texts:
        for m in re.finditer(r"^\*\*([^*（(]{1,8})", text or "", re.M):
            tags.append(m.group(1).strip())
    for tag in tags:
        if tag in KIND_PRIMARY:
            return tag
    for tag in tags:
        if tag in KIND_FALLBACK:
            return "注" if tag.startswith("注") else tag
    return "结论"


def build_name_table(cards: list) -> list:
    """结论名字 → 卡片的名字表：条目标题 + 它下面的 `<!-- 别名: … -->`。

    长的排在前面，替换时先命中长名字（「幂等二次型与卡方分布」不会被「卡方分布」抢走）。
    名字里带公式的不收：链接文字是纯文本，KaTeX 不会渲染它。
    """
    pairs = []
    for card in cards:
        for name in [card.get("title", "")] + list(card.get("aliases") or []):
            name = (name or "").strip()
            if name and "$" not in name:
                pairs.append((name, card))
    pairs.sort(key=lambda item: len(item[0]), reverse=True)
    return pairs


# 这些区域里的名字一律不接链接：代码块、行内代码、数学区、既有链接、HTML 标签、
# 裸 URL、已有短代码，以及**标题行**。
# 标题必须排除：链接写进 `## §15 极大似然估计` 这种标题里，会顺着 .TableOfContents
# 变成目录里的一串 HAHAHUGOSHORTCODE 占位符，也会污染锚点文本。
# 少一个链接的代价远小于改坏一个公式或一个标题。
SKIP_ZONE = re.compile(
    r"```.*?```|~~~.*?~~~|`[^`\n]*`|\$\$.*?\$\$|\$[^$\n]*\$"      # 代码块、行内代码、数学区
    r"|^#{1,6}\s[^\n]*"                                             # 标题行
    r"|\[[^\]\n]*\]\([^)\n]*\)|<[^>\n]*>|https?://\S+|\{\{[<%].*?[>%]\}\}",
    re.S | re.M,
)


def link_names(text: str, table: list, form: str, *, self_id: str = "") -> str:
    """把出现过的结论名字换成引用。

    form="shortcode" —— 课程正文：{{< tool "1.9" "全方差律" >}}，构建期渲染成可点击的链接，
    点了就地展开卡片。form="card" —— 卡片内容：Markdown 链接 [名字](#card-tool-1-9)，
    由 toolbox-md.html 再改写成目标卡片页地址。

    卡片不引用自己（self_id 命中时保持纯文本）。
    """
    if not text or not table:
        return text
    lookup = {}
    for name, card in table:
        lookup.setdefault(name, card)
    pattern = re.compile("|".join(re.escape(name) for name in lookup))

    def repl(m: re.Match) -> str:
        name = m.group(0)
        card = lookup[name]
        if self_id and card["id"] == self_id:
            return name
        if form == "card":
            return "[%s](#%s)" % (name, "card-" + card["id"])
        return '{{< tool "%s" "%s" >}}' % (card["num"], name)

    out, pos = [], 0
    for zone in SKIP_ZONE.finditer(text):
        out.append(pattern.sub(repl, text[pos:zone.start()]))
        out.append(zone.group(0))
        pos = zone.end()
    out.append(pattern.sub(repl, text[pos:]))
    return "".join(out)


def write_page_body(path: Path, body: str) -> str:
    """只替换 index.md 的正文，front matter 原样保留。返回改动类型描述。"""
    if not path.exists():
        raise SystemExit("✗ 找不到 %s —— 先用 scripts/new-content.sh 建好骨架" % path)
    old = read_text(path)
    m = FM_RE.match(old)
    if not m:
        raise SystemExit("✗ %s 没有 front matter" % path)
    new = old[: m.end()] + "\n" + body
    order = "unchanged" if new == old else "changed"
    return order, new


# --------------------------------------------------------------------------- #
# 工具卡 / 定理卡抽取
# --------------------------------------------------------------------------- #
def split_blocks(content: str) -> list[str]:
    """按空行切段（Markdown 的段落单位）。"""
    parts, buf = [], []
    for ln in content.split("\n"):
        if ln.strip():
            buf.append(ln)
        elif buf:
            parts.append("\n".join(buf).strip())
            buf = []
    if buf:
        parts.append("\n".join(buf).strip())
    return parts


def head_tag(par: str) -> str:
    m = re.match(r"^\*\*([^*]{1,60})\*\*", par)
    return m.group(1).strip() if m else ""


# 这些段首标签仍属于卡片内部（证明 / 陈述 / 用途 / 注）
CARD_HEAD_KEEP = ("证明", "命题", "定义", "推论", "引理", "性质", "用途", "注", "注意", "设定", "例")


def is_card_end_head(par: str) -> bool:
    """段首加粗但不是卡片内部标签 —— 属于正文的下一节，卡片到此为止。

    例：`**这个证明值得记住的三点**`、`**结论的强度分级**` 不是定理本身的内容。
    """
    tag = head_tag(par)
    return bool(tag) and not tag.startswith(CARD_HEAD_KEEP)


def assemble(parts: list[str]) -> dict:
    """按**原有顺序**切分：body → proof → usage → note（顺序切分，不重排段落）。"""
    out = {"body": [], "proof": [], "usage": [], "note": []}
    mode = "body"
    for par in parts:
        tag = head_tag(par)
        if tag.startswith("证明"):
            mode = "proof"
        elif tag.startswith("用途"):
            mode = "usage"
        elif tag.startswith("注") or tag.startswith("注意"):
            mode = "note"
        out[mode].append(par)
    return {k: ("\n\n".join(v).strip() if v else "") for k, v in out.items()}


def parse_tool_file(path: Path) -> tuple[list[dict], list[dict]]:
    """解析 工具/00_数学工具.md：返回 (分组, 卡片)。

    条目形态：

        ### 全期望律与全方差律 {#tool-1-2}
        <!-- 别名: 全期望律、全方差律 -->

    标题就是结论的名字（正文里直接写它，导入时按名字接上链接）；{#tool-1-2} 是稳定 id，
    卡片上只以角落小字 1.2 出现；别名给正文用更短的叫法（如「全方差律」）。
    """
    groups, cards = [], []
    cur: dict | None = None
    buf: list[str] = []

    def flush() -> None:
        nonlocal cur, buf
        if cur is not None:
            content = "\n".join(buf).strip()
            content = re.sub(r"\n+---+\s*$", "", content).strip()
            card = dict(cur)
            card.update(assemble(split_blocks(content)))
            # 名字接线在 build_toolbox 里统一做：那时才拿得到完整的名字表
            card["kind"] = card["kind"] or first_kind(card["body"], card["proof"], card["usage"], card["note"])
            cards.append(card)
        cur, buf = None, []

    for ln in read_text(path).split("\n"):
        m_group = re.match(r"^##\s+(\d+)\s+(.*)$", ln)
        m_card = TOOL_HEAD.match(ln)
        m_alias = ALIAS_RE.match(ln)
        m_sub = re.match(r"^###\s+", ln)
        if m_group:
            flush()
            groups.append({"key": m_group.group(1), "name": m_group.group(2).strip(), "kind": "tool"})
            continue
        if m_card and m_card.group(2).startswith("tool-"):
            flush()
            _, k, n = m_card.group(2).split("-")
            cur = {
                "id": m_card.group(2),
                "num": "%s.%s" % (k, n),
                "label": "%s.%s" % (k, n),
                "kind": "",
                "title": m_card.group(1).strip(),
                "aliases": [],
                "group": k,
            }
            continue
        if m_alias and cur is not None:
            cur["aliases"] = [a.strip() for a in re.split(r"[、,，]", m_alias.group(1)) if a.strip()]
            continue
        if m_sub and cur is not None:
            flush()
            continue
        if cur is not None:
            buf.append(ln)
    flush()
    return groups, cards


def parse_note_theorems(path: Path, module: str, chapter: str, material: str) -> tuple[list[dict], list[dict]]:
    """解析笔记里的 定理/命题/推论/引理/定义 块（带编号的才收）。"""
    cards: list[dict] = []
    lines = read_text(path).split("\n")
    i, n = 0, len(lines)
    while i < n:
        m = THM_HEAD.match(lines[i])
        if not m or not m.group(2):
            i += 1
            continue
        kind, num, title = m.group(1), m.group(2), (m.group(3) or "").strip()
        head_rest = THM_HEAD.sub("", lines[i]).strip()
        buf: list[str] = [head_rest] if head_rest else []
        parts: list[str] = []

        def flush_part() -> None:
            if buf:
                parts.append("\n".join(buf).strip())
                buf.clear()

        j = i + 1
        while j < n:
            ln = lines[j]
            if THM_HEAD.match(ln) or re.match(r"^#{1,4}\s", ln) or re.match(r"^-{3,}\s*$", ln):
                break
            if not ln.strip():
                flush_part()
                j += 1
                continue
            # 段首出现「非卡片标签」的加粗行 → 卡片结束（该段属于正文的下一节）
            if not buf and is_card_end_head(ln):
                break
            buf.append(ln)
            j += 1
        flush_part()
        if parts:
            card = {
                "id": "thm-%s" % num.replace(".", "-"),
                "num": num,
                "label": "%s %s" % (kind, num),
                "kind": kind,
                "title": title,
                "group": module,
                "material": material,
            }
            card.update(assemble(parts))
            cards.append(card)
        i = j
    groups = [{"key": module, "name": "%s 的定理与定义" % module, "kind": "course"}]
    return groups, cards


def load_branches(path: Path) -> dict:
    """读数学库的分支表（data/math-branches.yaml）：大类 → 细分 + 卡片归属规则。

    校验在这里一次做足：细分 key 会进生成产物、被模板当锚点用，重复或悬空都会在页面里
    变成静默的错误分组，所以宁可导入时就把错误喊出来。
    """
    if yaml is None:
        raise SystemExit("✗ 读 %s 需要 PyYAML（pip install pyyaml）" % path)
    if not path.exists():
        raise SystemExit("✗ 找不到分支表 %s" % path)
    cfg = yaml.safe_load(read_text(path)) or {}
    branches = cfg.get("branches") or []
    if not branches:
        raise SystemExit("✗ %s 里没有 branches" % path)
    section_parent: dict[str, str] = {}
    for b in branches:
        key = b.get("key")
        if not key:
            raise SystemExit("✗ %s 有分支缺 key" % path)
        sections = b.get("sections") or []
        if not sections:
            raise SystemExit("✗ %s 的分支 %s 没有 sections（细分）" % (path, key))
        for s in sections:
            skey = s.get("key")
            if not skey:
                raise SystemExit("✗ %s 的分支 %s 有细分缺 key" % (path, key))
            if skey in section_parent:
                raise SystemExit("✗ %s 的细分 key %s 重复" % (path, skey))
            section_parent[skey] = key
    keys = [b["key"] for b in branches]
    if len(set(keys)) != len(keys):
        raise SystemExit("✗ %s 的分支 key 有重复" % path)
    if cfg.get("default") not in section_parent:
        raise SystemExit("✗ %s 的 default=%s 不是任何细分" % (path, cfg.get("default")))
    for table, mapping in (cfg.get("assign") or {}).items():
        if table not in SECTION_LOOKUPS:
            raise SystemExit("✗ %s 的 assign.%s 不是可用维度（%s）" % (path, table, "/".join(SECTION_LOOKUPS)))
        for value, hit in (mapping or {}).items():
            if hit not in section_parent:
                raise SystemExit("✗ %s 的 assign.%s.%s=%s 不是任何细分" % (path, table, value, hit))
    cfg["section_parent"] = section_parent
    return cfg


# 归属规则的匹配顺序：细 → 粗。groups 与 modules 都查 card["group"]，
# 但工具卡的分组号（"1"–"6"）与课程定理卡的模块号（"M1"）不会互相命中，所以共用一个字段。
SECTION_LOOKUPS = ("cards", "nums", "groups", "modules", "courses")


def card_section_key(card: dict, table: str):
    """按维度取查表用的值：卡片 id / 节号（thm-<节>-<序> 的 <节>）/ 分组号 / 课程。"""
    if table == "cards":
        return card.get("id")
    if table == "nums":
        parts = card.get("id", "").split("-")
        return parts[1] if card.get("id", "").startswith("thm-") and len(parts) > 2 else None
    if table == "courses":
        return card.get("course")
    return card.get("group")


def section_of(card: dict, cfg: dict) -> str:
    """卡片 → 细分 key：cards > nums > groups > modules > courses > default。"""
    assign = cfg.get("assign") or {}
    for table in SECTION_LOOKUPS:
        hit = (assign.get(table) or {}).get(card_section_key(card, table))
        if hit:
            return hit
    return cfg["default"]


def build_toolbox(project: Path, cfg: dict) -> tuple[dict, list]:
    """生成 data/math-toolbox.json 的内容：(卡片 + 分组 + 分支, 名字表)。

    两遍：先把工具卡与课程定理卡解析出来，用条目的标题/别名建名字表，
    再给所有卡片的正文按名字接上引用（卡片互引，不引用自己）。
    """
    groups: list[dict] = []
    tool_cards: list[dict] = []
    thm_cards: list[dict] = []
    tool_file = project / "工具" / "00_数学工具.md"
    if not tool_file.exists():
        raise SystemExit("✗ 找不到 %s" % tool_file)
    g, c = parse_tool_file(tool_file)
    groups += g
    tool_cards += c
    seen: set = set()
    for mod in MODULES:
        for item in mod["notes"]:
            src = project / item["src"]
            if src in seen:
                continue  # 同一份笔记切成多页时只需解析一次
            seen.add(src)
            if not src.exists():
                continue
            g, c = parse_note_theorems(src, mod["module"], mod["chapter"], item["dir"])
            groups += g
            thm_cards += c
    for card in tool_cards + thm_cards:
        for key in ("body", "proof", "usage", "note"):
            card.setdefault(key, "")
    tool_cards = [x for x in tool_cards if x.get("body") or x.get("proof")]
    thm_cards = [x for x in thm_cards if x.get("body") or x.get("proof")]

    table = build_name_table(tool_cards)
    for card in tool_cards + thm_cards:
        for key in ("body", "proof", "usage", "note"):
            card[key] = link_names(card[key], table, "card", self_id=card["id"])
        # 每张卡记住自己属于哪门课、哪个数学分支（大类）与细分：数学库（/library/）靠这几个字段汇总
        card["course"] = COURSE
        card["section"] = section_of(card, cfg)
        card["branch"] = cfg["section_parent"][card["section"]]

    toolbox = {
        "note": "由 tools/course-import/import_course.py 从课程项目生成，勿手改。",
        "courses": [{"key": COURSE, "name": "回归分析"}],
        # 分支体系来自 data/math-branches.yaml（不是生成产物）：大类 → 细分，模板按 key 取卡片
        "branches": [
            {
                "key": b["key"],
                "name": b.get("name", b["key"]),
                "summary": b.get("summary", ""),
                "sections": [
                    {"key": s["key"], "name": s.get("name", s["key"]), "summary": s.get("summary", "")}
                    for s in b["sections"]
                ],
            }
            for b in cfg["branches"]
        ],
        "groups": groups,
        "cards": tool_cards + thm_cards,
    }
    return toolbox, table


# --------------------------------------------------------------------------- #
# 主流程
# --------------------------------------------------------------------------- #
TOOLBOX_DIR = REPO / "content" / "courses" / COURSE / "toolbox"


def card_page_md(card: dict, weight: int, date_str: str) -> str:
    """卡片页骨架（leaf bundle）：正文为空，模板按目录名从 data 里取卡片。

    为什么每张卡一页：单张卡的 KaTeX 排版树很小，而 80 张卡堆在一页会有 3 MB，
    超过 scripts/report-size.sh 的单页 1.6 MB 预算；拆开之后引用可以指向独立 URL，
    弹窗按需加载同一份内容（见 assets/js/toolbox.js）。
    """
    # 卡片页的标题：有名字就用名字（页签里带上类别与编号以便区分），没有名字退回「定理 4.6」
    if card.get("title"):
        title = "%s（%s %s）" % (card["title"], card["kind"], card["num"])
    else:
        title = "%s %s" % (card["kind"], card["num"])
    return (
        "---\n"
        "# 工具库卡片页：由 tools/course-import/import_course.py 生成，勿手改。\n"
        "# 卡片内容在 data/math-toolbox.json，模板是 layouts/courses/toolcard.html。\n"
        "title: %s\n"
        'layout: "toolcard"\n'
        "date: %s\n"
        "draft: false\n"
        "weight: %d\n"
        "sitemap:\n"
        "  disable: true\n"
        "searchHidden: true\n"
        "---\n" % (json.dumps(title, ensure_ascii=False), date_str, weight)
    )


def card_page_date(path: Path) -> str:
    """卡片页的 date：沿用已存在页面的日期，没有就用今天 —— 重复导入不会天天改日期。"""
    if path.exists():
        m = re.search(r"^date:\s*(\S+)\s*$", read_text(path), re.M)
        if m:
            return m.group(1)
    return datetime.date.today().isoformat()


CARD_DIR_RE = re.compile(r"^(tool|thm)-[0-9]+(-[0-9]+)*$")


def orphan_card_dirs(expected: set) -> list:
    """工具库目录下不再是任何卡片、且名字像卡片 id 的子目录（卡片改名或消失后的残骸）。"""
    out = []
    if not TOOLBOX_DIR.is_dir():
        return out
    for child in sorted(TOOLBOX_DIR.iterdir()):
        if child.is_dir() and CARD_DIR_RE.match(child.name) and child.name not in expected:
            out.append(child)
    return out


def dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", default=str(DEFAULT_PROJECT))
    ap.add_argument("--check", action="store_true", help="只比对，不写盘")
    ap.add_argument("--dry-run", action="store_true", help="只打印将改动的文件")
    args = ap.parse_args()

    project = Path(args.project)
    if not project.exists():
        raise SystemExit("✗ 课程项目目录不存在：%s" % project)

    problems: list[str] = []
    plan: list[tuple[str, str, object]] = []  # (kind, path, payload)

    # 先建数学库数据：正文的「名字 → 卡片」接线要用它的名字表
    toolbox, name_table = build_toolbox(project, load_branches(BRANCHES_FILE))

    def page_body(raw: str, where: str) -> str:
        """课程正文：统一换行、按名字接上卡片引用，并拦下旧写法【工具 k.m】。"""
        body = link_names(clean_body(raw), name_table, "shortcode")
        for m in STRAY_TOOL_REF.finditer(body):
            problems.append("%s 里还有旧写法【工具 %s.%s】——正文只写结论的名字" % (where, m.group(1), m.group(2)))
        return body

    for mod in MODULES:
        chapter = mod["chapter"]
        for item in mod["notes"]:
            src = project / item["src"]
            if not src.exists():
                problems.append("缺少源文件 %s" % src)
                continue
            raw = split_notes(read_text(src), item["first"], item["last"])
            body = page_body(raw, "%s §%s–§%s" % (item["src"], item["first"], item["last"]))
            dst = REPO / "content" / "courses" / COURSE / chapter / item["dir"] / "index.md"
            plan.append(("body", dst, body))
        for key in ("homework",):
            src_rel, material = mod[key]
            src = project / src_rel
            if not src.exists():
                problems.append("缺少源文件 %s" % src)
                continue
            body = page_body(read_text(src), src_rel)
            dst = REPO / "content" / "courses" / COURSE / chapter / material / "index.md"
            plan.append(("body", dst, body))
        for src_rel, material, figs_rel in mod["labs"]:
            src = project / src_rel
            if not src.exists():
                problems.append("缺少源文件 %s" % src)
                continue
            body = page_body(read_text(src), src_rel)
            dst = REPO / "content" / "courses" / COURSE / chapter / material / "index.md"
            plan.append(("body", dst, body))
            figs = project / figs_rel
            if figs.is_dir():
                for png in sorted(figs.glob("*")):
                    plan.append(("copy", dst.parent / "figs" / png.name, png))

    plan.append(("json", TOOL_JSON, toolbox))

    # 每张卡片一个页面（理由见 card_page_md），并清掉已不属于任何卡片的孤儿目录
    expected = set()
    for i, card in enumerate(toolbox["cards"], start=1):
        expected.add(card["id"])
        plan.append(("text", TOOLBOX_DIR / card["id"] / "index.md",
                     card_page_md(card, i, card_page_date(TOOLBOX_DIR / card["id"] / "index.md"))))
    for orphan in orphan_card_dirs(expected):
        plan.append(("rmtree", orphan, None))

    changed = 0
    for kind, path, payload in plan:
        if kind == "copy":
            same = path.exists() and path.read_bytes() == payload.read_bytes()
            if same:
                continue
            changed += 1
            print(("  = " if args.check else "  → ") + str(path.relative_to(REPO)))
            if not args.check and not args.dry_run:
                path.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(payload, path)
            continue
        if kind == "json":
            new = dumps(payload)
            old = read_text(path) if path.exists() else ""
            if new == old:
                continue
            changed += 1
            print(("  = " if args.check else "  → ") + str(path.relative_to(REPO)) + " (%d 张卡片)" % len(payload["cards"]))
            if not args.check and not args.dry_run:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(new, encoding="utf-8", newline="\n")
            continue
        if kind == "rmtree":
            changed += 1
            print(("  = " if args.check else "  → ") + "删除孤儿卡片页 " + str(path.relative_to(REPO)))
            if not args.check and not args.dry_run:
                shutil.rmtree(path)
            continue
        if kind == "text":
            old = read_text(path) if path.exists() else None
            if old == payload:
                continue
            changed += 1
            print(("  = " if args.check else "  → ") + str(path.relative_to(REPO)))
            if not args.check and not args.dry_run:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(payload, encoding="utf-8", newline="\n")
            continue
        # body
        status, new = write_page_body(path, payload)
        if status == "unchanged":
            continue
        changed += 1
        print(("  = " if args.check else "  → ") + str(path.relative_to(REPO)))
        if not args.check and not args.dry_run:
            path.write_text(new, encoding="utf-8", newline="\n")

    for p in problems:
        print("✗ " + p, file=sys.stderr)
    if args.check and changed:
        print("✗ 有 %d 个产物与课程项目不一致（重跑导入脚本）" % changed, file=sys.stderr)
        return 1
    if problems:
        return 1
    print("✓ %s（%d 个文件%s）" % ("检查通过" if args.check else "导入完成", len(plan), "，未写盘" if (args.check or args.dry_run) else ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
