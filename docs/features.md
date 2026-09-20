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

风格叫「墨与蔷薇」：底色是墨（深色带一点紫，不是纯黑），强调是蔷薇红，次要强调是冷银紫；浅色主题也不是白纸，是冷调象牙配墨黑字。设计令牌集中在 `assets/css/extended/00-theme.css`（`00-` 前缀保证合并时排在最前，01~13 都建立在它上面）：只覆盖主题的 CSS 变量（配色、`--radius`）与少数全局选择器，不动主题组件；另加 `--accent` / `--accent-2` / `--accent-soft` / `--surface` / `--glass-*`（局部玻璃面的三个旋钮，见本节末尾）/ `--rule` / `--edge` / `--shadow-*` 几个自定义令牌供各组件复用。**类别色板**（`--k-*`，卡片按 定义/定理/命题/… 分色用）也在这里，理由与数值见 ㉑。深色一律用 `[data-theme="dark"]`。

**三个「边」令牌分工**（2026-09-19 加了 `--edge` 之后定死的口径，别混用）：`--surface-border`（浅 .09 / 深 .08）是**面板与卡片的边**，几乎看不见、形状靠 `--surface` 那个面自己撑；`--border` 是**主题自带的**那套中性灰，留给主题组件（如搜索框、正文 `pre`、表格），本站不去动它；`--edge`（浅 `rgba(22,20,27,.20)` / 深 `rgba(255,255,255,.18)`，约 1.4:1）是**控件与面板的边**——按钮、顶栏图标、分页、胶囊、首页的两块面板都用它，参照系是 GitHub 的边框（#d0d7de / 白 ≈ 1.35:1），「清楚但不抢戏」就在这一档。`--edge` **不承载文字对比度**，所以不进下面那张表。
**它也不满足 WCAG 1.4.11 对「控件边界」的 3:1** —— 这条是有意的：控件靠里面的文字/图标就能识别（图标是 `--primary`，正文级对比度），这道淡边是装饰；**「这个控件现在可交互」的状态指示交给悬停/聚焦态**，那一档是 `--accent`（浅 7.4:1 / 深 10.1:1），远超 3:1。改 `--edge` 的浓淡时按这条想：它只影响「看得出形状」，别把它当成状态指示器。
**用哪种手法画边也有分工**：元素本来就有 `border` 的（`.card-chip`、`.lt-*`、`.tb-chip`、`.project-tech-tag`、`.course-badge`、`.not-found-links a`）直接改 `border-color`；本来没有 `border` 的（导航项、词条胶囊、分页、返回顶部、复制按钮）**一律用 `box-shadow` 画环、不用 `border`** —— `border` 会占进盒尺寸（每项 +2px），在导航这种宽度卡到像素级、胶囊这种 flex-wrap 一行排满的地方都会让布局跟着动（导航那份配等式见 ㊱，踩过）。悬停/聚焦一律换成 `--accent`。
**首页那两块面板用 `--edge`，其它面板（`.post-single`、`.page-header`、`.toc-rail`、`.course-home > .post-content`）维持 `--surface-border`** —— 这是有意保留的差别，不是漏改：后者不直接压在照片上（`.page-header`/`.toc-rail` 底下是壁纸但面板自身够厚），而首页那两块是浮在强对比插画上的新元素，需要一点边界；顺带不扩大改动面。要统一时改这几处的 `border-color` 即可。

**面板的「透亮度」是两个数配出来的**：`--surface` 的不透明度（背景能透过来多少）与 `backdrop-filter` 的 `blur`（透过来清不清楚）。2026-09-19 把浅色从 `.80` 降到 `.70`、深色 `.76` → `.72`，同时把 blur 从 8px 降到 5px（顶栏 10 → 6、首页条 6 → 4）——**降 blur 不损失对比度、只省合成开销，降不透明度会**，所以两者要分开想，改完按 ⑫ 的量法复测面板内文字（实测最坏：浅色正文 10.65 / 次级 5.08，深色正文 8.59 / 次级 5.15，量法是隐藏面板直接子元素后扫区域取最坏像素）。**这两个数当日晚些又变了**（`--surface` 最终 .80、blur 24px），原因是蒙版被撤薄 —— 见本节后面「玻璃质感版」。

- **`--accent` 的门槛是「能不能当正文颜色」**：浅色 `#8c2f48` 对 `--theme` 7.4:1、深色 `#d89aab` 10.1:1，次要色 `--accent-2`（冷银紫）5.6:1。AA 的正文线是 4.5:1，**改色先按这条线卡**，不是「看着够亮」。
- **标题走衬线、正文保持黑体**（`02-typography.css` 末尾）：标题族一套系统衬线栈（Palatino / Songti SC / SimSun …），正文换衬线会掉可读性。**不下载中文字体**——一套思源宋体 5 MB 起，而它是每个页面都要加载的资源。
- **纯装饰单独一层**（`13-ornament.css`）：标题左侧短竖线、分隔线中央菱形、列表卡片左侧细线、页脚渐隐线、目录当前项高亮。判断标准是「删掉它页面只是变朴素，不该坏」——组件样式仍归 01~12 各自的文件。
- 圆角从主题默认收窄到 7px：硬朗线条是这套风格的一部分，12px 那套偏「卡片 App」。

**背景是「可切换的多套」**：唯一事实源是 `hugo.toml` 的 `[params.appearance].presets`（一个数组，每套一组 `id`/`name`/`light`/`dark`，可选 `position` 与 `maskLight`/`maskDark`），`defaultPreset` 指名无 JS 时用哪套。`extend_head.html` 用 `resources.Get` 取到带子路径前缀的 `RelPermalink`，再由 `resources.FromString` 生成一张只含 CSS 变量的外链 `css/bg-image.css`：每个预设一个 `:root[data-bg="<id>"]` 块，**默认套的块同时也是裸 `:root`**（`sel` 写成 `:root,:root[data-bg="girl"]`），所以禁 JS、以及首屏脚本执行前，渲染出来的就是默认套。于是模板里不写 `<style>`、CSS 里不硬编码 `/my-blog/`、换图只改配置；**`presets` 留空即关闭背景**（此时整张 CSS 不生成，`var()` 求值失败让 `background-image` 回落到 `none`，正是该有的样子）。浏览器**只请求当前生效的那一张**：没有被 `var()` 求值的 URL 不会下载。

**每个预设的变量必须写全**（缺图写 `none`，缺 `position`/蒙版用模板里的兜底值）。不写全会得到「两套混着显示」：某套只给了 `dark` 而没给 `--bg-image-light:none`，它在浅色主题下就会继承默认套的浅色图。这条是生成逻辑里最容易改坏的地方，见 [`traps.md`](traps.md) 的症状表。

**切换靠 `<html data-bg="<套 id>">`**（与明暗的 `data-theme` 平行，属性选择器 0,2,0 盖得住 `:root` 的 0,1,0），偏好存 `localStorage['pref-bg']`，按钮由 `assets/js/bg-switch.js` 注入到顶栏 `.logo-switches` 里明暗按钮之后（与明暗按钮同一个位置、复用主题的 `.theme-toggle` 类拿它的内边距，见 `18-bg-switch.css`）。三处细节：

- **按钮由 JS 注入而不是写进模板**：没有 JS 时它根本不存在，不会留下一个点不动的控件；而写进模板就得覆盖主题的 `header.html`（AGENTS 规则 5 不允许）。`presets` 只有一套时既不输出脚本也不接线。
- **`data-bg` 必须在首次绘制前写好**，否则会先按默认套下一张图、再换成访客存的那张——白下载一百来 KB 还闪一下。为此 `extend_head.html` 里内联了一小段脚本（AGENTS 规则 6 的唯一例外，登记在 [`traps.md`](traps.md)），与主题处理 `pref-theme` 的那段位置对齐。id 清单写成 `"|id1|id2|"` 再配 `"|"+p+"|"` 做精确比较——**别改成拼数组字面量或塞 `jsonify`**，`html/template` 会把 JS 上下文里的字符串再转义一次，两种写法都不报错但都拿不到数组（前者永远不匹配 = 偏好刷新即丢，后者退化成子串匹配）。
- **无 JS / 首屏前 = 默认套**，按钮的文案（`bgSwitchLabel` / `bgSwitchAnnounce`）经 `data-*` 传给脚本；切换后写进一个 `.sr-only` 的 `role="status"` 节点播报，因为背景切换是纯视觉变化。

**切换的观感与「切过去要不要等」（2026-09-19 新增，`bg-switch.js` 两条）**：

- **空闲预取另一套**：加载完成、浏览器空闲且**页面在前台**时，把「另一套 + 当前主题」那一张用 `new Image()` 取回来并 `decode()` —— 点切换时图已在解码缓存里，是秒切。跳过三种情况：`navigator.connection.saveData`、`effectiveType` 是 2g/3g（桌面浏览器基本不报这个值，尽力而为）、以及页面在后台（改为 `visibilitychange` 回到前台时再补）。明暗按钮改的是 `data-theme`，所以用 `MutationObserver` 盯着它——换了主题，「另一套那一张」就换成另一张图了。
  - 图片来源是**模板给**的：`extend_head.html` 把每套两个主题的指纹 URL 一并写进现有的 `data-presets` JSON（每页多约 110 字节/套）。脚本不自己拼 URL —— 指纹在构建期算，JS 拼不出来。
  - **代价要认清**：从不切换背景的访客也会多下一张（**日间 63 KB / 夜间 128 KB**，对照：默认套自己那张是 93 KB / 137 KB）。只在空闲且可见时发生，所以不推迟 `load`；实测 4G 首页传输因此从约 232 KB 升到 295 KB（`../lab/shots/perf-home-4g*.json`）。想收可以改两处：只对非触屏预取、或把 `onIdle` 的延迟拉长。
- **切换做交叉淡入，而不是硬切**：`background-image` 是离散属性、过渡不插值，所以做法是——点击时把**当前 `body::before` 的已解析背景栈**（`getComputedStyle(body, '::before')` 的 `backgroundImage/Size/Position/Repeat`，蒙版渐变与图片 URL 都在里面）快照到一个临时 `<div class="bg-ghost">` 上，等目标图 `decode()` 就绪后改 `data-bg`，再让 ghost 从 1 淡到 0（250ms，样式在 `00-theme.css`）。**不在 CSS 里抄第二份背景栈**：抄的那份迟早与 `::before` 漂移。
  - 层级：ghost 是 `body` 的子节点、与 `body::before` 同为 `z-index: -1`，按树序绘制 ⇒ 它画在**旧壁纸之上、玻璃质感层（`body::after`）之下**，所以淡出期间质感层不动、只有壁纸在换。实测的中段帧见 `../lab/shots/bgfade/vis-1.png`（新旧两张叠在一起，正文与导航清晰压在画面上）。
  - 失败与降级都退回原来的硬切：`prefers-reduced-motion: reduce`、`presets` 只有一套、`::before` 读不到背景（背景关掉）三种情况**根本不建 ghost**。连点：上一层的淡出立刻收掉，不叠层（爆发点击算作一步）。
  - **等待期间不露底色**：ghost 从插入起就盖着旧图，它下面的 `::before` 也还是旧图；目标图最多等 600ms，超时就照切（宁可轻微跳一下，也不要点了没反应）。
  - **`afterPaint` 必须「rAF 优先、定时器兜底」**：标签页在后台时 `requestAnimationFrame` 完全不跑（实测踩到：切换停在中途、ghost 留在页面上、`data-bg` 一直不换），所以 rAF 之后还得有一个 120ms 的定时器兜底；它要的只是「ghost 先被画过一次」，否则浏览器会认为前后样式属于同一帧、过渡不成立。
- **试过 preload 当前那张图，结论是「不采纳」**（2026-09-19）：给「当前套 + 当前主题」那张发 `<link rel=preload as=image>` 确实能让请求**确定性提前约 240 ms**（4G 实测：请求起点 343/345/343/333 → 112/90/102/101 ms，四跑一致），但**壁纸真正到货的时间没变** —— 慢链路上带宽才是瓶颈，提前开始的代价是下载被同期的 HTML/CSS 挤长（base 343+346 ms ≈ preload 90+601 ms），而 FCP 那点差别完全落在同一台机器 ±150 ms 的轮间噪声里（base FCP 348~572、preload 340~524）。把 preload 放到 `<head>` **开头**还会和渲染关键资源抢队首，出现 DCL 430 → 584 ms 的反效果（放到样式表之后才平）。
  - 判据与既有先例一致：KaTeX 字形预加载当初也是「本地有效但收益不可信」→ 未合并（见下面第 6 节）。将来要再试，先决条件是**换一个发现延迟真的占主导的环境**（低延迟 + 高带宽，或线上 CDN），并且必须多轮交替测量看中位数，别拿单次差值下结论。
  - 证据：`../lab/shots/home/perf-preload-ab.json`（head 与 tail 两种摆放各一次）与 `../lab/shots/home/perf-preload-rep.json`（tail 摆放重复一对，逐次数字在内）。

**每套两张图是必须的**：同一张夜色图压在 84% 的浅色蒙版下不是背景，是一块脏灰（换图时实测过——浅色页右上角留了一块明显的灰白光斑）。分主题之后任一主题只请求自己那张。

**蒙版数值跟着图走，所以放在 `hugo.toml` 里而不是 CSS 里**：`00-theme.css` 只留渐变的形状（三段：顶 0% / 中 52% / 底 100%，颜色取主题底色），三档 alpha 与 `position` 由 `extend_head.html` 逐套生成成 `--bg-mask-light-1..3` / `--bg-mask-dark-1..3` / `--bg-position`。理由是实测出来的：城市套是实拍照片（大团积云边缘、亮窗对暗天，都是小尺度明暗对比），`.46/.60/.76` 就能压住；而「黑长直少女」套的人物是深色块，同一批测量点会掉到 3.68:1，必须压到 `.80/.88/.93`。`00-theme.css` 那边**刻意不给这些变量写 `var()` 兜底**，免得出现第二份「默认数值」。

**取景 `position` 也不是随便填的**：视口比 16:9 窄时（几乎全部设备，实测 375px 宽的手机）`cover` 是按高度铺满、**横向裁掉两边，只剩约 26% 的图片宽度**。所以少女套写成 `78% 25%` 把人挪进可视窗口——两张图的人物分别在横向 66% 与 76% 处，取 78% 时窗口落在 [58%, 84%]，两个都在里面；沿用默认的 `center` 就会把人物整个裁掉（城市套无此问题，它的画面横向是均匀的天际线）。

**城市套的两张是同一座城市、两个时刻**：夜间是上暗下亮的墨紫 + 月亮 + 亮窗城市，日间是亮天 + 大团积云 + 暗色天际线。切换主题的观感因此是「换了个时辰」而不是「换了张壁纸」（少女套沿用同一思路，见下）。

深色主题用的是**真图**：`assets/images/bg-night-city.webp`（1600×900，127 KB，夜景城市 + 星空）。蒙版 `.54→.84`——原来的 `.72→.92` 把真图压没了，那正是「看不出有背景」的原因。放宽是安全的：正文可读性由 `.post-single` / `.page-header` 的 `--surface`（2026-09-19 定稿：浅色与深色都是 **80%** 不透明 + `backdrop-filter: saturate(135%) blur(24px)`；为什么从 62% 提回来见下面的「玻璃质感版」）与列表卡片自己承担，不靠这层蒙版。**代价要认清**：127 KB 对一张每页都下载的资源不算小（纯质感图是 4 KB），换来的是首屏与页面边缘真的有气氛。出处：Wallhaven `wallhaven.cc/w/wy6vqx`（画师作品，个人使用），源图压到 1600 宽存 `tools/backgrounds/source-night-city.jpg`（358 KB），由 `make-backgrounds.py` 的 `city_background()` 处理。

**另有一版把黑发少女叠在城市上的合成图**（Wallhaven `wallhaven.cc/w/6lwmy7`，源切片 `source-lady-slice.webp`，函数 `city_lady_background()`）——上线后撤回了：压在蒙版下她显得突兀。当时把「人物」这个位置交给了右下角的看板娘（见 ㉕）。**2026-09-19 起人物以**「黑长直少女」套**的形式回来了**（单独一套、单独一套蒙版，见下），看板娘仍然保留，于是「人是人、背景是背景」这条不再是唯一做法。合成版文件 `bg-night-city-lady.webp` 与脚本都留着，想切回去只改 `hugo.toml` 一行。

**（下面是已撤回那版的留档，做法本身仍有参考价值）人物是叠上去的，不是抠干净的**：抠图（GrabCut）会把人物周围一大块夜空/山体一起带下来，抠太干净又会出现一圈贴纸边。实际做法是「大羽化 + 冷调统一」（椭圆 inset 0.24、高斯 38、蓝通道 +14）——只让白裙、黑发和提灯这几个高对比部分浮出来，被带下来的那点背景在城市夜景的暗部里反而成了「她站的山坡」。调参时别只看合成图，要看**压过蒙版的页面截图**：蒙版会把中低对比的部分直接吃掉，合成图上「还行」的东西在页面上可能就是没有。

浅色主题**2026-09-18 起也是真图**：`assets/images/bg-daylight-city.webp`（1600×900，60 KB，日间城市 + 积云），`make-backgrounds.py` 的 `daylight_city_background()` 处理，源图 `source-daylight-city.jpg`（2048×1365，346 KB，Unsplash / Carli Jean，`unsplash.com/photos/Gk6YgzmrLgM`，Unsplash License；原图 5000×3333 压到 2048 宽存，与夜城源图 358 KB 同量级）。取景**贴底**裁到 16:9：`background-position` 是 `center 30%`，窄高视口里露出来的是图上缘，而天际线本来就靠下，不贴底裁会被顶出去。只做轻微去饱和（`.86`）与 7% 主题底色混合，不重绘。

**它为什么压得住蒙版**：上半张是大团积云的**边缘**，下半张是牙签一样细的天际线轮廓——都是小尺度明暗对比。夜景那张靠的也是同一件事（「亮窗对暗天」）。反过来，一整块具象的东西（月亮、人物、大片纯色天空）压到 55~85% 就只剩一块灰白斑，这是早先试真图和具象插画失败的原因，经验写在 `make-backgrounds.py` 的文件头与 `skyline()` 的注释里。**顺带把浅色蒙版从 `.55→.85` 调薄到 `.46→.60→.76`**：照片进来之后旧的薄厚只够看见一层灰（依据见下面的对比度实测）。

