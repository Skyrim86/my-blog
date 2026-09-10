# Skyrim 的博客 — 项目架构文档（供 AI 助手阅读）

> 本文档面向 AI 编码助手：当你被要求为本博客添加新功能时，先读完本文，按文中"约定"一节动手，不要重新发明已有机制。
> 最后更新：2026-09-10

## 1. 项目概览

- **类型**：Hugo 静态博客（中文，zh-CN）
- **主题**：PaperMod，**vendored**（直接提交在 `themes/PaperMod/`，无 submodule；主题目录里有个 `go.mod` 但**不通过 Hugo Modules 加载**，主题由 `theme = 'PaperMod'` 路径引用），要求 Hugo ≥ 0.146 的新模板结构（`layouts/_partials/`，无 `_default/`）
- **Hugo 版本**：本地与 CI 均为 **0.165.0**（extended），版本已在 `deploy.yml` 中固定，不要随意升级
- **部署**：GitHub Pages，URL 为 `https://skyrim86.github.io/my-blog/`（注意 **baseURL 带子路径 `/my-blog/`**，所有绝对链接和资源引用都会带此前缀）
- **仓库**：`skyrim86/my-blog`，主分支 `main`

## 2. 目录结构

```
my-blog/
├── hugo.toml                  # 唯一配置文件（无 config/ 目录分段）
├── archetypes/
│   ├── default.md             # 新文章 front matter 模板（含注释掉的 series 字段）
│   ├── courses.md             # 课程章节页骨架（hugo new content courses/...）
│   └── projects.md            # 项目详情页骨架（hugo new content projects/<项目>/index.md）
├── assets/
│   ├── css/extended/          # 自定义 CSS（主题自动 Concat + minify，按文件名排序）
│   │   ├── 01-cards.css       #   文章列表卡片
│   │   ├── 02-typography.css  #   中文排版
│   │   ├── 03-widgets.css     #   系列导航
│   │   ├── 04-course.css      #   课程章节目录 + 章节入口 + 附件下载
│   │   └── 05-project.css     #   项目元信息（技术栈标签 + 仓库链接）
│   └── js/                    # 自定义 JS 源码（经 extend_head.html minify+fingerprint 后外链）
│       ├── giscus-theme-sync.js # Giscus 主题跟随（仅在有评论区的页面加载）
│       └── katex-render.js    # KaTeX 公式渲染（按需加载，见 extend_head.html）
├── i18n/zh.toml               # 站点级 UI 文案（与主题 i18n 合并，同名覆盖）
├── layouts/
│   ├── courses/               # 课程专用模板（由 front matter layout 显式命中，不影响其他 section）
│   │   ├── course.html        #   课程主页：自绘章节目录
│   │   └── chapter.html       #   章节入口页：学习笔记 / 作业 二选一
│   └── _partials/             # 全部自定义模板（注意是 _partials 带下划线）
│       ├── extend_head.html   # 覆盖主题 hook：JS 资产接线 + KaTeX 按需加载
│       ├── extend_post_content.html # 覆盖主题 hook：系列导航 + 课程附件 + 项目元信息
│       ├── series-posts.html  # 系列文章导航组件（文案走 i18n）
│       ├── course-index.html  # 课程主页的章节目录组件
│       ├── course-downloads.html # 课程材料页（笔记/作业）附件下载组件
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
│   ├── courses/<课程>/        # 一门课程：_index.md 主页 + <chapter-0N>/（notes/、homework/，见第 5 节）
│   ├── projects/_index.md     # 项目 section 列表页（url: /projects/）
│   ├── projects/<项目>/index.md # 一个项目（平铺单页，与课程的多层结构不同）
│   └── posts/<slug>/index.md  # 文章用 Page Bundle（cover 图放同目录）
├── static/
│   ├── images/avatar.jpg      # 首页头像 240×240（profileMode 引用）
│   ├── images/site-cover.jpg  # 默认 OG 分享图（params.images 引用）
│   ├── favicon.ico            # 站点图标全套（favicon-16/32、apple-touch-icon）
│   ├── katex/                 # 自托管 KaTeX：katex.min.css + katex.min.js + auto-render.min.js + fonts/*.woff2
│   ├── BingSiteAuth.xml       # Bing 站长验证
│   └── googledfe2280ece06bc5c.html  # Google Search Console 验证
├── .github/workflows/deploy.yml  # GitHub Actions 部署
└── themes/PaperMod/           # vendored 主题，不要直接修改
```

