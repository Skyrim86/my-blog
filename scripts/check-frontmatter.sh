#!/usr/bin/env bash
# front matter 校验：拦住「构建能过、但页面其实是坏的」那一类问题。
# 由 scripts/push-blog.sh 推送前调用（**阻断**，与 check-tags.sh 的只警告不同），CI 也跑。
#
# 用法：bash scripts/check-frontmatter.sh
# 退出码：0 = 无硬错误（可能带警告）；1 = 有硬错误
#
# 硬错误（必须修）：
#   1. content/ 下任一 .md 没有 front matter 块
#   2. 缺 title
#   3. 文章/课程材料/项目文档（posts、courses、projects 下的非 _index.md）缺 date 或 draft
#   4. date 不是 YYYY-MM-DD 开头
#   5. section 页（_index.md）写了顶层 tags / categories —— 词条页不会列出它，却会让 /tags/ 计数虚高
#   6. 课程材料页（notes/、homework/）写了顶层 tags —— cascade 只填空不合并，写了会整体丢掉课程标签
#
# 警告（可能是排期或笔误）：
#   a. draft: false 但 date 在未来 —— Hugo 默认不构建未来内容，会静默不上线
#   b. 顶层键不在已知集合里（多半是拼错）
#   c. 两个页面 title 完全相同 —— giscus 用 mapping='title' 关联 Discussion，会并成同一条评论串
#   d. 被 cascade 覆盖的项目文档自己写了 tags —— 会丢掉项目级标签
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# 站点时区是 Asia/Shanghai（hugo.toml 顶层）。CI 跑在 UTC，所以这里也按东八区取「今天」，
# 否则东八区早上 8 点前的构建会把当天日期的页面误判成「未来」。
TODAY="$(TZ=Asia/Shanghai date +%F)"

# 已知顶层键。没列出的键只警告、不阻断（Hugo 与主题本身还有很多合法 page 参数）。
KNOWN_KEYS="title description date draft weight summary math layout url placeholder
tags categories series icon repo unit cascade cover slug lastmod publishDate expiryDate
aliases keywords author images type outputs menu sitemap headless searchHidden hideMeta
disableShare ShowToc TocOpen robotsNoIndex canonicalURL"
KNOWN_KEYS=" $(printf '%s' "$KNOWN_KEYS" | tr -s '[:space:]' ' ') "

errors=0
warns=0
files=0
TITLE_FILE="$(mktemp)"
trap 'rm -f "$TITLE_FILE"' EXIT

fail() { echo "✗ $*"; errors=$((errors + 1)); }
warn() { echo "  ⚠ $*"; warns=$((warns + 1)); }

