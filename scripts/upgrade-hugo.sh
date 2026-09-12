#!/usr/bin/env bash
# 一键把 Hugo 与 KaTeX 资源**同步**升级。
#
# 为什么必须一起升：公式是构建期由 Hugo 内嵌的 KaTeX（WASM）渲染成 HTML 的，而排版规则来自
# static/katex/katex.min.css。两者必须属于同一套类名方案（Hugo 官方 issue #15254）：
#   Hugo ≤ 0.165 → 内嵌 KaTeX 0.16.x  → 类名**无前缀**（.base{} / .strut{}）
#   Hugo ≥ 0.166 → 内嵌 KaTeX 0.18.4+ → 类名**带前缀**（katex-base）
# 只升 Hugo 不换 CSS 的表现是公式上下标错位、分数塌陷 —— 页面不报错，所以很容易漏过去。
#
# 用法：
#   bash scripts/upgrade-hugo.sh --dry-run 0.166.0    # 只演练：解析版本、下载、校验方案，不写任何文件
#   bash scripts/upgrade-hugo.sh 0.166.0              # 实际改写
#
# 会改动的地方：
#   1. .github/actions/validate/action.yml 的 hugo-version（版本钉的唯一事实源）
#   2. static/katex/katex.min.css 与 static/katex/fonts/*.woff2
#   3. layouts/_partials/extend_head.html 里那句 KaTeX 版本注释
#
# 需要网络（走 npm registry 取 KaTeX 包）。校验失败会自动还原，不会留下半成品。
# 权威验证在 CI：版本钉改动推上去后，.github/actions/validate 里的
# check-katex-pairing.sh 会拿真实 Hugo 构建并比对类名方案（本地没装新 Hugo 时无法做这一步）。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

DRY=0
if [ "${1:-}" = "--dry-run" ]; then
  DRY=1
  shift
fi
HUGO_VER="${1:-}"
if [ -z "$HUGO_VER" ]; then
  echo "用法：bash scripts/upgrade-hugo.sh [--dry-run] <hugo版本>   例如 0.166.0" >&2
  exit 2
fi

VERSION_FILE=".github/actions/validate/action.yml"
CSS="static/katex/katex.min.css"
FONTS_DIR="static/katex/fonts"
COMMENT_FILE="layouts/_partials/extend_head.html"

[ -f "$VERSION_FILE" ] || { echo "✗ 找不到 $VERSION_FILE" >&2; exit 1; }
[ -f "$CSS" ] || { echo "✗ 找不到 $CSS" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "✗ 需要 node（用来解析版本列表）" >&2; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "✗ 需要 npm（从 registry 取 KaTeX 包）" >&2; exit 1; }

# ---- 1. 由目标 Hugo 版本判断需要的 KaTeX 产品线 ----
mm="$(printf '%s' "$HUGO_VER" | sed 's/^v//' | cut -d. -f1,2)"
major="${mm%%.*}"
minor="${mm##*.}"
case "$major.$minor" in
  *[!0-9.]*) echo "✗ 版本号「$HUGO_VER」不像 Hugo 版本（要形如 0.166.0）" >&2; exit 2 ;;
esac
if [ "$major" -eq 0 ] && [ "$minor" -le 165 ]; then
  KATEX_LINE="0.16"
  KATEX_MIN_PATCH="0"   # 0.16.x 全线都是无前缀方案
  NEED_SCHEME="plain"
  SCHEME_DESC="无前缀，.base{} / .strut{}"
else
  KATEX_LINE="0.18"
  KATEX_MIN_PATCH="4"   # 0.18.0–0.18.3 仍是旧方案，0.18.4 起才带前缀
  NEED_SCHEME="prefixed"
  SCHEME_DESC="带前缀，katex-base"
fi

current_pin="$(grep -o "hugo-version: *'[^']*'" "$VERSION_FILE" | head -1 | sed "s/.*'\(.*\)'/\1/")"
echo "▸ 当前 Hugo 钉：${current_pin:-未找到}"
echo "▸ 目标 Hugo：$HUGO_VER  →  需要 KaTeX $KATEX_LINE.x（$SCHEME_DESC）"
if [ "$current_pin" = "$HUGO_VER" ] && [ "$DRY" -eq 0 ]; then
  echo "· 版本钉已经是 $HUGO_VER。要重装 KaTeX 资源请直接改这里或加 --dry-run 演练。"
  exit 0
fi

# ---- 2. 在目标产品线内选最新的 KaTeX 版本 ----
echo "▸ 查询 npm 上 katex $KATEX_LINE.x 的最新版本"
KATEX_VER="$(npm view katex versions --json 2>/dev/null | node -e '
const chunks = [];
process.stdin.on("data", (c) => chunks.push(c)).on("end", () => {
  const all = JSON.parse(chunks.join(""));
  const line = process.argv[1], minPatch = Number(process.argv[2]);
  const ok = all
    .filter((v) => v.split(".").slice(0, 2).join(".") === line)
    .filter((v) => Number(v.split(".")[2]) >= minPatch)
    .sort((a, b) => Number(a.split(".")[2]) - Number(b.split(".")[2]));
  if (!ok.length) { console.error("该产品线没有满足条件的版本"); process.exit(1); }
  process.stdout.write(ok[ok.length - 1]);
});
' "$KATEX_LINE" "$KATEX_MIN_PATCH")" || { echo "✗ 解析 KaTeX 版本失败" >&2; exit 1; }
echo "  → katex@$KATEX_VER"

