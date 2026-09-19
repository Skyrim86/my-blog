#!/usr/bin/env python3
"""卡片库工具：列出 / 查看 / 编辑 / 新建 / 删除 卡片。

管理者是博客管理页的「卡片库」页签，但本脚本独立可用（界面只是外壳，规则只有这一份）。

四个来源，各自写回**唯一事实源**（这是本工具最重要的约定 —— 改产物会被下次导入覆盖）：

| 来源 | 判定 | 改动写到哪 |
|---|---|---|
| `wiki` | 条目带 `source: wiki` | 知识库（仓库外）的 `<节点id>.card.md` / `.note.md`，归类写回 `maps/curriculum.yaml` 节点 |
| `hand` | CS 库里的非 wiki 条目 | 本仓库 `data/cs-toolbox.json`（手写维护的那份） |
| `course` | 数学库里的非 wiki 条目 | 本仓库 `data/math-toolbox.json`，并给条目打 `edited: true` |

`course` 卡的改动**不写回课程项目**：那 80 张卡的正文由 `tools/course-import/import_course.py`
从课程项目 markdown 里按 § 号区间解析出来，反写回去要反推原文区间，猜错就弄坏课程笔记原文。
所以改成「本地覆盖」：改动落在博客侧的 JSON 上并打 `edited: true` 标记，**导入器会跳过这些条目**
（见 import_course.py 的 preserve_edited），于是你的修改不会被重跑导入冲掉。
代价：这张卡从此不再跟随课程项目 —— 要交回给它，删掉该条目的 `edited` 字段再重跑导入。

用法：
  python tools/wiki-publish/cards.py list [--json]
  python tools/wiki-publish/cards.py show <id> [--json]
  python tools/wiki-publish/cards.py save --stdin      # 从标准输入读 JSON 载荷
  python tools/wiki-publish/cards.py create --stdin
  python tools/wiki-publish/cards.py delete <id>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))
import publish as P  # noqa: E402  复用它的知识库 / 库 / 分类表读取（同一目录，不是第二份实现）

try:
    import yaml
except ImportError:
    sys.exit("✗ 需要 PyYAML：pip install pyyaml")

REPO = P.REPO
WIKI_DEFAULT = P.DEFAULT_WIKI


def setup_stdout() -> None:
    """Windows 上 stdout 默认按控制台代码页编码，中文会乱码或抛异常 —— 先钉成 UTF-8。
    （调用方还会用 PYTHONIOENCODING/PYTHONUTF8 再兜一层。）"""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except Exception:
            pass


def emit(payload) -> None:
    """机器可读输出一律 ASCII：`ensure_ascii=True` 把中文转成 Unicode 转义序列。

    这样 stdout 里只有 ASCII 字节，**无论子进程用 UTF-8 还是 GBK 写、调用方按什么解码，
    结果都一样** —— 中文乱码这一类问题从协议层消失（调用方 JSON.parse 后仍是正常中文）。
    人看的那份输出走不带 --json 的模式，那边是真中文。
    """
    print(json.dumps(payload, ensure_ascii=True, separators=(",", ":")))


def rel(path) -> str:
    """相对仓库根的 posix 路径（publish.py 里只对内联打印用过，没有导出这个helper）。"""
    try:
        return Path(path).resolve().relative_to(REPO).as_posix()
    except ValueError:
        return Path(path).as_posix()


def rel_wiki(path, wiki_root) -> str:
    """知识库里的文件相对知识库根显示 —— 绝对路径在界面上又长又没用。"""
    try:
        return Path(path).resolve().relative_to(Path(wiki_root).resolve()).as_posix()
    except ValueError:
        return rel(path)

# 每个库的卡片「谁生成的」—— 决定编辑写回哪里。加库时必须在这里登记。
GENERATORS = {
    "math": {"by": "course", "why": "由 tools/course-import/import_course.py 从课程项目生成"},
    "cs": {"by": "hand", "why": "手写维护在 data/cs-toolbox.json"},
}

# 两种卡片格式的可编辑字段（界面按这份清单渲染表单，脚本按它决定写什么）
WIKI_FIELDS = [
    ("标题", "标题", "text"),
    ("类型", "类型", "select", ["定义", "概念", "定理", "技巧"]),
    ("陈述称谓", "陈述称谓（仅定理类，可空）", "select", ["", "定理", "命题", "引理", "推论", "性质"]),
    ("状态", "状态", "select", ["草稿", "已核对", "已验证"]),
    ("摘要", "摘要（一句话）", "textarea"),
    ("来源", "来源（逗号分隔）", "list"),
    ("先修", "先修节点 id（逗号分隔）", "list"),
    ("分类.大类", "分类 · 大类", "select_taxonomy"),
    ("分类.细分", "分类 · 细分", "select_taxonomy"),
]
WIKI_SECTIONS = [
    ("陈述", "陈述", "textarea"),
    ("例", "例", "textarea"),
    ("自测", "自测（一行问句，必填）", "textarea"),
    ("链接", "链接（[[节点id]] 会被发布器改成卡片引用）", "textarea"),
]
WIKI_NOTE_SECTIONS = [
    ("动机与定位", "动机与定位（→ 博客的 usage）", "textarea"),
    ("证明思路", "证明思路（1–3 行骨架）", "textarea"),
    ("证明", "证明（完整推导 → 博客的 proof）", "textarea"),
    ("边界与易错", "边界与易错（→ 博客的 note）", "textarea"),
    ("与相邻节点的关系", "与相邻节点的关系", "textarea"),
]
HAND_FIELDS = [
    ("kind", "类型", "select", ["定义", "概念", "定理", "命题", "引理", "推论", "性质", "技巧"]),
    ("title", "标题", "text"),
    ("aliases", "别名（逗号分隔，供正文按名字引用）", "list"),
    ("branch", "大类", "select_taxonomy"),
    ("section", "细分", "select_taxonomy"),
]
HAND_SECTIONS = [
    ("body", "陈述主体（→ 卡片正文）", "textarea"),
    ("usage", "用途 / 何时用", "textarea"),
    ("note", "注 / 易错", "textarea"),
    ("proof", "证明", "textarea"),
]


# --------------------------------------------------------------------------- #
# 读：两库 + 知识库，合成一份清单
# --------------------------------------------------------------------------- #
def _taxonomy_options(blog: dict) -> dict:
    """给界面用的下拉选项，**按库分开**：`{库key: {branches: [...], sections: {大类: [...]}}}`。

    取自博客自己的 data/<库>-branches.yaml，而不是知识库的分类表 —— 两边的 key 本来就必须一致
    （publish.py 的 --check 会校验），而博客那份**永远在**（知识库还没建时界面也照样能选）。
    """
    out = {}
    for lib_key, tree in blog.items():
        out[lib_key] = {
            "branches": [{"key": k, "name": (v.get("name") or k)} for k, v in tree.items()],
            "sections": {k: [{"key": sk, "name": (sv.get("name") or sk)}
                             for sk, sv in (v.get("sections") or {}).items()]
                         for k, v in tree.items()},
        }
    return out


def load_all(wiki_root: Path) -> dict:
    libs = P.load_libraries()
    blog = {k: P.load_blog_branches(k) for k in libs}
    sections, nodes, courses, card_files, note_files = P.load_wiki(wiki_root)
    tax_file = wiki_root / "_meta" / "分类.yaml"
    taxonomy = yaml.safe_load(tax_file.read_text(encoding="utf-8")) if tax_file.exists() else {}

    cards = []
    for lib_key, lib in libs.items():
        data_path = REPO / "data" / f"{lib['data']}.json"
        if not data_path.exists():
            continue
        data = json.loads(data_path.read_text(encoding="utf-8"))
        for entry in data.get("cards") or []:
            is_wiki = entry.get("source") == P.SOURCE_TAG
            gen = GENERATORS.get(lib_key, {})
            source = "wiki" if is_wiki else gen.get("by", "hand")
            branch = entry.get("branch", "")
            section = entry.get("section", "")
            tree = blog.get(lib_key, {})
            cards.append({
                "id": entry.get("id", ""),
                "lib": lib_key,
                "libLabel": lib.get("label", lib_key),
                "kind": entry.get("kind", ""),
                "title": entry.get("title", ""),
                "course": entry.get("course", ""),
                "branch": branch,
                "branchName": (tree.get(branch) or {}).get("name", branch),
                "section": section,
                "sectionName": ((tree.get(branch) or {}).get("sections") or {}).get(section, {}).get("name", section),
                "source": source,
                "editable": source in ("wiki", "hand") or lib_key == "math",
                "readonlyWhy": "" if (source in ("wiki", "hand") or lib_key == "math") else gen.get("why", ""),
                "edited": bool(entry.get("edited")),
                "status": "",
            })
    # 知识库里**还没发布过**的卡不在博客 JSON 里，但它们同样要被编辑与发布 —— 从源文件补进来。
    # 少了这一步，页签就只看得见「已发布」的卡，而「把新卡发出去」正是它最主要的用途。
    seen = {c["id"] for c in cards}
    for nid, p in card_files.items():
        if nid in seen:
            continue
        meta, _ = P.read_page(p)
        node = nodes.get(nid) or {}
        info = sections.get(str((node.get("分类") or {}).get("细分") or "").strip())
        lib_key = info["lib"] if info else ""
        lib = libs.get(lib_key, {})
        tree = blog.get(lib_key, {})
        bkey = info["branch"] if info else ""
        cards.append({
            "id": nid, "lib": lib_key, "libLabel": lib.get("label") or "（归类有误，未定库）",
            "kind": str(meta.get("类型") or ""), "title": str(meta.get("标题") or nid),
            "course": str(node.get("课程") or ""), "branch": bkey,
            "branchName": (tree.get(bkey) or {}).get("name") or (info["branch_name"] if info else ""),
            "section": str((node.get("分类") or {}).get("细分") or ""),
            "sectionName": ((tree.get(bkey) or {}).get("sections") or {}).get(
                str((node.get("分类") or {}).get("细分") or ""), {}).get("name")
                or (info["section_name"] if info else ""),
            "source": "wiki", "editable": True, "readonlyWhy": "", "published": False, "edited": False,
            # 分类有问题时发布器会拦下来，这里先说清，别让人改完才发现发不出去
            "warn": "" if info else "这个节点在 curriculum.yaml 里没有合法的 `分类`（或细分 key 不在分类表里），发布时会被拦住",
        })
    for c in cards:
        c.setdefault("published", c["source"] == "wiki")
        c.setdefault("warn", "")
        if c["source"] == "wiki" and card_files.get(c["id"]):
            c["status"] = str(P.read_page(card_files[c["id"]])[0].get("状态") or "草稿")
    cards.sort(key=lambda c: ({"math": 0, "cs": 1}.get(c["lib"], 2), c["branch"], c["section"], c["id"]))
    return {"cards": cards, "libs": libs, "blog": blog, "sections": sections,
            "nodes": nodes, "courses": courses, "taxonomy": taxonomy,
            "cardFiles": card_files, "noteFiles": note_files}


# --------------------------------------------------------------------------- #
# 写：front matter 与正文小节的行级替换（保住手写文件的注释与排版）
# --------------------------------------------------------------------------- #
def _fm_span(text: str):
    m = re.match(r"\A---[ \t]*\r?\n(.*?\r?\n)?---[ \t]*\r?\n?", text, re.S)
    return m


def fmt_value(key: str, value) -> str:
    """按字段决定写成什么 YAML 标量。列表写成行内数组，其余按需加引号。"""
    if key in ("来源", "先修", "aliases"):
        items = value if isinstance(value, list) else [s.strip() for s in str(value).split(",") if s.strip()]
        return "[" + ", ".join(json.dumps(str(i), ensure_ascii=False) for i in items) + "]"
    s = "" if value is None else str(value)
    if s == "":
        return ""
    if re.search(r"[:#\[\]{}]|^\s|\s$", s):
        return json.dumps(s, ensure_ascii=False)
    return s


def set_card_field(text: str, key: str, value) -> str:
    """在卡片的 front matter 里就地把 `key:` 换成新值；没有这个键就追加在末尾。"""
    line = f"{key}: {fmt_value(key, value)}".rstrip()
    m = _fm_span(text)
    if not m:
        return text
    fm, body = text[m.start():m.end()], text[m.end():]
    if re.search(rf"^{re.escape(key)}:.*$", fm, re.M):
        # 用 lambda 而不是替换串：值里可能含反斜杠（json.dumps 转义），替换串会被再解释一遍
        fm = re.sub(rf"^{re.escape(key)}:.*$", lambda _: line, fm, count=1, flags=re.M)
    else:
        fm = fm.rstrip("\n")
        closing = "\n---\n" if fm.endswith("---") else "\n---\n"
        fm = fm[: fm.rfind("---")] + line + closing
    return fm + body


def set_section(body: str, name: str, value: str) -> str:
    """把一个 `## name` 小节整段换掉；不存在就追加。`## 修订` 之类不受影响。"""
    value = value.strip()
    pat = re.compile(rf"^(#+)\s*{re.escape(name)}\s*$", re.M)
    m = pat.search(body)
    if not m:
        if not value:
            return body
        return body.rstrip("\n") + f"\n\n## {name}\n\n{value}\n"
    rest = body[m.end():]
    nxt = re.search(r"^#+\s", rest, re.M)
    tail = rest[nxt.start():] if nxt else ""
    head = body[: m.start()]
    if not value:
        return (head + tail.lstrip("\n")).rstrip("\n") + "\n"
    return head + f"## {name}\n\n{value}\n\n" + tail


def stamp_revision(text: str, what: str) -> str:
    """在 `## 修订` 追加一行（契约要求只增不改）。"""
    return set_section(text, "修订", (P.section(text, "修订") + f"\n- {date.today().isoformat()} {what}").strip())


def update_node_classification(path: Path, node_id: str, branch: str, section: str) -> str:
    """把 curriculum.yaml 里某个节点的 `分类` 换成新值（节点是单行 flow mapping，可精确定位）。

    写完立刻用 yaml 重新解析验证；解析不过就回滚并报错 —— 这份文件是手写的，不能写坏。
    """
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    hit = False
    for i, line in enumerate(lines):
        if re.search(rf"标识:\s*{re.escape(node_id)}\b", line):
            value = "{大类: %s, 细分: %s}" % (branch, section)
            if re.search(r"分类:\s*\{[^}]*\}", line):
                lines[i] = re.sub(r"分类:\s*\{[^}]*\}", f"分类: {value}", line, count=1)
            elif re.search(r"分类:\s*\S+", line):
                lines[i] = re.sub(r"分类:\s*\S+", f"分类: {value}", line, count=1)
            else:
                # 插到该行 mapping 的收尾 `}` 之前；没有收尾 `}` 就末尾追加
                if re.search(r"\}\s*$", line.rstrip("\r\n")):
                    lines[i] = re.sub(r"\}\s*(\r?\n)$", f", 分类: {value}}}\\1", line)
                else:
                    lines[i] = line.rstrip("\r\n") + f", 分类: {value}\n"
            hit = True
            break
    if not hit:
        raise ValueError(f"curriculum.yaml 里找不到节点 {node_id} —— 请先把它加进节点列表")
    text = "".join(lines)
    try:
        yaml.safe_load(text)
    except Exception as exc:  # 回滚，绝不留下坏文件
        path.write_text(original, encoding="utf-8", newline="\n")
        raise ValueError(f"改 分类 会让 curriculum.yaml 解析失败，已回滚：{exc}") from exc
    path.write_text(text, encoding="utf-8", newline="\n")
    return text


def append_node(path: Path, course_id: str, node: dict) -> None:
    """在课程下新增一个节点行（新建卡片时用）。同样带解析验证与回滚。"""
    original = path.read_text(encoding="utf-8")
    lines = original.splitlines(keepends=True)
    inner = ", ".join(
        f"{k}: {fmt_value(k, v)}" if v != "" else f"{k}: \"\""
        for k, v in (("标识", node["标识"]), ("标题", node["标题"]), ("类型", node["类型"]),
                     ("出处", node.get("出处", "")), ("分类", ""), ("先修", []))
        if k != "分类"
    )
    inner += ", 分类: {大类: %s, 细分: %s}" % (node["大类"], node["细分"])
    inner += ", 先修: []"
    new_line = f"      - {{{inner}}}\n"

    course_at = None
    for i, line in enumerate(lines):
        if re.search(rf"^\s*-\s*标识:\s*{re.escape(course_id)}\s*$", line):
            course_at = i
            break
    if course_at is None:
        raise ValueError(f"curriculum.yaml 里找不到课程 {course_id}")
    last_node = None
    for i in range(course_at + 1, len(lines)):
        if re.match(r"^\s*-\s*标识:\s*\S+\s*$", lines[i]) and not re.match(r"^      ", lines[i]):
            break
        if re.match(r"^      - \{", lines[i]):
            last_node = i
    lines.insert((last_node + 1) if last_node is not None else course_at + 2, new_line)
    text = "".join(lines)
    try:
        yaml.safe_load(text)
    except Exception as exc:
        path.write_text(original, encoding="utf-8", newline="\n")
        raise ValueError(f"追加节点会让 curriculum.yaml 解析失败，已回滚：{exc}") from exc
    path.write_text(text, encoding="utf-8", newline="\n")


def dumps_compact(obj) -> str:
    """json.dumps(indent=2)，但把短字符串数组压回一行 —— 与 repo 里手写 JSON 的排版一致，
    这样「不改动也保存一次」不会产生整文件的格式 diff。"""
    text = json.dumps(obj, ensure_ascii=False, indent=2)

    def collapse(m: re.Match) -> str:
        items = [s.strip() for s in m.group(0).strip("[]\n ").split(",\n")]
        one = "[" + ", ".join(x.strip() for x in items) + "]"
        return one if len(one) <= 100 and "\n" not in one else m.group(0)

    for _ in range(3):
        new = re.sub(r"\[\n(?:\s*\"[^\"\n]*\",?\n)+\s*\]", collapse, text)
        if new == text:
            break
        text = new
    return text + "\n"


def _expanded(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2) + "\n"


def dump_like(path: Path, original_text: str, new_data) -> str:
    """按这个文件**现有的排版**序列化，别把整文件重排。

    两个库的 JSON 排版不同：`data/math-toolbox.json` 由 import_course.py 生成，数组逐行展开；
    `data/cs-toolbox.json` 是手写的，短数组写在一行里。早先一律用 collapse 版本，
    结果改一个字段就把数学库 1600 行重排了（diff 从几行变成 300 行）。
    判据：拿**原数据**试着序列化，哪种能还原出原文件就用哪种；都不行就按行数接近的挑。
    """
    try:
        original_data = json.loads(original_text)
    except Exception:
        return _expanded(new_data)
    if _expanded(original_data) == original_text:
        return _expanded(new_data)
    if dumps_compact(original_data) == original_text:
        return dumps_compact(new_data)
    compact, expanded = dumps_compact(new_data), _expanded(new_data)
    nearer = min((compact, expanded), key=lambda s: abs(s.count("\n") - original_text.count("\n")))
    return nearer


def write_lf(path: Path, text: str) -> None:
    """一律 LF：仓库约定是 LF，且 gen-cards.mjs 的比对是逐字节的（见 publish.py 同名函数）。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


