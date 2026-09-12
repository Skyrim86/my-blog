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
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

CONTENT_DIR="content"
[ -d "$CONTENT_DIR" ] || { echo "✗ 找不到 $CONTENT_DIR 目录" >&2; exit 1; }

errors=0
sections=0

fail() { echo "✗ $*"; errors=$((errors + 1)); }

# 目录是否位于某个 leaf bundle 内部（祖先目录里有 index.md）。
# bundle 内的子目录是资源目录，不是 section，不该要求它带 _index.md。
in_leaf_bundle() { # $1 = 目录
  local d
  d="$(dirname "$1")"
  while [ "$d" != "." ] && [ "$d" != "/" ] && [ "$d" != "$CONTENT_DIR" ]; do
    if [ -f "$d/index.md" ]; then return 0; fi
    d="$(dirname "$d")"
  done
  return 1
}

while IFS= read -r dir; do
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
  pages="$(find "$dir" -type f -name '*.md' | wc -l | tr -d '[:space:]')"
  if [ "$pages" -eq 0 ]; then continue; fi

  rel="${dir#"$CONTENT_DIR"/}"
  fail "$dir/ 没有 _index.md —— 这个 section 的列表页不存在，URL 与指向它的入口都是空处"
  echo "    它下面现在有 $pages 个 .md 页面，Hugo 还能生成该列表页只是因为它们还在；"
  echo "    子页面一删空，列表页本身与所有指向它的入口（导航栏、首页、正文链接）会一起 404。"
  echo "    修法：bash scripts/new-content.sh section $rel --title \"标题\""
done < <(find "$CONTENT_DIR" -type d | LC_ALL=C sort)

if [ "$errors" -eq 0 ]; then
  echo "✓ 结构校验通过：$sections 个 section 目录都有 _index.md"
  exit 0
fi

echo
echo "✗ 结构校验未通过：$errors 处问题必须修复。"
exit 1
