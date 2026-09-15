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

# 子路径从 hugo.toml 的 baseURL 现读，不在这里再写一份：预览必须挂在同一个子路径下。
subpath="$(sed -n "s|^baseURL *= *['\"]https\?://[^/]*\(/[^'\"]*\)['\"].*|\1|p" hugo.toml | head -1)"
subpath="${subpath:-/}"

echo "▸ 本地预览（含草稿）: http://localhost:${port}${subpath}"
echo "  baseURL 指向本机：菜单、favicon 这些 absURL 才落在预览里，否则它们指向线上站点"
echo "  （本地改了图标/样式看不到，点菜单还会跳走）。"
echo "  改文件会自动刷新；Ctrl+C 退出。"

# 用环境变量而不是 --baseURL：--baseURL 只在**首次**构建生效，watch 触发的重建会退回
# hugo.toml 里的 baseURL（实测：改一个文件后菜单与 favicon 又指向线上站点）。
# HUGO_BASEURL 每次构建都读，重建也保持本机地址。
export HUGO_BASEURL="http://localhost:${port}${subpath}"
exec hugo server -D --port "$port" --navigateToChanged
