# 架构与仓库布局

面向需要改这个仓库的 AI 助手与未来的自己。规则与红线在 [`../AGENTS.md`](../AGENTS.md)，本文是「东西都在哪、为什么这么放」。

## 1. 一眼看懂

- **类型**：Hugo 静态博客（中文，`zh-CN`），无服务端、无数据库
- **主题**：PaperMod，**vendored**（直接提交在 `themes/PaperMod/`，不是 submodule）。主题目录里有个 `go.mod` 但**不通过 Hugo Modules 加载**，主题由 `hugo.toml` 的 `theme = 'PaperMod'` 按路径引用。要求 Hugo ≥ 0.146 的新模板结构（`layouts/_partials/`，没有 `_default/`）
- **Hugo 版本**：本地与 CI 都是 **0.165.0**（extended）。版本钉的**唯一事实源**是 `.github/actions/validate/action.yml` 的 `hugo-version`
- **部署**：GitHub Pages，URL 是 `https://skyrim86.github.io/my-blog/` —— **`baseURL` 带子路径 `/my-blog/`**，所有绝对链接与资源引用都会带此前缀
- **仓库**：`skyrim86/my-blog`，主分支 `main`

## 2. 目录结构

```
my-blog/
├── 启动管理页.bat              # 双击入口：打开本地管理页（必须纯 ASCII + CRLF，见 docs/admin.md）
├── README.md                  # 给人看的入门
├── AGENTS.md                  # 给 AI 助手的规则与指针
├── docs/                      # 本目录：机制与细节文档（Hugo 不读，不参与构建）
├── hugo.toml                  # 唯一配置文件（没有 config/ 分段）
├── archetypes/                # front matter 的唯一事实源（scripts/new-content.sh 也调它）
│   ├── default.md             #   文章骨架（posts/ 下没有 posts.md，回退到此文件）
│   ├── courses.md             #   课程主页（layout: course，内含 cascade 标签下发）
│   ├── chapter.md             #   章节入口页（layout: chapter，math: false）
│   ├── notes.md               #   学习笔记 📖（刻意不写 tags）
│   ├── homework.md            #   作业 📝（同上）
│   ├── lab.md                 #   实验 🧪（键与 notes.md 完全一致）
│   ├── projects.md            #   平铺项目（leaf bundle）
│   ├── project-home.md        #   分层项目主页（section + cascade）
│   ├── project-section.md     #   分层项目子项目（section，刻意不写 tags）
│   └── project-doc.md         #   分层项目文档（regular page，math 默认 true）
├── assets/                    # 走 Hugo 资源管线（会被 minify/fingerprint/Resize）
│   ├── css/extended/          #   自定义 CSS，主题自动 Concat + minify，按文件名排序
│   │   ├── 01-cards.css       #     文章列表卡片
│   │   ├── 02-typography.css  #     中文排版
│   │   ├── 03-widgets.css     #     系列导航
│   │   ├── 04-course.css      #     章节目录 + 入口卡片 + 附件下载
│   │   ├── 05-project.css     #     项目元信息（技术栈 + 仓库链接）
│   │   ├── 06-terms-filter.css#     词条筛选框
│   │   └── 07-related.css     #     相关内容区块
│   ├── images/avatar.jpg      #   首页头像（**必须放 assets/**，否则 120×120 被静默忽略）
│   └── js/                    #   自定义 JS 源码，经 extend_head.html minify+fingerprint 后外链
│       ├── giscus-theme-sync.js  # Giscus 主题跟随（只在实际有评论区的页面加载）
│       └── terms-filter.js       # 标签/分类/系列总览页的词条筛选框
├── content/                   # 站点内容（详见 docs/content.md）
│   ├── about.md  archives.md  search.md
│   ├── categories/ tags/ series/ _index.md   # 三套分类法的总览页标题
│   ├── courses/<课程>/        # _index.md 主页 + <chapter-0N>/（notes|homework|lab 材料页）
│   ├── posts/<slug>/index.md  # 文章用 Page Bundle（封面图放同目录）
│   └── projects/<项目>/       # 平铺项目 index.md；CMC2026 是分层项目（section + 文档）
├── data/taxonomy.yaml         # 标签 / 分类词表（唯一事实源，要入库）
├── i18n/zh.toml               # 站点级 UI 文案（与主题 i18n 合并，同名覆盖）
├── layouts/
│   ├── index.json             # 覆盖主题模板：搜索索引（正文截断 + tags 字段）
│   ├── _markup/render-passthrough.html   # 公式渲染钩子（构建期 KaTeX）
│   ├── courses/course.html    # 课程主页模板（由 layout: course 显式命中）
│   ├── courses/chapter.html   # 章节入口页模板（由 layout: chapter 命中）
│   └── _partials/             # 全部自定义模板（注意是 _partials 带下划线）
│       ├── extend_head.html   #   覆盖主题 hook：JS 接线 + KaTeX 样式按需加载
│       ├── extend_post_content.html  # 覆盖主题 hook：系列导航 + 附件 + 项目元信息 + 相关内容
│       ├── series-posts.html  related-content.html  course-index.html
│       ├── course-header.html course-downloads.html project-meta.html
│       └── comments.html      #   覆盖主题同名 partial（Giscus）
├── scripts/                   # 内容与 CI 工具（bash / Node，零依赖）
│   ├── new-content.sh         # 新内容脚手架 + 删除（唯一实现）
│   ├── check-frontmatter.sh   # 阻断：front matter 与 section/material 的 tags 规则
│   ├── check-tags.sh          # 只警告：标签词表比对
│   ├── check-katex-pairing.sh # 阻断：KaTeX 样式与 Hugo 内嵌版本是否配对
│   ├── check-links.mjs        # 阻断：站内链接与锚点
│   ├── check-editor-schema.mjs# 只警告：archetypes 与管理页字段表的漂移
│   ├── report-size.sh         # 阻断：页面体积预算（--fresh 消除 public/ 陈旧产物影响）
│   ├── push-blog.sh           # 一键构建 + 校验 + 提交 + 推送
│   ├── preview.sh             # 本地预览（hugo server -D）
│   ├── upgrade-hugo.sh        # Hugo + KaTeX 一键同步升级
│   └── pin-actions.mjs        # 把 Actions 的 uses 从可变标签改成 commit SHA
├── tools/admin/               # 本地管理页（零依赖 Node 服务 + 原生前端，不参与 Hugo 构建）
│   ├── start.sh               #   启动器（.bat 调它）
│   ├── server.mjs             #   HTTP 服务：静态页 + JSON API
│   ├── lib/                   #   content / frontmatter / taxonomy / git / hugo / exec
│   └── ui/                    #   index.html + app.js + style.css
├── static/                    # 原样发布（无内容指纹）
│   ├── images/site-cover.jpg  #   默认 OG 分享图（头像不在这里，见 assets/images/）
│   ├── favicon.ico  favicon-16x16.png  favicon-32x32.png  apple-touch-icon.png
│   ├── katex/                 #   自托管 KaTeX：katex.min.css + fonts/*.woff2（版本必须与 Hugo 配对）
│   ├── BingSiteAuth.xml  googledfe2280ece06bc5c.html   # 站长验证
├── .github/
│   ├── actions/validate/action.yml  # 校验+构建的**唯一定义**（checks.yml 与 deploy.yml 共用）
│   ├── workflows/deploy.yml   # push main：校验 → 构建 → 部署（校验不过不部署）
│   ├── workflows/checks.yml   # PR / 非 main：只校验
│   ├── workflows/links.yml    # 每周外链检查（lychee，非阻断，查线上站点）
│   └── dependabot.yml         # 给已固定 SHA 的 Actions 留更新通道
├── .agents/commands/          # 斜杠命令（放 .agents/ 才入库，.zcode/ 被 gitignore）
├── .editorconfig  .gitattributes  .gitignore  .lychee.toml
└── themes/PaperMod/           # vendored 主题（已剪裁，见第 5 节；不要直接修改）
```