# ---- 3. 下载并解包（下载到临时目录，不动仓库）----
TMP="$(mktemp -d)"
RESTORE=0
backup() {
  mkdir -p "$TMP/backup/fonts"
  cp -f "$CSS" "$TMP/backup/katex.min.css" 2>/dev/null || true
  cp -f "$FONTS_DIR"/*.woff2 "$TMP/backup/fonts/" 2>/dev/null || true
}
restore() {
  [ "$RESTORE" -eq 1 ] || return 0
  cp -f "$TMP/backup/katex.min.css" "$CSS" 2>/dev/null || true
  rm -f "$FONTS_DIR"/*.woff2
  cp -f "$TMP/backup/fonts"/*.woff2 "$FONTS_DIR/" 2>/dev/null || true
  echo "  ↺ 已还原 static/katex/ 到改动前的状态"
}
trap 'restore; rm -rf "$TMP"' EXIT

echo "▸ 下载并解包（npm pack katex@$KATEX_VER）"
( cd "$TMP" && npm pack "katex@$KATEX_VER" >/dev/null 2>&1 ) || { echo "✗ npm pack 失败（网络？）" >&2; exit 1; }
tar -xzf "$TMP/katex-$KATEX_VER.tgz" -C "$TMP" || { echo "✗ 解包失败" >&2; exit 1; }
NEW_CSS="$TMP/package/dist/katex.min.css"
[ -f "$NEW_CSS" ] || { echo "✗ 包里找不到 dist/katex.min.css" >&2; exit 1; }
new_font_count="$(find "$TMP/package/dist/fonts" -name '*.woff2' | wc -l | tr -d '[:space:]')"

# ---- 4. 先在临时目录校验：新 CSS 的类名方案必须与目标 Hugo 一致 ----
if grep -q 'katex-base' "$NEW_CSS"; then got="prefixed"; else got="plain"; fi
if [ "$got" != "$NEED_SCHEME" ]; then
  echo "✗ katex@$KATEX_VER 的类名方案（$got）与目标 Hugo $HUGO_VER 需要的（$NEED_SCHEME）不一致，已中止、未改动任何文件。" >&2
  exit 1
fi
echo "  ✓ katex@$KATEX_VER 的方案校验通过：$SCHEME_DESC，$new_font_count 个 woff2 字体"

if [ "$DRY" -eq 1 ]; then
  echo
  echo "▸ --dry-run：演练完成，未写任何文件。实际会做："
  echo "  · $VERSION_FILE 的 hugo-version: '$current_pin' → '$HUGO_VER'"
  echo "  · 替换 $CSS 与 $FONTS_DIR/*.woff2（katex@$KATEX_VER）"
  echo "  · 更新 $COMMENT_FILE 里的 KaTeX 版本注释"
  exit 0
fi

# ---- 5. 实际写入 ----
backup
RESTORE=1

cp -f "$NEW_CSS" "$CSS"
rm -f "$FONTS_DIR"/*.woff2
cp -f "$TMP/package/dist/fonts/"*.woff2 "$FONTS_DIR/"

# 写后复核：文件真的换了，方案也对
if ! grep -q 'katex-base' "$CSS"; then got="plain"; else got="prefixed"; fi
font_count="$(find "$FONTS_DIR" -name '*.woff2' | wc -l | tr -d '[:space:]')"
if [ "$got" != "$NEED_SCHEME" ] || [ "$font_count" -ne "$new_font_count" ]; then
  echo "✗ 写入后复核不通过（方案 $got，字体 $font_count/$new_font_count），回滚。" >&2
  restore
  exit 1
fi
echo "  ✓ static/katex/ 已更新：katex@$KATEX_VER，$font_count 个字体，方案 $SCHEME_DESC"

# 版本钉（唯一事实源）
sed -i "s|^\( *hugo-version: *'\)[^']*\('\)|\1$HUGO_VER\2|" "$VERSION_FILE"
new_pin="$(grep -o "hugo-version: *'[^']*'" "$VERSION_FILE" | head -1 | sed "s/.*'\(.*\)'/\1/")"
if [ "$new_pin" != "$HUGO_VER" ]; then
  echo "✗ 版本钉没有写成功（现在是「$new_pin」），回滚 static/katex/。请手动改 $VERSION_FILE。" >&2
  restore
  exit 1
fi
echo "  ✓ $VERSION_FILE 的 hugo-version 已改为 $HUGO_VER"

# extend_head.html 里的版本注释（写死的说明文字，找不到就提醒手工改，不静默跳过）
if grep -q '当前 CSS 是 \*\*0\.1[68]\.x\*\*' "$COMMENT_FILE" 2>/dev/null; then
  sed -i "s|当前 CSS 是 \*\*0\.1[68]\.x\*\*（与 Hugo [0-9.]* 内嵌的 KaTeX 同版）|当前 CSS 是 **${KATEX_LINE}.x**（katex@${KATEX_VER}，与 Hugo ${HUGO_VER} 内嵌的 KaTeX 同版）|" "$COMMENT_FILE"
  echo "  ✓ $COMMENT_FILE 的版本注释已同步"
else
  echo "  ⚠ $COMMENT_FILE 里没找到预期的版本注释，请手动确认那句「当前 CSS 是 **x.y.x**」已更新为 ${KATEX_LINE}.x"
fi

RESTORE=0
echo
echo "✓ 完成。接下来："
echo "  1. 本地预览抽查一个公式页（bash scripts/preview.sh，重点看分数与上下标）"
echo "  2. 推送后由 CI 做权威校验：check-katex-pairing.sh 会用真实 Hugo 构建并比对类名方案"
