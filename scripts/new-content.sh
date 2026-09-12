#!/usr/bin/env bash
# 新内容脚手架：一次建好文章 / 课程章（含笔记/作业/实验）/ 项目 / 分层项目文档，并负责删除内容。
#
# 用法：
#   bash scripts/new-content.sh post    <slug> [--title 标题] [--tags A,B] [--categories X] [--series Y] [--publish]
#   bash scripts/new-content.sh course  <课程> [--title 标题] [--unit 章] [--tags A,B] [--categories X] [--publish]
#   bash scripts/new-content.sh chapter <课程> <章节标题> [--materials notes,homework,lab|none] [--publish]
#   bash scripts/new-content.sh notes    <课程> <章节> [--dir 目录名] [--title 标题] [--publish]
#   bash scripts/new-content.sh homework <课程> <章节> [--dir 目录名] [--title 标题] [--publish]
#   bash scripts/new-content.sh lab      <课程> <章节> [--dir 目录名] [--title 标题] [--publish]
#   bash scripts/new-content.sh project <项目> [--title 标题] [--tags A,B] [--repo URL] [--layered] [--publish]
#   bash scripts/new-content.sh sub     <项目> <子项目> [--title 标题] [--publish]
#   bash scripts/new-content.sh doc     <项目路径> <文档名> [--title 标题] [--tags A,B] [--no-math] [--publish]
#   bash scripts/new-content.sh section <路径> --title 标题 [--description 描述]
#                                                       建 section 列表页（content/<路径>/_index.md）
#   bash scripts/new-content.sh remove  <content 路径> [--with-bundle] [--dry-run]
#                                                       删除一个页面；index.md/_index.md 可连整个目录删
#   bash scripts/new-content.sh tags                     列出标签 / 分类词表
#   bash scripts/new-content.sh add-term <tags|categories> <词条> [--check]
#                                                        只往词表加词条（不建内容）；--check 只校验不写
#
# 通用选项（除 remove / tags / add-term / section 外都接受；section 只认 --title 与 --description）：
#   --date YYYY-MM-DD    覆盖骨架里的 date（默认今天，由 archetype 写入）
#   --description 文本   覆盖骨架里的 description
#   --body-stdin         正文从标准输入读入，整体替换骨架的占位正文（管理页拖入 .md 用）。
#                        只作用于该子命令创建的**主页面**：chapter 作用于入口页 _index.md，
#                        材料页不带正文；--layered 项目作用于 _index.md。
#
# 设计要点：
#   - front matter 的唯一事实源是 archetypes/：本脚本只调用 `hugo new content --kind`，
#     不另抄一份 front matter 模板，避免两处漂移。
#   - 多文件结构（一章 = _index.md + 若干材料页，一次建好）是 hugo new 做不到的部分。
#   - 材料页有三种：笔记（notes）/ 作业（homework）/ 实验（lab）。章目录下的**任何** leaf bundle
#     都会被 layouts/courses/chapter.html 当作材料列出（标题、图标、顺序取自 front matter，与目录名无关），
#     所以同一章可以有第二个实验（--dir lab-02）。这里不做「章 = 固定两页」的假设。
#   - 标签只从 data/taxonomy.yaml 里选；要新词必须显式加 --new-tag，脚本会把它写进词表。
#   - 默认 draft: true（与 archetype 一致）；确认写完后用 --publish 或手工改 false。
#   - 删除也只在这里实现（管理页调 `remove`），Node 侧不另写一套路径规则。
#   - section 列表页（_index.md）不允许单独删除：它一没，整个分区的列表页就没了（见 remove 的护栏）。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CONTENT_DIR="content"
TAXONOMY="data/taxonomy.yaml"

die() { echo "✗ $*" >&2; exit 1; }
info() { echo "▸ $*"; }
ok() { echo "  ✓ $*"; }
warn() { echo "  ! $*" >&2; }

usage() {
  cat <<'EOF'
新内容脚手架。用法：
  new-content.sh post    <slug> [--title 标题] [--tags A,B] [--categories X] [--series Y] [--publish]
  new-content.sh course  <课程> [--title 标题] [--unit 章] [--tags A,B] [--categories X] [--publish]
  new-content.sh chapter <课程> <章节标题> [--materials notes,homework,lab|none] [--publish]
  new-content.sh notes    <课程> <章节> [--dir 目录名] [--title 标题] [--publish]
  new-content.sh homework <课程> <章节> [--dir 目录名] [--title 标题] [--publish]
  new-content.sh lab      <课程> <章节> [--dir 目录名] [--title 标题] [--publish]
  new-content.sh project <项目> [--title 标题] [--tags A,B] [--repo URL] [--layered] [--publish]
  new-content.sh sub     <项目> <子项目> [--title 标题] [--publish]
  new-content.sh doc     <项目路径> <文档名> [--title 标题] [--tags A,B] [--no-math] [--publish]
  new-content.sh section <路径> --title 标题 [--description 描述]
                                          建 section 列表页（content/<路径>/_index.md）；
                                          路径相对 content/，如 posts 或 projects/CMC2026/approach
  new-content.sh remove  <content 路径> [--with-bundle] [--dry-run]
  new-content.sh tags                     列出标签 / 分类词表
  new-content.sh add-term <tags|categories> <词条> [--check]
                                          只往词表加词条（不建内容）；--check 只校验不写

说明：
  --tags       逗号分隔，必须来自 data/taxonomy.yaml；拼写会自动按词表规范化
  --new-tag    允许词表里没有的新标签，并自动追加进词表
  --check      配合 add-term：只做校验（含重名/大小写检查），不写词表
  --publish    直接 draft: false（默认仍是草稿）
  --materials  只给 chapter：要一并建哪些材料页，逗号分隔；默认 notes,homework；
               none（或空）表示只建章节入口页，材料之后再单独补
  --dir        只给 notes/homework/lab：材料页的目录名，默认与子命令同名；
               同一章要加第二个实验时用 --dir lab-02
  --date YYYY-MM-DD  覆盖骨架里的 date（默认今天）；必须 YYYY-MM-DD 开头
  --description 文本 覆盖骨架里的 description
  --body-stdin  正文从标准输入读入，替换骨架的占位正文；只作用于该子命令创建的
                主页面（chapter 作用于入口页 _index.md，材料页不带正文）。
                stdin 为空时保留骨架正文，不动文件。
  --with-bundle  只给 remove：路径是 index.md/_index.md 时连它所在的整个目录一起删
  --dry-run      只给 remove：只列出会删掉哪些文件，不动磁盘
  不带 --tags 且在终端里运行时，会列出词表让你按编号挑
EOF
}