**「黑长直少女」套（2026-09-19 新增，当前是默认套）**：`bg-daylight-girl.webp`（92 KB）/ `bg-night-girl.webp`（137 KB），由 `make-backgrounds.py` 的 `girl_backgrounds()` 从 `source-girl-day.jpg` / `source-girl-night.jpg` 生成。两张是同一母题的日/夜对照，与城市套同理——都是「少女 + 城市全景 + 天空」：日间是撑透明伞站在山坡上俯瞰海湾城市，夜间是屋顶上看星空下的夜城，人物分别在画面横向 66% / 76% 处，所以切主题时她不跳位置。素材从 safebooru 按 `black_hair long_hair rating:safe` 收的一批候选中挑出（抓取与筛选脚本在仓库外的 `../lab/shots/pick-girl-bg.py` 与 `finalists.py`，接触表留在 `../lab/shots/girlbg/`）。出处都是同人插画、版权在画师手里：pixiv `artworks/87155937`（日）与 `artworks/77002104`（夜），个人非商业使用并保留出处。

处理比城市那套克制（掺 5% 主题底色），另有一处纯为体积：夜间那张的密集星场 q74 要 176 KB，加 0.4px 亚像素模糊后 q64 降到 132 KB——它削的是星点的单像素高频噪，在 `.66~.90` 的蒙版下量不出差别（判据是页面截图，不是 RMSE）。

**玻璃感来自「大半径模糊」，不是来自白底（2026-09-19）**：参考 Windows 11 Mica 那种材质的观感，把面板的 `backdrop-filter` 从 `blur(3px)` 提到 **`blur(24px)`**（首页条 16px），同时把 `--surface` 从 `.70` 降到 **`.62`**（深色 `.72` → `.64`）。3px 时图几乎没被抹开，面板被底色压成一块平色，看着像「蒙了一层」；24px 之后透过来的画面是抹开的色块，才读得出玻璃。**底色不能再降**：它决定面板内文字的亮度下限。**当日晚些的「玻璃质感版」把底色提回 `.80` 并撤掉白蒙版**（蒙版一薄，`.62` 就撑不住面板内的次级灰字），`blur(24px)` 这个结论不变 —— 最终值以那一节为准。

**24px 的代价量过，可以忽略**：`../lab/shots/scrollcost.py` 在同一页面对 `blur(3px)` 与 `blur(24px)` 做 A/B —— 帧间隔中位都是 **6.06 ms**、`DirectRenderer::DrawFrame` 各约 39 ms、`LocalFrameView::RunPaintLifecycle` 18.5 → 19.2 ms（约 1.1 秒滚动窗口内属噪声）、掉帧计数相同。Chromium 的 backdrop 模糊代价主要来自「建立 backdrop root」，与半径关系不大。

**彩度是单独一个旋钮（2026-09-19）**：原来这几张在管线里就被**降过彩度**（少女 `Color(0.95)`、浅色城市 `Color(0.86)`），运行时蒙版再洗一遍，等于彩度被削两轮——页面上那个「灰蒙蒙」主要是这么来的。现在改成提彩度：少女日间 `1.35`、夜间新增 `1.30`，城市日间 `1.15`、夜间 `1.20`（实拍图提太狠会出色带，所以比插画保守）。

为什么敢这么提——**亮度与彩度是两个独立的量**：WCAG 对比度只看亮度，而 `ImageEnhance.Color` 按 luma 系数混合、**逐像素亮度不变**，`saturate()` 同理（面板的 `backdrop-filter` 里也加了一条，抵掉底色对身后图的去彩）。所以提彩度不动对比度，改完 `measure.py` 那张 12 组表**数值几乎不动**（4.79→4.81、5.77→5.78…），是实测确认的、不是推断。同理，**`Brightness(...)` 一律没动**——它才是决定文字对比度的那个旋钮，动它就必须重量那张表。

**壁纸 URL 带内容指纹**（`extend_head.html` 里 `resources.Get $path | fingerprint`）：不带 hash 的话，换了图字节老访客会一直看着缓存里的旧图（仓库里同类的坑：换 logo 要强刷）。带 hash 后换素材只改文件名、缓存自动失效；「只有当前生效那一张会下载」不受影响。

**人物曾把蒙版逼到很厚（2026-09-19，现已被下面的玻璃质感版取代）**：深色头发与水手服正好落在「按分类浏览 →」「笔记 / 习题」这些**直接压在背景上**的次要色灰字底下。实测 `.62/.74/.86` 时最低只有 **3.68:1**（AA 要 4.5），于是当时把三档推到 `.80/.88/.93` 换回 4.88~6.27:1——代价是图被洗成灰白、人物只剩一层淡影、整页发灰（「背景不透亮」）。中间那版把蒙版放薄到 `.58/.70/.82` 并把保护交给局部底衬（12 组最低 4.79:1），但**近白、铺满整页**这一点没变，观感仍是一层白纱。

### 玻璃质感版（2026-09-19 当日晚些）：撤掉白蒙版，保护换成局部玻璃面

三个旋钮一起动，目标是把「白纱」去掉、让壁纸原色露出来，而把对比度全部下放到局部：

- **`body::before` 的蒙版降成「透气层」**：少女套 `maskLight = [0.26, 0.06, 0.32]` / `maskDark = [0.22, 0.05, 0.28]`，城市套 `[0.20, 0.04, 0.26]` / `[0.26, 0.13, 0.46]`。**中档最低是故意的**：渐变停靠点固定在 0%/52%/100%（别挪，理由见 `00-theme.css`），中档压到最低 = 画面中段几乎不过滤，人物与画面的原色、原亮度直接露出来。它现在只剩「透气」与给漏掉的小元素兜底两件事，不再承担保护。城市套夜间那组底部反而要 `.46` —— 那张图的下半是大片亮窗（实测该处原始像素约 204），压不住它深色主题的正文与页脚就掉线。
- **保护下放给局部玻璃面**（`--glass-tint` / `--glass-edge` / `--glass-blur`，清单见下）。
- **面板底色 `--surface` 从 .62 提回 .80**（深色同值）：`.62` 是按「蒙版很厚、壁纸已经被提亮」那套算出来的；壁纸原样露出来之后，透过 `.62` 的暗背景把面板内的 `--secondary` 顶到线下（实测首页卡片日期 3.55:1）。**这不是审美回调，是面板必须自己站住** —— 以前它借了蒙版的力，现在不能借。`blur(24px)` 与 `saturate(135%)` 那套 Mica 观感不变。

**一个必须认清的物理约束**：AA 要求文字底色足够亮（深字）或足够暗（浅字）。壁纸要是原色、高对比地露着，**任何压在它上面的文字就得配一块 ~0.8 不透明度的底**——没有免费的路。「透明玻璃 + AA 文字 + 全景壁纸」三者不可兼得。这一版选择保住「文字 AA」与「壁纸透亮」，把玻璃的「透」交给 blur、把对比度交给 0.8 的实底。要更透明的唯一正路是换更平、更暗的壁纸图（`make_backgrounds.py` 的 `Brightness` 旋钮，动它必须重测整张表）。

**局部玻璃底衬**（`00-theme.css` 的「直接压在壁纸上的文字」一节）：清单是**量出来的**，不是猜的 —— `../lab/shots/girlbg/measure.py` 遍历页面上每个可见文字元素，凡祖先链里没有面板/卡片的都在表里：

| 页型 | 元素 |
|---|---|
| 首页 | `.profile h1`、`.profile_inner > span`（副标题）、`.home-recent-head` 的 h2 与 a、`.home-recent-type` |
| 课程主页 / 章节入口页 | `.course-index-heading`、`.course-entries-heading`、`.course-group-heading` |
| 词条页 | `.terms-group-title`、`.terms-filter-empty` |
| 404 | `.not-found-hint`、`.footer-rss` |
| 全站页脚 | `.footer` **整条**（不是逐个 span，理由见下） |
| 列表页排序条 | `.lt-btn.is-active` / `.lt-chip.is-active` |

四个要点：

- **底衬一律挂块级盒，不挂行内元素**：`backdrop-filter` 在 `display: inline` 上不可靠；旧写法靠 `box-decoration-break: clone` 支持跨行，改成 inline-block 又会让窄屏的长文本整段不换行（横向溢出）。所以改成给容器加面：`.profile_inner` 是 flex 列（主题 profile-mode.css），h1 / span 本就是块级 flex 子项；`.terms-tags a` 主题已给了不透明的 `--tertiary`，不用管。填充用 `inset box-shadow` 而不是 `border`：border 会占进盒尺寸、把这些标题的布局行高顶开。
- **页脚必须整条加**：`© 2026 博客名` 与 `Powered by …` 之间那两个 ` · ` 是 `footer.html` 里的**裸文本节点**（`{{- print " · "}}`，在两个相邻 `<span>` 之外），CSS 选不中它们 —— 只给 span 加底衬的话，蒙版放薄后这两个点就是页脚最先糊掉的字符。
- **必须是实心半透明色，不能是渐变**：对比度脚本只沿祖先链合成 `background-color`，渐变（`background-image`）测不到，用了就会得出「已经保护好了」的假结论。
- **必须写成 `rgba()` 字面量，不能用 `color-mix()`**：`color-mix` 的计算值会序列化成 `color(srgb 0.96… / 0.72)`，老脚本按 `[\d.]+` 取数会把 `0.96` 当成 `0.96/255`（近黑），报出一个 1.4x 的假失败（当天实测：浅色城市套首页从 4.74 假跌到 1.49）。解析器已补上 `color()` 分支，但底衬仍用字面量，好让任何旧副本的脚本都测得准。

**顺带量出来的两处历史遗留**（不是这一版改坏的，是测量面从 3 个页型扩到 6 个之后才看见的）：课程主页的**正文块此前没有任何底**（`layouts/courses/course.html` 的 `.post-content` 直接压在壁纸上），实测 2.12:1（浅色）/ 1.74:1（深色）—— 这是全站唯一一处「正文不落在面板上」的例外；列表页排序条的激活态拿 `--accent-soft`（10% 透明蔷薇红）当底，实测 **1.32:1**，比正文任何地方都差。两处都已修：前者补了与 `.post-single` 同套的玻璃面，后者改成中性玻璃底、由 `--accent` 的文字色独自承担对比度（`.home-recent-type` 同理，它在深色主题下是浅粉字配浅粉底，实测 4.02:1）。

**玻璃质感层 `body::after`（2026-09-19 新增）**：壁纸之上、内容之下一层「玻璃板」—— 斜向高光 + 四角径向（浅色提亮、深色压暗，两个方向都朝「帮文字对比度」走）+ 1px inset 亮边。三层都是纯渐变：不新增请求、不进体积预算、不占帧预算（`filter` 不是 `backdrop-filter`，一次性光栅化后只做合成）。

**为什么单独开一个伪元素、而不是并进 `body::before` 的背景栈**：对比度脚本认的是 `body::before`（它把「背景图像素 + 按视口 y 插值的蒙版 alpha」当成文字底色），往里多塞渐变会让它算不到、却不报错。放在 `::after` 上，那个模型继续成立；代价是**这一层的亮度贡献测不到**，所以 alpha 全部压在 ≤.28，并且只朝有利方向偏移。

**它必须自己处理「关掉背景」这条路径**：`presets` 留空时 `--bg-mask-*` 不存在，`::after` 若不引用这些变量，就会在纯色主题上残留一层高光/暗角（[`traps.md`](traps.md) 第 40 条记过同类的残留）。做法是每条声明都引用一个恒为 0 的哨兵 `--t0: calc(var(--bg-mask-light-1) * 0)`：变量不存在时整条声明在**计算值阶段**失效、回落到初始值 `none`，整层消失。乘 0 不是笔误 —— 只借那个变量的存在性、不要它的数值，否则改蒙版会连带改质感。**这条路径实测过**：把 presets 临时清空后，`::after` 的 `background-image` 与 `box-shadow` 都算成 `none`。

另外右下角看板娘（㉕）与她同屏，页面上因此有两个人，这是「人物为主角」的直接后果；要避免就把 `defaultPreset` 改回 `'city'`，或按 `html[data-bg="girl"]` 单独隐藏看板娘。

`bg-daylight-sky.webp`（6 KB）是浅色主题**程序生成的备选**（天青→象牙 + 城市剪影 + 日光晕 + 落瓣，`daylight_background()`），当前未使用，留着是为了想切回纯生成时改一行配置就行。`bg-velvet-night.webp`（4 KB）同理，是深色主题的程序质感备选。生成脚本随机种子固定、可复现；**注意浅色那张换图会让 `bg-velvet-night.webp` 的字节也变** —— 它的随机数种子相互独立了，重跑一次即可，别以为脚本产生了随机噪音。改色改密度就改 `site_backgrounds()` / `daylight_city_background()` 的参数，改完回页面截图核对，别只看生成图。管理页那边是另一回事——面板只盖住中间、背景看得见，用的是真实插画，见 `docs/admin.md` §20。

**对比度是量过的，改图或改蒙版都要重量**：做法是在页面里遍历**可见**文字元素，取它自己的算色，沿祖先链把 `background-color` 逐层合成到 `body::before` 的底色上（底色 = 蒙版 rgba 按视口 y 插值后，盖在实际背景图像素上——背景是 `position: fixed`，所以蒙版只取决于视口 y，与滚动无关），再算 `(L1+0.05)/(L2+0.05)`。两个容易做错的细节：**合成祖先链时要排除 `html`**（它的底色是被 `body::before` 盖住的画布背景，算进去会得出「背景永远不透明」的错结论），**底色要按 `cover` 几何用 canvas 取真实像素**而不是取图片平均色。可复跑的脚本在仓库外：`../lab/shots/girlbg/contrast.js`（页内测量）+ `measure.py`（按主题 × 套 × 页型驱动）。**解析器只认 `rgba()`/`rgb()` 与 `color(srgb …)`**，所以底衬这类色值要写成 `rgba()` 字面量，别用 `color-mix()`（理由见下面「局部底衬」）。

2026-09-19 全量实测（单位 1:1；**页型同日从 3 个扩到 6 个**，脚本已同步）：

| 背景套 | 首页 | 笔记页 | 章节入口页 | 课程主页 | 词条页 | 404 |
|---|---|---|---|---|---|---|
| 浅色 · 黑长直少女 | 4.74 | 5.42 | 4.99 | 5.67 | 5.07 | 5.22 |
| 浅色 · 城市 | 5.47 | 6.42 | 5.47 | 6.39 | 5.47 | 5.47 |
| 深色 · 黑长直少女 | 4.95 → **4.23**⚠ | 5.86 | 5.37 | 5.90 | 5.37 | 5.37 |
| 深色 · 城市 | 4.54 → **6.01** | 6.24 | 6.37 | 6.50 | 6.31 | 6.69 |

（箭头是 2026-09-19 首页改版后的重测值，其余 20 格逐字未变 —— 说明这次改动只动了首页。⚠ 那一格见下面「脚本对 backdrop-filter 是盲的」。）

24 组全部 ≥ AA 的 4.5:1，最低 4.54（深色 · 城市 · 首页的 `.home-recent-date`）。**扩页型这一步本身就有价值**：扩完立刻看见课程主页 3.89 与词条页 3.72 早就不达标，而它们从来没进过表 —— 只测三个页型时那张表会一直报绿。最差的几处仍是压在壁纸上的 `--secondary` 灰字（首页卡片日期、页脚的 `©` 与 `·`），面板内的正文普遍 5:1 以上。改蒙版、换图、改底衬/面板 alpha 都要照这张表复测。

**脚本对 `backdrop-filter` 是盲的（2026-09-19 首页改版时量出来的第六个盲区）**：`contrast.js` 把文字底色算成「各自的 `background-color` 沿祖先链合成 → `body::before` 的蒙版 + 壁纸原始像素」，它**看不到祖先的 `backdrop-filter`**。首页两块面板（`--surface` + `blur(16px)`）之后，深色少女套那一格从 4.95 掉到 4.23，看着像不合格 —— 按仓库的老办法（脚本看不见的层就抽真实像素）复核，**真实值是达标的**：

| 位置（1680×1050，深色少女套） | 脚本值 | 真实像素 | 真实对比度 |
|---|---|---|---|
| 「按类浏览」面板全境（取底色最亮的一点） | 4.23 | `rgb(26,48,66)` | **4.75** |
| 「最近更新」面板全境 | — | `rgb(20,46,68)` | **4.88** |

量法：把面板的直接子元素 `visibility: hidden`（仓库既有的「隐藏面板子元素后扫区域取最坏像素」），截图后对面板矩形**避开 14px 圆角**每隔 4×3 像素采样、对 `--secondary` 取最坏。**模糊是帮忙的，不是帮忙不上的**：把 `backdrop-filter` 关掉再采同一片区域，最坏点掉到 `rgb(56,57,62)` → **4.03**（不合格）。也就是说 blur 把壁纸的亮点抹匀了，真实对比度反而高于脚本那个「没有模糊」的模型 —— 所以这一格的红是**模型偏悲观**，不是设计不合格。脚本盲区多一条，看到面板内的红格先抽真实像素再决定改不改。

**这张表的已知边界**：量的是**视口几何**。背景是 `position: fixed`，脚本按当前视口（1680×1050）的 `cover` 几何取真实像素，换视口尺寸就是另一组数。窄屏（手机）目前**没有量过对比度** —— `position` 是按窄屏取景定的（见上），但对比度没验，这是已知的空白。

**为什么体积这么重要**：背景是**每个页面**都要下载的资源（`body::before` 的 CSS 背景，不能懒加载）。原 JPEG 191 KB 在 4 G 模拟下光它一项就占 521 ms，转 WebP q=70 后 55 KB。现在城市套 62 KB（日）/ 127 KB（夜），少女套 92 KB（日）/ 137 KB（夜），纯质感备选 4~6 KB。换图时**别退回 JPEG**，也别在背景里塞细节——同一张 1600×900 的 WebP，云和天际线能压到 60 KB，细腻纹理（星场、密集建筑）就下不来。注意**只有当前生效那一张会下载**，所以多一套不等于多一份流量，但默认套那张是每个访客都要付的。

**导航栏那 8 个图标不属于本节的背景体系**：它们是 `tools/icons/make-icons.py` 自绘的 32×32 像素小人（一个菜单项一个角色），16px 显示，接线在 `hugo.toml` 菜单的 `pre` 字段 + `extend_head.html` 生成的 `css/nav-icons.css` + `19-nav-px.css`。为什么必须自绘、为什么是 16px、为什么用背景图而不是 `<img>`，都在 [`architecture.md` 第 6 节](architecture.md) 的「第三条线」里。

