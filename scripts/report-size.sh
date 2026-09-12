#!/usr/bin/env bash
# 页面体积报告 + 体积预算。CI 每次构建都跑，用来让「公式页越来越胖」这类增长可见。
#
# 用法：
#   bash scripts/report-size.sh            # 量 public/（CI 用；CI 的 public/ 一定是干净构建）
#   bash scripts/report-size.sh --fresh    # 先构建到临时目录再量（本地推荐）
#
# 为什么要有 --fresh：hugo 默认**不会**清空目标目录（`hugo --minify --gc` 的 Cleaned 恒为 0），
# 所以只要曾经跑过 hugo -D，public/ 里就会留下草稿页等陈旧产物，量出来的页数与体积都偏大。
# --fresh 构建到临时目录，从根上避免这个偏差。
#
# 退出码：0 = 全部在预算内；1 = 有项目超预算
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# ---- 预算（可用环境变量覆盖，例如 MAX_PAGE_KB=2000 bash scripts/report-size.sh）----
# 定得比现状宽松，只在真出现回归时报警，不做日常噪音。
MAX_PAGE_KB="${MAX_PAGE_KB:-1638}"   # 单页 raw HTML 上限 1.6 MB（现状最重约 1318 KB）
MAX_TOTAL_KB="${MAX_TOTAL_KB:-12288}" # 整站输出上限 12 MB（2026-09-12：CMC2026 一次新增 16 个公式密集页，raw HTML 约 +6.5 MB，整站 5.6 → 10.0 MB，故 8 MB 上调到 12 MB）
MAX_INDEX_KB="${MAX_INDEX_KB:-40}"   # 搜索索引上限 40 KB（现状 18 KB；历史上曾涨到 49 KB）

DIR="public"
TMP=""
SIZEFILE="$(mktemp)"
trap 'rm -f "$SIZEFILE"; if [ -n "$TMP" ]; then rm -rf "$TMP"; fi; true' EXIT

if [ "${1:-}" = "--fresh" ]; then
  command -v hugo >/dev/null 2>&1 || { echo "✗ --fresh 需要 hugo，但找不到" >&2; exit 1; }
  TMP="$(mktemp -d)"
  echo "▸ 构建到临时目录做无偏差测量"
  hugo --minify --gc --cleanDestinationDir -d "$TMP/site" >/dev/null 2>&1
  DIR="$TMP/site"
fi

[ -d "$DIR" ] || { echo "✗ 找不到 $DIR，先跑一次构建（或加 --fresh）" >&2; exit 1; }

# 陈旧提醒：源文件比输出目录新，说明这轮没重新构建
newest_src="$(find content layouts assets static i18n archetypes themes hugo.toml -type f -printf '%T@\n' 2>/dev/null | sort -rn | head -1)"
newest_out="$(find "$DIR" -type f -printf '%T@\n' 2>/dev/null | sort -rn | head -1)"
if [ -n "$newest_src" ] && [ -n "$newest_out" ] && [ "${newest_out%%.*}" -lt "${newest_src%%.*}" ]; then
  echo "⚠ $DIR 里有源文件比输出新 —— 现在量的是陈旧产物，建议加 --fresh 重新量。"
fi

find "$DIR" -type f -printf '%s\n' > "$SIZEFILE"

total_b="$(awk '{s += $1} END {print s + 0}' "$SIZEFILE")"
total_files="$(wc -l < "$SIZEFILE")"
html_files="$(find "$DIR" -name '*.html' -type f | wc -l)"

echo
echo "▸ 总体积 $((total_b / 1024)) KB · $total_files 个文件 · $html_files 个 HTML 页"

echo
echo "▸ 体积构成"
find "$DIR" -type f -printf '%s\t%p\n' | awk -F'\t' '
  function bucket(p,   n, parts, ext) {
    n = split(p, parts, ".")
    ext = (n > 1) ? tolower(parts[n]) : ""
    if (ext == "html" || ext == "htm") return "HTML"
    if (ext == "js") return "JS"
    if (ext == "css") return "CSS"
    if (ext == "woff2" || ext == "woff" || ext == "ttf" || ext == "eot") return "字体"
    if (ext == "png" || ext == "jpg" || ext == "jpeg" || ext == "webp" || ext == "svg" || ext == "gif" || ext == "ico") return "图片"
    if (ext == "json" || ext == "xml") return "索引与订阅"
    return "其他"
  }
  { size[bucket($2)] += $1 }
  END {
    c[1] = "HTML"; c[2] = "JS"; c[3] = "CSS"; c[4] = "字体"
    c[5] = "图片"; c[6] = "索引与订阅"; c[7] = "其他"
    for (i = 1; i <= 7; i++) printf "  %-12s %6d KB\n", c[i], int(size[c[i]] / 1024)
  }'

echo
echo "▸ 最重的 10 个页面（raw HTML，未压缩）"
find "$DIR" -name '*.html' -type f -printf '%s\t%p\n' | sort -rn | head -10 | while IFS=$'\t' read -r b p; do
  rel="${p#"$DIR"/}"; rel="${rel%index.html}"
  printf '  %6d KB  %s\n' "$((b / 1024))" "$rel"
done

echo
echo "▸ 预算"
fail=0
check() { # $1=名称 $2=实测KB $3=上限KB
  if [ "$2" -gt "$3" ]; then
    printf '  ✗ %s：%s KB > 上限 %s KB\n' "$1" "$2" "$3"
    fail=1
  else
    printf '  ✓ %s：%s KB ≤ %s KB\n' "$1" "$2" "$3"
  fi
}
max_page="$(find "$DIR" -name '*.html' -type f -printf '%s\n' | sort -rn | head -1 | awk '{print int($1/1024)}')"
check "单页最大" "${max_page:-0}" "$MAX_PAGE_KB"
check "整站输出" "$((total_b / 1024))" "$MAX_TOTAL_KB"
if [ -f "$DIR/index.json" ]; then
  check "搜索索引" "$(($(wc -c < "$DIR/index.json") / 1024))" "$MAX_INDEX_KB"
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "✓ 体积预算通过"
  exit 0
fi
echo "✗ 超出体积预算。确认是有意增长后，调高 scripts/report-size.sh 顶部的上限，并在提交说明里写明原因。"
exit 1