# --------------------------------------------------------------------------- #
# 子命令
# --------------------------------------------------------------------------- #
def cmd_list(args, st) -> int:
    cards = st["cards"]
    if args.json:
        emit({"cards": cards, "taxonomy": _taxonomy_options(st["blog"])})
        return 0
    for c in cards:
        flag = "" if c["editable"] else "〔只读〕"
        print(f"{c['id']:24s} {c['libLabel']:6s} {c['kind']:4s} {c['title'][:34]:36s} {c['source']}{flag}")
    print(f"\n共 {len(cards)} 张：可编辑 {sum(1 for c in cards if c['editable'])}，只读 {sum(1 for c in cards if not c['editable'])}")
    return 0


def cmd_show(args, st) -> int:
    card = next((c for c in st["cards"] if c["id"] == args.id), None)
    if card is None:
        sys.exit(f"✗ 找不到卡片 {args.id}")
    out = dict(card)
    out["taxonomy"] = _taxonomy_options(st["blog"])
    if card["source"] == "wiki":
        p = st["cardFiles"].get(card["id"])
        meta, body = P.read_page(p)
        node = st["nodes"].get(card["id"]) or {}
        cls = node.get("分类") or {}
        fields = {k: (meta.get(k) or []) if k in ("来源", "先修") else (meta.get(k) or "")
                  for k, _, *_ in WIKI_FIELDS if not k.startswith("分类.")}
        fields["分类.大类"] = str(cls.get("大类") or "")
        fields["分类.细分"] = str(cls.get("细分") or "")
        note_path = st["noteFiles"].get(card["id"])
        note_body = P.read_page(note_path)[1] if note_path else ""
        out.update({
            "fields": fields,
            "fieldSpec": [{"key": k, "label": lb, "kind": kind, "options": [""] + (opts or [])}
                          for k, lb, kind, *opts in WIKI_FIELDS],
            "sections": {k: P.section(body, k) for k, _, _ in WIKI_SECTIONS},
            "sectionSpec": [{"key": k, "label": lb, "kind": kind} for k, lb, kind in WIKI_SECTIONS],
            "noteSections": {k: P.section(note_body, k) for k, _, _ in WIKI_NOTE_SECTIONS},
            "noteSectionSpec": [{"key": k, "label": lb, "kind": kind} for k, lb, kind in WIKI_NOTE_SECTIONS],
            "hasNote": bool(note_path),
            "cardPath": rel_wiki(p, args.wiki) if p else "",
            "notePath": rel_wiki(note_path, args.wiki) if note_path else "",
            "course": str(node.get("课程") or ""),
        })
    elif card["source"] in ("hand", "course"):
        data = json.loads((REPO / "data" / f"{st['libs'][card['lib']]['data']}.json").read_text(encoding="utf-8"))
        entry = next((e for e in data["cards"] if e.get("id") == card["id"]), {})
        out.update({
            "fields": {k: entry.get(k) or ("" if kind != "list" else []) for k, _, kind, *o in HAND_FIELDS},
            "fieldSpec": [{"key": k, "label": lb, "kind": kind, "options": [""] + (opts or [])}
                          for k, lb, kind, *opts in HAND_FIELDS],
            "sections": {k: entry.get(k, "") for k, _, _ in HAND_SECTIONS},
            "sectionSpec": [{"key": k, "label": lb, "kind": kind} for k, lb, kind in HAND_SECTIONS],
            "noteSections": {}, "noteSectionSpec": [], "hasNote": False,
            "cardPath": f"data/{st['libs'][card['lib']]['data']}.json",
            "notePath": "",
        })
    else:
        out.update({"fields": {}, "fieldSpec": [], "sections": {}, "sectionSpec": [],
                    "noteSections": {}, "noteSectionSpec": [], "hasNote": False,
                    "cardPath": "", "notePath": "", "readonlyWhy": card.get("readonlyWhy", "")})
    emit(out)
    return 0


