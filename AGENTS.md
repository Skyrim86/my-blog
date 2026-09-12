# Skyrim 的博客 — 项目架构文档（供 AI 助手阅读）

> 本文档面向 AI 编码助手：当你被要求为本博客添加新功能时，先读完本文，按文中"约定"一节动手，不要重新发明已有机制。
> 最后更新：2026-09-12

## 1. 项目概览

- **类型**：Hugo 静态博客（中文，zh-CN）
- **主题**：PaperMod，**vendored**（直接提交在 `themes/PaperMod/`，无 submodule；主题目录里有个 `go.mod` 但**不通过 Hugo Modules 加载**，主题由 `theme = 'PaperMod'` 路径引用），要求 Hugo ≥ 0.146 的新模板结构（`layouts/_partials/`，无 `_default/`）
- **Hugo 版本**：本地与 CI 均为 **0.165.0**（extended），版本已在 `deploy.yml` 中固定，不要随意升级
- **部署**：GitHub Pages，URL 为 `https://skyrim86.github.io/my-blog/`（注意 **baseURL 带子路径 `/my-blog/`**，所有绝对链接和资源引用都会带此前缀）
- **仓库**：`skyrim86/my-blog`，主分支 `main`

## 2. 目录结构

```
my-blog/
├── 启动管理页.bat              # 双击入口：打开本地管理页（见 4.2⑬；必须纯 ASCII + CRLF）
├── hugo.toml                  # 唯一配置文件（无 config/ 目录分段）
├── archetypes/                # front matter 的唯一事实源（scripts/new-content.sh 也调用它们）
│   ├── default.md             # 文章骨架（posts/ 下没有 posts.md，故回退到此文件）
│   ├── courses.md             # 课程主页骨架（layout: course，内含 cascade 标签下发）
│   ├── chapter.md             # 章节入口页骨架（layout: chapter，默认 math: false）
│   ├── notes.md               # 学习笔记骨架（📖；刻意不写 tags，原因见 4.2⑨）
│   ├── homework.md            # 作业骨架（📝；同上）
│   ├── lab.md                 # 实验骨架（🧪；同上，键与 notes.md 完全一致，见 4.2⑤）
│   ├── projects.md            # 平铺项目骨架（leaf bundle）
│   ├── project-home.md        # 分层项目主页骨架（section + cascade 标签下发）
│   ├── project-section.md     # 分层项目子项目骨架（section，刻意不写 tags）
│   └── project-doc.md         # 分层项目文档骨架（regular page，math 默认 true）
├── assets/
│   ├── css/extended/          # 自定义 CSS（主题自动 Concat + minify，按文件名排序）
│   │   ├── 01-cards.css       #   文章列表卡片
│   │   ├── 02-typography.css  #   中文排版
│   │   ├── 03-widgets.css     #   系列导航
│   │   ├── 04-course.css      #   课程章节目录 + 章节入口 + 附件下载
│   │   ├── 05-project.css     #   项目元信息（技术栈标签 + 仓库链接）
│   │   ├── 06-terms-filter.css #  词条筛选框（隐藏规则 + 间距 + 空提示）
│   │   └── 07-related.css     #   相关内容区块
│   ├── images/avatar.jpg      # 首页头像（必须放 assets/ 才会被 Resize 成 120×120）
│   └── js/                    # 自定义 JS 源码（经 extend_head.html minify+fingerprint 后外链）
│       ├── giscus-theme-sync.js # Giscus 主题跟随（仅在有评论区的页面加载）
│       └── terms-filter.js    # 标签/分类/系列总览页的词条筛选框
├── i18n/zh.toml               # 站点级 UI 文案（与主题 i18n 合并，同名覆盖）
├── layouts/
│   ├── index.json             # 覆盖主题模板：搜索索引（正文截断 + tags 字段，见 4.2⑪）
│   ├── _markup/
│   │   └── render-passthrough.html # 公式渲染钩子：构建期用 KaTeX 渲染成 HTML（见 4.2⑥）
│   ├── courses/               # 课程专用模板（由 front matter layout 显式命中，不影响其他 section）
│   │   ├── course.html        #   课程主页：自绘章节目录
│   │   └── chapter.html       #   章节入口页：列出本章材料页（笔记 / 作业 / 实验）
│   └── _partials/             # 全部自定义模板（注意是 _partials 带下划线）
│       ├── extend_head.html   # 覆盖主题 hook：JS 资产接线 + 公式样式按需加载
│       ├── extend_post_content.html # 覆盖主题 hook：系列导航 + 课程附件 + 项目元信息 + 相关内容
│       ├── series-posts.html  # 系列文章导航组件（文案走 i18n）
│       ├── related-content.html # 相关内容区块：按共享标签/系列串联 文章↔课程↔项目（见 4.2⑩）
│       ├── course-index.html  # 课程主页的章节目录组件
│       ├── course-header.html # 课程主页 / 章节入口页共用的页头（面包屑 + 标题 + 描述）
│       ├── course-downloads.html # 课程材料页（笔记/作业/实验）附件下载组件
│       ├── project-meta.html  # 项目详情页的技术栈 + 仓库链接面板
│       └── comments.html      # Giscus 评论组件（覆盖主题同名 partial）
├── content/
│   ├── about.md               # 关于页（url: /about/）
│   ├── archives.md            # 归档页（layout: archives）
│   ├── search.md              # 搜索页（layout: search, url: /search/）
│   ├── tags/_index.md         # 标签总览页标题（中文「标签」，走主题 taxonomy.html）
│   ├── categories/_index.md   # 分类总览页标题（中文「分类」）
│   ├── series/_index.md       # 系列总览页标题（中文「系列」）
│   ├── courses/_index.md      # 课程 section 列表页（url: /courses/）
│   ├── courses/<课程>/        # 一门课程：_index.md 主页 + <chapter-0N>/（notes/、homework/、lab/，见第 5 节）
│   ├── projects/_index.md     # 项目 section 列表页（url: /projects/）
│   ├── projects/<项目>/index.md # 一个项目（平铺单页，与课程的多层结构不同）
│   ├── projects/CMC2026/      # 例外：带子项目的项目（_index.md 项目主页 + 分析思路/ 子项目 + 其下思路文档）
│   └── posts/<slug>/index.md  # 文章用 Page Bundle（cover 图放同目录）
├── data/
│   └── taxonomy.yaml          # 标签 / 分类词表（唯一事实源，见 4.2⑨）
├── static/
│   ├── images/site-cover.jpg  # 默认 OG 分享图（params.images 引用；头像不在这里，见 assets/images/）
│   ├── favicon.ico            # 站点图标全套（favicon-16/32、apple-touch-icon）
│   ├── katex/                 # 自托管 KaTeX 样式：katex.min.css + fonts/*.woff2
│   │                          #   （版本必须与 Hugo 内嵌的 KaTeX 配对，见 4.2⑥；已无任何客户端 JS）
│   ├── BingSiteAuth.xml       # Bing 站长验证
│   └── googledfe2280ece06bc5c.html  # Google Search Console 验证
├── .github/workflows/deploy.yml  # GitHub Actions 部署
├── scripts/
│   ├── new-content.sh         # 新内容脚手架：文章/课程/章/材料页(笔记·作业·实验)/项目/文档 + remove（见 4.2⑫）
│   ├── check-tags.sh          # 标签词表校验（只警告）
│   ├── check-frontmatter.sh   # front matter 校验（**阻断**：无 FM / 缺 title,date,draft / section 与材料页写 tags）
│   ├── check-katex-pairing.sh # KaTeX 样式与 Hugo 内嵌版本是否配对（**阻断**，见 4.2⑥）
│   ├── check-links.mjs        # 站内链接与锚点检查（**阻断**；零依赖 Node，见第 6 节）
│   ├── check-editor-schema.mjs# archetypes 与管理页字段表的漂移检查（只警告，见 4.2⑬）
│   ├── report-size.sh         # 页面体积报告 + 预算（**阻断**；--fresh 消除 public 陈旧产物影响）
│   ├── upgrade-hugo.sh        # Hugo + KaTeX 一键同步升级（见第 6 节）
│   ├── pin-actions.mjs        # 把 Actions 的 uses 从可变标签改成 commit SHA 固定
│   ├── preview.sh             # 本地预览（hugo server -D）
│   ├── push-blog.sh           # 一键构建 + 校验 + 提交 + 推送（见第 6 节）
│   ├── admin.sh               # 本地管理页启动器（见 4.2⑬）
│   └── admin/                 # 本地管理页：零依赖 Node 服务 + 原生前端（不参与 Hugo 构建）
│       ├── server.mjs         #   HTTP 服务：静态页 + JSON API（新建/删除/编辑/词表/git/发布）
│       ├── lib/               #   业务模块：content / frontmatter / taxonomy / git / hugo / exec
│       └── ui/                #   index.html + app.js + style.css
├── .lychee.toml               # 外链检查配置（周检、非阻断；站内链接由 check-links.mjs 负责）
├── .agents/commands/          # 斜杠命令（放 .agents/ 才入库，.zcode/ 被 gitignore）
│   ├── push-blog.md           #   /push-blog
│   ├── new-post.md            #   /new-post
│   ├── new-course.md          #   /new-course
│   ├── new-project.md         #   /new-project
│   ├── admin.md               #   /admin
│   └── preview.md             #   /preview
├── .github/
│   ├── actions/validate/action.yml # 校验+构建的**唯一定义**（checks.yml 与 deploy.yml 共用）
│   ├── workflows/deploy.yml   # push main：校验 → 构建 → 部署 Pages（校验不过就不部署）
│   ├── workflows/checks.yml   # PR / 非 main 分支：只校验，不部署
│   ├── workflows/links.yml    # 每周外链检查（lychee，非阻断，查线上站点）
│   └── dependabot.yml         # 给已固定 SHA 的 Actions 留更新通道
└── themes/PaperMod/           # vendored 主题（**已剪裁**，见第 2 节末；不要直接修改）
```

