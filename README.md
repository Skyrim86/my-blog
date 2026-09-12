# Skyrim 的博客

中文技术博客，Hugo 静态站点 + PaperMod 主题（vendored），部署在 GitHub Pages：<https://skyrim86.github.io/my-blog/>

内容分三类：**文章**（零散记录）、**课程**（按章组织的笔记 / 作业 / 实验）、**项目**（做过的东西，附技术栈与源码）。数学公式在构建期用 KaTeX 渲染成 HTML，浏览器不加载公式 JS。

## 写文章：直接双击

仓库根目录的 **`启动管理页.bat`** 双击即可（不用开终端）：它会打开一个中文管理页，并顺手带起本地预览。

管理页有四块：**新建**（九种内容类型，两级选择：文章 / 课程 / 项目）、**编辑**（文件树 + front matter 表单 + Markdown 工具条 + 删除）、**发布**（改动清单 + diff + 提交说明 + 流式日志）、以及右侧的**同屏预览**。

它只是命令行脚本的图形外壳：新建转交 `scripts/new-content.sh`，发布转交 `scripts/push-blog.sh`，所以规则只有一份，不会分叉。

## 常用命令

```bash
bash tools/admin/start.sh            # 本地管理页（推荐日常用），等价于双击 .bat
bash scripts/preview.sh              # 纯本地预览（含草稿）http://localhost:1313/my-blog/
hugo --minify --gc --cleanDestinationDir   # 生产构建，输出到 public/
bash scripts/push-blog.sh "feat: 说明"     # 校验 → 构建 → 提交 → 推送（固定入口）
```

推送前会自动跑一串校验（front matter、标签词表、公式与 CSS 版本配对、站内链接、页面体积预算）。**内容正确性问题一律阻断**——构建能过但页面其实是坏的，会被本地拦下，不会等到 CI 才红。校验与构建的唯一定义在 `.github/actions/validate/action.yml`，`deploy.yml` 与 `checks.yml` 共用。

## 建内容：走脚手架，不要手写 front matter

```bash
bash scripts/new-content.sh post     <slug> --title "标题" --tags A,B
bash scripts/new-content.sh course   <课程> --tags A,B [--unit 章]
bash scripts/new-content.sh chapter  <课程> <章节标题> [--materials notes,homework,lab|none]
bash scripts/new-content.sh notes|homework|lab <课程> <章节> [--dir 目录名]
bash scripts/new-content.sh project  <项目> --tags A,B --repo URL
bash scripts/new-content.sh remove   <content 路径> [--with-bundle] [--dry-run]
```

front matter 的唯一事实源是 `archetypes/`，标签的唯一事实源是 `data/taxonomy.yaml`。手抄这两样必然漂移，所以脚本代劳；删除也走脚本，不要在会话里手敲 `rm`。

在对话里可以用 `/new-post`、`/new-course`、`/new-project`、`/admin`、`/preview`、`/push-blog`。

## 文档在哪

| 文档 | 内容 |
|---|---|
| [`AGENTS.md`](AGENTS.md) | 给 AI 助手的规则与指针（改代码前必读的部分） |
| [`docs/architecture.md`](docs/architecture.md) | 目录结构、`hugo.toml` 配置要点、构建与部署链、CI |
| [`docs/content.md`](docs/content.md) | 三种内容形态、front matter 规则、`cascade` 与标签词表 |
| [`docs/features.md`](docs/features.md) | 每一项自定义功能实现在哪个文件、机制是什么 |
| [`docs/formulas.md`](docs/formulas.md) | KaTeX 构建期渲染、passthrough、版本配对与排错 |
| [`docs/admin.md`](docs/admin.md) | 本地管理页：架构、字段表、安全边界、已知限制 |
| [`docs/traps.md`](docs/traps.md) | 踩过的坑：症状 → 原因 → 改法 |

## 技术栈

Hugo **0.165.0** extended（版本钉在 `.github/actions/validate/action.yml`，升级走 `bash scripts/upgrade-hugo.sh <版本>`，它会同步替换配对的 KaTeX 样式）、PaperMod 主题（直接提交在 `themes/PaperMod/`，无 submodule）、零前端依赖（没有 `package.json`，管理页只用 Node 内置模块）。

升级 Hugo 时必须同时换 `static/katex/katex.min.css` 与 `fonts/`，否则公式排版会错乱——原因见 [`docs/formulas.md`](docs/formulas.md)。