# ---------- 词表 ----------
list_terms() { # $1 = tags | categories
  awk -v key="$1" '
    /^[A-Za-z_]+:/ { in_sec = ($0 ~ "^" key ":"); next }
    in_sec && /^[[:space:]]*-[[:space:]]/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]+/, "", line)
      sub(/[[:space:]]+#.*$/, "", line)
      if (line != "") print line
    }
  ' "$TAXONOMY"
}

add_term() { # $1 = 词条, $2 = tags|categories
  local term="$1" key="$2"
  awk -v t="$term" -v key="$key" '
    {
      if ($0 ~ /^[A-Za-z_]+:/) {
        if (in_sec && !done) { print "  - " t; done = 1; printf "%s", blanks; blanks = "" }
        in_sec = ($0 ~ "^" key ":")
        print; next
      }
      if (in_sec && $0 ~ /^[[:space:]]*-[[:space:]]/) { print; next }
      if (in_sec && $0 ~ /^[[:space:]]*$/) { blanks = blanks $0 "\n"; next }
      if (blanks != "") { printf "%s", blanks; blanks = "" }
      print
    }
    END { if (in_sec && !done) { printf "%s", blanks; print "  - " t } }
  ' "$TAXONOMY" > "$TAXONOMY.tmp"
  mv "$TAXONOMY.tmp" "$TAXONOMY"
}

# 校验标签：命中词表则规范化拼写，未命中则（--new-tag 时）写入词表，否则报错。
# 结果放全局 NORMALIZED_TAGS。
normalize_tags() { # $1 = 逗号分隔标签串, $2 = 是否允许新词(1/0)
  local raw="$1" allow_new="$2"
  local out=() unknown=() t hit canon lc
  local IFS=','
  for t in $raw; do
    t="$(printf '%s' "$t" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$t" ] && continue
    hit=""
    while IFS= read -r canon; do
      lc="$(printf '%s' "$t" | tr '[:upper:]' '[:lower:]')"
      if [ "$canon" = "$t" ] || [ "$(printf '%s' "$canon" | tr '[:upper:]' '[:lower:]')" = "$lc" ]; then
        hit="$canon"; break
      fi
      case "$canon" in *"$t"*|"$t"*) hit="$canon"; break ;; esac
    done < <(list_terms tags)
    if [ -n "$hit" ]; then
      [ "$hit" != "$t" ] && warn "标签「$t」按词表规范为「$hit」"
      out+=("$hit")
    else
      unknown+=("$t")
      out+=("$t")
    fi
  done

  NORMALIZED_TAGS=""
  if [ "${#out[@]}" -gt 0 ]; then
    NORMALIZED_TAGS="$(IFS=','; echo "${out[*]}")"
  fi

  if [ "${#unknown[@]}" -gt 0 ]; then
    if [ "$allow_new" = "1" ]; then
      for t in "${unknown[@]}"; do
        add_term "$t" tags
        ok "新标签「$t」已写入 $TAXONOMY"
      done
    else
      warn "以下标签不在词表中：$(IFS=','; echo "${unknown[*]}")"
      warn "确认要新词就加 --new-tag（脚本会自动写入 $TAXONOMY），或改用词表里的词："
      list_terms tags | paste -sd'、' - >&2
      return 1
    fi
  fi
  return 0
}

pick_tags() { # 交互式挑选，结果走 stdout（菜单走 stderr）
  local -a terms=()
  local t
  while IFS= read -r t; do terms+=("$t"); done < <(list_terms tags)
  if [ "${#terms[@]}" -eq 0 ]; then echo ""; return 0; fi
  echo "可用标签（$TAXONOMY）：" >&2
  local i=1
  for t in "${terms[@]}"; do printf '  %2d) %s\n' "$i" "$t" >&2; i=$((i + 1)); done
  printf '选择编号（逗号分隔，直接回车跳过）: ' >&2
  local sel
  if ! read -r sel; then sel=""; fi
  if [ -z "$sel" ]; then echo ""; return 0; fi
  local picked=() n
  local IFS=','
  for n in $sel; do
    n="$(printf '%s' "$n" | sed 's/[^0-9]//g')"
    [ -z "$n" ] && continue
    if [ "$n" -ge 1 ] && [ "$n" -le "${#terms[@]}" ]; then
      picked+=("${terms[$((n - 1))]}")
    fi
  done
  if [ "${#picked[@]}" -eq 0 ]; then echo ""; return 0; fi
  IFS=','; echo "${picked[*]}"
}