def cmd_save(args, st) -> int:
    payload = json.load(sys.stdin)
    cid = payload.get("id") or ""
    card = next((c for c in st["cards"] if c["id"] == cid), None)
    if card is None:
        sys.exit(f"✗ 找不到卡片 {cid}")
    if not card["editable"]:
        sys.exit(f"✗ {cid} 的来源是 {card['source']}，本工具不改它。{card.get('readonlyWhy', '')}")
    fields = payload.get("fields") or {}
    regen = ""
    note = ""
    sections = payload.get("sections") or {}
    note_sections = payload.get("noteSections") or {}
    changed = []

    if card["source"] == "wiki":
        path = st["cardFiles"].get(cid)
        text = path.read_text(encoding="utf-8")
        for k in ("标题", "类型", "陈述称谓", "状态", "摘要", "来源", "先修"):
            if k in fields:
                text = set_card_field(text, k, fields[k])
        for k, v in sections.items():
            text = set_section(text, k, v)
        text = stamp_revision(text, "管理页编辑")
        write_lf(path, text)
        changed.append(rel_wiki(path, args.wiki))

        branch, section = str(fields.get("分类.大类") or "").strip(), str(fields.get("分类.细分") or "").strip()
        if branch and section:
            update_node_classification(Path(args.wiki) / "maps" / "curriculum.yaml", cid, branch, section)
            changed.append("maps/curriculum.yaml")
        if note_sections:
            npath = st["noteFiles"].get(cid)
            if npath is None:
                npath = path.parent / f"{cid}.note.md"
                meta, _ = P.read_page(path)
                npath.write_text(
                    "---\n" + "\n".join(f"{k}: {fmt_value(k, meta.get(k))}"
                                        for k in ("标题", "课程", "节点", "类型", "陈述称谓", "状态",
                                                  "摘要", "来源", "先修", "tags", "更新")) +
                    f"\n---\n\n# {meta.get('标题', cid)}（完整推导与边界）\n", encoding="utf-8", newline="\n")
            ntext = npath.read_text(encoding="utf-8")
            for k, v in note_sections.items():
                ntext = set_section(ntext, k, v)
            write_lf(npath, ntext)
            changed.append(rel_wiki(npath, args.wiki))
    elif card["source"] in ("hand", "course"):
        data_path = REPO / "data" / f"{st['libs'][card['lib']]['data']}.json"
        original_text = data_path.read_text(encoding="utf-8")
        data = json.loads(original_text)
        entry = next(e for e in data["cards"] if e.get("id") == cid)
        for k, v in fields.items():
            entry[k] = v
        for k, v in sections.items():
            entry[k] = v
        if card["source"] == "course":
            # 「本地覆盖」标记：import_course.py 的 preserve_edited 据此跳过这张卡。
            # 少了它，重跑导入会把你的修改静默冲掉。
            entry["edited"] = True
        write_lf(data_path, dump_like(data_path, original_text, data))
        changed.append(rel(data_path))
        # 只有 gen-cards.mjs 管的库（有 cards 前缀，当前是 CS）才让它重生成卡片页；
        # 数学卡不是它生成的，对它跑会写出一批错误的页面
        if st["libs"][card["lib"]].get("cards"):
            regen = card["lib"]
        else:
            note = "卡片页标题要等下次跑 import_course.py 才同步（它不覆盖 edited 的卡，是安全的）"

    out = {"ok": True, "changed": changed}
    if regen:
        out["regen"] = regen
        out["hint"] = f"接着跑 node scripts/gen-cards.mjs {regen} 重生成卡片页"
    elif note:
        out["hint"] = note
    emit(out)
    return 0


