#!/usr/bin/env bash
# 博客本地管理页：一个中文网页，用来新建/编辑内容、管理标签词表、查看改动、一键发布，
# 并在同屏 iframe 里实时预览渲染效果。
#
# 用法：bash scripts/admin.sh [选项]
#   --port N          管理页端口（默认 1414）
#   --host H          绑定地址（默认 127.0.0.1）
#   --preview-port N  预览端口（默认 1313，被占用时自动顺延）
#   --no-preview      不启动 hugo server（管理页仍可用，只是没有内嵌预览）
#   --no-open         不自动打开浏览器
#   -h, --help        看帮助
#
# 它只是现有脚本的界面外壳：新建走 scripts/new-content.sh，发布走 scripts/push-blog.sh，
# 所以 front matter 仍然来自 archetypes/、标签仍然来自 data/taxonomy.yaml。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

PORT=1414
HOST=127.0.0.1
PREVIEW_PORT=1313
NO_PREVIEW=0
NO_OPEN=0
PASSTHROUGH=()

usage() {
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port) PORT="${2:-}"; shift 2 || { echo "✗ --port 缺少值" >&2; exit 1; } ;;
    --port=*) PORT="${1#*=}"; shift ;;
    --host) HOST="${2:-}"; shift 2 || { echo "✗ --host 缺少值" >&2; exit 1; } ;;
    --host=*) HOST="${1#*=}"; shift ;;
    --preview-port) PREVIEW_PORT="${2:-}"; shift 2 || { echo "✗ --preview-port 缺少值" >&2; exit 1; } ;;
    --preview-port=*) PREVIEW_PORT="${1#*=}"; shift ;;
    --no-preview) NO_PREVIEW=1; shift ;;
    --no-open) NO_OPEN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "✗ 未知选项：$1" >&2; usage; exit 1 ;;
  esac
done

command -v node >/dev/null 2>&1 || {
  echo "✗ 找不到 node，无法启动管理页。安装 Node.js 18+ 后重试。" >&2
  exit 1
}
command -v hugo >/dev/null 2>&1 || {
  echo "✗ 找不到 hugo：新建内容与预览都需要它（new-content.sh 会调用 hugo new content）。" >&2
  exit 1
}
[ -f scripts/admin/server.mjs ] || { echo "✗ 找不到 scripts/admin/server.mjs" >&2; exit 1; }

# 把 bash 的 Windows 路径交给 Node，省得它在 PATH 里乱猜（Git Bash 下 bash 是 /usr/bin/bash）。
if command -v cygpath >/dev/null 2>&1; then
  export ADMIN_BASH="${ADMIN_BASH:-$(cygpath -w "$(command -v bash)")}"
else
  export ADMIN_BASH="${ADMIN_BASH:-$(command -v bash)}"
fi

[ "$NO_PREVIEW" = "1" ] && PASSTHROUGH+=("--no-preview")

open_url() {
  local url="$1"
  case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*) cmd //c start "" "$url" >/dev/null 2>&1 || true ;;
    Darwin) open "$url" >/dev/null 2>&1 || true ;;
    *) xdg-open "$url" >/dev/null 2>&1 || true ;;
  esac
}

# 这几行中文提示放在这里而不是 .bat / .cmd 里：批处理文件里混进中文会让 cmd.exe
# 按错字节偏移重读文件、把半行当命令执行（详见 AGENTS.md 4.2⑬）。这里由 bash 打印，
# 配合启动器的 chcp 65001，中文正常显示。
URL="http://127.0.0.1:${PORT}/"
echo "▸ 博客管理页：${URL}"
if [ "$NO_OPEN" = "1" ]; then
  echo "  （--no-open：浏览器不会自动打开，请手动访问上面的地址）"
else
  echo "  浏览器会自动打开这个地址"
fi
if [ "$HOST" != "127.0.0.1" ] && [ "$HOST" != "localhost" ]; then
  echo "  ⚠ 绑定在 ${HOST}：同网段设备都能打开这个能执行命令的页面，用完请尽快关闭"
fi
echo "  停止：在本窗口按 Ctrl+C，或直接关闭本窗口（它启动的 hugo 预览会一起关掉）"

# 后台等端口起来再开浏览器，免得打开的是错误页。
if [ "$NO_OPEN" != "1" ]; then
  (
    for _ in $(seq 1 60); do
      if curl -fsS "${URL}api/ping" >/dev/null 2>&1; then
        open_url "$URL"
        exit 0
      fi
      sleep 0.5
    done
  ) &
fi

exec node scripts/admin/server.mjs \
  --port "$PORT" --host "$HOST" --preview-port "$PREVIEW_PORT" \
  ${PASSTHROUGH[@]+"${PASSTHROUGH[@]}"}