`public/`（构建产物）、`resources/`（Hugo 缓存）、`.hugo_build.lock` 均不入库。`data/taxonomy.yaml` 是标签词表，**要入库**。

`docs/`、`tools/`、`README.md` 都在 Hugo 的构建目录之外（Hugo 只读 `content/ layouts/ static/ assets/ data/ i18n/ themes/ archetypes/` 与根配置），不会被发布到线上。

## 3. hugo.toml 配置要点

单文件配置，没有 `config/` 分段。改任何一条都要想清楚后果：

| 配置段 | 说明 |
|---|---|
| 全局 | **`timeZone = 'Asia/Shanghai'` 必须保留**（否则当天发布的文章当天不会上线，见 [`traps.md`](traps.md)）；`baseURL` 带 `/my-blog/` 子路径；`hasCJKLanguage = true`（影响摘要与字数统计）；`enableEmoji`、`enableRobotsTXT`、`enableGitInfo`（文章显示 Git 最后修改时间）均开启 |
| `[frontmatter]` | `lastmod` 优先取 Git 提交时间 |
| `[taxonomies]` | 三套分类法：`tags`、`categories`、**`series`（自定义，支撑系列导航）** |
| `[outputs]` | 首页输出 `HTML + RSS + JSON`。**JSON 索引供 Fuse.js 搜索使用，勿删**（字段由 `layouts/index.json` 决定） |
| `[permalinks]` | 文章 URL 格式 `/:year/:month/:slug/`。改动会破坏已发布链接 |
| `[params]` | `env='production'`、`mainSections=['posts']`（首页列表/归档/上下篇只统计文章）、阅读时间/TOC(默认展开)/面包屑/上下篇/代码复制/RSS 按钮开；`images=['images/site-cover.jpg']` 为默认 OG 图；`DateFormat='2006年1月2日'`。**与主题默认等价的三个开关（`defaultTheme`/`ShowShareButtons`/`disableThemeToggle`）已刻意删掉**，不要再加回来 |
| `[params.cover]` | `responsiveImages`、`linkFullImages`（点击封面看原图）开启 |
| `[params.giscus]` | 评论全部参数；`mapping='title'` 按标题关联 Discussion；`theme='light'` 是初始值，实际由同步脚本动态切换 |
| `[params.profileMode]` | **首页是 Profile Mode**（头像 + 标题 + 副标题，无按钮）；要加按钮用 `[[params.profileMode.buttons]]` |
| `[params.fuseOpts]` | 搜索权重 `['title','permalink','summary','tags','content']`。**keys 里出现的字段必须由 `layouts/index.json` 实际输出**，改一处要同步另一处 |
| `[[menu.main]]` | 8 个导航项，weight 十进位留插入空间：首页(10)/课程(20)/项目(30)/文章(40)/归档(50)/标签(60)/搜索(70)/关于(80) |
| `[markup.highlight]` | monokai 主题，行号开启 |
| `[markup.goldmark.extensions.passthrough]` | 公式的 delimiters（`$`、`$$`、`\(\)`、`\[\]`）——**单 `$` 必须显式写**，passthrough 默认不含它。改这里要同步看 `layouts/_markup/render-passthrough.html` |
| `[imaging]` | 图片质量 75、lanczos |
| `[security.exec]` | 允许 git 等 exec（GitInfo 需要） |