`public/`（构建产物）、`resources/`（Hugo 缓存）、`.hugo_build.lock` 均不入库；`data/` 目前不存在（Hugo 允许缺失）。

favicon 是生成的一次性静态文件（深色圆角方块 + 白色 S，与 `theme-color` 同色）；换真实 logo 时直接覆盖 `static/` 下 `favicon.ico`、`favicon-16x16.png`、`favicon-32x32.png`、`apple-touch-icon.png`、`safari-pinned-tab.svg` 这 5 个文件即可，无需改代码。

## 3. hugo.toml 配置要点

| 配置段 | 说明 |
|---|---|
| 全局 | `baseURL` 带 `/my-blog/` 子路径；`hasCJKLanguage = true`（中日韩分词，影响摘要与字数统计）；`enableEmoji`、`enableRobotsTXT`、`enableGitInfo`（文章显示 Git 最后修改时间）均开启 |
| `[frontmatter]` | `lastmod` 优先取 Git 提交时间 |
| `[taxonomies]` | 三套分类法：`tags`、`categories`、**`series`（自定义，支撑系列导航功能）** |
| `[outputs]` | 首页输出 `HTML + RSS + JSON`，**JSON 索引供 Fuse.js 搜索使用**，勿删 |
| `[permalinks]` | 文章 URL 格式 `/:year/:month/:slug/`（如 `/2026/09/我的第一篇文章/`）；改动会破坏已发布链接 |
| `[params]` | `env='production'`、`mainSections=['posts']`（首页列表/归档/上下篇只统计文章，课程与项目都不混入）、`defaultTheme='auto'`（跟随系统明暗）、开启阅读时间/TOC(默认展开)/面包屑/上下篇/代码复制/RSS 按钮；分享按钮关闭；`images=['images/site-cover.png']` 为默认 OG 图；`DateFormat='2006年1月2日'` |
| `[params.cover]` | `responsiveImages`、`linkFullImages`（点击封面看原图）开启 |
| `[params.giscus]` | 评论系统全部参数；`mapping='title'` 按文章标题关联 Discussion（非 pathname）；`theme='light'` 是初始值，实际由同步脚本动态切换 |
| `[params.profileMode]` | **首页是 Profile Mode**（个人名片：头像 + 标题 + 副标题，无按钮，需加按钮时用 `[[params.profileMode.buttons]]`） |
| `[params.fuseOpts]` | Fuse.js 搜索权重：`['title','permalink','summary','content']` |
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
- **数学公式**：主题本身不带 KaTeX/MathJax，由本项目**自托管**在 `static/katex/` 并按需加载（见 4.2 ⑥）

### 4.2 自定义功能

**① Giscus 评论** — `layouts/_partials/comments.html`（覆盖主题同名 partial）
- 参数全部读自 `hugo.toml [params.giscus]`，由 `params.comments=true` 全局启用
- **主题同步机制**（`assets/js/giscus-theme-sync.js`）：Giscus iframe 的主题不会自动跟随站点。脚本用 `MutationObserver` 观察 `<html>` 的 `data-theme` 属性变化（与主题的切换机制一致），并在懒加载 iframe 出现时同步一次初始主题；每次同步向 `https://giscus.app` postMessage `setConfig`，600ms 后重发一次兜底
- 该脚本**只在有评论区的页面加载**（`extend_head.html` 里用 `if (.Param "comments")` 判断），无评论区页面不做无效轮询

