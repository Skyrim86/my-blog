#!/usr/bin/env bash
# front matter 校验：拦住「构建能过、但页面其实是坏的」那一类问题。
# 由 scripts/push-blog.sh 推送前调用（**阻断**，与 check-tags.sh 的只警告不同），CI 也跑。
#
# 用法：bash scripts/check-frontmatter.sh
# 退出码：0 = 无硬错误（可能带警告）；1 = 有硬错误
#
# 硬错误（必须修）：
#   1. content/ 下任一 .md 没有 front matter 块
#   2. 缺 title
#   3. 文章/课程材料/项目文档（posts、courses、projects 下的非 _index.md）缺 date 或 draft
#   4. date 不是 YYYY-MM-DD 开头
#   5. section 页（_index.md）写了顶层 tags / categories —— 词条页不会列出它，却会让 /tags/ 计数虚高
#   6. 课程材料页（章目录下的 leaf bundle，如 notes/、homework/、lab/、lab-02/）写了顶层 tags
#      —— cascade 只填空不合并，写了会整体丢掉课程标签
#
# 警告（可能是排期或笔误）：
#   a. draft: false 但 date 在未来 —— Hugo 默认不构建未来内容，会静默不上线
#   b. 顶层键不在已知集合里（多半是拼错）
#   c. 两个页面 title 完全相同 —— 列表页与搜索结果里分不出谁是谁
#   d. 处在 cascade 之下的项目文档自己写了 tags —— 会丢掉项目级标签
#   e. 正文含公式、又会出现在列表卡片里的页面缺 summary —— 卡片摘要会显示成错乱公式
#
# ---- 为什么不是「每个文件一串子进程」 ----
# 本脚本原先对每个文件要调约 26 次外部命令（head / tr / awk×5 / cut / grep×3 …）。这在 Linux
# 上无所谓，但在 Windows 的 Git Bash 里每次进程创建约 21ms（实测：200 次 `head -1` = 4.06s，
# 而 1000 次 bash 内建循环 = 25ms），150 个文件就是约 3600 次 spawn —— 实测这一项独占一次
# `push-blog.sh` 的 102 秒里的 **72.6 秒**，而检查逻辑本身是毫秒级的。
#
# 现在改成：**一次 awk 扫描**（把每个文件的顶层键值、正文有没有公式、有没有 front matter 块
# 一次性抽成 TSV）+ **bash 内建判断**（关联数组查键、参数展开取目录名、case 匹配路径）。
# 扫描之后不再有任何 spawn。判定规则与输出逐字未变 —— 改这里请拿一份**带缺陷的 content/**
# 对拍新旧输出（本仓库做过：覆盖缺 front matter / 缺 title / 坏日期 / 未来日期 / section 与
# 材料页写 tags / cascade 下自带 tags / 未知键 / 公式缺 summary / 重复标题 / 块列表 等分支）。
#
# **awk 只用 POSIX 特性**（sub / index / split / FNR / FILENAME / ERE 字符类，不用 gawk 专有的
# gensub、ENDFILE、数组的数组）：本机 Git Bash 是 gawk，而 CI 的 ubuntu runner 上 `awk` 可能是
# mawk —— 用了 gawk 专有语法会在本地全绿、CI 上静默给出错结果（不是报错，是结果不对）。
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

# 站点时区是 Asia/Shanghai（hugo.toml 顶层）。CI 跑在 UTC，所以这里也按东八区取「今天」，
# 否则东八区早上 8 点前的构建会把当天日期的页面误判成「未来」。
# 注意：scripts/check-consistency.mjs 的规则 D 直接从本文件的文本里抽这个 TZ 值，
# 改写成别的形式（如引入 TZ_NAME 常量）会让那条检查取不到值而失败。
TODAY="$(TZ=Asia/Shanghai date +%F)"

