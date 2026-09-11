#!/usr/bin/env bash
# 本地预览博客（含草稿），默认 http://localhost:1313/my-blog/
#
# 用法：bash scripts/preview.sh [端口]
#
# 注意 hugo server 是阻塞进程：在 AI 助手里调用时请放到后台运行。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if ! command -v hugo >/dev/null 2>&1; then
  echo "✗ 找不到 hugo，无法启动预览。" >&2
  exit 1
fi

port="${1:-1313}"

echo "▸ 本地预览（含草稿）: http://localhost:${port}/my-blog/"
echo "  改文件会自动刷新；Ctrl+C 退出。"
exec hugo server -D --port "$port" --navigateToChanged
