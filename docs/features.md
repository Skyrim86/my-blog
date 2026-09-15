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

**代价与补丁**：正文只能匹配每页前 400 字，长文档**正文中段**的词搜不到。索引为此补了 `headings` 字段（页内各级标题，最多三层，每页整体截断 400 字）：标题是信息密度最高、体积又最小的部分。实测搜「浮点」在补之前命中 0 条——`chapter-01/notes` 里明明有「1.3 浮点数与机器精度」，只是它落在前 400 字之外；补之后命中 2 条。索引因此从约 29 KB 涨到 39 KB，`report-size.sh` 的 `MAX_INDEX_KB` 同步从 40 KB 上调到 52 KB。仍然搜不到的只剩「长文档正文中段、且不在任何标题里出现」的词，那是预期行为。

**改索引字段时必须同步 `fuseOpts.keys`**，否则多输出的字段搜不到、keys 里多写的字段则无效。

### ⑫ 主题外观与站点背景 — `00-theme.css` + `13-ornament.css` + `extend_head.html` 生成的 `css/bg-image.css`

风格叫「墨与蔷薇」：底色是墨（深色带一点紫，不是纯黑），强调是蔷薇红，次要强调是冷银紫；浅色主题也不是白纸，是冷调象牙配墨黑字。设计令牌集中在 `assets/css/extended/00-theme.css`（`00-` 前缀保证合并时排在最前，01~13 都建立在它上面）：只覆盖主题的 CSS 变量（配色、`--radius`）与少数全局选择器，不动主题组件；另加 `--accent` / `--accent-2` / `--accent-soft` / `--surface` / `--rule` / `--shadow-*` 几个自定义令牌供各组件复用。深色一律用 `[data-theme="dark"]`。

- **`--accent` 的门槛是「能不能当正文颜色」**：浅色 `#8c2f48` 对 `--theme` 7.4:1、深色 `#d89aab` 10.1:1，次要色 `--accent-2`（冷银紫）5.6:1。AA 的正文线是 4.5:1，**改色先按这条线卡**，不是「看着够亮」。
- **标题走衬线、正文保持黑体**（`02-typography.css` 末尾）：标题族一套系统衬线栈（Palatino / Songti SC / SimSun …），正文换衬线会掉可读性。**不下载中文字体**——一套思源宋体 5 MB 起，而它是每个页面都要加载的资源。
- **纯装饰单独一层**（`13-ornament.css`）：标题左侧短竖线、分隔线中央菱形、列表卡片左侧细线、页脚渐隐线、目录当前项高亮。判断标准是「删掉它页面只是变朴素，不该坏」——组件样式仍归 01~12 各自的文件。
- 圆角从主题默认收窄到 7px：硬朗线条是这套风格的一部分，12px 那套偏「卡片 App」。

**背景图不写死在 CSS 里**：唯一事实源是 `hugo.toml` 的 `[params.appearance]`，**两张分开**——`backgroundImage` 给深色主题（墨绒夜）、`backgroundImageLight` 给浅色主题（象牙纸）。`extend_head.html` 用 `resources.Get` 取到带子路径前缀的 `RelPermalink`，再由 `resources.FromString` 生成一张只含这两个变量的小 CSS 外链。于是模板里不写 `<style>`、CSS 里不硬编码 `/my-blog/`、换图只改一行配置；**两个键都留空即关闭背景**，退回纯色主题。

分两张是必须的：同一张夜色图压在 84% 的浅色蒙版下不是背景，是一块脏灰（换图时实测过——浅色页右上角留了一块明显的灰白光斑）。分主题之后任一主题只请求自己那张。

背景图 `assets/images/bg-velvet-night.webp`（1600×900，4 KB）与 `bg-ivory-paper.webp`（1600×900，3 KB）都是**程序生成的纯质感**：底渐变 + 斜纹 + 落瓣，没有具象元素——具象的东西压上 90% 的蒙版之后剩下的不是「月亮」而是一块灰白斑。为什么站点这边不上真实素材：蒙版 72%~92% 之下真图不可辨，而它是**每个页面**都要下载的资源，多花的字节看不到东西。两张由 `tools/backgrounds/make-backgrounds.py` 生成（随机种子固定，可复现；改色改密度就改末尾 `site_backgrounds()` 的参数，改完回页面截图核对，别只看生成图）。管理页那边是另一回事——面板只盖住中间，背景看得见，所以它用的是真实插画，见 `docs/admin.md` §20。

**为什么体积这么重要**：背景是**每个页面**都要下载的资源（`body::before` 的 CSS 背景，不能懒加载）。原 JPEG 191 KB 在 4 G 模拟下光它一项就占 521 ms，转 WebP q=70 后 55 KB；现在这两张是同一量级再降一个数量级（3~4 KB），因为图里已经没有细节可压。换图时**别退回 JPEG**，也别在背景里塞细节。

### ⑬ 阅读进度条 + 目录当前项高亮 — `assets/js/reading-progress.js` + `08-reader.css`

