# 功能清单与扩展约定

「这个功能在哪实现、为什么这么做」。内容结构类的功能（课程、项目、标签词表）细节在 [`content.md`](content.md)，公式在 [`formulas.md`](formulas.md)，管理页在 [`admin.md`](admin.md)。

## 1. 主题已经提供的（勿重复实现）

- 明暗切换（`auto/light/dark`，用户偏好存 `localStorage['pref-theme']`）。机制是给 `<html>` 设 **`data-theme="light|dark"` 属性**，CSS 用 `:root[data-theme="dark"]` 匹配——**不是 `.dark` class**；auto 模式在页面加载时就已解析成 light/dark
- 响应式 CSS 变量：`--theme`、`--content`、`--border`、`--secondary`、`--primary`、`--code-bg` 等，自定义样式请复用
- TOC、面包屑、上下篇导航、代码复制按钮、阅读时间
- **返回顶部按钮**（`#top-link`，带 Alt+G 快捷键；要关掉就在 `hugo.toml` 设 `disableScrollToTop = true`）
- SEO：Open Graph/Twitter meta、`templates/schema_json.html`（JSON-LD）、hreflang
- `robots.txt` 与 `sitemap.xml` 生成（按 `hugo.IsProduction` 判断，生产环境不 Disallow）
- 数学公式：主题**不带** KaTeX/MathJax，本项目在构建期用 Hugo 内置的 `transform.ToMath` 渲染，见 [`formulas.md`](formulas.md)

**能问主题的就不要自己写**：判断某个功能主题是否已提供，先 grep `themes/PaperMod/layouts/` 与 `themes/PaperMod/assets/css/`。（曾自建过返回顶部按钮，与主题 `#top-link` 重复，已删除。）

## 2. 扩展约定

1. **永远不要整份复制主题模板来覆盖**（如 copy `single.html`）。PaperMod 提供的 hook（覆盖 `layouts/_partials/` 下同名文件即生效）：`extend_head.html`（`<head>` 末尾，加 CSS/JS）、`extend_footer.html`（footer 末尾）、`extend_post_content.html`（正文之后）、`comments.html`（评论区整体替换）。其他 partial（`post_meta.html` 等）也可覆盖，但优先找 hook
2. 新建自定义 partial 一律放 `layouts/_partials/`（带下划线），不要用旧的 `layouts/partials/` 或 `layouts/_default/`
3. **JS 一律放 `assets/js/*.js`**，由 `extend_head.html` 用 `resources.Get | minify | fingerprint` 接线外链；不要往模板里写内联 `<script>`（无法 lint、无压缩、内联 defer 无效）。脚本按 defer 语义编写：执行时 DOM 已就绪
4. **自定义 CSS 放 `assets/css/extended/`**，一个职责一个文件，用 `01-`/`02-`/… 数字前缀控制合并顺序（主题会 Concat + minify 成单文件）；模板中不要写 `<style>`
5. **面向访客的 UI 文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}`，不要在模板里硬编码中文。**JS 里的文案**让脚本读自己 `<script>` 标签的 `data-*` 属性（模板侧用 `i18n` 填值），`terms-filter.js` 就是这么做的
6. **配置一律进 `hugo.toml`**，模板里通过 `site.Params.xxx` 读取，不要在模板中硬编码
7. 暗色适配用 **`[data-theme="dark"]`**，写 `.dark` 是无效的
8. **涉及 `baseURL` 的资源引用用 `absURL`/relref 或相对路径**，勿硬编码域名（站点在 `/my-blog/` 子路径下）
9. `themes/PaperMod/` 不直接改；要扩展主题行为，优先用 hook，其次在 `hugo.toml` 找开关

## 3. 自定义功能

### ① Giscus 评论 — `layouts/_partials/comments.html`

参数全部读自 `hugo.toml [params.giscus]`，由 `params.comments=true` 全局启用。

**主题同步机制**（`assets/js/giscus-theme-sync.js`）：Giscus iframe 的主题不会自动跟随站点。脚本用 `MutationObserver` 观察 `<html>` 的 `data-theme` 属性变化（与主题的切换机制一致），并在懒加载 iframe 出现时同步一次初始主题；每次同步向 `https://giscus.app` postMessage `setConfig`，600ms 后重发一次兜底。