# ---------- front matter 读写 ----------
fm_set() { # $1=文件 $2=行首正则 $3=新行；首个 --- 区块内替换首个匹配行，无匹配则插入到结束 --- 之前
  local f="$1" kre="$2" repl="$3"
  awk -v kre="$kre" -v repl="$repl" '
    BEGIN { fm = 0; done = 0 }
    fm == 0 && /^---[[:space:]]*$/ { fm = 1; print; next }
    fm == 1 && /^---[[:space:]]*$/ {
      if (!done) { print repl; done = 1 }
      fm = 2; print; next
    }
    fm == 1 && !done && $0 ~ kre { print repl; done = 1; next }
    { print }
  ' "$f" > "$f.tmp"
  mv "$f.tmp" "$f"
}

yaml_list() { # a,b → ["a", "b"]
  local out="" v
  local IFS=','
  for v in $1; do
    v="$(printf '%s' "$v" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/\\/\\\\/g; s/"/\\"/g')"
    [ -z "$v" ] && continue
    out="${out:+$out, }\"$v\""
  done
  printf '[%s]' "$out"
}

yaml_str() { printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g')"; }

# ---------- 创建 ----------
LAST_FILE=""
new_file() { # $1=相对 content 的路径 $2=kind
  local path="$1" kind="$2" out
  if [ -e "$CONTENT_DIR/$path" ]; then
    die "已存在，拒绝覆盖：$CONTENT_DIR/$path"
  fi
  mkdir -p "$(dirname "$CONTENT_DIR/$path")"
  if ! out="$(hugo new content "$path" --kind "$kind" 2>&1)"; then
    die "创建失败：$CONTENT_DIR/$path
$out"
  fi
  LAST_FILE="$CONTENT_DIR/$path"
  ok "$LAST_FILE"
}

apply_meta() { # $1=文件：套用 TITLE / PUBLISH
  local f="$1"
  if [ -n "$TITLE" ]; then fm_set "$f" '^title: ' "title: $(yaml_str "$TITLE")"; fi
  if [ "$PUBLISH" = "1" ]; then fm_set "$f" '^draft: ' 'draft: false'; fi
  return 0
}

# 所有子命令共用的两个可选覆盖项。放在这里而不是 apply_meta 里，是因为各子命令设置 title
# 的方式不同（章节用位置参数、子项目/文档有各自的缺省值），混在一起容易互相覆盖。
apply_common() { # $1=文件：套用 DESCRIPTION / NEWDATE
  local f="$1"
  if [ -n "$DESC" ]; then fm_set "$f" '^description: ' "description: $(yaml_str "$DESC")"; fi
  if [ -n "$NEWDATE" ]; then fm_set "$f" '^date: ' "date: $NEWDATE"; fi
  return 0
}

# 正文从 stdin 读入，整体替换 front matter 之后的内容（骨架的占位正文被替换掉）。
# stdin 为空时保留骨架正文：空正文多半是调用方出错，静默清空比报错更糟。
# 只允许消费一次（BODY_CONSUMED）——chapter 会建多个文件，正文只属于入口页。
set_body_from_stdin() { # $1=文件
  local f="$1" head body
  if [ "$BODY_CONSUMED" = "1" ]; then return 0; fi
  BODY_CONSUMED=1
  body="$(mktemp)"
  cat > "$body"
  if [ ! -s "$body" ]; then
    rm -f "$body"
    warn "stdin 是空的，保留骨架正文：$f"
    return 0
  fi
  # 保证正文以换行结尾（拖进来的文件可能没有），其余字节原样保留
  if [ -n "$(tail -c 1 "$body")" ]; then printf '\n' >> "$body"; fi
  head="$(mktemp)"
  awk 'BEGIN { fm = 0 } fm < 2 { print } /^---[[:space:]]*$/ { fm++ }' "$f" > "$head"
  # 正常情况头部是「--- + front matter + ---」；没有闭合的 --- 时退回整份替换
  if [ "$(grep -c '^---[[:space:]]*$' "$head")" -lt 2 ]; then cp "$body" "$head"; fi
  cat "$head" "$body" > "$f.tmp"
  mv "$f.tmp" "$f"
  rm -f "$head" "$body"
  return 0
}

# 只在调用方传了 --body-stdin 时才动正文
apply_body() { # $1=文件
  if [ "$BODY_STDIN" = "1" ]; then set_body_from_stdin "$1"; fi
  return 0
}

write_tags() { # $1=文件 $2=行首正则 $3=输出行前缀（含缩进）
  local f="$1" kre="$2" prefix="$3"
  if [ -z "$NORMALIZED_TAGS" ]; then return 0; fi
  fm_set "$f" "$kre" "${prefix}$(yaml_list "$NORMALIZED_TAGS")"
  return 0
}

# ---------- 子命令 ----------
cmd_post() {
  [ "$#" -ge 1 ] || die "用法：new-content.sh post <slug> [选项]"
  local slug="$1"
  case "$slug" in *[!A-Za-z0-9._-]*) warn "slug「$slug」含非 ASCII 字符，文章 URL 会变成百分号编码（建议用英文短横线）" ;; esac
  new_file "posts/$slug/index.md" default
  local f="$LAST_FILE"
  apply_meta "$f"
  write_tags "$f" '^tags: ' 'tags: '
  if [ -n "$CATS" ]; then fm_set "$f" '^categories: ' "categories: $(yaml_list "$CATS")"; fi
  if [ -n "$SERIES" ]; then fm_set "$f" '^series: ' "series: $(yaml_list "$SERIES")"; fi
  apply_common "$f"
  apply_body "$f"
  return 0
}