def cmd_create(args, st) -> int:
    payload = json.load(sys.stdin)
    cid = str(payload.get("id") or "").strip()
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", cid):
        sys.exit("✗ 节点 id 只能是小写英文与短横线（如 rank-nullity）")
    if any(c["id"] == cid for c in st["cards"]):
        sys.exit(f"✗ 卡片 id {cid} 已存在")
    target = payload.get("target") or "wiki"
    title = str(payload.get("title") or cid).strip()
    kind = str(payload.get("kind") or "定理").strip()
    branch = str(payload.get("branch") or "").strip()
    section = str(payload.get("section") or "").strip()
    course = str(payload.get("course") or "").strip()
    if not branch or not section:
        sys.exit("✗ 新建卡片必须给 大类 与 细分")

    if target == "wiki":
        if not Path(args.wiki).exists():
            sys.exit(f"✗ 新建知识库卡片需要知识库，但它不存在：{args.wiki}\n"
                     f"  先初始化知识库（math-cs-kb skill 的初始化模式），或改用 --wiki 指定路径。")
        if not course:
            sys.exit("✗ 新建知识库卡片必须指定课程（节点挂在课程下）")
        cur = Path(args.wiki) / "maps" / "curriculum.yaml"
        append_node(cur, course, {"标识": cid, "标题": title, "类型": kind,
                                  "出处": "", "大类": branch, "细分": section})
        target_dir = Path(args.wiki) / "wiki" / branch / section
        body = (f"---\n标题: {title}\n课程: {course}\n节点: {cid}\n类型: {kind}\n"
                f"状态: 草稿\n摘要: \n来源: []\n先修: []\ntags: [课程/{course}, 类型/{kind}]\n"
                f"更新: {date.today().isoformat()}\n---\n\n# {title}\n\n**一句话.** \n\n"
                f"## 陈述\n\n\n## 例\n\n\n## 自测\n\n\n## 来源\n\n\n## 修订\n\n"
                f"- {date.today().isoformat()} 初稿（来源：）\n")
        write_lf(target_dir / f"{cid}.card.md", body)
        emit({"ok": True, "id": cid, "path": f"wiki/{branch}/{section}/{cid}.card.md",
              "hint": "节点已加进 curriculum.yaml；接着把陈述、例子与来源补上"})
        return 0

    # target == hand：写进指定库的 JSON（并提示重生成卡片页）
    lib_key = payload.get("lib") or "cs"
    lib = st["libs"].get(lib_key)
    if not lib or not lib.get("cards"):
        sys.exit(f"✗ 库 {lib_key} 不支持手写新增（它没有 cards 前缀 / 不存在）")
    data_path = REPO / "data" / f"{lib['data']}.json"
    original_text = data_path.read_text(encoding="utf-8")
    data = json.loads(original_text)
    n = sum(1 for e in data["cards"] if str(e.get("id", "")).startswith(lib_key + "-")) + 1
    data["cards"].append({
        "id": cid, "num": str(n), "label": f"{lib.get('label', lib_key)} {n}", "kind": kind,
        "title": title, "aliases": [], "branch": branch, "section": section,
        "body": str(payload.get("body") or ""), "usage": "", "note": "", "proof": "",
    })
    write_lf(data_path, dump_like(data_path, original_text, data))
    emit({"ok": True, "id": cid, "path": rel(data_path), "regen": lib_key,
          "hint": f"接着跑 node scripts/gen-cards.mjs {lib_key} 生成卡片页"})
    return 0