# 已知顶层键。没列出的键只警告、不阻断（Hugo 与主题本身还有很多合法 page 参数）。
# 注意：scripts/check-consistency.mjs 的规则 E 是**从这个文件的文本里**抽下面这个 KNOWN_KEYS
# 赋值块（正则匹配到第一个引号为止），再去比对 archetypes/ 与管理页字段表里的顶层键。
# 所以：① 别把它改成数组或另起变量名；② 上面的注释里也不要写出「KNOWN_KEYS 加引号」的样子，
# 否则正则先命中注释、抽出一段空词表，规则 E 就会报一堆假的「没登记」错误（踩过）。
KNOWN_KEYS="title description date draft weight summary math layout url placeholder
tags categories series icon repo unit cascade cover slug lastmod publishDate expiryDate
# plan：课程主页的规划清单（见 layouts/_shortcodes/course-plan.html），值是一个列表
aliases keywords author images type outputs menu sitemap headless searchHidden hideMeta
disableShare ShowToc TocOpen robotsNoIndex canonicalURL plan hiddenInRss"
KNOWN_KEYS=" $(printf '%s' "$KNOWN_KEYS" | tr -s '[:space:]' ' ') "

errors=0
warns=0
TITLE_FILE="$(mktemp)"
trap 'rm -f "$TITLE_FILE"' EXIT

fail() { echo "✗ $*"; errors=$((errors + 1)); }
warn() { echo "  ⚠ $*"; warns=$((warns + 1)); }

# ---------- 文件清单 ----------
# 顺序沿用原先的 `find … | sort`（不用 LC_ALL=C：那会改变中文文件名的排序，也就改变了报告行序）。
FILES=()
while IFS= read -r f; do FILES+=("$f"); done \
  < <(find content -name '*.md' -type f | sort)
FILE_COUNT="${#FILES[@]}"

# ---------- 一次扫描，抽出后面全部判断要用的东西 ----------
#
# awk 输出 TSV（首列是 tag）：
#   F <file> <key> <value>   front matter 块内的**顶层**键值（只认 0 缩进、形如 `key:` 的行；
#                            cascade / cover 的子键与 "- target:" 这类列表项都不会命中）
#   M <file>                 正文（第 2 个 --- 之后）里出现过 $，即含公式
#   N <file>                 首行不是 ---，即没有 front matter 块
#
# `n` 数的是 --- 分隔行的出现次数：n==1 是 front matter 块内、n>=2 是正文
# —— 与原实现里 fm_top / body_has_math 的分界完全相同。
declare -A HAS=() VAL=() MATH=() NO_FM=() KEYS=()
while IFS=$'\t' read -r tag file a b; do
  case "$tag" in
    F)
      # 同名的顶层键只认**第一个**（与原 get_val 里 first-match-then-exit 一致）；
      # KEYS 保留出现顺序，供后面的「未知顶层键」逐条检查。
      if [ -z "${HAS["$file|$a"]+x}" ]; then HAS["$file|$a"]=1; VAL["$file|$a"]="$b"; fi
      KEYS["$file"]="${KEYS["$file"]-} $a"
      ;;
    M) MATH["$file"]=1 ;;
    N) NO_FM["$file"]=1 ;;
  esac