只在真正走单页模板的页面加载（`extend_head.html` 的判据与 Giscus 同源：`.Kind == "page"` 且排除 `archives`/`search` 两个独立 layout。`archives` 那条现在没有对象了——归档页 2026-09-15 删除——留着是为了它回来时不用再想起这件事）。脚本自建 `#reading-progress`（fixed 顶部 2px，用 `transform: scaleX()` 推进），并按「最后一个已越过的标题」给 `.toc a`、`.toc-rail a`（单页的左侧目录栏，见 ㉓）加 `.active`。

**不要用 `requestAnimationFrame` 做节流**：隐藏标签页里 rAF 不触发，切回来会拿到过期状态——`terms-filter.js` 已经踩过同一个坑，这里直接同步算。

**几何量必须缓存**：正文与每个目录项的绝对偏移只在「重新测量」时算一次，滚动路径上只做 `window.scrollY` 的算术。原来的写法每次 scroll 都要对正文调 `getBoundingClientRect()` 与 `offsetHeight`、再对每个目录项逐个取 rect，而最重的公式页有 1082 KB HTML / 1.68 万个 `<span>`。用 CDP 的 Performance 计数器量（`.shots/jank.py`，110 次滚动）：旧写法 `ScriptDuration` 0.019~0.020 s，缓存后 0.004~0.005 s，**滚动脚本开销降到 1/4**。失效时机是 `resize` / `load` / `document.fonts.ready` / `ResizeObserver(.post-single)`，最后一条是为了兜住「图片或字体迟到导致正文高度变了」。

**偏移排序后再扫描**：同一页上常同时有两个目录（正文顶部的折叠目录 + 左侧跟随目录，见 ㉓），两组指向同一批标题，拼在一起不再单调递增，而扫描逻辑是「遇到更大的 `top` 就 break」——不排序的话第一组一结束就收手，左侧目录永远不会亮（实测 `inlineActive: 1 / railActive: 0`）。`marks` 现在按 `top` 稳定排序，同一个标题上的两份目录由靠后出现的那份（左侧栏）拿到高亮。

### ⑭ 搜索快捷键与 `?q=` 预填 — `assets/js/search-shortcut.js`

- 任意页按 `Ctrl/⌘ + K`，或不在输入框内时按 `/` → 跳到搜索页；搜索页 URL 由 `extend_head.html` 用 `relLangURL` 填进 `<script data-search-url="…">`，站点换子路径不用改脚本。主题原生只有 `Alt + /`（accesskey）。
- 搜索页读 `?q=…` 预填输入框并自动出结果，于是任何页面/工具都能用链接直接发起搜索。
- **必须重试**：主题 `fastsearch.js` 在 `window.load` 之后才 fetch 索引，索引没就绪时派发的 `input` 事件会被静默丢弃（`performSearch` 里 `!fuse` 直接 return）。脚本按「结果是否出现」最多重试 7 次（约 1.6 s），一旦用户自己在输入框里打字就交出控制权。

### ⑮ 首页快捷入口与最近更新 — `_partials/index_profile.html`（整份覆盖）+ `09-home.css`

首页在 profileMode 下由主题 `list.html` 直接调用 `index_profile.html`，**没有任何 hook**，所以这一处是整份覆盖（见第 4 节）。与原版的差异只有三处：头像多取一张 2× 图供高分屏、快捷入口、最近更新；标题/副标题/社交图标/`profileMode.buttons` 保持主题原样。

- **快捷入口**复用主导航（跳过 `home`，取前 5 项），不维护第二份链接配置，导航改名自动同步。
- **最近更新**：`site.RegularPages` 按 `Lastmod` 倒序取前 `params.home.recentCount` 条（`0` 关闭），排除 `searchHidden` 与 archives/search；每行是「类型徽标 + 标题 + 月日」，类型文案由 `type-label.html` 提供——与相关内容区块共用同一份 `Type → i18n key` 映射，不再各写一份。`enableGitInfo = true` 让 `Lastmod` 有真实值。
- 主题 `profile-mode.css` 给 `.profile` 设了 `min-height: calc(100vh - …)`，加了内容会撑出很高的首屏，`09-home.css` 把它改成自然高度。

### ⑯ 课程规划与进度 — `_shortcodes/course-plan.html` + 课程主页的 `plan` 字段

课程主页正文里写一行 `{{< course-plan >}}`，「课程规划」那一节就变成「进度条 + 已发布/计划中对照表」：

- 数据源是课程主页 front matter 的 `plan` 列表（`weight` / `title` / `summary`），**不是**正文里的手写清单——手写清单没法判「哪几章真的建好了」。
- 已发布判定按 **`title` 与子章节标题逐字相同**（不是按 weight：实际课程会跳章，`chapter-02` 是规划里的第 3 条）。
- 未发布的条目压暗并标「计划中」；数字口径写在模板注释里，改文案改 `i18n/zh.toml` 的 `coursePlan*` 键。

