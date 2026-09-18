#!/usr/bin/env bash
# 标签词表校验：扫 content/ 下所有 front matter 的 tags，报告不在 data/taxonomy.yaml 里的词。
# 由 scripts/push-blog.sh 在推送前调用（只警告，不阻断），也可以单独跑排查。
#
# 用法：bash scripts/check-tags.sh
# 退出码：0 = 全部命中词表；1 = 有未登记的词（或发现了无法解析的写法）
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

TAXONOMY="data/taxonomy.yaml"
[ -f "$TAXONOMY" ] || { echo "✗ 找不到词表：$TAXONOMY" >&2; exit 1; }

# 词表里的标签（按行读入数组；后面用精确匹配）
TERMS=()
while IFS= read -r t; do
  [ -n "$t" ] && TERMS+=("$t")
done < <(awk '
  /^[A-Za-z_]+:/ { in_sec = ($0 ~ "^tags:"); next }
  in_sec && /^[[:space:]]*-[[:space:]]/ {
    line = $0
    sub(/^[[:space:]]*-[[:space:]]+/, "", line)
    sub(/[[:space:]]+#.*$/, "", line)
    if (line != "") print line
  }
' "$TAXONOMY")

in_vocab() { # $1=标签；0=命中，1=未命中
  local t
  for t in "${TERMS[@]}"; do
    [ "$t" = "$1" ] && return 0
  done
  return 1
}

ci_hint() { # 大小写不一致时给个提示
  local t
  for t in "${TERMS[@]}"; do
    if [ "$(printf '%s' "$t" | tr '[:upper:]' '[:lower:]')" = "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" ]; then
      printf '%s' "$t"
      return 0
    fi
  done
  return 1
}

unknown_count=0
block_count=0
checked=0

# 取文件的 front matter（首个 --- 区块），输出 TAGS<TAB>值 或 BLOCK
extract() {
  awk '
    BEGIN { n = 0 }
    /^---[[:space:]]*$/ { n++; if (n == 2) exit; next }
    n != 1 { next }
    /^[[:space:]]*tags:[[:space:]]*\[/ {
      v = $0
      sub(/^[[:space:]]*tags:[[:space:]]*/, "", v)
      print "INLINE\t" v
      next
    }
    /^[[:space:]]*tags:[[:space:]]*$/ { print "BLOCK"; next }
  ' "$1"
}

PAIRS="$(mktemp)"
trap 'rm -f "$PAIRS"' EXIT

while IFS= read -r f; do
  while IFS=$'\t' read -r kind val; do
    if [ "$kind" = "BLOCK" ]; then
      echo "  ! $f：tags 用了块列表写法，本脚本只解析行内数组，可能漏检" >&2
      echo "    建议改成：tags: [\"标签一\", \"标签二\"]" >&2
      block_count=$((block_count + 1))
      continue
    fi
    # 拆行内数组：去方括号 → 按逗号切 → 去空白与引号
    # 末尾补一个换行，否则 tr 产生的最后一项没有行终止符，会被 read 丢掉
    { printf '%s' "$val" | sed 's/^[[:space:]]*\[//; s/\][[:space:]]*$//' | tr ',' '\n'; echo; } \
      | while IFS= read -r raw; do
        t="$(printf '%s' "$raw" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^"//; s/"$//')"
        [ -z "$t" ] && continue
        echo "$f	$t"
      done
  done < <(extract "$f")
done < <(find content -name '*.md' -type f | sort) > "$PAIRS"

while IFS=$'\t' read -r f t; do
  [ -z "$t" ] && continue
  checked=$((checked + 1))
  if ! in_vocab "$t"; then
    unknown_count=$((unknown_count + 1))
    if hint="$(ci_hint "$t")"; then
      echo "✗ $f：标签「$t」大小写与词表不一致（词表里是「$hint」）"
    else
      echo "✗ $f：标签「$t」不在词表里"
    fi
  fi
done < "$PAIRS"

# ---------- 分组表一致性 ----------
# data/tag-groups.yaml 是**展示层**信息（/tags/ 页按组分块，见 layouts/taxonomy.html）；
# 词表才是拼写的唯一事实源。两边漂移的后果不是丢内容（词条会落在页面上那块「未分组」里），
# 而是分组悄悄失效 —— 所以这里报出来，与未登记标签同一个退出码（CI 里整体按「只警告」处理）。
GROUPS_FILE="data/tag-groups.yaml"
GROUP_TERMS_COUNT=0
group_issues=0
if [ -f "$GROUPS_FILE" ]; then
  GROUP_TERMS=()
  while IFS= read -r t; do
    [ -n "$t" ] && GROUP_TERMS+=("$t")
  done < <(awk '
    /^[[:space:]]*tags:[[:space:]]*$/ { in_tags = 1; next }
    /^[[:space:]]*-[[:space:]]*key:/ { in_tags = 0; next }
    /^[^[:space:]]/ { in_tags = 0; next }
    in_tags && /^[[:space:]]*-[[:space:]]/ {
      line = $0
      sub(/^[[:space:]]*-[[:space:]]+/, "", line)
      sub(/[[:space:]]+#.*$/, "", line)
      if (line != "") print line
    }
  ' "$GROUPS_FILE")
  GROUP_TERMS_COUNT="${#GROUP_TERMS[@]}"

  in_group() {
    local t
    for t in "${GROUP_TERMS[@]}"; do
      [ "$t" = "$1" ] && return 0
    done
    return 1
  }

  if [ "$GROUP_TERMS_COUNT" -eq 0 ]; then
    echo "  ! $GROUPS_FILE 里一个分组词条都没解析到（格式变了？只认「tags:」下的块列表写法）" >&2
    group_issues=$((group_issues + 1))
  else
    for t in "${TERMS[@]}"; do
      if ! in_group "$t"; then
        echo "  ! 词表里的「$t」不在任何分组里 —— 它会落在 /tags/ 页的「未分组」块" >&2
        group_issues=$((group_issues + 1))
      fi
    done
    for t in "${GROUP_TERMS[@]}"; do
      if ! in_vocab "$t"; then
        echo "  ! 分组表里的「$t」不在词表里（拼写或大小写不一致？）" >&2
        group_issues=$((group_issues + 1))
      fi
    done
  fi
else
  echo "  ! 找不到 $GROUPS_FILE —— /tags/ 页会退化成不分组的单列" >&2
  group_issues=$((group_issues + 1))
fi

echo
if [ "$unknown_count" -eq 0 ] && [ "$block_count" -eq 0 ] && [ "$group_issues" -eq 0 ]; then
  echo "✓ 标签校验通过：$checked 个标签全部命中 $TAXONOMY（分组表 $GROUP_TERMS_COUNT 个词条也一致）"
  exit 0
fi
if [ "$unknown_count" -gt 0 ]; then
  echo "共 $unknown_count 个标签不在词表中。"
  echo "处理方式：改用词表里的词，或把新词加进 $TAXONOMY（scripts/new-content.sh 的 --new-tag 会自动追加）。"
fi
exit 1