# 取 front matter 块内的**顶层**键值（0 缩进），输出 KEY<TAB>VALUE。
# 缩进行（cascade 的子键、cover 的子键）与 "- target:" 这类列表项都不会命中。
fm_top() {
  awk '
    { sub(/\r$/, "") }
    BEGIN { n = 0 }
    /^---[[:space:]]*$/ { n++; if (n == 2) exit; next }
    n != 1 { next }
    /^[A-Za-z_][A-Za-z0-9_.-]*[[:space:]]*:/ {
      k = $0; sub(/[[:space:]]*:.*/, "", k)
      v = $0; sub(/^[^:]*:[[:space:]]*/, "", v)
      sub(/[[:space:]]+#.*$/, "", v)
      sub(/[[:space:]]*$/, "", v)
      print k "\t" v
    }
  ' "$1"
}

has_key() { # $1=KEY<TAB>VALUE 列表, $2=键
  printf '%s\n' "$1" | cut -f1 | grep -qx "$2"
}

get_val() { # $1=KEY<TAB>VALUE 列表, $2=键
  printf '%s\n' "$1" | awk -F'\t' -v k="$2" '$1 == k { print $2; exit }'
}

while IFS= read -r f; do
  files=$((files + 1))
  rel="$f"

  # 1) 必须有 front matter 块。不能只看「有没有 ---」（正文里的分隔线也会命中），
  #    所以要求**第一行**就是 ---。
  if [ "$(head -1 "$f" | tr -d '\r')" != "---" ]; then
    fail "$rel：没有 front matter 块（首行必须是 ---）"
    continue
  fi

  pairs="$(fm_top "$f")"
  # title 去掉包裹的引号再比较（本仓库的 title 统一写双引号，带引号查重会看不出「同名」）
  title="$(get_val "$pairs" title | sed 's/^"//; s/"$//')"

  # 2) title 必填（所有页面，含 section 与词条列表页）
  if ! has_key "$pairs" title || [ -z "$title" ]; then
    fail "$rel：缺 title（页面 <title>、OG、JSON-LD 与 giscus 关联键都依赖它）"
  fi

  is_index=0
  case "$(basename "$f")" in _index.md) is_index=1 ;; esac

  # 3) date / draft：只对「有日期语义」的三个 section 下的非 _index.md 生效。
  #    顶层独立页（about/archives/search）按 Hugo 惯例不带 date/draft，故不在此列。
  case "$rel" in
    content/posts/*|content/courses/*|content/projects/*)
      if [ "$is_index" -eq 0 ]; then
        has_key "$pairs" date  || fail "$rel：缺 date"
        has_key "$pairs" draft || fail "$rel：缺 draft"
      fi
      ;;
  esac

  # 4) date 格式 + a) 未来日期
  d="$(get_val "$pairs" date)"
  if [ -n "$d" ]; then
    case "$d" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*) ;;
      *) fail "$rel：date「$d」不是 YYYY-MM-DD 开头（Hugo 解析不了会退回零值）" ;;
    esac
    if [ "$(get_val "$pairs" draft)" != "true" ] && [ "${d:0:10}" \> "$TODAY" ]; then
      warn "$rel：date $d 在未来而 draft 不是 true —— CI 不构建未来内容，这一页不会上线"
    fi
  fi

  # 5) section 页不许写顶层 tags/categories
  if [ "$is_index" -eq 1 ]; then
    for k in tags categories; do
      if has_key "$pairs" "$k"; then
        fail "$rel：section 页写了顶层 $k —— 应写进 cascade 并加 target: {kind: page}，否则 /$k/ 计数虚高而词条页里不出现"
      fi
    done
  fi

  # 6) 课程材料页不许写顶层 tags/categories
  case "$rel" in
    content/courses/*/notes/index.md|content/courses/*/homework/index.md)
      for k in tags categories; do
        if has_key "$pairs" "$k"; then
          fail "$rel：课程材料页写了顶层 $k —— 会整体丢掉课程主页 cascade 下发的标签"
        fi
      done
      ;;
  esac

  # d) 被 cascade 覆盖的项目文档自带 tags（只警告：这是有意的取舍）
  case "$rel" in
    content/projects/CMC2026/*)
      if [ "$is_index" -eq 0 ] && has_key "$pairs" tags; then
        warn "$rel：自带 tags 会整体丢掉 CMC2026 项目主页 cascade 下发的标签（cascade 只填空、不合并）"
      fi
      ;;
  esac

  # b) 未知顶层键
  while IFS=$'\t' read -r k _v; do
    [ -z "$k" ] && continue
    case "$KNOWN_KEYS" in
      *" $k "*) ;;
      *) warn "$rel：顶层键「$k」不在已知集合里（拼错？）" ;;
    esac
  done <<< "$pairs"

  # c) 收集 title，末尾统一查重。只统计**真正会渲染评论区**的页面：
  #    评论区只在 regular page + comments 为真 + 走 single.html 时输出，
  #    所以课程材料页（cascade 关了 comments）与 archives/search（各有独立 layout）不参与查重。
  if [ "$is_index" -eq 0 ] && [ -n "$title" ]; then
    case "$rel" in
      content/courses/*/notes/index.md|content/courses/*/homework/index.md) ;;
      *)
        case "$(get_val "$pairs" layout)" in
          archives|search) ;;
          *) printf '%s\t%s\n' "$title" "$rel" >> "$TITLE_FILE" ;;
        esac
        ;;
    esac
  fi
done < <(find content -name '*.md' -type f | sort)

# c) title 查重：giscus 的 mapping='title' 按标题关联 Discussion，重名会并成同一条评论串
dup_titles="$(cut -f1 "$TITLE_FILE" | sort | uniq -d)"
if [ -n "$dup_titles" ]; then
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    warn "以下页面 title 完全相同：「$t」—— giscus 按标题关联 Discussion，它们的评论会并成一条"
    awk -F'\t' -v t="$t" '$1 == t { print "        " $2 }' "$TITLE_FILE"
  done <<< "$dup_titles"
fi

echo
if [ "$errors" -eq 0 ]; then
  if [ "$warns" -eq 0 ]; then
    echo "✓ front matter 校验通过：$files 个文件，无错误无警告"
  else
    echo "✓ front matter 校验通过：$files 个文件，$warns 条警告（不阻断，请自行判断）"
  fi
  exit 0
fi
echo "共 $errors 个硬错误，必须修复后才能推送。"
exit 1
