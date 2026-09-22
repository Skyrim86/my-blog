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

**另有一版把黑发少女叠在城市上的合成图**（Wallhaven `wallhaven.cc/w/6lwmy7`，源切片 `source-lady-slice.webp`，函数 `city_lady_background()`，**2026-09-21 连同函数与那张产物一起删了** —— 它从未进过任何页面或配置）——上线后撤回了：压在蒙版下她显得突兀。当时把「人物」这个位置交给了右下角的看板娘（见 ㉕）。**2026-09-19 起人物以**「黑长直少女」套**的形式回来了**（单独一套、单独一套蒙版，见下），看板娘仍然保留，于是「人是人、背景是背景」这条不再是唯一做法。合成版文件 `bg-night-city-lady.webp` 与脚本都留着，想切回去只改 `hugo.toml` 一行。

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

### ⑮ 首页：快捷入口 / 站点规模 / 时钟 / 最近更新 — `_partials/index_profile.html`（整份覆盖）+ `_partials/home-scale.html` + `_partials/home-clock.html` + `09-home.css`

> 「按类浏览」那一栏 2026-09-21 **已删**（partial、`09-home.css` 的 `.home-browse` 组、4 个 i18n 键一起删的），位置让给了时钟，见 ㊼。

首页在 profileMode 下由主题 `list.html` 直接调用 `index_profile.html`，**没有任何 hook**，所以这一处是整份覆盖（见第 4 节）。与原版的差异现在有**五处**：头像多取一张 2× 图供高分屏、快捷入口、站点规模（**2026-09-19 从原来那一块里拆成 `home-scale.html`**；同日拆出的「按类浏览」`home-extras.html` 2026-09-21 已删，见下）、最近更新、以及 **`.home-hero` / `.home-side` 两个容器**（宽屏两栏布局用，见下）。标题/副标题/社交图标/`profileMode.buttons` 的内容保持主题原样。新块的**逻辑**整块写在各自的 partial 里，`index_profile.html` 只多两行 include —— 那个文件是要跟主题逐行对拍的，对拍面越小越好（所以两个容器里的内容刻意**不重新缩进**：为了多一层容器把几十行整体缩进一级，会让每次升级主题时的对拍多出一大片无意义的差异）。

**页面结构（2026-09-19 改版）**：

```
.profile_inner（窄屏 flex 列；≥1024px 是 grid，左 20rem + 右 1fr）
  .home-hero   头像 / 标题 / 副标题 / 社交图标 / 快捷入口 / 站点规模 / buttons
  .home-side   两栏时的右栏容器（flex 列 + gap）：
                 section.home-clock（时间与时钟，一块玻璃面板）
                 section.home-recent（最近更新，一块玻璃面板）
```

- **两块内容各自成一块玻璃面板**（`--surface` + 1px `--edge` + 14px 圆角 + `--shadow-card` + `backdrop-filter`）。改之前它们是散在壁纸上的：每条「最近更新」各带一小块 `--surface` 底，标题再叠一层玻璃底衬，一层压一层。改成面板之后：面板内的条目**透明化**（底由面板给）；「最近更新」的条目悬停铺一层 `--code-bg`（**不用 `--accent-soft`**：那个当底会把文字对比度拉下来，⑫ 记过这个坑）。层的代价也降了：首页的 `backdrop-filter` 元素从二十来个（每 chip、每条目、每块底衬各一个）降到 2 个。
  - **两块面板的标题因此从 `00-theme.css` 的局部玻璃底衬清单里删掉了**（`.home-recent-head h2/a`；当年一并从这张表里删掉的还有「按类浏览」那组的 `.home-browse-head h2/a` 与 `.home-browse-label`）—— 它已经在面板里，再叠一层就是玻璃片贴玻璃片。`.home-scale` 仍直接压在壁纸上，那条保留。
  - **连带一条容易静默失效的**：加了 `.home-hero` 之后副标题不再是 `.profile_inner` 的直接子项，玻璃底衬清单与入场动画里那条 `.profile_inner > span` 都改成了 `.home-hero > span`（选择器失配不报错，只是保护/动效没了）。
- **≥1024px 两栏**：`main.main:has(.home-recent)` 放宽到 `calc(var(--nav-width) + var(--gap) * 2)`（1072px，与顶栏同宽、左右边缘对齐），`.profile_inner` 变 grid：左栏 20rem 放 hero、右栏放 `.home-side`。两栏用 `:has()` 只认首页（`.main` 是全站共享的）。窄屏完全等同原来的单列。
  - 实测（1440×950，浅色少女套）：最近更新面板的顶部从 **701px 降到 316px**，整页内容在 **570px** 处结束 —— 1080p 首屏装得下整页，改版前要滚过大半屏才看到「最近更新」。
  - `main` 放宽只影响首页，`0 布局位移` 那条结论不受影响（入场动效只用 opacity/transform，见下）。
- **首屏再收紧一档**：`.profile` 的 padding 2.2rem/1.2rem → **1.6rem/.9rem**、`.profile_inner`/`.home-hero` 的 gap 1rem → **.85rem**、`h1` 2rem → **1.85rem**、「最近更新」条目 padding 与列表行距各收一档。
- **「最近更新」的列宽阈值从 300px 改成 285px**：两栏下 1024px 视口只给右栏 624px，扣掉面板内边距与列间距后 2 列需要 `285×2+8 = 578 ≤ 587`；300px 时差 0.8px 正好掉成一列（1024 是 iPad 横屏宽度，值得为它挪这 15px）。

- **快捷入口**复用主导航（跳过 `home`，取前 5 项），不维护第二份链接配置，导航改名自动同步。**2026-09-19 起 ≥1024px 隐藏**：宽屏下它就是主导航那五项、完整导航就在正上方一行，属纯重复；窄屏（≤640px 导航收进汉堡菜单）才保留。顺带解决了五个 pill 在 20rem 窄栏里排成 4+1、「标签」单独占一行的问题。
- **卡片组**（2026-09-19 新增，当天换过四轮形式）：hero 最下面**一次一张**的 5:7 卡（20 张，两系：绫华 16 / 黑长直少女 4），可点、可键盘、可滑动，也会每 6s 自己切（悬停与后台暂停）。整块在 `home-cards.html` + `assets/js/home-deck.js` + `21-card-deck.css`，清单在 `data/home-cards.yaml`；十种卡面风格都是 CSS 画的（全息 / 金边 / 和纸 / 霜蓝 / 墨 / 玻璃 / 哥特教堂玻璃 / 樱纹 / 麻叶纹 / 青海波）。另有「hero 场景插画」一种备选形式（`chara`）。细节见 ㉕。
- **站点规模**（2026-09-19 新增，同日从那块附加内容里拆出 **`home-scale.html`**（另一半是 `home-extras.html`，2026-09-21 已删））：一行小字「数学库 80 张卡 · CS 库 8 张卡 · 2 门课程 · 2 个项目」。拆出来的原因是宽屏两栏要把它留在**左栏**、而「按类浏览」去右栏。数字**全部现算**（库名与张数取 `data/libraries.yaml` 与各自的卡片 JSON；课程取 `/courses/` 的 `.Sections`、项目取 `/projects/` 的 `.Pages`），空的一项不显示 —— 用 `hugo --contentDir <只放了一篇 searchHidden 页的临时目录>` 构建时，这一行自动退成「数学库 80 张卡 · CS 库 8 张卡」。
  - **刻意不做「各库入口卡」**：快捷入口那一行已经指向同样的五个地方，再列一遍就是第二个链接清单。
- **按类浏览**（2026-09-19 新增，**2026-09-21 删除**）：分类与标签各一行 chip，标题行右端是「全部分类 →」。它是首页唯一的分类导航入口，删掉之后分类只能从主导航或 `/tags/` 进—— 这笔代价在 ㊼ 里认过。留档：分类不带计数（它只有两项，而「站点规模」那行已在说「几门课程、几个项目」，两个口径并排会让人对不上）；两行用网格（`grid-template-columns: 2.9rem 1fr`）而不是 flex（标签名宽度不同时 flex 会让两行的 chip 起点错开，标签行还会把标签名留在上一行）。
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

### ㉒ 数学库（跨课程卡片索引，按数学分支三级拆分）— `content/library/_content.gotmpl` + `layouts/_default/library*.html` + `data/math-branches.yaml`

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

**首页的卡片组（63 张，一次一张；手动 + 自动轮播，卡下的 ⤢ 打开弹层看大图）— `_partials/home-cards.html` + `assets/js/home-deck.js` + `21-card-deck.css` + `tools/cards/{make-cards,fetch-sources}.py` + `data/home-cards.yaml` + `scripts/check-deck.mjs`**（2026-09-19 新增、当天改过六轮；2026-09-20 扩到 32 张 + 风格体系重做为十四种 + 加弹层与进度条；**2026-09-21 扩到 63 张、风格精简到八种（见 ㊵），并把同一副牌铺成一页 /collection/ 收藏库（见 ㊿）**）

> 本节的数量以 `data/home-cards.yaml` 为准（单一事实源，`node scripts/check-deck.mjs` 会把当前分布打出来）。下面提到的「十六种风格」是 2026-09-20 精简**前**的形态 —— 保留下来那八种与它们的工艺描述仍然有效，砍掉的八种见 ㊵。

- **形态**：hero 最下面（头像 / 标题 / 副标题 / 「站点规模」那行之下）一张 5:7 的卡，页内显示 **272 宽**（`.home-deck { max-width: 17rem }`，2026-09-20 从 15rem 放大），出图 600×840；底部名牌写**这张卡自己的名字**（`木刀` / `星夜` / `樱堤` …）+ 序号 `07 / 63` + 系列（绫华 / 艾米莉亚 / 卡夫卡 / 黑长直少女 / 初音未来）。
- **首页每天只轮这 12 张**（2026-09-21 用户要求：「首页展示卡片不用全部，每天随机从库中抽 12 张就行」）：模板声明 `data-deck-daily="12"`，JS 以**「年 × 1000 + 一年中的第几天」（访客本地日期）**当种子，从 63 张里抽 12 张当这一天的展示集 —— 同一天所有访客看到同一批、换日就换批、**不需要每日重构建**（静态站没有「今天」，这是唯一不依赖每日 CI 的做法）。序号因此写成 `01 / 12`。抽出的 12 张**按清单原序排回**，与收藏库里那一排的顺序对得上。
  - 种子与算法只此一份（`home-deck.js` 的 `hash01` / `daySeed` / `pickDailySubset`，前两个与时间卡同款）；时间卡的「今日一卡」改从 `window.homeDeck.items` 读同一份，**所以脚本顺序是硬要求：`home-deck.js` 必须排在 `home-clock.js` 前面** —— 反过来的话时间卡会用整副 63 张抽，抽到那 12 张之外的卡时点微卡**静默失效**（下标越界被 `openAt` 挡掉），实测踩到过（见 `docs/traps.md`）。
  - 算法验过（`../lab/shots/deck-daily-test.js`，从源码里抽出真函数跑）：同一天两次一致、30 天 30 种组合、365 天里 63 张全部露过面（次数 50~84、均 70）、n = 清单长度时退化成整副。
  - **代价**：模板渲染的首张卡是**整副的第一张**（构建期不知道今天是哪 12 张），JS 在初始化时同步换掉它（不做交叉淡入：这一步几乎总在首帧之前完成）。本机量到那张卡的两个候选（1x+2x，约 30 KB）已被**预载扫描器**取走 —— 真实网络下换 src 通常会掐掉在途请求，这个数字偏保守。没有采用「首张卡固定进池」那种省流量的写法：那样会有一张卡天天在首页。
  - 为什么不把 12 张也交给构建期算：那要么每天重建一次（依赖 CI 定时任务不失败），要么让 Hugo 与 JS 各实现一遍同一套散列（两份实现迟早漂移）。浏览器里按日期算，换日不依赖任何外部条件。
- **一副牌五个系列**（63 张）：
  - **绫华 21**：木刀 · 墨羽 · 花信 · 书案 · 霜华 · 白鹭 · 星夜 · 玄袖 · 樱堤 · 甲刃 · 蝶羽 · 闲坐 · 午后 · 雪舞 · 流水 · 夏荫 · 素裙 · 樱簪 · 学园 · 花礼 · 糖霜
  - **黑长直少女 4**：日间 · 夜间 · 大小姐 · 提灯（刻意不用网上的图 —— `black_hair long_hair` 的候选池质量很差，用的是**站上自己的角色资产**）
  - **卡夫卡 7**（崩坏：星穹铁道，2026-09-20 加）：猎星 · 夜行 · 独奏 · 夜宴 · 回响 · 雨幕 · 绯光
  - **艾米莉亚 27**（Re:Zero，2026-09-21 加）：银霜 · 冰晶 · 雪原 · 花冠 · 月影 · 银铃 · 薄冰 · 白蔷 · 霜羽 · 冬芽 · 静水 · 银绢 · 冰纹 · 幽兰 · 雪松 · 初霜 · 银纱 · 冰湖 · 雪铃 · 霜枝 · 银月 · 冰凌 · 白露 · 寒蕊 · 雪羽 · 银漪 · 冷香
  - **初音未来 4**（2026-09-21 加）：初始之音 · 旋律 · 电波 · 琉璃音
  - 名字**按画面取**（往她的意象上靠：白鹭 / 霜 / 扇 / 樱 / 舞），**同一系列不许重名**（`check-deck.mjs` 拦：重名在名牌上就是「翻卡看不出换了」）。
  - 卡夫卡那一系**每条查询都带 `rating:safe`**：站点上她的 `solo simple_background` 不带这个过滤有 100 条、带上只剩 2 条，那些是 questionable 分级，靠 tags 里的敏感词滤不干净 —— 而这是要放在公开首页的图。代价是池子薄：全站 safe 单人只有二十来条、能用的七八条，所以这一系只到 7 张（另有一张画面里带作者署名 `©GOODGOODSPHERE`，否掉了、源图也删了）。挑图口径与接触表在 `../lab/shots/revamp/pick-deck.py`（打分：透明底 +120 / 简单底 +30 / solo +25 / 多人 −45 / 签名文字 −12），下载归一化在 `tools/cards/fetch-sources.py`。
- **交互**（都在 `assets/js/home-deck.js`；脚本在首页与收藏库加载 —— 后者页内没有轮播卡，只用它的弹层与 3D 查看器，见 ㊿）：
  - **切卡**：点卡面 / 卡下 `‹ ›` / 键盘 ←→ / 触屏左右滑；每 6s 自动换一张，**悬停、焦点进入、标签页后台、弹层打开时都暂停**，手动切过重新计时；`prefers-reduced-motion` 时完全不自动轮播、也不做淡出淡入。
  - **进度条**：卡下一条 2px 细线（`.home-deck-progress`，宽是卡的 62%），时长由 JS 按 `AUTO_MS` 写进元素（两处只有一个事实源），暂停与 JS 的 `stop()` 一一对应。**为什么不是「三十个点」**：三十多张卡的点阵会挤成一条虚线、一屏根本数不清；一条细线表达的是「这一张还剩多少」。减少动效时整条不显示。
  - **看大图（弹层）**：卡下的 ⤢ 按钮打开 `role="dialog" aria-modal="true"` 的弹层，里面是 430px 宽的大图 + 名字 / 系列 / 序号 / 出处；`Esc`、点遮罩、关闭按钮都能关；**焦点锁在弹层里、关掉后回到放大按钮**；弹层里 `← →` 切上下一张（切的是同一副牌，背后那张也跟着换）。
    - 大图**直接用已有的 2x 产物**（544px），页内卡只有 272 —— 放到 430 已是 1.6 倍。**不专门出一档「大图」产物**：那要给每张卡多一个 ~720px 文件，63 张约 2.5 MB，会把体积预算吃掉一大截。
    - 弹层用 `hidden` 属性开关而不是只改透明度：对比度脚本只遍历可见元素，藏在屏外的面板不该进它的表。
  - **换卡是画面交叉淡入 + 方向位移**：`.home-card-ghost` 装住**刚显示过的那一张**（URL 已在缓存里，不多下一次），主图从 0 淡入、残影从 1 淡出，两张在 340ms 里真正交叉 —— 中间没有空白帧。**整卡不参与 opacity、只走位移**：卡框（雕花框 / 等级层 / 信息带）在换卡期间保持稳定，淡入淡出只发生在画面那一层；整卡若一起淡入，子元素（含残影）会被一起乘算，中段新旧两张都只剩半透明、底色透出来。上一版是「先淡出到 10% → 200ms 后换 src → 再淡入」，那 200ms 里卡上几乎没有东西（traps 的「点卡片跳到 /null」一节）。`.is-next` / `.is-prev` 给位移定方向：新卡从来的那一侧滑进来、旧卡往反方向退，「上一张 / 下一张」在视觉上分得出来。**动的开关是 `card.classList.add('is-in')`** —— 这一行 2026-09-21 之前一直漏着，整套 CSS 动画写了却一次没跑过（traps 的「设计好的动效一直不跑」一节）。
  - **只有当前这一张在 DOM 里**：63 张全渲染的话它们叠在同一位置、全在视口内，`loading=lazy` 也拦不住；现在是「先下第 1 张 + 预取后 2 张」（残影只在换卡那 340ms 里显形，装的是已缓存的那张）。
  - 禁 JS 也能看首张卡与序号（切换按钮与弹层都由脚本注入 —— 一个点不动的控件比没有更糟）；换卡会写进 `.sr-only` 的 `role="status"` 播报「第 N 张，共 M 张：名字」。
- **出处**：`credit` 是文字（官方立绘、站点自己的看板娘**没有可点出处**，那两条留空 —— 别硬编一个主页链接上去，那等于指错地方），`credit_url` 是弹层里那个可点外链（pixiv → `/artworks/<id>`、safebooru → `post&id=<id>`、twitter / wallhaven 同理）。`check-deck.mjs` 会把 url 与 credit 对一遍：**写错的代价是「点开跳到别处」而页面看起来完全正常**，只有脚本能拦。
- **取景口径是「人像完整」**（2026-09-19 改，之前是「填满卡面」，结果经常只剩半张脸或切掉腿）：默认 `crop: figure` —— 先按内容包围盒（阈值 45 + 1%~99% 分位）量出人物，再取一个**刚好装下它的 5:7 窗**，用 `pad` 给呼吸；窗口装不下画布时改成「整幅缩进卡面 + 四周垫底色」，底色优先用 YAML 里的 `flat`、否则按**实测四角颜色**取。
  - 两个坑都踩过：**四角取色必须按 alpha 挑像素**（透明 PNG 的四角转成 RGB 是**黑的**，不挑就会把浅色底的画面垫成黑底）；**整幅缩进那条路径必须拿 alpha 当遮罩贴**（直接把 RGBA 转 RGB 同样会把透明区变成黑）。
  - **横构图的源图**走手量分数窗（`ayaka-sword` 是刀、`ayaka-15` 是人像在右半边）：自动取景会把横过来的刀也算进内容、人被缩到很小。
  - **横构图还有第二条坑（2026-09-20）**：`figure` 的窗高**受源图高度限制**，而「源图长边压到 700」这条口径是按**竖构图**定的 —— 横构图的长边落在宽度上，高度只剩 400 上下，2x 档（544）就得放大 1.7 倍。`fetch-sources.py --long-edge 1400` 是解法（在 ayaka-15 上实测过）。
- **十六种卡面风格，全是 CSS**（换风格只改 YAML 的 `style` 字段，不重出图）：`foil` 全息（软边虹彩带 + 光栅颗粒 + 悬停时带位平移）· `gold` 金边（拉丝金属框 + 斜向柔光 + 描金角）· `washi` 和纸（**各向异性**纸纤维 + 纸浆云斑）· `frost` 霜蓝（收尖的软扇骨：6 主枝 + 12 短枝）· `ink` 墨 · `glass` 玻璃（**四件套**：倒角 + 柔和高光 + 底边折射亮线 + **两级假厚度**（`.home-card-lens` 与它的 `::before` 各折射一档、`::after` 给一圈青/品红的边缘色散），外加一道「窗玻璃反光」，磨砂只做下半张）· `gothic` 哥特教堂玻璃（手抖过的铅条 + 四块宝石片 + 暗角）· `sakura` 樱纹（五片**真花瓣轮廓**）· `asanoha` 麻叶纹（软笔触的三向格 + 手抖）· `seigaiha` 青海波（渐隐的半圆环）· `yukika` 雪华（**散落的九朵**带分枝六角雪花：大小 0.6~1.7 倍、角度与浓淡都不同，`--cmask-size: 100% 100%` 是整卡贴花**不是平铺**）· `nishiki` 织锦（绸面柔光 + 纤维 + 斜纹暗示）· `kintsugi` 金继（黑底 + 4~5 道**弯曲分叉**的金缝，缝的**暗侧**单独贴在 `::after` 上用 multiply 压暗 → 一侧受光一侧落影的厚度感；釉面反光借装饰层）· `uchiwa` 团扇（14 根**弓形**扇骨 + 扇箍 + 纸面透光）· **`holo-prism` 星芒全息**（放射虹彩 + 星点，悬停时整层转一点）· **`holo-gold` 金箔全息**（暖金衍射带 + 镜面窄反光）。另有 `pixel` 备着（当前没有卡用它；生成器的 `pixel` 通道与样式都留着，它的硬边是题材本身、不挂手抖滤镜）。

  **2026-09-20 晚：第二版重做，主题是「不要生硬的直线、玻璃要有立体感」。** 第一版的问题量出来了：织锦一张卡上约 **394 条 1px 硬直线**（1px/4px 三向网格）、麻叶纹 ≈97、和纸 ≈89、全息 ≈89 条 4px 硬边彩虹条；金继是三根笔直金线；玻璃只有「一道斜渐变 + 1px 内环 + 半张磨砂」。这一版换掉的技法：
  - **一个共享的 SVG 位移滤镜当「手抖」**：`layouts/_partials/home-cards.html` 里那段零尺寸内联 `<svg>` 定义 `#deck-rough`（`feTurbulence` + `feDisplacementMap scale=3`）与更强的 `#deck-rough-crack`（scale=5），`::before` 挂 `filter: var(--cfilter)` —— 一处生效、十四种的直线一起变成手绘的那点不平整（约 300 字节）。**必须内联在文档里**（data-URI 里的 filter 在 WebKit 上不可靠），也不要动画它。
  - **软渐变停取代 1px 硬停**：线写成「亮芯偏在一侧 + 一圈淡晕」（`0 2.6px → 3.4px 亮芯 → 5px 淡晕 → 6.8px`），周期取互质数、每层各自错开 `background-position`。
  - **颗粒**：三个 `feTurbulence` 的 data-URI 令牌（纸 / 细霜 / **各向异性纤维**），`color-interpolation-filters="sRGB"`（默认 linearRGB 是「噪点看着不对」的经典原因）、`stitchTiles="stitch"`（否则平铺有接缝）、滤镜内自带 `feGaussianBlur`（从电视雪花变成纸面）。强度**烘进 alpha**（.10~.18）——它是背景层栈里的一层，不是遮罩。
  - **弯曲形状用内联 SVG 路径当 mask**（形状在 mask、颜色留在 CSS → 跟着深色主题走、边缘自带抗锯齿）：金继的裂纹（2~3 段减宽的路径链 = 收尖与分叉）、团扇的弓形扇骨、**带分枝的雪花**、真花瓣轮廓。四个令牌 `--tex-crack / --tex-petal / --tex-flake / --tex-rib` 定义在基础规则里，各自 ~1.5~2.5 KB。
  - **玻璃的立体感**是四件套：倒角（左上受光/右下背光的 inset 阴影）、柔和高光（`::after` 上三个软椭圆，**不能挂在带 mask 的 `::before` 上**——那一层的 mask 会把高光一起压到下半张）、边缘折射（底边 1px 亮线 + 一圈玻璃边）、**假厚度**（`.home-card-lens` 把画作 `--art` 再铺一遍，放大 5.5%、错位、模糊后只在边缘露出）。
  - 验收口径也加了一条：**混合模式要挑在浅色与深色两种画作上都读得出来** —— `screen` 压在浅画上等于没有（金继第一版的金色裂缝在「木刀」那张浅画上完全看不见）、`multiply` 压在深画上同理。对比图因此改成「同一批风格 × 浅色画 + 深色画 × 明暗主题」四组（`../lab/shots/deck2/styles-final-v2-{light,dark}.png`）。
  - 代价：**只涨 3 KB**（4561 / 5120 KB）—— 全是 CSS 与内联 SVG，没有新增任何位图，每张卡 38 KB 的图片预算没动。
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
- **代价**：`assets/images/cards/` 里 63 张卡面产物合计 **2.6 MB**（约 43 KB/张）（**构建输入，不进访客流量**）；发布侧每张两个派生图合计约 38 KB（1x `272x q78` + 2x `544x q70`），首页只加载第 1 张 + 预取 2 张。2026-09-20 把整站 gzip 预算从 4.5 MB 抬到 5 MB 就是为这笔（见 `scripts/report-size.sh` 顶部的说明：不抬的话加完卡正好顶死、一点余量不剩）。
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