`public/`（构建产物）、`resources/`（Hugo 缓存）、`.hugo_build.lock` 均不入库。`data/taxonomy.yaml` 是标签词表，**要入库**。

favicon 是生成的一次性静态文件（深色圆角方块 + 白色 S，与 `theme-color` 同色）；换真实 logo 时直接覆盖 `static/` 下 `favicon.ico`、`favicon-16x16.png`、`favicon-32x32.png`、`apple-touch-icon.png`、`safari-pinned-tab.svg` 这 5 个文件即可，无需改代码。

### 2.1 主题剪裁记录（2026-09-12）

`themes/PaperMod/` 从 125 个入库文件 / 756 KB 剪到 **72 个 / 478 KB**，删的都是与本站构建无关的东西：`images/`（screenshot.png + tn.png，157 KB，只供上游主题画廊用 —— `theme.toml` 里没有 `screenshot` 键，已核对）、`.github/`（上游 issue/PR 模板与上游 workflow，25 KB）、`i18n/` 里 **43 个用不到的语言包**（保留 `en.yaml`/`zh.yaml`/`zh-tw.yaml`；站点单语言 `zh`，locale `zh-CN` 的查找链 `zh-CN → zh → en` 全覆盖，留 en 是兜底防键名直出）、`README.md`、以及 **`go.mod`**（主题并不通过 Hugo Modules 加载，那个文件会诱导后人去 `hugo mod` 它）。保留 `LICENSE`（MIT 署名）与 `theme.toml`。

**`themes/PaperMod/layouts/` 与 `assets/` 刻意没有剪**，这不是偷懒而是结论：**Hugo 会静默容忍缺失的 partial** —— 主题 `_partials/head.html` 无条件调用的 `google_analytics.html` 在站点与主题里**都不存在**，而 og:/JSON-LD 照常渲染、构建一直是绿的。既然构建成功无法证明删模板文件安全，而 `layouts/` 里那些死文件（`share_icons.html`、`home_info.html`、`llms.txt`、8 个 shortcode、被站点覆盖的 `index.json`）总共不到 40 KB，就不值得为它承担"某条只走一次的渲染路径被删掉、且没人发现"的风险。**要再剪主题，只能按引用分析逐个确认，不能靠"构建还过"来验证。**

同步主题时的注意：升级上游后这些被删的文件会重新出现，需要按本节的清单再剪一次。

## 3. hugo.toml 配置要点

| 配置段 | 说明 |
|---|---|
| 全局 | **`timeZone = 'Asia/Shanghai'` 必须保留**（否则当天发布的文章当天不会上线，见 4.2⑬与第 7 节）；`baseURL` 带 `/my-blog/` 子路径；`hasCJKLanguage = true`（中日韩分词，影响摘要与字数统计）；`enableEmoji`、`enableRobotsTXT`、`enableGitInfo`（文章显示 Git 最后修改时间）均开启 |
| `[frontmatter]` | `lastmod` 优先取 Git 提交时间 |
| `[taxonomies]` | 三套分类法：`tags`、`categories`、**`series`（自定义，支撑系列导航功能）** |
| `[outputs]` | 首页输出 `HTML + RSS + JSON`，**JSON 索引供 Fuse.js 搜索使用**，勿删（索引内容与字段由 `layouts/index.json` 决定，见 4.2⑪） |
| `[permalinks]` | 文章 URL 格式 `/:year/:month/:slug/`（如 `/2026/09/我的第一篇文章/`）；改动会破坏已发布链接 |
| `[params]` | `env='production'`、`mainSections=['posts']`（首页列表/归档/上下篇只统计文章，课程与项目都不混入）、开启阅读时间/TOC(默认展开)/面包屑/上下篇/代码复制/RSS 按钮；`images=['images/site-cover.jpg']` 为默认 OG 图；`DateFormat='2006年1月2日'`。**与主题默认等价的三个开关（`defaultTheme`/`ShowShareButtons`/`disableThemeToggle`）已刻意删掉**，不要再加回来 |
| `[params.cover]` | `responsiveImages`、`linkFullImages`（点击封面看原图）开启 |
| `[params.giscus]` | 评论系统全部参数；`mapping='title'` 按文章标题关联 Discussion（非 pathname）；`theme='light'` 是初始值，实际由同步脚本动态切换 |
| `[params.profileMode]` | **首页是 Profile Mode**（个人名片：头像 + 标题 + 副标题，无按钮，需加按钮时用 `[[params.profileMode.buttons]]`） |
| `[params.fuseOpts]` | Fuse.js 搜索权重：`['title','permalink','summary','tags','content']`。**keys 里出现的字段必须由 `layouts/index.json` 实际输出**，改一处要同步另一处 |
| `[[menu.main]]` | 8 个导航项，weight 以十进位留出插入空间：首页(10)/课程(20)/**项目(30)**/文章(40)/归档(50)/标签(60)/搜索(70)/关于(80) |
| `[markup.highlight]` | monokai 主题，行号开启 |
| `[imaging]` | 图片质量 75、lanczos |
| `[security.exec]` | 允许 git 等 exec（GitInfo 需要） |

## 4. 功能清单与实现位置

### 4.1 主题内置（PaperMod 提供，勿重复实现）
- 明暗切换（`auto/light/dark`，用户偏好存 `localStorage['pref-theme']`，机制是给 `<html>` 设 **`data-theme="light|dark"` 属性**，CSS 用 `:root[data-theme="dark"]` 匹配——**不是 `.dark` class**；auto 模式在页面加载时就已解析成 light/dark）
- 响应式明暗切换的 CSS 变量：`--theme`、`--content`、`--border`、`--secondary`、`--primary`、`--code-bg` 等，自定义样式请复用这些变量
- TOC、面包屑、上下篇导航、代码复制按钮、阅读时间
- **返回顶部按钮**（`#top-link`，带 Alt+G 快捷键；如要关掉在 `hugo.toml` 设 `disableScrollToTop = true`）
- SEO：Open Graph/Twitter meta、`templates/schema_json.html`（JSON-LD）、hreflang
- `robots.txt` 与 `sitemap.xml` 生成（`hugo.IsProduction` 判断，生产环境不 Disallow）
- **数学公式**：主题本身不带 KaTeX/MathJax。本项目在**构建期**用 Hugo 内置的 `transform.ToMath` 把公式渲染成 HTML，并自托管与之配对的 KaTeX 样式（`static/katex/`）；浏览器端不加载任何公式 JS（见 4.2 ⑥）

### 4.2 自定义功能

**① Giscus 评论** — `layouts/_partials/comments.html`（覆盖主题同名 partial）
- 参数全部读自 `hugo.toml [params.giscus]`，由 `params.comments=true` 全局启用
- **主题同步机制**（`assets/js/giscus-theme-sync.js`）：Giscus iframe 的主题不会自动跟随站点。脚本用 `MutationObserver` 观察 `<html>` 的 `data-theme` 属性变化（与主题的切换机制一致），并在懒加载 iframe 出现时同步一次初始主题；每次同步向 `https://giscus.app` postMessage `setConfig`，600ms 后重发一次兜底
- 该脚本**只在真正渲染评论区的页面加载**。判据是三个条件同时成立（`extend_head.html`）：
  1. `.Param "comments"` —— 与主题 `single.html` 的判据一致（课程材料页由 cascade 关掉）；
  2. `.Kind == "page"` —— 少了这条会回落到全站 `params.comments = true`，把首页/列表页/词条页一起命中；
  3. 排除 `archives` / `search` 两个 layout —— 它们是 regular page 但各有独立模板，不走 `single.html`（`layouts/index.json` 里也是这么排的）。
  实测（干净构建、65 页）：**修之前 37 个页面加载它、真正有评论区的只有 10 个**；收窄后两者都是 10，零浪费

**② 系列文章导航** — `layouts/_partials/series-posts.html` + `extend_post_content.html`
- 文章 front matter 写 `series: ['系列名']` 即生效
- 渲染为可折叠 `<details open>` 列表：同系列全部文章按日期排序，当前篇加 `class="current"` 加粗高亮
- 标题文案来自 `i18n/zh.toml` 的 `seriesTitle` key
- 通过 `extend_post_content.html` hook 注入（文章正文后、footer 前）；样式在 `03-widgets.css`

**③ 中文排版优化** — `02-typography.css`：PingFang/雅黑字体栈、行高 1.85、两端对齐、标题行高收紧、中文不斜体等