**明暗切换的过渡（2026-09-19 新增）— `assets/css/extended/20-theme-fade.css` + `assets/js/theme-fade.js`**

主题的明暗是 `<html data-theme>` 上的一次属性翻转，全站颜色瞬间改值（= 硬切）。补的是两件事，都只在切换的那几百毫秒里生效：

- **颜色过渡**：脚本给 `<html>` 加一个 `.theme-fading` 类，`20-theme-fade.css` 里那份 `transition`（`background-color / border-color / color / fill / stroke / outline-color / text-decoration-color / box-shadow`，300ms）只在这个类下生效，320ms 后撤类。**不做全局常驻**：常驻会让所有悬停/聚焦都带上 300ms、交互发粘。**必须 `!important`**：组件自己写了 `transition`（卡片阴影、菜单、首页条目），同一元素上 `transition` 是单值属性、后写的整条胜出，不加 `!important` 会变成「一部分元素淡、一部分跳」。
  - **加类的时机是「捕获阶段的 click，属性翻转之前」**，`MutationObserver` 只作兜底。原因是一个实测踩到的时序坑：observer 回调是微任务，正常时序下它赶在下一次样式计算之前，但只要有人在那两者之间读一次样式（`getComputedStyle`、量尺寸都会强制样式计算），属性翻转就先被算掉了，类到时已经来不及 —— **表现是照样硬切，而且不报错**。捕获阶段在翻转之前，时序上不可能迟到。
  - **选择器必须排除 `.bg-ghost`**（`*:not(.bg-ghost)`）：那一层是壁纸交叉淡入的临时图层，自带 `transition: opacity 250ms`，被这里的 `!important` 顶掉之后 opactiy 不再过渡 —— 壁纸变成瞬间跳过去。
- **壁纸交叉淡入**：日/夜两张壁纸是 `body::before` 的 `background-image`，离散属性、过渡不插值，做法与背景套切换**同一套**（ghost 图层：把当前已解析的背景栈快照出来 → 翻转 → 淡出），并且**等目标图 `decode()` 就绪再淡出**（最多 600ms，超时就照淡），等待期间画面被 ghost 盖着、不会露底色。区别只有一个：快照必须在翻转**之前**取，所以它挂在那个捕获监听上，而不是 observer 里。
- **降级**：`prefers-reduced-motion: reduce` 时两条都不做（照旧硬切，与背景套切换、看板娘、进度条同一口径）；配置里把背景套清空时只做颜色过渡、不建 ghost。

**代价量过，可以忽略**（同一套 rAF 帧采样，`--js` 里点一下 `#theme-toggle` 再收 1.1s 的帧间隔，开关两臂各跑 2~3 轮）：

| 页面 | 关过渡 | 开过渡 |
|---|---|---|
| 首页（1440×950） | p50 6.1ms、p90 6.2ms、最大 18.1 / 24.2ms | p50 6.1ms、p90 6.1ms、最大 18.2 / 18.3ms |
| 最重页 `projects/cmc2026/problem-03/问题三/`（16256 个节点） | 中位 545.5ms 的单帧卡顿 | 中位 533.4ms，同一处单帧卡顿 |

- 首页两臂没有差别。最重页那**一次 ~0.54s 的单帧卡顿两臂都在**，是主题翻转本身（16k 节点的整树重算 + 重绘，KaTeX 页面上更明显），**不是过渡引入的**：把 giscus 的 iframe 先摘掉再量、两臂的卡顿依旧是 ~0.54s。两臂中位数 545.5 vs 533.4 落在轮间波动里（这个环境判不了这个量级的差异，口径同第 6 节「入动效吃不吃帧量不出来」那条）。
- 过渡本身很便宜，是因为 Chromium 对「只变颜色」的失效有优化：过渡期间 p50 仍是 6.1ms，没有出现「每帧重画整页」。
- 复跑方式（脚本是临时写的，没进仓库）：`--js` 传一段 `awaitPromise` 的代码 —— rAF 采样循环 + `document.getElementById('theme-toggle').click()` + 禁过渡那一臂注入 `html.theme-fading *{transition:none !important}`。

### ⑬ 阅读进度条 + 目录当前项高亮 — `assets/js/reading-progress.js` + `08-reader.css`
只在真正走单页模板的页面加载（`extend_head.html` 的判据与 Giscus 同源：`.Kind == "page"` 且排除 `archives`/`search` 两个独立 layout。`archives` 那条现在没有对象了——归档页 2026-09-15 删除——留着是为了它回来时不用再想起这件事）。脚本自建 `#reading-progress`（fixed 顶部 2px，用 `transform: scaleX()` 推进），并按「最后一个已越过的标题」给 `.toc a`、`.toc-rail a`（单页的左侧目录栏，见 ㉓）加 `.active`。

**不要用 `requestAnimationFrame` 做节流**：隐藏标签页里 rAF 不触发，切回来会拿到过期状态——`terms-filter.js` 已经踩过同一个坑，这里直接同步算。

**几何量必须缓存**：正文与每个目录项的绝对偏移只在「重新测量」时算一次，滚动路径上只做 `window.scrollY` 的算术。原来的写法每次 scroll 都要对正文调 `getBoundingClientRect()` 与 `offsetHeight`、再对每个目录项逐个取 rect，而最重的公式页有 1082 KB HTML / 1.68 万个 `<span>`。用 CDP 的 Performance 计数器量（`../lab/shots/jank.py`，110 次滚动）：旧写法 `ScriptDuration` 0.019~0.020 s，缓存后 0.004~0.005 s，**滚动脚本开销降到 1/4**。失效时机是 `resize` / `load` / `document.fonts.ready` / `ResizeObserver(.post-single)`，最后一条是为了兜住「图片或字体迟到导致正文高度变了」。

**偏移排序后再扫描**：同一页上常同时有两个目录（正文顶部的折叠目录 + 左侧跟随目录，见 ㉓），两组指向同一批标题，拼在一起不再单调递增，而扫描逻辑是「遇到更大的 `top` 就 break」——不排序的话第一组一结束就收手，左侧目录永远不会亮（实测 `inlineActive: 1 / railActive: 0`）。`marks` 现在按 `top` 稳定排序，同一个标题上的两份目录由靠后出现的那份（左侧栏）拿到高亮。

### ⑭ 搜索快捷键与 `?q=` 预填 — `assets/js/search-shortcut.js`

- 任意页按 `Ctrl/⌘ + K`，或不在输入框内时按 `/` → 跳到搜索页；搜索页 URL 由 `extend_head.html` 用 `relLangURL` 填进 `<script data-search-url="…">`，站点换子路径不用改脚本。主题原生只有 `Alt + /`（accesskey）。
- 搜索页读 `?q=…` 预填输入框并自动出结果，于是任何页面/工具都能用链接直接发起搜索。
- **必须重试**：主题 `fastsearch.js` 在 `window.load` 之后才 fetch 索引，索引没就绪时派发的 `input` 事件会被静默丢弃（`performSearch` 里 `!fuse` 直接 return）。脚本按「结果是否出现」最多重试 7 次（约 1.6 s），一旦用户自己在输入框里打字就交出控制权。

### ⑮ 首页：快捷入口 / 站点规模 / 按类浏览 / 最近更新 — `_partials/index_profile.html`（整份覆盖）+ `_partials/home-scale.html` + `_partials/home-extras.html` + `09-home.css`

首页在 profileMode 下由主题 `list.html` 直接调用 `index_profile.html`，**没有任何 hook**，所以这一处是整份覆盖（见第 4 节）。与原版的差异现在有**五处**：头像多取一张 2× 图供高分屏、快捷入口、站点规模与按类浏览（**2026-09-19 起拆成两个 partial**：`home-scale.html` 与 `home-extras.html`）、最近更新、以及 **`.home-hero` / `.home-side` 两个容器**（宽屏两栏布局用，见下）。标题/副标题/社交图标/`profileMode.buttons` 的内容保持主题原样。新块的**逻辑**整块写在各自的 partial 里，`index_profile.html` 只多两行 include —— 那个文件是要跟主题逐行对拍的，对拍面越小越好（所以两个容器里的内容刻意**不重新缩进**：为了多一层容器把几十行整体缩进一级，会让每次升级主题时的对拍多出一大片无意义的差异）。

**页面结构（2026-09-19 改版）**：

```
.profile_inner（窄屏 flex 列；≥1024px 是 grid，左 20rem + 右 1fr）
  .home-hero   头像 / 标题 / 副标题 / 社交图标 / 快捷入口 / 站点规模 / buttons
  .home-side   两栏时的右栏容器（flex 列 + gap）：
                 section.home-browse（按类浏览，一块玻璃面板）
                 section.home-recent（最近更新，一块玻璃面板）
```

- **两块内容各自成一块玻璃面板**（`--surface` + 1px `--edge` + 14px 圆角 + `--shadow-card` + `backdrop-filter`）。改之前它们是散在壁纸上的：每个 chip、每条「最近更新」各带一小块 `--surface` 底，两个标题再各叠一层玻璃底衬，一层压一层。改成面板之后：面板内的条目**透明化**（底由面板给），chip 只留一道 `--rule` 发丝边、悬停/聚焦才亮 `--accent`；「最近更新」的条目悬停铺一层 `--code-bg`（**不用 `--accent-soft`**：那个当底会把文字对比度拉下来，⑫ 记过这个坑）。层的代价也降了：首页的 `backdrop-filter` 元素从二十来个（每 chip、每条目、每块底衬各一个）降到 2 个。
  - **两块面板的标题因此从 `00-theme.css` 的局部玻璃底衬清单里删掉了**（`.home-recent-head h2/a`、`.home-browse-head h2/a`、`.home-browse-label`）—— 它们已经在面板里，再叠一层就是玻璃片贴玻璃片。`.home-scale` 仍直接压在壁纸上，那条保留。
  - **连带一条容易静默失效的**：加了 `.home-hero` 之后副标题不再是 `.profile_inner` 的直接子项，玻璃底衬清单与入场动画里那条 `.profile_inner > span` 都改成了 `.home-hero > span`（选择器失配不报错，只是保护/动效没了）。
- **≥1024px 两栏**：`main.main:has(.home-recent)` 放宽到 `calc(var(--nav-width) + var(--gap) * 2)`（1072px，与顶栏同宽、左右边缘对齐），`.profile_inner` 变 grid：左栏 20rem 放 hero、右栏放 `.home-side`。两栏用 `:has()` 只认首页（`.main` 是全站共享的）。窄屏完全等同原来的单列。
  - 实测（1440×950，浅色少女套）：最近更新面板的顶部从 **701px 降到 316px**，整页内容在 **570px** 处结束 —— 1080p 首屏装得下整页，改版前要滚过大半屏才看到「最近更新」。
  - `main` 放宽只影响首页，`0 布局位移` 那条结论不受影响（入场动效只用 opacity/transform，见下）。
- **首屏再收紧一档**：`.profile` 的 padding 2.2rem/1.2rem → **1.6rem/.9rem**、`.profile_inner`/`.home-hero` 的 gap 1rem → **.85rem**、`h1` 2rem → **1.85rem**、「最近更新」条目 padding 与列表行距各收一档。
- **「最近更新」的列宽阈值从 300px 改成 285px**：两栏下 1024px 视口只给右栏 624px，扣掉面板内边距与列间距后 2 列需要 `285×2+8 = 578 ≤ 587`；300px 时差 0.8px 正好掉成一列（1024 是 iPad 横屏宽度，值得为它挪这 15px）。

- **快捷入口**复用主导航（跳过 `home`，取前 5 项），不维护第二份链接配置，导航改名自动同步。**2026-09-19 起 ≥1024px 隐藏**：宽屏下它就是主导航那五项、完整导航就在正上方一行，属纯重复；窄屏（≤640px 导航收进汉堡菜单）才保留。顺带解决了五个 pill 在 20rem 窄栏里排成 4+1、「标签」单独占一行的问题。
- **卡片组**（2026-09-19 新增，当天换过四轮形式）：hero 最下面**一次一张**的 5:7 卡（20 张，两系：绫华 16 / 黑长直少女 4），可点、可键盘、可滑动，也会每 6s 自己切（悬停与后台暂停）。整块在 `home-cards.html` + `assets/js/home-deck.js` + `21-card-deck.css`，清单在 `data/home-cards.yaml`；十种卡面风格都是 CSS 画的（全息 / 金边 / 和纸 / 霜蓝 / 墨 / 玻璃 / 哥特教堂玻璃 / 樱纹 / 麻叶纹 / 青海波）。另有「hero 场景插画」一种备选形式（`chara`）。细节见 ㉕。
- **站点规模**（2026-09-19 新增，同日从 `home-extras.html` 拆到 **`home-scale.html`**）：一行小字「数学库 80 张卡 · CS 库 8 张卡 · 2 门课程 · 2 个项目」。拆出来的原因是宽屏两栏要把它留在**左栏**、而「按类浏览」去右栏。数字**全部现算**（库名与张数取 `data/libraries.yaml` 与各自的卡片 JSON；课程取 `/courses/` 的 `.Sections`、项目取 `/projects/` 的 `.Pages`），空的一项不显示 —— 用 `hugo --contentDir <只放了一篇 searchHidden 页的临时目录>` 构建时，这一行自动退成「数学库 80 张卡 · CS 库 8 张卡」。
  - **刻意不做「各库入口卡」**：快捷入口那一行已经指向同样的五个地方，再列一遍就是第二个链接清单。
- **按类浏览**（2026-09-19 新增）：分类与标签各一行 chip（计数取 Hugo 的 taxonomy 权重 `ByCount`，与 `/tags/` 页上的数字同源），标题行右端是「全部分类 →」—— 那个链接**原先挂在「最近更新」标题行上**，这次挪过来：同一页不留两个通向 `/categories/` 的入口。
  - **分类不带计数**：它只有「课程 / 项目」两项，而上面「站点规模」那行已经在说「几门课程、几个项目」；分类数的是**页面数**（项目 17），规模数的是**顶层目录数**（2 个项目），两个口径并排放会让人对不上。
  - 两行用**网格**（`grid-template-columns: 2.9rem 1fr`）而不是 flex：标签名宽度不同，flex 会让两行的 chip 起点错开，标签行还会把标签名留在上一行、chip 掉到下一行看着像串行。
- **最近更新**：`site.RegularPages` 按 `Lastmod` 倒序取前 `params.home.recentCount` 条（`0` 关闭），排除 `searchHidden` 与 archives/search；每行是「类型徽标 + 标题 + **完整年月日**」，类型文案由 `type-label.html` 提供——与相关内容区块共用同一份 `Type → i18n key` 映射，不再各写一份。`enableGitInfo = true` 让 `Lastmod` 有真实值。
  - **空状态**（2026-09-19 新增）：过滤后一条都不剩时渲染一句话（i18n `homeRecentEmpty`），不再输出一个空标题。
  - 日期用 `2006-01-02` 而不是 `site.Params.DateFormat` 的「2026年9月15日」：这一行是 nowrap flex、日期又 `flex: none`，CJK 日期宽近一倍，会把标题挤成多行（`09-home.css` 因此给了 `white-space: nowrap`）。
  - 徽标不写死类型文案：课程材料页显示**课程名**（「回归分析」而不是「课程」）。层级是 `courses/<课程>/<章>/<材料>/index.md`，模板取祖先里**最外层那个「自己还有 section 父级」的 section**（`and (eq .Kind "section") .Parent.IsSection`）—— 三级结构下章会被更外层的课程覆盖掉，结果正好落在课程上；即使将来材料直接挂在课程下也成立，不依赖「必须有三层」。取不到才退回 `type-label.html` 的类型文案（项目页就是这种：项目名就是标题本身，徽标里再写一遍是重复）。2026-09-18 之前每行都是「课程 / 学习笔记（上）」，读者看不出是哪门课。
  - 2026-09-18 之前这里显示的是「月-日」，同一批提交的页面看起来日期完全一样。`Lastmod` 会回退到 **git 提交时间**（见 `[frontmatter]`），所以首次导入后所有条目同日是预期行为，之后单独改哪个文件、只有那个页面的日期会变。
- **头像样式收敛到一个选择器**（2026-09-19）：光环本来在 `13-ornament.css` 里写 `.profile img`，而 `09-home.css` 里另有一条 `.profile img` 的阴影 —— 同特异度、装饰层后加载，那条一直是**死代码**。现在两条都改成 `.profile-avatar`（模板里本来就有、此前没有任何规则的类），职责一处。
- **没配社交账号时的空 `social-icons`**：主题的 `social_icons.html` 恒输出一个 `<div class="social-icons">`，而 `.profile_inner` 是 gap 布局 —— 空的 flex 项照样占一份 gap（首页白多约 1rem）。`09-home.css` 用 `.profile_inner .social-icons:empty { display: none }` 收掉：比删模板里的 partial 调用好，不新增与主题原版的差异处，将来配了账号自动生效。
- **入场淡入**（2026-09-19）：在 `@media (prefers-reduced-motion: no-preference)` 里给头像（只动 opacity）、hero 各行与两个区块、以及最近更新条目按 `nth-child` 阶梯延迟淡入（总时长 ≤0.5s）。两条必须守住的写法：
  - **填充用 `backwards` 而不是 `both`**：`both` 会在动画结束后继续把 `transform` 钉在终态，条目自己的 `:hover { transform: translateY(-1px) }` 就永远不生效（动画压过普通声明）。
  - **头像那条只动 opacity**：主题在 ≤768px 给 `.profile img` 写了 `transform: scale(.85)`，动画里带 transform 会把它盖掉。
  - 只用 opacity 与 transform ⇒ 不触发布局：六轮 `startjank.py --headless` 实测位移条目 **0 条**、长任务 **0 条**（开/关动画都一样）。
  - 「动效是否吃掉帧」**在这个环境里量不出来**：首秒的帧波动是噪声主导 —— 交替重复三轮后，**关掉动画那组同样出现 6/1/2 帧超 7ms、最大 90.9ms**，两臂差异（中位 1 帧 vs 2 帧）落在轮间波动里。要判它得上真窗口 165Hz 的 `frameab.py` 反复多轮，理由见第 6 节。
  - 选择器里的副标题一条在 2026-09-19 随结构改成 `.home-hero > span`（见上面的结构一节）—— 这类「随结构变的选择器」改版式后要一起对，失配不报错。
