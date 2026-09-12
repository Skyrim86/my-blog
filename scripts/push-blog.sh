#!/usr/bin/env bash
# 一键构建 + 提交 + 推送博客（日常更新内容的固定入口，见 docs/architecture.md 第 4 节）。
#
# 用法：bash scripts/push-blog.sh ["提交说明"]
#   不传说明时用默认说明。示例：bash scripts/push-blog.sh "feat: CMC2026 新增问题二"
#
# 行为：
#   1. 所在分支必须是 main，否则中止（避免误推）
#   2. 工作区有改动时，按「先快后慢」的顺序跑校验，任何**阻断项**失败即中止、不提交不推送：
#        front matter 校验（阻断）→ 标签词表（只警告）→ 草稿提醒（只警告）
#        → hugo 构建（阻断）→ KaTeX 配对（阻断）→ 站内链接（阻断）→ 体积预算（阻断）
#      这套校验与 CI 的 .github/actions/validate 同源，所以本地过了 CI 基本就过。
#   3. git add -A（含删除）→ git commit
#   4. git push origin main
#   5. 若 gh 已安装并登录，打印最近一次 Actions 结果；否则提示去 Actions 页面看
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "✗ 当前分支是 $branch，本脚本只从 main 推送。已中止。"
  exit 1
fi

if ! command -v hugo >/dev/null 2>&1; then
  echo "✗ 找不到 hugo，无法做构建校验。已中止。"
  exit 1
fi

msg="${*:-chore: 更新博客内容}"
dirty="$(git status --porcelain -uall)"
ahead="$(git rev-list --count '@{u}..HEAD' 2>/dev/null || echo 0)"

if [ -n "$dirty" ]; then
  # front matter 校验：**阻断**。这一项专门拦「构建能过、页面其实是坏的」——
  # 例如整页没有 front matter（标题会变成站点名）、section 页写了 tags（计数虚高）。
  if [ -f scripts/check-frontmatter.sh ]; then
    echo "▸ front matter 校验"
    if fm_log="$(bash scripts/check-frontmatter.sh 2>&1)"; then
      printf '%s\n' "$fm_log" | grep -E '^(✓|  ⚠)' | sed 's/^/  /' || true
    else
      printf '%s\n' "$fm_log" | sed 's/^/  /'
      echo "✗ front matter 校验未通过，已中止（未提交、未推送）。"
      exit 1
    fi
  fi

  # 标签词表校验：提醒拼写漂移（同名标签写错会分裂出两个词条页）。只警告，不阻断。
  if [ -f scripts/check-tags.sh ]; then
    echo "▸ 标签词表校验"
    if tag_log="$(bash scripts/check-tags.sh 2>&1)"; then
      printf '%s\n' "$tag_log" | tail -1 | sed 's/^/  /'
    else
      printf '%s\n' "$tag_log" | sed 's/^/  /'
      echo "  ⚠ 有未登记的标签（只警告，不阻断）"
    fi
  fi

  # 编辑器字段表漂移：archetypes 加了字段而管理页没跟上，会让 CLI 与界面新建出不同的内容。
  # 内部一致性问题，只提醒，不阻断发布。
  if [ -f scripts/check-editor-schema.mjs ]; then
    if ! schema_log="$(node scripts/check-editor-schema.mjs 2>&1)"; then
      echo "  ⚠ archetypes 与管理页字段表已分叉："
      printf '%s\n' "$schema_log" | sed 's/^/      /'
    fi
  fi

  # 草稿提醒：archetype 默认 draft: true，而 CI 不构建草稿，
  # 草稿会被静默提交推送、然后悄悄不上线（最容易踩的坑）。这里只提醒，不阻断。
  drafts="$(grep -rl --include='*.md' '^draft:[[:space:]]*true' content 2>/dev/null || true)"
  if [ -n "$drafts" ]; then
    echo "  ⚠ 以下内容仍是草稿（draft: true），本次推送后 CI 不会发布它们："
    printf '%s\n' "$drafts" | tr '\\' '/' | sed 's/^/      /'
  fi

  # --cleanDestinationDir 不能省：hugo 默认不清目标目录，曾经跑过 hugo -D 的话
  # public/ 里会留下草稿页等陈旧产物，后面链接/体积检查量的就是错的东西。
  echo "▸ 构建校验（hugo --minify --gc --cleanDestinationDir）"
  build_log="$(mktemp)"
  if ! hugo --minify --gc --cleanDestinationDir >"$build_log" 2>&1; then
    echo "✗ 构建失败，未提交也未推送。日志尾部："
    tail -20 "$build_log"
    echo "  （完整日志：$build_log）"
    exit 1
  fi
  rm -f "$build_log"
  echo "  ✓ 构建通过"

  # 构建后才能做的三项（都是阻断项，且与 CI 同源）
  if [ -f scripts/check-katex-pairing.sh ]; then
    echo "▸ KaTeX 与 Hugo 版本配对校验"
    if ! kx_log="$(bash scripts/check-katex-pairing.sh 2>&1)"; then
      printf '%s\n' "$kx_log" | sed 's/^/  /'
      echo "✗ 公式样式与构建产物不配对，已中止（未提交、未推送）。"
      exit 1
    fi
    printf '%s\n' "$kx_log" | sed 's/^/  /'
  fi

  if [ -f scripts/check-links.mjs ]; then
    echo "▸ 站内链接与锚点检查"
    if ! ln_log="$(node scripts/check-links.mjs 2>&1)"; then
      printf '%s\n' "$ln_log" | sed 's/^/  /'
      echo "✗ 有坏链，已中止（未提交、未推送）。"
      exit 1
    fi
    printf '%s\n' "$ln_log" | head -1 | sed 's/^/  /'
  fi

  # 体积预算：成功时只留 3 行结论，超标时打全表（含最重页面 Top 10）便于定位。
  if [ -f scripts/report-size.sh ]; then
    echo "▸ 体积预算"
    size_log="$(mktemp)"
    if bash scripts/report-size.sh >"$size_log" 2>&1; then
      sed -n '/▸ 预算/,$p' "$size_log" | sed 's/^/  /'
      rm -f "$size_log"
    else
      sed 's/^/  /' "$size_log"
      rm -f "$size_log"
      echo "✗ 超出体积预算，已中止（未提交、未推送）。确认是有意增长就调高 scripts/report-size.sh 里的上限。"
      exit 1
    fi
  fi

  # 过滤 git 的 CRLF 提示，其余 stderr 保留
  git add -A 2> >(grep -v 'LF will be replaced by CRLF' >&2 || true)
  git commit -q -m "$msg"
  echo "▸ 已提交：$(git log -1 --format='%h %s')"
elif [ "$ahead" -eq 0 ]; then
  echo "· 没有需要推送的内容（工作区干净，且与 origin/main 同步）"
  exit 0
else
  echo "· 工作区无改动，有 $ahead 个提交待推送"
fi

echo "▸ 推送到 origin/main"
git push origin main

if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  echo "▸ 最近一次 Actions 运行："
  gh run list --limit 1 2>/dev/null || true
else
  echo "· 未检测到可用的 gh（未安装或未登录），CI 状态请到仓库 Actions 页面查看"
fi

echo "✓ 推送完成，CI 会自动部署到 https://skyrim86.github.io/my-blog/"