cmd_course() {
  [ "$#" -ge 1 ] || die "用法：new-content.sh course <课程> [选项]"
  local name="$1"
  new_file "courses/$name/_index.md" courses
  local f="$LAST_FILE"
  apply_meta "$f"
  if [ -n "$UNIT" ]; then fm_set "$f" '^unit: ' "unit: $(yaml_str "$UNIT")"; fi
  # 课程标签写在 cascade 里（缩进 4 空格），只下发给 regular page
  write_tags "$f" '^    tags: ' '    tags: '
  if [ -n "$CATS" ]; then fm_set "$f" '^    categories: ' "    categories: $(yaml_list "$CATS")"; fi
  apply_common "$f"
  apply_body "$f"
  info "下一步：bash scripts/new-content.sh chapter $name <章节标题>"
  return 0
}

# ---------- 课程材料页（笔记 / 作业 / 实验） ----------
#
# 三种材料共用一份实现。章目录下**任何** leaf bundle 都会被 layouts/courses/chapter.html
# 按 weight 列成材料卡片，标题与图标取自 front matter，与目录名无关 —— 所以目录名只影响 URL。
# --dir 因此可以给同一个章加第二个实验（lab-02），此时权重按同级最大值接着排。
MATERIAL_KINDS="notes homework lab"

is_material_kind() {
  case " $MATERIAL_KINDS " in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

# 材料页的权重：同级材料是 leaf bundle（<目录>/index.md），与 next_weight 认的
# `*/_index.md`、`*.md` 不是一回事，所以必须单独数一遍。
next_material_weight() { # $1 = 章节目录：同级材料页的最大 weight + 1
  local d="$1" max=0 f w
  for f in "$d"/*/index.md; do
    [ -f "$f" ] || continue
    w="$(sed -n 's/^weight:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$f" | head -1)"
    if [ -n "$w" ] && [ "$w" -gt "$max" ]; then max="$w"; fi
  done
  echo $((max + 1))
}

# 规范化 --materials：认 none/空（= 不建材料页）、去重、按固定顺序输出到 stdout。
# 非法类型直接 die。必须在建任何文件之前调用——校验失败要干净中止，不留半成品。
normalize_materials() { # $1 = 逗号分隔
  local raw="$1" norm="" m k
  [ -n "$raw" ] || { echo ""; return 0; }
  for m in $(printf '%s' "$raw" | tr ',' ' '); do
    m="$(printf '%s' "$m" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')"
    [ -z "$m" ] && continue
    if [ "$m" = "none" ]; then echo ""; return 0; fi
    if ! is_material_kind "$m"; then
      die "未知材料类型：$m（只支持 notes / homework / lab，或 none 表示不建材料页）"
    fi
    norm="${norm:+$norm,}$m"
  done
  local out=""
  for k in $MATERIAL_KINDS; do
    case ",$norm," in *",$k,"*) out="${out:+$out,}$k" ;; esac
  done
  echo "$out"
}

create_material() { # $1 = notes|homework|lab, $2 = 课程, $3 = 章节目录名
  local kind="${1:-}" course="${2:-}" chapter="${3:-}"
  [ -n "$kind" ] && [ -n "$course" ] && [ -n "$chapter" ] ||
    die "用法：new-content.sh <notes|homework|lab> <课程> <章节> [--dir 目录名] [--title 标题] [--publish]"
  local dir="${MATERIAL_DIR:-$kind}" w
  if [ ! -f "$CONTENT_DIR/courses/$course/$chapter/_index.md" ]; then
    die "找不到章节入口页：$CONTENT_DIR/courses/$course/$chapter/_index.md"
  fi
  case "$chapter" in */*|*..*) die "章节目录名不合法：$chapter" ;; esac
  case "$dir" in */*|*..*) die "材料目录名不合法：$dir" ;; esac

  new_file "courses/$course/$chapter/$dir/index.md" "$kind"
  local f="$LAST_FILE"
  # 与类型同名的规范目录用骨架里的固定权重（笔记 1 / 作业 2 / 实验 3）；
  # 自定义目录名（第二个实验之类）按同级最大值接着排。
  if [ "$dir" != "$kind" ]; then
    w="$(next_material_weight "$CONTENT_DIR/courses/$course/$chapter")"
    fm_set "$f" '^weight: ' "weight: $w"
  fi
  # 只认显式传进来的 --title；chapter 子命令会把 TITLE 临时清空，免得章节标题被套到材料页上
  if [ -n "$TITLE" ]; then fm_set "$f" '^title: ' "title: $(yaml_str "$TITLE")"; fi
  if [ "$PUBLISH" = "1" ]; then fm_set "$f" '^draft: ' 'draft: false'; fi
  apply_common "$f"
  apply_body "$f"
  return 0
}

cmd_notes() { create_material notes "$@"; }
cmd_homework() { create_material homework "$@"; }
cmd_lab() { create_material lab "$@"; }

cmd_chapter() {
  [ "$#" -ge 2 ] || die "用法：new-content.sh chapter <课程> <章节标题> [--materials notes,homework,lab|none] [--publish]"
  local course="$1" title="$2"
  if [ ! -f "$CONTENT_DIR/courses/$course/_index.md" ]; then
    die "找不到课程主页：$CONTENT_DIR/courses/$course/_index.md（先用 course 子命令创建）"
  fi
  # 材料列表先校验完再动文件（见 normalize_materials）
  local mats
  mats="$(normalize_materials "$CHAPTER_MATERIALS")"
  local num=1 dir n
  for dir in "$CONTENT_DIR/courses/$course"/chapter-*; do
    [ -d "$dir" ] || continue
    n="${dir##*chapter-}"
    n="$((10#$n))"
    if [ "$n" -ge "$num" ]; then num=$((n + 1)); fi
  done
  local ch
  ch="$(printf 'chapter-%02d' "$num")"

  new_file "courses/$course/$ch/_index.md" chapter
  fm_set "$LAST_FILE" '^title: ' "title: $(yaml_str "$title")"
  fm_set "$LAST_FILE" '^weight: ' "weight: $num"
  if [ "$PUBLISH" = "1" ]; then fm_set "$LAST_FILE" '^draft: ' 'draft: false'; fi
  apply_common "$LAST_FILE"
  # 正文只给入口页，且必须在建材料页之前消费掉 stdin（BODY_CONSUMED 保证材料页拿不到正文）
  apply_body "$LAST_FILE"

  if [ -n "$mats" ]; then
    # 材料页不该继承章节的标题与目录名，这里临时清掉这两项
    local saved_title="$TITLE" saved_dir="$MATERIAL_DIR" m
    TITLE=""
    MATERIAL_DIR=""
    for m in $(printf '%s' "$mats" | tr ',' ' '); do
      create_material "$m" "$course" "$ch"
    done
    TITLE="$saved_title"
    MATERIAL_DIR="$saved_dir"
    info "材料页不要手写 tags：课程标签由课程主页 cascade 下发，写了反而会整体丢掉"
  else
    info "本章暂时只有入口页（--materials none）"
  fi
  info "补材料：bash scripts/new-content.sh notes|homework|lab $course $ch"
  return 0
}

cmd_project() {
  [ "$#" -ge 1 ] || die "用法：new-content.sh project <项目> [选项]"
  local name="$1"
  if [ "$LAYERED" = "1" ]; then
    new_file "projects/$name/_index.md" project-home
    local f="$LAST_FILE"
    apply_meta "$f"
    write_tags "$f" '^    tags: ' '    tags: '
    if [ -n "$CATS" ]; then fm_set "$f" '^    categories: ' "    categories: $(yaml_list "$CATS")"; fi
    apply_common "$f"
    apply_body "$f"
    info "下一步：bash scripts/new-content.sh sub $name <子项目>"
  else
    new_file "projects/$name/index.md" projects
    local f="$LAST_FILE"
    apply_meta "$f"
    write_tags "$f" '^tags: ' 'tags: '
    if [ -n "$CATS" ]; then fm_set "$f" '^categories: ' "categories: $(yaml_list "$CATS")"; fi
    if [ -n "$REPO" ]; then fm_set "$f" '^repo: ' "repo: $(yaml_str "$REPO")"; fi
    apply_common "$f"
    apply_body "$f"
  fi
  return 0
}

next_weight() { # $1=目录：同级 _index.md / *.md 的最大 weight + 1（不算目录自身的 _index.md）
  local d="$1" max=0 f w
  for f in "$d"/*/_index.md "$d"/*.md; do
    [ -f "$f" ] || continue
    if [ "$f" = "$d/_index.md" ]; then continue; fi
    w="$(sed -n 's/^weight:[[:space:]]*\([0-9]\{1,\}\).*/\1/p' "$f" | head -1)"
    if [ -n "$w" ] && [ "$w" -gt "$max" ]; then max="$w"; fi
  done
  echo $((max + 1))
}