**④ 列表卡片化** — `01-cards.css`：文章列表项圆角+阴影+悬浮上浮，暗色适配用 `[data-theme="dark"]`

**⑤ 课程结构（课程 → 周/章 → 材料页：笔记 / 作业 / 实验）** — `layouts/courses/course.html`、`chapter.html` + `course-index.html`、`course-downloads.html`
- **课程主页**（`content/courses/<课程>/_index.md`，`layout: "course"`）由 `course.html` 渲染：面包屑 + 标题 + `unit` 说明（「本课程按章组织」）+ **自动章节目录**（`course-index.html` 按 `weight` 排序，显示「第 N 章」与各章可进入内容的徽标）+ 大纲正文
- **章节入口页**（`<chapter-0N>/_index.md`，`layout: "chapter"`）由 `chapter.html` 渲染：把本章子页面列成入口卡片（📖 学习笔记 / 📝 作业 / 🧪 实验，图标取子页面 front matter 的 `icon`）并显示附件数量。**笔记、作业、实验不堆在同一页**，必须从这里分开进入
- **材料页**（`<chapter-0N>/<材料>/index.md`）走主题 `single.html`：正文即内容（可写 KaTeX 公式），`extend_post_content.html` 注入 `course-downloads.html` 列出该页的附件
- **模板不认目录名，只认「章下面的 regular page」**：`chapter.html` 是 `.RegularPages.ByWeight`，卡片上的名字取 `title`、图标取 `icon`、顺序取 `weight`。所以材料类型可以自由扩展（`lab`、用 `--dir lab-02` 建出的第二个实验…），**加材料页不需要改任何模板/CSS/i18n**。三种规范材料的骨架是 `archetypes/notes.md`(1,📖) / `homework.md`(2,📝) / `lab.md`(3,🧪)，三者的键必须保持一致（`check-editor-schema.mjs` 用一份字段表覆盖它们，见 4.2⑬）
- **章 = 入口页 + 若干材料页的组合**由 `scripts/new-content.sh chapter --materials notes,homework,lab` 一次建好（默认 `notes,homework`；`none` 只建入口页）；漏掉的材料之后用 `new-content.sh notes|homework|lab <课程> <章节>` 单独补（见 4.2⑫）
- 附件 = 与 `index.md` 同目录的任意非图片资源（PDF/zip…），Hugo 随页面发布，`.RelPermalink` 即下载地址，**无需文件名前缀**
- 文案走 `i18n/zh.toml` 的 `course*` keys；样式在 `04-course.css`

**⑥ 数学公式（KaTeX，构建期渲染）** — `layouts/_markup/render-passthrough.html` + `static/katex/`
- **公式在构建期渲染**：`layouts/_markup/render-passthrough.html` 调用 Hugo 内置的 `transform.ToMath`（KaTeX 以 WASM 内嵌在 Hugo 二进制里），把 `$...$` / `$$...$$` / `\(...\)` / `\[...\]` 渲染成 KaTeX 的 HTML 标记直接写进页面。**浏览器端不再加载任何 KaTeX JS**：原来的 `katex.min.js`（272KB）、`auto-render.min.js`、`katex-render.js` 已全部删除
- **收益与代价**（在公式最密的「问题一」页实测）：改前要下载 HTML 44KB + KaTeX JS 78KB(gzip) + CSS 3.5KB ≈ **123KB**，且浏览器要渲染 511 个公式；改后只需 HTML 75KB + CSS 3.5KB ≈ **77KB**，运行时渲染开销归零。**HTML 会明显变大**，因为标记从「浏览器运行时生成」变成了「写进文档」（gzip 后仍更小，因为标记高度重复）
- **`math` 字段的含义变了**：它现在只决定「这一页要不要加载 `katex.min.css`」，与是否渲染无关（渲染是无条件的）。加载条件三项取或：`site.Params.math` / `.Params.math` / **页面里确实出现了公式**（兜底检测，匹配 `class="katex"`）。所以忘写 `math: true` 也不会再出现无样式公式
- **CSS 与 fonts 的版本必须与 Hugo 内嵌的 KaTeX 配对**（最容易踩的坑，Hugo 官方 issue #15254 就是它）：
  - Hugo **≤ 0.165** 内嵌 KaTeX **0.16.22**，内部 class **无前缀**（`base`、`strut`、`sizing`）→ 必须配 **katex@0.16.x** 的 CSS
  - Hugo **≥ 0.166** 内嵌 KaTeX **0.18.4+**，改成**带前缀**（`katex-base`、`katex-strut`、`katex-sizing`）→ 必须配 **katex@0.18.4+** 的 CSS
  - 配错的表现是公式排版错乱（上下标错位、分数塌陷）。**升级 Hugo 时必须同步替换 `katex.min.css` 与 `fonts/`**，这是升级 Hugo 的强制动作
  - 站内当前是 `katex@0.16.x` 的 `katex.min.css` + `fonts/*.woff2`（20 个），与 Hugo 0.165 精确配对
  - **判据只认类名是否带前缀，`katex-base` 是唯一可靠的判别符**（`katex-display`/`katex-html` 两套都有）。自查：
    `grep -c 'katex-base' static/katex/katex.min.css` → **0 = 0.16.x（无前缀）**，非 0 = 0.18.4+
  - 这条判据已用 npm 上的包实测过：`katex@0.16.47` 是 `.base{}`/`.strut{}`、无 `katex-base`；`katex@0.18.7` 反之；两者都带 20 个 woff2 字体
  - **升级不要再手动换文件**：跑 `bash scripts/upgrade-hugo.sh <版本>`（见第 6 节），它按上面的配对表选 KaTeX 版本、改版本钉、换 CSS/fonts，并在写坏时自动回滚
  - **每次构建都有 CI 兜底**：`scripts/check-katex-pairing.sh` 拿真实 Hugo 构建产物比对类名方案（取样"公式最多"的那一页），配错直接判失败 —— 因为只有拿真 Hugo 构建完才知道它内嵌的是哪一套
- **公式源文必须先被 markdown「放过」**：`hugo.toml` 已开启 `[markup.goldmark.extensions.passthrough]`（`block` = `$$`/`\[ \]`，`inline` = `$`/`\( \)`，**单 `$` 必须显式写，passthrough 默认不含它**），goldmark 在解析阶段整体跳过公式，源文原样交给上面那个渲染钩子。这是必需的：否则 `R^*` 的 `*` 会被当作强调符与同行的 `**` 配对、注入 `<em>` 把文本节点切开；`\{`、`\}`、`\%`、`\!`、`\,` 这类由标点构成的 LaTeX 命令也会被 CommonMark 的转义规则吃掉反斜杠。**改定界符时 `hugo.toml` 与 `render-passthrough.html`（以及 `output` 之外的选项）要一起看**
- 渲染钩子里 `throwOnError = true`（Hugo 默认）：公式有语法错误会**让构建失败并报出位置**，比静默渲染成一团红字更好。想让个别错误不阻断构建，把它改成 `false` 并配 `errorColor`
- `output` 必须是 `htmlAndMathml`（与改造前的浏览器端 KaTeX 一致：HTML 排版 + 隐藏的 MathML 供无障碍）。改成纯 `mathml` 会变成浏览器原生渲染，外观不同，同时也就不再需要 `katex.min.css`
- `katex.min.css` 用**相对路径** `fonts/...` 引用字体，因此它必须与 `fonts/` 同级；只装了 `woff2`（现代浏览器均支持，CSS 中排第一位，`woff`/`ttf` 回退不会被请求）
- 课程材料页由课程主页 `_index.md` 的 `cascade: {math: true}` 统一继承；课程主页显式 `math: false`。章节入口页默认 `math: false`，**但导语里确实写了公式就必须改成 `math: true`**（`chapter-02` 曾写 `false` 而正文有公式，那条公式长期在页面上原样显示成源码；现在有兜底检测托着，但 front matter 仍应写对）

**⑦ 项目展示（列表 → 详情，默认平铺）** — `content/projects/` + `layouts/_partials/project-meta.html` + `05-project.css`
- **与课程的关键差异**：项目是**平铺单页**（没有「章」这一层，也**没有**笔记/作业拆分，**没有**附件下载区）；每个项目 = `content/projects/<项目>/index.md` 一个页面，正文即项目介绍
- **列表页** `/projects/` 由 `content/projects/_index.md` 提供，走主题 `list.html`，因此**没有**任何自定义模板（课程主页/章节页则各有一个自定义模板）
- **详情页**走主题 `single.html`，由 `extend_post_content.html` 在 `Type == "projects"` **且 `.BundleType == "leaf"`** 时注入 `project-meta.html`（正文之后、footer 之前），渲染「技术栈标签 + 查看源码按钮」。加 `.BundleType == "leaf"` 这个限定是必需的：分层项目下的文档页 `.Type` 同样是 `projects`，而它们现在靠 cascade 拿到了标签，不限定就会在每篇文档页上错误地渲染出「技术栈」面板（把主题标签当技术栈显示）
- 元信息由 front matter 的 `tags`（技术栈，用标准 tags 分类法）与 `repo`（仓库地址）驱动，**两者都为空时面板完全不输出**；技术栈标签渲染为指向 `/tags/<词条>/` 的链接，因此项目与标签体系双向联动（项目页 → 词条页，词条页也会列出该项目）
- 文案走 `i18n/zh.toml` 的 `project*` keys；样式在 `05-project.css`（只复用主题变量，变量本身随 `.dark` 切换，故无需额外暗色规则）
- **例外：带子项目的项目**（目前只有 `CMC2026`）。leaf bundle **不能**包含子页面，所以「项目 → 子项目 → 文档」只能用 **branch bundle / section** 实现：`content/projects/CMC2026/_index.md`（项目主页）+ `CMC2026/分析思路/_index.md`（子项目）+ 其下若干普通 `.md` 文档。三级都走主题 `list.html`——它取 `union .RegularPages .Sections` 渲染卡片，因此嵌套 section 也会被列出来，**依然没有自定义模板**。三点代价：① section 页不走 `single.html`，所以项目页与子项目页**不会**出现「技术栈 + 查看源码」面板（其下的文档页也不该有，见上一条的 `.BundleType` 限定）；② 项目主页的 `cascade` 目前只下发 `tags`/`categories`、**不含 `math`**，所以文档页要渲染公式仍须逐页写 `math: true`；③ 标签只写在项目主页的 `cascade` 里——给 section 页自己写 `tags`/`categories` 是**无效的**（词条页只列 regular page，实测计数会 +1 而列表为空），子项目与其下文档都不要写

