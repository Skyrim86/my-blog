#!/usr/bin/env bash
# 一键构建 + 提交 + 推送博客（日常更新内容的固定入口，见 AGENTS.md 第 6 节）。
#
# 用法：bash scripts/push-blog.sh ["提交说明"]
#   不传说明时用默认说明。示例：bash scripts/push-blog.sh "feat: CMC2026 新增问题二"
#
# 行为：
#   1. 所在分支必须是 main，否则中止（避免误推）
#   2. 工作区有改动 → hugo 构建校验（与 CI 同版本同参数），失败即中止、不提交不推送
#      → git add -A（含删除）→ git commit
#   3. git push origin main
#   4. 若 gh 已安装并登录，打印最近一次 Actions 结果；否则提示去 Actions 页面看
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
  echo "▸ 构建校验（hugo --minify --gc）"
  build_log="$(mktemp)"
  if ! hugo --minify --gc >"$build_log" 2>&1; then
    echo "✗ 构建失败，未提交也未推送。日志尾部："
    tail -20 "$build_log"
    echo "  （完整日志：$build_log）"
    exit 1
  fi
  rm -f "$build_log"
  echo "  ✓ 构建通过"

  # 草稿提醒：archetype 默认 draft: true，而 CI 不构建草稿，
  # 草稿会被静默提交推送、然后悄悄不上线（最容易踩的坑）。这里只提醒，不阻断。
  drafts="$(grep -rl --include='*.md' '^draft:[[:space:]]*true' content 2>/dev/null || true)"
  if [ -n "$drafts" ]; then
    echo "  ⚠ 以下内容仍是草稿（draft: true），本次推送后 CI 不会发布它们："
    printf '%s\n' "$drafts" | tr '\\' '/' | sed 's/^/      /'
  fi

  # 标签词表校验：提醒拼写漂移（同名标签写错会分裂出两个词条页）。只提醒，不阻断。
  if [ -f scripts/check-tags.sh ]; then
    if ! tag_log="$(bash scripts/check-tags.sh 2>&1)"; then
      echo "  ⚠ 标签词表校验未通过："
      printf '%s\n' "$tag_log" | sed 's/^/      /'
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