该脚本**只在真正渲染评论区的页面加载**。判据是三个条件同时成立（在 `extend_head.html` 里）：`.Param "comments"`（与主题 `single.html` 的判据一致，课程材料页由 cascade 关掉）、`.Kind == "page"`（少了这条会回落到全站 `params.comments = true`，把首页/列表页/词条页一起命中）、排除 `archives`/`search` 两个 layout（它们是 regular page 但各有独立模板，不走 `single.html`）。实测（干净构建、65 页）：**修之前 37 个页面加载它、真正有评论区的只有 10 个**；收窄后两者都是 10，零浪费。

### ② 系列文章导航 — `series-posts.html` + `extend_post_content.html`

文章 front matter 写 `series: ['系列名']` 即生效。渲染为可折叠 `<details open>` 列表：同系列全部文章按日期排序，当前篇加 `class="current"` 加粗高亮。标题文案来自 `i18n/zh.toml` 的 `seriesTitle`。通过 `extend_post_content.html` 注入（正文后、footer 前），样式在 `03-widgets.css`。

### ③ 中文排版优化 — `02-typography.css`

PingFang/雅黑字体栈、行高 1.85、两端对齐、标题行高收紧、中文不斜体等。

### ④ 列表卡片化 — `01-cards.css`

文章列表项圆角 + 阴影 + 悬浮上浮；暗色适配用 `[data-theme="dark"]`。

### ⑤ 课程结构 — `layouts/courses/course.html`、`chapter.html` + `course-index.html`、`course-downloads.html`