**⑧ 词条筛选框（标签 / 分类 / 系列总览页）** — `assets/js/terms-filter.js` + `06-terms-filter.css`
- 在 `/tags/`、`/categories/`、`/series/` 的词条列表上方注入一个输入框，输入即过滤下方词条（纯前端 DOM 过滤，不依赖搜索索引、不引入第三方库）
- 由 `extend_head.html` 按 `{{ if eq .Kind "taxonomy" }}` 加载，正好命中这三个总览页；其他页面不加载
- **没有自定义模板**：主题 `taxonomy.html` 无 hook，复制它会漂移，所以沿用「脚本动态创建 DOM」的做法（输入框 + 空提示都由 JS 插入）
- UI 文案经 `<script>` 的 `data-placeholder` / `data-empty` 属性从 i18n 传入（JS 无法调用 Hugo 的 `i18n`），`data-placeholder` 带上页面标题，因此各页显示「在标签中筛选…」「在分类中筛选…」
- 两个易踩的坑：① 隐藏词条**必须用 class**（`terms-filter-hidden`），因为主题的 `.terms-tags li { display:inline-block }` 会压过 `[hidden] { display:none }`；② 不要用 `requestAnimationFrame` 做节流，它在后台/隐藏标签页里不触发会导致筛选静默失效（已改为同步过滤）
- 输入框样式直接复用主题的 `.searchbox input`（`search.css` 已打进全局样式表），`06-terms-filter.css` 只补间距、隐藏规则与空提示样式

**⑨ 标签词表与层级继承** — `data/taxonomy.yaml` + `cascade` + `scripts/new-content.sh` / `check-tags.sh`
- **词表是标签拼写的唯一事实源**。格式约定（脚本按此 grep 解析，别改成嵌套 YAML）：顶层键 `tags:` / `categories:`，词条每行写成「两个空格 + `-` + 空格 + 词条」，分组只用 `#` 注释
- 新建内容时**从词表里选**而不是手打：`new-content.sh` 交互式列出编号让你挑，斜杠命令则让 AI 用 AskUserQuestion 勾选。词表里没有的词必须显式加 `--new-tag`，脚本会自动追加进词表（词表因此不会腐化）
- `scripts/check-tags.sh` 扫 `content/` 下所有 front matter 的 tags 与词表比对，报告未登记的词、大小写不一致、以及无法解析的块列表写法；`push-blog.sh` 会调用它，**只警告不阻断**
- **层级继承**：课程主页与分层项目主页用 `cascade` 把 `tags`/`categories` 下发给后代，只需写一次。写法必须带 `target: {kind: page}`：
  ```yaml
  cascade:
    - target:
        kind: page
      tags: ["数值分析", "数学"]
      categories: ["课程"]
  ```
- 三条硬规矩，改标签相关代码前务必看：
  1. **标签只打在 regular page 上**。section 页（课程主页、章节入口页、分层项目页与子项目页）即使带上标签，也只会让 `/tags/` 的计数虚高、词条页里却不出现——主题 `list.html:41` 取 `union .RegularPages .Sections`，而词条页（term）没有子 section，`.RegularPages` 又不含 branch bundle。实测：课程主页带标签时 `/tags/数值分析/` 计数 1、列表 0 条。`target.kind: page` 正是用来把 section 自己排除掉的
  2. **`cascade` 只填空、不合并**：子孙页一旦自己写了 `tags`，继承来的标签会被**整体丢弃**（不是取并集）。所以 `archetypes/notes.md`、`homework.md`、`project-section.md` 刻意不含 `tags` 键——空数组也算「已定义」，同样会阻断继承
  3. 用新名字 **`target`**，不要写 `_target`（0.156 起弃用，虽能用但会打弃用警告）

**⑩ 相关内容区块（文章 ↔ 课程 ↔ 项目）** — `layouts/_partials/related-content.html` + `extend_post_content.html` + `07-related.css` + i18n 的 `related*`
- 打分 = 共享 `tags` 数 × 10 + 共享 `series` 数 × 6，取前 5 条，每条带类型徽标（文章 / 课程 / 项目，由 `.Type` 映射 i18n key）
- **为什么不用 Hugo 内置的 `.Related`**：`.Related` 只在 regular page 之间比较，而课程主页与分层项目主页是 section，用它会永远关联不到。这里改为遍历 `site.Pages`
- 候选过滤：排除自身、`searchHidden`、`home`/`taxonomy`/`term`、`archives`/`search` 布局
- section 候选（课程主页/项目主页）自己没有标签，用**子孙 regular page 的标签聚合**出「有效标签」。判据是「祖先里只有一个 section」：这既排除了 `/courses/`、`/projects/` 这类列表页（祖先里没有 section），也排除了「分析思路」「A 题」这类更深的纯导航 section（祖先里有两个以上 section）——否则它们会和真正的文档同分，把列表挤满
- 只在 regular page 上显示（本 partial 由 `extend_post_content.html` 注入，走 `single.html`）。section 页走主题 `list.html`，没有 hook，所以课程主页/项目主页只是「能被别人关联到」，自身不显示这个区块

**⑪ 搜索索引（覆盖主题模板）** — `layouts/index.json` + `hugo.toml` 的 `fuseOpts.keys`
- 覆盖动机：主题原版把每页 `.Plain` 全文塞进索引，本站实测 151 KB（CMC2026 的长文档是主因）；把 `content` 截断到 400 字后降到约 17 KB
- 同时新增 `tags` 字段，让标签也能被搜到（`fuseOpts.keys` 已同步加 `'tags'`）
- **`summary` 必须 `plainify` 后再截断到 150 字**，这是配合构建期公式渲染的必需处理：没写显式 `summary` 的页面（课程材料页就是），Hugo 会从 `.Content` 自动截取，而公式现在是成百上千个 KaTeX 标记，自动摘要会变成 5000+ 字符的 HTML（含完整 MathML），把索引从 17 KB 撑到 49 KB、检索片段里也会混进标记。净化后索引 14 KB。**给公式多的页面写显式 `summary` 仍是更好的做法**（自动摘要 plainify 后会出现「x∗x^*x∗」这类渲染文本与 LaTeX 并存的痕迹）
- **代价**：正文只能匹配每页前 400 字，长文档内部的词搜不到（标题 / 摘要 / 标签仍全量匹配）
- 这是继 `layouts/courses/*.html` 之后**第二处有意的主题模板覆盖**：该模板没有任何 hook 可挂，而截断逻辑无法从外部配置实现
- 改索引字段时**必须同步 `fuseOpts.keys`**，否则多输出的字段搜不到、keys 里多写的字段则无效

**⑫ 新内容脚手架** — `scripts/new-content.sh` + `.agents/commands/new-*.md`
- 一个入口覆盖文章 / 课程主页 / 章节（可含材料页）/ 三个材料子命令 / 平铺项目 / 分层项目 / 分层项目文档 / **删除**；**多文件结构是 `hugo new` 做不到的部分**（一章一次生成 `chapter-0N/_index.md` + 勾选的材料页，章号自动递增）
- 子命令与材料页：`notes` / `homework` / `lab` 分别建 `notes/`、`homework/`、`lab/` 三个 leaf bundle（`--dir` 可改目录名，用于同一章的第二个实验 `lab-02`；此时 weight 用 `next_material_weight()` 取同级最大值+1，规范目录名则沿用骨架里的固定 1/2/3）。`chapter --materials notes,homework,lab|none` 决定一并建哪些，**默认 `notes,homework`**（与改造前一致），`none` 只建入口页
  - `next_material_weight()` 与 `next_weight()` 是**两个函数**：后者数的是 `*/_index.md` 与 `*.md`（`sub`/`doc` 用），材料页是 `*/index.md`，用它会永远得 1 —— 这个错误实测出现过，`--dir lab-02` 因此拿到 weight 1 与笔记撞号
