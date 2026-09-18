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
#   6. 课程材料页（章目录下的 leaf bundle，如 notes/、homework/、lab/、lab-02/）写了顶层 tags
#      —— cascade 只填空不合并，写了会整体丢掉课程标签
#
# 警告（可能是排期或笔误）：
#   a. draft: false 但 date 在未来 —— Hugo 默认不构建未来内容，会静默不上线
#   b. 顶层键不在已知集合里（多半是拼错）
#   c. 两个页面 title 完全相同 —— 列表页与搜索结果里分不出谁是谁
#   d. 处在 cascade 之下的项目文档自己写了 tags —— 会丢掉项目级标签
#   e. 正文含公式、又会出现在列表卡片里的页面缺 summary —— 卡片摘要会显示成错乱公式
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# 站点时区是 Asia/Shanghai（hugo.toml 顶层）。CI 跑在 UTC，所以这里也按东八区取「今天」，
# 否则东八区早上 8 点前的构建会把当天日期的页面误判成「未来」。
TODAY="$(TZ=Asia/Shanghai date +%F)"

# 已知顶层键。没列出的键只警告、不阻断（Hugo 与主题本身还有很多合法 page 参数）。
KNOWN_KEYS="title description date draft weight summary math layout url placeholder
tags categories series icon repo unit cascade cover slug lastmod publishDate expiryDate
# plan：课程主页的规划清单（见 layouts/_shortcodes/course-plan.html），值是一个列表
aliases keywords author images type outputs menu sitemap headless searchHidden hideMeta
disableShare ShowToc TocOpen robotsNoIndex canonicalURL plan hiddenInRss"
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

# 正文（front matter 块之后）里有没有公式。判据是 `$`：AGENTS 明令禁止把裸 `$` 写进正文，
# 所以正文里的 `$` 一定是公式定界符。代价是只用 `\(…\)` 写公式的页面漏检。
body_has_math() {
  awk '
    { sub(/\r$/, "") }
    /^---[[:space:]]*$/ { n++; next }
    n >= 2 { print }
  ' "$1" | grep -q '\$'
}

# 这一页是不是处在某个 cascade 之下？判据是**祖先目录里存在 _index.md**，而不是写死项目名，
# 所以以后新建的分层项目自动生效。只从页面所在目录往上找到 content/projects 为止：
# 平铺项目（content/projects/<项目>/index.md）下面没有 _index.md，标签本来就该写在自己身上。
under_cascade() {
  local d
  d="$(dirname "$1")"
  while [ "$d" != "content/projects" ] && [ "$d" != "." ] && [ "$d" != "/" ]; do
    [ -f "$d/_index.md" ] && return 0
    d="$(dirname "$d")"
  done
  return 1
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
  #    匹配「章目录下的 leaf bundle」= content/courses/<课程>/<章>/<材料>/index.md。
  #    shell case 的 * 会跨 /，所以三层通配正好覆盖这一步；不写死 notes/homework，
  #    否则新增材料类型（lab、lab-02…）会悄悄绕过这条规则。
  case "$rel" in
    content/courses/*/*/index.md)
      for k in tags categories; do
        if has_key "$pairs" "$k"; then
          fail "$rel：课程材料页写了顶层 $k —— 会整体丢掉课程主页 cascade 下发的标签"
        fi
      done
      ;;
  esac

  # d) 处在 cascade 之下的项目文档自带 tags（只警告：这是有意的取舍）
  case "$rel" in
    content/projects/*)
      if [ "$is_index" -eq 0 ] && under_cascade "$rel" && has_key "$pairs" tags; then
        warn "$rel：自带 tags 会整体丢掉项目主页 cascade 下发的标签（cascade 只填空、不合并）"
      fi
      ;;
  esac

  # e) 正文含公式的页面必须自带 summary（只警告，但强烈建议修）
  #    列表卡片走主题 list.html 的 `.Summary | plainify`。公式在**构建期**已被 KaTeX 渲染成
  #    HTML+MathML，plainify 剥掉标签后会把 MathML 文本、annotation 里的 TeX 源码与视觉文本
  #    三份拼在一起，卡片上就成了「e=x^−xe = \hat{x} - xe=x^−x」。
  #    写 front matter summary 后 Hugo 直接返回它（纯文本，plainify 无害），卡片与搜索索引都干净。
  #    注意：这里**不能**用 `math: true` 做判据 —— 课程材料页的 math 来自课程主页 cascade，
  #    页面自身 front matter 里并没有这个键。也不能把 summary 写进 archetypes（空字符串会被
  #    Hugo 当成「已设置」，卡片反而变成空白），所以只能靠这条警告盯住。
  if [ "$is_index" -eq 0 ] && ! has_key "$pairs" summary \
    && [ "$(get_val "$pairs" searchHidden)" != "true" ]; then
    case "$(get_val "$pairs" layout)" in
      toolcard|search|archives) ;;
      *)
        if body_has_math "$rel"; then
          warn "$rel：正文含公式但没写 summary —— 列表卡片摘要会是错乱公式，请补 summary（可抄 description）"
        fi
        ;;
    esac
  fi

  # b) 未知顶层键
  while IFS=$'\t' read -r k _v; do
    [ -z "$k" ] && continue
    case "$KNOWN_KEYS" in
      *" $k "*) ;;
      *) warn "$rel：顶层键「$k」不在已知集合里（拼错？）" ;;
    esac
  done <<< "$pairs"

  # c) 收集 title，末尾统一查重。只排除 archives/search 这两个独立 layout 的工具页
  #    （它们的标题是「归档」「搜索」，与内容页重名没有意义）。
  #    以前这里还排除课程材料页，理由是 giscus 按 title 关联 Discussion；2026-09-18 改成
  #    mapping='pathname' 之后评论不再串页，查重的理由变成「列表页/搜索结果里分不出谁是谁」，
  #    对材料页同样成立，所以现在一并统计。
  if [ "$is_index" -eq 0 ] && [ -n "$title" ]; then
    case "$(get_val "$pairs" layout)" in
      archives|search) ;;
      *) printf '%s\t%s\n' "$title" "$rel" >> "$TITLE_FILE" ;;
    esac
  fi
done < <(find content -name '*.md' -type f | sort)

# c) title 查重
dup_titles="$(cut -f1 "$TITLE_FILE" | sort | uniq -d)"
if [ -n "$dup_titles" ]; then
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    warn "以下页面 title 完全相同：「$t」—— 列表页与搜索结果里分不出谁是谁"
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
