#!/usr/bin/env bash
# 校验 KaTeX 样式与 Hugo 内嵌版本**配对**（Hugo 官方 issue #15254 那个坑）。
#
# 判据（已用 npm 上的包实测）：
#   katex@0.16.x   → 生成 .base{} / .strut{}，**不出现** katex-base
#   katex@0.18.4+  → 反之，生成带前缀的 katex-base
# 两套类名不能混用：配错的表现是公式上下标错位、分数塌陷（页面不报错，只是排版坏掉）。
# 所以这条检查必须在**每次构建后**跑：Hugo 一升版，就是这个坑最容易发作的时候。
#
# 用法：bash scripts/check-katex-pairing.sh [输出目录]     默认 public
# 退出码：0 = 配对正确（或没有公式页、无法判定）；1 = 不配对
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

OUT="${1:-public}"
CSS="static/katex/katex.min.css"
[ -f "$CSS" ] || { echo "✗ 找不到 $CSS" >&2; exit 1; }
[ -d "$OUT" ] || { echo "✗ 找不到输出目录 $OUT，先跑一次构建" >&2; exit 1; }

if grep -q 'katex-base' "$CSS"; then
  css_scheme="prefixed"
  css_desc="带前缀（katex@0.18.4+）"
else
  css_scheme="plain"
  css_desc="无前缀（katex@0.16.x）"
fi

# 取「公式最多」的那个页面来判定构建产物用的是哪套类名。
# 用出现次数最多的页面而不是第一个命中的，避免被正文里讨论类名的文字带偏。
page="$(grep -rc --include='*.html' 'class=katex' "$OUT" 2>/dev/null | awk -F: '$2 > 0' | sort -t: -k2 -rn | head -1 | cut -d: -f1 || true)"
if [ -z "$page" ]; then
  echo "· 没有找到含公式的页面，跳过配对校验（当前 CSS 方案：$css_desc）"
  exit 0
fi

if grep -q 'katex-base' "$page"; then html_scheme="prefixed"; else html_scheme="plain"; fi

if [ "$css_scheme" = "$html_scheme" ]; then
  echo "✓ KaTeX 配对正确：样式与构建产物都是 $css_desc"
  exit 0
fi

if [ "$html_scheme" = "prefixed" ]; then
  html_desc="带前缀（Hugo ≥ 0.166，内嵌 KaTeX 0.18.4+）"
else
  html_desc="无前缀（Hugo ≤ 0.165，内嵌 KaTeX 0.16.x）"
fi
echo "✗ KaTeX 样式与 Hugo 内嵌版本不配对："
echo "    static/katex/katex.min.css 是 $css_desc"
echo "    构建产物是 $html_desc（取样页面：$page）"
echo "  修法：按目标 Hugo 版本同时替换 katex.min.css 与 fonts/*.woff2。"
echo "        推荐直接跑 scripts/upgrade-hugo.sh <版本>，它会把版本钉与 KaTeX 资源一起改并自校验。"
exit 1
