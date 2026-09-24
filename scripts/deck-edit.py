#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""收藏库（data/home-cards.yaml）的**唯一写盘入口** + 卡面明度体检的计算处。

管理页「收藏库」面板不自己碰 YAML：列表、明度体检、改名字/系列/等级/工艺、排序、删除
全部走这个脚本（`tools/admin/server.mjs` 经 lib/exec 调它）。理由与「卡片库」那条一样 ——
写盘逻辑在 Node 里再来一份就一定会和仓库里的清单漂移（缩进、注释、行序、字段顺序）。

用法（仓库根目录）：

    python scripts/deck-edit.py list --json                 # 只读：清单 + 明度体检（面板的数据源）
    python scripts/deck-edit.py apply --stdin --dry-run     # 预演：把 ops 的 diff 打出来，不写盘
    python scripts/deck-edit.py apply --stdin               # 真写（ops 从 stdin 的 JSON 读）

opts: `--manifest PATH` 覆盖清单路径（**只给测试用**：真写一份临时副本，别指到真清单上）。

ops 的形状（`apply` 的 stdin）：

    {"ops": [
      {"type": "update", "index": 3, "fields": {"name": "新名字", "style": "foil"}},
      {"type": "move",   "index": 5, "to": 2},          # 移完它排在第 2 位（1 起）
      {"type": "delete", "index": 7}
    ]}

`index` 就是面板上的**顺序号**（清单一行的位置，1 起、与卡墙顺序一致）。
update 只改给定的字段（没给的字段一个字节都不动）；move / delete 也是**只动该动的行** ——
清单里那些分组注释、行尾注释、字段顺序全部原样保留，diff 才读得出来。