## 4. 十一处有意的主题模板覆盖

除上述 hook 之外，仓库里有十一处**有意**覆盖主题（是对「不复制主题模板」的例外）。`extend_head.html` / `extend_footer.html` / `extend_post_content.html` / `comments.html` 是主题设计好的 hook，覆盖它们不算在内。

1. `layouts/courses/course.html`（`layout: "course"`）与 `layouts/courses/chapter.html`（`layout: "chapter"`）：列表页没有任何 hook，而这两页分别需要自动章节目录与入口卡片。两个模板都很小、只复用主题 partial（`breadcrumbs.html`/`anchored_headings.html`，页头共用 `course-header.html`），且只有显式写了 `layout` 的页面才命中，不影响 `/courses/` 列表页与文章页。**改外观请优先改 `04-course.css`**
2. `layouts/index.json`：该模板无 hook 可挂，而正文截断无法从配置实现
3. `layouts/_partials/index_profile.html`：首页在 profileMode 下由主题 `list.html` 直接调用它，没有 hook 可挂，而首页需要「快捷入口 + 最近更新」两块内容。改这一处时对照 `themes/PaperMod/layouts/_partials/index_profile.html`，确认主题侧是否有新变化需要合并
4. `layouts/_partials/post_meta.html`：**唯一一处「复制主题 partial 再加一行」**（第 ⑱ 项）。它是列表卡片与详情页共用的元信息块，没有 hook 可挂，而卡片要一块计数/标签。与前三处不同：这里**逐字保留**主题实现，只在末尾调用 `card-chips.html`，主题升级时对照 diff 手工合并即可。若哪天主题给它加了 hook，优先换回 hook
5. `layouts/404.html`（第 ㉙ 项）：404 页没有任何 hook 可挂，而主题那份全文只有 `<div class="not-found">404</div>` 一行 —— 线上产物的可见文字就只有「404」三个字符，访客到了这里没有任何出路。**这是十一处里覆盖成本最低的一处**（主题原件 3 行），主题升级时把 `themes/PaperMod/layouts/404.html` 再看一眼即可
6. `layouts/taxonomy.html`（第 ㉛ 项）：`/tags/`、`/categories/` 总览页要把词条按学科分块展示（见 `data/tag-groups.yaml`），而主题那份是平铺。markup 与主题版保持一致（`ul.terms-tags` + 计数 `sup`），只把「一个 ul」改成「每组一个 ul」，`terms-filter.js` 已同步适配
7. `layouts/baseof.html`（第 ㉞ 项）：跳过导航链接与 `lang` 属性。**这一处与前面六处的理由不同** —— 不是「原件短」或「没有 hook 可挂」，而是**位置本身不可达**：要改的一处在 `<html>` 上、一处在 `<body>` 开头，而主题的四个 hook 分别在 `<head>` 内与 `</body>` 之前，谁都够不到。主题原件 31 行，逐字保留、只差三处（详见下节 ㉞），主题升级时与 `themes/PaperMod/layouts/baseof.html` 逐行对拍即可。**注意它是全站每个页面的渲染入口**，改动后要按页型抽查（首页 / section / term / 单页 / 404 / search）
8. `layouts/_partials/templates/schema_json.html`（第 ㉟ 项）：**逐字保留主题实现，只差三处**（主题原件 129 行 + 一段说明注释），与第 4 条 `post_meta.html` 是同一手法：删掉 `articleBody`、零值日期不输出、`@type` 随发布日期在 `BlogPosting` / `WebPage` 之间走。`articleBody` 把整篇正文 `plainify` 后复制进 `<head>` 的 JSON-LD 里；本站正文是构建期渲染的 KaTeX，plainify 之后公式文本会出现三遍（MathML 表示 + TeX annotation + katex-html 字形文本），于是这个字段既大又低质 —— 实测重页单页 25–27 KB、占该页 gzip 的 17–20%。删它安全：`articleBody` 在 schema.org 里是**可选**字段，Google 富结果不使用，仓库里也没有任何东西依赖它（`check-seo.mjs` 对它零断言，已核对）。**升级主题时与主题那份逐行对拍，确认差异仍然只有这三处。** 删改后不必再手工 `JSON.parse` 每个 `ld+json` 块 —— `check-seo.mjs` 已经常驻断言（含 `BlogPosting` 的必填字段与零值日期），见 ㉟

9. `layouts/_markup/render-image.html`（第 ㊲ 项）：主题 `_markup/` 下只有 `render-image.html` 这一个文件，内容图需要补 `width`/`height`（主题原版不给尺寸）并把 PNG 转无损 WebP，而渲染钩子没有「部分覆盖」的机制，只能整份接管。手法与第 4、8 条相同：**逐字保留主题实现**（URL 解析、query/fragment 拼接、属性透传、`%q` 转义一行未改），只在拿到资源之后插入两段。**改它必须同时确认 `00-theme.css` 里 `.post-content img` 的 `height: auto` 还在** —— 主题 reset 只有 `max-width: 100%`（`core/reset.css`），只补尺寸属性会在窄屏把图纵向压扁（实测 400px 视口下 660×440 的图变成 333×440），且**构建不报错**。主题升级时与 `themes/PaperMod/layouts/_markup/render-image.html` 逐行对拍


10. `layouts/_partials/templates/opengraph.html`（第 10 处）：与第 4、8、9 条同一手法 —— **逐字保留主题实现**，只把 `site.Language.LanguageCode` 换成 `.Language.Locale`（前者自 Hugo 0.158 起弃用）。**动机与前面九处不同：不为功能，只为构建日志干净** —— 那条弃用告警不带文件名，混在输出里会盖住真正的告警。**单独改它没有用**：同一个 API 在主题 `rss.xml` 里也出现一次，见下条。

11. `layouts/rss.xml`（第 11 处）：同一条弃用告警的第二个来源，改的是 `<language>` 那一行。实测只覆盖 opengraph 时告警照旧出现，两处都改才干净（构建输出零 WARN）。改前改后逐页比对：`og:locale` 仍是 `zh_CN`、RSS `<language>` 仍是 `zh-CN`、`index.xml` 仍是 34 条 item（`check-seo.mjs` 断言后两项）。

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

- **搜索页那处没覆盖主题模板**。`#searchResults` 在 `themes/PaperMod/layouts/search.html` 里，为一条播报再加一处覆盖不划算（第 4 节已经有十一处了），所以改用脚本挂观察者。若哪天要改成覆盖模板，先想清楚第 4 节那句「不要整份复制主题模板」。
- **零条结果的歧义**。主题的 `fastsearch.js` 把「输入为空」与「没有匹配」都渲染成空列表（`renderResults([])` 被两条路径共用），所以零条时必须回头看输入框：为空是清空操作，**什么都不该播报**；有输入才是真的没搜到。
- **只在文字真的变了才写** `textContent`。重复写入同样的文本会让部分读屏反复播报，所以三处都加了 `if (x !== said)` 的比较。

**主题模板里硬编码的英文可访问名**（2026-09-19 补，`assets/js/a11y-controls.js`）。PaperMod 把四个全站控件的可访问名写死成英文，中文站点上读屏用户听到的就是英文；而项目自己注入的同类控件（`#bottom-link`、快捷入口导航）本来就走的 i18n，所以这是**漏网**，不是有意的取舍：

| 控件 | 主题模板里的原文 | 现在的文案键 |
|---|---|---|
| `#theme-toggle`（明暗切换，`header.html`） | `aria-label="Toggle theme"` / `title="(Alt + T)"` | `themeToggleLabel` / `themeToggleTitle` |
| `#top-link`（返回顶部，`footer.html`） | `aria-label="go to top"` / `title="Go to Top (Alt + G)"` | `topLinkLabel` / `topLinkTitle` |
| 搜索输入框（`search.html`） | `aria-label="search"` | `searchInputLabel` |
| 搜索结果列表（`search.html`） | `aria-label="search results"` | `searchResultsLabel` |

- **不覆盖主题模板，改为脚本补属性** —— 与上面那处播报是同一个判断：为四个属性再添一处覆盖不划算（第 4 节已经有十一处了）。脚本全站加载（很小），页面上没有对应元素时静默跳过。
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

### ㊳ 弹层里的 3D 卡片（能自由转动的「真卡」）— `assets/js/card-3d.js` + `tools/cards/make-depth.py`

首页卡片组那个 ⤢ 弹层里放的不再是平面大图，而是一张**有厚度的卡**：拖拽可绕两轴自由转动、松手带惯性并回弹到最近的一面（正面 / 背面），转到侧面能看到卡边（纸白 / 烫金切口），正面有主体凸出的浮雕与随角度流动的箔膜，背面是这张卡自己的信息面（名字 / 系列 / 序号 / 出处 + 系列徽记）。

**为什么是裸 WebGL 而不是 three.js**：这个场景只有一个物体，真正干活的是片元着色器，而着色器代码用不用 three.js 一字不差。实测 three 0.180 的 two-file 构建是 330 + 372 KB = **176 KB gzip**，而且 `three.module.min.js` 内部是 `import "./three.core.min.js"`，与 Hugo 的 `fingerprint` 改名**冲突（静默 404）**；本仓库没有任何打包链与 ESM，要绕开就得放弃指纹与 SRI 放进 `static/`。自写的这份约 14 KB、零依赖，继续走全站统一的 `defer` + SRI。

**浮雕是两份数据叠加**：`tools/cards/make-depth.py` 用 Depth Anything V2 Small（走 **hf-mirror.com**，`huggingface.co` 在本机不通）为每张卡面离线生成一张**灰阶高度图**（600×840、与卡面同尺寸，着色器用同一套 UV 采样，不需要任何对齐逻辑）。产物的路径**由 `image` 字段推导**（`images/cards/depth/<同名>.webp`），不是新加的 YAML 字段 —— 手写路径字段会漏、会与产物改名脱节。体积账：灰阶 q75 实测**约 5.4 KB/张**，63 张合计约 **341 KB**（卡面画作本身约 27 KB/张）。

**背景必须钳平成 0，但阈值不能是魔数**：深度模型给的是相对深度，背景不是 0 而是某个中灰；直接拿去驱动位移，整张卡会一起鼓起来。而「背景基准」用**卡面四边带的低分位**估计（背景通常是画面里最远的东西），逐张自适应。第一版取边带**中位数**，在「大小姐」那张紧特写上估到 0.57、把身体也钳平了（只剩一个白脑袋）。

**软脚必须是乘法**：`t * smoothstep(0, toe, t)` —— 大值原样保留、只把背景附近的噪声压到 0。反面写法 `smoothstep(0, toe, t)` 单用是把 toe 以上全部推到 1，实测三张卡都被压成一块**白剪影**、人物内部起伏全没了（位移会变成平顶台地）。

**三个观感参数都是量出来的**：布光系数之和校准到「正面朝相机、无起伏」时约 1.0（第一版加起来 1.28，整卡过曝）；高光指数 72 → **150** 且只在抬起的部位增强（72 太宽，卡面是一大片平面，`N·H` 整片都高 → 泛白）；主体凸起 5% → 2.2% →（2026-09-21）**3.2% 基准 × 每档倍率**。最后那一跳的前因后果见下面的「立体通道」一节 —— 它是这一轮的中心。

**轮廓倒角：断崖变成 sin 圆坡**（2026-09-21，`make-depth.py --fillet`，默认 2.7% 卡宽 ≈ 600px 上 16px）。高度场在「主体 ↔ 背景」之间原本是从 0 直接跳到 0.5 的**断崖**，着色器把它当位移用时那道崖壁就是一堵竖直的墙，侧壁还是拉伸的纹理 —— 这正是「5% 像纸板剪影」那条结论的根因，也是位移只能停在 2.2% 的原因。做法照参考站那套：**让主体的边缘从背景（0）平滑地长起来**，`h_new = h · sin(π/2 · d/R)`，d = 到最近背景像素的距离。三个连带的口径：

- **判据用「离背景多远」，不用「崖边多陡」**。第一版按单像素落差 ≥0.15 找崖边，而本脚本上一步刚做过 sigma 2 高斯：0.8 的台阶被摊到 6~8 像素、每像素只走约 0.16，阈值正好卡在边缘上 —— **63 张里 58 张一个崖边都没找到、静默没倒角**（字节与改前一模一样，页面上看不出来）。参考站那份深度图是双边滤波（保边）出来的，所以同样的阈值在那边有效。合成测试图用的是硬台阶，因此当时是假绿 —— 判据本身对「已经平滑过」的输入不成立。
- **顺序是「先倒角、再高斯」**（与第一版相反）：倒角只压「贴着背景的那一段」，若先高斯再倒角，落差早被摊平，乘法项就只剩「砍坡脚」—— 实测坡宽仍 6px、最大每像素落差仍 0.160，与完全不倒角一模一样。先倒角（在锐场上按 R 起坡）再高斯，坡度才真的随 R 变缓：R=7 → 坡宽 7px / 落差 0.120；R=16 → 11px / 0.070；R=25 → 15px / 0.047。
- **它有个可量的代价**：贴着轮廓那一圈细线会被压低（3px 宽的发丝整体落在 R 内）。所以生成器每次都算一个「**损失**」百分比（原本有明显高度、倒角后掉两成以上的像素占比）并在超阈值时打 ⚠ —— 实测 16 张 <1%、中位 1.5%、12 张 ≥2.4%（最大 5.0%，都是画面里细线密集的那几张），**都在接触表上逐张看过**。
- **深度图反而更小了**：355 → 341 KB（坡面比断崖好压缩）。
- `--fillet 0` 精确复现倒角前的产物（用于前后对比），所以这条口径随时可退。

**卡背零新素材**：背面用 canvas 2D 在运行时画（双线外框 + 斜向细格 + 系列徽记 + 名字 / 系列 / 序号 / 出处），颜色全部取自 CSS 变量 `--cardback-*`（`21-card-deck.css` 里按明暗各一套），主题切换时由 `MutationObserver` 盯 `<html data-theme>` 重画。**卡背的文字是画在 canvas 上的，对比度脚本看不见它** —— 所以弹层里那条名字/系列/序号/出处的 DOM 文本继续保留（同一份信息的等价文本），且配色放在 CSS 变量里而不是脚本魔数里。背面纹理**水平镜像**（卡背印在卡的反面，翻过来要正着读）。

**静止就停，但松手后留 2.5 秒余韵**（2026-09-21 与用户确认的那条）：只在拖拽 / 惯性 / 回弹 / **最后一次交互之后的 2.5 秒**内 `requestAnimationFrame`，之后一定停。原来这里是「静止立即停」（验收读数「空闲 900ms 内 0 帧」），改成余韵是因为这一轮加进来的两条效果是**时间驱动**的（星屑闪、彩虹流光）—— 不留这段时间它们就只能在手里那几百毫秒里演。读数相应改成「**松开 3.2s 后 0 帧**」，铁律本身没破（余韵最多 2.5 秒）。`card3d.stats().running` 与帧数增量仍是这条断言的抓手。`prefers-reduced-motion` 下时间相位**冻结**（`uTime` 不推进），那两条效果退化成静态的，其余视角驱动的照常。

**失败不静默**：没有 WebGL 或着色器编译/链接失败时，回退到原来的平面大图、`console.error` 明确报错、容器上写 `data-gl="error"`。黑屏是最糟的结果，因为它看起来像「这张卡本来就长这样」。

**无障碍**：拖拽手势读屏用户拿不到，所以有**翻面按钮**（脚本注入，`aria-pressed` 表明它是开关）与画布上的方向键（←→ 转、↑↓ 俯仰、Enter 翻面）；画布的 `aria-label` 由 i18n 词条 `deckRotate` 拼出「这是谁、第几张、能怎么操作」。焦点锁与 Esc 关闭沿用现有弹层逻辑（`canvas[tabindex]` 也进了 Tab 循环的名单，漏掉它会让 Tab 顺序断在中间）。

**实测**（1440×950、`--force-device-scale-factor=1`，证据在 `../lab/shots/deck3d/`）：拖动 14 帧的覆盖率最低 9.3%（**没有空帧**，判据是 α>128 的像素占比而不是「截图看着不黑」）；松手精确停在 -π（背面），翻面按钮两个方向都对；关弹层后帧数增量为 0；控制台 0 错误 0 警告。角度对照 `angles-light.png`（0/26/46/63/90/132/166/180°，90° 时覆盖率 3.8% 就是那条真实的卡边）、明暗两套 `open-sw-light.png` / `open-gpu-dark.png`（后者在真显卡上拍，与软渲染的读数几乎一致）。

**已知边界**：`POM`（片元侧的细部光线步进）在 `hardwareConcurrency ≤ 4` 或视口小的一侧会关掉并把网格降到 28×40；**同时把七个立体通道一律打折**（切边与流光减半、POM 上限降到 8 步、背景视差整个关掉 —— 它要动的是采样 uv，降级时还得同时改顶点位移那边，不值得在低端机上冒险）。**移动端的帧率仍未真机量过**（这一轮同样只量了桌面）。风格参数表 `STYLE_3D` 与 YAML 的 `style` 字段必须一一对应，少写一种会静默套用兜底 —— `check-deck.mjs` 里有守卫核这两边的键。

#### 立体通道：把参考站那套搬过来挂在等级阶梯上（2026-09-21）

