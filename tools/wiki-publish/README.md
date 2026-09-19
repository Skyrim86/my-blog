# wiki 发布（知识库 → 博客的数学库 / CS 库）

## 它做什么

把知识库（`D:\Study\projects\wiki\statml-wiki`，**仓库外**）里**状态为「已验证」**的卡片
写进博客的两个卡片库：

| 知识库里的东西 | 写到这里 |
|---|---|
| `wiki/<大类>/<细分>/<节点id>.card.md` | `data/math-toolbox.json` 或 `data/cs-toolbox.json` 里带 `source: wiki` 的条目 |
| `<节点id>.note.md` 的「证明 / 动机与定位 / 边界与易错」 | 条目的 `proof` / `usage` / `note` 字段 |
| `maps/curriculum.yaml` 节点的 `分类` | 条目的 `branch` / `section` |
| 卡片正文里的 `[[节点id]]` | 博客的 `{{< card "标题" >}}`（目标未发布时退化成纯文本并告警） |

哪个库由知识库 `_meta/分类.yaml` 里大类的 `库: math|cs` 决定。

## 与 import_course.py 的关系

两者**共存、互不覆盖**：

- `tools/course-import/import_course.py`（规则 15）管课程项目导入的那些卡；
- 本脚本**只增改带 `source: wiki` 标记的条目**，其余原样保留。

所以它不会把课程导入的 80 张卡或手写的 CS 卡冲掉，反过来也一样。

## 用法

```bash
python tools/wiki-publish/publish.py --check     # 只比对，有差异退出 1
python tools/wiki-publish/publish.py --dry-run   # 打印计划，不写盘
python tools/wiki-publish/publish.py             # 落盘
python tools/wiki-publish/publish.py --wiki <路径>   # 知识库不在默认位置时
```

也可以在博客管理页里点：**发布** 页签 → 「从知识库发布卡片」（它调用同一个脚本，
换位置用 `ADMIN_WIKI` 环境变量指定，与 `ADMIN_BASH` / `ADMIN_PYTHON` 是同一套出口）。

## 为什么它是本地检查、不进 CI

知识库在仓库外的本地绝对路径上，**CI 的机器上没有它** —— 这个检查在那边必然报
「知识库不存在」。所以它刻意不登记进 `.github/actions/validate/action.yml` 与
`scripts/push-blog.sh`，在管理页体检面板里也是 `blocking: false`（它拦的不是「博客有
问题」，只是「有卡片还没发布」，不该阻断发布）。理由同 `tools/admin/lib/checks.mjs` 那一项
的注释。

## 发布之后必须做的事

博客的公式是**构建期 KaTeX**（`throwOnError = true`），一处坏公式就让整站构建失败，所以：

```bash
node scripts/check-math-katex.mjs                          # 公式真检
hugo --minify --gc --cleanDestinationDir                   # 构建
```

再走 `scripts/push-blog.sh` 就是完整流程（它自带全套检查与提交）。

## 两个容易踩的坑

1. **行尾必须是 LF。** 本脚本一律以 `newline="\n"` 写盘：Python 在 Windows 上默认写 CRLF，
   而 `scripts/gen-cards.mjs cs --check` 是**逐字节**比对卡片页的 —— 写出 CRLF 会让本地全绿、
   CI 报「卡片页与数据不一致」，而肉眼看不出差别。`gen-cards.mjs` 的比对也已改成忽略行尾，
   两道一起挡。
2. **数学卡的课程必须有工具箱页。** 数学卡的 URL 是 `/courses/<课程>/toolbox/<id>/`，
   没有 `toolbox/_index.md` 时 `card-ref.html` 会退回「全站第一个 `layout: tools` 的页面」，
   于是卡片链接指向别的课程、点开 404。脚本会自动补建缺失的入口页。