done < <(awk '
    { sub(/\r$/, "") }
    FNR == 1 { n = 0; math = 0; if ($0 != "---") print "N\t" FILENAME }
    /^---[ \t]*$/ { n++; next }
    n == 1 && /^[A-Za-z_][A-Za-z0-9_.-]*[ \t]*:/ {
      k = $0; sub(/[ \t]*:.*/, "", k)
      v = $0; sub(/^[^:]*:[ \t]*/, "", v)
      sub(/[ \t]+#.*$/, "", v)
      sub(/[ \t]*$/, "", v)
      print "F\t" FILENAME "\t" k "\t" v
      next
    }
    n >= 2 && !math && index($0, "$") > 0 { math = 1; print "M\t" FILENAME }
  ' ${FILES[@]+"${FILES[@]}"})

# 键值一律写成关联数组的**直接展开**（`${VAL["$rel|date"]-}`），不要包成 `$(get_val …)`
# 这类命令替换：命令替换要 fork，而 Cygwin 的 fork 实测约 8ms —— 每个文件 5–6 次就把这一趟
# 从 0.4 秒拉到 8 秒（这是本次改造里最后一个、也是最不直观的性能陷阱）。
# 判空用 `${VAL["$rel|key"]-}`，判存在用 `${HAS["$rel|key"]+x}`。

# 这一页是不是处在某个 cascade 之下？判据是**祖先目录里存在 _index.md**，而不是写死项目名，
# 所以以后新建的分层项目自动生效。只从页面所在目录往上找到 content/projects 为止：
# 平铺项目（content/projects/<项目>/index.md）下面没有 _index.md，标签本来就该写在自己身上。
# 目录名用参数展开取（原先每层一次 dirname spawn）；没有斜杠可删时就到底了。
under_cascade() { # $1 = 文件相对路径
  local d="${1%/*}"
  while :; do
    case "$d" in
      content/projects|.|/|'') return 1 ;;
    esac
    [ -f "$d/_index.md" ] && return 0
    case "$d" in
      */*) d="${d%/*}" ;;
      *) return 1 ;;
    esac
  done
}

# ---------- 逐文件判断（顺序与原先一致，报告行序不变） ----------
for rel in ${FILES[@]+"${FILES[@]}"}; do
  # 1) 必须有 front matter 块。不能只看「有没有 ---」（正文里的分隔线也会命中），
  #    所以要求**第一行**就是 ---。
  if [ -n "${NO_FM["$rel"]+x}" ]; then
    fail "$rel：没有 front matter 块（首行必须是 ---）"
    continue
  fi

  # title 去掉包裹的引号再比较（本仓库的 title 统一写双引号，带引号查重会看不出「同名」）
  title="${VAL["$rel|title"]-}"
  title="${title#\"}"
  title="${title%\"}"

  # 2) title 必填（所有页面，含 section 与词条列表页）
  if [ -z "${HAS["$rel|title"]+x}" ] || [ -z "$title" ]; then
    fail "$rel：缺 title（页面 <title>、OG、JSON-LD 与 giscus 关联键都依赖它）"
  fi

  is_index=0
  case "$rel" in */_index.md) is_index=1 ;; esac

  # 3) date / draft：只对「有日期语义」的三个 section 下的非 _index.md 生效。
  #    顶层独立页（about/archives/search）按 Hugo 惯例不带 date/draft，故不在此列。
  case "$rel" in
    content/posts/*|content/courses/*|content/projects/*)
      if [ "$is_index" -eq 0 ]; then
        [ -n "${HAS["$rel|date"]+x}" ]  || fail "$rel：缺 date"
        [ -n "${HAS["$rel|draft"]+x}" ] || fail "$rel：缺 draft"
      fi
      ;;
  esac

  # 4) date 格式 + a) 未来日期
  d="${VAL["$rel|date"]-}"
  if [ -n "$d" ]; then
    case "$d" in
      [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*) ;;
      *) fail "$rel：date「$d」不是 YYYY-MM-DD 开头（Hugo 解析不了会退回零值）" ;;
    esac
    if [ "${VAL["$rel|draft"]-}" != "true" ] && [ "${d:0:10}" \> "$TODAY" ]; then
      warn "$rel：date $d 在未来而 draft 不是 true —— CI 不构建未来内容，这一页不会上线"
    fi
  fi

  # 5) section 页不许写顶层 tags/categories
  if [ "$is_index" -eq 1 ]; then
    for k in tags categories; do
      if [ -n "${HAS["$rel|$k"]+x}" ]; then
        fail "$rel：section 页写了顶层 $k —— 应写进 cascade 并加 target: {kind: page}，否则 /$k/ 计数虚高而词条页里不出现"
      fi
    done
  fi

  # 6) 课程材料页不许写顶层 tags/categories
  #    匹配「章目录下的 leaf bundle」= content/courses/<课程>/<章>/<材料>/index.md。
  #    shell case 的 * 会跨 /，所以三层通配正好覆盖这一步；不写死 notes/homework，
  #    否则新增材料类型（lab、lab-02…）会悄悄绕过这条规则。
  case "$rel" in
    content/courses/*/*/index.md)
      for k in tags categories; do
        if [ -n "${HAS["$rel|$k"]+x}" ]; then
          fail "$rel：课程材料页写了顶层 $k —— 会整体丢掉课程主页 cascade 下发的标签"
        fi
      done
      ;;
  esac

  # d) 处在 cascade 之下的项目文档自带 tags（只警告：这是有意的取舍）
  case "$rel" in
    content/projects/*)
      if [ "$is_index" -eq 0 ] && [ -n "${HAS["$rel|tags"]+x}" ] && under_cascade "$rel"; then
        warn "$rel：自带 tags 会整体丢掉项目主页 cascade 下发的标签（cascade 只填空、不合并）"
      fi
      ;;
  esac

  # e) 正文含公式的页面必须自带 summary（只警告，但强烈建议修）
  #    列表卡片走主题 list.html 的 `.Summary | plainify`。公式在**构建期**已被 KaTeX 渲染成
  #    HTML+MathML，plainify 剥掉标签后会把 MathML 文本、annotation 里的 TeX 源码与视觉文本
  #    三份拼在一起，卡片上就成了「e=x^−xe = \hat{x} - xe=x^−x」。
  #    写 front matter summary 后 Hugo 直接返回它（纯文本，plainify 无害），卡片与搜索索引都干净。
  #    注意：这里**不能**用 `math: true` 做判据 —— 课程材料页的 math 来自课程主页 cascade，
  #    页面自身 front matter 里并没有这个键。也不能把 summary 写进 archetypes（空字符串会被
  #    Hugo 当成「已设置」，卡片反而变成空白），所以只能靠这条警告盯住。
  if [ "$is_index" -eq 0 ] && [ -z "${HAS["$rel|summary"]+x}" ] \
    && [ "${VAL["$rel|searchHidden"]-}" != "true" ] \
    && [ -n "${MATH["$rel"]+x}" ]; then
    case "${VAL["$rel|layout"]-}" in
      toolcard|search|archives) ;;
      *) warn "$rel：正文含公式但没写 summary —— 列表卡片摘要会是错乱公式，请补 summary（可抄 description）" ;;
    esac
  fi

  # b) 未知顶层键（KEYS 里按出现顺序记着这个文件的所有顶层键）
  for k in ${KEYS["$rel"]-}; do
    case "$KNOWN_KEYS" in
      *" $k "*) ;;
      *) warn "$rel：顶层键「$k」不在已知集合里（拼错？）" ;;
    esac
  done

  # c) 收集 title，末尾统一查重。只排除 archives/search 这两个独立 layout 的工具页
  #    （它们的标题是「归档」「搜索」，与内容页重名没有意义）。
  #    以前这里还排除课程材料页，理由是 giscus 按 title 关联 Discussion；2026-09-18 改成
  #    mapping='pathname' 之后评论不再串页，查重的理由变成「列表页/搜索结果里分不出谁是谁」，
  #    对材料页同样成立，所以现在一并统计。
  if [ "$is_index" -eq 0 ] && [ -n "$title" ]; then
    case "${VAL["$rel|layout"]-}" in
      archives|search) ;;
      *) printf '%s\t%s\n' "$title" "$rel" >> "$TITLE_FILE" ;;
    esac
  fi
done

# c) title 查重
dup_titles="$(cut -f1 "$TITLE_FILE" | sort | uniq -d)"
if [ -n "$dup_titles" ]; then
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    warn "以下页面 title 完全相同：「$t」—— 列表页与搜索结果里分不出谁是谁"
    awk -F'\t' -v t="$t" '$1 == t { print "        " $2 }' "$TITLE_FILE"
  done <<< "$dup_titles"
fi

echo
if [ "$errors" -eq 0 ]; then
  if [ "$warns" -eq 0 ]; then
    echo "✓ front matter 校验通过：$FILE_COUNT 个文件，无错误无警告"
  else
    echo "✓ front matter 校验通过：$FILE_COUNT 个文件，$warns 条警告（不阻断，请自行判断）"
  fi
  exit 0
fi
echo "共 $errors 个硬错误，必须修复后才能推送。"
exit 1