def cmd_delete(args, st) -> int:
    card = next((c for c in st["cards"] if c["id"] == args.id), None)
    if card is None:
        sys.exit(f"✗ 找不到卡片 {args.id}")
    if not card["editable"]:
        sys.exit(f"✗ {args.id} 的来源是 {card['source']}，本工具不删它。{card.get('readonlyWhy', '')}")
    removed = []
    if card["source"] == "wiki":
        for p in (st["cardFiles"].get(args.id), st["noteFiles"].get(args.id)):
            if p and p.exists():
                p.unlink()
                removed.append(rel_wiki(p, args.wiki))
        emit({"ok": True, "removed": removed,
              "hint": "节点仍留在 curriculum.yaml 里（会显示为「缺卡」）；不想要它就从那里删掉这一行"})
        return 0
    data_path = REPO / "data" / f"{st['libs'][card['lib']]['data']}.json"
    original_text = data_path.read_text(encoding="utf-8")
    data = json.loads(original_text)
    before = len(data["cards"])
    data["cards"] = [e for e in data["cards"] if e.get("id") != args.id]
    write_lf(data_path, dump_like(data_path, original_text, data))
    emit({"ok": True, "removed": [rel(data_path)], "from": before, "to": len(data["cards"]),
          "regen": card["lib"],
          "hint": f"接着跑 node scripts/gen-cards.mjs {card['lib']} 删掉卡片页" +
                  ("；注意：这是课程导入的卡，重跑 import_course.py 会把它带回来" if card["source"] == "course" else "")})
    return 0