## 4. 构建与部署

本地：

```bash
bash tools/admin/start.sh    # 管理页（自带 hugo server 预览）
bash scripts/preview.sh      # 纯预览（含草稿）
hugo --minify --gc --cleanDestinationDir   # 生产构建
```

部署全自动，无手动步骤：push 到 `main` → GitHub Actions → `checkout(fetch-depth: 0，GitInfo 需要)` → `./.github/actions/validate`（校验 + 构建）→ 上传 artifact → `actions/deploy-pages@v4`。

**CI 结构**：校验与构建的唯一定义在 `.github/actions/validate/action.yml`（复合动作），三个 workflow 共用：

| workflow | 触发 | 作用 |
|---|---|---|
| `deploy.yml` | push `main` | 校验 → 构建 → 部署。**校验不过就拿不到 `public/`，不会部署** |
| `checks.yml` | PR / 非 main / 手动 | 只校验，不部署（权限只读） |
| `links.yml` | 每周一 09:00（东八区）/ 手动 | lychee 查**线上站点**的外链，非阻断 |

因为工作流是**直推 main**，只挂在 PR 上的校验根本不会生效，所以校验必须进 `deploy.yml`。

复合动作里的顺序是「先快后慢」：标签词表（警告）→ front matter（阻断）→ 编辑器字段表漂移（警告）→ 构建 → KaTeX 配对（阻断）→ 体积预算（阻断）→ 站内链接（阻断）。