**② 系列文章导航** — `layouts/_partials/series-posts.html` + `extend_post_content.html`
- 文章 front matter 写 `series: ['系列名']` 即生效
- 渲染为可折叠 `<details open>` 列表：同系列全部文章按日期排序，当前篇加 `class="current"` 加粗高亮
- 标题文案来自 `i18n/zh.toml` 的 `seriesTitle` key
- 通过 `extend_post_content.html` hook 注入（文章正文后、footer 前）；样式在 `03-widgets.css`

**③ 中文排版优化** — `02-typography.css`：PingFang/雅黑字体栈、行高 1.85、两端对齐、标题行高收紧、中文不斜体等

**④ 列表卡片化** — `01-cards.css`：文章列表项圆角+阴影+悬浮上浮，暗色适配用 `[data-theme="dark"]`

**⑤ 课程结构（课程 → 周/章 → 笔记 / 作业）** — `layouts/courses/course.html`、`chapter.html` + `course-index.html`、`course-downloads.html`
- **课程主页**（`content/courses/<课程>/_index.md`，`layout: "course"`）由 `course.html` 渲染：面包屑 + 标题 + `unit` 说明（「本课程按章组织」）+ **自动章节目录**（`course-index.html` 按 `weight` 排序，显示「第 N 章」与各章可进入内容的徽标）+ 大纲正文
- **章节入口页**（`<chapter-0N>/_index.md`，`layout: "chapter"`）由 `chapter.html` 渲染：把本章子页面列成入口卡片（📖 学习笔记 / 📝 作业，图标取子页面 front matter 的 `icon`）并显示附件数量。**笔记与作业不堆在同一页**，必须从这里分开进入
- **材料页**（`<chapter-0N>/notes/index.md`、`homework/index.md`）走主题 `single.html`：正文即内容（可写 KaTeX 公式），`extend_post_content.html` 注入 `course-downloads.html` 列出该页的附件
- 附件 = 与 `index.md` 同目录的任意非图片资源（PDF/zip…），Hugo 随页面发布，`.RelPermalink` 即下载地址，**无需文件名前缀**
- 文案走 `i18n/zh.toml` 的 `course*` keys；样式在 `04-course.css`

**⑥ 数学公式（KaTeX，自托管）** — `static/katex/` + `layouts/_partials/extend_head.html` + `assets/js/katex-render.js`
- 主题不带 KaTeX。资源**自托管**在 `static/katex/`：`katex.min.css`、`katex.min.js`、`auto-render.min.js`、`fonts/*.woff2`（20 个，约 300KB）。**不依赖任何外部 CDN**
- **站点目前没有 `params.math`**，所以只有页面 front matter 写 `math: true` 才加载；若将来想全站开启，在 `hugo.toml` 的 `[params]` 加 `math = true` 即可（`extend_head.html` 的 `or site.Params.math (.Params.math)` 已经支持）。加载时用 `relURL` 引入上述三个文件（自动带 `/my-blog/` 子路径），再加载 `katex-render.js`
- `katex-render.js` 调用 `renderMathInElement` 渲染 `$...$`、`$$...$$`、`\(...\)`、`\[...\]`；`ignoredTags` 排除 `pre`/`code`，代码块里的 `$` 不会被误渲染
- `katex.min.css` 用**相对路径** `fonts/...` 引用字体，因此它必须与 `fonts/` 同级；只装了 `woff2`（现代浏览器均支持，CSS 中排第一位，`woff`/`ttf` 回退不会被请求）
- 课程材料页由课程主页 `_index.md` 的 `cascade: {math: true}` 统一继承；课程主页与章节入口页显式 `math: false` 覆盖，避免白加载约 300KB