cmd_sub() {
  [ "$#" -ge 2 ] || die "用法：new-content.sh sub <项目> <子项目> [选项]"
  local proj="$1" sub="$2" w
  if [ ! -f "$CONTENT_DIR/projects/$proj/_index.md" ]; then
    die "找不到分层项目主页：$CONTENT_DIR/projects/$proj/_index.md（先用 project --layered 创建）"
  fi
  w="$(next_weight "$CONTENT_DIR/projects/$proj")"
  new_file "projects/$proj/$sub/_index.md" project-section
  fm_set "$LAST_FILE" '^title: ' "title: $(yaml_str "${TITLE:-$sub}")"
  fm_set "$LAST_FILE" '^weight: ' "weight: $w"
  if [ "$PUBLISH" = "1" ]; then fm_set "$LAST_FILE" '^draft: ' 'draft: false'; fi
  apply_common "$LAST_FILE"
  apply_body "$LAST_FILE"
  info "子项目不用写 tags：由项目主页 cascade 下发"
  return 0
}

cmd_doc() {
  [ "$#" -ge 2 ] || die "用法：new-content.sh doc <项目路径> <文档名> [选项]"
  local proj="$1" name="$2" w
  name="${name%.md}"
  if [ ! -d "$CONTENT_DIR/projects/$proj" ]; then
    die "找不到目录：$CONTENT_DIR/projects/$proj"
  fi
  w="$(next_weight "$CONTENT_DIR/projects/$proj")"
  new_file "projects/$proj/$name.md" project-doc
  local f="$LAST_FILE"
  fm_set "$f" '^title: ' "title: $(yaml_str "${TITLE:-$name}")"
  fm_set "$f" '^weight: ' "weight: $w"
  if [ "$MATH" = "0" ]; then fm_set "$f" '^math: ' 'math: false'; fi
  if [ "$PUBLISH" = "1" ]; then fm_set "$f" '^draft: ' 'draft: false'; fi
  if [ -n "$NORMALIZED_TAGS" ]; then
    fm_set "$f" '^tags: ' "tags: $(yaml_list "$NORMALIZED_TAGS")"
    warn "本页写了 tags，就不会再继承项目主页 cascade 下发的项目级标签（cascade 只填空、不合并）"
    warn "若要两者都有，请把项目级标签也一并写进 --tags"
  fi
  apply_common "$f"
  apply_body "$f"
  return 0
}

