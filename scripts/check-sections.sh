#!/usr/bin/env bash
# 结构校验：每个 section 目录都必须有 _index.md（列表页）。
# 由 scripts/push-blog.sh 推送前调用（**阻断**），CI 也跑（见 .github/actions/validate/action.yml）。
#
# 为什么要单独一条检查（实测踩过）：
#   一个 section 目录没有 _index.md 时，Hugo 照样会生成它的列表页 —— 但那是「隐式 section」，
#   那个页面能不能存在，取决于它下面还有没有子页面。content/posts/ 曾经只有一篇占位文章、
#   没有 _index.md，那篇文章一删，/posts/ 整个消失，导航栏「文章」与 about 页里的 /posts/
#   链接全部 404，而没有任何校验发现：
#     · check-frontmatter.sh 只遍历**已存在**的 .md 文件，「文件缺失」它看不见；
#     · 导航栏链接是带域名的绝对 URL，被 check-links.mjs 当外链跳过（现已修正，见那个脚本）。
#   所以这里把「section 的列表页必须存在」变成一条显式的不变量。
#
# 判据（只扫 content/，不依赖构建产物，所以排在快校验里、不需要先构建）：
#   · content/ 根豁免：首页由 layouts/index.html 提供，不会消失
#   · 目录里有 index.md  → leaf bundle，跳过它自己与整个子树（bundle 内的子目录是资源目录）
#   · 目录里有 _index.md → 合规
#   · 两者都没有，但下面还有 .md 页面 → 报错（隐式 section：页面会随最后一个子页面消失）
#   · 两者都没有，下面也没有 .md     → 忽略（空目录 / 只放附件的目录，Hugo 不为它生成页面）
#   · 两者都有 → 报错（Hugo 判定不了这是 leaf 还是 branch bundle）
#
# 用法：bash scripts/check-sections.sh
# 退出码：0 = 合规；1 = 有缺 _index.md 或 bundle 类型冲突的目录
#
# ---- 性能：为什么目录名用参数展开、页面数一次算完 ----
# 本脚本原先对每个目录的每一层祖先调一次 `dirname`，对没有列表页的目录还要 `find | wc | tr`
# 数一遍页面。Windows 的 Git Bash 里每次进程创建约 21ms（实测：200 次 `head -1` = 4.06s），
# 134 个目录 × 每层一次 dirname 就是 5 秒以上 —— 实测本脚本要 8.05 秒。
# 现在目录名用 `${d%/*}` 参数展开，各目录的递归 .md 数量由**一次 awk** 顺着文件路径累加出来，
# 扫描之后不再有任何 spawn。判定规则与输出逐字未变 —— 改这里请拿一份带缺陷的 content/ 对拍。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CONTENT_DIR="content"
[ -d "$CONTENT_DIR" ] || { echo "✗ 找不到 $CONTENT_DIR 目录" >&2; exit 1; }

errors=0
sections=0

fail() { echo "✗ $*"; errors=$((errors + 1)); }

# ---------- 一次算完：每个目录下（递归）有多少个 .md 页面 ----------
# 原实现是 `find "$dir" -type f -name '*.md' | wc -l`，对每个目录都要跑一遍。这里顺着每个
# 文件的路径把它的**每一层祖先目录**都 +1，一次得到全部目录的递归计数（键是 content/ 开头的相对路径）。
declare -A PAGES=()
while IFS=$'\t' read -r d c; do PAGES["$d"]="$c"; done < <(
  find "$CONTENT_DIR" -type f -name '*.md' | awk -F/ '
    {
      p = ""
      for (i = 1; i < NF; i++) {
        p = (i == 1) ? $i : p "/" $i
        cnt[p]++
      }
    }
    END { for (d in cnt) print d "\t" cnt[d] }
  '
)

# 目录是否位于某个 leaf bundle 内部（祖先目录里有 index.md）。
# bundle 内的子目录是资源目录，不是 section，不该要求它带 _index.md。
# 目录名改用参数展开（原先每层一次 dirname spawn）；没有斜杠可删时就到底了。
in_leaf_bundle() { # $1 = 目录
  local d="${1%/*}"
  while :; do
    case "$d" in
      .|/|"$CONTENT_DIR"|'') return 1 ;;
    esac
    [ -f "$d/index.md" ] && return 0
    case "$d" in
      */*) d="${d%/*}" ;;
      *) return 1 ;;
    esac
  done
}

DIRS=()
while IFS= read -r dir; do DIRS+=("$dir"); done \
  < <(find "$CONTENT_DIR" -type d | LC_ALL=C sort)

for dir in ${DIRS[@]+"${DIRS[@]}"}; do
  if [ "$dir" = "$CONTENT_DIR" ]; then continue; fi
  if in_leaf_bundle "$dir"; then continue; fi

  if [ -f "$dir/index.md" ]; then
    if [ -f "$dir/_index.md" ]; then
      fail "$dir/ 同时有 index.md 与 _index.md —— Hugo 判定不了这是 leaf bundle 还是 branch bundle"
      echo "    修法：二选一。单页 + 附件的 leaf bundle 用 index.md，列表页 + 子页面的 section 用 _index.md。"
    fi
    continue
  fi

  if [ -f "$dir/_index.md" ]; then
    sections=$((sections + 1))
    continue
  fi

  # 没有 _index.md：只有它下面确实还有页面时，才是「隐式 section」
  pages="${PAGES["$dir"]-0}"
  if [ "$pages" -eq 0 ]; then continue; fi

  rel="${dir#"$CONTENT_DIR"/}"
  fail "$dir/ 没有 _index.md —— 这个 section 的列表页不存在，URL 与指向它的入口都是空处"
  echo "    它下面现在有 $pages 个 .md 页面，Hugo 还能生成该列表页只是因为它们还在；"
  echo "    子页面一删空，列表页本身与所有指向它的入口（导航栏、首页、正文链接）会一起 404。"
  echo "    修法：bash scripts/new-content.sh section $rel --title \"标题\""
done

if [ "$errors" -eq 0 ]; then
  echo "✓ 结构校验通过：$sections 个 section 目录都有 _index.md"
  exit 0
fi

echo
echo "✗ 结构校验未通过：$errors 处问题必须修复。"
exit 1