**⑦ 项目展示（平铺：列表 → 详情）** — `content/projects/` + `layouts/_partials/project-meta.html` + `05-project.css`
- **与课程的关键差异**：项目是**平铺单页**（没有「章」这一层，也**没有**笔记/作业拆分，**没有**附件下载区）；每个项目 = `content/projects/<项目>/index.md` 一个页面，正文即项目介绍
- **列表页** `/projects/` 由 `content/projects/_index.md` 提供，走主题 `list.html`，因此**没有**任何自定义模板（课程主页/章节页则各有一个自定义模板）
- **详情页**走主题 `single.html`，由 `extend_post_content.html` 在 `Type == "projects"` 时注入 `project-meta.html`（正文之后、footer 之前），渲染「技术栈标签 + 查看源码按钮」
- 元信息由 front matter 的 `tags`（技术栈，用标准 tags 分类法）与 `repo`（仓库地址）驱动，**两者都为空时面板完全不输出**；技术栈标签渲染为指向 `/tags/<词条>/` 的链接，因此项目与标签体系双向联动（项目页 → 词条页，词条页也会列出该项目）
- 文案走 `i18n/zh.toml` 的 `project*` keys；样式在 `05-project.css`（只复用主题变量，变量本身随 `.dark` 切换，故无需额外暗色规则）

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
4. **面向访客的 UI 文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}` 引用；不要在模板里硬编码中文文案
5. **复用主题 CSS 变量**（`--theme`/`--border`/`--secondary` 等）。暗色适配请用 **`[data-theme="dark"]`**（主题的机制），写 `.dark` 是无效的——站点 `defaultTheme='auto'`
6. **配置一律进 `hugo.toml`**，模板里通过 `site.Params.xxx` 读取，不要在模板中硬编码
7. 文章放 `content/posts/<slug>/index.md`（Page Bundle），封面图 `cover.image` 放同目录；新文章从 `archetypes/default.md` 的结构复制 front matter。**课程结构与文章不同**，务必按下面建：
   - 一门课程 = `content/courses/<课程>/_index.md`（**branch bundle**），front matter 必须有 `layout: "course"` 与 `unit: "章"`（或 `"周"`），并带 `cascade`（`comments: false` + `math: true`）；它自身另写 `math: false`，避免首页白加载 KaTeX
   - 每个章/周 = `content/courses/<课程>/<chapter-0N>/_index.md`（**branch bundle / section**），front matter 需 `layout: "chapter"`、`weight`、`title`、`description`，并写 `math: false`（入口页无公式）
   - 章下的两块内容各是一个 **leaf bundle**：
     - `<chapter-0N>/notes/index.md` — 📖 学习笔记（正文 = 课堂内容）
     - `<chapter-0N>/homework/index.md` — 📝 作业（正文 = 作业解法）
     - 两者 front matter 用 `title` / `weight` / `icon`（如 `📖`、`📝`）/ `description`
     - 附件直接与各自 `index.md` 同目录（除图片外的任意文件），会出现在该页「📎 附件下载」区；**不需要文件名前缀**
   - 分区单位由课程主页的 `unit` 决定；章节只写 `weight`，显示名自动拼成「第 N 章」
   - 课程主页与章节入口页由 `layouts/courses/*.html` 依 `layout` 显式命中，其他 section 不受影响
8. **项目结构与文章、课程都不同**：一个项目 = `content/projects/<项目>/index.md`（leaf bundle，**平铺单页**，不要再往下分层）。front matter 用 `title` / `date` / `description` / `tags`（技术栈也走 tags，不另设字段，这样能进 `/tags/` 词条页）/ `repo`（仓库地址）/ `categories: ["项目"]`，骨架见 `archetypes/projects.md`。项目页复用主题 `single.html`，技术栈与仓库链接由 `project-meta.html` 自动追加到正文下方，**不需要写 layout**
9. URL 变更需谨慎：permalinks 和 `mapping='title'` 的 giscus 都对路径/标题敏感，改名会丢评论关联
10. `themes/PaperMod/` 不直接改；如需扩展主题行为，优先用 hook，其次在 `hugo.toml` 找开关
11. 涉及 `baseURL` 的资源引用用 Hugo 的 `absURL`/relref 或相对路径，勿硬编码域名（站点在 `/my-blog/` 子路径下）
12. **课程主页与章节入口页各用一个自定义 section 模板**：`layouts/courses/course.html`（`layout: "course"`）与 `layouts/courses/chapter.html`（`layout: "chapter"`）。这是对第 1 条「不整份复制主题模板」的**有意例外**：列表页没有任何 hook，而这两页分别需要自动章节目录与入口卡片。两个模板都很小、只复用主题 partial（`breadcrumbs.html`/`anchored_headings.html`），且只有显式写了 `layout` 的页面才命中，不影响 `/courses/` 列表页与文章页。改外观请优先改 `04-course.css`
13. **能用主题内置的就不要自己写**（曾自建过返回顶部按钮，与主题 `#top-link` 重复，已删除）。判断某个功能主题是否已提供，先 grep `themes/PaperMod/layouts/` 与 `themes/PaperMod/assets/css/`

## 6. 本地开发与部署

```bash
hugo server -D        # 本地预览（含草稿），http://localhost:1313/my-blog/
hugo --minify --gc    # 生产构建，输出到 public/
```

部署全自动：push 到 `main` → GitHub Actions（`deploy.yml`）→ checkout(fetch-depth:0，GitInfo 需要) → Setup Hugo 0.165.0 extended → `hugo --minify --gc` → 上传 artifact → `actions/deploy-pages@v4`。无手动步骤。

## 7. 已知事项 / 陷阱

- Giscus 用 `mapping='title'`：**改文章标题 = 丢评论**；换回 pathname 前需权衡
- 首页是 Profile Mode，改首页布局要去 `[params.profileMode]`，不是普通 list 模板；按钮已移除，入口统一走顶部导航菜单
- 搜索依赖首页 JSON 输出（`[outputs] home` 的 `'JSON'`），删掉即搜索失效
- `enableGitInfo` 依赖完整 git 历史（CI 的 `fetch-depth: 0` 勿删）
- 课程里的公式要真正渲染，**该页必须 `math: true`**（材料页由课程主页 `cascade` 自动继承；新建材料页时确认一下）。`math` 为假时 `$...$` 会原样显示成源码
- KaTeX 已**自托管**（`static/katex/`），不依赖 CDN。升级时用 npm 包 `dist/` 下的 `katex.min.css`、`katex.min.js`、`contrib/auto-render.min.js` 与 `dist/fonts/*.woff2` 覆盖同名文件，并更新 `extend_head.html` 注释里的版本号。这些静态文件**没有内容指纹**，升级后可能需要强刷清缓存
- 不要把 `katex.min.css` 与 `fonts/` 分到不同目录：CSS 用相对路径找字体，挪动会让公式变成方框。字体已在 `.gitattributes` 里标为 binary，避免换行符转换损坏
- `katex-render.js` 的 `ignoredTags` 含 `pre`/`code`，代码块里的 `$` 不会被渲染；但正文里裸写的 `$`（例如价格）可能被当成公式起始符，必要时用 `\$` 转义
- 课程主页与章节入口页要显式 `math: false` 覆盖 `cascade`，否则这些没有公式的页面也会白白加载约 300KB 的 KaTeX
- 课程材料页的附件**不用文件名前缀**：内容页 bundle 里除图片外的资源都会列进下载区（图片会按图片过滤掉，不会出现在下载列表）
- 课程各页 URL 由目录名决定（`/courses/<课程>/<chapter-0N>/notes/` 等），改名即改 URL；课程主页 URL（`/courses/<课程>/`）保持不变
- 项目页同样由目录名决定 URL（`/projects/<项目>/`），改名即改 URL 并丢评论关联
- 项目页与课程页都**不在**归档页与首页列表中（`mainSections=['posts']` 只放行文章），但**都会**进搜索引擎索引（`site.RegularPages`）、`sitemap.xml` 与 `/categories/`（项目用 `categories: ["项目"]`）
- 明暗相关代码一律走 `data-theme` 属性（见第 4.1 节），不要写 `.dark` class 或监听 `class` 变化，那永远不会触发
- `/tags/`、`/categories/`、`/series/` 三个总览页的标题由 `content/<taxonomy>/_index.md` 提供。**不要**再新建 `content/tags.md` 之类带 `url` 的普通页面去覆盖它们——那会把 `kind=taxonomy` 的列表页顶替成普通文章页（曾因此让「标签」入口整页空白）
- 站点图标是 `static/` 下的静态文件，没有内容指纹；换 logo 后访客可能需要强刷才能看到新图标