自动章节目录与章节入口卡片。结构与 front matter 规则见 [`content.md` 第 2 节](content.md#2-课程结构课程--章--材料页)，文案走 `i18n/zh.toml` 的 `course*` keys，样式在 `04-course.css`。

### ⑥ 数学公式（KaTeX，构建期渲染）— `layouts/_markup/render-passthrough.html` + `static/katex/`

**完整机制与排错见 [`formulas.md`](formulas.md)。** 三条最常踩的：公式无条件在构建期渲染（`math` 只管要不要加载 CSS）、正文里裸写 `$` 会让构建失败、KaTeX 样式版本必须与 Hugo 内嵌版本配对。

### ⑦ 项目展示 — `project-meta.html` + `05-project.css`

元信息由 front matter 的 `tags`（技术栈，走标准 tags 分类法）与 `repo`（仓库地址）驱动，**两者都为空时面板完全不输出**；技术栈标签渲染为指向 `/tags/<词条>/` 的链接，因此项目与标签体系双向联动。由 `extend_post_content.html` 在 `Type == "projects"` **且 `.BundleType == "leaf"`** 时注入——这个限定是必需的，理由见 [`content.md` 第 3 节](content.md#3-项目结构)。文案走 `project*` keys，样式复用主题变量（变量本身随 `data-theme` 切换，故无需额外暗色规则）。

### ⑧ 词条筛选框（标签/分类/系列总览页）— `assets/js/terms-filter.js` + `06-terms-filter.css`

在 `/tags/`、`/categories/`、`/series/` 的词条列表上方注入一个输入框，输入即过滤下方词条（纯前端 DOM 过滤，不依赖搜索索引、不引入第三方库）。由 `extend_head.html` 按 `{{ if eq .Kind "taxonomy" }}` 加载，正好命中这三个总览页。

**没有自定义模板**：主题 `taxonomy.html` 无 hook，复制它会漂移，所以沿用「脚本动态创建 DOM」的做法（输入框 + 空提示都由 JS 插入）。UI 文案经 `<script>` 的 `data-placeholder`/`data-empty` 属性从 i18n 传入（JS 无法调用 Hugo 的 `i18n`），`data-placeholder` 带上页面标题，因此各页显示「在标签中筛选…」等。

两个易踩的坑：① 隐藏词条**必须用 class**（`terms-filter-hidden`），因为主题的 `.terms-tags li { display:inline-block }` 会压过 `[hidden] { display:none }`；② 不要用 `requestAnimationFrame` 做节流，它在后台/隐藏标签页里不触发会导致筛选静默失效（已改为同步过滤）。输入框样式直接复用主题的 `.searchbox input`（`search.css` 已打进全局样式表），`06-terms-filter.css` 只补间距、隐藏规则与空提示样式。

### ⑨ 标签词表与层级继承

`data/taxonomy.yaml` + `cascade`。规则与红线见 [`content.md` 第 4、5 节](content.md)。

### ⑩ 相关内容区块（文章 ↔ 课程 ↔ 项目）— `related-content.html` + `07-related.css`

打分 = 共享 `tags` 数 × 10 + 共享 `series` 数 × 6，取前 5 条，每条带类型徽标（文章/课程/项目，由 `.Type` 映射 i18n key），文案走 `related*` keys。

**为什么不用 Hugo 内置的 `.Related`**：`.Related` 只在 regular page 之间比较，而课程主页与分层项目主页是 section，用它会永远关联不到。这里改为遍历 `site.Pages`。

候选过滤：排除自身、`searchHidden`、`home`/`taxonomy`/`term`、`archives`/`search` 布局。section 候选（课程主页/项目主页）自己没有标签，用**子孙 regular page 的标签聚合**出「有效标签」。判据是「**祖先里只有一个 section**」：这既排除了 `/courses/`、`/projects/` 这类列表页（祖先里没有 section），也排除了「problem-01」这类更深的纯导航 section（祖先里有两个以上 section）——否则它们会和真正的文档同分，把列表挤满。

只在 regular page 上显示（本 partial 由 `extend_post_content.html` 注入，走 `single.html`）。section 页走主题 `list.html`，没有 hook，所以课程主页/项目主页只是「能被别人关联到」，自身不显示这个区块。

### ⑪ 搜索索引（覆盖主题模板）— `layouts/index.json` + `hugo.toml` 的 `fuseOpts.keys`

覆盖动机：主题原版把每页 `.Plain` 全文塞进索引，本站实测 151 KB（CMC2026 的长文档是主因）；把 `content` 截断到 400 字后降到约 17 KB。同时新增 `tags` 字段让标签也能被搜到（`fuseOpts.keys` 已同步加 `'tags'`）。

**`summary` 必须 `plainify` 后再截断到 150 字**，这是配合构建期公式渲染的必需处理：没写显式 `summary` 的页面（课程材料页就是），Hugo 会从 `.Content` 自动截取，而公式现在是成百上千个 KaTeX 标记，自动摘要会变成 5000+ 字符的 HTML（含完整 MathML），把索引从 17 KB 撑到 49 KB、检索片段里也会混进标记。净化后索引 14 KB。**给公式多的页面写显式 `summary` 仍是更好的做法**（自动摘要 plainify 后会出现「x∗x^*x∗」这类渲染文本与 LaTeX 并存的痕迹）。

**代价**：正文只能匹配每页前 400 字，长文档内部的词搜不到（标题/摘要/标签仍全量匹配）。如果发现「某篇长文里明明有的词搜不到」，那是预期行为，不是 bug。

**改索引字段时必须同步 `fuseOpts.keys`**，否则多输出的字段搜不到、keys 里多写的字段则无效。

## 4. 两处有意的主题模板覆盖

除上述 hook 之外，仓库里有两处**有意**整份覆盖主题模板（是对「不复制主题模板」的例外）：

1. `layouts/courses/course.html`（`layout: "course"`）与 `layouts/courses/chapter.html`（`layout: "chapter"`）：列表页没有任何 hook，而这两页分别需要自动章节目录与入口卡片。两个模板都很小、只复用主题 partial（`breadcrumbs.html`/`anchored_headings.html`，页头共用 `course-header.html`），且只有显式写了 `layout` 的页面才命中，不影响 `/courses/` 列表页与文章页。**改外观请优先改 `04-course.css`**
2. `layouts/index.json`：该模板无 hook 可挂，而正文截断无法从配置实现

## 5. 总览页标题

`/tags/`、`/categories/`、`/series/` 三个总览页的标题由 `content/<taxonomy>/_index.md` 提供。**不要**再新建 `content/tags.md` 之类带 `url` 的普通页面去覆盖它们——那会把 `kind=taxonomy` 的列表页顶替成普通文章页（曾因此让「标签」入口整页空白）。