- 主题 `profile-mode.css` 给 `.profile` 设了 `min-height: calc(100vh - …)`，加了内容会撑出很高的首屏，`09-home.css` 把它改成自然高度（padding 从 `3rem/2rem` 收到 `2.2rem/1.2rem`，2026-09-19 再收到 **`1.6rem/.9rem`**：以上几段的留白一起收，才把「最近更新」提到了首屏内）。

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

主题这份 PaperMod 的 `#menu` 在窄屏是 `flex-wrap` 换行，8 个菜单项折成两行、顶栏被顶高。脚本在窄屏插一个按钮把菜单收起来，点开才铺开；`Esc`、点空白、回到宽屏都会收起。

**纯渐进增强**：脚本跑起来才给 `<html>` 加 `.has-nav-toggle`，CSS 里的收起规则全挂在它下面——禁用 JS 时菜单照主题原样铺开，不会变成点不开的死菜单。

### ⑳ 列表卡片封面 — `tools/covers/make-covers.py`

封面是生成产物（渐变 + 细网格底纹 + 标签/标题/副标题），脚本是可复现的事实源：改标题配色只改脚本里的 `COVERS`，输出到 `assets/images/covers/*.webp`，front matter 里写 `cover.image: "images/covers/<名字>.webp"` 即生效。**不用外部图片**的原因和图标不同：封面只承担「卡片有视觉锚点」，自绘没有许可问题。

### ㉑ 数学工具库（课程卡片 + 正文引用弹窗）— `layouts/courses/{tools,toolcard}.html`、`_partials/{card-ref,toolbox-card,toolbox-teaser,toolbox-md}.html`、`assets/js/toolbox.js`、`11-toolbox.css`

数学课里「由【工具 1.4】」「定理 4.4」这类引用以前只能翻附录，现在是一套卡片库：