用户给了一个参考实现（[`WordNest-tech/holo3D-card`](https://github.com/WordNest-tech/holo3D-card)，MIT，React + three.js 的制卡工作台），要求「里面的效果在传世和奇迹卡上基本全部实现，同时不同级别的立体效果要有差异」。它的「3D」比我们强一个量级（位移到卡高的 ~24%，我们 2.2%）—— 而它敢给这么高，靠的正是**深度图倒角 + 陡坡切边**这一对（见上一节）。所以这一轮做的是：**先补上那对前提，再把可移植的八条通道挂到档位阶梯上**。

**八条通道**（全部程序化、0 张新图，各自乘在「抬起来的地方才亮」上，收藏档一律为 0 —— 于是低档卡与加它们之前逐像素一致）：

| 通道 | 机制 | 为什么是这个写法 |
|---|---|---|
| `relief` 浮雕倍率 | 档位倍率 1.0 → 2.9（基准 3.2% 卡宽 → 9.3%，600px 台面上约 48px 位移） | 倒角之后才敢给这么高；数值是**摆四档拍出来圈的**（`deck7/sheetA.png`） |
| `steps` POM 步数 | 8 → 24，运行期经 `uSteps` 早退（循环边界仍是编译期常量，GLSL ES 的硬性要求） | 位移大了以后掠射角下的步进误差会显出来（条纹状自遮挡） |
| `cliff` 陡坡切边 | 用**已有**的高度场梯度长度当陡度（不引入 `dFdx/dFdy`，免掉 `OES_standard_derivatives` 依赖）：陡处压暗到 0.54 + 一道 `pow(N·H,30)` 的窄光 | 替掉「拉伸的纹理」——没有它，加大位移就看到一圈糊掉的画 |
| `halo` 深度背光晕 | `pow(1−N·V, 2.5) × hv`，光只出现在凸起处 | 最便宜的一条（无额外采样），也是「浮起来」最直接的线索 |
| `sparkle` 星屑闪点 | 哈希网格 280×280 + `pow(n,110) × 2.5` + 闪烁门，只长在 `hv` 高的地方；工艺再乘一个系数（星屑 1.45 / 星芒全息 1.30） | **密度是量出来的**：pow 从 32 一路提到 110、倍数从 8 降到 3 —— 浅色插画上密了就只剩「脏」；现在约 470 颗，读作「偶尔闪一下」 |
| `holo` 彩虹流光 | 在静态虹彩之上叠一层 `sin(diag·8 − uTime·0.8 + f·4)`，权重 0.20 且只在掠射角明显 | 第一版 0.35 把画面洗成一层脏紫雾（对比图上一眼可见） |
| `bgZoom`/`bgPar` 卡内背景视差 | 先把画面放大 z（0 → 7.5%），再让**低高度的像素**按转角反向平移（最大 0.03 UV） | 立体感最强的一条。放大是前提：不放大就没有平移余量；位移量夹在 `0.5−0.5/(1+z)` 之内 |
| `glint` 跟手高光 | 拖动时把指针在台面里的位置当成第三盏灯，`pow(N·H, 60)` 的窄光斑跟着手走 | 正好卡在「鼠标划过卡片不会让它动」的边界上：**光可以跟手，卡不能跟手** |

**没移植的八条（都写了理由，用户要哪条再说）**：OCR 文字浮雕 / 浮字（我们的卡面是插画、没有文字层）、用户图层栈与场景分割（没有每卡的前景背景蒙版）、卡背遥测 HUD（观感不符，我们已有六档卡背）、图像美化与调色预设（属于出图管线）、双击翻面与悬停倾斜（这个站**明确删过**这两条）、待机自动旋转与漂浮（与刚定的「2.5 秒余韵后停帧」冲突）、「物理镂空」discard 模式（会在卡上真打洞，风险大于收益，改用陡坡切边）。

#### 透明盖与外凸：「好像要脱离卡面」的两种做法（2026-09-21 第三轮）

用户给了两张参考图：一张是**透明厚盖**（亚克力切边 + 顶部一团光锥，手压在玻璃上），
另一张是**手真的越出卡框**（die-cut）。他要的是「传世和奇迹能有这个效果」。

**先做了 die-cut 的样张（结论：不做）**。`lab/shots/deck7/diecut.py` 用现有深度图当蒙版，
把三张卡（近景特写 / 含细长物件 / 全身）切出来，并量了四个数：

| 卡 | 卡边被切断 | 有效剪影块 | 周长/面积 | **轮廓命中率** |
|---|---|---|---|---|
| 木刀 | 69% | 1 | 0.02 | **0.44** |
| 大小姐 | 100% | 1 | 0.01 | 1.50 |
| 白蔷 | 66% | 1 | 0.02 | **0.65** |

**轮廓命中率** = 蒙版轮廓上画面梯度的均值 ÷ 全图均值：接近 1 就是「切出来一条凭空出现的软边」，
>2 才算蒙版压着画的线。三张里两张小于 1 —— 也就是那条切线**穿过了大片平色**，而不是沿着画家的笔。
另两个数同样致命：毛糙度 0.01~0.02（真人物轮廓该是 0.05~0.15，说明蒙版是个大光斑），
而**人物在卡边被切断 66~100%** —— 我们的卡面是满幅插画，人物本来就被卡框裁着，切出来会变成
「被卡边割断后浮在页面上」。要真做得好得引第三方分割模型 + 63 张蒙版 + 卡体透明 + 定卡后面显示什么。

**所以做的是「好像要脱离」**（用户的词就是「好像」）——四件事，全在卡框之内成立：

| 条 | 机制 |
|---|---|
| **侧壁取色** `wall` | 陡坡上沿梯度**向下**取一笔崖底的颜色混上去（不是只压暗），读作「有一层从下面延续上来的侧壁」 |
| **卡面接触投影** `cast` | 四邻偏移采样判断「隔壁就是主体」，给主体外圈压一圈暗；叠上已有的高度场自阴影 |
| **与盖子的压痕** | 盖子上按底下的深度图采样，主体顶到的地方画一圈压痕光（+ 外圈一点暗） |
| **主体/背景微视差** `drift` | 背景与主体**分开走**（`bgW` 里再减一项让主体反向挪一点）—— 相对运动才是「浮着」的动感来源 |

**透明厚盖**（`lid` + `cone`）：与卡同 footprint、无额外几何，四条叠加 —— 厚切边（SDF 边界上的
亮边，**越斜看越宽**，用 `1/ndv` 撑）、光锥（从顶部斜射的柔光带，**同时**在画面上留一道 caustic）、
接触压痕、整片极淡的膜（0.010~0.065，第一版 0.018~0.075 读作「雾」）。

**盖子的实现路径换过一次，是这一轮最值钱的工程教训**：第一版是**单独一层几何 + `gl.BLEND` 混合绘制**，
观感对了，但实测 **6.1 → 8.3 ms/帧（211 帧里 179 帧超 7ms 的预算）**—— 多一整遍全卡填充是实打实的。
而盖子与卡面 footprint 相同、且永远在卡面之前，所以「盖上」在数值上**就是一次 mix**：改到卡自己的
片元里合成之后，同样的观感、**零额外填充**，读数回到 p50 6.1 / 0 帧超预算。
判据是「有没有多一遍全屏绘制」，不是「这段代码写在哪个文件里」。

**性能（真窗口 165 Hz，帧预算 6.06 ms，`deck7/framedrag.py` 页面内自驱动拖拽，每轮 211 帧）**

| 配置 | p50 / p90 / p99 / max | >7ms 的帧 |
|---|---|---|
| 传世（relief 0.081、20 步、五条通道全开） | 6.1 / 6.1 / 6.2 / 6.3 ms | **0** |
| 奇迹显形后（relief 0.093、24 步、通道全 1） | 6.1 / 6.1 / 6.2 / 6.3 ms | **0** |
| 同上、**4× CPU 限速** | 6.1 / 6.2 / 6.2 / 6.4 ms | **0** |

（置顶的那两条是**视角自适应之后**的读数，步数已回到设计值 20 / 24；在此之前同样两档的 p50 是 8.3 ms。）

**量的时候别同时干别的**：这一轮有几次读数自相矛盾（16 步反而比 20 步慢），原因是量测期间同一台机器
还在跑别的进程；默认状态连量三次一致才敢当结论（奇迹档 8.3 / 8.4 / 8.3 / 8.2）。

**台面 430 → 600px**：桌面卡片从约 371px 宽到约 517px（+39%）。三个上限里的纵向预留从 13rem 收到 10rem（面板实际 chrome 实测约 155px，13rem 是当初按 430px 台面拍的，白扔了 48px）。五个视口都验过（1680×1050 / 1440×900 / 1366×768 / 1024×768 / 390×844）。连带两件事：

- **新出第三档卡面 `xl`（760px q72，约 39 KB/张）**，只给 3D 面贴图与弹层大图用，**不进 `srcset`** —— 列表页一个字节都不多下，只有真打开弹层的人多下约 12 KB。544px 那档（给页内 272px 的卡用的）撑 600px 台面会被拉到 1.9 倍，糊得看得见。
- **画布多了一道总像素上限**（≈1000×1400）：只把 dpr 夹到 2 是不够的，台面面积 ×1.95 + POM 步数翻倍之后，逐片元成本才是大头（600px 台面在 2x 屏上落到约 1.67x）。

**实测（真窗口 165 Hz，帧预算 6.06 ms；`deck7/framedrag.py` 在页面内自驱动拖拽，每轮 211 帧）**

| 配置 | p50 / p90 / p99 / max | >7ms 的帧 |
|---|---|---|
| 传世（relief 0.064、20 步） | 6.1 / 6.1 / 6.2 / 6.2 ms | **0** |
| 奇迹显形后（relief 0.074、24 步、通道全 1） | 6.1 / 6.2 / 6.2 / 6.3 ms | **0** |
| 同上、**4× CPU 限速**（弱设备近似） | 6.1 / 6.1 / 6.2 / 6.2 ms | **0** |

#### 帧时间调速器：把「猜设备」换成「量自己」（2026-09-21）

在这之前，画质档位只有 `pickQuality()` 那**一次性静态判断**（看 `hardwareConcurrency ≤ 4` 或视口短边），
`MAX_PIXELS` 是常数 —— 6 核配弱核显的笔记本、以及任何我没法测的设备，要么白降质、要么掉帧。
现在加了一条反馈回路：

- **只在动画循环活着时采样**（不动「静止即停帧」那条铁律），每次换卡/开弹层**跳过前 24 帧**
  （贴图上传与解码的尖峰不是渲染成本，算进去会让每张卡都「降一档」）；
- **预算不写死**：`refreshMs = min(实测 p10, 16.7)` —— 165 Hz 屏得到 6.1、60 Hz 屏得到 16.7，
  而「一台从头就吃力的 60 Hz 机器」因为那个 `min()` 仍会被判超预算；预算 = `refreshMs × 1.25`；
- 连续两个窗口（每窗口 30 帧）p75 超预算 → **降一档**；连续四个窗口宽裕 → **升一档**，
  且**升不回设备档位上限之上**（弱设备从第 1 档起步、最多也就回到 1）；
- 档位的杠杆：POM 步数上限、新效果因子、盖子开关、画布总像素上限。**弱设备那条路径也收进档位表**
  （原来另有 `fxScale`/`lidScale` 一份，两套系数会在同一台机器上叠乘）；
- 降档**出声**：`console.info('[card3d] 画质降到第 2 档（实测 p75 12.0ms / 预算 7.5ms，刷新率约 165Hz）')`，
  并把 `{tier, baseTier, p75, refreshMs, budget}` 放进 `stats().q`。

**验收（两半分开证，因为一次跑不出完整证据）**

| 要证的事 | 怎么证 | 结果 |
|---|---|---|
| 决策路径真的会动 | `--cpu 20` 限速下跑拖拽 | 档位 **0 → 2**（`q.tier=2`、步数降到 12）✓ |
| 不许误判 | 正常速度下跑（含奇迹显形后） | `tier` 保持 0、210 帧全在 0 档 ✓ |
| 杠杆真的省成本 | 同名义步数下比较：常数 24 步 = p50 **8.3 ms**；改成视角自适应（平均步数更低）= p50 **6.1 ms** | 省 **26%** ✓ |

**这台机器量不出中间档的差别**：为了拿到「降一档省多少」的干净对照，把台面注入成 2200px
（7.4 倍像素）并在第 0 档与第 2 档各量一轮 —— **两轮都是 p50 6.1 ms**（都锁在 vsync 上）。
也就是说这里的 GPU 余量足以吞掉 7.4 倍填充，档位差的成本落在 vsync 地板以下。
所以档位表的数值**不是**在真弱机上标定的，而是由上面那条步数读数与盖子的既有读数推出来的 ——
**这正是调速器存在的理由**：它保护我量不到的设备，而不是让我在这台机器上看出差别。

#### 深度模型对照：为什么仍然是 Small（不是「顺手选了个小的」）

用 6 张代表卡（近景 / 全身 / 细长物件 / 细线密集）比过 Small vs **Base**，判据是**浮雕边缘利不利落**
（3D 卡上看得见的正是边缘：侧壁、切边、投影都挂在它身上）。工具是
`lab/shots/deck7/depth_model_ab.py`（出表 + 边缘 3× 放大图）：

| 指标 | 结果 |
|---|---|
| 高度梯度 p99 | 6 张里 **4 张 Base 更低**（边缘更软） |
| 最大梯度 | 3 张更低、2 张更高（有得有失） |
| 点阵比（16 取模） | 没改善（1.39→1.44、1.55→1.65） |
| 肉眼 | 白蔷 / 银霜 / 木刀在 Base 下明显更糊；「闲坐」的花束与「大小姐」的面部内部起伏 Base 略多 |
| 耗时 | 6 张 107 s（Small 是 6.8 s）—— 63 张要 19 分钟 |

结论：**插画不是照片，换大模型换不来更利的边缘**，继续用 Small。`make-depth.py --model` 留着，
以后想试 Large 或去掉中值那道直接用，不必改文件。（Base 的模型权重仍在 HF 缓存里，约 400 MB，可删。）

**「最重的一档」差点被量成最轻的一档**：奇迹在**显形前借的是收藏那一行**，第一次量它读到的是 `relief 0.032 / steps 8` —— 那是最便宜的配置。驱动脚本因此加了 `--reveal`（先翻面等 1.9s 再量），上面三行才是真的。

**验收**（`deck7/assert3d.js`，跑在收藏库那一页）：六档 `rankEff` 各就各位；**六个纯档位通道全部单调不减**（steps 8→10→12→16→20→24、holo 0→.08→.22→.4→.7→1、halo、cliff、bgZoom、bgParMax 同形）；**奇迹显形前所有新通道为 0、显形后拿到全套**（同一张卡前后比 —— 换卡比会把自己的工艺系数带进来，第一版就这么误报过）；传世拿到全套；拖动中 `glint > 0`、松手回 0；松开 3.2s 后 `running=false`。`relief` 与 `sparkle` **不在**浏览器端的单调性断言里：它们还乘了工艺系数（和纸 0.85 / 玻璃 1.10），所以「收藏的玻璃卡」可以比「珍稀的和纸卡」更凸 —— 那是设计如此，单调性属于**档位表**，由 `check-deck.mjs` 在表上断言（那两条：每档每通道都得写、六档单调不减 + `initGL` 的 uniform 名单与 `draw()` 双向对齐，反向测试三条全拦下）。

**体积**：整站 gzip **6465 → 8904 KB**（+2439，raw +2455）。**逐目录对过账**：+2441 KB = 63 张 760px 卡面；+6.2 KB = `card-3d.js`；两个页面的 HTML 各 +3.9 KB（清单多一个 xl 字段）；**−14 KB = 深度图重出后更小**。预算按既有口径抬到 9600（gzip）/ 27648（raw），账写在 `report-size.sh` 顶部 —— **没有为了省字节压任何画质**。防回归：非卡片页 **0 处不同**，只有首页与收藏库两页变了（`deck6/regress.py`）。

#### 2026-09-21 画质一轮：三个「糊」的来源与一个漏传的字段

用户反馈「浮雕效果有些差，也模糊」。逐条查下来是四个独立的问题，只有一条是参数不够：

1. **`xl` 那一档卡面从头到尾没被加载过**（这条最要紧）。`deck-manifest.html` 生成了三档
   （`s` 272 / `l` 544 / `xl` 760），`card-3d.js` 也写着 `next.xl || next.l || next.s`，
   但 `home-deck.js` 组装给 3D 查看器的对象里**只传了 `s` 和 `l`** —— 于是每一张都静默回退到
   544×762，而 2x 屏上的画布是 1200×1680：**放大 2.2 倍**。那 63 张 760 档（2.4 MB）
   从来没有任何页面加载过。修法是补一个 `xl:` 字段（见 `traps.md` 的「静默回退」一节）。
2. **画布分辨率与纹理脱钩**。`MAX_PIXELS` 只按像素总量夹 dpr，不看纹理够不够：600×840 的台面
   在 2x 屏上按满 2.0 画，而纹理高只有 1064 —— 那 1.58 倍放大不带来任何信息，只把画面拉软。
   现在 `dpr` 跟着卡面纹理走（`texFaceH / CSS 高 × 1.1`），纹理最多被上采样 1.1 倍。
3. **深度图 q75 的块与台阶**。旧注释写「灰阶图没有细节纹理」—— 这个前提是错的：高度场整幅都是
   细节，而且是大面积平滑渐变，恰好是有损压缩最伤的地方；浮雕法线又是对高度场做**差分**的，
   差分会把块效应放大成画面上的条纹。q75 → q92（63 张 341 → 647 KB）。
4. **浮雕量级偏保守**：`RELIEF` 0.032 → 0.040、`POM_STRENGTH` 0.35 → 0.45、
   置换网格 40×56 → 56×78（低配档 28×40 → 40×56）。

**新增两条画质通道**（都进 `RANK_3D` 阶梯、低档为 0 —— 与其余 15 项同一条纪律）：
`disp` 主体色散（按 `puv - uv` 那道合位移把 R 与 B 分开采样，参考站的 sub-surface 色散；
偏移夹在 ±0.004 uv ≈ 屏幕上 4px）、`sharp` 卡面锐化（源头素材只有 700px 高，放大带来的软
用一次邻域采样找回来；**带高光保护**，0.72 亮度起线性关掉，否则白发白衣会被推成死白）。
`check-deck.mjs` 的通道名单同步加到 17 项。

**A/B 实测**（同一角度、同一张 legend 卡，`lab/shots/shot3d.py` 按住拖到 60° 掠射角再截图）：
改后**更清晰、立体感更强、过曝显著减轻**（改前颜面与上胸有一大片死白）。留下的偏过项是彩色
分离边 —— 现在夹在 4px 以内，但 legend 档本身的 `holo`/`cone`/`sparkle` 流光在同一位置也出彩，
两者叠起来比单看任一项都花，所以 `disp` 取值又降了 40%。**已知边界**：正面视角仍然读作
「平面贴图」—— 屏幕空间浮雕在正交视角下没有视差可看，只能靠 AO 与接触影，这是这套方案的
固有上限；要突破得上真几何或 AI 深度 + 更密的置换网格（未做）。

#### 2026-09-21 入站揭幕：把等待变成有内容的一秒

首页首屏在真实网络下约 170 KB（gzip：CSS 约 30 KB、JS 约 20 KB、卡面约 10 KB，其余是那张
97 KB 的壁纸 —— 它在 CSS 里，但 `background-image` 不阻塞首绘），本地量到的 FCP 是 700ms。
这段时间原本是「一片空白 + 卡片逐个浮现」，现在是一层遮罩：一枚呼吸的描边菱形、站名、一条跑光细线。

三条设计边界，与站上既有的 `reveal.js` / `theme-fade.js` 同一套口径：

1. **退场不依赖 JS**。遮罩自己在 CSS 里带一条 `animation: … 3.2s forwards`，JS 没跑/抛错/网络卡住时
   它自己退场 —— 揭幕动画不能反过来变成把访客挡在门外。JS 正常时由 `home-deck.js` 提前给
   `.is-done`，走同一条 keyframes（同一个 `animation` 属性，后者覆盖前者；**两条都不能删**）。
2. **`prefers-reduced-motion: reduce` 下整块 `display: none`**：减少动效的用户不该被加一层动画。
3. 纯装饰：`aria-hidden`，且 `pointer-events: none`（退场万一失败也不挡任何点击）。

就绪判据取「`window load` 且首张卡面 `decode` 完成」—— 只等 load 会露出还在解码的图（视口内的图
不阻塞 load 事件），只等图会露出没排好版的正文。另加最短 420ms（页面太快时遮罩闪一下比不加还难看）
与最长 2.6s（网络慢也先放人进门）两条夹逼。

尺度是照着实拍调了两轮的：第一版菱形 9px / 站名 13px，截图读作「像没加载出来的空白页」；
第二版把菱形改成描边 15px、站名 16px 并收字距加半档字重 —— 中文在小字号 + 大字号距下笔画会被稀释，
看起来像浅灰虚字，**其实颜色一直是主色**，改字重比改颜色管用。

同批做的一处小优化：首卡面 `<img>` 加 `fetchpriority="high"` 与 `decoding="async"` —— 它是首屏唯一的
卡面、也是 LCP 候选；JS 首帧会换到「今天的第一张」，属性留在元素上，换过去那张照样吃这个优先级。

**顺带记录两条「量过了但没做」的结论**，免得下次重新调研：

- `card-3d.js` 是 `defer`（低优先级、gzip 后约 14 KB），首屏并不等它；改成按需懒加载只会让
  **第一次点开弹层变慢**，净收益为负 —— 不做。`prefetch()` 也早就在 `home-deck.js` 里预取后两张的 2x 图了。
- 壁纸那 97 KB 延后加载在纸面上最诱人，但它本来就不阻塞首绘，而延后必须把 URL 从 CSS 挪进 JS，
  代价是**无 JS 时壁纸永远不显示**（渐进增强破坏）。不值。

#### 2026-09-21 边框含蓄化：先修倒挂，再收窄

用户说「边框有些丑」。量了一遍六档的实际框宽（`getComputedStyle` 读三个令牌），第一件事就不是审美了 ——
**框宽根本没随等级递增**：

| 档 | 改前 | 改后 |
| --- | --- | --- |
| 收藏 | 2 + 12 = 14px | 2 + 6 = **8px** |
| 珍稀 | 3 + max(9,1) = 12px | 2 + max(7,1) = **9px** |
| 史诗 | 4 + max(6,5) = **10px** ← 比珍稀还窄 | 2 + max(4,8) = **10px** |
| 秘藏 | 4.5 + max(3,9) = 13.5px | 2.5 + 8.5 = **11px** |
| 传世 | 5 + 11 = 16px | 3 + 9.5 = **12.5px** |
| 奇迹（显形） | 5 + 11 = 16px | 3.5 + 9.5 = **13px** |

总宽 = `--rank-frame` + `max(--rank-mat, --rank-band)` —— 两条令牌此消彼长，中间任何一档改值都可能把顺序搞乱。
史诗那 10px 就是这么来的：它的 `--rank-mat` 比珍稀小、`--rank-band` 又没补回来。稀有度是靠**看**认的，
一个「史诗的框比珍稀窄」的顺序错误比任何配色问题都致命。

收窄的口径是用户选的「更含蓄」：高档从 16px 降到 12.5px（占卡宽 6.6% → 4.6%），
同时 `--rank-band-a`（边栏压深）×0.7、`--rank-line`（装饰线）降 alpha、`--rank-orn`（角饰）0.30/0.65/1 → 0.20/0.42/0.68。
结构一下来，画面就出来了。

#### 2026-09-21 第二批四种工艺：珍珠母贝 / 烫银 / 绸缎 / 极光

十二 → 十六种，两档各 8 种（32 / 31 张）。每种换一个**物理机制**，不是换色：

| 工艺 | 机制 | 表达 |
| --- | --- | --- |
| 珍珠母贝 `nacre` | 薄膜干涉 | 三条大尺度错位的斜面渐变，**一根 repeating 条纹都不放** —— 全息（foil）是周期性衍射（等距多色），珠母是层间干涉（大块缓变、只在掠角出彩），两者的区别就在「有没有周期」 |
| 烫银 `silver` | 冷色相金属 | 与烫金同一套结构（双高光 + 拉丝 + 压深四边），只换色温；压深比 gold 深（.40 对 .34）—— 银的明度差比金大，暗部不到位就成白雾 |
| 绸缎 `silk` | 经向丝光 | 一束束**竖向**软高光带，周期取 6/11/23/37 互质数（等距竖条在 272px 下会读成条形码） |
| 极光 `aurora` | 高层大气发光 | 绿紫双色斜向光带，`overlay` 混合 |

分配按语义就近（珠母从玻璃/雪华里拿、烫银从烫金/全息里拿、绸缎从和纸里拿、极光从星夜里拿），每种 3 张 ——
其中极光特意换到一张**暗底**的史诗卡上。第一版四种都按「色块上好看」选了 `soft-light`/`screen`，
结果在 272px 的真卡上全都像蒙了白雾的普通纸，见 `traps.md` 的「混合模式要在真实底色上验」。

### ㊴ 卡片等级体系：六档阶梯（收藏 / 珍稀 / 史诗 / 秘藏 / 传世 / 奇迹）— `data/home-cards.yaml` 的 `rank` + `scripts/rank-deck.py` + `21-card-deck.css` + `assets/js/card-3d.js` + `home-clock.js` + `deck-wall.js`

每张卡有一个等级，观感按等级递进：**收藏 → 珍稀 → 史诗 → 秘藏 → 传世 → 奇迹（隐藏）**。`rank` 是**必填字段**，`scripts/check-deck.mjs` 校验值域 —— 漏写它不会报错，只会按「收藏」渲染，而一张本该传世的卡静默降级在页面上完全看不出来（这正是这个仓库反复要拦的那类错）。六档与 i18n 的 `deckRank*`、`deck-manifest.html` 的 `rankLabel` 表、`card-3d.js` 的 `RANK_3D`、`deck-wall.js` 的 `RANK_ORDER`、`home-clock.js` 的 `RANK_WEIGHT` 是同一份清单，前四处的**键一一对应有守卫**（见下）。

#### 两轴分工：等级管材料与档位，风格管纹样与质感

**2026-09-21 之前这两条轴是打架的。** 那八种工艺各自写自己的框色渐变（`--cframe`），而等级也写同一个令牌 —— 后果是**华丽度与稀有度脱钩**，而且是量得出来的：37 张「收藏」档里有 **18 张**戴着 `金边 / 金继 / 玻璃` 这类重工艺，而 6 张「传世」档里倒有两张是相对朴素的 `和纸`；全站唯一的 `星芒全息` 当时定在「史诗」档。也就是说一张「收藏」卡可以比「传世」卡更花 —— 与「低档像标准模板、高档逐级突破」正好相反。

现在的分工是**材料归等级、纹样归风格**：

| | 谁拥有 | 令牌 |
|---|---|---|
| 框的**材质底色**（六档色阶） | **等级** | `--cframe` |
| 框的**质感叠层**（玻璃的通透、金边的拉丝、和纸的奶白） | 风格 | `--cframe-finish` |
| 框棱宽度 / 画面内缩 / 工艺强度 / 覆膜 / 纹章 / 徽章 | **等级** | `--rank-*` |
| 卡面纹样（形状、mask、混合模式、手抖滤镜） | 风格 | `--coverlay*`、`--cfilter` |
| 名牌质感 | 风格 | `--cplate*` |

两层框在 `.home-card` 上叠：`background-image: var(--cframe-finish, none), var(--cframe)`。**风格的 `--cframe-finish` 必须半透明** —— 原来那几条不透明的金属渐变正是压死色阶的元凶（实测：14 张金边卡会一起变金，与它们是不是传世无关）。这条写进了那个文件的第 7 条规矩，并且有守卫核它（见下）。于是 8 风格 × 6 等级 = 48 种组合仍然**只有 14 条规则**（组合爆炸正是这份 CSS 当初膨胀到 67 KB 的原因）。

**`--cframe` 这个令牌名刻意没有改**：`09-home.css` 的「今日一卡」微卡与 `home-clock.html` 读的就是 `var(--cframe)`，而那不是 `.home-card` 的后代、拿不到基础声明 —— 改名会让它**静默**丢掉框色。保住这个名字的副作用是好的：微卡自动获得了六档色阶（实测首页右上角那张抽到「珍稀」时是绿框）。

#### 六档的取值（`21-card-deck.css` 的「等级」一节）

| 档 | 框色 | 框棱 | 衬边 | 画面内缩 | 工艺倍率 | 徽章 | 覆膜 | 纹章 |
|---|---|---|---|---|---|---|---|---|
| 收藏 | 灰白 | 2px | 12px | 14px | ×.35 | 圆点 13px | 0 | 0 |
| 珍稀 | 绿 | 3px | 9px | 12px | ×.55 | 菱形 14px | .12 | 0 |
| 史诗 | 蓝 | 4px | 6px | 10px | ×.75 | 五角星 15px | .30 | .30 |
| 秘藏 | 紫 | 4.5px | 3px | 7.5px | ×.90 | 盾形 17px | .50 | .65 |
| 传世 | 金 | 5px | 0 | 5px | ×1 | 皇冠 19px | .65 | 1 |
| 奇迹 | 虹彩 | 5px | 0 | 5px | ×1.2 | 八芒星 22px | .9 | 1 |

**3D 侧的七条立体通道也是同一张阶梯**（`card-3d.js` 的 `RANK_3D`，2026-09-21 加；机制见 ㊳ 的「立体通道」一节）。它们与上面那张 CSS 表是**两条并行的阶梯**：CSS 管卡片墙/首页那张扁卡，`RANK_3D` 管弹层里那张 3D 卡（3D 代码不读任何 CSS 令牌，只有卡背配色走 `--cardback-*`）。每个通道都**单调不减**、收藏档为 0 —— 于是低档卡与加它们之前逐像素一致：

| 档 | relief | steps | sparkle | holo | halo | cliff | bgZoom | bgPar |
|---|---|---|---|---|---|---|---|---|
| 收藏 | 1.00 | 8 | 0 | 0 | 0 | 0 | 0 | 0 |
| 珍稀 | 1.15 | 10 | .10 | .08 | .05 | .15 | .008 | .003 |
| 史诗 | 1.30 | 12 | .28 | .22 | .16 | .32 | .015 | .006 |
| 秘藏 | 1.50 | 16 | .48 | .40 | .34 | .52 | .028 | .012 |
| 传世 | 2.40 | 18 | .78 | .70 | .70 | .78 | .050 | .022 |
| 奇迹 | 2.90 | 20 | 1.0 | 1.0 | 1.0 | 1.0 | .075 | .030 |

**第三轮又加了五条**（透明盖与「好像要脱离卡面」，机制见 ㊳ 的「透明盖与外凸」一节）。
**这五条低四档一律为 0** —— 只有传世/奇迹变，于是低档卡与本轮之前逐像素一致：

| 档 | wall 侧壁取色 | cast 卡面投影 | lid 盖子 | cone 光锥 | drift 微视差 |
|---|---|---|---|---|---|
| 收藏 / 珍稀 / 史诗 / 秘藏 | 0 | 0 | 0 | 0 | 0 |
| 传世 | .70 | .65 | .75 | .70 | .60 |
| 奇迹 | 1.0 | 1.0 | 1.0 | 1.0 | 1.0 |

`steps` 的顶端一度被降到 20（24 步在 165 Hz 下越线，p50 8.3 ms）。**同一天又还回了 20/24**：
片元里改成按视角缩放（`mix(0.60,1.15, graze)`，掠射角才需要多步）之后，正面看的实际步数只有六成、
而侧面看更准 —— 名义步数回到设计值，帧时间反而回到 p50 6.1 / 0 帧超预算（见 ㊳ 的性能表）。
**编译期上限随之从 24 抬到 32**（要装得下 24 × 1.15），并且有一条守卫核这个不等式 ——
写小了会静默截掉掠射角那一档。

`relief` 是**基准 3.2% 卡宽的倍率**（传世 7.7% / 奇迹 9.3%；600px 台面上约 40 / 48px 位移）；`bgPar` 是背景视差的**最大位移**（UV 单位，实际每帧按转角给，静止时为 0）。`relief` 与 `sparkle` 还会被**工艺**再乘一次（`STYLE_3D` 里和纸 0.85 / 玻璃 1.10、星屑 1.45 / 星芒全息 1.30）—— 所以「收藏的玻璃卡」可以比「珍稀的和纸卡」更凸，那是设计如此（工艺管纹样与浮雕倾向）。

**三重编码**（这一节的设计主线）：六档**同时**在三个通道上不同 —— **颜色**（框的材质底色）、**形状**（徽章轮廓 + 尺寸）、**材质**（框棱宽 / 画面内缩 / 工艺浓度 / 覆膜）。只靠颜色是不够的（色盲玩家分不出金与绿，而金色那一档偏偏是最高档），所以「灰度下还能不能分」是本次验收的一条**硬判据**，做法与读数见下。

**画面内缩（`--cart-inset` = 框棱 + 衬边）就是「插画逐级出框」**：14px → 5px，越低档衬边越宽（读作「裱在框里的画」）、越高档画面越铺满（读作「一直铺到亮棱边上」）。低档那两个像素的收紧还有个副产品：画面框变窄后 `object-fit: cover` 会把两侧各裁掉约 3%，构图本来就更「紧」、更像标准版。

实现上有一处顺手修掉的旧错：卡面上与画面齐平的每一层（`::before` 纹样、`::after` 扫光、`.home-card-ghost` 换卡残影、`.home-card-plate` 名牌、`.home-card-lens`）以前都各自硬编码 `inset: 2px` —— 那个 2px 正好等于**旧的**默认框宽，所以只有 2px 那档是对齐的，框一加粗（史诗 4px、传世 5px）纹样就比画面多铺出 2px（没人会去比这个，但它一直在）。现在全从 `--cart-inset` 算，只有一处定义。

**徽章用 `clip-path` 而不是 `<svg><use>`**：首页那张卡是**同一段 DOM 换类名**（`home-deck.js` 的 `apply()` 按前缀清掉旧的 rank 类再加新的），要跟着换形状就得改 DOM 属性；`clip-path` 是纯 CSS，换类名形状自己就变了，JS 一行不用动。圆点用 `border-radius: 50%`（`clip-path: none`），其余五档用 `polygon()`。**`filter: drop-shadow` 挂在父级而不是被裁的那个元素上** —— `clip-path` 的绘制顺序在 `filter` 之后，挂在被裁的元素上会被一起裁掉（阴影整条消失、且不报错）。徽章在首页那张卡上进**名牌条**（跟着信息带走，位置仍在卡面右下角），因为直接压在画上时对比度站不住（浅色画配浅色徽章实测约 1.5:1），而卡片墙没有名牌，徽章就贴画面右下角。

**底部信息带**同批重排成四级层级：名字（`.78rem`）→ 系列（`.68rem`）→ 卡号（`.72rem` 等宽）→ 徽章。系列与名字相同时（清单里没写 `name` 的那几张，`label` 退回系列名）不重复显示。

**奇迹仍然「正面与收藏完全一致」**，这条不变量不许破：`card-3d.js` 的 `rankOf()` 在显形前**直接返回 collector**，`RANK_3D` 里那套华丽参数根本没被取用；令牌那一侧也是一样 —— `.home-card-rank--miracle` 故意照抄收藏那一套，只有 `.is-revealed` 才切到另一组。`lab/shots/deck6/probe.js` 里有一条断言专门比这六个令牌值（显形前的奇迹 vs 收藏），六档令牌阶梯里也含它。

**显形有两条入口**：在弹层里**累计转满 360°**（`turned` 累加拖拽角度），或**在背面停留 1.5 秒**。两条都验过，并且换到别的卡再换回来会重新藏起来。停留那条**必须用 `setTimeout`**：卡停稳后渲染循环就停了，写在 `update()` 里的判据永远不会执行（本文件 ㊴ 的显形那一节）。

#### 边框：等级管结构、工艺管材质（2026-09-21 第二次重做）

用户先要求「边框要和卡片风格匹配」，随后给了一份完整的边框设计框架并指出「你设计的边框太奇怪了」。
**诊断（逐条对照那份框架）**：上一版把边框的**分量**挂在工艺轴上（进阶工艺 = 一条 20px 的深色雕花带），
三个后果 ——

1. **同档的卡框一厚一薄**（收藏卡顶着 25px 的深色带、传世卡只有 5px）→ **稀有度读不出来**，
   而框架里「主边框」的职责恰恰是表达稀有度；
2. 那条带子是**不透明的一整条** → 读作「给画裱了个相框」，而且抢插画（框架「常见错误」第 1 条）；
3. **六种工艺六副框** → 与「所有卡共用圆角、边距、光源方向」冲突（框架 §5 第 6 条）。

**现在的分工：等级管结构，工艺管材质。** 带宽、装饰线、角饰、淡入全部由 `.home-card-rank--*` 给
（`--rank-band` / `--rank-band-a` / `--rank-line` / `--rank-orn`），工艺的 `--cframe-finish`
会自动铺到整条边上 —— 于是「同档的卡框一样厚、档位越高越讲究」与「工艺看得出来」同时成立：
玻璃的框是半透明的、金边是拉丝的、金继是暗底金调。**六种工艺各自的框零件（按工艺覆写的
`--fret-*`）已全部拆掉**，整副框只剩一套设计。

边框的五层与那份框架的对应：

| 框架里的层 | 本仓库的实现 |
|---|---|
| 外轮廓 | `.home-card` 的圆角 `--cradius`（首页 12px / 卡片墙 10px，全站统一） |
| 主边框 | `--rank-frame`（框棱）+ `--rank-band`（带宽 0 → 11px），材质来自工艺的 `--cframe-finish` |
| 内框 / 安全线 | `.home-card-mat`（贴着画面边缘的一条细线；低档清楚、高档归零 —— 同时就是「插画逐级出框」） |
| 角饰 | `.home-card-fret::after` 的四角花心，`--rank-orn` 控制显隐（0 → .30 → .65 → 1）；奇迹显形后换**棱角碎星** |
| 稀有度标识 | `.home-card-mark`（形状 + 尺寸 + 颜色三重编码的徽章，右）；文字等级在卡片墙的格下 |

阶梯（带宽是稀有度阶梯的主要载体，按「低档靠版式与颜色、中档靠边框与局部工艺、高档靠全画与材质」逐级加）：

| 档 | 带宽 | 边框总宽（占卡宽） | 角饰 | 装饰线 | 动效 |
|---|---|---|---|---|---|
| 收藏 | 0 | 14px（5.1%） | 无 | 深灰细线 | 无 |
| 珍稀 | 1px | 12px（4.4%） | 无 | 暗绿细线 | 无 |
| 史诗 | 5px | 16px（5.9%） | 无（.30 起有装饰线） | 冷白 | 无 |
| 秘藏 | 9px | 18px（6.6%） | 四角花心（.65） | 淡紫白 | **绕框亮带** |
| 传世 | 11px | 17px | 四角花心（满） | 暖金白 | **绕框亮带** |
| 奇迹 | 0（异形/无框，全画） | 5px（1.8%） | 无 → 显形后四角碎星 | 白 | 显形后绕框亮带 |

边框总宽仍在那份框架给的「占卡宽 5%~10%」经验线里（奇迹那一档是「异形 / 无框，全画」，故意让位给画面）。
**边栏底改成随等级淡入的半透明压深**（`--rank-band-a`：0 → .62），所以它读作「这条边更实」而不是「裱了框」，
底下的材质还透得出来。

**动效层**：秘藏起给一条**绕框走的窄亮带**（`@property --fret-angle` + `conic-gradient`）。
两条刻意约束：① **只挂首页那张卡**（`.home-deck .home-card`）—— 卡片墙一页 63 张，63 个每帧重绘的
渐变图层是实打实的开销（框架那条「动画太多，掉帧、发热」说的就是它），而且墙上那张卡也不大；
② `@property` 没注册的老浏览器上动画直接不生效，**退化成静态框**（不报错、不崩），另配
`prefers-reduced-motion` 完全关掉。亮带做成**窄而冷的一条**而不是整圈彩虹 —— 高档卡「元素堆满像廉价闪卡」
也是被明确警告过的。

**工艺两档（普通 6 / 进阶 6）现在只作为分类口径保留**（2026-09-21 起还驱动收藏库**筛选条的分组**，见 ㊿ 的「筛选条重做」），不再驱动边框：
让工艺驱动边框，就必然与稀有度阶梯打架 —— 这是这一轮最要紧的一处取舍。
**哪一种算哪一档的唯一定义处是 `_partials/deck-manifest.html` 的 `$styleTier` 表**
（普通 foil / washi / ink / yukika / starnight / frostcrack，进阶 holo-prism / glass / gold /
kintsugi / filigree / enamel）。这张表此前只以**注释**形式存在，后果实测到了：「冰裂
frostcrack」在注释里写着是普通，两档的清单里却漏了它 —— 三处文档（YAML 头部、CSS 注释、
本文件）各说各话，页面上一点看不出来。现在它是模板里的一张真表，`check-deck.mjs` 双向核它。

#### 纹样生成器：`tools/cards/make-ornaments.py`（等宽描边是「生硬」的根因）

用户的原话是「雪华、金边、金继的线条生硬」。**根因在数据里**：那三张令牌全是**等宽描边画在
直线段上** —— 雪花是 `L` 直线段 + 每条统一 `stroke-width` + 完美镜像；金继是 5 条固定折线在 4 个
固定线宽上重复、**彼此没有一处交叉**。等宽 = 尺子画的，这不是审美偏好而是可执行的判断。

于是写了一个生成器，核心是 `band()`：把一条**脊柱折线**变成**有粗细变化的闭合填充轮廓**
（`w(t) = w0 + (w1-w0)·t^taper`，沿法线左右偏移半宽）。三条几何规则：

1. **向尖端收细到 0**（`w1=0`）—— 真雪花的枝是抛物面、末梢是一个点；真金继的缝是**裂缝的开口**，
   向两端收细、在交叉处变宽。（snowcrystals.com 的枝晶生长页；arXiv 2501.07882、cond-mat/0609104）
2. **准对称而不是完美对称**：六枝各 ±2° 抖动、长度 ±8%、同一枝**两侧不镜像**、侧枝越靠尖端越短、
   递归只分两级（「real snowflakes are only slightly fractal」）。（snowcrystals.com/branching）
3. **层级继承**：子缝是母缝的 0.72 倍宽 / 0.6~0.9 倍长，分叉角 ±48~70°（干裂纹的交叉角趋向 120°）。

**但雕花框那套零件相反：那里等宽是对的**（真鎏金画框的边栏、宝石切面、珐琅掐丝本来就是等宽线），
所以那些零件照旧用 `stroke`，只有有机形状（雪、裂缝）才用变宽的 `band()`。

**金边的「生硬」是另一回事，是物理搞反了**：金属是导体，颜色活在**镜面反射**里（金色高光约
`#ffd891`），漫反射几乎为零。旧版是一条又宽又亮的黄渐变 —— 所以发闷。重做成「暗底 + 一层暖光 +
**两条窄高光** + 沿一个方向的拉丝（各向异性：高光要沿一个轴拉长）」，明暗软停 + 挂手抖滤镜。

**字节账**：第一版每条线都过样条、坐标留一位小数，整批 95 KB（单张雪花 20 KB）；改成
`per_seg=1`（脊柱点直接当轮廓顶点）+ 整数坐标后 **39 KB**（单张雪花 3 KB）。理由是 272px 上让线条
读起来「手画的」是收尖 + 抖动 + 侧枝渐短这三件事，样条那点平滑在那个尺寸看不见；而裂缝、冰裂
在真实里本来就是两三个折点一段的**棱角**线（平滑反而不像）。

**产品**：`assets/css/extended/20-card-ornaments.css`（**生成物，入库、不要手改**；文件名以 20- 开头，
主题按数字序合并，排在 21- 之前）。**19 个令牌**：三朵雪花、裂缝网、星屑场、珐琅格；雕花框零件（边栏瓦片横/竖、
角花五件 —— 圆花心 / 棱角碎星 / 凹角 / 玫瑰盘 / 齿轮环、宝石）；六条数学曲线徽记（星形线 / 双纽线 / 内摆线 / 玫瑰线 / 蝴蝶，
走 clip-path 不走 mask）。2026-09-21 删掉两套没人消费的边栏瓦片（`--tex-fret-rule`/`-v` 与 `--tex-fret-crack`/`-v`，
守卫⑤ 报的那条提示就是它们）。看一眼它们长什么样的工具是 `../lab/shots/ornaments/build.py`（生成一页对照，
每个令牌 × 金/浅/深三种底色）—— 集成到卡面之前先看大图，比在 272px 的卡上猜快得多。

**授权**：「去网上搜好素材」的结果是**没有能直接用的**：Kenney 的 Fantasy UI Borders 是 CC0 但那是
方块游戏 UI 的九宫格；game-icons.net 是 CC BY 3.0（要页脚署名 + NOTICE 文件）且只有单件花纹、
没有整张卡框；Wikimedia / Openclipart / SVG Repo 从本机连不上；Pixabay 只发 PNG，且条款里
「改色缩放仍算原样分发」对「把素材提交进公开仓库」有风险。**所以自己生成**：零授权负担、参数可调、
与仓库里 `tools/` 那套「本地生成、产物入库」一致。

**新增的四种工艺**（当天就分了卡，十二种工艺现在都有用例）：
`filigree` 雕花金（进阶，参考图那种：深底 + 雕花框 + 琥珀宝石，卡面是素的）、
`enamel` 珐琅彩（进阶，实心六边格涂四块宝石色、缝里露出框色就是金线）、
`starnight` 星屑（普通，疏密不匀的星点与流星痕，**不遮画面**）、
`frostcrack` 冰裂（普通，与金继共用同一张裂缝网，材质换成冷白、缝是亮的）。

**守卫**（`check-deck.mjs` 又补两条）：⑤ 生成物里的纹样令牌与 `21-card-deck.css` 里引用的
**双向核对**（引用了不存在的 = mask 静默不画；生成物里有没用上的 = 提示）；⑥ 每种风格必须
**显式声明** `--craft-ornate`（漏写 = 静默算普通工艺、不长雕花框，页面上看不出是漏了还是本来就该这样）。
守卫的正则按 `--tex-` 前缀收窄 —— 手写的长度令牌（`--fret-off`）不带这个前缀，第一版因为按
`--fret-` 扫而**误报**过一次。

#### 定级脚本：`scripts/rank-deck.py`（客观、可复跑、幂等）

六档阶梯是视觉系统的骨架，所以它得有一个**可复算、可复核**的分级依据，否则「哪张该是哪档」只能凭手感。依据沿用首版那三条**能量出来的东西**，刻意不含「角色人气」这类主观项：**画面梯度**（卡面灰度图的平均梯度，权重 .50）、**卡面字节**（.30）、**源图分辨率**（.20）；三项各取**百分位**再合成（用百分位而不是 min-max：换一张图产生的极端值不该把其他 62 张全压到低分那一头）。

分档口径：**只在原来的档内部按分数切**（收藏 37 → 收藏 24 / 珍稀 13，史诗 19 → 史诗 11 / 秘藏 8），传世 6 与奇迹 1 **一律不动**（那 7 张是按设计挑的，重排会把「隐藏等级」这类语义弄乱）。张数是常量而不是百分比 —— 百分比会随加卡漂移，而「珍稀留几张」是设计决定。

- `python scripts/rank-deck.py` 打印六档名单（带三项子分）、写 `data/rank-scores.json`、出接触表 `../lab/shots/rank-pick/sheet.png`
- `--apply` 只改 `rank:` 那一行的值（行尾注释、取景注释、行序一律不动）
- `--check` 只列清单与建议的差异、不写任何文件 —— **手改过哪几张，这里看得见，脚本不会覆盖你的手改**

**它顺带查出一件事**：原来那四档在客观分上**本来就不单调**（史诗里有分很低的、收藏里有分很高的：珍稀档的「雪原」80.5 分高过史诗最低分 43.7，共 13 张这样的卡）。原因是最初的四档并不完全由这三项量决定。这次**没有**因此全局重排（那会把传世/奇迹那 7 张设计挑的卡也卷进去）—— 观众看到的是**按档位给的观感**，客观分只决定了成员；脚本会把这个区间重叠如实打印出来，但不阻断。

#### 守卫（`scripts/check-deck.mjs` 新增的四条 + 反向测试）

每一处漏接的表现都是**静默降级**，所以每一处都要有脚本盯：

1. **CSS 里必须有 `.home-card-rank--<档>`** —— 漏了那张卡按**收藏**渲染（框细一档、没有内衬线、徽章是圆点），看不出是漏了还是设计如此
2. **每档的令牌要齐**（`--cframe` / `--rank-mark` / `--rank-craft` / `--rank-mat`）—— 缺一条就是那一个通道静默沿用上一层的值，三重编码退化成只靠颜色。收藏档特例：它的材质底色就是 `.home-card` 的基础声明那份（与 `foil` 之于风格同一个道理）
3. **风格不许写 `--cframe`、必须有 `--cframe-finish`** —— 写前者会把等级的材质底色整片盖掉
4. **`RANK_3D` 与 CSS 的键一一对应** —— 原先只守了 `STYLE_3D`，等级那张没人核；六档之后「少一档」的表现是「首页看着是珍稀的框、转起来是纸白切口」，而这两种视图永远不会同时出现在一屏里
5. 另外核 `deck-manifest.html` 的 `rankLabel` 表与两处阈值表的可容纳性（卡背分级靠 `back` 序号取 `BACK_RING_A/W` 的值，**序号超出表长会取到 undefined、那圈徽记环静默画不出来**）

**守卫做过反向测试**（一条拦不住东西的守卫比没有守卫更糟）：故意破坏四处 —— 抽掉珍稀档的 `--rank-craft`、删掉整条秘藏档规则、让金边风格偷写 `--cframe`、从 `rankLabel` 表里删掉珍稀 —— **四处全被拦下**，恢复后回到全绿。

#### 验收（可量化的读数，证据在 `../lab/shots/deck6/`）

| 判据 | 怎么量 | 实测 |
|---|---|---|
| 六档令牌成阶梯 | `deck6/probe.js` 读计算值并与写死的期望表逐项比 | **PASS**：框棱 2→3→4→4.5→5→5、衬边 12→9→6→3→0→0、工艺 ×.35→×1.2、徽章 13→14→15→17→19→22（元素实际盒子与声明尺寸逐个吻合，证明形状真画出来了）、`--cframe` 六个唯一值、徽章 clip 分布 1×none + 5×polygon |
| 奇迹显形前 = 收藏 | 同一脚本比六个令牌值 | 2px / 12px / .35 / 0 / 0 / 14px，与收藏逐项相同 |
| 画面内缩真的生效 | `deck6/measure.py` 从**像素**上扫卡的上边缘（六档 × 八风格取平均） | 14.2 / 12.1 / 10.2 / 8.2 / 5.1 / 5.2 —— 与 CSS 声明的 14/12/10/7.5/5/5 **吻合到 0.2px** |
| 六档色阶真的画出来了 | 同上，量框上那条带子的平均色 | #b6b8bb 灰 / #a1baa6 绿 / #a5b3c7 蓝 / #b3a4c4 紫 / #b7a88b 金 / #cbb8c4 虹彩 |
| **不靠颜色也能分** | 整张对照图套 `filter: grayscale(1)` 再看（三重编码那条） | 能分 —— 靠的是**形状 + 画面内缩**。同时量出一个如实的结果：框的**明度并不单调**（184/180/178/170/169/189），因为这六条是一个金属色阶（每条渐变都同时含亮面与暗面），差别主要在**色相**上 |
| 3D 六档都接上了 | `deck6/assert3d.js` 在 `/collection/` 上逐档打开读 `stats().rankEff` | **PASS**：六档 rankEff 各自对上；奇迹显形前 rankEff=collector；显形两条入口都成立（停留 1.5s、转满一圈 turned=8.28）；换卡后重置 |
| 老的两条入口没坏 | 同上 | 同上（这两条是本轮唯一必须「证明没坏」的旧功能） |

对照图有三版：`deck6/sheet-light.png`（彩色）、`sheet-gray.png`（灰度，验三重编码）、`sheet-dark.png`（深色主题）。横看一行是「同一档的不同纹样」、竖看一列是「同一纹样逐级升级」——**正交性**就是靠这个一眼验的：只摆六档看不出「某个风格把色阶盖掉」这类问题。

**体积**：这次只涨 **+1 KB gzip**（整站 6451 → 6452 KB gzip，CSS +4 KB raw、卡片页 HTML +6 KB raw，gzip 后基本不变），**0 字节新图** —— 六档材质、徽章、出框全是 CSS。注意：改动前的记录值是 6358 KB，那是 2026-09-20 记的，中间两个提交（每日 12 张、收藏库那一页）已经把它推到 6451 KB 了；算这次改动的账要对 **HEAD** 做一次基线构建才准（方法：`git clone` 到临时目录再 `hugo`，`compare` 分类字节）。

**3D 侧的「更华丽」三件**（与本轮无关，是本档位参数驱动的）：① 卡边材质按等级（纸白 / 烫金 / 镭射 / 光刃）；② **高度场自阴影** —— 沿光方向采 5 个样，被更高的地方挡住就压暗。这一条才是「主体浮起来」的关键：位移只是把画面抬高，而**它把光挡住、在卡面上留一道影**才是眼睛判断「这是一层浮在上面的东西」的依据；凸起内部四周更低，遮挡值自然为 0，所以影只落在背景那侧；③ **由角速度驱动的亮带**（转得快就亮、停下就淡掉；常驻会像印上去的）与一层错频虹彩。卡背的分级这一轮从「一串 `rk === 'epic' / 'legend' / 'miracle'` 的字符串比较」改成按 `back` **序号**取两张表（`BACK_RING_A` / `BACK_RING_W`）——四档时勉强能读，六档就是十三条分支。

**还没做 / 可以继续**：① 六档在 272px 上是分得开的，但**低三档在灰度下差别较弱**（靠形状与内缩扛），如果想让灰度下也一眼分明，可以把框的**明度**也拉成单调阶梯（把收藏/珍稀那两条压暗一档）—— 那是一次纯视觉取舍；② 工艺名里 `金边` 现在其实指「金质的框质感」，而框的材料已归等级管，所以它在低档看到的是灰框 + 一层金质感 —— 名字要不要跟着改（如「拉丝」）由用户定；③ 移动端的帧率与深色主题下的体感都还没有真机/逐张量过（本轮量的是桌面 1680px + 明暗两套对照图）。

### ㊵ 卡面的两处形态改动：风格十六 → 八、取景改成填满

**风格精简**（2026-09-20，用户确认）：十六种里其实只有四个原子配方（环/放射、线性线格、mask 形状、纯光层），同一配方的变体在 272px 下看不出差别，而每多一种就多一份明暗两套的维护面。保留 `foil / holo-prism / gold / glass / ink / washi / yukika / kintsugi`，砍掉 `holo-gold`（与 foil 同构，3D 里色相是参数不是风格）、`gothic`、`frost`、`sakura`、`asanoha`、`seigaiha`、`nishiki`、`uchiwa` 与备用的 `pixel`。用被砍风格的 15 张卡按族挪到最接近的保留项（`holo-gold→foil`、`frost/sakura→yukika`、`gothic→kintsugi`、`asanoha/uchiwa→washi`、`seigaiha→glass`、`nishiki→gold`），生成器的像素通道一并删除。**CSS 从 67 KB 降到 54 KB**。

**取景改成填满**：原口径「整幅装进卡面、装不下就补边」实测让 **32 张里 20 张**露出空带。现在的优先级是用户定的：**先保头像完整、其次半身完整** —— 窗口按人物宽度定、纵向裁成胸像，头不能被切（结构性保证，见 traps 的「`disabled` 只挡真实事件」一节）。「头顶留白」是生成器逐张打印的可核对数字，低于 1.5% 会打 ⚠（实测有两张是源图本身顶部就裁得紧，不是我裁的）。

### ㊶ 顶栏吸顶 + 滚动后加深（2026-09-21）

**做法**：`10-nav.css` 的「五、顶栏吸顶」给 `.header` 加 `position: sticky; top: 0; z-index: 40`；`assets/js/header-sticky.js` 在文档顶部插一个 1px 哨兵、用 IntersectionObserver 判断「是否已离开页面顶部」，给 `<html>` 加 `.is-scrolled`，由 CSS 换成更实的 `--surface-header` 并补一道 `--shadow-sticky`。

**为什么是 sticky 而不是 fixed**：sticky 仍占文档流里的那 60px，所以**没有任何布局位移** —— 主题 `main.css` 的 `min-height: calc(100vh - --header-height - --footer-height)`、首页 hero 的高度、`12-toc-rail.css` 里 `top: calc(var(--header-height) + 24px)` 全部照旧；fixed 会把顶栏从流里摘出去，等于全站 60px 的位移，还得回头补一堆补偿。

**z-index 取 40 是量过的层级位置**：看板娘 6、进度条 50、卡片弹窗 80、卡片组弹层 90、返回顶部 99、跳过链接 100（层级表在 `17-a11y.css` 的文件头）。低于 50 是有意的 —— 顶部那 2px 进度条压在顶栏上沿的「装订线」上，像骑在顶栏上；低于 80/90 是必须的，弹层打开时要盖住顶栏。

**锚点遮挡这件事早就写好等着了**：`00-theme.css` 里 `.post-content` 各级标题的 `scroll-margin-top: calc(var(--header-height) + 16px)` 是 2026-09-19 加的，注释写的是「标题锚点被固定顶栏遮住的问题」—— 而当时顶栏并不固定，它一直是**预防性**的。这次改动让那句注释成真，并把覆盖面从 `.post-content` 的标题扩到通用的 `[id]:target`（脚注、带 id 的图、数学工具卡的卡片锚点）。**实测**：顶栏底边 62px，跳转后标题落在 76px，余量 14px；一次跑了 4 个目录项，`covered` 全为 false。

**代价两条**：
1. 首屏可视高度少 60px（顶栏一直在上面）；
2. **HTML 里多了两个 `<script>` 标签，约 +180 gzip 字节/页** —— 指纹与 SRI 是随机串，压不动，所以「加一个脚本」的每页成本比脚本自身大得多。整站 gzip 因此从 6339 涨到 6377 KB（其中新 JS 自身只有 372 + 637 = 约 1 KB gzip，且缓存一次就够）。要省这一项只能把两个脚本合成一个文件。

**`--header-height` 没有动**，所以 10-nav.css「一」里那套 14n = 16(n-1) 的菜单配平等式不受影响：**吸顶不改宽度，只有菜单项数才改**。

**逐像素核对**（40 张：4 页型 × 5 宽度 × 明暗，关掉滚动位置恢复后拍，做法见 traps 的「`wrapAngle()` 没有返回值」一节）：列表页、课程材料页的 380/640/1024 全部 **0.00%**；首页的 0.26~0.37% 是头像光环（见 ㊸）；**只有课程材料页在 1240/1440 有 1.5% 的差异，位置全在左侧目录栏内部**。查过了：它的几何量改前改后逐字相同（`rail` = [84, 136, 200, 842]、`scrollTop` = 0、首个链接 [123.88, 150.59]、`documentHeight` = 16115），所以那不是位移，是**吸顶改变了合成层、目录栏文字的抗锯齿跟着变了一档**。

### ㊷ 滚动出现动画（2026-09-21）

`assets/js/reveal.js` + `assets/css/extended/22-reveal.css`。两个**互斥**的类：`.reveal-pending`（JS 给「首屏之下」的元素挂上，透明）与 `.is-revealed`（进视口时挂上，跑一次性动画），动画结束两个都摘掉，元素回到自己的过渡语义（列表卡的 hover 位移走 transition，不能被这条 animation 长期占住）。

**三条边界，都是刻意的**：
- **只碰首屏之下的元素**。JS 先量 `getBoundingClientRect()` 再决定挂不挂 pending，所以不存在「先隐藏、再淡入」那一闪，首屏（含 LCP 元素）的绘制路径完全没变。失败方向也是安全的：量不到尺寸的元素被当成「在首屏之上」跳过，**「JS 挂了导致正文隐身」在这套写法里不可能发生**，因为隐藏类只由这个脚本挂上。
- **减少动效偏好下整个脚本不介入**（连 IO 都不建），`22-reveal.css` 那段也包在 `prefers-reduced-motion: no-preference` 里，两层都挡。**实测**（用 `shots.py` 新加的 `--reduced-motion`，见 traps 的「这个仓库的工作区是 CRLF」一节）：普通模式下课程章节页载入时 `.reveal-pending` = 2，模拟 `reduce` 后 = 0。
- 只用 `opacity` 与 `transform`，两者都不触发布局，首页那条「0 布局位移」的结论不受影响。

**目标选择器**：`article.post-entry`、`.page-header`、`.course-group`、`.course-entry`、`.project-index-item`、`.tb-family`、`.lb-branch-card`、`.lb-sub-card`。**不含正文段落** —— 长文（最重页 DOM 两万多节点）里逐段入场既吵又真的花帧预算，而读者本来就是顺序读的。卡片墙按**族**（`.tb-family`）而不是按卡（`.tb-card`）入场：工具库一页铺八十来张卡，逐张算就是同一个视口里几十个动画同时起跑，观感是「满屏乱闪」。

**实测**（工具库页，73 个目标）：载入时挂起 **70** 个；滚到底后 `stuckPending` = 0、`notOpaque` = 0 —— 全部入场完毕、没有一个留在隐藏态。

**没有引入 AOS / GSAP / ScrollTrigger**：原生三十行就够，而这些库要么需要打包链、要么给每页加十几 KB。`scroll` 监听也没用（理由同 `reading-progress.js`：那条路径是「纯算术」量过的，别在上面加东西）；IO 用 `rootMargin: '0px 0px -8% 0px'`，让元素真正探进视口一小截才触发。

### ㊸ 首页头像的虹彩光环（2026-09-21）

**环是「垫在头像下面的一个稍大的圆盘」**，不是用 mask 抠出来的：头像自己是圆形且不透明，中间那部分自然被盖住，露出来的只有外圈 4px（`inset: -4px` + `z-index: -1`）。用 mask 也能做出同样的环，但 mask 会让动画元素每帧重新光栅化，而去掉 mask 之后动画层上只剩 `transform`，那是最容易被合成器接管的形式。

**静置时不转**：`animation: avatar-halo-spin 9s linear infinite` 配 `animation-play-state: paused`，`.avatar-halo:hover::before` 才 `running`。两个原因：一是它本来会是**全站唯一的常驻动画**（其余要么一次性 —— 首页入场、卡片组的 `deck-sweep .65s`；要么悬停触发 —— 卡片全息、药丸边），常驻动画的代价是按帧算的、打开页面就在付；二是**这个代价在本机量不出可信数字**：无头环境里一旦有动画在跑，浏览器就把 rAF 对齐到 60Hz，没有动画时自由跑到约 160Hz，于是「帧率 / 帧间隔」这两个代理量测出来的是**节拍变化而不是开销**（同一条 ABAB 交替量三次：3.9 / 15.3 / 6.1 ms，落在噪声里）。量不出差别就不引入永久成本。悬停才转还和站上既有的「鼠标来了才动」是同一套语言。

**环的颜色取自既有色板**：`--accent`（蔷薇红）→ `--accent-2`（银紫）→ `--k-prop`（定理蓝）→ `--k-cor`（推论青），明度在同一带上 —— 与类别色板同一条取材规则，不引入比 `--accent` 更亮的颜色。**原来的「双环」撤掉了**：1px 中缝留着（它把头像从壁纸上切出来），另外两道 7px/8px 的淡环去掉 —— 三条同心环加一个会动的第四道，眼睛找不到该看哪一条。

**两条结构性的改动，都不是可选的**：
1. 头像外面必须包一层 `<span class="avatar-halo">`，因为 `<img>` 上没有伪元素。这层壳**接过了布局职责**（之前头像是 `.profile_inner` 的 flex 子项、被块级化），所以它自己 `display: block; width: fit-content`，里面的 img 补 `display: block` 消掉行内元素那条基线缝。**实测零位移**：在页面里把这层壳摘掉，标题与头像的位置一个像素都不动（`deltaH1Top` = 0、`deltaAvTop` = 0）。
2. 主题在 ≤768px 给 `.profile img` 写了 `transform: scale(.85)`（`zmedia.css`）。旧的双环是 box-shadow —— 元素自己画的，跟着 transform 一起缩；而现在的环挂在壳上、按 img 的**布局**尺寸定位，transform 不影响布局，于是头像缩小、环不动。所以那一档把缩放从 img 挪到壳上（`.profile .profile-avatar { transform: none }`，特异性 (0,2,0) 压得住主题的 (0,1,1)）：视觉结果一模一样，环跟着一起缩。

**顺手修掉的一个真坑**：加这层壳时，`.home-hero > span` 这个**结构选择器**把它一起命中了 —— 那条本来是给副标题写玻璃底衬的（`00-theme.css`），另外 `09-home.css` 里还有三条（副标题样式、入场动画两条），四处同时误伤，表现是头像凭空多出 `.12em` 的内边距和一块玻璃底，**四份规则一个都没报错**。修法是给副标题加了类名 `.home-hero-subtitle`，四处一并改成类名。教训见 traps 的「判据对「已经平滑过」的输入不成立」一节。

### ㊹ 阅读页的四件工艺：代码块标题条、图片灯箱、页脚标签胶囊、评论区玻璃（2026-09-21）

**代码块的文件名标题条** —— `layouts/_markup/render-codeblock.html`（**新增的渲染 hook**，不是覆盖 —— 主题 `_markup/` 下只有 `render-image.html`，这个文件是加上去的）。围栏写成 ` ```python {filename="q3_planner.py"} ` 时，代码块上方多一条「三个圆点 + 文件名 + 语言」的窗口条；**不写 filename 就完全不包壳**，与加 hook 之前逐像素一致。样式在 `08-reader.css`。

- **硬约束：`.highlight` 里面一个字节都不能动。** 主题的复制按钮脚本靠 `pre > code` 找目标、再按祖先链决定按钮挂在哪儿（第三个分支要往上数 5 层找 TABLE），中间插一层就会让它落进最后一个 else、按钮跑到别处去（不报错）。实测：改后每个代码块仍只有 1 个复制按钮，且仍挂在 TABLE 上。
- **用 `transform.HighlightCodeBlock`，不要用 `highlight .Inner .Type .Options`。** 后者会把代码末尾的换行丢掉（实测 `cs-dark-mode-tokens` 页的 `<pre>` 从 1176 → 1174 字节），前者才与「没有 hook 时」逐字一致。全站 201 个页面、144 个 `<pre>` 块对拍过：**只有那一个换行的差别**，而 `<pre>` 末尾的单个换行在 CSS 里不渲染成空行（`.highlight` 高度改前改后都是 84/111/58，代码区像素逐点一致）。
- 它会顺手把自定义属性写到 `.highlight` 上（`<div class=highlight filename="my file with spaces.py">`）。一开始担心「无引号属性遇空格会被截断」，实测 **Hugo 会自动加引号**，所以是安全的；代价只是文件名在页面里出现两遍。
- **文字颜色一律写死、不取主题令牌**（用 `rgb(213,213,214)` 这一档，与主题给代码正文的颜色同一来源）：代码块这块「深色板」在明暗两套下都是近黑（浅色 `#16141b` / 深色 `#100e15`），而令牌跟着明暗翻转 —— `--accent` 在浅色下是暗蔷薇 `#8c2f48`，压在近黑板上等于没有。**反过来底色必须取令牌**（`--code-block-bg`），它才是与代码板永远同色的那个。
- 第一版把标题条写成「只铺一层 4.5% 白光」，**结果浅灰文件名压在浅色页面上几乎看不见** —— 因为这一条是 `.highlight` 的**兄弟**而不是子元素，透出来的是页面背景。截图里才发现。

**正文图片灯箱** —— `assets/js/lightbox.js` + `26-lightbox.css`，用原生 `<dialog>` 的 `showModal()`（焦点陷阱、Esc、惰性化背景都交给浏览器，自己写一遍只会漏掉其中一件）。四条边界：只绑**显示宽度 ≥ 480px** 的图（正文列 720px 的三分之二，比它窄的图放大只会更糊）；包在链接里的图不绑（点击语义是跳转）；取 `currentSrc` 而不是 `src`（响应式图已经挑好一档，不为灯箱再下一次）；`prefers-reduced-motion` 下不做淡入。事件用**委托**挂在正文容器上，所以懒加载后加入的图自动也有灯箱。实测（lab 页 4 张图）：4 张全部挂上 `zoom-in` 光标；点击开 `dialog`、图片取到 `currentSrc`、`alt` 抄了过来；再点一次关闭、`src` 被清掉、焦点还回原图。

**页脚标签胶囊化** —— `01-cards.css` 接管 `.post-tags a`：主题给的是「圆角方块 + `--code-bg` 底 + `--border` 边」，而列表卡里的标签是胶囊 —— 同一个概念在一页的两处换了副样子，这里统一。**配色不是新定的**：`--accent` 字 + `--accent-soft` 底就是 `.card-chip--tag` 的用法，在 00-theme.css 类别色板那套实测口径内。实测项目页 4 个标签全部 `border-radius: 999px`。

**评论区容器玻璃化** —— `08-reader.css` 的 `.giscus-wrapper`：玻璃底 + 14px 圆角（与 `.post-single` 同圆角，看着是正文卡片的延伸）+ 内边距。**观感要说清楚**：giscus 是跨域 iframe、自带不透明底，玻璃面只在它周围那一圈内边距上看得见，面板本身透不出来。要真透出来得把 giscus 主题换成 `transparent`，那会改评论正文的对比度、必须重测 —— **这次没做**。顺带两件清理：模板里那行内联 `style="margin-top: 2rem"` 搬进 CSS（AGENTS 规则 6），间距按原值写成 3.5rem（原来是 1.5 + 2 两层，别当成一个数随手改小）；以及删掉一条**从来没命中过**的 `.comments { margin-top: 1.5rem }` —— 站上没有任何元素带 `class="comments"`（本站的 comments.html 直接输出 `.giscus-wrapper`，主题那份是个空 stub），留着它会让人以为评论区的间距归它管。

**逐像素核对**（40 张：4 页型 × 5 宽度 × 明暗；关掉滚动位置恢复**并派发一次 scroll 事件**后拍，做法见 traps 的「`wrapAngle()` 没有返回值」一节）：列表页与课程材料页在 380/640/1024 **全部 0.00%**。有差异的四处全部查过、全部可解释：首页 0.26~1.9%（头像光环，见 ㊸）；课程材料页与关于页在 1240/1440 的 0.6~1.8%（左侧目录栏，几何量逐字相同，见 ㊶）；关于页在 640~1024 的 0.15~0.24%（评论区容器把那段往下推了 26px，是本次的意图）；关于页 380 的 0.36% 是 `## 本站有什么` 那个 h2 **被多画了 1 像素**。

最后那条值得单独记：它的 `getBoundingClientRect().top` 在吸顶开与关两种状态下**完全相同**（443.5469），行墨量剖面显示字形与墨量几乎一致、只是整体差一行 —— 也就是说**几何没变，变的是绘制时对小数坐标的取整**（`.5469` 往哪边取整受合成层影响）。和目录栏那条是同一类现象。

### ㊺ 关于页的拼贴（Bento）（2026-09-21）

`data/about-bento.yaml`（瓦片清单，**单一事实源**）+ `layouts/_shortcodes/bento.html` + `27-bento.css`；正文里只有一句 `{{< bento >}}`（放在「本站有什么」标题下，原来那三条项目符号由它接管）。

**为什么用短代码而不是给 about.md 加 `layout:`**：后者要动 front matter（AGENTS 规则 1 的禁区），还会把单页模板的评论区、目录、面包屑一起丢掉、得在新 layout 里各自补一遍。短代码只占正文里的一处位置，其余一切照旧，加一块瓦片只改 YAML。

**拼贴**待在正文列里、**不突破宽度** —— 这一点是试过突破再退回来的。「720px 正文列装不下拼贴」当初是估的，实测**内容宽只有 640px**（面板 717px 减两侧各 2.4rem 内边距）。铺到 `min(960px, 100vw - 2rem)` 的那版在 1440px 视口下落进 x∈[240,1200]，而玻璃面板只有 x∈[361,1078]：两侧各探出约 120px，边缘两格直接压在壁纸上、和上方正文的左边界对不齐 —— 看着像没对齐，不像设计。收回列内还有两个连带好处：拼贴与代码块/表格/卡片一样待在面板里（与全站「内容都在玻璃卡内」的语言一致）；**并且不需要再动跟随目录** —— 突破版为了不与 toc-rail（≥1240px 时固定在 x∈[36,236]）重叠，得写 `body:has(.bento) .toc-rail { display: none }`，那条依赖 `:has()` 的权重、比现在这版脆。

**格的构成靠 `wide: 1` 而不是 CSS 里的序号**：`repeat(auto-fill, minmax(240px, 1fr))` 在 640px 下自然落成两列，`wide` 的格子跨两列。首尾两格都是 wide（课程 / 标签），拼出来是「通栏 / 两列 / 两列 / 通栏」——**末格特意也是 wide**：只给首格 wide 的话最后一行会只剩半格，看着像缺了一块。色板用既有的六个类别色（`--k-*`），每格只声明一个 `--bento`，标题、短横、悬停边都读它。

**踩到一个 baseURL 的坑**：`relURL "/courses/"` **原样返回** `/courses/` —— 以斜杠开头的参数不加 baseURL 子路径（对比：`relLangURL` 吃 `library/algebra/` 这种不带前导斜杠的才补成 `/my-blog/library/algebra/`）。所以短代码里先 `strings.TrimPrefix "/"` 再 `relLangURL`，YAML 那边就能照常写 `/courses/`。写错的后果是**部署后才 404**（本地 serve 时 `/courses/` 恰好也通），由 `check-links.mjs` 那条「站内绝对链接但没带 baseURL 子路径」兜住 —— 实测它确实会报（第一版就是这么被抓出来的）。见 traps 的「深度模型的补丁网格」一节。

**实测**（五档宽度 × 明暗）：拼贴在每一档都完整落在 `.post-single` 面板内（`insidePanel` 全为 true），无横向溢出；1440/1240 两列各 315px、首尾通栏 641px，跟随目录正常显示且不与拼贴重叠（1440 下目录栏 x∈[136,336]、拼贴从 399 起；1240 下 36~236 对 299）；640 落两列、380 落一列且 `wide` 自动退回一格（`max-width: 560px` 那一档）。

### ㊼ 首页右栏改版：时钟取代按类浏览、最近更新压底、背景提亮（2026-09-21，用户要求）

四件事一起提的，逐条记：

**一、删掉「按类浏览」**。`index_profile.html` 里先摘掉了 `{{- partial "home-extras.html" . }}`；
**同一天晚些时候连 partial、`09-home.css` 的 `.home-browse` 组与 4 个 i18n 键一起删了**
（一次仓库体检里确认不再需要这个备选）—— 要恢复得从 git 历史里捞。
**代价要认**：它是首页**唯一的分类导航入口**，摘掉之后分类（项目/课程）只能从主导航或 `/tags/` 进，
标签计数 chip 也不再出现在首页。

**二、新增「时间与时钟」** —— `layouts/_partials/home-clock.html` + `assets/js/home-clock.js`（只在首页加载）+ i18n 18 个键。
版式是**三行 + 一条脚注**，用的是面板整宽（不是堆在左边一小块）：
第一行大号时间（左）+ 问候语（右，推到最远）、第二行日期·星期、第三行「今天已过 / 今年已过」两条进度、
脚注「今年第 N 天 · 还剩 N 天」。用户当天的追加要求是「个性化一些、不要留太多空」，这一版就是照它做的：
- **「时间左、问候右」一次把横向的空用掉**；两条进度与脚注把纵向撑起来。
- 进度的填充**只动 `transform: scaleX(--p)`、不改 width**：每秒都在更新，改 width 会让浏览器每秒
  对这块面板做一次布局，而 scaleX 是合成器能接管的量。
- 时间**刻意不用**标题那套衬线栈：Georgia / Palatino 的阿拉伯数字是**旧体**（0、1 只有 x-height），
  `10:30` 摆一起高低不齐，而这些字体没有 lining 变体可切（`font-variant-numeric` 只在字体带该特性时生效）。
- 两条进度按**本地时间**算：今天的起点用 `new Date(y, m, d)` 构造（跨夏令时那天也准），
  今年的长度用「明年起点减今年起点」（闰年自动 366 天，不用自己判断）。
- **服务端渲染出来的时间只可能是构建那一刻**，写上去就是错的（而且会一直错到下次构建）。所以面板出厂带
  `data-pending="1"`、由脚本填好第一帧内容才摘掉；没有 JS 就不显示这一块（与 `#bottom-link` 同一套取舍：
  宁可没有，也不给一个错的）。
- **用 `data-pending` 而不是 `hidden` 属性**：`.home-clock` 自己设了 `display: flex`，
  而作者样式恒胜 UA 样式，`[hidden] { display: none }` 根本压不住 —— 面板会先空着显示出来。
  这条坑的完整版见 ㉕ 的两条取景判据。
- **对齐整秒再加定时器**：直接 `setInterval(1000)` 会按脚本启动时刻切秒，页面上那一秒永远偏一点。
  先 `setTimeout` 到下一个整秒边界再起 interval。
- **回到前台补一次**：后台标签页里定时器被节流甚至冻结，`visibilitychange` 里同步一下，
  否则切回来会显示过期时间。
- 排版：`font-variant-numeric: tabular-nums`（秒数每秒都变，等宽数字才不会左右抖）。

**三、「最近更新」压到右栏底部**。`09-home.css` 里 `align-items: start → stretch`
+ `.home-recent { margin-top: auto }`。**这是有意推翻**「两栏高度互不牵扯」那条旧结论（注释里写着）。
参考线是**左栏整体的底边**（卡片组 + 它下面那排控制按钮），不是卡片图片的底边 —— 实测 1680px 下
面板底 807、左栏底 808。

**四、1024~1400px 要给看板娘腾位**（这条是第三条**引出来的新问题**）。把面板推到底之后，
在 1100px 视口实测：她的左上角压住面板右下角 **54×27px**，正好盖住最后一条的日期；
1024px 压 63×16px。那一段宽度的特征是「正文列几乎顶到视口边缘」而她就贴在右边缘 14px 处，
**横向让不开**（要让开她得瘦到 24px），只能纵向让。腾出的高度直接读她自己那套变量：
`calc(var(--float-bottom) - 4rem - 1.2rem)` —— `--float-bottom` 就是「4rem + 她的高度」，
减掉 4rem 即她的高度（`14-mascot.css` 按断点给的三档），**改她的尺寸时这一条自动跟着走**。
>1400px 不腾：1680px 下正文列右缘离她还有 173px。实测四档（1680/1300/1100/1024）全部 `overlapPx: none`。

**五、背景提亮**：日间壁纸加了一个**亮度**旋钮（`make-backgrounds.py` 的 `girl_backgrounds()`，
`ImageEnhance.Brightness(...).enhance(1.08)`）—— 原来这张只提过彩度（1.35）、从没动过亮度，
所以画面明度完全等于源图。
- **方向是往对比度安全那边走的**：浅色主题的文字都是深色，底越亮对比度越高。
- 实测（1680×960 首页，壁纸区域平均亮度）：左侧 118.8 → 123.6（**+4.0%**）、
  右上 172.9 → 181.9（**+5.2%**）、整页 175.3 → 180.2（+2.8%）。图提了 8% 而页面只涨 4~5%，
  是因为蒙版与玻璃板两层把它稀释掉了。
- 对比度（`../lab/shots/girlbg/measure.py`，改后重跑）：**最紧处 light/girl/home 4.88 → 4.89**，
  notes 5.42 → 5.51、course 5.67 → 5.77、taxonomy 5.07 → 5.11、chapter 4.99 → 5.00、404 5.22 → 5.24
  —— 全部仍过 AA，没有一处回退。提升幅度小是因为最紧的那个元素（日期）坐在 `--surface`（80% 不透明）
  的面板里，壁纸只贡献 20%。
- **夜间那张刻意没动**：深色主题的文字是浅色，提亮底 = 压对比度，那是反向。
  想让它「透」只能放薄 `maskDark`（露出更多夜空与星场），那一次要单独重跑对比度。

**六、右栏不留空：时间卡吃掉剩余高度**（同一批要求里的「不要留太多空」）。
把「最近更新」推到右栏底部之后，左栏（hero + 卡片组）比右栏两块内容高一截，差出来的
**237px 原来是裸露的壁纸** —— 截图里就是「两块面板中间挖了个洞」。
所以给 `.home-clock` 加了 `flex: 1 1 auto`：余量全给时间卡，两块面板之间只剩常规的 18px 间距，
底边照样与左栏齐平（实测 `recentBottom === heroBottom`）。内容随之分置两端 ——
时间与日期在顶、仪表与脚注贴底（`.home-clock-meters { margin-top: auto }`），
不然卡片被拉高之后所有内容都会挤在顶上。
窄屏（单列）时右栏没有确定高度、`flex-grow` 没有东西可分，这条自动失效：实测 640px 下卡片
回到 213px 的自然高度。1024~1400px 那档受「给看板娘腾位」约束，卡片长到 306px。

> **另一条路是让它留着那段壁纸空隙**（看起来更像「两块卡片浮在画上」），
> 一行就能回去：删掉 `.home-clock` 的 `flex: 1 1 auto`。当时判断「实心面板」比「洞」更贴用户那句要求。

**七、看板娘两处小改**（同一次要求里「其他的按你的建议做」）：
一次性淡入（`mascot-in`，`.55s` + `.12s` 延迟，`backwards` 填充，`prefers-reduced-motion` 下不播）
—— 在此之前她跟着首帧「啪」一下出现，而首页周围每一块都是淡入上浮，只有她不是；
以及补了 `title`（与 `aria-label` 同一个 i18n 键），鼠标悬停有提示、不再只有一个读屏能听到的名字。

**八、白纱蒙版放薄（「背景还是蒙蒙的」那条）**。逐层剥开量过（`../lab/shots/revamp2/cmp-layers.png`）：
在左下那块纯壁纸区，**去掉 `body::before` 的蒙版渐变**亮度 −13.1、彩度 +3.8，
而**只去掉 `body::after` 那层玻璃板**只差 −1.5 / +0.6 —— 也就是说「蒙蒙的」几乎全是白纱蒙版的锅，
玻璃板那层几乎不贡献雾（它的作用是斜向高光与边缘亮线，那点质感留着）。
- 试过**完全去掉**（`maskLight/Dark` 全 0）：全部页型仍过 AA，但余量被吃到 **4.55 / 4.58**
  （线是 4.5）—— 太贴线，任何一次内容或壁纸变动都可能掉下去，所以没采用。
- 最后取**薄蒙版**：浅色 `[0.10, 0.02, 0.14]`、深色 `[0.08, 0.02, 0.12]`（原值 `[0.26,0.06,0.32]` /
  `[0.22,0.05,0.28]`）。实测最紧 **4.61**（dark/girl/home，元素是时钟卡里的「今年第 N 天」）、
  浅色最紧 **4.70**（时钟卡的 `72%`），其余 4.9~5.8。视觉上已经很接近「完全去掉」。
- 两个最紧的元素**都在面板里**（时钟卡），而面板内的真实对比度比脚本的模型**更高**
  （`backdrop-filter` 的模糊会把底下的亮点抹匀，见 traps 的「点卡片跳到 `/null`」那节的最后一段（索引卡外面那圈内边距）），所以真实值还有余量。
- 改这两个数必须重跑 `../lab/shots/girlbg/measure.py both`（做法：把脚本里的 1313 换成 8791）。

**九、时间居中（「把几点几分挪到中间」）**。做法是 `.home-clock-head` 用
`grid-template-columns: 1fr auto 1fr`、时间放中间那列，两侧各留一个 1fr 的占位 —— 中间那列才是
**几何中心**。**秒数改成绝对定位**（`left: 100%`，挂在数字右外侧）：不这么做的话居中的是
「10:39 47」这一整块，数字本体实测偏左 11px；现在量出来 `offBy = 0`。

**十、这一版里我自己犯过、又修掉的两个 bug**（都写进 traps 了）：
- **往父节点写 `textContent` 会把它里面的兄弟节点一起抹掉**：日期原本写进 `.home-clock-date`，
  而那天我刚把问候语的 span 塞进同一个 `<p>` 里 —— 一填日期，问候语那个 span 就从 DOM 里消失了
  （表现是问候语永远不显示，且**不报错**）。改成写进 `.home-clock-date-main` 这个子 span。
- **绝对定位的文本会被折行**：秒数在 `left: 100%` 处可用宽度为 0，两位数竖着排成两行；
  补 `white-space: nowrap; width: max-content` 才对。

### ㊽ 时钟数字的艺术字体（2026-09-21）

**破例给一个元素上 webfont**，理由与边界都写清楚：站上「零 webfont」那条规矩
（`02-typography.css` 的文件头）针对的是**中文正文字体** —— 一个 CJK 字重 5 MB 起，
所以正文用系统栈。而这里只给**时钟的数字**用，字形集是 `0-9` 与 `:` 共 12 个，
子集后 **1.5 KB**，比一张卡片封面小两个数量级。**这个例不要往外扩**：把同一款字体用到日期行
（含中文）就立刻变成几 MB。

- **字体**：Playfair Display 600（SIL OFL 1.1，许可全文在 `assets/fonts/rose-clock.LICENSE.txt`）。
  选它的理由、来源、以及换字体的完整命令都在 `assets/fonts/README.md`。
  手写花体（Italianno）也做过对比图（`../lab/shots/revamp2/cmp-fonts.png`，六版并排：
  系统无衬线 / Playfair / Italianno / Shippori Mincho / Cinzel / Cormorant）——
  它更「蔷薇」，但两位数读起来吃力，做时钟不合适，所以取 didone 的 Playfair（笔画对比大，有墨味）。
- **`@font-face` 不在 `css/extended/` 里**：CSS 里写 `url(../fonts/…)` **只是文本**，
  Hugo 不会因此把字体发布到 `public/`（实测产物里没有那个文件）。所以字体由
  `extend_head.html` 经 `resources.Get | fingerprint` 发布（带内容指纹），`@font-face`
  也由那段模板生成成 `css/clock-font.css`、**只在首页输出**（时钟只长在首页），
  并在同处加一条 `preload`。这与壁纸（`css/bg-image.css`）、导航图标（`css/nav-icons.css`）是同一种接线。
- **`font-display: block` + 脚本等字体就绪再填第一帧**：数字是这块卡的主角，
  宁可晚 100ms 也不要先用系统字体画一遍再跳一下。`home-clock.js` 里
  `document.fonts.load('600 3.1rem RoseClock')` 与一个 1.2s 超时 race —— 字体真加载失败时
  照常显示（退回系统字体），不会留一块空白。
- 体积账：字体 1.5 KB + 生成的 CSS 约 300 B，**只在首页加载**；整站 gzip 因此从 6421 涨到 6424 KB。

### ㊾ 时间卡里的打卡月历、今日轴与今日一卡（2026-09-21 第二轮，用户要求）

起因是用户问「时间栏中那片空白可以装什么」—— 那片空白是 ㊼ 那条 `.home-clock { flex: 1 1 auto }`
吃掉右栏剩余高度留下的（≥1401px 时 **235px 高**、内宽 633）。当天先出了五张对比图
（`../lab/shots/clock-blank/`：A 留空 / B 三条轴 / C 打卡月历 / D 四格统计 / E 月历+今日轴，
另有窄档对照与深色版），用户圈了 **E**，并加一条「每日一卡」。

**版式与纵向账（实测，1440×950）**：头行 50 + 日期 25 + **填充区 248** + 今年那条 23 + 脚注 23 = 436。
两条硬约束由此而来：
- **头部第三格的微卡高必须 ≤ 头行高（50px）**：超了会把头行顶高，下面月历六行的行高按比例被偷走
  （实测头行每涨 10px，六行各矮 1.7px）。所以微卡定 36×50（5:7）并 `align-self: center`。
  那一格是 ㊼ 里为「以后要加的右侧元素」预留的 `grid-column: 3`，放这里纵向不花钱。
- **填充区分两档**，阈值实测在 1400→1410 之间（卡高从 306 跳到 436，与看板娘那条
  1024~1400px 媒体查询同档）：高档出月历格子（六行各约 25px）；矮档填充区只剩 118px，
  格子自然高约 180px 塞不下 —— 硬塞行高会掉到 6px、数字糊成一团 —— 改出「本月 mini 条」
  （30 格 + 刻度）。`<1024px` 单列时卡是自然高度、没有空白要填，月历照出。

**打卡点的数据口径**：那天**有内容页被提交过**，取 `.Lastmod`（`enableGitInfo` 已开，它就是该文件
最后一次提交的 git 时间）—— 与右栏「最近更新」同一个来源，不引第二套。去重后 jsonify 进
`data-days`，2026-09 只有 6 条（12/13/15/18/19/21）。**注意它比「动过仓库的日子」少**：
`git log` 的全部提交日在 9 月有 14 天，差额是只改 CSS/工具的那些天（09-20 就是）。
要用那版口径得新增一个生成的 `data/commit-days.json` 并挂进校验链（脚本重建 + 一致性检查），
本次没做。「连续 N 天」从**今天往回数**，今天还没写就退到昨天起算（昨天也没有才是 0）——
与 GitHub 贡献图同一直觉。

**今日一卡**：从**卡片组当天用的那一份**里按等级加权抽一张（2026-09-21 起首页每天只展示随机 12 张，见 ㉕），展示缩略图 + 名字 + 系列·等级；
点一下开那张卡的三维弹层（左栏卡片组同时翻过去）。
- **数据不另抄一份**：读同页 `.home-deck` 的 `data-deck`（63 张的图 URL、名字、系列、等级都在里面，
  约 13KB），2026-09-21 起优先用**卡片组算好的那一份**（`window.homeDeck.items`，即当天那 12 张）——
  这块是**按下标**调 `openAt` 的，池子不一致会静默点不动，所以只有「卡片组正在用的那份」这一个来源
  （读不到才退回整副）。代价仍是耦合：卡片组那块被摘掉时今日一卡整块不出现（符合「宁可没有，也不给一个错的」）。
  缩略图直接用现成的 1x 档（272px webp，约 9.5 KB），**不为它多出一档小图** ——
  63 张各出一张会给整站加约 300KB，而预算余量只有 200 多 KB。
- **权重 60/30/9/1**（收藏/史诗/传世/奇迹），与 `data/home-cards.yaml` 头部记的口径一致
  （传世 10%、史诗 30%、其余收藏）。**奇迹那 1% 是本次新增的决定**：清单里写的是「1 张」
  而不是百分比，翻成 1% 后一年大约 3~4 天能抽到。2026 年实测落档：收藏 238 天 65.2%、
  史诗 98 天 26.8%、传世 27 天 7.4%、**奇迹 2 天 0.5%（08-20 与 12-10，都是「墨羽」）**；
  复算脚本 `../lab/shots/clock-blank/pick-days.mjs`（直接读产物的 data-deck，与页面同一份数据）。
- **种子 = 年 × 1000 + 年内第几天**，整数散列（`Math.imul`，不用 `Math.random`、不依赖浮点中间结果）
  → 同一日期在任何设备、任何时区偏移下都抽出同一张；跨日（页面开着过夜）会自己换一张。
- **等级材质不另定义一套**：卡框本来就是 `.home-card` 的 `padding: var(--rank-frame)` +
  `background-image: var(--cframe)`，所以微卡直接挂 `.home-card-rank--*` 类、只把框收一半
  （传世的 5px 框在 36px 宽的微卡上是 14%，整卡 272 宽时是 1.8%），并关掉四角纹章
  （`.home-card-rank::before` 那圈是给 272px 整卡画的，微卡上只剩噪点）。
- **抽到奇迹就显形**：这是**有意加的第三条显形入口**（另两条在卡片组）。前两条是「自己发现」，
  这一条是「抽到的那一下告诉你」—— 每日一卡没有回报时刻就只是个随机器。实现上只是加
  `.is-revealed`（换一组令牌，无动画）。播报**只在换日时**做，首屏不播
  （页面刚打开就念一串话会打断读屏用户正在做的事）。
- **点击复用卡片组的弹层**：`home-deck.js` 末尾开了 `window.homeDeck.openAt(index, opener)`，
  并把 `closeDialog` 的焦点目标从写死的 `zoomBtn` 改成「谁打开的还给谁」—— 那里原来的注释写着
  「这个弹层只有放大按钮能打开」，这条前提被本次改动打破了（不改的话：从微卡打开、按 Esc 关闭，
  焦点会跳到左栏那个 ⤢ 上）。

**深浅两套值**：今天那一格是强调色渐变底。浅色主题白字（8.0:1，紫端 6.1:1）；深色主题必须换成
近黑 `#16141b`（8.1:1）—— 白字压在深色那支浅粉 `--accent` 上只有 **2.3:1**。打卡染底同样分档：
浅色 12%、深色 22%（同一份 12% 在深色底上几乎看不出来）。那一格还特意同时写了
`background-color`（实色）与 `background-image`（渐变）：对比度脚本只沿祖先链合成实色，
只写渐变会被判成压在壁纸上。

**验证与证据**（脚本与产物都在 `../lab/shots/clock-blank/`）：
- 几何：头行 50 / 填充区 248 与 118 / 微卡 50 / 时间居中 `offBy = 0` / 卡高 436 与 306 ——
  与改动前逐项一致；四档截图 `after-light.png`、`after-dark.png`、`after-1024.png`、`after-375.png`
  （改动前的同角度留了 `before-*.png`）。
- 交互（`interact.js`）：点微卡 → 弹层开在 `41 / 63`、左栏跟着翻、`is-deck-dialog` 与进度条暂停都生效、
  Esc 关闭后焦点回到微卡；无 console 报错。
- 奇迹路径（`build-testpage.py` 生成一个把 `Date` 整体位移到 08-19 的测试页 + `miracle.js`）：
  把位移推一天 → 换日那一拍微卡变成「墨羽 · 奇迹」、箔膜 0.85、金框、`sr-only` 里写进播报。
  **这条路径没法等到**（一年只有两天抽得到奇迹），所以只能这样测。
- 对比度：`../lab/shots/clock-blank/contrast-8791.py both`（**复用** `girlbg/measure.py` 的 JS 与口径，
  只把基地址从它写死的 1313 换成 8791 —— 本机只留一个预览服务）。12 组全部 ≥4.5：
  浅色首页最紧 **4.69**（元素正是本次新加的「今日一卡」副标题，改前记录是 4.70）、
  深色首页最紧 **4.51**（元素是时钟的**秒数**，本次没动它）。
- 体积：整站 gzip 从 6424 涨到 **6427 KB**（预算 6656，余量 229 KB）—— 增量只有 3 KB，
  摊到 211 页约 15 B/页。**这块没有新增脚本或样式表**（今日一卡并进了 `home-clock.js`，
  样式并进了 `09-home.css`），所以没有 traps 的「注入式测试要读返回值」一节那种「每个标签约 180 字节/页」的固定开销；
  首页只多一条 `data-days`（6 个日期字符串）。

### ㊻ 碎冰落地：分割线的霜晶 + 切页转场（2026-09-21）

这两项是**先出对比图、用户圈定后**才落地的（图在 `../lab/shots/beautify/frost/`）。
另外两项他圈的是「保持现状」，所以**没做**：封面（那些封面本身是脚本生成的渐变标题卡，
比例天然统一、自带设计，加霜纹/渐隐是在和生成设计抢戏）、头像光环强度（保持 4px）。

**分割线的霜晶** —— `13-ornament.css` 的 `hr::after`：原来那颗菱形（9px、`--theme` 底 + `--accent` 边）
换成一颗 26px 的六角冰晶。对比图里三版都被他看过：v1 菱形（原样）、**v2 霜晶（选中）**、
v3 不画线的斜向碎纹带（「碎」得更彻底，但线没了、分段感变弱，在截图里也比另两版淡）。

- 形状用 **mask** 而不是背景图：mask 只取 alpha，颜色留在 CSS 里 —— 冰晶跟着 `--accent` 走，
  深色主题自动换成提亮的那一半（实测浅色 `rgb(140,47,72)`、深色 `rgb(216,154,171)`），
  换主题不用换素材。与 `21-card-deck.css` 那套 `--tex-crack` / `--tex-flake` 同一手法。
- 26px 的冰晶压在 15px 的 hr 上、靠负外边距居中，上下各探出 5.5px；hr 的 `2.4em` 外边距（约 38px）
  留够余量，不会撞到正文。
- **线从冰晶背后穿过去**（不像旧的菱形那样用 `--theme` 色的方块把线挡住）：
  镂空的冰晶下面有线才像「冰晶结在一条线上」，挡住反而像两个独立元素叠在一起。
- `opacity: .72`：描边图形像素少，纯 `--accent` 会比原本那圈细线重得多。

**切页转场** —— `assets/css/view-transition.css`，**不压缩**、由 `extend_head.html` 单独外链。
原生的跨文档 View Transitions，零 JS、零依赖；Chromium 生效，其他浏览器完全忽略这个 at-rule
（最差情况等于没加，不是降级成半截效果）。

- **踩到的坑：压缩器会把 `@view-transition` 整条丢掉**。它原本放在 `css/extended/` 里（和其他
  CSS 一起串进 stylesheet.css 再压缩），实测产物里 `navigation:auto` 匹配数为 **0**，
  而同一文件里的 `view-transition-name` 与 `::view-transition-*` 都原样保留 ——
  名字和动画都在、转场永远不触发、**不报任何错**（见 traps 的「跨构建比图会把「另一个变量」当成结论」一节）。所以这个文件单独放 `assets/css/`、
  走不用 `resources.Minify` 的接线（与 `css/bg-image.css`、`css/nav-icons.css` 同一种做法）。
- 老式的 `<meta name="view-transition" content="same-origin">` **在本机 Edge 下不生效**（试过）：
  探针监听旧页面的 `pageswap`，事件触发了但 `event.viewTransition` 是 null。所以 opt-in
  只能是那条 at-rule。
- **功能是用 `pageswap` 探针验的，不是「CSS 里有这条规则」**：在旧页面挂
  `window.addEventListener('pageswap', e => …e.viewTransition ? 'ACTIVE' : 'INACTIVE')`，
  把它写进 sessionStorage，跳转后在新页面读出来。落地前是 `INACTIVE`（那时 at-rule 被压缩器
  丢掉了），修好后是 `ACTIVE`。转场后还断言了页面完好：`.header` / `.footer` 各只有 1 个、
  顶栏仍是 `sticky`、高度 62、0 条控制台错误。
- **站点外壳不参与位移**：`.header` / `.footer` 起了 `view-transition-name`，于是整页交叉淡入时
  顶栏与页脚是稳的（不这么做每次翻页「整页都在闪」，包括每页都一样的顶栏 —— 那正是廉价转场的来源）。
  名字必须唯一，同名元素出现两个时浏览器会整条转场跳过并告警。
- 内容区只动 `opacity` 与 `transform`（新页从下方 6px 落定，.26s），**不做全页模糊、不做 mask 扫过** ——
  那两个每帧都要重新光栅化整屏。想要「碎冰拼合」那种更狠的转场得走 mask 扫线，代价明确、
  要单独量一次，这次没做。
- 代价：多一个约 700 字节的 CSS 请求（有指纹、缓存住）。
- 另一个手改时踩到的：那段说明的注释定界符被我弄丢过一次，几行中文成了裸 token，
  浏览器把坏 token 丢掉时**连带吞掉了紧随其后的 `.header { … }`** —— 症状是 footer 的那条生效、
  header 的不生效（见 traps 的「多一整遍全屏填充的代价」一节）。
- 减少动效偏好下把四条 transition 伪元素的动画全关掉（`animation: none`，各版本都认；
  不用 `@view-transition { navigation: none }` —— 把 at-rule 嵌进 `@media` 的支持面不稳）。

### ㊽ 卡片工艺参数化：15 种工艺的令牌改成数据（2026-09-22）

改前的病：一种「卡面工艺」散在**五处**手写代码里 —— ① `data/home-cards.yaml` 的 `style:`、② `21-card-deck.css` 的 `.home-card--<名>` 块、③ `card-3d.js` 的 `STYLE_3D`、④ i18n 的 `deckStyle<名>`、⑤ `deck-manifest.html` 的 `styleLabel` / `$styleTier`。16 种合计**同步面 271 行**（≈17 行/种），漏一处全是**静默**失效 —— 漏 `STYLE_3D` 最阴：首页看着是雕花金、转起来是普通全息，而这两种视图永远不会同时出现在一屏里。

改后 ②③ 变成**生成的**：`data/card-styles.yaml` 是工艺参数的单一事实源，`node tools/cards/render-styles.mjs --write` 出 `assets/css/extended/21-card-styles.css` 并就地重写 `card-3d.js` 的 `STYLE_3D` 托管行；`scripts/check-deck.mjs` 拿产物与参数表**逐字对拍**（不一致即阻断）。

**范围 15 种**（13 种主块 + 样板 nacre / silk）。没进表的：

- `foil` —— 它没有主块，`.home-card` 的基础声明（彩虹 conic + `color-dodge`）**本身就是**全息的观感。
- **结构层**：伪元素（`glass::before/::after`、`kintsugi::after`、`holo-prism::before` 与 `:hover::before`）、后代（`.home-card-lens`）。
- **主题层**：`:root[data-theme="dark"] .home-card--<名> { --coverlay-op: … }` 那 11 行。

这三类留在 `21-card-deck.css` 手写 —— 它们是几何与主题，不是材质参数；每个工艺在原位留一行指针注释。

参数模型的权威字段表在 `data/card-styles.yaml` 的文件头：`fretLine` / `gemColor`（可选）/ `finish` / `plate` / `plateSolid` / `plateText` / `plateAccent` / `blend` / `opacity` / `mask`（**多层**，与 `print` 同构）/ `maskSize` / `maskPosition` / `maskRepeat` / `filter` / `boxShadow`（玻璃那种长在盒模型上的材质）/ `print`（图层栈）/ `threeD`（七个通道，按字符串逐字复现，`0.20` 不归一成 `0.2`）。

**等价性**不是靠眼睛证的：把 13 个手写主块反向解析成 `{属性 → 值}` 与生成块比（压掉空白差异）—— **13 种全部逐字一致**，含 glass 的 7 段 `box-shadow` 与 yukika 的十二片 `var(--tex-flake*)`。另外 `tools/cards/guard-inject.py` 会往产物注入五种漂移（手改生成物、手改 `STYLE_3D` 托管行、把手写块加回来、生成物丢掉 `--fret-line`、`tier` 与 `$styleTier` 写岔），逐条确认被 `check-deck.mjs` 拦下 —— 守卫不是摆设。

规模变化：`21-card-deck.css` 2277 → 2022 行（−255），生成文件 353 行；合并后的主样式 174716 → 174225 B（生成器不写行内注释，注释里的设计动机只留在 YAML 与指针上方）。`data/card-styles.yaml` 1034 行（含大段字段说明与每种工艺的设计动机）。

**加一种工艺现在要动**：`data/card-styles.yaml` 一条（11~14 个字段）+ 有伪元素时再写结构 CSS + i18n 的 `deckStyle*` 一行 + 模板的 `styleLabel` / `$styleTier` 各一行。后两处仍手写，但与 YAML 的 `labelKey` / `tier` 对拍，写岔会报。

```bash
node tools/cards/render-styles.mjs --check     # 产物与数据是否一致（--print 只看不打盘）
python tools/cards/guard-inject.py             # 五条守卫的注入测试
python tools/cards/style-footprint.py          # 「一种工艺散在哪几处」的测绘
node scripts/check-deck.mjs                    # 全套（CI / push-blog / 体检面板三处都跑）
```

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

### 2026-09-21 追加八：复检（主样式按页覆盖率 + 壁纸时间线）

量法：`../lab/shots/perf.py --throttle 4g --out baseline-m1.json`（生产构建 + `serve_public.py 8791`）与新探针 `../lab/shots/csscover.py`（CDP `CSS.startRuleUsageTracking`）。**本地静态副本不发 gzip**，所以下表传输值只看结构与时间线，别当字节账读。

| 页面（本地 4G） | DOM | 请求 | 传输（未压缩） | DCL / load | FCP |
|---|---|---|---|---|---|
| 首页 | 386 | 37 | 649.8 KB | 1069 / 1418 ms | 896 ms |
| M1 作业 | **29701** | 33 | 1539.2 KB | 3177 / 3179 ms | 1148 ms |
| 问题一 | 22086 | 36 | 1345.5 KB | 2698 / 3048 ms | 1064 ms |

元素数排行（202 页，DOM 口径）：M1 作业 29701 > notes-02 28160 > notes 26904 > 问题一 22086 > 问题三_证明_下界 19834 …… >15000 元素的共 11 页。**M1 三页仍是全站最重三页**（追加四末尾点过名的那三页，形态没变）。

主样式的按页覆盖率（同一张 174222 B 的表）：

| 页面 | 本页匹配 | 未匹配 |
|---|---|---|
| M1 notes | 68358 B (39%) | **105864 B (61%)** |
| 首页 | 92338 B (53%) | 81884 B (47%) |
| `/collection/` | 98297 B (56%) | 75925 B (44%) |

同批量到的 `katex.min.css`（23352 B）在 M1 notes 上只匹配 4017 B —— 83% 的字形面与环境没用到。CDP 的 `ruleUsage` **只列匹配过的规则**（`used` 恒为 true，别拿它当比例），且只覆盖导航后 4 s 的静态窗口，交互态与 JS 加的类不计入，所以未匹配是上界。

线上对账：线上主样式 `stylesheet.45a82a00….css` 174642 B、本地 `….7fbee2cb….css` 174710 B，差 68 B（构建环境差异），gzip 两侧都是 37.6 KB —— **本地量出来的结构对线上成立**。

壁纸的时间线（三页一致）：`bg-daylight-girl`（96.8 KB）**initiatorType = css**，start 637 / 989 / 963 ms、dur 634~881 ms —— 它排在主样式之后发起，是首屏最大的一笔，比 gzip 后的主样式（37.6 KB）还重 2.6 倍。`bg-daylight-city`（62.7 KB）initiatorType = img，`load` 之后由 `bg-switch.js` 预取（首页 1425 ms、重页 3219 ms），不进指标。

本次**没有动**任何东西，可做的按收益排（详见 `docs/pending.md`）：主样式按页拆包（阅读页 61% 从未匹配，`21-card-deck` 120 KB + `20-card-ornaments` 53 KB 只有首页与收藏库真用）；壁纸在 `<head>` 按已定主题 preload（现在由 CSS 解析后才发起）；壁纸重编码（1600×900 日间 96.8 / 夜间 137.3 KB，窄屏只露约 26% 宽）；M1 三页拆页；`/collection/` 卡片图加 410px 档（64 张格子 205 px × DPR2 正好，现在整页滚完 DPR1 下 901 KB、DPR2 下 1710 KB）。

仓库卫生：仓库根多了个 `d/`（26 MB，`.gitignore` 第 9 行已排除，早前某次会话把 MSYS 绝对路径当相对路径写出来的产物），可删。

### 2026-09-22 追加九：收藏库卡片墙加 412 档（已落地）

量法：实验 worktree 里的 `wallmeasure.py`（`--url …/collection/ --dpr 1|2`，同一台机、冷缓存、滚完整页，从 CDP 的资源表按卡名归集解码字节），前后两轮各跑一次；实验现场见 `../lab/exp-2026-09-21-architecture-experiments.md`，报告 `docs/exp-cards.md`。

**改了什么**：`deck-manifest.html` 每张卡多出一档 `412x webp q72`（`$thumb`，清单字段 `t`）；`deck-wall.html` 的 `<img>` 从 `1x/2x` 描述符改成 `272w/412w/544w` + `sizes="(max-width: 767px) 44vw, 206px"`，并把 `--art`（玻璃的厚度层、金继釉面的底图）从 2x 指到 412。

**为什么是 412**：收藏库格子 ≥768px 视口下 205.73 CSS px，DPR2 要 411.5 个物理像素，旧口径在这一档取 544、多下的 1/3 像素全丢掉。**410 不行**：`410 / 205.73 = 1.993 < 2`，srcset 按密度选图会退回 544，一个字节也省不下。

**为什么 `--art` 也必须一起改**：第一版只动了 `<img>` 的 srcset，实测 DPR2 卡片下载只从 1710.4 掉到 1455.9 KB（−15.8%）—— 消失的那 160 KB 是 5 张玻璃卡各多下了一张 544：`--art` 仍取 2x，而 `<img>` 已改取 412，于是同一张画下了两个档。把 `--art` 也指到 412 后，DPR2 下两者同 URL、零额外请求。

| 口径 | 改前 | 改后 |
|---|---|---|
| DPR2 卡片下载（63 张） | 1710.4 KB | **1286.1 KB（−24.8%）** |
| DPR1 卡片下载 | 1010.1 KB | 974.1 KB（−3.6%） |
| 重复请求的卡 | 5 张（玻璃） | 0 |

DPR1 只省 3.6% 是有意的取舍：`--art` 取 412 后，DPR1 下 `<img>` 走 272、它仍取一次 412（约 20 KB × 5 张玻璃），换来 DPR2 上的零额外；反过来把它降到 272 则 DPR2 多付 68 KB、DPR1 少付 100 KB。理由写在 `deck-wall.html` 的注释里。

**观感**：对照图 `../lab/shots/cards-412-vs-544/sheet-412-vs-544.jpg`（左 412 / 右 544，按 DPR2 真实显示的 411 物理像素并排，右半带 3× 放大局部）。逐像素差 3.4~5.7 / 255，全部来自 544 档被缩到 411 的重采样 —— DPR2 屏上 412 档是 1:1 映射。

**账**：卡片产物 189 → 252 个文件，5.0 → 6.2 MB；整站 gzip 9222 → 10512 KB，`report-size.sh` 的 `MAX_COMP_TOTAL_KB` 由 9600 抬到 11264。这是「用磁盘换访客带宽」——多的 1.29 MB 只在仓库与部署里占一次，省的 424 KB 是每个 DPR2 访客每翻一次收藏库都要付的。544 档保留：3× 手机与 760px 弹层还要它。

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


### ㊿ 收藏库（`/collection/`）：把整副牌铺成一页 — `content/collection/_index.md` + `layouts/_default/collection.html` + `_partials/deck-wall.html` + `_partials/deck-manifest.html` + `assets/js/deck-wall.js` + `21-card-deck.css` 的「卡片墙」段

2026-09-21 加。**起因**：这副牌此前只能在首页一张一张翻（一次一张 + 每 6 秒自动轮播），全站没有地方能「看全 63 张」——想知道自己收了哪些系列、哪些等级、某张卡长什么样，只能反复点 ‹ ›。这一页是那副牌的**全量视图**：63 张一次铺开，可以按系列 / 工艺 / 等级筛，点任意一张打开**与首页同一个**三维弹层。导航第 9 项「收藏库」（weight 12，落在「首页」与「数学库」之间 —— 用户要求它在数学库左边）。

**与数学库/CS 库不是一回事**（两个词容易混，页内注释也写了）：那两支是**知识卡**（定理 / 定义 / 命题，一张卡一个页面）；这一支是**收藏卡**（首页那副插画卡，卡不是页面，点开看 3D）。「卡片库」这个词在仓库里已经指知识卡（后台 UI 与 `data/libraries.yaml` 都这么用），所以这一页取名**收藏库**。

**四个关键决定**

1. **清单只抄一处（新 `deck-manifest.html`）**。原先「每张卡交给 JS 的字段表」长在 `home-cards.html` 里，现在抽成 `partial "deck-manifest.html"` 返回切片，两页共用。理由不只是去重：JS 侧要的字段比卡面多（3D 浮雕用的 `d`、弹层里的 `rankLabel`/`credit`/`url`），两处各写一份的话，**漏一个字段的表现是「弹层里那张卡转起来是平的」或「出处少一行」，页面不报任何错**。顺带把两个中文名（`styleLabel`/`rankLabel`）也放进条目 —— 筛选项就用它。
2. **图片一档都不新出**。卡片墙复用 272/544 那两档（同一个 `Resize` 规格命中同一份产物），所以这一页给整站**加了 0 字节的图**（实测 `public/images/cards/` 前后都是 127 个文件）。另出一档小图的话按 63 张算要加 300 KB 上下，而当时的余量只有 229 KB —— 与 ㊾「今日一卡」拒绝另出缩略图是同一条口径。**代价要认清**：访客进这一页会真的下这些图（见下面的体积账）。
3. **弹层与 3D 查看器只有一份实现**。`home-deck.js` 的根节点从写死的 `.home-deck` 放宽到「任何带 `data-deck` 的容器」，并加了一支**无轮播模式**：页内没有轮播卡时，只有弹层与 3D 查看器初始化，轮播的按钮 / 进度条 / 自动播放 / 触屏滑动 / 键盘翻卡全部跳过。判据 `carousel` 由模板显式声明（首页容器带 `data-deck-carousel`）——**这里踩过坑，见下**。首页那一路所有判据为真，行为不变（回归断言见表）。
4. **名字写卡下，不压在卡上**。首页那套 `.home-card-plate` 是绝对定位浮层、自带 `backdrop-filter: blur(6px)`：一页 63 个浮层就是 63 层背景模糊，而且格子只有 ~205px 宽，浮层会盖掉小半张画。改成卡下说明（`.deck-tile-cap`：名字 + 系列 · 等级）。等级另有三层照留（2026-09-21 六档阶梯时补的）：`.home-card-rank` 覆膜 + 四角纹章、`.home-card-mat` 画面内衬线、`.home-card-mark` 稀有度徽章（形状 + 尺寸 + 颜色都由等级给）—— 那是这小格子上**看**得出的等级，文字那行是**信息**，两者不重复。徽章在这一页贴画面右下角（本页没有名牌），在首页那张卡上进名牌条。

**踩到的那个坑（值得单独记）**：`carousel` 一开始判的是「容器里有没有 `.home-card`」——而卡片墙的**每一格里就有一个 `.home-card`**（卡面本身），于是 63 格全被当成「有轮播卡」：表现是**点一格开弹层的同时，墙根节点上的点击监听又把卡翻到下一张**（弹层里显示的比点的那张晚一张，实测点「白鹭」开出「星夜」），而且首屏就开始 6 秒自动轮播、反复改写第一格。改法两条一起上：轮播卡只认**直接子元素**（`:scope > .home-card`），并且由模板显式声明 `data-deck-carousel`，不靠 DOM 形状去猜。

**卡片墙的版式**

- **宽屏 3 列（下限 190px → 每张 ~205px），窄屏 2 列（下限 130px）**。为什么不要更密的 4 列：两版摆在一起比过（`../lab/shots/cmp-3col.png` 与 `cmp-4col.png`），155px 下十几种工艺糊成一片 —— 和纸的纤维、金继的裂缝、金边的拉丝、珐琅的格线全看不见，而「一眼看出这八张不是同一种卡」正是这一页存在的理由；205px 也更接近首页那张 272px（工艺就是按那个尺寸调的）。代价：63 ÷ 3 = 21 行，页面只有往下滚（桌面整页高 ~8200px）。
- **筛选条由脚本注入、项是现算的**（`deck-wall.js` 从清单里数 series / styleLabel / styleTier / rankLabel）：加一张新系列的卡，筛选条自己多一项，不会出现「写死清单里挂了零张的项」。**三排之间 AND、同一排之内 OR（多选）**，详见下面的「筛选条重做」一节。
- **工艺的中文名第一次落地**（i18n 的 `deckStyle*` 十二条）：此前 `style` 只有代码名（foil / washi / kintsugi…），中文叫法只存在于 CSS 注释里。用**「工艺」**而不是「风格」：全息膜、和纸、金继本来就是做卡的工艺，读者不必先学一套内部词汇。
- **格子由 `<div>` 升级成 `<button>`**（同 nav-toggle 的 `has-nav-toggle` 做法）：禁 JS 时这一页就是一张**静态卡册**（63 张卡与名字都在，只是点不开三维图），指针与悬停暗示全挂在 `html.has-deck-wall` 下面 —— 不留一个「看着能点、点了没反应」的控件。按钮名走 i18n `deckOpenCard`：「看《木刀》的三维卡（绫华 · 收藏）」。
- **导航第 9 项的配平**：菜单行宽那一套 `14n = 16(n-1)` 等式在 9 项下无解，判据换成「1024px 视口不换行」，靠三处回收 78px（药丸内边距 7→5、项间距 8→5、图标后间距 .34em→.2em）——账与实测写在 `10-nav.css` 文件头。
- **导航图标**：新画了第 9 个像素角色「初音未来」（青绿双马尾 + 新建的 `ribbon` 缎带蝴蝶结配饰，`tools/icons/make-icons.py`）。挑她而不是张数最多的艾米莉亚（27 张，已经站在「关于」那一项上）的理由是**色相**：16px 下认人靠发色，现有八人的发色里没有青绿。预览图 `../lab/shots/nav-collection-preview.png`。

**实测（2026-09-21，本地 1440×1000 / DPR1）**

| 项 | 结果 |
|---|---|
| 点格开弹层 | 点第 6 格（`data-i=5`「白鹭」）→ 弹层显示「白鹭 06 / 63」，与点的那张一致；第一格未被改写 |
| 弹层里的交互 | `→` 换到「星夜 07 / 63」；`Esc` 关闭后焦点回到**被点的那一格**（`data-i=5`） |
| 3D 查看器 | 弹层里 canvas 建起来（`window.card3d.supported` 真），画布 `aria-label` = 「星夜，第 7 张，共 63 张。拖动可转动卡片，翻面按钮看背面」 |
| 筛选（旧口径：单选） | 「玻璃」→ 共 7 张（与 YAML 分布一致）；「初音未来 + 玻璃」→ 共 0 张 + 空态；三排都回「全部」→ 共 63 张、0 隐藏 |
| 首页回归 | 轮播卡在、3 个控制按钮在、进度条在、`tabindex`/`role` 在；`⤢` 打开的是当前那张（木刀 01/63）；键盘 `→` 01→02；「今日一卡」点开的是它自己那张（霜羽 41/63）、`Esc` 焦点回到那颗按钮 |
| 网格几何 | 1440/1024/768 → 3 列（每张 205.7×329.5 含说明）；390 → 2 列（156.6 宽） |
| 导航几何 | 1024px 视口：logo 292.4 + 主题 column-gap 24 + 菜单 637.5 = 953.9，可用 976（**真余量 22.1px**，8 项时是 34.4）；换行阈值从 ~990px 挪到 ~1002px（那 12px 的窗口里，顶栏会从单行变成「logo 一行 + 菜单一行」） |

**性能：先量再决定，结论是「不降级」**

- `../lab/shots/scrollcost.py`（headless，合成器侧）：`wall-full` vs 把玻璃的 `backdrop-filter`、厚度层 `.home-card-lens`、金继/星芒的 SVG 位移滤镜**全关掉**（`wall-lite`）vs 把 63 张的覆盖层**全部关掉**（`wall-nolayer`）：`Graphics.Pipeline` 285.9 / 242.2 / 241.4 ms，`DirectRenderer::DrawFrame` 106.0 / 85.1 / 84.0 ms。**lite 与 nolayer 几乎一样** —— 也就是说那三样「听起来最贵」的东西合计只值 ~1ms，真正的开销在每张卡本身的基础混色层。因此**降级玻璃 / 金继不会换来任何东西**，不动它们。
- `../lab/shots/frameab.py`（真窗口 2560×1600 @165 Hz，帧预算 6.06 ms）：`wall-full` p50 6.1 / p90 6.1 / p99 12.15 ms，374 帧里 6.5 帧 >7ms；**第一轮 10 帧 >12ms、第二轮只剩 2 帧** —— 掉的那几帧跟着「首次滚到某张卡」走（图要解码 + 覆盖层要栅格化），不是稳态代价。`wall-nolayer` 387 帧 0 掉帧，即：**整副牌的观感在慢滚动下值约 1.7% 的帧**。
- `../lab/shots/cpu4x.py`（4× CPU 限速，弱设备近似）：p50 6.0 / p90 6.5 / p99 6.9 ms、300 帧里 1 帧 >7ms —— 主线程不是瓶颈（合成/栅格在 GPU 侧）。
- **移动端帧率仍未真机量过**（与 ㊳ 同一条边界）。

**筛选条重做：多选 + 工艺分档分组 + 实时计数（2026-09-21 第二轮）**

用户的原话是「优化收藏库的筛选选项，记得工艺分档，允许多选」。旧版是**每排单选 + 一颗「全部」**，
工艺那 12 项按张数从多到少平铺一行 —— 普通与进阶混在一起，读不出档位。

**四条口径（都是取舍，不只是实现）**

1. **同一排之内 OR、排与排之间 AND**（多选的唯一读法）。取消 = 再点一次那颗 chip（选中的永远可点）。
   多选换来的是页面上真会发生的用法：「绫华那批和艾米莉亚那批一起看」，单选时得来回点两次、还看不成一屏。
2. **工艺按 `styleTier` 拆成两个子排**，「普通」「进阶」各一行、带组标签。**组标签本身是颗按钮**：
   按一下把这一档**当前够得着的**工艺整档选中 / 取消（够不着 = 在其它两排的当前组合下是 0 张）——
   12 项挨个点太费事。用竖排而不是一行内联：窄屏折行时组标签会落在行尾、与它那组 chip 分家。
3. **计数实时重算、0 张的置灰点不动**。每颗 chip 的数字按**其它两排**的当前选择算（不算自己这排 ——
   同排是 OR，自己这排的选择不会把自己排除掉）。选了「绫华」之后，工艺那排的「金边 14」当场变成 1。
4. **撤掉三颗「全部 63」**，改成结果行末尾的「清空筛选」（只在真有选中项时出现）。「全部 63」说的
   信息结果行已经写了，而多选之下它和「把选中的点掉」语义重复。

**两条不变量（本轮最要紧的部分，都写进了代码注释）**

- **可点的 chip 不会因为「自己这一下」变成 disabled** —— 因为 ① 每次选择都是往 OR 里**加**一项，
  结果只会变多；② 每颗 chip 的计数不含它自己那一排，所以它的 disabled 只由**别的排**决定，
  而那些排不会因为它被点而改变。这条不变量顺带免掉了整段焦点处理（禁用会用原生 `disabled`，
  焦点掉到 `body` 上就找不回来了）。
- **0 结果不可达**（同一条推理的推论）：每一次选择都要求那颗 chip 当前计数 > 0，而那个计数**就是**
  选完之后的张数。唯一的「反例」是整档选中，所以整档选中**只收够得着的那些**。空态那句
  `deckFilterEmpty` 因此成了纯兜底 —— 留着，但别再指望测到它。

**踩到的坑**：置灰只用 `disabled` 属性是不够的 —— 真实的指针/键盘事件确实到不了 disabled 的表单控件上，
但**合成事件**（`dispatchEvent`）绕过那一层，于是探针一按就改状态（探针里 `stillSame` 先是 false）。
现在处理器自己判 `chip.disabled` 直接返回：置灰的语义由这一支脚本保证，不靠浏览器那一层兜。

**实测（DOM 断言，`../lab/shots/filt-after/probe.js`，每步都与「按清单独立算一遍」对照）**

| 项 | 结果 |
|---|---|
| 结构 | 三排（系列 / 工艺 / 等级）；工艺两组的标签是「普通」「进阶」，各 6 颗；页面上**没有任何「全部」chip** |
| 初始 | 共 63 张；「清空筛选」不出现；金边 14 / 和纸 13（与清单一致）；0 颗置灰 |
| 选「绫华」 | 共 21 张（绫华）；金边 14 → **1**（独立算得 1）；0 张的工艺（珐琅彩 / 星芒全息 / 金继 / 星屑）置灰 |
| 同排多选 | 金边 + 玻璃 → 共 4 张（绫华 · 金边+玻璃），独立算得 4 |
| 跨排多选 | 系列再加「艾米莉亚」→ 共 17 张（绫华+艾米莉亚 · 金边+玻璃），独立算得 17 |
| 置灰项 | 合成 `click` 派发到置灰 chip 上 → 选中集合不变（处理器自己拒绝） |
| 整档「进阶」 | 在「系列=绫华」下选中的正好是够得着的 3 种（雕花金 / 玻璃 / 金边，独立算得同一组）→ 共 6 张 = 独立算得 6；标签 `aria-pressed=true`，「普通」保持 false |
| 再按一次 | 整档取消 → 共 21 张、工艺排 0 选中 |
| 清空 | 共 63 张、「清空筛选」重新隐藏 |
| 几何 | 两个组标签同 x（565），竖排；两组 chip 左对齐（605）；每组各占一行；组标签在排头右侧；最右 chip 1046 < 排右边界 1161；文档无横向溢出（390px 下也不溢出） |
| 控制台 | 0 条错误 / 警告 |

**分档口径落成一张真表**（顺带修掉的旧错）：`$styleTier` 在 `deck-manifest.html` 里，
`check-deck.mjs` 第 ⑦ 组守卫核三件事 —— ① CSS 里每种风格都在表里且只出现一次；② 表里没有
CSS 中不存在的风格；③ 两个档位名与 `deck-wall.js` 的 `TIER_ORDER` 逐字相同（对不上 = 分组整片
塌成一组，页面上不报错）。**反向测试**：故意漏掉冰裂、把 `advanced` 改成 `ornate`、让金边挂两次 ——
三处全被拦下，恢复后全绿。这张表以前只以注释存在，于是「冰裂」漏了一整轮。

**体积账**

- 整站 gzip **6427 → 6451 KB**（+24 KB，预算 6656，余量 229 → 205 KB）；单页最大 raw 1028 KB、gzip 77 KB、搜索索引 48 KB 都没动。
- **筛选条重做那一轮**：整站 gzip **6462 → 6464 KB**（**+2 KB**，对 HEAD 各做一次新构建量的；搜索索引 48 KB 不动、0 张新图）。分到页面上：收藏库自己 raw 97.4 → 99.4 KB / gzip 17.9 → 18.4 KB，首页 raw 51.4 → 52.7 KB / gzip 14.5 → 14.6 KB（首页那 1.3 KB raw 来自**共用的清单**多了一个 `styleTier` 字段 —— 首页那支脚本不读它，但两页共用一份 manifest，多捎一个字段比按页分叉一份字段表划算），`deck-wall.js` 的多选与分组、筛选条新样式则并进已有的包。**没有为了省这点字节去压任何东西**。
- 这一页自己：HTML **89.4 KB raw / 17.4 KB gzip**（63 格 + 约 13 KB 的 `data-deck` JSON）；`deck-wall.js` 3.9 KB **只在收藏库加载**；CSS 与卡面类全站共用（那 +4 KB 的卡片墙样式并进已有的样式表，不多一个请求）。图片 **0 新增**。
- **访客实际下载**（这是这一页真正的代价，与整站预算不是一回事）：不滚动时浏览器会请求约 34 张（≈410 KB 卡面图，其中 15 张已完成解码）；滚完整页 63 张 1x 档合计 **860 KB**（中位 13 KB/张），DPR≥2 时走 2x 档合计 **1.7 MB**（中位 25 KB/张）。首页只加载第 1 张 + 预取 2 张（≈325 KB，含壁纸与看板娘）。
  - 想更轻只有一条路：为卡片墙另出一档**同尺寸、低质量**的 272px（q60 上下，约 8~9 KB/张 → 63 张约 550 KB），它要抬高整站 gzip 预算（现余量 205 KB 装不下）。**这条没做，留给用户拍板**：不做的话这一页是一个「点进去就是要看图」的画廊，量的账如上。
- 首页快捷入口那一行的**副作用**：它取「主导航去掉首页后的前 5 项」，加项后从 `数学库 / CS 库 / 课程 / 项目 / 标签` 变成 `收藏库 / 数学库 / CS 库 / 课程 / 项目`（「标签」退出那一行，顶部导航里仍在）。想留它就改成 `first 6`。

**卡片墙第三轮：序号 / 分组视图 / 抽卡 / 显形不泄底 / 主色垫底 / hover 扫光（2026-09-21 晚）**

这一轮的六件事有一个共同点：**东西早就在清单里，页面上没露出来**（序号、出处、主色），或者这一页
自己拆自己的台（隐藏档「奇迹」被文字点名）。所以除了分组视图与抽卡，其余都是「把已有的信息接上」。

**七条口径**

1. **序号 `#NN` 印在名字前**（i18n `deckTileNo`）：63 张是一副**有序**的牌，首页名牌与弹层里的
   `07 / 63` 都是这个口径，卡片墙此前只有名字。写的 `{{ .n }}` 是 **Go 模板参数**（模板用 dict 填），
   与 deck-wall.js 里那些由 JS 填的 `{n}` 不是一套写法 —— 同一个文件里两种占位符并存，注释里写明了。
2. **隐藏档不再被这一页的文字泄底**。此前奇迹那一格的说明写着「系列 · 奇迹」，等级那排还多一颗
   「奇迹 1」的 chip —— 而卡面令牌是刻意让正面与收藏完全一样的（六档阶梯那节的注释）。新增两个字段
   `rankWall` / `rankWallLabel`（`deck-manifest.html`）：**筛选与显示都用这一对，清单里的 `rank`
   保持真值** —— 真值是 3D 查看器判断「要不要显形」的依据，改掉它显形就永远不会发生。
   卡背也不泄：`card-3d.js` 只在 `tier >= 4` 时才印 `rankLabel`，而显形前 `rankOf()` 返回 `collector`。
   显形之后由 `card-3d.js` 广播 `deck:reveal`，那一格的说明换回「· 奇迹」、加 `.is-revealed`，
   并用一个 `role="status"` 的 sr-only 节点播报「《墨羽》显形了：奇迹」（显形是纯视觉变化，
   读屏用户什么都得不到）。**代价照认**：筛选条里「收藏」这一桶因此是 25 张（含那一张），
   而它显示的名字是「收藏」—— 隐藏档不进筛选条是有意的，不是漏了。
3. **分组视图是一层版式，不动 DOM**。按系列分 5 组、每组一个整行标题（`.deck-group-head`，
   `grid-column: 1 / -1`），顺序靠 `order` + 标题自己的 order，**不重排 DOM** —— `data-i` 是清单下标、
   是弹层取卡的依据，重排会让它错位。方向键漫游按**视觉顺序**走（`navList()` 按 order 排序），
   所以分组态下 ↑↓ 仍然连续。标题在那一组被筛空时 `hidden`（它的样式**不许写 `display`**，
   否则会和站上踩过两次的 `[hidden]` 抢层）。
4. **抽卡只从「当前筛出来的」那些里抽**（不是全 63 张）—— 筛到「黑长直少女」连抽 6 次，6 次都落在那 4 张里。
   按钮由 JS 注入（禁 JS 不出现死按钮），0 张时 `disabled`。图标复用**导航第 9 枚像素小人**
   （`assets/images/nav/collection.png`，32px 像素画，`image-rendering: pixelated`）—— 它是这一页的图标，
   不新增图。
5. **主色垫底**：`img` 是 lazy 的，滚到附近才开始下，此前那一块是**空底**。Hugo 的 `images.Color`
   用 `%v` 打出来就是 `#rrggbb`（v0.165 实测；**`hex` 函数不存在**，试过 https://gohugo.io 文档里的写法，
   报 `function "hex" not defined`）。63 个字段约 0.9 KB HTML，不下载任何新图；取不到调色板时留空、
   CSS 侧兜底（`var(--tile-base, transparent)`）。注意 `index $img.Colors 0` 在空切片上会**报错**，
   所以用 `with` 包一层。
6. **出处清单**：63 张的 `credit` 此前只在逐张打开弹层时才看得到 —— 而这一页是全站唯一「一次摆出所有卡」
   的地方。页尾一个 `<details>`（按系列分组、**服务端渲染**，禁 JS 也能开）：63 行，61 条带链接
   （官方立绘与看板娘那两张没有链接可指，只写文字 —— 不编一个指错地方的主页链接）。
7. **hover 扫光跑一次，不常驻**。秘藏以上的雕花框本来就有一条绕框走的光带，但那是**首页专属**
   （`.home-deck .home-card-fret::after` + 7s 无限动画）—— 63 个每帧重绘的图层不划算。这里改成
   **悬停那一格上跑一趟 0.7s**（`:hover` / `:focus-visible` 各一条，`animation ... 1`）：同一时刻只有一格
   在动，稳态成本 0。**可见性由 `--rank-orn` 一门管**（收藏档那一层是 `opacity: 0`），所以规则不按
   档位写死、不必维护第二份「哪几档有框」的清单。

**同轮加的两条交互**

- **深链 `/collection/#deck-07`**：63 张收藏卡此前**一张地址都没有**（知识卡每张都有 URL）。展开/关闭
  时用 `history.replaceState` 写/收 hash（不用改 `location.hash`：那会附赠一次「滚到锚点」的行为）。
  **首页那支不写**：它的清单是「今天的 12 张」（按日期种子抽），同一个下标换一天就是另一张卡，
  分享出去会指错 —— 判据就是 `carousel`，在 `syncHash()` 里有注释。
- **筛选写进 URL**（`?series=绫华&rank=legend&group=series`）：筛完的墙能分享、后退键也符合直觉。
  用 `replaceState` 不是 `pushState`（每点一颗 chip 都压一条历史会把后退键塞满）；读回来时**逐个值
  对着筛选项核**，URL 里不存在的值直接丢掉。

**踩到的坑（两个都不是新坑，但这次各中一次）**

- **Go 模板的注释不能出现在表达式中间**：给 `(dict ...)` 加字段时顺手在里面写了 `{{- /* … */}}`，
  报 `unexpected "{" in operand`（`docs/traps.md` 里记过）。修法是把说明挪到那个动作之外，
  并在 `deck-manifest.html` 里写明「注释不能写进这个 dict 的括号里」。
- **严格模式下的块级函数声明只活在块里**：`deck-wall.js` 里 `if (window.homeDeck) { … }` 那个块中
  定义的 `openFromHash()`，块外那句 `if (openFromHash) openFromHash();` 拿到的是**未定义**（严格模式
  下函数声明按块作用域），深链会静默失效。改成 `var openFromHash = function () {…}` 赋值。
- **`:hover` 没法用 JS 合成**（`MouseEvent` 不产生悬停态），扫光必须用 CDP 的
  `Input.dispatchMouseEvent` 真移鼠标 —— 新增 `../lab/shots/deck8/hover.py`（复用 `shots.py` 的
  Edge 启动与 target 选择）。**负对照也别拿「有没有动画」判**：动画在所有档上都跑，可见性由
  `--rank-orn` 决定，收藏档 `opacity: 0` —— 判据要读那一层的 opacity。

**实测（`../lab/shots/deck8/probe.js` + `deeplink.js` + `home.js` + `hover.py`，每步与清单独立对照）**

| 项 | 结果 |
|---|---|
| 序号 | 63 格 `#01`…`#63`，逐格与清单顺序一致（`okOrder` true） |
| 显形不泄底 | 奇迹那格说明是「绫华 · 收藏」；筛选条 5 档、**无奇迹 chip**；「收藏 25」= 独立算的 `rankWall === 'collector'` 张数 |
| 显形事件 | 广播 `deck:reveal` → 那格变「绫华 · 奇迹」+ `.is-revealed` + 播报「《墨羽》显形了：奇迹」 |
| 等级 chip | 5 颗、5 个徽章；秘藏那颗的 `clip-path` = 盾形 polygon、底色 = `--cframe` 的渐变（形状与颜色都来自卡面同一份令牌） |
| 比例条 | 5 段，`flex-grow` 25 / 13 / 11 / 8 / 6，与 chip 上的数字逐个相同；宽 641px |
| 分组 | 点一下：5 个标题（艾米莉亚 27 / 绫华 21 / 卡夫卡 7 / 黑长直少女 4 / 初音未来 4）各自占一整行、第一格 `order=1001`、第一张可见卡属于第一组；再点回去 `order` 清空 |
| 键盘漫游 | 整面墙**只有 1 个 tab 落点**；`→` 0→1、`↓` 1→4（3 列）、`Home` → 0 |
| 筛选进 URL | 点「绫华」→ `?series=绫华`；再点「传世」→ `?series=绫华&rank=legend`，结果「共 3 张」= 独立算的 3 |
| 深链 | `/collection/#deck-07` → 弹层「星夜 07 / 63」、焦点在弹层内、墙本身未被筛；`Esc` 后地址栏清空（刷新不会再弹） |
| 抽卡 | 筛到「黑长直少女」（4 张）连抽 6 次：6 次都开、hash 全落在那 4 个下标里 |
| 出处 | 63 条 / 5 组 / 61 条带链接 = 清单里写了 `credit_url` 的 61 张；摘要「全部出处（63）」 |
| 主色垫底 | 63/63 格拿到 `--tile-base`（如 `#aeabb9`） |
| hover 扫光 | 真悬停秘藏那格：`animation-name: deck-glint`、`transform` 从 −148px 走到 +107px、1s 后停（`none`）；收藏那格雕花层 `opacity: 0`（扫光在跑但看不见 —— 有意的门控） |
| 首页回归 | 弹层照常打开、序号仍是「01 / 12」、地址栏**不写**深链、0 条错误 |
| 控制台 | 三支探针 + hover 脚本各 0 条错误 / 警告 |
| 几何 | 1680px：3 列（每张 205.7px）、结果行右边界 = 抽卡按钮右边界（1161）、无横向溢出；390px：2 列、说明两行不挤、无溢出（截图 `deck8/filters.png` / `filters-390.png` / `wall-top.png` / `wall-grouped.png` / `credits.png`） |

**工艺再分配（同轮，`data/home-cards.yaml` 只改 `style`）**

原来 12 种工艺的分布是「金边 14 / 和纸 13 / 玻璃 6 / 冰裂 6 / 雪华 6 / 星屑 5 / 雕花金 4 / 珐琅彩 3 /
全息 2 / 金继 2 / **墨 1 / 星芒全息 1**」—— 近一半是金边与和纸，而这一页存在的理由是
「一眼看出这八张不是同一种卡」，分布塌成两三种时那条理由就不成立。**改了 19 张卡的 `style`，
不动 `rank`、不重出图**（工艺是 CSS 画的），按名字与气质对得上分配（玄袖 / 夜宴 → 墨，
银铃 / 银绢 / 银纱 / 银月 → 全息，樱簪 / 花冠 / 花礼 / 冰晶 → 珐琅彩，幽兰 → 金继，
电波 / 琉璃音 → 星芒全息，薄冰 / 静水 / 冰凌 / 冷香 → 玻璃，霜羽 / 雪羽 → 雪华，雪铃 → 冰裂）。

结果：**玻璃 8 / 冰裂 7 / 雪华 7 / 和纸 6 / 全息 6 / 珐琅彩 6 / 金边 6 / 星屑 5 / 墨 3 / 雕花金 3 /
金继 3 / 星芒全息 3**（最大 8、最小 3；六档分布不变）。`check-deck.mjs` 加了一条 note 级守卫：
**少于 3 张的工艺会点名报出来**（不阻断 —— 这是内容口径，但要让偏离看得见）。

**同轮修的脚本坑**：`scripts/report-size.sh --fresh` 量不出来（`node` 报
`ENOENT: scandir 'D:\tmp\…\site'`）。原因是 node 也是**原生 Windows 程序**，不认 MSYS 的 `/tmp`：
hugo 那一段已经 `cygpath` 转了，量体积那一段把 MSYS 路径直接递给了 node。修法见 `docs/traps.md`。

**体积账（对 HEAD 各做一次全新构建量的）**

- 整站 raw 24737 → **24777 KB**，gzip 8905 → **8911 KB（+6 KB）**；搜索索引 48 KB 不动；**0 张新图**。
- 收藏库自己：raw 105.8 → **134.0 KB**（+27.6），gzip 19.9 → **23.2 KB**（+3.3）。分解：约 9 KB raw 是
  63 行出处清单、1 KB 是 63 个主色字段、2 KB 是序号，其余是并进已有样式表的新规则（不多一个请求）。
- 首页：raw 57.96 → 61.92 KB（+4 KB，其中约 3 KB 是 CSS、1 KB 是共用清单多出的两个字段 + 主色）。
- hover 扫光只在悬停那一格上跑 0.7s 一次，**稳态 0 成本**（对比首页那条 7s 无限动画的取舍）。

**补记：比例条的两处返工（同日晚，都是「浅色主题下看不见」这一类）**

1. **3px → 5px**。3px 那一版在整屏截图里读不出来（它本该是「六档各有多少张」的唯一图示），
   放大到 DPR2 裁剪截图才看清分段。5px 是「看得出来」与「像一条分隔线」之间的位置。
2. **轨道从 `--entry` 换成 `--edge`**。第一段（收藏）的色标取的是框色令牌 `--cframe` —— 而它是
   **银灰渐变**（`#e8eaef → #9aa0ab → …`），铺在浅色主题的近白底上整段读成留白，五段的条看起来
   缺了一段。`--edge` 是全站唯一一个**两个主题都保证看得见**的边色令牌（浅色 20% 黑 / 深色 18% 白），
   拿它当轨道，最浅那一段才读成一个色块，顺带让 2px 的 gap 变成分隔线。
   判据不是「肉眼看差不多」：放大截图（DPR2、裁剪到那一排、`Page.captureScreenshot` 的 clip 记得
   加 `scrollY`）之后再判。
3. 连带改的**一处令牌表**：`.home-card-rank--collector` / `--miracle` 现在**显式写** `--cframe`
   （值与 `.home-card` 的基础默认值相同）。原因就是上面那条 —— 卡片墙上的色标（`.deck-chip-mark`、
   `.deck-rank-bar i`）读这个令牌，但它不在 `.home-card` 里、继承不到基础值；不写就退回
   `--rank-mark-fill`（近白）。与那两条「重复的令牌」同一个理由：**六档要是一张完整的表**。
   卡面上的观感零变化（同样的值），只是少一个「只在这张表之外才成立」的隐含前提。

**卡片第四轮：数学曲线进设计（徽记 / 角饰 / 超椭圆 / 光沿曲线走）— 2026-09-21 深夜**

用户贴了一批「好看的数学曲线」（玫瑰线、双纽线、星形线、外摆线、对数螺线、蝴蝶曲线、
超椭圆、曼德博集合…）问怎么用在卡上，并要「去掉卡背的 x/y 那样的数字」。

这一轮的口径是**曲线当骨架，不当印花**：形状（徽记、角饰、外框剪影、光的路径）由曲线
算出来，十二种工艺材料（和纸 / 金继 / 珐琅 / 雕花…）一个都没动。理由有两条：
① 材料感是这套卡的身份，把曲线当印花大面积铺上去会把它冲掉；
② 六档**要能一眼分开**，而「曲线管形状、工艺管表面」正好让形状这一维完全归等级支配。

**一、六档徽记换成六条真曲线**

| 档 | 曲线（方程） | 尺寸 | 这个尺寸下读得出什么 |
|---|---|---|---|
| 收藏 | 圆 r = 1 | 15px | 圆点（仍用 `border-radius` 画，不占字节） |
| 珍稀 | 星形线 x = cos³t, y = sin³t | 17px | 四芒、边向内凹 |
| 史诗 | 双纽线（伯努利）x = cos t/(1+sin²t), y = sin t cos t/(1+sin²t) | 19px | ∞ |
| 秘藏 | 内摆线 R/r = 5 | 21px | 五角星花（尖朝**里**收 ——「藏」落在了形状上） |
| 传世 | 玫瑰线 r = cos 5θ | 23px | 五瓣花 |
| 奇迹 | 蝴蝶曲线（Fay）r = e^{sin t} − 2cos(4t) + sin⁵((2t−π)/24) | 26px | 蝴蝶（「显形」与「蜕变」是同一件事） |

**尺寸也是阶梯的一部分**，这是这一轮最实在的一条发现：原来六档挤在 13/14/15/17/19/22px，
实测（`lab/shots/curve-sheet.py`，DPR2）13px 下双纽线糊成两个点、玫瑰线糊成星号、蝴蝶糊成
领结 —— **曲线再真也读不出来**。所以尺寸拉到 15–26px：「越大越稀有」自己成了第二个信号。
验收方法是先 96px 看形状对不对，再按**真尺寸**看认不认得出（拿 96px 的效果当结论会骗自己）。

实现是「真曲线采样成密多边形」直接写进 `clip-path` 令牌（`--mark-*`，在生成物
`20-card-ornaments.css` 里），三条口径：

- **整数百分比**：26px 下 1% = 0.26px，量化误差 0.13px 看不出来，而字符串短 40%
  （这份文件是全站每页都要吃的全局样式表）。
- **自交曲线靠 nonzero 填充规则留住两瓣**：双纽线、奇 k 玫瑰线都自交，填反的表现是
  「徽记缺一半」，而且**不报错**。
- 密集多边形的形状是自洽的：改参数不会改坏形状（手搓坐标一定改得坏）。

**二、角饰：6~12px 上只能换「轮廓家族」**

`--fret-corner` 被 mask 成 `--fret-w` = 0~11px（按档位：史诗 6 / 秘藏 9 / 传世 11）。
这个尺寸上画不出可辨的花瓣，所以只换轮廓家族：史诗 = 星形线**凹角**（凹口）、
秘藏 = 玫瑰盘（边上有点起伏）、传世 = 外摆线**齿环**（外缘不圆）。DPR4 放大看得出了。
想放真的曲线花纹得先把框环加宽到 ~16px（代价是画面每边少 5px）—— 列入 `pending.md`。

**三、外框：超椭圆，三处同一个指数**

- **CSS**：`corner-shape: superellipse(4)`（CSS Borders 4）。探针 `CSS.supports(...)` 在
  Edge 153 上为真；不支持的浏览器按 `border-radius` 的圆弧渲染，**自动降级** —— 所以这件事
  不需要 mask、没有合成层成本，一个令牌（`--cshape`）加在卡根与焦点环上。
  角对照图 `lab/shots/deck9/corner.png`（DPR4，超椭圆 vs 强制 `round`）能看出差别：
  超椭圆更早离开直角、把角填得更满。
- **3D**：`CARD_N = 4` 驱动 `perimeter()`（侧壁轮廓）与两处 SDF、一处法线梯度。
  平面卡与 3D 卡是同一张卡的两种呈现，**角不一样就是两种卡**，所以这个数只有一处定义。
- 代价写在代码里：p-范数不是严格距离（角附近偏小 ≈1% 卡宽），所以「边缘折射圈」在四个角
  会比直边略宽一点 —— 1% 卡宽上不可分。
- 内层 8 处 `--cart-r` 仍是圆弧（差 ≤1.4px），有意留着：画框内缘更圆，更像实物。

**四、全息流光与光锥：光沿曲线走**

原来这两件事**都与数学无关**：全息是一条直线带（`uv.x − 0.30 + 0.75·uv.y`），光锥是同一个
方向带。现在：

- 全息流光按档位混向**对数螺线**场（`spiralField`，r = a·e^{bθ} 的同族相位 ln r/b − θ）——
  色带不再是「一条固定斜线扫过」，而是绕卡心旋出去。
- 光锥加**玫瑰线花瓣**（`roseField`，k = 5 与传世那档的徽记**同一条曲线**：光与标同族，
  不是另挑一条）。
- 权重 `uHoloC / uConeC` 六档为 0/.20/.40/.60/.82/1 与 0/0/.20/.45/.75/1；**收藏与珍稀是 0**
  ——也就是「与加这批之前逐像素一致」（与前面那 13 项立体通道同一条纪律：低档不许被顺手美化）。

坑（文件里早写过、这轮又验了一次）：新场的**量级必须与原来那条直线带同阶**（diag 在整张卡上
跨约 2.7）。系数一大，相位就细成网格、看着像渲染坏了 —— 两个场的数值都是按这个量级推出来的。

验收 `lab/shots/deck9/card3d.py`：同一档、同一角度，用 `card3d.setFx({coneC:0, holoC:0})`
（那个 API 就是为对比图留的，产品路径上恒为 null）再拍一张并排；读数同时记 `stats().fx`
（**生效值**）与 `sample()` 的 coverage / meanLum / distinct。判据：曲线应该只改色带的走向与
色数，**coverage 不该变** —— 变了就说明动到几何了。

**五、浮雕：量过，不重出**

`lab/shots/deck9/depth.py`（只读）按档聚合出四个数：幅度 max−min、倒角带（离边 3~14px 的均值）、
平台均值与标准差、以及**深度图是否比卡面新**。63 张的结果：幅度 0.98~1.00、倒角带 0.22~0.28
（有坡、没被切平）、平台 SD 0.24~0.28（滚动高度场，不是死平面）、比卡面旧的 **0 张**。
结论：上一轮定的倒角模型与高度场都还在，**这一轮不重出任何深度图**。

**六、一处顺带验明的既有设计**：卡片墙的弹层把 **`rankWall`** 交给 3D，所以奇迹卡在显形前
**连 3D 都是收藏档的参数**（`coneC/holoC = 0/0`）——「不泄底」不是只写在那串文字上的。
探针第一版按奇迹的真值写期望，于是每次跑都在这一档报警；报警是对的，错的是期望值。

**七、卡背不再印序号**

`07 / 63` 从卡背去掉 —— 卡背是一张卡，不是一条记录，编号那种「x / y」式的元数据属于信息栏。
信息没丢：弹层里那条 DOM 文本照样有它（`home-deck.js` 的 `indexText`，见 `card-3d.js`
文件头第 5 条「卡背上的文字必须有等价的 DOM 文本」）。

**八、体积账**

- 生成物 CSS（**全站每页都吃**）：`20-card-ornaments.css` gzip 10168 → 13734（+3.6 KB）。
  中途返工一次：三个角花令牌按 26px 源图的精度给了 96/160/200 点，而它们被 mask 成 6~12px
  —— 纯过剩。降到 48/64/72 点后观感不变，省回约 2.8 KB raw。
  **生成物按「显示尺寸」给精度，不按源图尺寸**（这条进了 `traps.md`）。
- `21-card-deck.css` +1.6 KB gzip、`card-3d.js` +2.3 KB gzip。
- 整站输出 gzip **8911 → 8914 KB**（+3），五条体积预算全过；收藏库页面 raw 134.0 KB **未变**
  （这一轮没动服务端渲染）；**0 张新图**。

**九、这一轮自己造的两个错（都补了守卫/文档）**

1. **手插声明时把 `--cframe` 的分号挤掉了**：三条规则的卡框色直接成了非法值，而 hugo、
   浏览器、其余 11 个校验脚本**全绿** —— 在浏览器里读 `getPropertyValue('--cframe')`
   才发现。补了 `check-deck.mjs` 的守卫 ⓪（一行以 `)` 收尾、没分号、下一行又是声明 ⇒ fail），
   并用一次**同形假故障**验过它抓得住（第 1468 行被点名、exit 1）。
2. **探针点了 `display:none` 的格子**：`el.click()` 照样派发，于是弹层没开、六档全读到默认态，
   而读数「看起来很正当」（全 0 恰好是收藏档的真值）。改成扫可见格子，并把「读到的通道
   等不等于该档应给的值」写成断言 —— **值对不对是能查的，别只看有没有报错**。

**十、验收产物**（都在 `lab/shots/deck9/`，只有 `curve-sheet.png` 在上一级 `lab/shots/` —— 与它的脚本同级）

| 文件 | 证的是 |
|---|---|
| `curve-sheet.png` | 六条曲线在 96px 与**真尺寸**下的形状与可辨性（+ 与旧手搓形状的对照） |
| `marks-dark.png` / `marks-light.png` | 卡片墙上六档徽章的**实际裁剪**（DPR2，含浅色主题可读性） |
| `design-dark.png` | 六档的**框角 + 徽章**（DPR4）：角饰的轮廓家族、超椭圆角、徽章阶梯 |
| `corner.png` | 超椭圆 vs 圆弧的角对照（DPR4，强制 `round` 做对照） |
| `card3d-dark.png` | 3D 卡「曲线场开 / 关」成对对照 + `stats().fx` 与 `sample()` 读数（收藏/珍稀两档**左右完全一致**＝权重 0 那条纪律的实证） |
| `corner3d.png` | 3D 侧视时的角部放大（DPR4）：侧壁转角是连续曲面、无破面与漏光 |
| `depth-report.json` | 63 张深度图的四项读数与时效 |