### ⑰ 分层项目主页 — `layouts/projects/project-home.html` + `project-index.html`

`layout: "project-home"` 的项目 section 页不再走主题 `list.html`：页头（共用 `page-head.html`）→ 技术栈面板（`project-meta.html`，section 页没有自己的 tags 时取子孙标签并集）→ 子页目录（每项：序号、标题、描述、`N 篇文档 · 更新于 …`）→ 正文。

**为什么值得另开模板**：主题的 section 页只会把子页排成一列卡片，看不出层级与进度（哪个子项目写完了、各有几篇文档），也拿不到「技术栈 + 查看源码」面板（`project-meta.html` 原先只在走 `single.html` 的页面上注入）。

### ⑱ 列表卡片的计数 / 技术栈 chips — `card-chips.html` + 覆盖 `post_meta.html`

课程卡片显示「N 章 · M 篇材料」，项目卡片显示「N 个子项目 · M 篇文档」，根页（`content/<type>/<名字>/`）再带技术栈标签。

**为什么挂在 `post_meta.html`**：列表卡片的元信息整块由它产出，主题 `list.html` 没有别的 hook（`cover.html` 只带 `IsSingle` 标记，且要整份复制封面逻辑）。它**在详情页也会被调用**，所以详情页那份 chips 由 CSS 隐藏（`01-cards.css` 的 `.post-single .post-meta .card-chips`）——详情页已经有 `project-meta` 面板，标签在那里是重复信息。

技术栈只在「根页」显示：更深一层的文档卡片全都挂着同一组继承来的标签（cascade 下发），只是噪音。判定用目录深度，**注意 `.File.Dir` 在 Windows 上是反斜杠**（见 `traps.md` 第 4 节）。

### ⑲ 窄屏折叠导航 — `assets/js/nav-toggle.js` + `10-nav.css`

主题这份 PaperMod 的 `#menu` 在窄屏是 `flex-wrap` 换行，7 个菜单项折成两行、顶栏被顶高。脚本在窄屏插一个按钮把菜单收起来，点开才铺开；`Esc`、点空白、回到宽屏都会收起。

**纯渐进增强**：脚本跑起来才给 `<html>` 加 `.has-nav-toggle`，CSS 里的收起规则全挂在它下面——禁用 JS 时菜单照主题原样铺开，不会变成点不开的死菜单。

### ⑳ 列表卡片封面 — `tools/covers/make-covers.py`

封面是生成产物（渐变 + 细网格底纹 + 标签/标题/副标题），脚本是可复现的事实源：改标题配色只改脚本里的 `COVERS`，输出到 `assets/images/covers/*.webp`，front matter 里写 `cover.image: "images/covers/<名字>.webp"` 即生效。**不用外部图片**的原因和图标不同：封面只承担「卡片有视觉锚点」，自绘没有许可问题。

### ㉑ 数学工具库（课程卡片 + 正文引用弹窗）— `layouts/courses/{tools,toolcard}.html`、`_partials/{card-ref,toolbox-card,toolbox-teaser,toolbox-md}.html`、`assets/js/toolbox.js`、`11-toolbox.css`

数学课里「由【工具 1.4】」「定理 4.4」这类引用以前只能翻附录，现在是一套卡片库：