# ---------- section 列表页 ----------
#
# 建的是「分区的入口页」：/posts/、/courses/、/projects/、/tags/ 这类 URL 都靠 content/<路径>/_index.md 存在。
# 为什么必须有这个子命令：这类页面此前没有任何入口能建（只能手写），而它一旦缺失，该分区就退化成
# 「隐式 section」—— 页面能不能存在取决于下面还有没有子页面；最后一个子页面被删空时，列表页与所有
# 指向它的入口（导航栏、首页、正文链接）会一起 404。判据与修法见 scripts/check-sections.sh 与 docs/traps.md。
# 骨架是 archetypes/section.md，只有 title + description（不写 tags / date / draft，与现有列表页一致）。
cmd_section() {
  [ "$#" -ge 1 ] || die "用法：new-content.sh section <路径> --title 标题 [--description 描述]"
  local path="${1%/}"
  case "$path" in
    "") die "路径不能为空。用法：section <路径> --title 标题，如 section posts --title 文章" ;;
    "$CONTENT_DIR"/*) die "路径相对 $CONTENT_DIR/ 写，不要带 $CONTENT_DIR/ 前缀：section ${path#"$CONTENT_DIR"/} --title 标题" ;;
    /*) die "路径必须是相对 $CONTENT_DIR/ 的路径（如 posts），不能是绝对路径：$path" ;;
  esac
  case "$path" in *..*) die "路径里不能出现 ..：$path" ;; esac
  case "$path" in *.md) die "这里填的是 section 目录，不是文件：$path" ;; esac
  if [ ! -d "$CONTENT_DIR/$path" ]; then
    die "找不到目录：$CONTENT_DIR/$path（本子命令只补列表页；要开新分区请先 mkdir -p 那个目录）"
  fi
  if [ -f "$CONTENT_DIR/$path/index.md" ]; then
    die "$CONTENT_DIR/$path 是 leaf bundle（单页 + 附件），不该有列表页：$CONTENT_DIR/$path/index.md"
  fi
  # 列表页的标题是给访客看的（「文章」而不是「posts」），不强制就会静默留下目录名
  [ -n "$TITLE" ] || die "缺 --title：section 列表页的标题会显示在导航与列表页上，如 section posts --title 文章"

  new_file "$path/_index.md" section
  local f="$LAST_FILE"
  fm_set "$f" '^title: ' "title: $(yaml_str "$TITLE")"
  if [ -n "$DESC" ]; then fm_set "$f" '^description: ' "description: $(yaml_str "$DESC")"; fi
  if [ "$PUBLISH" = "1" ] || [ -n "$NEWDATE" ]; then
    warn "--publish / --date 对列表页没有意义（骨架里没有 draft 与 date），已忽略"
  fi
  info "列表页没有 draft，已即时生效；它是否存在由 scripts/check-sections.sh 把关"
  return 0
}

# ---------- 删除 ----------
#
# 删除只在这里实现：管理页的「删除」按钮调的就是它（先 `remove --dry-run` 拿清单、确认后再真删），
# Node 侧不另写一套路径规则（与 add-term 同样的分工）。
# 不做撤销/回收站：文件都在 git 里，`git checkout -- <路径>` 就能找回已提交过的内容。
#
# 护栏（都是「删了会静默坏掉」的那类）：
#   · 两处路径卫生：必须在 content/ 下、不许出现 ..
#   · 只支持 .md
#   · _index.md 不能单独删（它是 section 的列表页，删掉分区就没入口页了）→ 必须 --with-bundle
#   · content/ 下一级分区的整目录删除一律拒绝（否则一键清空 content/courses）
cmd_remove() {
  [ "$#" -ge 1 ] || die "用法：new-content.sh remove <content 路径> [--with-bundle] [--dry-run]"
  local target="${1%/}"
  case "$target" in
    "$CONTENT_DIR"|"$CONTENT_DIR/") die "拒绝删除整个 $CONTENT_DIR 目录" ;;
    "$CONTENT_DIR"/*) ;;
    *) die "路径必须以 $CONTENT_DIR/ 开头（相对仓库根，如 content/posts/foo/index.md）：$target" ;;
  esac
  case "$target" in *..*) die "路径里不能出现 ..：$target" ;; esac
  [ -e "$target" ] || die "找不到：$target"
  [ -f "$target" ] || die "只支持删除 .md 文件（或它所在的整个目录）：$target"
  case "$target" in *.md) ;; *) die "只支持删除 .md 文件：$target" ;; esac

  # section 的列表页不能单独删：它一没，整个分区就退化成「隐式 section」——页面能不能存在
  # 取决于下面还有没有子页面，子页面一删空，导航栏/首页指向它的入口全部 404（实测踩过）。
  # 要删就 --with-bundle 连目录一起删；一级分区的整目录删除下面还有一道护栏接着拦。
  if [ "$(basename "$target")" = "_index.md" ] && [ "$BUNDLE" != "1" ]; then
    die "_index.md 是 section 的列表页，不能单独删：删掉后这个分区就没有入口页了，导航栏/首页指向它的链接会 404。要删就连目录一起删：remove $target --with-bundle"
  fi

  local dir rm_dir=""
  dir="$(dirname "$target")"
  if [ "$BUNDLE" = "1" ]; then
    case "$(basename "$target")" in
      index.md|_index.md) rm_dir="$dir" ;;
    esac
  fi
  # 删 section 根（content/courses、content/projects、词条页…）会把整个分区一锅端。
  # 它们是站点结构而不是「一篇内容」，一律拒绝，让调用方逐个处理。
  if [ -n "$rm_dir" ] && [ "$(dirname "$rm_dir")" = "$CONTENT_DIR" ]; then
    die "拒绝整目录删除：$rm_dir 是 $CONTENT_DIR 下的 section 根目录，删掉会清空整个分区；请逐个删除它下面的内容"
  fi

  local victims=() f
  if [ -n "$rm_dir" ]; then
    while IFS= read -r f; do victims+=("$f"); done < <(find "$rm_dir" -type f | LC_ALL=C sort)
  else
    victims=("$target")
  fi
  [ "${#victims[@]}" -gt 0 ] || die "没有可删除的文件：$target"

  if [ -n "$rm_dir" ]; then
    info "将删除整个目录 $rm_dir 下的 ${#victims[@]} 个文件："
  else
    info "将删除 1 个文件："
  fi
  for f in "${victims[@]}"; do echo "  - $f"; done

  if [ "$DRYRUN" = "1" ]; then
    info "这是 --dry-run，未改动任何文件"
    return 0
  fi

  if [ -n "$rm_dir" ]; then
    rm -rf -- "$rm_dir"
  else
    rm -f -- "$target"
    # 顺手清掉被删空的 leaf bundle 目录（非空时 rmdir 会失败，忽略）
    rmdir -- "$dir" 2>/dev/null || true
  fi
  for f in "${victims[@]}"; do ok "已删除 $f"; done
  info "文件仍在 git 历史里：git checkout -- ${rm_dir:-$target} 可恢复已提交过的内容"
  return 0
}

cmd_tags() {
  local i t
  i=1; echo "tags（$TAXONOMY）："
  while IFS= read -r t; do printf '  %2d) %s\n' "$i" "$t"; i=$((i + 1)); done < <(list_terms tags)
  i=1; echo; echo "categories："
  while IFS= read -r t; do printf '  %2d) %s\n' "$i" "$t"; i=$((i + 1)); done < <(list_terms categories)
  return 0
}

# 词条校验：插进词条的必须是能按「  - 词条」形式解析的纯文本。
validate_term() { # $1 = 词条；不合法就 die
  local t="$1"
  [ -n "$t" ] || die "词条不能为空"
  [ "$t" = "$(printf '%s' "$t" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')" ] || die "词条首尾不能有空格"
  [ "${#t}" -le 60 ] || die "词条太长了（超过 60 字符）"
  case "$t" in
    *,*) die "词条不能包含逗号（词表用逗号拼成 --tags A,B）" ;;
    *'#'*) die "词条不能包含 #（词表里的 # 会被当成行内注释）" ;;
    -*) die "词条不能以 - 开头（会和词表列表项符号混淆）" ;;
    '"'*|"'"*) die "词条不要加引号（见 $TAXONOMY 的格式约定）" ;;
  esac
  case "$t" in
    *$'\n'*|*$'\r'*|*$'\t'*) die "词条不能包含换行、回车或制表符" ;;
  esac
  if printf '%s' "$t" | grep -qE '^[A-Za-z_]+:$'; then
    die "词条不能写成 key: 形式"
  fi
  return 0
}

# 只往词表加一个词条，不建任何内容文件。
# 存在的理由：管理页要「先入词表、再建内容」，而 --new-tag 只是建内容时的副作用。
# 有了这个入口，写词表就只有 add_term 这一份实现（Node 侧不再自己拼 YAML）；
# --check 让调用方能只校验、不动文件。
cmd_add_term() { # $1 = tags|categories, $2 = 词条
  local section="${1:-}" term="${2:-}"
  [ -n "$section" ] && [ -n "$term" ] || die "用法：new-content.sh add-term <tags|categories> <词条> [--check]"
  case "$section" in
    tags|categories) ;;
    *) die "未知分节：$section（只支持 tags / categories）" ;;
  esac
  validate_term "$term"

  # 精确命中 → 幂等成功（管理页重复提交同一批标签是正常操作）
  if list_terms "$section" | grep -Fxq -- "$term"; then
    echo "· 词条「$term」已在 $section 里，未改动"
    return 0
  fi
  # 大小写不同视为同一个词条：词表刻意只保留一种拼写，否则会分裂出两个词条页
  local ci
  ci="$(list_terms "$section" | awk -v t="$term" 'tolower($0) == tolower(t) { print; exit }')"
  [ -z "$ci" ] || die "词表里已有「$ci」（大小写不同就是同一个词条，请直接用它）"

  if [ "$CHECKONLY" = "1" ]; then
    echo "  ✓ 词条「$term」可加入 $section"
    return 0
  fi

  # 写入 → 写后复核 → 失败回滚。词表被脚本 grep 依赖，不允许悄悄写坏。
  local backup
  backup="$(mktemp)"
  cp "$TAXONOMY" "$backup"
  add_term "$term" "$section"
  if ! list_terms "$section" | grep -Fxq -- "$term"; then
    cp "$backup" "$TAXONOMY"
    rm -f "$backup"
    die "写入后复核失败，已恢复原词表：$TAXONOMY"
  fi
  rm -f "$backup"
  ok "已把「$term」加入 $section（$TAXONOMY）"
  return 0
}

# ---------- 入口 ----------
cmd="${1:-}"
if [ -z "$cmd" ]; then usage; exit 1; fi
shift

case "$cmd" in
  help|-h|--help) usage; exit 0 ;;
esac

# remove 不需要 hugo，也不读词表：别让「hugo 不在 PATH」这种无关原因拦住删除动作
case "$cmd" in
  remove) ;;
  *)
    command -v hugo >/dev/null 2>&1 || die "找不到 hugo，无法生成内容"
    [ -f "$TAXONOMY" ] || die "找不到词表：$TAXONOMY"
    ;;
esac

POS=()
TAGS=""; TITLE=""; SERIES=""; CATS=""; UNIT="章"; REPO=""
DESC=""; NEWDATE=""
LAYERED=0; PUBLISH=0; NEWTAG=0; MATH=1; CHECKONLY=0
BODY_STDIN=0; BODY_CONSUMED=0
# chapter 默认仍建笔记+作业（与改造前的行为一致）；none 表示只建入口页
CHAPTER_MATERIALS="notes,homework"
MATERIAL_DIR=""
BUNDLE=0; DRYRUN=0
INTERACTIVE=0
if [ -t 0 ]; then INTERACTIVE=1; fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tags) TAGS="${2:-}"; shift 2 || die "--tags 缺少值" ;;
    --tags=*) TAGS="${1#*=}"; shift ;;
    --title) TITLE="${2:-}"; shift 2 || die "--title 缺少值" ;;
    --title=*) TITLE="${1#*=}"; shift ;;
    --series) SERIES="${2:-}"; shift 2 || die "--series 缺少值" ;;
    --categories) CATS="${2:-}"; shift 2 || die "--categories 缺少值" ;;
    --unit) UNIT="${2:-}"; shift 2 || die "--unit 缺少值" ;;
    --repo) REPO="${2:-}"; shift 2 || die "--repo 缺少值" ;;
    --description) DESC="${2:-}"; shift 2 || die "--description 缺少值" ;;
    --description=*) DESC="${1#*=}"; shift ;;
    --date) NEWDATE="${2:-}"; shift 2 || die "--date 缺少值" ;;
    --date=*) NEWDATE="${1#*=}"; shift ;;
    --body-stdin) BODY_STDIN=1; shift ;;
    --materials) CHAPTER_MATERIALS="${2:-}"; shift 2 || die "--materials 缺少值" ;;
    --materials=*) CHAPTER_MATERIALS="${1#*=}"; shift ;;
    --dir) MATERIAL_DIR="${2:-}"; shift 2 || die "--dir 缺少值" ;;
    --dir=*) MATERIAL_DIR="${1#*=}"; shift ;;
    --layered) LAYERED=1; shift ;;
    --publish) PUBLISH=1; shift ;;
    --new-tag) NEWTAG=1; shift ;;
    --no-math) MATH=0; shift ;;
    --check) CHECKONLY=1; shift ;;
    --with-bundle) BUNDLE=1; shift ;;
    --dry-run) DRYRUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) die "未知选项：$1（用 --help 看用法）" ;;
    *) POS+=("$1"); shift ;;
  esac
done

# 标签在这里一次性校验（含交互式挑选）。必须早于任何建文件动作：
# 校验失败要干净中止，否则会留下半成品内容。
NORMALIZED_TAGS=""
ACCEPTS_TAGS=0
case "$cmd" in
  post|course|project|doc) ACCEPTS_TAGS=1 ;;
esac
if [ "$ACCEPTS_TAGS" = "1" ]; then
  if [ -z "$TAGS" ] && [ "$INTERACTIVE" = "1" ]; then TAGS="$(pick_tags)"; fi
  if [ -n "$TAGS" ]; then
    normalize_tags "$TAGS" "$NEWTAG" || die "标签校验未通过（从上面的词表里挑，或加 --new-tag）"
  fi
fi

# --date 也必须在建任何文件之前校验（同 --tags / --materials 的理由：失败不留半成品）。
# 只要求 YYYY-MM-DD 开头：完整 RFC3339（2026-09-12T10:00:00+08:00）同样合法，
# 与 scripts/check-frontmatter.sh 的判定保持一致。
if [ -n "$NEWDATE" ]; then
  case "$NEWDATE" in
    [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*) ;;
    *) die "--date「$NEWDATE」必须是 YYYY-MM-DD 开头（Hugo 解析不了会退回零值）" ;;
  esac
fi

case "$cmd" in
  post)    cmd_post    ${POS[@]+"${POS[@]}"} ;;
  course)  cmd_course  ${POS[@]+"${POS[@]}"} ;;
  chapter) cmd_chapter ${POS[@]+"${POS[@]}"} ;;
  notes)    cmd_notes    ${POS[@]+"${POS[@]}"} ;;
  homework) cmd_homework ${POS[@]+"${POS[@]}"} ;;
  lab)      cmd_lab      ${POS[@]+"${POS[@]}"} ;;
  project) cmd_project ${POS[@]+"${POS[@]}"} ;;
  sub)     cmd_sub     ${POS[@]+"${POS[@]}"} ;;
  doc)     cmd_doc     ${POS[@]+"${POS[@]}"} ;;
  section) cmd_section ${POS[@]+"${POS[@]}"} ;;
  tags)    cmd_tags ;;
  remove)  cmd_remove  ${POS[@]+"${POS[@]}"}; exit 0 ;;
  add-term) cmd_add_term ${POS[@]+"${POS[@]}"}; exit 0 ;;
  *) usage; die "未知子命令：$cmd" ;;
esac

echo
echo "✓ 完成。本地预览：bash scripts/preview.sh；发布：bash scripts/push-blog.sh \"feat: ...\""