def main() -> int:
    setup_stdout()
    ap = argparse.ArgumentParser(description="卡片库工具：列出 / 查看 / 编辑 / 新建 / 删除")
    ap.add_argument("--wiki", default=str(WIKI_DEFAULT), help="知识库根目录")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("list", help="列出两库全部卡片"); p.add_argument("--json", action="store_true")
    p = sub.add_parser("show", help="看一张卡"); p.add_argument("id"); p.add_argument("--json", action="store_true")
    for name, fn, help_ in (("save", cmd_save, "保存（从 stdin 读 JSON）"),
                            ("create", cmd_create, "新建（从 stdin 读 JSON）")):
        p = sub.add_parser(name, help=help_); p.add_argument("--stdin", action="store_true")
    p = sub.add_parser("delete", help="删除一张卡"); p.add_argument("id")

    args = ap.parse_args()
    handler = {"list": cmd_list, "show": cmd_show, "save": cmd_save,
               "create": cmd_create, "delete": cmd_delete}[args.cmd]
    wiki_root = Path(args.wiki)
    # 只有真正要动知识库的操作才要求它在：list / show / 手写卡的 save·delete 都能在没有知识库时用
    # （手写库的卡片是本仓库的 data/cs-toolbox.json，不依赖外部目录）。
    if wiki_root.exists():
        st = load_all(wiki_root)
    else:
        libs = P.load_libraries()
        blog = {k: P.load_blog_branches(k) for k in libs}
        st = {"cards": [], "libs": libs, "blog": blog, "sections": {}, "nodes": {},
              "courses": {}, "taxonomy": {}, "cardFiles": {}, "noteFiles": {}}
        # 知识库不在时仍能列出手写库的卡片（这是「现在就能用」的那一半）
        for lib_key, lib in st["libs"].items():
            data_path = REPO / "data" / f"{lib['data']}.json"
            if not data_path.exists():
                continue
            tree = blog.get(lib_key, {})
            for entry in json.loads(data_path.read_text(encoding="utf-8")).get("cards") or []:
                source = "wiki" if entry.get("source") == P.SOURCE_TAG else GENERATORS.get(lib_key, {}).get("by", "hand")
                b, s = entry.get("branch", ""), entry.get("section", "")
                st["cards"].append({
                    "id": entry.get("id", ""), "lib": lib_key, "libLabel": lib.get("label", lib_key),
                    "kind": entry.get("kind", ""), "title": entry.get("title", ""),
                    "course": entry.get("course", ""), "branch": b,
                    "branchName": (tree.get(b) or {}).get("name", b), "section": s,
                    "sectionName": ((tree.get(b) or {}).get("sections") or {}).get(s, {}).get("name", s),
                    "source": source,
                    "editable": source in ("hand", "course") or lib_key == "math",
                    "readonlyWhy": "" if source in ("hand", "course") else "知识库不存在，读不到源文件",
                    "edited": bool(entry.get("edited")),
                    "status": "",
                })
        # 与 load_all 用同一套顺序（数学库在前），否则「知识库在不在」会改变列表顺序
        st["cards"].sort(key=lambda c: ({"math": 0, "cs": 1}.get(c["lib"], 2), c["branch"], c["section"], c["id"]))
    return handler(args, st)


if __name__ == "__main__":
    raise SystemExit(main())
