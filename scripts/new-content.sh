#!/usr/bin/env bash
# 新内容脚手架：一次建好文章 / 课程章（含笔记+作业）/ 项目 / 分层项目文档。
#
# 用法：
#   bash scripts/new-content.sh post    <slug> [--title 标题] [--tags A,B] [--categories X] [--series Y] [--publish]
#   bash scripts/new-content.sh course  <课程> [--title 标题] [--unit 章] [--tags A,B] [--categories X] [--publish]
#   bash scripts/new-content.sh chapter <课程> <章节标题> [--publish]
#   bash scripts/new-content.sh project <项目> [--title 标题] [--tags A,B] [--repo URL] [--layered] [--publish]
#   bash scripts/new-content.sh sub     <项目> <子项目> [--title 标题] [--publish]
#   bash scripts/new-content.sh doc     <项目路径> <文档名> [--title 标题] [--tags A,B] [--no-math] [--publish]
#   bash scripts/new-content.sh tags                     列出标签 / 分类词表
#
# 设计要点：
#   - front matter 的唯一事实源是 archetypes/：本脚本只调用 `hugo new content --kind`，
#     不另抄一份 front matter 模板，避免两处漂移。
#   - 多文件结构（一章 = _index.md + notes + homework，一次建好）是 hugo new 做不到的部分。
#   - 标签只从 data/taxonomy.yaml 里选；要新词必须显式加 --new-tag，脚本会把它写进词表。
#   - 默认 draft: true（与 archetype 一致）；确认写完后用 --publish 或手工改 false。
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
  new-content.sh chapter <课程> <章节标题> [--publish]
  new-content.sh project <项目> [--title 标题] [--tags A,B] [--repo URL] [--layered] [--publish]
  new-content.sh sub     <项目> <子项目> [--title 标题] [--publish]
  new-content.sh doc     <项目路径> <文档名> [--title 标题] [--tags A,B] [--no-math] [--publish]
  new-content.sh tags                     列出标签 / 分类词表

说明：
  --tags       逗号分隔，必须来自 data/taxonomy.yaml；拼写会自动按词表规范化
  --new-tag    允许词表里没有的新标签，并自动追加进词表
  --publish    直接 draft: false（默认仍是草稿）
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
  info "下一步：bash scripts/new-content.sh chapter $name <章节标题>"
  return 0
}

cmd_chapter() {
  [ "$#" -ge 2 ] || die "用法：new-content.sh chapter <课程> <章节标题> [--publish]"
  local course="$1" title="$2"
  if [ ! -f "$CONTENT_DIR/courses/$course/_index.md" ]; then
    die "找不到课程主页：$CONTENT_DIR/courses/$course/_index.md（先用 course 子命令创建）"
  fi
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

  new_file "courses/$course/$ch/notes/index.md" notes
  if [ "$PUBLISH" = "1" ]; then fm_set "$LAST_FILE" '^draft: ' 'draft: false'; fi
  new_file "courses/$course/$ch/homework/index.md" homework
  if [ "$PUBLISH" = "1" ]; then fm_set "$LAST_FILE" '^draft: ' 'draft: false'; fi

  info "材料页不要手写 tags：课程标签由课程主页 cascade 下发，写了反而会整体丢掉"
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
    info "下一步：bash scripts/new-content.sh sub $name <子项目>"
  else
    new_file "projects/$name/index.md" projects
    local f="$LAST_FILE"
    apply_meta "$f"
    write_tags "$f" '^tags: ' 'tags: '
    if [ -n "$CATS" ]; then fm_set "$f" '^categories: ' "categories: $(yaml_list "$CATS")"; fi
    if [ -n "$REPO" ]; then fm_set "$f" '^repo: ' "repo: $(yaml_str "$REPO")"; fi
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

# ---------- 入口 ----------
cmd="${1:-}"
if [ -z "$cmd" ]; then usage; exit 1; fi
shift

case "$cmd" in
  help|-h|--help) usage; exit 0 ;;
esac

command -v hugo >/dev/null 2>&1 || die "找不到 hugo，无法生成内容"
[ -f "$TAXONOMY" ] || die "找不到词表：$TAXONOMY"

POS=()
TAGS=""; TITLE=""; SERIES=""; CATS=""; UNIT="章"; REPO=""
LAYERED=0; PUBLISH=0; NEWTAG=0; MATH=1
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
    --layered) LAYERED=1; shift ;;
    --publish) PUBLISH=1; shift ;;
    --new-tag) NEWTAG=1; shift ;;
    --no-math) MATH=0; shift ;;
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

case "$cmd" in
  post)    cmd_post    ${POS[@]+"${POS[@]}"} ;;
  course)  cmd_course  ${POS[@]+"${POS[@]}"} ;;
  chapter) cmd_chapter ${POS[@]+"${POS[@]}"} ;;
  project) cmd_project ${POS[@]+"${POS[@]}"} ;;
  sub)     cmd_sub     ${POS[@]+"${POS[@]}"} ;;
  doc)     cmd_doc     ${POS[@]+"${POS[@]}"} ;;
  tags)    cmd_tags ;;
  *) usage; die "未知子命令：$cmd" ;;
esac

echo
echo "✓ 完成。本地预览：bash scripts/preview.sh；发布：bash scripts/push-blog.sh \"feat: ...\""