**新增校验一律加进 `action.yml`**，不要在某个 workflow 里单独写，否则 `checks.yml` 与 `deploy.yml` 会分叉。同时想清楚是**阻断**还是**只警告**：内容正确性问题（缺 front matter、坏链、公式错版）阻断；内部一致性与拼写问题（词表、编辑器字段表）只警告，别让它们拦住发布。

**Hugo 升级**走脚本：

```bash
bash scripts/upgrade-hugo.sh --dry-run 0.166.0   # 演练：解析版本、下载、校验方案，不写文件
bash scripts/upgrade-hugo.sh 0.166.0             # 实际改：版本钉 + static/katex 的 CSS/fonts + 注释
```

它按 KaTeX 配对表选版本（≤0.165 → katex 0.16.x 无前缀；≥0.166 → katex 0.18.4+ 带前缀），校验通过才写、失败自动回滚。**权威校验仍在 CI**：本地没装新版本 Hugo 时，只有 CI 能拿真实 Hugo 构建产物比对类名方案。原委见 [`formulas.md`](formulas.md)。

### `--cleanDestinationDir` 不能省

Hugo 默认不清空目标目录（`Cleaned` 恒为 0），所以只要曾经跑过 `hugo -D`，`public/` 里就会留下草稿页等陈旧产物，后面链接与体积两项量的就是错的东西，本地页数也会虚高（实测虚高 5 页）。同理 `bash scripts/report-size.sh --fresh` 会构建到临时目录再量。

## 5. 主题剪裁记录（2026-09-12）

`themes/PaperMod/` 从 125 个入库文件 / 756 KB 剪到 **72 个 / 478 KB**，删的都是与本站构建无关的东西：`images/`（screenshot + tn，只供上游主题画廊用 —— `theme.toml` 里没有 `screenshot` 键，已核对）、`.github/`（上游 issue/PR 模板与 workflow）、`i18n/` 里 **43 个用不到的语言包**（保留 `en.yaml`/`zh.yaml`/`zh-tw.yaml`；站点单语言 `zh`，locale `zh-CN` 的查找链 `zh-CN → zh → en` 全覆盖，留 en 是兜底防键名直出）、`README.md`、以及 **`go.mod`**（主题不通过 Hugo Modules 加载，那个文件会诱导后人去 `hugo mod` 它）。保留 `LICENSE`（MIT 署名）与 `theme.toml`。

**`themes/PaperMod/layouts/` 与 `assets/` 刻意没有剪**，这不是偷懒而是结论：**Hugo 会静默容忍缺失的 partial** —— 主题 `_partials/head.html` 无条件调用的 `google_analytics.html` 在站点与主题里**都不存在**，而 og:/JSON-LD 照常渲染、构建一直是绿的。既然构建成功无法证明删模板文件安全，而 `layouts/` 里那些死文件（`share_icons.html`、`home_info.html`、8 个 shortcode、被站点覆盖的 `index.json`）总共不到 40 KB，就不值得为它承担「某条只走一次的渲染路径被删掉、且没人发现」的风险。

**要再剪主题，只能按引用分析逐个确认，不能靠「构建还过」来验证。** 升级上游后这些被删的文件会重新出现，需要按本节清单再剪一次。