- `remove <content 路径> [--with-bundle] [--dry-run]` 是**删除的唯一实现**（管理页也调它，见 4.2⑬）：只接受 `content/` 内的 `.md`、拒绝 `..`、拒绝删 `content/` 本身；`--with-bundle` 时 `index.md` 删所在 leaf bundle 目录（含附件）、`_index.md` 删所在 branch 目录，但**直接位于 `content/` 下的 section 根一律拒绝**（否则一键就能清空 `content/courses`）。先打印将删除的文件清单（`  - <path>`）再动手，`--dry-run` 到此为止；`remove` 不要求 hugo 与词表存在
- 实现要点：**front matter 的唯一事实源是 `archetypes/`**，脚本只调 `hugo new content <path> --kind <kind>`，不另抄一份模板（避免两处漂移）；之后用 awk 在首个 `---` 区块内做定向行替换，注入 `tags`/`title`/`weight`/`repo` 等
- `--kind` 必须显式给：`notes/index.md` 的默认 kind 会取路径首段 `courses`，拿到的是错的骨架
- 建文件前先 `[ -f ]` 判存在（`hugo new content` 冲突时退出码也是 1，无法区分原因）；**标签与 `--materials` 校验都在任何建文件动作之前完成**，避免校验失败留下半成品文件
- 默认 `draft: true`（与 archetype 一致），`--publish` 才写 `false`

**⑬ 本地管理页（可交互的写作/发布界面）** — `scripts/admin.sh` + `scripts/admin/` + `启动管理页.bat`
- 入口有两个，等价：**双击仓库根目录的 `启动管理页.bat`**（不用开终端，桌面快捷方式也指向它），或命令行 `bash scripts/admin.sh`（对话里用 `/admin`）。双击后它会自动打开浏览器、并顺手带起 `hugo server` 预览
- 它在本机起一个零依赖的 Node 服务（只用 `node:` 内置模块，**没有 package.json、没有 node_modules**），浏览器打开一个中文单页，四块功能：**新建**（**九种内容类型**的表单 + 词表 chips 选标签）、**编辑**（内容文件树 + front matter 表单 + Markdown 工具条 + **删除**）、**发布**（git 改动清单 + diff + 提交说明 + 流式日志）、**同屏 iframe 预览**
- **`启动管理页.bat` 必须保持纯 ASCII + CRLF**，这是一条硬约束，不是风格偏好：批处理里一旦有中文，`chcp 65001` 之后 cmd.exe 会按错误的字节偏移重读文件、把半行当命令执行（实测症状是 `'会自动打开' is not recognized as an internal or external command`，同时服务仍能起来，很容易被忽略）。所以**面向用户的中文提示全部由 `scripts/admin.sh` 打印**（bash 写 UTF-8，配合启动器的 chcp 65001 显示正常），.bat 里只留英文注释与英文错误。`.gitattributes` 里 `*.bat text eol=crlf` 就是为此加的（只有 LF 的 .bat 会让 label/goto 之类按行定位的语法出问题）
- 启动器找 bash 的顺序刻意**先查 Git for Windows 的安装位置、再退回 PATH**：`C:\Windows\System32\bash.exe` 是 WSL 的 bash，用它跑这个脚本路径会全错。顺序为 `ADMIN_BASH` → `%ProgramFiles%\Git\bin\bash.exe` → `%ProgramFiles(x86)%\...` → `%LOCALAPPDATA%\Programs\Git\...` → 从 `where git` 反推 `..\bin\bash.exe`。找不到就打印 Git 下载地址并 `pause`，参数原样透传（`启动管理页.bat --port 1415` 可用）
- 它是现有脚本的界面外壳，不是替代品：新建一律调 `scripts/new-content.sh`（front matter 仍来自 `archetypes/`），**删除调 `new-content.sh remove`**，读词表调 `new-content.sh tags`，发布调 `scripts/push-blog.sh`。所以分支校验、构建校验、草稿与词表警告、commit/push/CI 那条链路一条都没有被复制
- **新建的九种类型**在 `app.js` 的 `KINDS` 里（唯一事实源）：文章 / 课程主页 / 章节 / **笔记 / 作业 / 实验** / 项目 / 子项目 / 项目文档。kind 的取值与 `new-content.sh` 的子命令名**一一对应**，所以日志里显示的命令就是真正跑的那条
  - 「章节」表单带一个 `type: 'checks'` 的**材料多选**（`--materials`，默认勾笔记+作业），勾哪些建哪些、全不勾传 `none` 只建入口页
  - 「笔记 / 作业 / 实验」三个独立按钮用来**给已有章节补材料**：它们的「所属章节」下拉是**唯一与其他字段有依赖的选项**，跟着「所属课程」联动（`fillChapterOptions()`，选项由服务端 `options.chapters` 下发，前端不推导路径）
  - `checks` 是字段渲染器里新增的一种类型：同名 checkbox 共用 `data-field`、靠 `data-cvalue` 区分，所以 `snapshotCreateFields`/`restoreCreateFields`/提交收集三处都必须把它们聚合成数组 —— 按 `data-field` 直接赋值会让同组的多选框互相覆盖
- **删除是「两步确认 + 预检」**：编辑器头部的「删除」按钮第一次点击先发 `POST /api/content/delete` 带 `dryRun: true`，`remove --dry-run` 把将删除的文件清单回报上来（渲染在 `#ed-delete-notice` 里，含文件数、未保存改动提醒、`git checkout --` 恢复命令），按钮转红变「确认删除」；第二次点击才真删。**判定规则不在 Node 里**：`buildRemoveArgs()` 只做「必须在 `content/` 内、不含 `..`」的最小护栏，其余（连不连目录删、section 根拒绝）全在 `cmd_remove`
  - 删除成功后要一起做四件事：清空编辑器占位、`loadItems(true)` + `renderTree()`、`renderCreateFields()`（课程/章节下拉跟着变）、并把预览改指到仍然存在的最邻近祖先 `_index.md`（`nearestSurvivingIndex()`）——否则 iframe 会停在已删掉的地址上
  - 重新渲染编辑器时必须 `resetDeleteArm()`：不解除武装的话，「确认删除」会落到下一个刚打开的页面上
- **架构红线做成了界面约束**：`content/courses/**/notes|homework|lab`、章节入口页、子项目页、各类 section/列表页的 tags 字段在界面上**隐藏并禁用**（理由同 4.2⑨：section 写 tags 只会让计数虚高；材料页写了会整体丢掉 cascade 下发的标签）；分层项目的文档页写 tags 会给出「会丢掉项目级标签」的提示。服务端也会忽略不属于该类型 schema 的字段——实测在材料页硬塞 tags 不会写进文件
- **新标签先入词表、再建内容**：界面上勾的新词会先经 `/api/taxonomy/add` 写进 `data/taxonomy.yaml`（写后立刻用 `new-content.sh tags` 复核，复核不过就回滚原文件），全部校验通过才建文件——沿用 new-content.sh「校验早于建文件」的原则。建内容前的预检走 `new-content.sh add-term --check`，**校验规则也只有 shell 那一份**
- **URL 与预览**：预览由内置的 `hugo server -D -F --disableFastRender` 提供，iframe 指向 `http://127.0.0.1:<预览端口>/my-blog/<页面路径>/`，保存后 livereload 自动刷新。**页面路径不再由 Node 自己算，而是问 Hugo**：`hugo list all` 输出每页的 `path,permalink`（`content.mjs` 的 `previewUrl` 读它，缓存 5s，保存/新建时失效）。所以 `permalinks` 规则、`pathToLower`（`CMC2026` → `cmc2026`）、front matter 的 `url`、中文的百分号编码都由 Hugo 说了算，配置改了不会与界面分叉；只有「Hugo 列不到这一页」（刚新建还没落盘、或 hugo 不可用）时才退回原来的启发式，并标 `source: 'heuristic'`
- **编辑器字段表与 archetypes 是策展关系，不是副本**：字段表是 archetype 的**子集 + 补充**（实测差异：只给 UI 的 `post.slug`、`material.math`、`project-doc.tags` 在 archetype 里没有；而有意不暴露的 `layout`、`date`、`cover.relative` 等又在 archetype 里有）。所以**没有**做「按 archetype 机械生成表单」——那会把 `layout`/`date` 顶进表单、丢掉 `slug`、并改掉每个类型的字段顺序，是行为回归。取而代之的是 `scripts/check-editor-schema.mjs`：archetype 里出现了既没被 UI 暴露、也不在它 `hidden` 列表里的键就报警，把**静默分叉**变成可见提醒
- **两个 hugo server 的坑，都在代码里处理掉了**：`--disableFastRender` 不能省（Fast Render 模式下新建的文件不会真正出现在站点里）；`-F` 不能省（否则看不到日期写在未来的排期稿）。另外 hugo server 不会把「保存后固定链接变了」的页面注册到新地址上（改 date/title/slug 触发），所以界面在这三种字段被改动且预览在跑时会自动重启预览
- 安全边界（因为这个服务能执行 shell）：默认只绑 `127.0.0.1`；校验 `Host` 白名单（防 DNS rebinding，外来域名解析到 127.0.0.1 也会被拒）；所有写操作要求自定义头 `X-Admin-Request: 1`（防其他网页对本地端口发跨站 POST）；所有 `path` 参数限制在 `content/` 内、拒绝 `..`；`--host 0.0.0.0` 只在显式传参时生效并打印风险提示
- **界面资源绝不能放进 `assets/js/` 或 `assets/css/extended/`**：那两个目录会被主题合并进公开站点资源，等于把管理界面发到线上。所以它们放在 `scripts/admin/ui/`，由 Node 服务直接提供
- 已知限制：只在本机可用（不做在线后台）；幂等性没做文件锁，不要同时开两个管理页改同一批文件
- **写入收敛（2026-09-12）**：`data/taxonomy.yaml` 的追加不再由 Node 自己拼 YAML —— `new-content.sh` 新增了 `add-term <tags|categories> <词条>` 子命令（`--check` 只校验），界面只是调它。原先 Node 侧那份 `insertTerm`/`validateTerm` 已删除，词表的读、写、校验现在都只有 shell 一份实现（这也是 `scripts/check-editor-schema.mjs` 之外的另一处去重）