- **数据**：`data/math-toolbox.json`，由 `tools/course-import/import_course.py` 从课程项目生成（见 [`content.md` 第 9 节](content.md#9-课程内容从课程项目导入含数学工具库)）。
- **主页** `/courses/<课程>/toolbox/`（`layout: "tools"`）：只铺**索引卡**（类别徽章 + 名字），顶部按关键词与分组筛选。
- **卡片页** `/toolbox/<id>/`（`layout: "toolcard"`，id 形如 `tool-1-4`／`thm-4-4`）：完整卡片 —— 陈述、用途、折叠的证明。一卡一页是因为：80 张卡铺一页有 3 MB、超单页预算；顺带每张卡有了可分享的固定链接。
- **正文引用写名字，不写编号**：正文里写「由全方差律」「见 Fisher 引理」，导入脚本按名字表把它换成 `{{< tool "1.2" "全方差律" >}}` → `_partials/card-ref.html` 输出链接，点击由 `toolbox.js` 拦截、抓对应卡片页塞进弹窗（同一地址只抓一次，弹窗的**多栏**行为见下面「弹窗是多栏的」那条）；**无 JS 时退化成普通链接**，跳到卡片页。名字表 = 工具库条目的标题 + 条目紧跟的 `<!-- 别名: … -->` 行，长名字优先，**每处出现都接线**。数学区、行内代码、既有链接、HTML 标签与**标题行**一律跳过：标题里插链接会让 `.TableOfContents` 冒出 `HAHAHUGOSHORTCODE372s2HBHB` 这类占位符（实测踩到，目录里当场可见）。
- **「工具 k.m」这套称呼已取消，编号也不再进 UI**（2026-09-19）：条目标题就是定理/定义的名字；编号只活在**锚点 id**（`tool-1-4`）、**短代码参数**（`{{< tool "1.4" >}}`）与**搜索关键词**（`data-search` 里仍带着它，搜「4.4」照样搜得到那张卡）里。在此之前卡片右下角画着一个 `.tb-num` 小字，问题是这个编号是**课程侧的分组号**，而在数学库里卡片是按数学分支重排的 —— 一页「线性代数」上并排躺着 4.1/4.2/4.3，那个「4」指的是课程的第 4 组「线性代数工具」，读者无从知道，四个数字看着像章节号却不是。所以去掉它，卡片页的 `title` 也从「名字（定理 4.4）」改成「名字（定理）」（类别词留着：它是 `<title>` 与 OG 里唯一的类别线索）。正文里若还残留 `【工具 k.m】`，导入脚本报错退出（`STRAY_TOOL_REF`），不会静默漏掉。
- **类别框**（2026-09-19）：卡片按**类别**上色，两个通道——**色相**说「是哪个类别」，**填充形态**说「是不是一个有真假的论断」：定义/概念/技巧 = 描边徽章（类色字 + 10%/16% 类色底纹），定理/命题/引理/推论/性质 = 实色徽章（类色底 + `--theme` 字）。卡片与徽章之间由卡片左缘那条 **3px 类色条**承担「扫一眼分类」（徽章要读字，色条不用）。色值在 `00-theme.css` 的类别色板（`--k-*`），接线在 `11-toolbox.css` 的「类别色」一节：`[data-kind]` 取令牌挂在 `.tb-card` 上，徽章继承；弹窗里卡片虽然去掉了边框，但**保留左色条**。两个坑写在代码注释里：兜底规则 `[data-kind]` 必须排在各类别之前（特异度相同，靠源码顺序，放后面会把每个配好的类别都盖掉）；`.tb-card-head .tb-card-anchor` 那条 `margin-left: 0.15rem` 的覆盖随编号一起删（它当初是为了让 `#` 紧跟编号）。
  - **色板门槛**：8 个类色压在同一条明度带上（低饱和、与蔷薇红/银紫同族），每个都要过 AA —— 实测浅色 5.26~6.82:1、深色 5.13~7.44:1（描边徽章量「类色字 / 类色底纹叠 `--entry`」，实色徽章量「`--theme` / 类色底」）。卡片底色 `--entry` 是**不透明**的，所以这些对比度与玻璃面板无关，是确定值；量法与全部数值：`../lab/palette-contrast.py`。定义与定理直接借用 `--accent` / `--accent-2`，不写第二份字面量；没列到的类别（注/例/设定/结论）走中性兜底色。
  - **正文里的引用徽章 `.card-ref` 不参与上色**（有意）：它压在玻璃面板上，而 ⑫ 的量法表明面板会把白底对比度打到约 0.75 —— 同一批类色在那里只剩 3.9~5.1:1（浅色·定理 3.95、浅色·引理 4.35）。它是正文的一部分，不值得为配色冒这个险，所以维持原来的中性底 + 正文色。**结论：色板只在卡片上生效。**
- **每张卡都必须有名字**（2026-09-19）：无名卡在卡片墙上只是一个裸类别词（这次修掉的正是 30 张这样的卡：课程笔记里写成 `**引理 4.1**` 没给 `（名字）`，页面上一片「引理 4.1 / 命题 4.6」）。现在两处生成器在写盘那侧拦（`import_course.py` 的 `require_name`、`scripts/gen-cards.mjs` 开头的断言，判据一致：`title` 非空，且**不能整段是公式** —— 卡片页 h1 走 `plain_card_title` 的纯文本降级，整段公式会变成空标题），**产物**那侧由 `scripts/check-cards.mjs` 拦（扫 `data/*-toolbox.json`：`title`/`id`/`kind` 非空 + id 不重复）。CI 的机器上没有课程项目，所以 CI 只能查产物，而这一条同时兜住知识库发布与管理页手改。这次补名字改的是**课程项目**（`笔记/M1_简单线性回归.md` 里 30 处 `**引理 4.1（名字）**`），不是博客侧的产物 —— 生成物照旧不许手改。
- **点击目标从卡片自己的链接解析**（2026-09-19）：索引卡里的标题与类别徽章都是 `<span>`，所以 `toolbox.js` 一律回卡片里取那个 `<a>`（`teaser.querySelector("a[href]")`）——从被点到的元素取 href 会拿到 `null`，而 `null` 会被 URL 解析器变成一个「能用」的坏地址，把访客送去 404（症状、判据与修法见 [`traps.md` 第 2 节](traps.md)）。拿不到地址时**不拦截点击**，让浏览器按链接正常跳卡片页；`pathOf()` 对空 href 返回空串。同一件事的另一半：卡内交叉引用由 `toolbox-md.html` 在改写锚点时补上 `data-card="<id>"`，JS 按它认卡 —— 不再用 `a[href*="/toolbox/"]` 猜 URL 形状（CS 库的卡片页在 `/cs/<id>/`，猜法在那里必然失配）。左缘类色条也从 `border-left` 改成内阴影 `box-shadow: inset 3px 0 0`：border 在链接之外，那 3px 是一条点了没反应的死区。
- **附属结论：一家子一个格子，默认收起**（2026-09-19，形态当天改过一轮）：引理 / 推论 / 性质是**附属结论**（谁挂谁由数据里的 `parents` 决定，规则与手写表见 [`content.md` §10](content.md)）。渲染在 `_partials/toolbox-wall.html`：主卡 + 它的附属结论 = 一个 `.tb-family`，占网格的一格。
  - **收起与展开**：主卡**右侧一个窄条箭头**（里面是三角 + 附属结论张数，可访问名 `toolboxFamilyCount`＝「N 个附属结论」），**默认收起**，点开才在主卡下面铺开那几张小一号的卡（左边一条细虚线连回主卡）。收起状态的 CSS 挂在 `body.tb-collapsible` 上、按钮出厂带 `hidden` —— **两件事都在 `toolbox.js` 的 `initFamilies()` 里一次性做完**：脚本不在时附属结论照旧全展开，也不会留下一个点了没反应的箭头（与 `nav-toggle.js` 同一套渐进增强）。
  - **箭头必须是主卡的兄弟节点**：卡片的「整卡可点」是 `.tb-teaser-link::after{inset:0}`，塞进卡里就会被它盖住、点箭头变成开卡片。做成兄弟就不必跟它抢 `z-index`。
  - **筛选命中附属结论时替访客展开那一家**：命中的如果正是被收起来的附属结论，不展开就等于「搜索框说匹配到了、眼前什么都没有」。用户自己点过箭头的家（`toolbox.js` 的 `state.manual`）不再被自动改动 —— 他设过的开合不该被敲键盘改掉。
  - **一张附属结论被多个主卡共用时，每个主卡下面都渲染一份**（引理常这样：引理 4.1 就挂在定理 4.2/4.3/4.4/4.5 下面 4 份）。第二份起加 `.tb-teaser--dup`：不显示类别徽章、不画左色条、名字用次要色 —— 一眼能看出「这是同一张，主卡那边有一份完整的」。
  - **附属结论是独立的卡，不是塞进主卡框里**：塞进去会被主卡那层「整卡可点」的链接盖住，点附属结论变成点主卡（见 [`traps.md`](traps.md)）。所以点附属结论开的是附属结论自己（实测过：点引理 4.1 打开的是「残差的正交性质」，不是它上面那张）。
  - **附属结论的主卡不在本页时**（以后被分到别的分支可能出现），按原样单独排在自己的位置，不缩进 —— 宁可少一层缩进，不要挂到看不见的地方。
  - **筛选按家算**：工具库页的搜索框不再逐张卡算，而是「家里任何一张命中，整家都显示」（附属结论命中而主卡没命中时，不至于在页面上留一张孤零零的缩进小卡）；重复份**不单独计入**「N/80」，否则和分组按钮上的张数对不上。**注意 `.tb-family` 自己设了 `display: grid`，`[hidden]` 就压不住它了** —— 少写 `.tb-family[hidden] { display: none }` 的表现是筛选后满页**空框**（见 [`traps.md`](traps.md)）。
- **关系列表：卡片自己带两个方向**（2026-09-19）—— `_partials/card-rel.html`，卡片页与弹窗同一份 markup（拼在 `toolbox-card.html` 末尾）。原来的关系只活在墙上（缩进、重复份），卡片页里一个字都没有：一张定理不说它有什么推论，引理 4.1 也不说它服务哪四个定理。
  - 「附属结论」＝ `parents` 里写着本卡 id 的那些卡（扫描**所有库**，与 `card-find.html` 同一口径）；「所属」＝ 本卡自己的 `parents`。两张表都由**数据**推出来，不查墙上的渲染结果（重复份只是显示口径）。
  - 每条是「类别徽章 + 名字」的可点链接，走正文引用徽章那条路（`card-find` → `card-href`，`data-card` 交给 `toolbox.js`）：有 JS 时在弹窗里**新开一栏**，没有 JS 时就是普通链接。
  - 类别 → 颜色那张映射仍然只有一份：`11-toolbox.css` 里每条映射规则同时列了 `.tb-card[data-kind=…]` 与 `.tb-rel-link[data-kind=…]`（自定义属性从最近的祖先继承，所以徽章的形与色跟着**它自己的**类别走 —— 一张定理卡里挂着「定义」类的主卡时尤其要看这条）。
- **弹窗是多栏的**（2026-09-19）：在卡片里再点一张（正文引用、或关系列表），那一张**在旁边新开一栏**（插在来源栏的右边），原来那张留在左边 —— 看推论时定理还在眼前。栏数不设上限、多了横向滚动；第二栏起每栏给一个关闭按钮（`.tb-pane-close`，挂在 `data-multi` 上），面板同时从 820px 放宽到 `min(1180px,100%)`；窄屏（`max-width: 640px` 那一段）改成上下堆叠。同一张卡已经在栏里就不再重复开，只把它滚进视野；`Esc` 一层一层退（先收最后一栏，只剩一栏时关整个弹窗）。
- **「按 id 算卡片页地址」只此一份**：`_partials/card-href.html`（`card-ref.html` 与 `card-rel.html` 共用）。原先这段逻辑长在 `card-ref.html` 里、约 30 行，关系列表要用时就得抄第二遍 —— 而那正是「数学卡挂在课程工具库下、CS 卡平铺在库下」这个差异所在。
- 卡片页不参与标签体系（`toolbox/_index.md` 的 `cascade` 清空 `tags`），也不进 sitemap 与搜索索引（`sitemap.disable` + `searchHidden`）。
- 卡内的 `[名字](#card-tool-1-1)` 会被 `toolbox-md.html` 在渲染后改写成目标卡片页地址（Hugo 会把纯 fragment 链接补成「当前页地址 + #锚点」）；卡片不引用自己。

### ㉒ 数学库（跨课程卡片索引，按数学分支三级拆分）— `content/library/_content.gotmpl` + `layouts/library/*` + `data/math-branches.yaml`

`/library/`（导航里排在首页之后）把各门课程的卡片按**数学分支**汇总成索引。它不新建内容，只是 ㉑ 那批卡片的第二个视图。**三级**：`/library/`（大类）→ `/library/<大类>/`（细分目录）→ `/library/<大类>/<细分>/`（卡片墙）。

- **数据**：仍是 `data/math-toolbox.json`，每张卡多三个字段 —— `course`（卡片属于哪门课）、`branch`（大类）与 `section`（细分）。归属规则写在 `data/math-branches.yaml`（**不是**生成产物）：`branches` 是**两级**结构（大类 → `sections` 细分，每个细分带一句 `summary`），`assign` 按 `cards > nums > groups > modules > courses` 取第一个命中，都没命中落到 `default`。调某张卡的归属改这张表，再重跑导入；导入时会校验细分 key 不重复、`assign` 与 `default` 都指向真实存在的细分（写错就报错退出，而不是在页面上静默错分）。**细分 key 现在还是 URL 的一段**（`/library/statistics/stat-ols/`），改 key = 改 URL。
- **页面由内容适配器生成**（`content/library/_content.gotmpl`，Hugo content adapter）：大类页与细分页**没有**对应的 md 文件，构建时从 `data/math-toolbox.json` 现算——分支表加一个大类就自动多一页，删一个就自动少一页，不存在「文件与表漂移」。写成 23 个 `_index.md` 就是把那张表抄第二遍，迟早对不上。适配器给页面的只是「身份」（两三个 key），名字、范围说明、计数、卡片清单全部由模板回表现取。
- **适配器只给五样 front matter**：`title`（分支名）、`description`（表里那句范围说明，`page-head.html` 渲染成页头描述）、`params.branch` / `params.section`（两个 key，模板回表取名字、计数与卡片）、`params.searchHidden` 与 `params.hiddenInRss`（导航页不进搜索索引、首页「最近更新」与 RSS，见 ㉗），细分页另给 `params.math`（卡片标题里有公式）。**`description` 必须写在顶层**：塞进 `params` 里不会成为 `.Description`，页面照常构建、页头直接空白（实测踩过）。
- **三个 layout 各管一级**：`layout: "library"`（总览，`content/library/_index.md`）、`layout: "library-branch"`（大类页：列本大类的细分 + 计数）、`layout: "library-section"`（细分页：铺本细分最多十几张索引卡）。大类页不放面包屑（主题自带的「主页 › 数学库」已经在页头，再写一遍就是同一行里出现两次「数学库」）；细分页放一条 `数学库 / 大类` 的路径，因为主题那份不知道「大类」这一级的存在。范围说明走 `description`，不再各写一个段落。
- **为什么拆**：原先一页铺 80 张索引卡 + 分支大纲，线上 4G 实测 DCL 494 ms / load 1.4 s、加载期一个 103 ms 长任务、滚动区 6588 px，而它承担的信息只是「有哪些大类」。拆开后 `/library/` 14 KB（原先 68.7 KB）、只列 3 张大类卡，**连 KaTeX 都不加载**（原先这页为 4 个公式名加载 `katex.min.css` + 6 个 woff2 共 107 KB）。索引页现在没有搜索框：卡片名本来就在站内搜索索引里（卡片页是 regular page），不必在库页里再实现一份。
- **空分支不出页面**：分支表里预置的大类若一张卡都没有（现在有「数学分析」「数值分析与科学计算」「最优化」），既不出卡片也不出页面；以后导入别的课程就自动出现。总览页因此现在只列 3 个大类。
- **细分页才是卡片墙**，交互沿用 `assets/js/toolbox.js`：点索引卡就地弹窗（按需抓卡片页），没有 JS 就直接跳卡片页。脚本的加载判据在 `extend_head.html`：`in (slice "tools" "toolcard") .Layout` **或 `hasPrefix .Layout "library"`**（三级同前缀，加一级不用回来改）；toc-rail 的排除判据同样按前缀写，两处一起改（见 ㉓）。总览页 / 大类页已经没有 `.tb-group` 与筛选条，筛选只服务工具库页；细分页不再需要搜索或筛选（最多 11 张卡）。
- **卡片页底部**给两个返回入口：「本课程工具库」与「数学库」。正文里的 `{{< tool/thm >}}` 引用在任何页面上都按卡片自己的 `course` 找到正确工具库（`card-ref.html` 的第二级查找），不再依赖「当前页属于哪门课」。
- **`searchHidden: true`**：三级页面都是导航页，不进搜索索引（`layouts/index.json`）也不进首页「最近更新」——首页那份 `RegularPages` 过滤本来就排除 `searchHidden`；同理它们没有 `date`，还要 `hiddenInRss` 才不会在 feed 里变成零值日期（见 ㉗）。

### ㉓ 单页的左侧跟随目录 — `_partials/toc-rail.html`（脚本内联）+ `12-toc-rail.css`

点开任何一个有 h2/h3 的单页（课程材料页、项目文档页、文章、关于页）时，宽屏左侧有一栏跟随滚动的目录；窄屏不显示，仍用正文顶部那份折叠目录。2026-09-15 之前只对课程材料页生效，之后放开到全部单页——公式密集的项目文档页（`projects/cmc2026/**`）正是最需要它的一类页面。

- **范围**：`Kind == "page"` 且排除 `layout: toolcard` / `layout: library` 两个自定义 layout（它们不走主题 `single.html`，`extend_post_content.html` 根本不会被调用，页面本身也没有正文小标题）。判据写在 `extend_post_content.html`（渲染）与 `toc-rail.html` 内部对 `.TableOfContents` 的判据里，**两处要一起改**。放开前后的实测：挂上目录栏的页面由 9 个（全是课程材料页）增至 27 个（+18：项目文档页、关于页，含拆页新增的《问题三_参考实现》）。
- **目录内容**：Hugo 的 `.TableOfContents`（默认 h2–h3，正好对上课程材料页的 §x / §x.y，项目文档页用同一份）。它的标题文本是**原始 Markdown**，所以还要 `replaceRE` 去掉 `$…$` 定界符（构建期渲染的 KaTeX 不会进目录，留着就是裸的 `$F$`）——注意 `replaceRE` 的返回值不是 `template.HTML`，末尾必须补 `| safeHTML`，否则整段目录被转义成文本（踩过）。
- **为什么由脚本挪到 `<body>` 下**：`.post-single` 上的 `backdrop-filter` 会成为 fixed 后代的包含块，目录留在正文容器里就是「跟着正文滚」而不是跟随视口（实测滚动 2500px 后 top 由 170px 变成 -1943px）。脚本把 `#toc-rail` 移到 `body` 末尾并给 `body` 加 `.has-toc-rail`——**显示与否挂在这个类上**，所以没 JS 时目录栏不出现、正文顶部的折叠目录照旧，不会出现「两个都没有」。
- **为什么不能挂在 `extend_footer.html`**：主题 baseof 用 `partialCached "footer.html" . .Layout .Kind …`，同 (Layout, Kind) 的页面共用一份渲染结果——笔记页的 `.Type`、`.Section`、`.TableOfContents` 会串成**第一个被缓存页面**的那份（实测三个不同材料页拿到完全相同的调试值）。要页面相关内容就得用 `extend_post_content.html`（`partial`，逐页渲染）。
- **断点 1240px**：正文列 720px 居中，左右各留约 600px，200px 的目录栏 + 间距放得下，`left: max(16px, …)` 兜住临界宽度；宽屏下正文顶部那份折叠目录由 `body.has-toc-rail .post-single > .toc { display: none }` 收起。
- **当前小节高亮**沿用 `reading-progress.js`（见 ⑬）。

**2026-09-18 体检后的四处调整**（起因是「出现得太晚 / 占地方 / 两套目录不一致 / 高亮不跟手」）：

| 问题 | 改法 |
|---|---|
| 出现得太晚 | 挪目录栏那段脚本**从 `assets/js/toc-rail.js` 内联进 `toc-rail.html`**（文件已删）。原先要等 defer 的外部脚本下载完才加 `.has-toc-rail`，首屏会看到它晚一拍冒出来，脚本取不到则永不显示；内联后解析到即生效，还少一个请求。 |
| 占地方 / 太长 | 栏宽 240 → 200px、条目 0.85 → 0.8rem、标题 0.76 → 0.72rem、间距与行高收紧；底色从 `--surface` + `backdrop-filter: blur(8px)` 换成不透明的 `--entry` —— 那个模糊是**持续**的合成开销（第 6 节量过 backdrop-filter 的代价），而这栏固定在正文旁还自己会滚。 |
| 两套目录不一致 | `hugo.toml` 设 `UseHugoToc = true`：主题那份页内目录改用 `.TableOfContents`（h2–h3）。**之前两份条目集合真的不同**（实测 lab 页：页内 30 条含 h4 vs 左栏 15 条），且页内含公式的小标题被主题自建目录 `plainify` 成乱码（实测「手算 ttt 检验时用」、「SSreg=β^12SxxSS_{\rm reg}=…」）。现在两边同源，条目集合一致、文本都是干净原文。 |
| 高亮不跟手 | ① `reading-progress.js` 改成**按锚点 id 合并两份目录的链接**（同一标题在页内目录与左栏各有一个链接，一起点亮）——之前只点亮排序里靠后的那个，于是窄屏（左栏 `display:none` 时）页内目录永远不高亮；② 高亮变化时把该项**滚进目录栏的可见区**（长文里目录比栏还高，滚出去就等于看不见）。只调栏的 `scrollTop`，不碰页面滚动。 |
| 页内目录默认展开 | `TocOpen` 由 `true` 改为 `false`（原注释写着「默认折叠目录」，值与注释不符）。宽屏时它本来就被左栏顶替，窄屏时默认收起不再占掉正文顶部一大块。 |

### ㉔ 装饰层（墨与蔷薇的细部）— `13-ornament.css`

标题左侧的短竖线、正文分隔线中央的菱形、列表卡片左侧的细线、页脚上沿的渐隐线、目录当前项的蔷薇色标记。单独成文件是为了让它**可以整体拿掉**：删掉本文件页面只是变朴素，不该坏——这就是判断一条规则该写进装饰层还是写进组件文件（01~12）的标准。配色令牌与背景层见 ⑫。

两个写法约定：装饰只用 `--accent` / `--accent-2` / `--accent-soft` / `--rule` 这几个令牌，不写死色值（深浅两套主题才自动跟随）；凡是会改盒模型的装饰（`border` / `padding`）都要换成不吃布局的写法（`inset box-shadow`）——目录项和卡片在 hover 时跳一下，就是这里出的错。

### ㉕ 看板娘（右下角一位，固定在下沿）— `layouts/_partials/extend_footer.html` + `14-mascot.css`

右下角一位，`position: fixed` 贴视口下沿，点击进「关于」页。

**2026-09-18：左下角那位（黑发公主切）已按要求移除。** 同时删掉了模板里那一段、`.mascot--left` 的定位与右缘羽化 `mask-image`、i18n 的 `mascotLabelLeft`、以及已发布的 `assets/images/mascot-left.webp`。**生成脚本 `tools/backgrounds/make-mascot-left.py` 与源图 `source-mascot-left.jpg` 保留**（所以那个 webp 随时能再生成）；想恢复的话，`git log` 这次提交能看到原来的模板与 CSS。删的时候要留意：`--float-bottom` 是看板娘与「返回顶部 / 一键到底」两个按钮**共用**的变量，只摘左位、别动它。

- **右位**：与站点图标同源的少女 `assets/images/mascot.webp`（站点图标那份白底素材 → `tools/backgrounds/make-mascot.py` 抠图，40 KB，366×720）。**2026-09-18 重做了抠图**，因为旧版在深色主题下沿整个轮廓留了一圈白边、脖子与马尾之间还留着一块白斑（原图白色背景没删干净）。白底图有三个坑，三个都得处理：
  1. **不能只按亮度删**：水手服的领子也是白的（实测领子最亮处 240~248，背景是纯 255），按亮度删会把领子一起吃掉。旧版用「与画布边缘连通的白色区域」绕开领子，但那只能删**连通到画面外**的白——头发之间、脖子与马尾之间还夹着几块四面被人物围住的纯白背景（最大一块 8.2 万像素），于是留在图上成了白斑。现在按**色差**切（`> 250` 判背景），不要求连通；领子因此安全，判据是量过的（238~250 之间只占全图 0.1%）。
  2. **不能只把背景变透明**：白底画稿的轮廓是「墨线压在白上」，抗锯齿那圈像素本身是墨 + 白的混合，RGB 里带着白，直接设成半透明就是在深色背景上画一圈白光晕。做法是**去污染**：在离背景 4px 以内的边缘带按覆盖度反解 `C = a·F + (1-a)·白`，得回真正的墨色；`a` 由像素灰度算（`(255-灰度)/(255-墨色)`）。领子不在这条带里，不会被算成半透明。
  3. **缩放要在预乘 alpha 下做**：PIL 的 `resize` 把 RGBA 各通道独立平均，边界上「透明的白」会被平均进轮廓色，出图照样是白圈。先乘 alpha 再缩、缩完除回来。
  
  另外填掉人物内部 <32px 的纯白噪点（24 处），否则领子上会留透光的针眼。脚本把「深色 / 浅色各一份」的预览写到仓库外的 `../lab/shots/mascot_check.png`，**改完必须肉眼看一次那两个主题**（白边在深色主题下最明显）。出了图别忘同步 `extend_footer.html` 里 `<img>` 的 `width`/`height`（脚本会打印出图尺寸——按 `height` 反推宽度会差 1px）。
- **尺寸用高度控制**（`height: clamp(168px, 16.5vw, 286px)`）：用宽度会被宽高比带偏。
- **窗口变窄时分档缩**，不是「一直缩到看不见」：≥1400px 全尺寸；900~1400px 等比缩小；≤900px 再缩一档（150px）；≤640px 全隐藏（正文列贴边，再挂人像就是挡内容）。这一条是被明确要求过的，别改成「一起缩」。
- **为什么用 `extend_footer.html`**：主题 `footer.html` 里调它一次、且不是 `partialCached`（缓存串页的坑见 ㉓），位置在 `<body>` 末尾，`fixed` 不受父级 containing block 影响。
- 深色主题给她补冷光描边（黑发贴墨底会糊），浅色主题只留投影；`prefers-reduced-motion` 下关掉 hover 上浮。`.top-link` 抬到看板娘头顶，**改看板娘高度时这个偏移要跟着改**。

**首页的卡片组（32 张，一次一张；手动 + 自动轮播，卡下的 ⤢ 打开弹层看大图）— `_partials/home-cards.html` + `assets/js/home-deck.js` + `21-card-deck.css` + `tools/cards/{make-cards,fetch-sources}.py` + `data/home-cards.yaml` + `scripts/check-deck.mjs`**（2026-09-19 新增、当天改过六轮；2026-09-20 扩到 32 张 + 风格体系重做为十四种 + 加弹层与进度条）

- **形态**：hero 最下面（头像 / 标题 / 副标题 / 「站点规模」那行之下）一张 5:7 的卡，页内显示 **272 宽**（`.home-deck { max-width: 17rem }`，2026-09-20 从 15rem 放大），出图 600×840；底部名牌写**这张卡自己的名字**（`木刀` / `星夜` / `樱堤` …）+ 序号 `07 / 32` + 系列（绫华 / 黑长直少女 / 卡夫卡）。
- **一副牌三个系列**（32 张）：
  - **绫华 21**：木刀 · 墨羽 · 花信 · 书案 · 霜华 · 白鹭 · 星夜 · 玄袖 · 樱堤 · 甲刃 · 蝶羽 · 闲坐 · 午后 · 雪舞 · 流水 · 夏荫 · 素裙 · 樱簪 · 学园 · 花礼 · 糖霜
  - **黑长直少女 4**：日间 · 夜间 · 大小姐 · 提灯（刻意不用网上的图 —— `black_hair long_hair` 的候选池质量很差，用的是**站上自己的角色资产**）
  - **卡夫卡 7**（崩坏：星穹铁道，2026-09-20 加）：猎星 · 夜行 · 独奏 · 夜宴 · 回响 · 雨幕 · 绯光
  - 名字**按画面取**（往她的意象上靠：白鹭 / 霜 / 扇 / 樱 / 舞），**同一系列不许重名**（`check-deck.mjs` 拦：重名在名牌上就是「翻卡看不出换了」）。
  - 卡夫卡那一系**每条查询都带 `rating:safe`**：站点上她的 `solo simple_background` 不带这个过滤有 100 条、带上只剩 2 条，那些是 questionable 分级，靠 tags 里的敏感词滤不干净 —— 而这是要放在公开首页的图。代价是池子薄：全站 safe 单人只有二十来条、能用的七八条，所以这一系只到 7 张（另有一张画面里带作者署名 `©GOODGOODSPHERE`，否掉了、源图也删了）。挑图口径与接触表在 `../lab/shots/revamp/pick-deck.py`（打分：透明底 +120 / 简单底 +30 / solo +25 / 多人 −45 / 签名文字 −12），下载归一化在 `tools/cards/fetch-sources.py`。
- **交互**（都在 `assets/js/home-deck.js`，脚本只在首页加载）：
  - **切卡**：点卡面 / 卡下 `‹ ›` / 键盘 ←→ / 触屏左右滑；每 6s 自动换一张，**悬停、焦点进入、标签页后台、弹层打开时都暂停**，手动切过重新计时；`prefers-reduced-motion` 时完全不自动轮播、也不做淡出淡入。
  - **进度条**：卡下一条 2px 细线（`.home-deck-progress`，宽是卡的 62%），时长由 JS 按 `AUTO_MS` 写进元素（两处只有一个事实源），暂停与 JS 的 `stop()` 一一对应。**为什么不是「三十个点」**：三十多张卡的点阵会挤成一条虚线、一屏根本数不清；一条细线表达的是「这一张还剩多少」。减少动效时整条不显示。
  - **看大图（弹层）**：卡下的 ⤢ 按钮打开 `role="dialog" aria-modal="true"` 的弹层，里面是 430px 宽的大图 + 名字 / 系列 / 序号 / 出处；`Esc`、点遮罩、关闭按钮都能关；**焦点锁在弹层里、关掉后回到放大按钮**；弹层里 `← →` 切上下一张（切的是同一副牌，背后那张也跟着换）。
    - 大图**直接用已有的 2x 产物**（544px），页内卡只有 272 —— 放到 430 已是 1.6 倍。**不专门出一档「大图」产物**：那要给每张卡多一个 ~720px 文件，32 张约 1.3 MB，会把体积预算吃掉一大截。
    - 弹层用 `hidden` 属性开关而不是只改透明度：对比度脚本只遍历可见元素，藏在屏外的面板不该进它的表。
  - **只有当前这一张在 DOM 里**：32 张全渲染的话它们叠在同一位置、全在视口内，`loading=lazy` 也拦不住；现在是「先下第 1 张 + 预取后 2 张」。
  - 禁 JS 也能看首张卡与序号（切换按钮与弹层都由脚本注入 —— 一个点不动的控件比没有更糟）；换卡会写进 `.sr-only` 的 `role="status"` 播报「第 N 张，共 M 张：名字」。
- **出处**：`credit` 是文字（官方立绘、站点自己的看板娘**没有可点出处**，那两条留空 —— 别硬编一个主页链接上去，那等于指错地方），`credit_url` 是弹层里那个可点外链（pixiv → `/artworks/<id>`、safebooru → `post&id=<id>`、twitter / wallhaven 同理）。`check-deck.mjs` 会把 url 与 credit 对一遍：**写错的代价是「点开跳到别处」而页面看起来完全正常**，只有脚本能拦。
- **取景口径是「人像完整」**（2026-09-19 改，之前是「填满卡面」，结果经常只剩半张脸或切掉腿）：默认 `crop: figure` —— 先按内容包围盒（阈值 45 + 1%~99% 分位）量出人物，再取一个**刚好装下它的 5:7 窗**，用 `pad` 给呼吸；窗口装不下画布时改成「整幅缩进卡面 + 四周垫底色」，底色优先用 YAML 里的 `flat`、否则按**实测四角颜色**取。
  - 两个坑都踩过：**四角取色必须按 alpha 挑像素**（透明 PNG 的四角转成 RGB 是**黑的**，不挑就会把浅色底的画面垫成黑底）；**整幅缩进那条路径必须拿 alpha 当遮罩贴**（直接把 RGBA 转 RGB 同样会把透明区变成黑）。
  - **横构图的源图**走手量分数窗（`ayaka-sword` 是刀、`ayaka-15` 是人像在右半边）：自动取景会把横过来的刀也算进内容、人被缩到很小。
  - **横构图还有第二条坑（2026-09-20）**：`figure` 的窗高**受源图高度限制**，而「源图长边压到 700」这条口径是按**竖构图**定的 —— 横构图的长边落在宽度上，高度只剩 400 上下，2x 档（544）就得放大 1.7 倍。`fetch-sources.py --long-edge 1400` 是解法（在 ayaka-15 上实测过）。
- **十四种卡面风格，全是 CSS**（换风格只改 YAML 的 `style` 字段，不重出图）：`foil` 全息（细斜彩虹条 + 扫光）· `gold` 金边 · `washi` 和纸（纸纤维 + 薄花瓣）· `frost` 霜蓝（6 主枝 + 12 短枝的霜晶）· `ink` 墨 · `glass` 玻璃（**磨砂只做下半张**，上半张通透）· `gothic` 哥特教堂玻璃（斜铅条 + 四块宝石片 + 暗角）· `sakura` 樱纹 · `asanoha` 麻叶纹（11px 三向细线）· `seigaiha` 青海波（30×15px、每格三道环）· **`yukika` 雪华**（52×44px 平铺的小六角雪花）· **`nishiki` 织锦**（经纬 + 斜纹的满幅织物）· **`kintsugi` 金继**（黑底 + 三道「暗-金-暗」夹心缝）· **`uchiwa` 团扇**（扇钉在下边中点、扇骨向上发散）。另有 `pixel` 备着（当前没有卡用它；2026-09-19 按「不要像素小人头」把 8 张像素卡撤了，生成器的 `pixel` 通道与样式都留着）。
  - **2026-09-20 十种全部重做**，由头都是「在 272px 实际尺寸下看出来的毛病」：glass 整卡 blur(2px) 把人糊到认不出；gothic 的铅条是 44/38/56px 等距十字线、一屏只有 6 格像纱窗；asanoha 的 16px 格子 multiply 盖在人物上；sakura/washi 的花瓣是实心圆（像红点）、纸纹细到看不见；gold 的 screen .42 在浅画上过曝；foil 的七色 conic 一次铺满、互相抵消发脏；seigaiha 的 44×22px 太疏；pixel 用 `border` 画边（占盒尺寸）。
  - 重做后定下**四条规矩**（加/改风格前先读 `21-card-deck.css` 顶部那段）：① 纹样不许盖住主体 —— 用 `--coverlay-mask` 在中心偏上挖空；② 直线纹样的周期要跟卡宽成比例（4~34px），**不许等距十字**（两组线要斜、周期要不等）；③ 每种都要同时给 `--cplate-solid` 与 `--cplate`（实心色喂对比度脚本、渐变换观感）；④ 边一律 inset `box-shadow`，不用 `border`。
  - 实现上风格只改一组自定义属性（框边、名牌底、叠层图案、图案尺寸、混合模式、圆角），卡片结构与两层叠加在所有风格间共用；`isolation: isolate` 把混合模式关在卡内（否则会去混合身后的壁纸），两层叠加都 `pointer-events: none`（否则点卡面翻页会被它们拦掉）。
  - **风格类由 JS 按前缀清理，不写死清单**：写死过一次（新增 glass/gothic 时忘了同步），结果四个风格类叠在同一个元素上、由样式表顺序决定谁赢，换卡拉不动观感且不报错 —— 这类「清单要跟着加」的写法在这条链路上已经栽过两次（另一次是 i18n 的 `data-*` 取值位置）。
  - **深色主题逐条给值**（`--coverlay-op`），不许一条通吃：早先一条 `.home-card { --coverlay-op: .18 }` 把哥特的铅条玻璃压没了。**新增风格必须同时补一条深色值**。
  - 十四种风格的对比图（同一张卡、明暗两套）：`../lab/shots/deck2/styles-final-{light,dark}.png`。
- **流水线**（改卡片只碰左上角那一个文件）：
  ```
  data/home-cards.yaml  ← 单一事实源（图片名/源图/取景/名字/风格/出处）
     ├─ tools/cards/make-cards.py     出卡面 600×840 + 接触表 ../lab/shots/cards_check.png + 报孤儿产物
     ├─ tools/cards/fetch-sources.py  下载候选并归一化到长边 700（**横构图给 --long-edge 1400**）
     ├─ layouts/_partials/home-cards.html   渲染首张卡 + 给 JS 的 data-deck JSON
     └─ scripts/check-deck.mjs        校验：字段齐、style 有对应 CSS 类、源图与产物在、无重名/重复产物、
                                      **报目录里的孤儿产物**、i18n 词条在、credit_url 与 credit 对得上
                                      （CI、push-blog.sh、管理页体检面板三处都跑）
  ```
- **代价**：`assets/images/cards/` 里 32 张产物合计约 1.2 MB（**构建输入，不进访客流量**）；发布侧每张两个派生图合计约 38 KB（1x `272x q78` + 2x `544x q70`），首页只加载第 1 张 + 预取 2 张。2026-09-20 把整站 gzip 预算从 4.5 MB 抬到 5 MB 就是为这笔（见 `scripts/report-size.sh` 顶部的说明：不抬的话加完卡正好顶死、一点余量不剩）。
- **另一条备选形式（当前关着）**：hero 里一块透明底场景插画（`_partials/home-chara.html` + `hugo.toml` 的 `[params.home].chara`，由 `tools/backgrounds/make-ayaka-home.py` 生成）。它与卡片组互斥 —— `[params.home]` 里那条 `cards = [...]` 的旧配置**已经删掉**（模板早就不读它了，留着只会让人改了看不到变化）。
- **同屏人数：2026-09-19 明确选择「都留着不避」** —— 壁纸少女 + 右下角看板娘 + 首页这位，一屏三位。因此约定：三者分居不同区域（壁纸人物在右侧中景、看板娘固定右下、绫华在 hero 左栏或右栏卡里）、尺寸差一档，**不要再往画面中间加人**。想收就改 `defaultPreset` 回 `'city'`（壁纸里没人）或把 `params.home.chara` / `.art` 都留空。

### ㉖ 列表卡片的摘要走 front matter `summary` — 数据纪律，没有代码

主题 `list.html` 的卡片摘要写的是 `.Summary | plainify`。公式在**构建期**已被 KaTeX 渲染成 HTML+MathML（见 ⑥），`plainify` 剥掉标签后把 MathML 文本、`annotation` 里的 TeX 源码与视觉文本三份拼在一起，卡片上就成了 `e=x^−xe = \hat{x} - xe=x^−x` 这种三连（2026-09-18 实测线上 `/categories/课程/`，每张含公式的卡都这样）。

- **修法**：给会出现在列表页的页面写 front matter `summary`（纯文本）。Hugo 会让 `.Summary` 直接返回它，`plainify` 对纯文本无害。9 个课程材料页在 2026-09-18 补上（内容取自各自的 `description`）。
- **不能写进 `archetypes/`**：空字符串会被 Hugo 当成「已设置」，卡片会变成空白——比错乱公式更难查。
- **判据不能是 `math: true`**：课程材料页的 `math` 来自课程主页的 cascade，页面自身 front matter 里没有这个键。所以 `scripts/check-frontmatter.sh` 改扫**正文里的 `$`**（AGENTS 禁止裸 `$` 进正文，故正文里的 `$` 一定是公式），对「正文含公式却没写 summary」的页面发警告（只警告，不阻断）。
- 附带好处：搜索索引（⑪）用的也是 `.Summary`，这 9 页在索引里从错乱公式变成了干净摘要。

### ㉗ RSS 的排除口径 `hiddenInRss` — 数据纪律，没有代码

首页 RSS 走主题 `rss.xml`，它给首页取的是 `site.RegularPages`（**不过滤** `mainSections`），于是两类页面会污染 feed：正文为空的生成页（80 张工具卡片、`/library/` 三级页）`description` 是空的，没有 `date` 的静态页（`about`）`pubDate` 是 `Mon, 01 Jan 0001`。实测改之前首页 feed 有 88 条，其中 80 条是空摘要的卡片。

- **修法**：给这些页面写 `hiddenInRss: true` —— 模板里唯一的消费者就是 `rss.xml` 那一行 `where` 过滤。工具卡片写在 `content/courses/regression-analysis/toolbox/_index.md` 的 cascade 里，`/library/` 三级页写在 `content/library/_content.gotmpl` 的 `params` 里，`about` 写在自己身上。卡片全被排除后，工具库 section 的 feed 必然是空的，所以那个 `_index.md` 同时把 `outputs` 收成 `["HTML"]`（与 `/library/` 同口径）。
- 它与 `searchHidden` 是**两个不同的开关**：前者管搜索索引与首页「最近更新」，后者只管 RSS。生成页两个都要给。
- 修完首页 feed 是 26 条（9 个课程材料页 + 16 个 CMC2026 文档 + 本博客项目页），全部有真实日期与非空摘要。`scripts/check-seo.mjs` 盯住「零值日期」与「空 description」两类。

### ㉚ 列表的排序与标签筛选 — `assets/js/list-tools.js` + `16-list-tools.css`

2026-09-18 加的：`/courses/`、`/projects/`、`/posts/`、课程主页、分层项目主页、各词条页都能按时间重排、按标签筛选。思路与 `terms-filter.js` 一致 —— 脚本就地注入工具栏、重排 DOM，**无 JS 时页面就是服务端排好的那副样子**，不降级也不报错。

- **条目的数据两条路子**：我们自己的模板（`course-index.html` / `project-index.html`）输出 `data-date` / `data-tags`；主题 `list.html` 渲染的卡片没有 data 属性，脚本读它的既有 DOM 契约 —— 日期取 `.entry-footer span[title]`（`post_meta.html` 本来就写 `<span title='2026-09-15 …'>`），标签取 `.card-chips .card-chip--tag`。**这样就不必覆盖主题的 `list.html`**（为两个属性不值得）。
- **筛选器只在有标签的地方出现**：`auto-fill` 式的判断 —— 页面上所有条目都没标签时（如课程主页的章节目录、词条页里同属一个标签的卡片列表），只出排序、不出标签筛选。这不是漏做：那里筛选没有意义。
- **诚实的天花板**：`pagerSize = 10`，排序只作用于**当前这一页**的条目；跨页排序要关掉分页，做不到。各列表页现在基本都在一页内，所以按钮上不写误导性文案，这条限制记在这里。
- 加载判据在 `extend_head.html`：`in (slice "section" "term") .Kind`（library / toolcard 那些自定义 layout 的页面另有 `toolbox.js` 的筛选，不重复注入）。

### ㉛ 标签分组与 CS 库：把「卡片库」泛化成多库

这两件是同一件事的两半，放在一起说。

**标签分组**（`data/tag-groups.yaml` + 覆盖 `layouts/taxonomy.html`）：`/tags/` 总览页按学科分块（数学 / 计算机 / 建模与竞赛）。分组表刻意**不写进 `data/taxonomy.yaml`** —— 那份是拼写的唯一事实源，格式被 `new-content.sh` 与 `check-tags.sh` 按行解析，加字段就要同时改两处解析器。两边漂移由 `check-tags.sh` 报出（只警告），分组表里漏掉的词条会落在页面上那块「未分组」里，不丢内容。`terms-filter.js` 同步改成遍历**所有** `ul.terms-tags` 并在某组被筛空时把组标题一起收起。

**CS 库**（`/cs/`，与数学库平行，卡片点开才展开）：

| 部分 | 数学库 | CS 库 |
|---|---|---|
| 卡片数据 | `data/math-toolbox.json`，`import_course.py` 从课程项目抽 | `data/cs-toolbox.json`，**手写维护** |
| 分支表 | `data/math-branches.yaml` | `data/cs-branches.yaml`（同样两级） |
| 卡片页 | `/courses/<课程>/toolbox/<id>/`，由 `import_course.py` 生成 | `/cs/<id>/`，由 `scripts/gen-cards.mjs` 生成 |
| 页面 | 都由各库目录下的 `_content.gotmpl` 生成三级 | 同 |

- **登记的单一来源**是 `data/libraries.yaml`（key / label / data / path / cards / math）。模板靠 `partials/lib-config.html` 按页面自己的 `.Section` 回表取「哪个库、读哪份数据、分支表是什么、要不要 KaTeX」—— 两库共用 `layouts/_default/library*.html` 与 `toolbox-card.html` / `toolbox-teaser.html` / `toolbox.js`，没有第二份副本。
- **分支表读 yaml，不读 JSON 里那份副本**（2026-09-18 起，两库同源）：CS 的 JSON 根本没有 `branches` 字段，而 yaml 才是那张表的原始出处。
- **卡片页 front matter**（`title` / `layout: toolcard` / `date` / `weight` / `sitemap.disable` / `searchHidden`）两个库同构，`date` 复用已存在页面的 —— 重复生成不会天天改日期。`gen-cards.mjs --check` 已进 CI（阻断），防止「改了 JSON 忘了重生成」。
- 为什么数学卡的页面挂在课程工具库下：见 ㉑；CS 库没有课程，卡片平铺在 `/cs/<id>/`（`libraries.yaml` 的 `cards` 字段就是这个差异的开关）。
- **KaTeX 按库开关**：数学卡的标题里有公式（如「与 $t$ 检验的等价性」），CS 库没有 —— `math: false` 让 CS 的页面连 `katex.min.css` 与按需字体都不加载。

### ㉜ 正文引用卡片：`{{< card "名字" >}}`

原先只有 `{{< tool "1.4" >}}` / `{{< thm "4.4" >}}` 两种按**编号**引用的短代码，且只给编号时徽章显示的是裸编号 `1.4`（`tool.html` 的注释写「工具 1.4」，与实现不符）。

- **新短代码 `{{< card "全方差律" >}}`**：按**名字或别名**在**所有库**里查卡，不必记编号、也不必先知道结论属于哪个库。查到多张时构建期用 `warnf` 列出候选（不静默取第一个）。
- **显示文本的优先级**：显式第二参数 → 卡片名字（剥掉 `$…$` 定界符；仍含反斜杠命令的退回下一档）→ 卡片自己的**类别**（「定理」）→ id。**徽章里不出现编号**（2026-09-19 起，原来这一档是 `label`＝「定理 10.2」）。按别名命中时就显示你写的那个别名（写「全方差律」不会显示成卡片全名）。
- **`tool` / `thm` 保留**（`import_course.py` 生成的 80 处正文在用），文档里推荐新写法。
- 找卡与定位卡片页抽成 `partials/card-find.html`（跨库按 id / 名字找）与 `partials/lib-config.html`（按 section 认库），`card-ref.html`、`toolcard.html`、`library-section.html` 三处共用同一份逻辑。

### ㉝ 列表多列网格与一键到底

- **列表卡片铺成多列**：`/courses/` 上两门课原本各占一整行（两屏才看完两门课），现在 `main.main:has(> .post-entry)` 用 `auto-fill minmax(320px, 1fr)` 铺成两列，窄屏自动回落单列；课程主页的章节目录、项目主页的子项目目录同样从 `flex-direction: column` 改成网格。**坑**：`.page-header` 主题设了左右 `auto` 外边距（用来居中），在网格里 auto 外边距会吃掉整条轨道的剩余空间、让网格项缩成内容宽度（实测页头面板只剩 246px），所以 `01-cards.css` 里要顺手把它清掉。
- **一键到底**：与主题的「返回顶部」配成一对（`#bottom-link` 复用主题 `.top-link` 的外观，只覆写 `bottom` 与图标）。位置由 `14-mascot.css` 的 `--float-bottom` 统一控制 —— 那个值原本在四个断点里各写一遍给 `.top-link`，现在两个按钮共用一个变量；到顶在上、到底在下（到底占的是原来到顶的位置，那个位置是照着看板娘头顶调好的）。
- **为什么用 `<button>` 而不是 `<a href="#bottom">`**：主题 `footer.html` 给全站 `a[href^="#"]` **逐个元素**挂了点击代理（`scrollIntoView` + 对非 `#top` 的锚点 `pushState`），那是**同一个元素**上的另一个监听器，`stopPropagation` 拦不住 —— 实测地址栏会留下 `#bottom`。button 不在那个选择器里，行为完全由自己的脚本掌控（语义也更准：这是动作，不是导航）。没 JS 时主题的 noscript 样式会把 `.top-link` 一起隐藏，不会留下点不动的按钮。

## 4. 九处有意的主题模板覆盖

除上述 hook 之外，仓库里有九处**有意**覆盖主题（是对「不复制主题模板」的例外）。`extend_head.html` / `extend_footer.html` / `extend_post_content.html` / `comments.html` 是主题设计好的 hook，覆盖它们不算在内。

1. `layouts/courses/course.html`（`layout: "course"`）与 `layouts/courses/chapter.html`（`layout: "chapter"`）：列表页没有任何 hook，而这两页分别需要自动章节目录与入口卡片。两个模板都很小、只复用主题 partial（`breadcrumbs.html`/`anchored_headings.html`，页头共用 `course-header.html`），且只有显式写了 `layout` 的页面才命中，不影响 `/courses/` 列表页与文章页。**改外观请优先改 `04-course.css`**
2. `layouts/index.json`：该模板无 hook 可挂，而正文截断无法从配置实现
3. `layouts/_partials/index_profile.html`：首页在 profileMode 下由主题 `list.html` 直接调用它，没有 hook 可挂，而首页需要「快捷入口 + 最近更新」两块内容。改这一处时对照 `themes/PaperMod/layouts/_partials/index_profile.html`，确认主题侧是否有新变化需要合并
4. `layouts/_partials/post_meta.html`：**唯一一处「复制主题 partial 再加一行」**（第 ⑱ 项）。它是列表卡片与详情页共用的元信息块，没有 hook 可挂，而卡片要一块计数/标签。与前三处不同：这里**逐字保留**主题实现，只在末尾调用 `card-chips.html`，主题升级时对照 diff 手工合并即可。若哪天主题给它加了 hook，优先换回 hook
5. `layouts/404.html`（第 ㉙ 项）：404 页没有任何 hook 可挂，而主题那份全文只有 `<div class="not-found">404</div>` 一行 —— 线上产物的可见文字就只有「404」三个字符，访客到了这里没有任何出路。**这是九处里覆盖成本最低的一处**（主题原件 3 行），主题升级时把 `themes/PaperMod/layouts/404.html` 再看一眼即可
6. `layouts/taxonomy.html`（第 ㉛ 项）：`/tags/`、`/categories/` 总览页要把词条按学科分块展示（见 `data/tag-groups.yaml`），而主题那份是平铺。markup 与主题版保持一致（`ul.terms-tags` + 计数 `sup`），只把「一个 ul」改成「每组一个 ul」，`terms-filter.js` 已同步适配
7. `layouts/baseof.html`（第 ㉞ 项）：跳过导航链接与 `lang` 属性。**这一处与前面六处的理由不同** —— 不是「原件短」或「没有 hook 可挂」，而是**位置本身不可达**：要改的一处在 `<html>` 上、一处在 `<body>` 开头，而主题的四个 hook 分别在 `<head>` 内与 `</body>` 之前，谁都够不到。主题原件 31 行，逐字保留、只差三处（详见下节 ㉞），主题升级时与 `themes/PaperMod/layouts/baseof.html` 逐行对拍即可。**注意它是全站每个页面的渲染入口**，改动后要按页型抽查（首页 / section / term / 单页 / 404 / search）
8. `layouts/_partials/templates/schema_json.html`（第 ㉟ 项）：**逐字保留主题实现，只差三处**（主题原件 129 行 + 一段说明注释），与第 4 条 `post_meta.html` 是同一手法：删掉 `articleBody`、零值日期不输出、`@type` 随发布日期在 `BlogPosting` / `WebPage` 之间走。`articleBody` 把整篇正文 `plainify` 后复制进 `<head>` 的 JSON-LD 里；本站正文是构建期渲染的 KaTeX，plainify 之后公式文本会出现三遍（MathML 表示 + TeX annotation + katex-html 字形文本），于是这个字段既大又低质 —— 实测重页单页 25–27 KB、占该页 gzip 的 17–20%。删它安全：`articleBody` 在 schema.org 里是**可选**字段，Google 富结果不使用，仓库里也没有任何东西依赖它（`check-seo.mjs` 对它零断言，已核对）。**升级主题时与主题那份逐行对拍，确认差异仍然只有这三处。** 删改后不必再手工 `JSON.parse` 每个 `ld+json` 块 —— `check-seo.mjs` 已经常驻断言（含 `BlogPosting` 的必填字段与零值日期），见 ㉟

9. `layouts/_markup/render-image.html`（第 ㊲ 项）：主题 `_markup/` 下只有 `render-image.html` 这一个文件，内容图需要补 `width`/`height`（主题原版不给尺寸）并把 PNG 转无损 WebP，而渲染钩子没有「部分覆盖」的机制，只能整份接管。手法与第 4、8 条相同：**逐字保留主题实现**（URL 解析、query/fragment 拼接、属性透传、`%q` 转义一行未改），只在拿到资源之后插入两段。**改它必须同时确认 `00-theme.css` 里 `.post-content img` 的 `height: auto` 还在** —— 主题 reset 只有 `max-width: 100%`（`core/reset.css`），只补尺寸属性会在窄屏把图纵向压扁（实测 400px 视口下 660×440 的图变成 333×440），且**构建不报错**。主题升级时与 `themes/PaperMod/layouts/_markup/render-image.html` 逐行对拍

**另有一处是「移位置」而不是「覆盖」**：`layouts/_default/{library,library-branch,library-section,toolcard}.html`。它们原本在 `layouts/library/` 与 `layouts/courses/` 下，2026-09-18 加了 CS 库之后搬到 `layouts/_default/` —— Hugo 的布局查找是 `layouts/<section>/<layout>.html` 优先，`layout: library` 只在 section 恰好叫 `library` 时命中（数学库是撞上的），CS 库的 section 是 `cs`，于是**静默回落到主题列表页**。`_default/` 是任何 section 的通用回落位，front matter 里的 `layout:` 一个都不用改。教训记在 [`traps.md`](traps.md)。

### ㉘ 词条页的说明文字 — `content/<taxonomy>/<词条>/_index.md`

`/tags/xxx/`、`/categories/xxx/` 这类词条页现在各有一句说明。机制上不需要任何代码：主题 `list.html` 的 page-header 本来就会渲染 `.Description`，缺的只是数据源 —— `data/taxonomy.yaml` 是*词表*（格式被 `new-content.sh`/`check-tags.sh` 解析，**不能加字段**），而仓库里原本没有任何词条目录。

- 说明写在 `content/<taxonomy>/<词条>/_index.md`，只写 `title`（与词条同名，免得 h1 变样）+ `description`。
- **目录名必须与词条 URL 一致**，不是与词表里的写法一致：`CMC2026` → `content/tags/cmc2026/`、`Go Template` → `content/tags/go-template/`、`CSS` → `content/tags/css/`，中文词条用中文字符（`content/tags/回归分析/`）。踩坑记在 [`traps.md`](traps.md)。
- 2026-09-18 一次补齐 13 个（11 个标签 + 2 个分类）。`文章` 分类当时零词条、没有页面，没建。
- 这解决了「`CMC2026` 这种竞赛代号对陌生读者没有意义」的问题 —— 词条页现在是「一句它是什么 + 相关页面列表」。

### ㉙ 404 页与页脚 RSS 入口 — `layouts/404.html` + `extend_footer.html` + `15-extras.css`

- **404 页**：覆盖主题模板（第 4 节第 5 条）。404 大字沿用主题的 `.not-found` 类，下面补一句提示与三个入口（回到首页 / 搜一下 / 逛数学库）；文案全走 i18n。**必须把主题 `.not-found` 的 `position: absolute` 收回正常流**（`15-extras.css`），否则加进去的内容会跟那个 160px 的大数字重叠。
- **页脚 RSS**：首页走 profileMode，不渲染 `list.html` 里那个带 RSS 图标的 `page-header`，所以「订阅」在全站唯一稳定的位置是页脚 hook。它与页面无关（全站同一个地址），符合 [`traps.md`](traps.md) 对 `extend_footer` 的约束。
- 两处样式都在 `15-extras.css`：它们各自太小，不值得各起一个编号文件。

### ㉞ 无障碍：跳过链接、`lang` 与动态列表播报 — `baseof.html` + `17-a11y.css` + `a11y-announce.js`

2026-09-18 体检的结论：这个站此前**没有任何一项无障碍基础件** —— 没有跳过导航链接、没有 `sr-only` 工具类、动态更新的列表没有一处 `aria-live`，`lang` 还是 `zh`。前两项补上了，第三项按页面逐个补。

**跳过导航链接**（`layouts/baseof.html`，第 4 节第 7 条）。页头有 8 项导航，键盘用户此前每次都要 Tab 穿过它们才能到正文。要点：

- 它是 `<body>` 的**第一个**子元素 —— 顺序即功能，放到别处就没有意义了。
- 落点是 `<main class="main" id="main-content" tabindex="-1">`。**`tabindex="-1"` 不能省**：只加 `id` 的话锚点跳转只移动滚动位置、不移动焦点，键盘用户再按 Tab 仍然从页首开始，等于白跳。
- CSS 用 `position: fixed` + `transform: translateY(-250%)` 藏起来，而不是常见的 `left: -9999px`：后者在 RTL 或窄屏下可能撑出横向滚动条，且依赖「负值够大」这个隐含前提。`transform` 不影响 Tab 顺序，所以它始终可达。聚焦时回到左上角，`z-index: 100`（站上现有最大值是主题的 99）。
- 落点元素上明确写了 `outline: none`：焦点确实进了正文，但给整片正文描一圈 2px 强调色在视觉上像是渲染坏了。只取消这一个元素，全局 `:focus-visible` 不受影响。

**`lang="zh-CN"`**。`hugo.toml` 里 `[languages.zh] locale = 'zh-CN'` 早就生效了（`og:locale` 一直是 `zh_CN`、RSS 一直是 `zh-CN`），只有 `<html lang>` 没跟上 —— 它取的是 `site.Language`，即语言**键** `zh`。改成 `site.Language.Locale` 即可。**不要**为了这个去把语言键改名成 `zh-CN`：那会让 Hugo 去找 `i18n/zh-CN.toml`，而站点文案在 `i18n/zh.toml`，一旦 i18n 的基语言回退不生效，全站 UI 文案会变成空串或键名。同理 `dir` 用的是 `.Language.Direction`（`.Language.LanguageDirection` 在 Hugo 0.158 起报废弃告警）。

**动态列表播报**。三处列表会原地重写内容，而读屏不会自动报告 DOM 变化，用户敲完关键词听不到任何反馈：

| 位置 | 做法 | 文案键 |
|---|---|---|
| 搜索结果（`#searchResults`） | `assets/js/a11y-announce.js`：MutationObserver 观察条数，写进一个 `.sr-only` 的 `role="status"` 节点 | `searchResultCount` / `searchNoResult` |
| `/tags/` 词条筛选 | `terms-filter.js` 自建 `.sr-only` 的 `role="status"` | `termsFilterResult` / `termsFilterEmpty` |
| section / term 页的排序与标签筛选 | `list-tools.js` 给已有的可见结果行加 `role="status"` | 复用 `listToolsResult` |

三个必须注意的点：

- **搜索页那处没覆盖主题模板**。`#searchResults` 在 `themes/PaperMod/layouts/search.html` 里，为一条播报再加一处覆盖不划算（第 4 节已经有九处了），所以改用脚本挂观察者。若哪天要改成覆盖模板，先想清楚第 4 节那句「不要整份复制主题模板」。
- **零条结果的歧义**。主题的 `fastsearch.js` 把「输入为空」与「没有匹配」都渲染成空列表（`renderResults([])` 被两条路径共用），所以零条时必须回头看输入框：为空是清空操作，**什么都不该播报**；有输入才是真的没搜到。
- **只在文字真的变了才写** `textContent`。重复写入同样的文本会让部分读屏反复播报，所以三处都加了 `if (x !== said)` 的比较。

**主题模板里硬编码的英文可访问名**（2026-09-19 补，`assets/js/a11y-controls.js`）。PaperMod 把四个全站控件的可访问名写死成英文，中文站点上读屏用户听到的就是英文；而项目自己注入的同类控件（`#bottom-link`、快捷入口导航）本来就走的 i18n，所以这是**漏网**，不是有意的取舍：

| 控件 | 主题模板里的原文 | 现在的文案键 |
|---|---|---|
| `#theme-toggle`（明暗切换，`header.html`） | `aria-label="Toggle theme"` / `title="(Alt + T)"` | `themeToggleLabel` / `themeToggleTitle` |
| `#top-link`（返回顶部，`footer.html`） | `aria-label="go to top"` / `title="Go to Top (Alt + G)"` | `topLinkLabel` / `topLinkTitle` |
| 搜索输入框（`search.html`） | `aria-label="search"` | `searchInputLabel` |
| 搜索结果列表（`search.html`） | `aria-label="search results"` | `searchResultsLabel` |

- **不覆盖主题模板，改为脚本补属性** —— 与上面那处播报是同一个判断：为四个属性再添一处覆盖不划算（第 4 节已经有九处了）。脚本全站加载（很小），页面上没有对应元素时静默跳过。
- **不存在「无 JS 时属性缺失」的窗口**：这两个控件本来就只在有 JS 时才有意义 —— `#theme-toggle` 的点击逻辑与 `#top-link` 的显隐都在主题 `footer.html` 的内联脚本里，主题 `head.html` 的 `<noscript>` 还把 `#theme-toggle` 与 `.top-link` 一起藏掉；搜索输入框在主题模板里是 `disabled`，由 `fastsearch.js` 启用。
- 顺带把这两个控件里的装饰 `<svg>` 标了 `aria-hidden="true"`：可访问名已经在按钮/链接上，不隐藏时部分读屏会把图标一起念出来。
- **怎么验**：产物 HTML 里仍然能看到主题那几串英文（脚本是运行时改 DOM 的），所以 grep 产物证明不了这件事。做法是拿**构建后的压缩包**在假 DOM 上跑一遍，断言六处属性都已写入（可复跑：从产物里取出 script 标签的 `data-*` 与 `src`，用 `new Function("document", code)` 传入桩 document）。

**没做的（有意）**：没有换焦点可见样式（主题那套 `:focus-visible` 的 2px 强调色轮廓对比度足够）、没有做颜色对比度复审（`00-theme.css` 头部记着强调色 7.4:1、次要强调 5.6:1，都过 WCAG AA）、没有引入任何无障碍测试工具。**「减少动效」偏好**此前只覆盖了看板娘（`14-mascot.css`）与底部按钮的平滑滚动（`extend_footer.html`），阅读进度条的淡入淡出是漏网的，2026-09-19 在 `08-reader.css` 补上。最实际的下一步仍是拿读屏器手动过一遍搜索页与标签页 —— 静态断言测不出播报行为（要有真实焦点）。

### ㉟ JSON-LD：删掉 `articleBody`、零值日期与 `@type` — `layouts/_partials/templates/schema_json.html`

见第 4 节第 8 条（那是第 8 处主题覆盖）。这里只记**怎么验**与**别再犯的错**：改这个文件很容易留下悬空逗号或漏掉逗号，而**语法坏掉的 JSON-LD 没有任何构建期报错**，爬虫那边是静默失效。

实测收益（2026-09-18，`hugo --minify --gc --cleanDestinationDir` 后）：`BlogPosting` 块从约 25,000 B 降到 **821 B**，最重页 gzip 108 KB → 75 KB（−31%），整站 gzip 3260 KB → 2934 KB。

**2026-09-19 补：零值日期与 `@type`。** 没有 front matter `date` 的页面 —— `/about/` 这类静态页，以及 `content/library/_content.gotmpl`、CS 库内容适配器生成的分类页与卡片页 —— 此前会输出 `"datePublished":"0001-01-01T00:00:00Z"`：**格式合法但值是错的**，在爬虫侧属于无效日期。实测 36 个产物页面中招（其中生成页连 `dateModified` 也是零值，因为 `enableGitInfo` 对生成页没有历史可查）。值得一提的是 `/about/` 的 front matter 注释显示同一问题在 RSS 那侧早就用 `hiddenInRss: true` 处理过 —— JSON-LD 这侧是漏网的。现在的口径：

- 零值日期**整行不输出**（`datePublished` 看 `.PublishDate`、`dateModified` 看 `.Lastmod`）。安全的前提是这两个字段**前面每一项都以逗号结尾**（`image` 的两个分支、`inLanguage`），所以删行不会留下悬空逗号 —— 改动这段前先确认这一点。
- `@type` 随发布日期走：有 `date` 才是 `BlogPosting`，没有则降为 **`WebPage`**（Google 对无发布日期页面给出的上位类型）。`headline`/`image`/`keywords`/`wordCount`/`publisher` 在 `WebPage` 上同样合法，因为它们都是 `CreativeWork` 的属性。否则会留下一个缺 `datePublished` 的 BlogPosting，在 Search Console 里就是「缺少字段」警告。
- **复核手段已固化成断言**：`check-seo.mjs` 遍历产物里每个 `ld+json` 块做 `JSON.parse`，并对 `BlogPosting` 断言 `headline`/`author`/`image` 非空、日期不含 `0001`。这条以前只能人工核对，且 2026-09-18 那轮已经记下「`check-seo.mjs` 不查 JSON-LD 的语法」这个缺口。
- **自测方式**（改断言本身时用）：把任一产物页的块改坏（例如删掉一个逗号），`node scripts/check-seo.mjs` 应报出「文件 + 第几个块 + 错误位置」并以 1 退出；改回后恢复通过。实测产物 211 个 HTML、317 个块、114 个 BlogPosting 全部可解析。

### ㊱ 正文的横向溢出与交互反馈 — `08-reader.css` + `10-nav.css` + 卡片各自的 CSS

**行间公式会撑宽整页**（2026-09-18 修）。`.katex-display` 是 `overflow-x: visible`，而它内部 `white-space: nowrap`，公式不折行：实测 380px 视口下一行 924px 的公式把整个文档撑到 **957px**，右侧内容被裁掉、得左右拖动整页才能读完。修法是给 `.post-content .katex-display` 加滚动容器（`08-reader.css`，**不加媒体查询** —— 正文栏 720px 也小于 924px，桌面同样会中招）。修完实测视口 370px 时文档宽度也是 370px，22 个行间公式里 17 个变成独立滚动容器。

- **`overflow-y` 必须显式写 `hidden`**：只写 `overflow-x: auto` 时另一轴会从 `visible` 变成 `auto`，而公式的上下标、根号常常溢出内容盒一两像素，那一轴就会冒出纵向滚动条。
- **宽表格不用管**：主题 `reset.css` 把 `table` 放进了 `display: block` 那一组并给了 `overflow-x: auto`，实测 380px 下 table 的 `scrollWidth` 大于 `clientWidth`，是表内滚动、不撑页面。（第一次排查时用「元素宽度 > 视口宽度」当判据，把 `thead`/`td` 也算成了溢出源 —— **判据必须带上「祖先是否有裁剪」**：祖先有 `overflow` 非 `visible` 的元素是被包住的，不撑页面。按这个判据重测，真正的溢出源只有 KaTeX。）

**桌面导航此前没有任何悬停反馈**：主题只写了 `.menu .active`，**从来没有 `.menu a:hover`** —— 实测真实鼠标移上去时 color / background / text-decoration / opacity 全都不变。`10-nav.css` 里补了一套，2026-09-18 的形态是「沿用 `.active` 的视觉语言（2px 下划线 + 同样偏移）但换成 `--accent`」，2026-09-19 改成**悬停亮出一圈蔷薇边**（`box-shadow: 0 0 0 1px var(--accent)`）：当前页仍走主题那份下划线 + 500 字重，于是「下划线 = 我在哪、药丸边 = 鼠标在哪」不再混为一谈。分页按钮（主题的反色药丸）同期也改了形，见下。

**这类补规则不要动 padding/gap —— 菜单是 flex 行布局，加内边距会让换行点提前，顶栏在中间宽度就多折一行**（2026-09-18 的结论）。2026-09-19 要给菜单项加药丸形状，就必须加内边距，做法是**把宽度用等式抵消掉**：

```
原来：文字总宽 + 7 × 24px 间距
现在：文字总宽 + 8 × (2×7px) 内边距 + 7 × 8px 间距     8×14 = 112 = 7×(24-8) ✓
```

两条硬约束：
- **边只能用 `box-shadow` 画、不能用 `border`**：`border` 占进盒尺寸（每项 +2px），实测那一版菜单宽度从 625.2 涨到 641.2，抵消掉的 112px 只回来 96px。改成 box-shadow 环之后实测菜单宽度 **625（与改版前逐像素相同）**，1024px 视口下 `menuScrollW == clientWidth`、不出现横向滚动条（这是最紧的一档：顶栏内容区 976 = logo 292 + 间距 24 + 菜单 625，只剩十几像素余量）。
- **改菜单项数量要重新配平**（n 项要满足 `14n = 16(n-1)`，n=8 是唯一整数解）—— 项数一变就得同时调内边距或间距，不能只改一个数。

**分页按钮同期改形**（`10-nav.css` 第二节）：主题那份是反色实心药丸（`--primary` 底 + `--theme` 字），本站其它药丸（快捷入口、首页 chip、列表筛选）都是「`--surface` 底 + 1px `--edge` 边」的形态，它是唯一的例外，现在统一了。两条要注意的：
- **悬停不能沿用旧写法**（底变 `--accent`、字不动）：改成 `--surface` 底之后，`--primary` 字压在 `--accent` 底上只有约 1.9:1。现在悬停只换环色与字色，文字始终压在 `--surface` 上。
- **尺寸仍必须不变**（首版那条结论）：边用 `inset box-shadow` 而不是 `border` —— 主题那套是 `line-height: 36px` + `border-radius: 18px` 算好的，加 1px border 会撑到 38px 高、圆角也不再是正圆。实测改完仍是 36px 高（87.3×36）。

**顶栏图标按钮与几个小控件补了常驻边**（2026-09-19）：`#theme-toggle`（明暗）/ `.bg-switch`（背景套）/ `.nav-toggle`（窄屏菜单）三个图标按钮统一成 34×34 + 圆角 8px + 1px `--edge` —— 在此之前只有窄屏那个有边框，另两个被 `core/reset.css` 清掉了边框与底色、主题只留了 `padding: 0 .4rem`。`#top-link` / `#bottom-link`（两个悬浮按钮）、`.copy-code`（复制代码）、`.pagination`（分页）同样补了边。这几处一律用 `box-shadow` 画环：它们要么尺寸被算死（分页 `line-height: 36px`、悬浮按钮 `2.5rem` 配 `padding: 10px`），要么贴边摆（复制按钮在代码块右上角）。`--edge` 的取值与「哪种元素用哪种手法的边」见 ⑫。

**三个自定义列表卡片缺 `:focus-within`**：主题的 `.post-entry` 自带（`post-entry.css:58`），而 `.course-index-item` / `.project-index-item` / `.home-recent-item` 原先只有 `:hover`，键盘用户 Tab 进去拿不到鼠标那样的反馈。三处的 `:focus-within` 都写在各自 `:hover` 规则旁边（`04` / `05` / `09`）。

**阅读进度条补了 `prefers-reduced-motion`**（2026-09-19）：`#reading-progress` 的 `transition: opacity .25s ease` 是仓库里唯一没做减少动效处理的过渡（看板娘与底部按钮都做了），加了 `@media (prefers-reduced-motion: reduce)` 后变成直接显隐 —— 条的位置变化本来就来自 scroll 事件驱动，去掉过渡不损失任何信息。

### ㊲ 内容图的 WebP 与尺寸属性 — `layouts/_markup/render-image.html` + `00-theme.css`

覆盖主题的渲染钩子（第 4 节第 9 条），只做两件事：给内容图补 `width`/`height`，并把 PNG 交给构建期转成**无损** WebP。**源文件保持 PNG 不动** —— 那 4 张实验图的出处是实验页里教 `ggsave()` / `png()` 的 R 代码，改文件名会变成「代码写 png、页面里是 webp」，而那个页面本身就是在教这件事。

**为什么是 lossless 而不是常规的 q82**：调色板 PNG（`03_resid.png`、`04_obs_vs_fit.png`）走有损 WebP 会**涨一倍** —— 实测 q82 +100.4%、q90 +150.2%、最大像素差 138；而无损四张全部更小（−39.4% ~ −74.1%）。总账 49598 → 17176 B（**−65.4%**）。**产物与源 PNG 逐像素完全一致**：`Resize "<W>x<H> webp lossless"` 是纯格式转换、不做重采样，已用 `../lab/shots/verify_shipped_webp.py` 对 `public/` 里真正发出的那 4 个文件逐个 `numpy` 比对确认（不是「看着差不多」）。量法脚本 `../lab/shots/imgfmt_measure.py`（各档字节 + PSNR）与 `../lab/shots/hugo_webp_verify.py`（草稿期像素比对）可复跑。

**JPEG 一律不转，顺手记一个「拿错基线」的教训**：首页头像的基线**不是**仓库里那张 21963 B 的 `avatar.jpg`，而是模板 Resize 之后实际发出的 `avatar_hu_*.jpg`（240×240，**13584 B**）—— 拿源文件当基线会得出「省 12 KB」的错误结论。实测 Hugo 出 webp q82 是 15036 B、Pillow q75 是 10384 B，即只有 q75 才赢约 3.2 KB，不值得为 3 KB 引入一次二次编码。**量图片收益时，基线永远是 `public/` 里那个被引用的文件。**

**「取小者」护栏**：比较转换前后 `.Content` 的字节数，只有更小才换。注意 **`.Len` 在图像资源上不可用**（报 `can't evaluate field Len in type images.ImageResource`），只能走 `.Content | len`。有这个护栏，将来某张 PNG 若正好不适合 WebP（例如极小的图标，容器开销占主导），行为自动回落到原图，不会悄悄变大。

**只处理 `png` 这一种副类型**，这是刻意的：`svg` 在 Hugo 里不可处理、`gif` 会被拍平成单帧，所以只认 `png` 就等于把它们（以及 JPEG）全部留给主题原逻辑。**已知边界**：动画 PNG（APNG）的副类型也是 `png`，会被转成静态无损 WebP —— 站点现在没有这种文件，若哪天真要放动图，先在这里加判据。

**`width`/`height` 必须配 `height: auto`**：这是本次唯一「构建能过、页面却坏」的点 —— 主题 reset 只有 `img { max-width: 100% }`（`core/reset.css`），**没有 `height: auto`**，于是窄屏下宽度被压到 100%、高度仍锁在属性值上，图片纵向压扁。`00-theme.css` 的 `.post-content img` 里补了这一行；补上后浏览器仍按属性里的宽高比预留空间，防跳动的收益不受影响。实测 400px 视口：4 张图渲染 333×222、宽高比 1.5 与原图一致，控制台 0 条错误（量法：`../lab/shots/shots.py --js`，注意站点全局有 `scroll-behavior: smooth`，定位截图前要先把滚动改成 `auto`，否则截到的是动画中途）。

**已知残留（不影响访客）**：Hugo 默认会发布 page bundle 里的**所有**资源，所以那 4 张源 PNG（49598 B）仍被复制进 `public/`。它们已无任何页面引用（页面里是 WebP），是产物里的死重，但无人引用即不下载，只占产物体积；整站 raw 18323 KB / 预算 24576 KB，余量足够，暂不动。

## 5. 总览页标题

`/tags/`、`/categories/`、`/series/` 三个总览页的标题由 `content/<taxonomy>/_index.md` 提供。**不要**再新建 `content/tags.md` 之类带 `url` 的普通页面去覆盖它们——那会把 `kind=taxonomy` 的列表页顶替成普通文章页（曾因此让「标签」入口整页空白）。

## 6. 性能账（2026-09-15 实测）

量法：`../lab/shots/perf.py`（自管 Edge headless + CDP，`--throttle 4g` 按 4 Mbps/70 ms 模拟）与 `../lab/shots/jank.py`（滚动期间读 CDP Performance 计数器）。**下面每个数字都要能复跑**，改完外观/资源后重跑一次对账。

| 指标 | 改前 | 改后 |
|---|---|---|
| 首页 4 G 传输（含 dev 的 `livereload.js` 78.6 KB） | 321.3 KB · load 828 ms | 195.4 KB · load 581 ms |
| 首页 4 G 传输（只算线上会下的） | 242.7 KB | 116.8 KB |
| 站点背景图 | 191.4 KB（JPEG） | 65.5 KB（WebP） |
| 实验页 4 张图（`courses/regression-analysis/chapter-01/lab/figs`，机制见 ㊲） | 49598 B（PNG） | 17176 B（无损 WebP，−65.4%，逐像素一致） |
| `static/favicon.ico` | 3.3 KB | 3.9 KB（16/32 两帧；256 帧挪去了管理页图标） |
| `static/apple-touch-icon.png` | 5.7 KB | 14 KB（180×180 真彩原本 61 KB，量化到 256 色） |
| 整站输出（`report-size.sh`） | 9833 KB | 18983 KB（新增「回归分析」课程：3 页笔记 + 作业 + 实验 + 80 张工具卡页；预算 12 → 24 MB） |
| 滚动脚本开销（最重页，110 次滚动） | 0.019~0.020 s | 0.004~0.005 s |

### 2026-09-18 追加六：CLS 的定位（首页干净，重页是已知的 KaTeX 字体换字）

按上面的量法复跑了一次 4G（`startjank.py --headless`，首页与最重的 `projects/cmc2026/problem-03/问题三/` 各一条臂），把下面「CLS 0.11~0.20」那格的原因钉到了具体节点：

| 页面（4G） | DCL / load | HTML | DOM | layout-shift |
|---|---|---|---|---|
| 首页 | 464 / 473 ms | 17 KB | 168 | **一条都没有** |
| 问题三 | 2023 / 3645 ms | 703 KB | 16231 | **合计 ≈0.21**：`TR.` 表格行 0.0777 + 0.0833 + 0.0457（占 98%），`SPAN.base` 若干条 0.0001~0.002 |

位移集中在 729~798 ms，而这一页的 KaTeX 字体到达窗口是 492~785 ms（`Main-Regular` 26 KB @492→785、`Math-Italic` 16 KB @493→738、`Caligraphic` @598→753）—— **字体到货即把表格行撑高**，所以 shift 的 source 报的是 `<tr>` 而不是公式：公式在单元格里，单元格变高就带着整行下移。这与下面「layout-shift 源 `SPAN.base`」是同一件事的两种视角，节点归属取决于谁真的动了。

**这次没有改任何东西**，两条候选改法都踩在已有结论上：`font-display: optional` 能让换字不重排，代价是首访慢网下公式整页回退字体（数学站不接受，且 `static/katex/katex.min.css` 是 `upgrade-hugo.sh` 会重写的厂商文件）；字体预加载在下面那条结论里**仍是未验证状态**（本地 HTTP/1.1 的 6 连接限制会拖慢 CSS，生产走 Fastly HTTP/2 但没测），要合并得先跑线上前后对照。

结论：CWV 差档只出现在公式最密的那几页，首页是干净的（0 位移、DCL 464 ms）。

### 2026-09-19 追加七：首页加了「站点规模 / 按类浏览 / 入场淡入」之后的账

同一套量法复跑（生产构建 + `../lab/shots/serve_public.py` 起静态副本，**不用 dev server** —— 它会多下 78.6 KB 的 `livereload.js`）：

| 指标 | 值 | 出处 |
|---|---|---|
| 首页 4G 传输 / 请求数 | 295.5 KB / 21 | `../lab/shots/perf-home-4g2.json` |
| 首页 4G DCL / load / FCP | 441 / 742 / 564 ms | 同上（两次跑 DCL 424~441、FCP 496~564，落在既有噪声里） |
| 首页 HTML / DOM | 16 KB / 230 节点（原 17 KB / 168） | `../lab/shots/home/*.png` 同批构建 + `startjank.json` |
| layout-shift / 长任务 | **0 条 / 0 条**（六轮，开/关动画都一样） | `/tmp/labrun/startjank.json`（交替重复三轮 ×2 臂） |

- **传输增长全部来自预取那一张背景图**：日间城市 63.0 KB、日间少女 93.0 KB（当前生效的那张）—— 也就是说 295.5 KB 里有 156 KB 是壁纸，其余是主样式 59.5 KB、看板娘 41 KB、头像 4.7 KB、脚本与导航小人各 1 KB 上下。**要不要这笔预取是产品决定**（见 ⑫ 那条），不是性能问题：它发生在 `load` 之后，不推迟任何加载指标。
- **入场动效「吃不吃帧」这件事量不出来**：`startjank.py --headless` 的首秒帧窗波动很大，交替重复三轮后**关掉动画那组同样出现 6/1/2 帧超 7ms（单次最大 90.9ms）**，而开动画那组是 1/20/0 帧（最大 12.2ms）—— 两臂差异（中位 1 vs 2 帧）远小于轮间波动，说明这个环境里首秒是噪声主导（冷启动、合成分层预热），**不能拿单次差值下结论**（口径同下面那条「同配置两次 4G 运行 DCL 差 3 s」）。真要判它得上真窗口 165Hz 的 `frameab.py` 反复多轮。
- 体积预算照样全过（`report-size.sh --fresh`：单页 gzip 76 ≤ 160、整站 gzip 3364 ≤ 4608、搜索索引 48 ≤ 52 KB）。

### 2026-09-15 追加五：数学库 `/library/` 拆成三级（一页 80 张卡 → 一页一张目录）

线上量到的病：`/library/` 单页铺 80 张索引卡 + 分支大纲，线上 4 G 实测（`../lab/shots/startjank.py --arms libperf-arms-live.json`）DCL 494 ms / load 1405 ms / 加载期一个 **103 ms** 长任务 / 滚动区 6588 px，而它承担的信息只是「有哪些大类」。

改法与拆法见 ㉒。**前后对账用同一个方法量**（真窗口 + CDP 4 G 节流，`startjank.py --arms ../lab/shots/libperf-before-after.json`）：改前那份不是旧数据，是用 `git worktree add --detach D:/Study/projects/blog/lab/shots/before-lib HEAD` 把已发布的站点单独构建、另起一个 `serve_public.py` 量出来的（本机 TTFB 两边都是 4 ms，可直接比）。

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
- **KaTeX 字形预加载**（`<link rel=preload as=font>` 按本页出现的类名挑字形）：本地延迟模型（`../lab/shots/serve_delay.py`，每请求 +300 ms，HTTP/1.1）下**无效**——首个字体请求确实从 686 ms 提前到 333 ms，但最后一个字体到达时间不变（1265 → 1252 ms），FCP 反而从 802 退到 932 ms（4 次重复，离散 ±10 ms）。原因是浏览器对单主机只有 6 条连接，9 个字形（133 KB）一起挤进去，把阻断首屏的 CSS 往后排。生产的 Fastly 走 HTTP/2 多路复用，不会再排队，**但线上没有实测，所以没合并**（真要试：合并后跑一次 `../lab/shots/startjank.py --arms <线上 arms>` 对 FCP 与字体到达时间，不达标就撤）。

### 2026-09-15 追加四：拆掉最重页的附录

`projects/cmc2026/problem-03/问题三/` 原来 1082 KB / 23566 元素，其中附录 A 伪代码 + 附录 B Python 参考实现（4 个 `<pre>`、1245 行）单独占 380 KB / 7321 元素。按 § 拆页先例搬成《问题三_参考实现》（`math: false`，不加载 KaTeX 样式与字形）：

| | 主页面前 | 主页面后 | 新页 |
|---|---|---|---|
| raw HTML | 1082 KB | **658 KB** | 454 KB |
| DOM 元素 | 23566 | **16222** | 7597 |
| 最长长任务（headless，warm） | 97 ms | **64 ms**（模型估 60~100，见 `../lab/shots/q3-split-plan.md`） | 52 ms |
| 该页排序 | 全站第 1 重 | 第 8 重 | — |

同一手术对 M1 三页笔记与作业页还有余量（`courses/regression-analysis/chapter-01/`：作业 1060 KB、notes-02 992 KB、notes 977 KB，现已是全站最重的三页）。

### 还剩下的（已知、暂不动）

**2026-09-15 追加**：一门公式密集的课程（回归分析 M1）让整站 +9.2 MB —— 最重的单页 1082 KB（M1 笔记按 § 拆成 3 页才压回预算内），80 张工具卡页各约 40 KB 页面框架 + 卡片内容。单页预算不变（1638 KB），整站预算 12 → 24 MB。**没有**为了压体积去掉 MathML（理由见上面「试过并否决」）。

- KaTeX 在公式页**按需**加载 woff2 字形（`katex.min.css` 里 20 个 `@font-face`，浏览器只取页面真正用到的那几个）：M1 笔记页最多见 9 个共 **133 KB**（`Math-Italic`、`Main-Bold`、`Math-BoldItalic`、`Caligraphic`、`AMS`、`Size1~3` 等），`katex.min.css` 23 KB。早期记的「6 个 107 KB」是 `startjank.py` 的 resources 列表被截断后的低估，准数请用 `../lab/shots/fonttruth.py` 量 `document.fonts`。只在真有公式的页面加载（`extend_head.html` 的三条件判据）。要再降只能做字体子集化，收益不确定、维护成本高。
- 每个页面都多一次 59 字节的 `css/bg-image.css`（渲染阻塞）。它和主样式表是**并行**下载的（不是串行），FCP 实测没有差别，所以不值得为它把背景图 URL 硬编码进 CSS 或往模板里写 `<style>`。

### 打开页面头几秒的卡顿（2026-09-15 追加三）

稳态早就够了：真窗口、165 Hz（帧预算 6.06 ms）下持续滚动，3 s 之后 p99 6.2–6.3 ms、max 6.3 ms、**没有一帧超过 7 ms**。掉帧全部集中在打开页面后的 1–3 s。量法 `../lab/shots/startjank.py`（`addScriptToEvaluateOnNewDocument` 注入到 document 起点，导航后立刻逐帧滚动，同时收 longtask / layout-shift / 资源时刻）。

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

量法：`../lab/shots/scrollcost.py`（headless，逐个 CSS 变体注入，出 `RasterTask` / `DirectRenderer::DrawFrame` 总量）与 `frameab.py`（真窗口 2560×1600 @165 Hz，rAF 帧间隔 → 掉帧数）。**旧的 `jank.py` 只量主线程计数器，看不见合成器侧**，所以前面「backdrop-filter 测不出代价」的判断按下面这组数字修正——代价是真的，只是没到掉帧。

| 项 | 数字 |
|---|---|
| `.post-single` 的 `blur(8px)` 占 `DirectRenderer::DrawFrame` | 88.3 → 33.8 ms / 333 帧（去掉后 −61%）；`RasterTask` 24.3 → 2.4 ms |
| 真机全页滚动（49195 px，dpr2 @165 Hz） | 408 帧：p50 6.1 / p90 6.2 / p99 6.25 ms，只有 1~2 帧超过一帧预算（6.06 ms） |
| 同上、去掉卡片 blur | 410 帧，p50/p99 一样，同样 1 帧 → **不掉帧** |
| 换成不透明底的视觉代价（`--surface` .94 浅 / .92 深） | 浅色 max 7/255、mean 1.11；深色 max 7/255、mean 0.33 |

结论：卡片毛玻璃的合成器开销真实存在（占合成帧绘制时间六成），但在本机 165 Hz 上仍锁在 6.1 ms/帧，**不值得为性能牺牲它的观感**。若哪天要压手机/省电模式的余量，改法是去掉 `.post-single` 的 `backdrop-filter` 并把 `--surface` 提到 94%（浅）/92%（深）——像素级几乎不可见。

试过无收益：把 `content-visibility: auto` 加在正文块上（`RasterTask` 7.8 vs 6.1 ms，反而更差，连续文本没有可跳过的排版工作）。

量滚动卡顿的两个坑（已写进脚本头注释）：真窗口不加 `--disable-features=CalculateNativeWinOcclusion`，被别的窗口盖住时 `visibilityState=hidden`、rAF 完全冻结（会得到「0 帧」这种假流畅）；Windows 下 `asyncio.sleep(0.008)` 的真实粒度约 15.6 ms，驱不动合成器滚动，改用帧内 `scrollBy({behavior:'instant'})`，并先关掉站点全局的 `scroll-behavior: smooth`（否则逐帧 scrollBy 被平滑动画吃掉，0.9 s 只挪 180 px）。

