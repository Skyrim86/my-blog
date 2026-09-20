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
MAX_TOTAL_KB="${MAX_TOTAL_KB:-24576}" # 整站输出上限 24 MB（2026-09-15：新增「回归分析」课程 —— 拆成 3 页的 M1 笔记 + 作业 + 实验，以及 80 张数学工具卡页（一卡一页，见 tools/course-import/），整站 10.0 → 19.0 MB；单页预算不变）
MAX_INDEX_KB="${MAX_INDEX_KB:-52}"   # 搜索索引上限 52 KB（现状 39 KB，含页内标题 headings；历史上曾涨到 49 KB）
# 压缩后的预算（2026-09-18 加）。**这两条才是「访客实际下载多少」**：raw 那条量的是磁盘上的字节，
# 而公式页的 raw 里绝大部分是 KaTeX 逐符号生成的 <span>，压缩比极高 —— 实测最重一页
# raw 913 KB → gzip 108 KB（8.5×），整站 19037 KB → 3260 KB（5.8×）。线上由 Pages 的
# gzip/brotli 兜着，所以 raw 那 1.6 MB 的预算在描述真实传输量时是失真的。
# 两条都保留、都阻断：raw 更敏感（内容一涨就动，能在早期报警），压缩后才是用户视角。
MAX_COMP_PAGE_KB="${MAX_COMP_PAGE_KB:-160}"    # 单页 gzip 上限（现状 108 KB）
# 2026-09-20 从 4608 抬到 5120（4.5 → 5 MB）：首页卡片组从 20 张加到 30 多张，每张两个派生图
# 合计约 38 KB（272 档 q78 + 544 档 q70），是**访客真会一页页翻到的东西**，不是冗余产物 ——
# 加卡前实测过一次「不抬预算就正好顶死、一点余量不剩」。抬这一档留出约 490 KB 余量，
# 之后再加卡仍然看得见增长（这条预算的用处就是让增长可见，不是卡死增长）。
MAX_COMP_TOTAL_KB="${MAX_COMP_TOTAL_KB:-5120}" # 整站 gzip 上限 5 MB

DIR="public"
TMP=""
SIZEFILE="$(mktemp)"
trap 'rm -f "$SIZEFILE"; if [ -n "$TMP" ]; then rm -rf "$TMP"; fi; true' EXIT

if [ "${1:-}" = "--fresh" ]; then
  command -v hugo >/dev/null 2>&1 || { echo "✗ --fresh 需要 hugo，但找不到" >&2; exit 1; }
  TMP="$(mktemp -d)"
  echo "▸ 构建到临时目录做无偏差测量"
  # hugo 是原生 Windows 程序，不会把 MSYS 的 /tmp/... 翻译成 Windows 路径：直接把 /tmp/x/site
  # 传给它，它既不报错也不产出（实测 exit 0、目录不存在），本脚本随后只能报「找不到」。
  # 有 cygpath 时先转成 C:/... 形式；非 MSYS 环境（CI 的 Linux）没有 cygpath，路径原样使用。
  DEST="$TMP/site"
  if command -v cygpath >/dev/null 2>&1; then DEST="$(cygpath -m "$DEST")"; fi
  hugo --minify --gc --cleanDestinationDir -d "$DEST" >/dev/null 2>&1
  DIR="$TMP/site"
fi

[ -d "$DIR" ] || { echo "✗ 找不到 $DIR，先跑一次构建（或加 --fresh）" >&2; exit 1; }