## 5. 约定（添加新功能必读）

1. **永远不要整份复制主题模板来覆盖**（如 copy `single.html`）。PaperMod 提供的 hook（覆盖 `layouts/_partials/` 下同名文件即可生效）：
   - `extend_head.html` — `<head>` 末尾，加 CSS/JS
   - `extend_footer.html` — footer 末尾
   - `extend_post_content.html` — 文章正文之后
   - `comments.html` — 评论区整体替换
   - 其他 partial（`post_meta.html` 等）也可覆盖，但优先找 hook
   - 新建自定义 partial 一律放 `layouts/_partials/`（带下划线），不要用旧的 `layouts/partials/` 或 `layouts/_default/`
2. **JS 一律放 `assets/js/*.js`，由 `extend_head.html` 用 `resources.Get | minify | fingerprint` 接线外链**；不要往模板里写内联 `<script>`（无法 lint、无压缩、内联 defer 无效）。脚本按 defer 语义编写：执行时 DOM 已就绪
3. **自定义 CSS 放 `assets/css/extended/`**，一个职责一个文件，用 `01-`/`02-`/… 数字前缀控制合并顺序（主题会 Concat + minify 成单文件）；模板中不要写 `<style>`
4. **面向访客的 UI 文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}` 引用；不要在模板里硬编码中文文案。**JS 里的文案**让脚本读自己 `<script>` 标签的 `data-*` 属性（模板侧用 `i18n` 填值），`terms-filter.js` 就是这么做的
5. **复用主题 CSS 变量**（`--theme`/`--border`/`--secondary` 等）。暗色适配请用 **`[data-theme="dark"]`**（主题的机制），写 `.dark` 是无效的——站点 `defaultTheme='auto'`
6. **配置一律进 `hugo.toml`**，模板里通过 `site.Params.xxx` 读取，不要在模板中硬编码
7. **新建内容一律走脚手架**：`bash scripts/new-content.sh <post|course|chapter|notes|homework|lab|project|sub|doc|remove>`，或在对话里用 `/new-post`、`/new-course`、`/new-project`，或打开管理页 `bash scripts/admin.sh` 用表单建（它转交的也是这个脚本，见 4.2⑬）。它会依 `archetypes/` 生成正确的 front matter、自动排章号与权重、并从词表里选标签。**不要用 Write 直接创建内容文件、也不要手抄 front matter**——`archetypes/` 是唯一事实源，手抄必然漂移（`archetypes/default.md` 的 `cover.relative` 就曾长期是错的）。字段与多文件结构见 4.2⑫。文章放 `content/posts/<slug>/index.md`（Page Bundle），封面图 `cover.image` 放同目录。**删除内容也走脚手架**（`new-content.sh remove`，见 4.2⑫），不要在会话里手敲 `rm`
   - **课程结构与文章不同**，务必按下面建：
   - 一门课程 = `content/courses/<课程>/_index.md`（**branch bundle**），front matter 必须有 `layout: "course"` 与 `unit: "章"`（或 `"周"`），并带 `cascade`：一条 `target: {kind: page}` 下发 `tags`/`categories`（见 4.2⑨），一条 `comments: false` + `math: true`；它自身另写 `math: false`（省下约 23KB 的 KaTeX 样式）。**课程标签只写在这个 `cascade` 里**——课程主页是 section，自己写 `tags` 只会让 `/tags/` 计数虚高而词条页里不出现
   - 每个章/周 = `content/courses/<课程>/<chapter-0N>/_index.md`（**branch bundle / section**），front matter 需 `layout: "chapter"`、`weight`、`title`、`description`，并写 `math: false`（入口页无公式；**若导语里确实写了公式就改成 `math: true`**）
   - 章下的材料页各是一个 **leaf bundle**（用 `chapter --materials` 一次建，或之后用对应的子命令补）：
     - `<chapter-0N>/notes/index.md` — 📖 学习笔记（正文 = 课堂内容）
     - `<chapter-0N>/homework/index.md` — 📝 作业（正文 = 作业解法）
     - `<chapter-0N>/lab/index.md` — 🧪 实验（正文 = 实验报告）；同一章要放第二个实验就用 `lab --dir lab-02`
     - **目录名不重要**：入口页卡片的名字/图标/顺序来自 `title`/`icon`/`weight`，模板取的是 `.RegularPages.ByWeight`。所以新增材料类型（甚至临时加一页别的）不需要改任何模板
     - 它们 front matter 用 `title` / `weight` / `icon`（如 `📖`、`📝`、`🧪`）/ `description`，**不要写 `tags`**（会整体丢掉课程主页 cascade 下发的标签）
     - 附件直接与各自 `index.md` 同目录（除图片外的任意文件），会出现在该页「📎 附件下载」区；**不需要文件名前缀**
   - 分区单位由课程主页的 `unit` 决定；章节只写 `weight`，显示名自动拼成「第 N 章」
   - 课程主页与章节入口页由 `layouts/courses/*.html` 依 `layout` 显式命中，其他 section 不受影响
8. **项目默认是平铺单页**：一个项目 = `content/projects/<项目>/index.md`（leaf bundle，不要再往下分层）。front matter 用 `title` / `date` / `description` / `tags`（技术栈也走 tags，不另设字段，这样能进 `/tags/` 词条页）/ `repo`（仓库地址）/ `categories: ["项目"]`，骨架见 `archetypes/projects.md`。项目页复用主题 `single.html`，技术栈与仓库链接由 `project-meta.html` 自动追加到正文下方，**不需要写 layout**
   - **只有项目里确实还要放子项目时**（如 `CMC2026/分析思路/`）才改成分层：项目主页用 `archetypes/project-home.md`（section，内含 `cascade` + `target: {kind: page}` 下发 `tags`/`categories`），子项目用 `archetypes/project-section.md`（section，**刻意不含 tags**），文档用 `archetypes/project-doc.md`（regular page，`math` 默认 `true`，排序用 `weight`）
   - 分层时项目页与子项目页都走主题 `list.html` 自动列出下级，**没有**技术栈/仓库面板。**项目级标签只写在项目主页的 `cascade` 里**（它是 section，自己写 tags 也上不了词条页）；某篇文档想有自己的主题标签时，按「cascade 只填空、不合并」的规则，该文档显式写全即可（此时会丢掉项目级标签）
9. URL 变更需谨慎：permalinks 和 `mapping='title'` 的 giscus 都对路径/标题敏感，改名会丢评论关联
10. `themes/PaperMod/` 不直接改；如需扩展主题行为，优先用 hook，其次在 `hugo.toml` 找开关
11. 涉及 `baseURL` 的资源引用用 Hugo 的 `absURL`/relref 或相对路径，勿硬编码域名（站点在 `/my-blog/` 子路径下）
12. **课程主页与章节入口页各用一个自定义 section 模板**：`layouts/courses/course.html`（`layout: "course"`）与 `layouts/courses/chapter.html`（`layout: "chapter"`）。这是对第 1 条「不整份复制主题模板」的**有意例外**：列表页没有任何 hook，而这两页分别需要自动章节目录与入口卡片。两个模板都很小、只复用主题 partial（`breadcrumbs.html`/`anchored_headings.html`，页头共用 `course-header.html`），且只有显式写了 `layout` 的页面才命中，不影响 `/courses/` 列表页与文章页。改外观请优先改 `04-course.css`。**同类例外还有 `layouts/index.json`**（搜索索引：该模板无 hook 可挂，而正文截断无法从配置实现，见 4.2⑪）
13. **能用主题内置的就不要自己写**（曾自建过返回顶部按钮，与主题 `#top-link` 重复，已删除）。判断某个功能主题是否已提供，先 grep `themes/PaperMod/layouts/` 与 `themes/PaperMod/assets/css/`
14. **标签只从 `data/taxonomy.yaml` 词表里取**（见 4.2⑨）：用脚本或命令选词，不要手打；确实要新词就加 `--new-tag`（脚本会自动写进词表）。两条红线：**section 页不要写 `tags`**（只会让计数虚高、词条页里不出现）；**被 cascade 覆盖的子孙页不要写 `tags`**（cascade 只填空不合并，写了会整体丢掉继承来的标签）
15. **管理页（`scripts/admin/`）同样受这些约定约束**（见 4.2⑬）：它的资源只能放 `scripts/admin/ui/`（`assets/**` 会被打包进公开站点）；它写盘一律转交 `new-content.sh`/`push-blog.sh`，不要在 Node 里另写一套 front matter 或发布逻辑；护栏（哪些页面禁止写 tags、裸 `$` 提示、排期提醒）要随约定一起改，别让界面和后端规则分叉
16. **新增校验一律加进出 `.github/actions/validate/action.yml`**（不要在某个 workflow 里单独写），否则 `checks.yml` 与 `deploy.yml` 会分叉；同时想清楚它是**阻断**还是**只警告**：内容正确性问题（缺 front matter、坏链、公式错版）阻断；内部一致性与拼写问题（词表、编辑器字段表）只警告，别让它们拦住发布
17. **能问工具的就不要自己实现**：页面 URL 问 `hugo list all`（4.2⑬），front matter 模板认 `archetypes/`，词表格式认 `data/taxonomy.yaml`。这轮删掉的两处重复实现（Node 拼词表、Node 算 URL）都是因为"自己又写了一遍"而必然腐化的

## 6. 本地开发与部署

```bash
bash scripts/admin.sh     # 本地管理页（推荐日常用）：新建/编辑/看改动/一键发布 + 内嵌预览，见 4.2⑬
                          # 或者直接双击仓库根目录的「启动管理页.bat」，等价、不用开终端
bash scripts/preview.sh   # 纯本地预览（含草稿），http://localhost:1313/my-blog/；也可用 /preview
hugo server -D            # 同上，手敲版
hugo --minify --gc        # 生产构建，输出到 public/
```

管理页会自己带起 `hugo server`，所以日常写作不必再另开预览；需要干净的预览环境时用 `scripts/preview.sh`。

部署全自动：push 到 `main` → GitHub Actions（`deploy.yml`）→ checkout(fetch-depth:0，GitInfo 需要) → **`./.github/actions/validate`（校验 + 构建）** → 上传 artifact → `actions/deploy-pages@v4`。无手动步骤。

**CI 结构（2026-09-12 起）**：校验与构建的**唯一定义**在 `.github/actions/validate/action.yml`（复合动作），三个 workflow 共用它：

| workflow | 触发 | 作用 |
|---|---|---|
| `deploy.yml` | push `main` | 校验 → 构建 → 部署。**校验不过就拿不到 `public/`，不会部署** |
| `checks.yml` | PR / 非 main 分支 / 手动 | 只校验，不部署（权限只读） |
| `links.yml` | 每周一 09:00（东八区）/ 手动 | lychee 查**线上站点**的外链，**非阻断** |

直推 main 的工作流意味着校验必须进 `deploy.yml`——只挂在 PR 上是不会生效的。复合动作里的顺序是「先快后慢」：标签词表（警告）→ front matter（阻断）→ 编辑器字段表漂移（警告）→ 构建 → KaTeX 配对（阻断）→ 体积预算（阻断）→ 站内链接（阻断）。

**Hugo 版本钉的唯一事实源现在是 `.github/actions/validate/action.yml` 的 `hugo-version`**（不再是 `deploy.yml`）。升级走脚本：

```bash
bash scripts/upgrade-hugo.sh --dry-run 0.166.0   # 演练：解析版本、下载、校验方案，不写文件
bash scripts/upgrade-hugo.sh 0.166.0             # 实际改：版本钉 + static/katex 的 CSS/fonts + 注释
```

它按 KaTeX 配对表选版本（≤0.165 → katex 0.16.x 无前缀；≥0.166 → katex 0.18.4+ 带前缀），校验通过才写、失败自动回滚。**权威校验仍在 CI**：本地没装新版本 Hugo 时，只有 CI 能拿真实 Hugo 构建产物比对类名方案。

### 推送（固定入口，勿为此重新探查仓库）

内容改完后推送，直接跑脚本，不要在对话里重新摸仓库结构：

```bash
bash scripts/push-blog.sh "feat: 说明"     # 或在对话里用 /push-blog
```

脚本自己完成（顺序即「先快后慢」）：分支校验（必须是 `main`，否则退出）→ **`check-frontmatter.sh`（阻断）** → **`check-tags.sh`（只警告）** → **编辑器字段表漂移检查（只警告）** → **草稿提醒（只警告）** → `hugo --minify --gc --cleanDestinationDir` 构建校验（**失败即中止，不推**）→ **KaTeX 配对（阻断）** → **站内链接与锚点（阻断）** → **体积预算（阻断，通过时只打印 3 行结论）** → `git add -A`（含删除）→ `git commit` → `git push origin main`，最后若 `gh` 已安装并登录，附上最近一次 Actions 结果。工作区无改动但领先 origin 时只推送；两者都没有则打印提示并正常退出。不传说明时用 `chore: 更新博客内容`。

**阻断项在本地就拦住，不会推到 CI 才红**：这套校验与 CI 的复合动作同源。`check-frontmatter.sh` 拦的是「构建能过但页面其实是坏的」那一类——整页没有 front matter（标题会退化成站点名）、缺 `title`/`date`/`draft`、section 页写了顶层 `tags`、课程材料页写了 `tags`、`draft: false` 却把 `date` 写在未来；这些都是 `hugo --minify --gc` **不会**报错的。

**`--cleanDestinationDir` 不能省**：Hugo 默认不清空目标目录（`hugo --minify --gc` 的 `Cleaned` 恒为 0），所以只要曾经跑过 `hugo -D`，`public/` 里就会留下草稿页等陈旧产物，后面链接/体积两项量的就是错的东西，本地的页数也会虚高（实测虚高 5 页）。同理 `bash scripts/report-size.sh --fresh` 会构建到临时目录再量，避免这个偏差。

管理页（`bash scripts/admin.sh`，见 4.2⑬）提供同一套流程的图形入口：它调用的是同一个 `push-blog.sh`，日志原样流式显示，构建失败同样中止且不推送。

## 7. 已知事项 / 陷阱

- **`timeZone` 不设会让「当天发布的文章」当天不上线**（本仓库踩过）：`archetypes/` 写的是 `date: {{ now.Format "2006-01-02" }}`，只有日期没有时刻，Hugo 按 UTC 零点解析；在东八区它就成了「未来 8 小时」的内容，而 Hugo 默认 `buildFuture = false`，于是 CI 的 `hugo --minify --gc` 会**静默跳过**它，直到次日 UTC 跨过该日期才出现。修法是 `hugo.toml` 顶层的 `timeZone = 'Asia/Shanghai'`（已加，别删）。实测对照：不设时 `hugo --minify --gc` 不产出当天日期的文章，设了就产出。管理页对「date 排在未来」的已发布页面也会单独提醒（`/api/state` 的 `futureDated`）
- **hugo server 不会把「保存后固定链接变了」的页面挂到新地址上**：改 `date` / `title` / `slug` 会让文章换 URL，dev server 仍按旧地址提供，表现为预览 404。管理页在这三个字段被改动且预览在跑时会自动重启预览（重启即可复现正常）。顺带记下：**文章的 `:slug` 取自标题**，不是目录名——`content/posts/my-first-post/` 的实际 URL 是 `/2026/09/我的第一篇文章/`（`hugo list drafts` 打印的 permalink 可直接核对）
- 管理页的 `assets/` 禁令：界面用的 JS/CSS 只能放 `scripts/admin/ui/`，**放进 `assets/js/` 或 `assets/css/extended/` 会被主题合并进公开站点资源**，等于把管理界面发到线上（见 4.2⑬）
- **`.bat` 里不要写中文**（`启动管理页.bat` 现在一个非 ASCII 字节都没有，请保持）：`chcp 65001` 之后含中文的批处理会让 cmd.exe 按错字节偏移重读自己、把半行当命令执行。实测症状很有迷惑性——窗口里出现 `'会自动打开' is not recognized as an internal or external command`，但服务其实照常起来了，所以只看到"能跑"就以为没事。面向用户的中文一律由 `scripts/admin.sh` 打印。同理 `.bat` 必须 CRLF（`.gitattributes` 已钉住），无 BOM
- Giscus 用 `mapping='title'`：**改文章标题 = 丢评论**；换回 pathname 前需权衡。另外改标题还会改文章 URL（见上一条），外部链接会一起失效，管理页因此提供了 `slug` 字段用于把 URL 固定下来
- 首页是 Profile Mode，改首页布局要去 `[params.profileMode]`，不是普通 list 模板；按钮已移除，入口统一走顶部导航菜单
- 搜索依赖首页 JSON 输出（`[outputs] home` 的 `'JSON'`），删掉即搜索失效
- `enableGitInfo` 依赖完整 git 历史（CI 的 `fetch-depth: 0` 勿删）
- 公式现在**无条件在构建期渲染**，所以「公式能不能显示」不再取决于 `math`；`math` 只决定这一页要不要加载 `katex.min.css`（详见 4.2⑥），且有兜底检测托底
- **正文里裸写的 `$` 会让构建失败**（passthrough 会把两个 `$` 之间的内容当公式交给 KaTeX）。实测报错形如 `KaTeX parse error: ... Unicode text character "到" used in math mode`，并准确指出 `文件:行:列`；改法就是把 `$` 写成 `\$`。已验证：`\$` 能正常输出成 `$`，且**行内代码 `` `$HOME` `` 与代码块里的 `$` 都安全**（code span / fence 不会被 passthrough 处理），shell 片段照常写。若更希望这类问题只警告不阻断，把 `render-passthrough.html` 的 `throwOnError` 改成 `false`（按 `errorColor` 渲染成红字），或加上 `strict: "warn"`
- 公式里的 `*`、`\{`、`\%`、`\!`、`\,` **靠 goldmark passthrough 保护**（见 4.2⑥），所以正文里正常写 `R^*`、`\Big\{`、`\%` 即可，**不要**改成 markdown 转义写法。反过来说：一旦有人关掉 passthrough，`R^*` 会立刻退化成原样输出的 `$R^*$` 并可能把相邻文字斜体化
- **KaTeX 的 CSS/fonts 版本必须与 Hugo 内嵌版本配对**：Hugo 0.165 → `katex@0.16.x`（无前缀 class）；Hugo ≥ 0.166 → `katex@0.18.4+`（带前缀 class）。配错的表现是公式排版错乱，Hugo 官方 issue #15254 记录了这个坑。**所以升级 Hugo 时必须同时替换 `static/katex/katex.min.css` 与 `static/katex/fonts/*.woff2`**，不能只升 Hugo
- 升级 KaTeX 样式：从 npm 包取 `dist/katex.min.css` 与 `dist/fonts/*.woff2` 覆盖同名文件即可（**不再需要** `dist/katex.min.js` 与 `contrib/auto-render.min.js`——客户端已不再渲染公式）。这些静态文件没有内容指纹，访客可能需要强刷
- 不要把 `katex.min.css` 与 `fonts/` 分到不同目录：CSS 用相对路径找字体，挪动会让公式变成方框。字体已在 `.gitattributes` 里标为 binary，避免换行符转换损坏
- 课程主页要显式 `math: false` 覆盖 `cascade`；没有公式的章节入口页也写 `math: false`，省下约 23KB 的 `katex.min.css`。**入口页导语里确实有公式的（如 `chapter-02`）必须写 `math: true`**——它曾写成 `false`，那条公式长期在页面上原样显示成源码
- 课程材料页的附件**不用文件名前缀**：内容页 bundle 里除图片外的资源都会列进下载区（图片会按图片过滤掉，不会出现在下载列表）
- 课程各页 URL 由目录名决定（`/courses/<课程>/<chapter-0N>/notes/` 等），改名即改 URL；课程主页 URL（`/courses/<课程>/`）保持不变
- **材料页的 weight 不能拿 `next_weight()` 算**：那个函数数的是 `*/_index.md` 与 `*.md`（`sub`/`doc` 用），而材料页是 `*/index.md`，永远数不到 → 结果恒为 1（实测踩过：`--dir lab-02` 与笔记撞成同一个 weight）。材料页用 `next_material_weight()`
- **`check-frontmatter.sh` 的材料页规则是 `content/courses/*/*/index.md`**，不是写死的 `notes/`、`homework/`：shell `case` 的通配 `*` 会**跨 `/`**（这也是原来 `content/courses/*/notes/index.md` 能匹配到 `<课程>/<chapter-0N>/notes/index.md` 的原因）。所以新增材料目录（`lab/`、`lab-02/`）会自动被这条规则覆盖；反过来说，改这个模式时要意识到 `*` 不是「一层」
- 项目页同样由目录名决定 URL（`/projects/<项目>/`），改名即改 URL 并丢评论关联；分层项目再多一层（`/projects/cmc2026/分析思路/<文档名>/`），中文目录名在链接里会被百分号编码（站内既有中文 URL 同样如此）
- 项目页与课程页都**不在**归档页与首页列表中（`mainSections=['posts']` 只放行文章），但**都会**进搜索引擎索引（`site.RegularPages`）、`sitemap.xml` 与 `/categories/`。注意词条页只列 regular page：`my-blog` 这类平铺项目页正常出现；`CMC2026` 是 section 形式的项目，**它自己**不在词条页里，但它下面的文档页（regular page，靠 cascade 拿到标签）会正常出现
- **给 section 页写 `tags`/`categories` 是无效的，而且有害**：它不会出现在词条页的列表里，却会让 `/tags/` 总览的计数 +1。实测过：课程主页带 `tags: ["数值分析"]` 时 `/tags/数值分析/` 计数显示 1、列表 0 条。正确做法是写在该 section 的 `cascade` 里并加 `target: {kind: page}`（见 4.2⑨）
- **`cascade` 只填空、不合并**：子孙页一旦自己写了 `tags`（哪怕写成空数组 `[]`），继承来的标签会被**整体丢弃**，不是取并集。这是「课程材料页写了自己的标签后，突然从 `/tags/数值分析/` 里消失」的唯一原因
- **`cascade` 不作用于 branch bundle 自身**：写在课程主页 `_index.md` 的 `cascade` 不会给课程主页自己打标签，只给后代
- 写 cascade 的作用范围用 **`target`**，不要用旧名 `_target`（0.156 起弃用，功能仍在但构建时会打弃用警告）
- 搜索索引被 `layouts/index.json` 截断了（正文只取每页前 400 字）。如果发现「某篇长文里明明有的词搜不到」，那是预期行为，不是 bug；要改就去调该模板里的 `truncate 400`，并注意 `hugo.toml` 的 `fuseOpts.keys` 要与之同步
- 首页头像必须放在 `assets/images/`（不是 `static/images/`）：主题 `index_profile.html` 用 `resources.Get` 去 assets 找，找不到就退回 `absURL` 直出原图，`profileMode.imageWidth/Height = 120` 会被**静默忽略**（曾如此，原图 22 KB 直出而不是 4.8 KB 的 120×120）
- 标签一律从 `data/taxonomy.yaml` 里取；`scripts/check-tags.sh` 可以随时查有没有写歪的词。词表的分节/缩进格式被脚本 grep 依赖，别改成嵌套 YAML
- **`scripts/*.sh` 与 `data/*.yaml` 必须保持 LF**（`.gitattributes` 已用 `text eol=lf` 钉住）。本机 `core.autocrlf=true`，不加声明的话全新 checkout 会得到 CRLF，bash 脚本会直接报 `$'\r': command not found`。内容 `.md` 允许是 CRLF（Hugo 与两个校验脚本都能正确处理，`[[:space:]]` 会吃掉 `\r`）
- 明暗相关代码一律走 `data-theme` 属性（见第 4.1 节），不要写 `.dark` class 或监听 `class` 变化，那永远不会触发
- `/tags/`、`/categories/`、`/series/` 三个总览页的标题由 `content/<taxonomy>/_index.md` 提供。**不要**再新建 `content/tags.md` 之类带 `url` 的普通页面去覆盖它们——那会把 `kind=taxonomy` 的列表页顶替成普通文章页（曾因此让「标签」入口整页空白）
- 站点图标是 `static/` 下的静态文件，没有内容指纹；换 logo 后访客可能需要强刷才能看到新图标

### 7.1 2026-09-12 这轮排查新增的坑

- **加粗收尾紧接中文会无法闭合**（`**…**` 写在中文前）。已实测两种写法：`**附录 2（测向机原理与交会定位法**）建立模型` 能渲染（但 `）` 落在加粗外面），改成 `**附录 2（…）**建立模型` 反而**闭不上**、页面上直接显示 `**`。原因是 CommonMark 的 flanking 规则：闭合的 `**` 前面是标点（`）`）**且**后面是普通字符（`建`）时不算 right-flanking，无法收尾。修法是让闭合 `**` 后面跟标点/空白（例如补一个 `，`），或者让加粗范围不包含结尾的 `）`。**排查方法**：`grep -o '<strong>[^<]*</strong>'` 看渲染结果，或在构建产物里搜残留的 `\*\*`
- **`public/` 不会被自动清空**（见第 6 节）：本地量页数与体积前必须用 `--cleanDestinationDir`，否则会把以前 `hugo -D` 留下的草稿页算进去。这轮实测就踩到过：页数虚高 5 页，giscus 脚本的"加载页面数"也被这 5 个陈旧页面污染
- **主题模板里调用了不存在的 partial 也不会报错**：`themes/PaperMod/layouts/_partials/head.html` 在生产分支里调用 `google_analytics.html`，而这个文件在站点与主题里都不存在；构建依旧是绿的（og:/JSON-LD 照常输出）。**含义**：不能用"构建还过"来判断删主题文件是否安全（这也是第 2.1 节不剪 `layouts/` 的理由）。真要启用 GA，得自己补这个 partial
- **KaTeX 版本注释曾把警告说反**：`extend_head.html` 里原本写着"当前版本：0.18.7"，而实际是 **0.16.x（无前缀）**。照那行注释去换 0.18.x 的 CSS 会让全站公式错版。判据与自查命令见 4.2⑥，现已改成实测口径
- **`hugo list all` 是页面 URL 的权威来源**（`path,slug,title,date,…,permalink,kind,section`）。任何需要"这一页最终 URL 是什么"的地方都应该问它，别再自己实现 slugify + permalinks + pathToLower——那正是管理页原先的第二份实现，现已删除（见 4.2⑬）。注意解析它输出的两个坑：标题里可能有逗号（不能按逗号朴素切分），顶层页面的 `section` 是**空字符串**