- **数据**：`data/math-toolbox.json`，由 `tools/course-import/import_course.py` 从课程项目生成（见 [`content.md` 第 9 节](content.md#9-课程内容从课程项目导入含数学工具库)）。
- **主页** `/courses/<课程>/toolbox/`（`layout: "tools"`）：只铺**索引卡**（类别徽章 + 名字 + 右下角编号），顶部按关键词与分组筛选。
- **卡片页** `/toolbox/<id>/`（`layout: "toolcard"`，id 形如 `tool-1-4`／`thm-4-4`）：完整卡片 —— 陈述、用途、折叠的证明。一卡一页是因为：80 张卡铺一页有 3 MB、超单页预算；顺带每张卡有了可分享的固定链接。
- **正文引用写名字，不写编号**：正文里写「由全方差律」「见 Fisher 引理」，导入脚本按名字表把它换成 `{{< tool "1.2" "全方差律" >}}` → `_partials/card-ref.html` 输出链接，点击由 `toolbox.js` 拦截、抓对应卡片页塞进弹窗（同一地址只抓一次）；**无 JS 时退化成普通链接**，跳到卡片页。名字表 = 工具库条目的标题 + 条目紧跟的 `<!-- 别名: … -->` 行，长名字优先，**每处出现都接线**。数学区、行内代码、既有链接、HTML 标签与**标题行**一律跳过：标题里插链接会让 `.TableOfContents` 冒出 `HAHAHUGOSHORTCODE372s2HBHB` 这类占位符（实测踩到，目录里当场可见）。
- **「工具 k.m」这套称呼已取消**：条目标题就是定理/定义的名字，编号只作卡片角落的定位小字（`.tb-num`），同时仍是稳定 id（`tool-1-4`）。正文里若还残留 `【工具 k.m】`，导入脚本报错退出（`STRAY_TOOL_REF`），不会静默漏掉。
- 卡片页不参与标签体系（`toolbox/_index.md` 的 `cascade` 清空 `tags`），也不进 sitemap 与搜索索引（`sitemap.disable` + `searchHidden`）。
- 卡内的 `[名字](#card-tool-1-1)` 会被 `toolbox-md.html` 在渲染后改写成目标卡片页地址（Hugo 会把纯 fragment 链接补成「当前页地址 + #锚点」）；卡片不引用自己。

### ㉒ 数学库（跨课程卡片索引，按数学分支三级拆分）— `content/library/_content.gotmpl` + `layouts/library/*` + `data/math-branches.yaml`

`/library/`（导航里排在首页之后）把各门课程的卡片按**数学分支**汇总成索引。它不新建内容，只是 ㉑ 那批卡片的第二个视图。**三级**：`/library/`（大类）→ `/library/<大类>/`（细分目录）→ `/library/<大类>/<细分>/`（卡片墙）。

- **数据**：仍是 `data/math-toolbox.json`，每张卡多三个字段 —— `course`（卡片属于哪门课）、`branch`（大类）与 `section`（细分）。归属规则写在 `data/math-branches.yaml`（**不是**生成产物）：`branches` 是**两级**结构（大类 → `sections` 细分，每个细分带一句 `summary`），`assign` 按 `cards > nums > groups > modules > courses` 取第一个命中，都没命中落到 `default`。调某张卡的归属改这张表，再重跑导入；导入时会校验细分 key 不重复、`assign` 与 `default` 都指向真实存在的细分（写错就报错退出，而不是在页面上静默错分）。**细分 key 现在还是 URL 的一段**（`/library/statistics/stat-ols/`），改 key = 改 URL。
- **页面由内容适配器生成**（`content/library/_content.gotmpl`，Hugo content adapter）：大类页与细分页**没有**对应的 md 文件，构建时从 `data/math-toolbox.json` 现算——分支表加一个大类就自动多一页，删一个就自动少一页，不存在「文件与表漂移」。写成 23 个 `_index.md` 就是把那张表抄第二遍，迟早对不上。适配器给页面的只是「身份」（两三个 key），名字、范围说明、计数、卡片清单全部由模板回表现取。
- **适配器只给四样 front matter**：`title`（分支名）、`description`（表里那句范围说明，`page-head.html` 渲染成页头描述）、`params.branch` / `params.section`（两个 key，模板回表取名字、计数与卡片）、`params.searchHidden`（导航页不进搜索索引与首页「最近更新」），细分页另给 `params.math`（卡片标题里有公式）。**`description` 必须写在顶层**：塞进 `params` 里不会成为 `.Description`，页面照常构建、页头直接空白（实测踩过）。
- **三个 layout 各管一级**：`layout: "library"`（总览，`content/library/_index.md`）、`layout: "library-branch"`（大类页：列本大类的细分 + 计数）、`layout: "library-section"`（细分页：铺本细分最多十几张索引卡）。大类页不放面包屑（主题自带的「主页 › 数学库」已经在页头，再写一遍就是同一行里出现两次「数学库」）；细分页放一条 `数学库 / 大类` 的路径，因为主题那份不知道「大类」这一级的存在。范围说明走 `description`，不再各写一个段落。
- **为什么拆**：原先一页铺 80 张索引卡 + 分支大纲，线上 4G 实测 DCL 494 ms / load 1.4 s、加载期一个 103 ms 长任务、滚动区 6588 px，而它承担的信息只是「有哪些大类」。拆开后 `/library/` 14 KB（原先 68.7 KB）、只列 3 张大类卡，**连 KaTeX 都不加载**（原先这页为 4 个公式名加载 `katex.min.css` + 6 个 woff2 共 107 KB）。索引页现在没有搜索框：卡片名本来就在站内搜索索引里（卡片页是 regular page），不必在库页里再实现一份。
- **空分支不出页面**：分支表里预置的大类若一张卡都没有（现在有「数学分析」「数值分析与科学计算」「最优化」），既不出卡片也不出页面；以后导入别的课程就自动出现。总览页因此现在只列 3 个大类。
- **细分页才是卡片墙**，交互沿用 `assets/js/toolbox.js`：点索引卡就地弹窗（按需抓卡片页），没有 JS 就直接跳卡片页。脚本的加载判据在 `extend_head.html`：`in (slice "tools" "toolcard") .Layout` **或 `hasPrefix .Layout "library"`**（三级同前缀，加一级不用回来改）；toc-rail 的排除判据同样按前缀写，两处一起改（见 ㉓）。总览页 / 大类页已经没有 `.tb-group` 与筛选条，筛选只服务工具库页；细分页不再需要搜索或筛选（最多 11 张卡）。
- **卡片页底部**给两个返回入口：「本课程工具库」与「数学库」。正文里的 `{{< tool/thm >}}` 引用在任何页面上都按卡片自己的 `course` 找到正确工具库（`card-ref.html` 的第二级查找），不再依赖「当前页属于哪门课」。
- **`searchHidden: true`**：三级页面都是导航页，不进搜索索引（`layouts/index.json`）也不进首页「最近更新」——首页那份 `RegularPages` 过滤本来就排除 `searchHidden`。

### ㉓ 单页的左侧跟随目录 — `_partials/toc-rail.html` + `assets/js/toc-rail.js` + `12-toc-rail.css`

点开任何一个有 h2/h3 的单页（课程材料页、项目文档页、文章、关于页）时，宽屏左侧有一栏跟随滚动的目录；窄屏不显示，仍用正文顶部那份折叠目录。2026-09-15 之前只对课程材料页生效，之后放开到全部单页——公式密集的项目文档页（`projects/cmc2026/**`）正是最需要它的一类页面。

- **范围**：`Kind == "page"` 且排除 `layout: toolcard` / `layout: library` 两个自定义 layout（它们不走主题 `single.html`，`extend_post_content.html` 根本不会被调用，页面本身也没有正文小标题）。判据同时写在 `extend_post_content.html`（渲染）、`extend_head.html`（脚本）与 `toc-rail.html` 内部对 `.TableOfContents` 的判据里，**三处要一起改**。放开前后的实测：挂上目录栏的页面由 9 个（全是课程材料页）增至 27 个（+18：项目文档页、关于页，含拆页新增的《问题三_参考实现》）。
- **目录内容**：Hugo 的 `.TableOfContents`（默认 h2–h3，正好对上课程材料页的 §x / §x.y，项目文档页用同一份），不用主题 `toc.html` 那份 Scratch 撑嵌套的自建目录。它的标题文本是**原始 Markdown**，所以还要 `replaceRE` 去掉 `$…$` 定界符（构建期渲染的 KaTeX 不会进目录，留着就是裸的 `$F$`）——注意 `replaceRE` 的返回值不是 `template.HTML`，末尾必须补 `| safeHTML`，否则整段目录被转义成文本（踩过）。
- **为什么由 JS 挪到 `<body>` 下**：`.post-single` 上的 `backdrop-filter` 会成为 fixed 后代的包含块，目录留在正文容器里就是「跟着正文滚」而不是跟随视口（实测滚动 2500px 后 top 由 170px 变成 -1943px）。`assets/js/toc-rail.js` 把 `#toc-rail` 移到 `body` 末尾并给 `body` 加 `.has-toc-rail`——**显示与否挂在这个类上**，所以没 JS 时目录栏不出现、正文顶部的折叠目录照旧，不会出现「两个都没有」。
- **为什么不能挂在 `extend_footer.html`**：主题 baseof 用 `partialCached "footer.html" . .Layout .Kind …`，同 (Layout, Kind) 的页面共用一份渲染结果——笔记页的 `.Type`、`.Section`、`.TableOfContents` 会串成**第一个被缓存页面**的那份（实测三个不同材料页拿到完全相同的调试值）。要页面相关内容就得用 `extend_post_content.html`（`partial`，逐页渲染）。
- **断点 1240px**：正文列 720px 居中，左右各留约 600px，240px 的目录栏 + 间距放得下，`left: max(16px, …)` 兜住临界宽度；宽屏下正文顶部那份折叠目录由 `body.has-toc-rail .post-single > .toc { display: none }` 收起。
- **当前小节高亮**沿用 `reading-progress.js`（选择器含 `.toc-rail a`，见 ⑬ 的排序说明）。

### ㉔ 装饰层（墨与蔷薇的细部）— `13-ornament.css`

标题左侧的短竖线、正文分隔线中央的菱形、列表卡片左侧的细线、页脚上沿的渐隐线、目录当前项的蔷薇色标记。单独成文件是为了让它**可以整体拿掉**：删掉本文件页面只是变朴素，不该坏——这就是判断一条规则该写进装饰层还是写进组件文件（01~12）的标准。配色令牌与背景层见 ⑫。

两个写法约定：装饰只用 `--accent` / `--accent-2` / `--accent-soft` / `--rule` 这几个令牌，不写死色值（深浅两套主题才自动跟随）；凡是会改盒模型的装饰（`border` / `padding`）都要换成不吃布局的写法（`inset box-shadow`）——目录项和卡片在 hover 时跳一下，就是这里出的错。

## 4. 四处有意的主题模板覆盖

除上述 hook 之外，仓库里有四处**有意**覆盖主题（是对「不复制主题模板」的例外）。`extend_head.html` / `extend_footer.html` / `extend_post_content.html` / `comments.html` 是主题设计好的 hook，覆盖它们不算在内。

1. `layouts/courses/course.html`（`layout: "course"`）与 `layouts/courses/chapter.html`（`layout: "chapter"`）：列表页没有任何 hook，而这两页分别需要自动章节目录与入口卡片。两个模板都很小、只复用主题 partial（`breadcrumbs.html`/`anchored_headings.html`，页头共用 `course-header.html`），且只有显式写了 `layout` 的页面才命中，不影响 `/courses/` 列表页与文章页。**改外观请优先改 `04-course.css`**
2. `layouts/index.json`：该模板无 hook 可挂，而正文截断无法从配置实现
3. `layouts/_partials/index_profile.html`：首页在 profileMode 下由主题 `list.html` 直接调用它，没有 hook 可挂，而首页需要「快捷入口 + 最近更新」两块内容。改这一处时对照 `themes/PaperMod/layouts/_partials/index_profile.html`，确认主题侧是否有新变化需要合并
4. `layouts/_partials/post_meta.html`：**唯一一处「复制主题 partial 再加一行」**（第 ⑱ 项）。它是列表卡片与详情页共用的元信息块，没有 hook 可挂，而卡片要一块计数/标签。与前三处不同：这里**逐字保留**主题实现，只在末尾调用 `card-chips.html`，主题升级时对照 diff 手工合并即可。若哪天主题给它加了 hook，优先换回 hook

## 5. 总览页标题

`/tags/`、`/categories/`、`/series/` 三个总览页的标题由 `content/<taxonomy>/_index.md` 提供。**不要**再新建 `content/tags.md` 之类带 `url` 的普通页面去覆盖它们——那会把 `kind=taxonomy` 的列表页顶替成普通文章页（曾因此让「标签」入口整页空白）。

## 6. 性能账（2026-09-15 实测）

量法：`D:\blog\.shots\perf.py`（自管 Edge headless + CDP，`--throttle 4g` 按 4 Mbps/70 ms 模拟）与 `.shots/jank.py`（滚动期间读 CDP Performance 计数器）。**下面每个数字都要能复跑**，改完外观/资源后重跑一次对账。

| 指标 | 改前 | 改后 |
|---|---|---|
| 首页 4 G 传输（含 dev 的 `livereload.js` 78.6 KB） | 321.3 KB · load 828 ms | 195.4 KB · load 581 ms |
| 首页 4 G 传输（只算线上会下的） | 242.7 KB | 116.8 KB |
| 站点背景图 | 191.4 KB（JPEG） | 65.5 KB（WebP） |
| `static/favicon.ico` | 3.3 KB | 3.9 KB（16/32 两帧；256 帧挪去了管理页图标） |
| `static/apple-touch-icon.png` | 5.7 KB | 14 KB（180×180 真彩原本 61 KB，量化到 256 色） |
| 整站输出（`report-size.sh`） | 9833 KB | 18983 KB（新增「回归分析」课程：3 页笔记 + 作业 + 实验 + 80 张工具卡页；预算 12 → 24 MB） |
| 滚动脚本开销（最重页，110 次滚动） | 0.019~0.020 s | 0.004~0.005 s |

### 2026-09-15 追加五：数学库 `/library/` 拆成三级（一页 80 张卡 → 一页一张目录）

线上量到的病：`/library/` 单页铺 80 张索引卡 + 分支大纲，线上 4 G 实测（`.shots/startjank.py --arms libperf-arms-live.json`）DCL 494 ms / load 1405 ms / 加载期一个 **103 ms** 长任务 / 滚动区 6588 px，而它承担的信息只是「有哪些大类」。

改法与拆法见 ㉒。**前后对账用同一个方法量**（真窗口 + CDP 4 G 节流，`startjank.py --arms .shots/libperf-before-after.json`）：改前那份不是旧数据，是用 `git worktree add --detach D:/blog/.shots/before-lib HEAD` 把已发布的站点单独构建、另起一个 `serve_public.py` 量出来的（本机 TTFB 两边都是 4 ms，可直接比）。

| 页面（4 G 节流） | HTML | DOM | DCL | load | 长任务 | 打开后 0–1 s 的掉帧 |
|---|---|---|---|---|---|---|
| 改前 `/library/`（80 张卡一页） | 67 KB | 777 | 498 ms | 670 ms | **119 ms** | 4 帧 > 7 ms，max 121 ms |
| 改后 `/library/`（3 张大类卡） | **11 KB** | **134** | 365 ms | 473 ms | 无 | 1 帧 > 25 ms，max 42 ms |
| 改后 `/library/statistics/`（12 个细分） | 15 KB | 184 | 291 ms | 291 ms | 无 | max 30 ms |
| 改后 `/library/statistics/stat-properties/`（最重细分，11 张卡） | 19 KB | 211 | 286 ms | 425 ms | 无 | 0 帧 > 7 ms |

另外两个附带收益：滚动区由 6588 px 变成**一屏**（`scrolled 0`）；`/library/` 不再加载 KaTeX（原先为 4 个公式名付 `katex.min.css` 23 KB + 6 个 woff2 107 KB，现在只有细分页付）。整站输出 18983 → 18480 KB（`report-size.sh`），搜索索引 0 条 library 记录（三级页面都 `searchHidden`，卡片名本来就在索引里）。

### 最重的页面到底重在哪

`projects/cmc2026/problem-03/问题三/`：raw HTML **1082 KB**（gzip 133 KB）、DOM **23561 个元素**（其中 `<span>` 16820 个、`<math>` 751 个）、4 G 下 DCL **3.4 s**。整站 HTML 占总输出的 91%。**这不是可以靠压缩解决的部分**——KaTeX 的 HTML 排版树本身就是这么多节点。

试过并**否决**的两条路，别再重复试：

- `render-passthrough.html` 的 `output` 从 `htmlAndMathml` 改成 `html`：整站 9957 → 8065 KB（−19%），最重页 1082 → 902 KB（−17%），DOM 只少 4%。代价是丢掉 MathML，屏幕阅读器与复制公式都退化。**性价比不够，保持 `htmlAndMathml`。**
- `.post-single` 的 `backdrop-filter: blur(8px)` 是**页面那么高**的元素，本来怀疑它是滚动卡顿源。用 `jank.py` 在 4 G 与本机各量了一轮，`TaskDuration` / `LayoutCount` / 帧间隔都测不出差异（headless 下 rAF 帧间隔恒定 6.05 ms，该探针对合成器侧的开销不敏感）。**测不出问题就不动它**——它同时承担正文可读性。
- **KaTeX 字形预加载**（`<link rel=preload as=font>` 按本页出现的类名挑字形）：本地延迟模型（`.shots/serve_delay.py`，每请求 +300 ms，HTTP/1.1）下**无效**——首个字体请求确实从 686 ms 提前到 333 ms，但最后一个字体到达时间不变（1265 → 1252 ms），FCP 反而从 802 退到 932 ms（4 次重复，离散 ±10 ms）。原因是浏览器对单主机只有 6 条连接，9 个字形（133 KB）一起挤进去，把阻断首屏的 CSS 往后排。生产的 Fastly 走 HTTP/2 多路复用，不会再排队，**但线上没有实测，所以没合并**（真要试：合并后跑一次 `.shots/startjank.py --arms <线上 arms>` 对 FCP 与字体到达时间，不达标就撤）。

### 2026-09-15 追加四：拆掉最重页的附录

`projects/cmc2026/problem-03/问题三/` 原来 1082 KB / 23566 元素，其中附录 A 伪代码 + 附录 B Python 参考实现（4 个 `<pre>`、1245 行）单独占 380 KB / 7321 元素。按 § 拆页先例搬成《问题三_参考实现》（`math: false`，不加载 KaTeX 样式与字形）：

| | 主页面前 | 主页面后 | 新页 |
|---|---|---|---|
| raw HTML | 1082 KB | **658 KB** | 454 KB |
| DOM 元素 | 23566 | **16222** | 7597 |
| 最长长任务（headless，warm） | 97 ms | **64 ms**（模型估 60~100，见 `.shots/q3-split-plan.md`） | 52 ms |
| 该页排序 | 全站第 1 重 | 第 8 重 | — |

同一手术对 M1 三页笔记与作业页还有余量（`courses/regression-analysis/chapter-01/`：作业 1060 KB、notes-02 992 KB、notes 977 KB，现已是全站最重的三页）。

### 还剩下的（已知、暂不动）

**2026-09-15 追加**：一门公式密集的课程（回归分析 M1）让整站 +9.2 MB —— 最重的单页 1082 KB（M1 笔记按 § 拆成 3 页才压回预算内），80 张工具卡页各约 40 KB 页面框架 + 卡片内容。单页预算不变（1638 KB），整站预算 12 → 24 MB。**没有**为了压体积去掉 MathML（理由见上面「试过并否决」）。

- KaTeX 在公式页**按需**加载 woff2 字形（`katex.min.css` 里 20 个 `@font-face`，浏览器只取页面真正用到的那几个）：M1 笔记页最多见 9 个共 **133 KB**（`Math-Italic`、`Main-Bold`、`Math-BoldItalic`、`Caligraphic`、`AMS`、`Size1~3` 等），`katex.min.css` 23 KB。早期记的「6 个 107 KB」是 `startjank.py` 的 resources 列表被截断后的低估，准数请用 `.shots/fonttruth.py` 量 `document.fonts`。只在真有公式的页面加载（`extend_head.html` 的三条件判据）。要再降只能做字体子集化，收益不确定、维护成本高。
- 每个页面都多一次 59 字节的 `css/bg-image.css`（渲染阻塞）。它和主样式表是**并行**下载的（不是串行），FCP 实测没有差别，所以不值得为它把背景图 URL 硬编码进 CSS 或往模板里写 `<style>`。

### 打开页面头几秒的卡顿（2026-09-15 追加三）

稳态早就够了：真窗口、165 Hz（帧预算 6.06 ms）下持续滚动，3 s 之后 p99 6.2–6.3 ms、max 6.3 ms、**没有一帧超过 7 ms**。掉帧全部集中在打开页面后的 1–3 s。量法 `D:\blog\.shots\startjank.py`（`addScriptToEvaluateOnNewDocument` 注入到 document 起点，导航后立刻逐帧滚动，同时收 longtask / layout-shift / 资源时刻）。

| 场景（重页 1082 KB HTML、23566 个元素） | 主线程长任务 | 滚动帧 |
|---|---|---|
| 本地，首次导航 | 261 ms（起始 35 ms），另 110 + 63 ms | 0–1 s 只有 79 帧，3 帧 >25 ms、max 267 ms |
| 本地，缓存热之后 | 89~97 ms | 0–1 s max 103~109 ms、3~5 帧 >25 ms |
| 线上 4G（3 次同配置） | 最长 103~287 ms | DCL 1.3~4.3 s、load 1.5~7.0 s、CLS 0.11~0.20（>0.1 已是 CWV 差档） |
| 加载完成之后（本地 load 0.7 s） | — | p99 6.2 ms、max 6.3 ms、0 帧超 7 ms |
| 同上，但 4G 慢臂（load 7.0 s） | — | **连 >3 s 的窗口都不干净：p99 42.5 ms、6 帧 >25 ms、max 145.5 ms** |

长任务与 HTML 体量成正比，而且是**解析本身**：`content-visibility: auto` 加在正文块上对初始长任务毫无收益（95 → 89~95 ms，噪声内）——它省掉的是布局，省不掉建 2.3 万个节点。

线上那段还叠了 KaTeX 字体晚到：6 个 woff2 的发起来源是 `katex.min.css`（`initiatorType: css`），慢网下 0.7~3.8 s 才到货，到货即重排（layout-shift 源 `SPAN.base`，单次 0.066~0.088）。`<link rel=preload as=font>` 能把它们提到与 CSS 并行，但**没测出干净数字**：同配置的两次 4G 运行 DCL 差 3 s，链路抖动盖过效应。别在文档里写「提升 X%」。

卡顿区间不是固定的「头 3 秒」，它跟着 load 走：本地 0.7 s 就结束，4G 慢网能拖到 7 s。要再压这一段只剩两条：把大页拆小（唯一直接打掉解析长任务的路径，参照 M1 笔记按 § 拆页的先例），以及别在打开后立刻滚——3 s 后整站是 165 fps 锁定的。

### 滚动流畅度：合成器侧实测（2026-09-15 追加二）

量法：`D:\blog\.shots\scrollcost.py`（headless，逐个 CSS 变体注入，出 `RasterTask` / `DirectRenderer::DrawFrame` 总量）与 `frameab.py`（真窗口 2560×1600 @165 Hz，rAF 帧间隔 → 掉帧数）。**旧的 `jank.py` 只量主线程计数器，看不见合成器侧**，所以前面「backdrop-filter 测不出代价」的判断按下面这组数字修正——代价是真的，只是没到掉帧。

| 项 | 数字 |
|---|---|
| `.post-single` 的 `blur(8px)` 占 `DirectRenderer::DrawFrame` | 88.3 → 33.8 ms / 333 帧（去掉后 −61%）；`RasterTask` 24.3 → 2.4 ms |
| 真机全页滚动（49195 px，dpr2 @165 Hz） | 408 帧：p50 6.1 / p90 6.2 / p99 6.25 ms，只有 1~2 帧超过一帧预算（6.06 ms） |
| 同上、去掉卡片 blur | 410 帧，p50/p99 一样，同样 1 帧 → **不掉帧** |
| 换成不透明底的视觉代价（`--surface` .94 浅 / .92 深） | 浅色 max 7/255、mean 1.11；深色 max 7/255、mean 0.33 |

结论：卡片毛玻璃的合成器开销真实存在（占合成帧绘制时间六成），但在本机 165 Hz 上仍锁在 6.1 ms/帧，**不值得为性能牺牲它的观感**。若哪天要压手机/省电模式的余量，改法是去掉 `.post-single` 的 `backdrop-filter` 并把 `--surface` 提到 94%（浅）/92%（深）——像素级几乎不可见。

试过无收益：把 `content-visibility: auto` 加在正文块上（`RasterTask` 7.8 vs 6.1 ms，反而更差，连续文本没有可跳过的排版工作）。

量滚动卡顿的两个坑（已写进脚本头注释）：真窗口不加 `--disable-features=CalculateNativeWinOcclusion`，被别的窗口盖住时 `visibilityState=hidden`、rAF 完全冻结（会得到「0 帧」这种假流畅）；Windows 下 `asyncio.sleep(0.008)` 的真实粒度约 15.6 ms，驱不动合成器滚动，改用帧内 `scrollBy({behavior:'instant'})`，并先关掉站点全局的 `scroll-behavior: smooth`（否则逐帧 scrollBy 被平滑动画吃掉，0.9 s 只挪 180 px）。