# 陈旧提醒：源文件比输出目录新，说明这轮没重新构建
#
# **不要写成 `find … | sort -rn | head -1`**（2026-09-19 实测踩到过）：`head -1` 读完第一行就退出，
# `sort` 还在往管道里写，于是收到 SIGPIPE、报 `sort: fflush failed: 'standard output': Broken pipe`
# 并以 **2** 退出；本脚本开了 `set -o pipefail`，这个 2 就成了整条管道的状态，`set -e` 直接把脚本
# 中止 —— CI 报的正是「Process completed with exit code 2」，而且一行报告都没打印出来。
# 它是**竞态**：只有生产者的输出超过管道缓冲（64 KB）时才会撞上，所以同一份代码前几次都能过
# （`themes/` 里 PaperMod 的文件够多才越过这条线）。求最大值让 awk 一次读完自己比，就没有
# 「提前退出的读者」了。
newest_of() {
  { find "$@" -type f -printf '%T@\n' 2>/dev/null || true; } | awk 'NR==1 || $1>m {m=$1} END {if (NR) print m}'
}
newest_src="$(newest_of content layouts assets static i18n archetypes themes hugo.toml)"
newest_out="$(newest_of "$DIR")"
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
# 用 `sed -n '1,10p'` 而不是 `head -10`：sed 会把输入读完，不会像 head 那样提前退出把 SIGPIPE
# 甩给上游的 sort（见上面 newest_of 那段注释）。
find "$DIR" -name '*.html' -type f -printf '%s\t%p\n' | sort -rn | sed -n '1,10p' | while IFS=$'\t' read -r b p; do
  rel="${p#"$DIR"/}"; rel="${rel%index.html}"
  printf '  %6d KB  %s\n' "$((b / 1024))" "$rel"
done

echo
echo "▸ 压缩后体积（gzip -6，访客实际下载量的近似）"
# 用 node 算 gzip 而不是调 gzip 命令：node 是本仓库的硬依赖（校验脚本全是 .mjs），而 gzip
# 命令在 Windows/MSYS 上不一定在 PATH 里 —— 依赖一个可能不存在的工具，会让这一段**静默失效**，
# 正是 traps.md 反复强调要避免的那类问题。node 跑不起来就明确报错退出，不静默跳过。
comp_report="$(node -e '
const { gzipSync } = require("zlib");
const fs = require("fs");
const path = require("path");
const root = process.argv[1];
function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
let totalGz = 0, totalRaw = 0;
const html = [];
for (const f of walk(root, [])) {
  const buf = fs.readFileSync(f);
  const gz = gzipSync(buf, { level: 6 }).length;
  totalGz += gz; totalRaw += buf.length;
  if (f.endsWith(".html")) html.push([gz, buf.length, path.relative(root, f)]);
}
html.sort((a, b) => b[0] - a[0]);
console.log("TOTAL " + Math.round(totalGz / 1024) + " " + Math.round(totalRaw / 1024));
for (const [gz, raw, p] of html.slice(0, 5)) {
  console.log("PAGE " + Math.round(gz / 1024) + " " + Math.round(raw / 1024) + " " + p.replace(/\\/g, "/"));
}
' "$DIR")" || { echo "✗ 压缩体积测量失败（node 不可用？）—— 这一段不能静默跳过" >&2; exit 1; }

comp_total=0
comp_page=0
while read -r tag a b c; do
  case "$tag" in
    TOTAL) comp_total="$a" ;;
    PAGE)
      [ "$comp_page" -eq 0 ] && comp_page="$a"
      printf '  %6s KB gzip / %6s KB raw  %s\n' "$a" "$b" "$c"
      ;;
  esac
done <<< "$comp_report"
echo "  ── 全部文件合计 $comp_total KB gzip / $((total_b / 1024)) KB raw"

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
max_page="$(find "$DIR" -name '*.html' -type f -printf '%s\n' | awk 'NR==1 || $1>m {m=$1} END {if (NR) print int(m/1024)}')"
check "单页最大（raw）" "${max_page:-0}" "$MAX_PAGE_KB"
check "整站输出（raw）" "$((total_b / 1024))" "$MAX_TOTAL_KB"
check "单页最大（gzip）" "$comp_page" "$MAX_COMP_PAGE_KB"
check "整站输出（gzip）" "$comp_total" "$MAX_COMP_TOTAL_KB"
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