**明度口径**：与 lab/工具/craftfit.py 的 lum() 逐字一致（PIL 转灰度 → 缩到 60×84 → 取均值）。
「§十八 工艺 × 明度」那次体检的结论就是按它量出来的，改这里必须同步那份实测脚本，
否则面板上的「违规」与设计纲要里记的会对不上。**不写死进清单**：换图后自动重算。
"""

import argparse
import difflib
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_MANIFEST = os.path.join(ROOT, "data", "home-cards.yaml")

# 明度体检要读的三个「渲染链上的真值」文件（工艺代码名以它们为准，见 docs/card-redesign-brief.md）
STYLES_YAML = os.path.join(ROOT, "data", "card-styles.yaml")
CSS_STYLES = os.path.join(ROOT, "assets", "css", "decks", "21-card-styles.css")
CSS_DECK = os.path.join(ROOT, "assets", "css", "decks", "21-card-deck.css")
MANIFEST_HTML = os.path.join(ROOT, "layouts", "_partials", "deck-manifest.html")
I18N_ZH = os.path.join(ROOT, "i18n", "zh.toml")

RANKS = [
    ("collector", "收藏"),
    ("rare", "珍稀"),
    ("epic", "史诗"),
    ("arcane", "秘藏"),
    ("legend", "传世"),
    ("miracle", "奇迹"),
]
RANK_LABEL = dict(RANKS)

# ---------------------------------------------------------------- 明度 × 工艺（§十八）
#
# 三档规则（docs/card-redesign-brief.md §十八「工艺 × 明度」）：
#   亮 L ≥ 185      凸印压痕 / 珠光纸 / 烫银 / 烫金箔 / 全息
#   中 140 ≤ L <185 上面的 + 星芒全息
#   暗 L < 140      凸印压痕 / 烫金箔 / 全息 / 星芒全息 / 星屑 / 墨染
# 键是**中文工艺名**（纲要里的口径），值是这个仓库可能用的**代码名**：
# 现役十六种里的四个（foil / holo-prism / silver / starnight，与 lab/工具/craftfit.py 的 MAP16 一致）
# 加上新八种里新增的四个（emboss / pearl / goldfoil / inkwash，同样取 craftfit.py 的命名）。
# 另四个候选写法（gold-foil / ink-wash）是防迁移时换拼法 —— 多认一个不会误判，少认一个就会漏判。
# **新八种落地后若改了代码名，只改这张表**：判「违规」只认代码→中文这一跳。
CRAFT_RULE = [
    ("light", "亮", 185, None, ["凸印压痕", "珠光纸", "烫银", "烫金箔", "全息"]),
    ("mid", "中", 140, 185, ["凸印压痕", "珠光纸", "烫银", "烫金箔", "全息", "星芒全息"]),
    ("dark", "暗", None, 140, ["凸印压痕", "烫金箔", "全息", "星芒全息", "星屑", "墨染"]),
]
CRAFT_CODES = {
    "凸印压痕": ["emboss"],
    "珠光纸": ["pearl"],
    "烫银": ["silver"],
    "烫金箔": ["goldfoil", "gold-foil"],
    "全息": ["foil"],
    "星芒全息": ["holo-prism"],
    "星屑": ["starnight"],
    "墨染": ["inkwash", "ink-wash"],
}
# 代码 → 它归属的中文工艺（用于判违规；不在这张表里的代码**不判定**，
# 因为 §十八 只对八种工艺给了规则，其余十二种是迁移中的过渡档位）
CODE_TO_CRAFT = {}
for _craft, _codes in CRAFT_CODES.items():
    for _c in _codes:
        CODE_TO_CRAFT[_c] = _craft


def band_of(L):
    for key, label, lo, hi, _ in CRAFT_RULE:
        if lo is not None and L < lo:
            continue
        if hi is not None and L >= hi:
            continue
        return key, label
    return "dark", "暗"


def allowed_crafts(band_key):
    for key, _label, _lo, _hi, crafts in CRAFT_RULE:
        if key == band_key:
            return crafts
    return []


# ---------------------------------------------------------------- 读文件

def read_text(path):
    with io.open(path, encoding="utf-8") as f:
        return f.read()


def fail(msg, **extra):
    out = {"ok": False, "error": msg}
    out.update(extra)
    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.exit(1)


# ---------------------------------------------------------------- 工艺代码表（从渲染链上读，不抄一份）

def style_labels():
    """code → 中文名。两张表都在仓库里：deck-manifest.html 的 styleLabel 给出代码与 i18n key，
    i18n/zh.toml 给出中文。抄一份到脚本里就会在有人加工艺时静默过期（check-deck.mjs 会核那两张表）。"""
    labels = {}
    code_key = {}
    try:
        html = read_text(MANIFEST_HTML)
        for code, key in re.findall(r'"([a-z0-9][a-z0-9-]*)"\s*\(i18n\s+"(deckStyle[A-Za-z0-9]+)"\)', html):
            code_key[code] = key
    except OSError:
        pass
    try:
        toml = read_text(I18N_ZH)
        for key, val in re.findall(r'^\[(deckStyle[A-Za-z0-9]+)\]\s*\n\s*other\s*=\s*"([^"]*)"', toml, re.M):
            for code, k in code_key.items():
                if k == key:
                    labels[code] = val
    except OSError:
        pass
    return labels


def available_styles():
    """仓库里**真的有渲染块**的工艺代码：data/card-styles.yaml 的键 ∪ 两个 CSS 文件里的
    `.home-card--<名>` 类 ∪ 清单里正在用的 style 值 ∪ foil（foil 没有主块，它由 .home-card 基类承担）。"""
    codes = set(["foil"])
    try:
        for line in read_text(STYLES_YAML).splitlines():
            m = re.match(r"^  ([a-z][a-z0-9-]*):\s*$", line)
            if m:
                codes.add(m.group(1))
    except OSError:
        pass
    for path in (CSS_STYLES, CSS_DECK):
        try:
            codes.update(re.findall(r"\.home-card--([a-z][a-z0-9-]*)", read_text(path)))
        except OSError:
            pass
    try:
        for line in read_text(DEFAULT_MANIFEST).splitlines():
            m = re.match(r"^\s+style:\s*([a-z0-9-]+)\s*(?:#.*)?$", line)
            if m:
                codes.add(m.group(1))
    except OSError:
        pass
    return codes


def craft_entry(craft, avail, labels):
    """中文工艺名 → 面板要的那条「允许的工艺」：挑一个仓库里已存在的代码，没有就标 unavailable。"""
    codes = CRAFT_CODES.get(craft, [])
    for c in codes:
        if c in avail:
            return {"craft": craft, "code": c, "label": labels.get(c, craft), "available": True}
    return {"craft": craft, "code": codes[0] if codes else None,
            "label": labels.get(codes[0], craft) if codes else craft, "available": False}


# ---------------------------------------------------------------- 清单：行级解析

FIELD_RE = re.compile(r"^(?:\s+|-\s+)([A-Za-z_][A-Za-z0-9_.-]*):\s?(.*)$")
ITEM_RE = re.compile(r"^-\s")


def strip_value(raw):
    """只做清单用得到的那一点：剥行尾注释（` #…`）与一层引号。值里不含「空格+#」是清单的约定
    （check-deck.mjs 的行解析同此口径），所以这一步不会切坏 URL 里的 `#`。"""
    v = re.sub(r"\s+#(?=\s|$).*$", "", raw).strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
        v = v[1:-1]
    return v


def scan_blocks(lines):
    """把清单切成「项」：每项 = 一条卡自己的行（`- image:` 开头，到下一条之前）+ **它上面那几行**。

    「它上面那几行」指的是紧贴在它前面、隔着最后一个空行的那一小段 —— 实际就是这一组的注释头
    （`# ---- 黑长直少女：站上自己的角色资产 ----`）。把它算进项里，是因为排序与删除会挪动卡片：
    注释若留在原位，就会出现「组注释挂在隔壁组的卡上面」这种读不下去的结果。文件开头那一整段
    说明性注释（第一个空行之前的部分）单列成 head，永远待在文件顶上 —— 它不属于任何一张卡。"""
    starts = [i for i, l in enumerate(lines) if ITEM_RE.match(l)]
    if not starts:
        fail("清单里一条 `- image:` 都没有，格式不对")
    bounds = []
    for k, s in enumerate(starts):
        e = starts[k + 1] if k + 1 < len(starts) else len(lines)
        # 块尾往前收：空行与注释属于**下一组**，不算这一条自己的行
        while e - 1 > s and (lines[e - 1].strip() == "" or lines[e - 1].lstrip().startswith("#")):
            e -= 1
        bounds.append((s, e))

    items = []
    head = []
    cur = 0
    for k, (s, e) in enumerate(bounds):
        sep = lines[cur:s]
        if k == 0:
            # head 与第一组的组注释在同一段里，按「最后一个空行」切开
            if any(x.strip() == "" for x in sep):
                cut = max(i for i, x in enumerate(sep) if x.strip() == "")
                head, sep = sep[:cut + 1], sep[cut + 1:]
            else:
                head, sep = sep, []
        items.append({"sep": sep, "lines": lines[s:e]})
        cur = e
    return items, head, lines[cur:]


class Doc(object):
    def __init__(self, lines):
        self.items, self.head, self.tail = scan_blocks(lines)

    @property
    def blocks(self):
        return [it["lines"] for it in self.items]

    def render(self):
        out = list(self.head)
        for it in self.items:
            out.extend(it["sep"])
            out.extend(it["lines"])
        out.extend(self.tail)
        # 收尾：折叠连续空行（移动会让空行叠在一起），并保证文件以单个换行结束
        folded = []
        for line in out:
            if line.strip() == "" and folded and folded[-1].strip() == "":
                continue
            folded.append(line)
        while folded and folded[-1].strip() == "":
            folded.pop()
        folded.append("")
        return folded

    def fields(self, i):
        """第 i 块（0 起）的字段 → 原始值字符串。"""
        out = {}
        for line in self.blocks[i]:
            m = FIELD_RE.match(line)
            if m:
                out[m.group(1)] = m.group(2)
        return out

    def index_of(self, no):
        if not (1 <= no <= len(self.blocks)):
            raise ValueError("顺序号 %s 越界（清单里共 %d 张）" % (no, len(self.blocks)))
        return no - 1


# ---------------------------------------------------------------- 值的写法（YAML 标量）

SAFE_BARE = re.compile(r"^[\w\u3000-\u9fff][\w\u3000-\u9fff .·、:：/()（）\-]*$")


def yaml_scalar(v):
    """写成清单里的样子。清单的约定：值里不含「 #」（行尾注释要靠它切），也不含换行。
    中文/URL 直接裸写（清单里就长这样），含 `: ` 开头、`#`、引号这类才加双引号。"""
    v = str(v).strip()
    if not v:
        raise ValueError("值不能为空")
    if "\n" in v or "\r" in v:
        raise ValueError("值里不能有换行")
    if re.search(r"\s#", v) or v.startswith("#"):
        raise ValueError("值里不能含「空格 + #」（那是行尾注释的写法）")
    if SAFE_BARE.match(v) and not re.search(r":\s", v):
        return v
    return '"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"'


def set_field(block, key, value):
    """在块里改一个字段：找到就**原地**改（保留它自己的缩进与位置），没找到就在 style 之后补一行。
    原地改是这份脚本的核心价值 —— 重排/重写整块会让 diff 变成「整条卡都改了」，评审时读不出改了什么。"""
    pat = re.compile(r"^(\s+)%s:\s?(.*)$" % re.escape(key))
    for idx, line in enumerate(block):
        m = pat.match(line)
        if not m:
            continue
        old = m.group(2)
        comment = ""
        cm = re.search(r"\s+(#.*)$", old)
        if cm and not old.strip().startswith("#"):
            comment = "  " + cm.group(1)
        block[idx] = "%s%s: %s%s" % (m.group(1), key, value, comment)
        return True
    # 补一行：插在 style 之后（清单的字段顺序是 image/src/crop/pad/flat/series/name/style/rank/…）
    indent = "  "
    for idx, line in enumerate(block):
        m = re.match(r"^(\s+)style:", line)
        if m:
            indent = m.group(1)
            block.insert(idx + 1, "%s%s: %s" % (indent, key, value))
            return True
    block.append("%s%s: %s" % (indent, key, value))
    return True


# ---------------------------------------------------------------- 明度

def card_lum(path):
    """卡面灰度均值。**与 lab/工具/craftfit.py 的 lum() 同款**：转灰度 → BILINEAR 缩到 60×84 → 取均值。
    60×84 这个尺寸是那次实测定下来的（够稳、又比读全图快一个量级）。"""
    from PIL import Image
    import numpy as np

    im = Image.open(path).convert("L").resize((60, 84), Image.BILINEAR)
    return float(np.asarray(im, dtype="float32").mean())


# ---------------------------------------------------------------- list

def build_cards(doc, manifest_path, labels, avail):
    """清单 → 面板要的卡片数组（含明度体检）。"""
    lum_state = {"ok": True, "method": "PIL 灰度 → 缩到 60×84 → 均值（与 lab/工具/craftfit.py 同款）",
                 "error": None}
    try:
        import PIL  # noqa: F401
    except ImportError as exc:
        lum_state.update(ok=False, error="没有 Pillow，明度体检这一列只能留空：%s" % exc)

    cards = []
    for i in range(len(doc.blocks)):
        f = doc.fields(i)
        image = strip_value(f.get("image", ""))
        raw_style = strip_value(f.get("style", ""))
        rank = strip_value(f.get("rank", "")) or "collector"
        name = strip_value(f.get("name", ""))
        series = strip_value(f.get("series", ""))
        exempt = strip_value(f.get("craft_exempt", "")).lower() in ("true", "yes", "1")
        face_rel = os.path.join("assets", image) if image else ""
        face_abs = os.path.join(ROOT, face_rel)
        card = {
            "no": i + 1,
            "name": name,
            "series": series,
            "rank": rank,
            "rankLabel": RANK_LABEL.get(rank, rank),
            "style": raw_style,
            "styleLabel": labels.get(raw_style, raw_style),
            "image": image,
            "face": image if image.startswith("images/") else "",
            "faceMtime": int(os.path.getmtime(face_abs) * 1000) if os.path.exists(face_abs) else 0,
            "hasFace": os.path.exists(face_abs),
            "src": strip_value(f.get("src", "")),
            "credit": strip_value(f.get("credit", "")),
            "craftExempt": exempt,
            "L": None,
            "band": None,
            "bandLabel": None,
            "allowed": [],
            "judged": False,
            "exempt": exempt,
            "violation": False,
            "recommended": None,
            "note": "",
        }
        L = None
        if lum_state["ok"] and card["hasFace"]:
            try:
                L = round(card_lum(face_abs), 1)
            except Exception as exc:  # 单张读不出来不该让整页空白
                card["note"] = "卡面读不出来：%s" % exc
        elif lum_state["ok"]:
            card["note"] = "卡面文件不在：%s" % face_rel
        card["L"] = L
        if L is not None:
            band_key, band_label = band_of(L)
            allowed = [craft_entry(c, avail, labels) for c in allowed_crafts(band_key)]
            card["band"] = band_key
            card["bandLabel"] = band_label
            card["allowed"] = allowed
            craft = CODE_TO_CRAFT.get(raw_style)
            if craft is None:
                card["note"] = (card["note"] + " " if card["note"] else "") + \
                    "「%s」没落在 §十八 的八种工艺里，不判定" % raw_style
            else:
                card["judged"] = True
                card["violation"] = (craft not in [c["craft"] for c in allowed]) and not exempt
            if card["judged"]:
                for c in allowed:
                    if c["available"]:
                        card["recommended"] = c["code"]
                        break
            # 一个具体动作：违规卡的「一键改成」按钮要写什么（recommended = 代码，recommendCraft = 中文名）
            card["recommendCraft"] = next((c["craft"] for c in allowed if c["code"] == card["recommended"]), None)
        cards.append(card)
    cards.sort(key=lambda c: c["no"])
    return cards, lum_state


def do_list(args):
    manifest = os.path.abspath(args.manifest)
    if not os.path.exists(manifest):
        fail("找不到清单：%s" % manifest)
    doc = Doc(read_text(manifest).split("\n"))
    labels = style_labels()
    avail = available_styles()
    cards, lum_state = build_cards(doc, manifest, labels, avail)
    bands = [{"key": k, "label": l, "min": lo, "max": hi, "crafts": crafts}
             for k, l, lo, hi, crafts in CRAFT_RULE]
    summary = {
        "total": len(cards),
        "violations": sum(1 for c in cards if c["violation"]),
        "exempt": sum(1 for c in cards if c["craftExempt"]),
        "unjudged": sum(1 for c in cards if not c["judged"]),
        "noFace": sum(1 for c in cards if not c["hasFace"]),
        "byBand": {b["label"]: sum(1 for c in cards if c["band"] == b["key"]) for b in bands},
        "byRank": {code: sum(1 for c in cards if c["rank"] == code) for code, _ in RANKS},
        "unknownStyles": sorted({c["style"] for c in cards if c["style"] and c["style"] not in avail}),
    }
    out = {
        "ok": True,
        "manifest": os.path.relpath(manifest, ROOT).replace("\\", "/"),
        "count": len(cards),
        "cards": cards,
        "bands": bands,
        "ranks": [{"code": c, "label": l} for c, l in RANKS],
        "styles": [{"code": c, "label": labels.get(c, c), "available": True} for c in sorted(avail)],
        "crafts": [{"craft": craft, "codes": codes} for craft, codes in CRAFT_CODES.items()],
        "lightness": lum_state,
        "summary": summary,
    }
    if args.json:
        sys.stdout.write(json.dumps(out, ensure_ascii=False))
        return
    sys.stdout.write("清单 %s：%d 张卡\n" % (out["manifest"], len(cards)))
    for c in cards:
        flag = "违规" if c["violation"] else ("豁免" if c["exempt"] else ("不判定" if not c["judged"] else "ok"))
        sys.stdout.write("%2d %-8s %-6s %-12s L=%s %s %s\n" % (
            c["no"], c["name"], c["rank"], c["style"], c["L"], c["bandLabel"] or "?", flag))


# ---------------------------------------------------------------- apply

ALLOWED_FIELDS = ("name", "series", "rank", "style")


def validate_ops(ops):
    errors = []
    if not isinstance(ops, list) or not ops:
        return ["ops 必须是至少一条的数组"]
    for i, op in enumerate(ops):
        where = "第 %d 条 op" % (i + 1)
        if not isinstance(op, dict):
            errors.append("%s 不是对象" % where)
            continue
        t = op.get("type")
        if t not in ("update", "move", "delete"):
            errors.append("%s 的 type 不认识：%r" % (where, t))
            continue
        if not isinstance(op.get("index"), int) or op["index"] <= 0:
            errors.append("%s 缺 index（顺序号，1 起）" % where)
        if t == "update":
            fields = op.get("fields") or {}
            if not isinstance(fields, dict) or not fields:
                errors.append("%s 的 fields 是空的" % where)
            for k in fields:
                if k not in ALLOWED_FIELDS:
                    errors.append("%s 想改 %r —— 面板只允许改 %s" % (where, k, " / ".join(ALLOWED_FIELDS)))
        if t == "move":
            if not isinstance(op.get("to"), int) or op["to"] <= 0:
                errors.append("%s 缺 to（移完排第几位，1 起）" % where)
    return errors


def op_value(key, raw, labels, avail):
    v = yaml_scalar(raw)
    if key == "rank" and strip_value(str(raw)) not in RANK_LABEL:
        raise ValueError("rank 只能是 %s" % " / ".join(code for code, _ in RANKS))
    if key == "style" and strip_value(str(raw)) not in avail:
        raise ValueError("style「%s」不在仓库的工艺表里（%s）" % (strip_value(str(raw)), " / ".join(sorted(avail))))
    return v


def selfcheck(lines):
    """写盘前的自检：把改完的文本再解析一遍，卡数、必备字段、唯一性都对得上才敢落盘。
    这不是重复 check-deck.mjs 的活（那边核的是渲染链与图，要跑 node）；这里只防「手术刀切歪」——
    少了一张卡、字段被吃掉、两条卡撞名，这几类错误一旦落盘要靠 git 才能看出来。"""
    try:
        doc = Doc(lines)
    except SystemExit:
        raise
    problems = []
    seen_img, seen_name = set(), set()
    for i in range(len(doc.blocks)):
        f = doc.fields(i)
        name = strip_value(f.get("name", ""))
        image = strip_value(f.get("image", ""))
        for key in ("image", "src", "name", "style", "rank"):
            if not strip_value(f.get(key, "")):
                problems.append("第 %d 条缺 %s" % (i + 1, key))
        if image in seen_img:
            problems.append("产物重复：%s" % image)
        seen_img.add(image)
        key = "%s|%s" % (strip_value(f.get("series", "")), name)
        if key in seen_name:
            problems.append("同名同系列：%s" % key)
        seen_name.add(key)
    return problems


def do_apply(args):
    manifest = os.path.abspath(args.manifest)
    if not os.path.exists(manifest):
        fail("找不到清单：%s" % manifest)
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except ValueError as exc:
        fail("stdin 不是合法 JSON：%s" % exc)
    ops = payload.get("ops")
    errors = validate_ops(ops)
    if errors:
        fail("；".join(errors))
    expected = payload.get("expectCount")
    old_text = read_text(manifest)
    old_lines = old_text.split("\n")
    doc = Doc(old_lines)
    if isinstance(expected, int) and expected != len(doc.blocks):
        fail("清单变了：面板以为有 %d 张，磁盘上是 %d 张（别的会话改过？刷新一下再改）"
             % (expected, len(doc.blocks)))

    labels = style_labels()
    avail = available_styles()
    # 试改：所有 op 先在一份拷贝上跑通，任何一条报错就整批不写（不做「一半成功」）
    trial = Doc(list(old_lines))
    results = []
    for i, op in enumerate(ops):
        t, no = op["type"], op["index"]
        try:
            idx = trial.index_of(no)
            if t == "update":
                f = trial.fields(idx)
                detail = []
                for key, raw in op["fields"].items():
                    value = op_value(key, raw, labels, avail)
                    if strip_value(f.get(key, "")) == strip_value(value):
                        detail.append("%s 不变" % key)
                        continue
                    set_field(trial.blocks[idx], key, value)
                    detail.append("%s: %s → %s" % (key, strip_value(f.get(key, "")) or "（无）", strip_value(value)))
                    f[key] = value
                results.append({"op": i + 1, "type": t, "index": no, "ok": True,
                                "name": strip_value(f.get("name", "")), "detail": "，".join(detail)})
            elif t == "move":
                to = op["to"]
                if not (1 <= to <= len(trial.items)):
                    raise ValueError("to=%d 越界（清单里共 %d 张）" % (to, len(trial.items)))
                # 整「项」搬家（卡自己的行 + 它的组注释）：只挪行会留下错位的注释
                trial.items.insert(to - 1, trial.items.pop(idx))
                results.append({"op": i + 1, "type": t, "index": no, "ok": True,
                                "name": strip_value(trial.fields(to - 1).get("name", "")),
                                "detail": "顺序：第 %d 位 → 第 %d 位" % (no, to)})
            else:  # delete
                it = trial.items.pop(idx)
                nm = strip_value(trial.dict_fields(it["lines"]).get("name", ""))
                comments = [l for l in it["sep"] if l.lstrip().startswith("#")]
                note = ""
                if comments:
                    # 组注释是给整组写的：这一组还有别的卡就交给它下面那张，否则跟着删（并报出来）
                    nxt = trial.items[idx] if idx < len(trial.items) else None
                    if nxt is not None and not any(l.lstrip().startswith("#") for l in nxt["sep"]):
                        nxt["sep"] = comments + nxt["sep"]
                        note = "（组注释 %d 行交给下面那张卡）" % len(comments)
                    else:
                        note = "（连带删掉组注释 %d 行）" % len(comments)
                results.append({"op": i + 1, "type": t, "index": no, "ok": True, "name": nm,
                                "detail": "删除第 %d 条%s" % (no, note),
                                "droppedComments": comments if "删掉" in note else []})
        except ValueError as exc:
            fail("第 %d 条 op 失败：%s" % (i + 1, exc))

    new_lines = trial.render()
    new_text = "\n".join(new_lines) if new_lines[-1] != "" else "\n".join(new_lines[:-1]) + "\n"
    problems = selfcheck(new_text.split("\n"))
    if problems:
        fail("改完自检不过，**没有写盘**：%s" % "；".join(problems))
    # 自检过了才生成 diff：这两件事的顺序不能反 —— 自检不过时不该给出「看起来能落盘」的 diff
    check_note = "通过：%s 条卡，字段齐全、产物与（系列+名字）无重复" % len(Doc(new_text.split("\n")).blocks)
    diff = "\n".join(difflib.unified_diff(
        old_text.split("\n"), new_text.split("\n"),
        fromfile=os.path.relpath(manifest, ROOT).replace("\\", "/") + "（改前）",
        tofile=os.path.relpath(manifest, ROOT).replace("\\", "/") + "（改后）",
        lineterm="", n=3))
    changed = [r for r in results if not r["detail"].endswith("不变")]
    written = False
    if not args.dry_run:
        with io.open(manifest, "w", encoding="utf-8", newline="\n") as f:
            f.write(new_text)
        written = True
    out = {
        "ok": True,
        "dryRun": bool(args.dry_run),
        "written": written,
        "manifest": os.path.relpath(manifest, ROOT).replace("\\", "/"),
        "countBefore": len(Doc(old_lines).blocks),
        "countAfter": len(Doc(new_text.split("\n")).blocks),
        "results": results,
        "diff": diff,
        "selfcheck": check_note,
        "changed": [r["detail"] for r in changed],
    }
    sys.stdout.write(json.dumps(out, ensure_ascii=False))
    sys.stdout.write("\n")


# ---------------------------------------------------------------- CLI

def main():
    ap = argparse.ArgumentParser(description="收藏库清单的写盘入口与明度体检")
    sub = ap.add_subparsers(dest="cmd")
    p_list = sub.add_parser("list", help="只读：清单 + 明度体检")
    p_list.add_argument("--json", action="store_true", help="输出 JSON（管理页用）")
    p_list.add_argument("--manifest", default=DEFAULT_MANIFEST)
    p_apply = sub.add_parser("apply", help="改清单（ops 从 stdin 的 JSON 读）")
    p_apply.add_argument("--stdin", action="store_true", help="从 stdin 读 ops（管理页始终这么调）")
    p_apply.add_argument("--dry-run", action="store_true", help="只出 diff，不写盘")
    p_apply.add_argument("--manifest", default=DEFAULT_MANIFEST)
    args = ap.parse_args()
    if args.cmd == "list":
        do_list(args)
    elif args.cmd == "apply":
        do_apply(args)
    else:
        ap.print_help()
        sys.exit(2)


# Doc 需要一个从块取字段的小工具（delete 的结果里要报被删的卡名）
Doc.dict_fields = lambda self, block: {m.group(1): m.group(2)
                                       for m in (FIELD_RE.match(l) for l in block) if m}

if __name__ == "__main__":
    main()
