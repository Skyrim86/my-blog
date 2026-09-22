# Skyrim 的博客 — AI 助手须知

Hugo 静态博客（中文）。本文件只放**每次动手都要遵守的规则 + 去哪找细节的指针**；机制、原因、实测数据都在 `docs/` 里，按第 7 节的索引**按需读单个文件**，不要通读全部。

## 1. 基本事实

- Hugo **0.165.0** extended + PaperMod 主题（**vendored** 在 `themes/PaperMod/`，不是 submodule）。版本钉的唯一事实源是 `.github/actions/validate/action.yml`
- `baseURL` 带子路径 `/my-blog/` —— 资源引用用 `absURL`/relref 或相对路径，**不要硬编码域名**
- 内容三类：**文章**（`content/posts/<slug>/index.md`）、**课程**（课程 → 章 → 材料页）、**项目**（默认平铺单页）
- 部署：push `main` → GitHub Actions `deploy.yml` → 校验 + 构建 → Pages。**校验与构建的唯一定义在 `.github/actions/validate/action.yml`**（`checks.yml` 与 `deploy.yml` 共用）
- 推送固定入口：`bash scripts/push-blog.sh "feat: 说明"`（自己跑校验、构建、commit、push；校验不过就中止，不推）
- **这个仓库的改动做完就推，不必先问人**（用户 2026-09-21 明示「以后都要推送」）。例外只有一条：下面那条「可能同时有别的会话在改」命中时先问一声 —— 推之前 `git status` 看一眼有没有不认识的改动
- **可能同时有别的会话在改这个仓库**（人在两个窗口里对话时就会这样）：`push-blog.sh` 的 `git add -A` 会把**别人写到一半的文件**一起提交推送——实测踩过：另一个会话提交了一个没闭合的模板注释，CI 构建直接失败（线上不受影响，Pages 继续发上一次成功的版本）。所以推送前后都 `git status` 看一眼，发现不认识的改动先问人，别急着 add

## 2. 硬规则

1. **内容一律走脚手架**：`bash scripts/new-content.sh <post|course|chapter|notes|homework|lab|project|sub|doc|section|remove>`，或用 `/new-post`、`/new-course`、`/new-project`、`/admin`，或双击 `启动管理页.bat`。**不要用 Write 直接创建内容文件、不要手抄 front matter**——`archetypes/` 是唯一事实源，手抄必然漂移。**删除也走 `remove`**（它有 bundle、section 根与 `_index.md` 的护栏：section 列表页不能单独删），不要手敲 `rm`
2. **标签只从 `data/taxonomy.yaml` 取**，不要手打；新词加 `--new-tag`（脚本自动写回词表）。词表格式被 shell grep 解析，**不要改成嵌套 YAML**
3. **标签只打在 regular page 上**：section 页（课程主页、章节入口页、项目页、子项目页）写 `tags`/`categories` 是**无效且有害**的（`/tags/` 计数虚高、词条页里却不出现）。课程/项目的标签写在主页的 `cascade` 里并加 `target: {kind: page}`；写作用范围用 **`target`**，不要用已弃用的 `_target`
4. **`cascade` 只填空、不合并**：子孙页一旦自己写了 `tags`（**空数组也算「已定义」**），继承来的标签会被**整体丢弃**。所以课程材料页与分层项目的子项目页/文档页**不要写 tags**
5. **不要整份复制主题模板**。用主题 hook：覆盖 `layouts/_partials/` 下的 `extend_head.html` / `extend_footer.html` / `extend_post_content.html` / `comments.html` 即生效。新建自定义 partial 放 `layouts/_partials/`（带下划线），不要用 `layouts/partials/` 或 `layouts/_default/`；自定义 layout 模板放 `layouts/<section>/<layout>.html`（如 `layouts/projects/project-home.html`，由 front matter 的 `layout:` 命中，不是复制主题模板）——**例外**：多个 section 共用的 layout 必须放 `layouts/_default/<layout>.html`，因为查找是 `layouts/<section>/<layout>.html` 优先，section 名与 layout 名不相等时前者永远命中不了（2026-09-18 的 CS 库踩过，见 docs/traps.md）。**十一处有意的覆盖**：`layouts/courses/{course,chapter}.html`、`layouts/index.json`、`layouts/_partials/index_profile.html`、`layouts/_partials/post_meta.html`（只逐字保留主题实现 + 末尾追加一行）、`layouts/404.html`（主题原件只有 3 行）、`layouts/taxonomy.html`（词条按学科分块，见 docs/features.md 第 4 节）、`layouts/baseof.html`（跳过链接 + `lang=zh-CN`；**它不是「原件短所以覆盖」，而是位置本身不可达** —— 要改的一处在 `<html>` 上、一处在 `<body>` 开头，而四个 hook 都够不到这两处。全站每个页面都过这个文件，改它要按页型抽查，见 docs/features.md 第 4 节）、`layouts/_partials/templates/schema_json.html`（逐字保留主题实现、**共三处差异**：删掉 BlogPosting 的 `articleBody`（它把整篇正文复制进 `<head>`，实测占重页 gzip 的 17–20%）、零值日期整行不输出、`@type` 在 `BlogPosting`/`WebPage` 之间随发布日期走。升级主题时与主题那份对拍，确认差异仍只有这三处；改完跑 `check-seo.mjs`，它会 `JSON.parse` 每个 `ld+json` 块并断言 BlogPosting 的必填字段）、`layouts/_markup/render-image.html`（逐字保留主题实现，只给内容图补 `width`/`height` 并把 PNG 转无损 WebP。**必须配 `assets/css/extended/00-theme.css` 里 `.post-content img` 的 `height: auto`** —— 主题 reset 只有 `max-width: 100%`，只补尺寸属性会在窄屏把图片压扁，见 docs/features.md ㊲）、`layouts/_partials/templates/opengraph.html`（第 10 处：逐字保留主题实现，只把 `site.Language.LanguageCode` 换成 `.Language.Locale` —— 前者自 Hugo 0.158 起弃用、每跑一次构建吐一条 WARN）、`layouts/rss.xml`（第 11 处：**同一条 WARN 的第二个来源**，改的是 `<language>` 那一行。这两处要一起改才有意义：Hugo 的弃用告警不带文件名，只覆盖 opengraph 那条 WARN 照旧出现，实测过）
6. **JS 放 `assets/js/*.js`**，由 `extend_head.html` 用 `resources.Get | minify | fingerprint` 接线外链；不要内联 `<script>`（无 lint、无压缩、内联 defer 无效）。**CSS 放 `assets/css/extended/`**，一个职责一个文件、用 `NN-` 前缀控制合并顺序；模板里不要写 `<style>`。**唯一例外**是 `extend_head.html` 里那段背景套的首屏前置脚本（约 200 字节）：它必须在**首次绘制前**把 `data-bg` 写到 `<html>` 上，走 defer 外链会先按默认套下一张图再换成访客存的那张——白下载一百来 KB 还闪一下；主题自己处理 `pref-theme` 用的是同一招。理由与登记见 [`docs/traps.md`](docs/traps.md)
7. **面向访客的文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}`；JS 里的文案走自己 `<script>` 标签的 `data-*` 属性（模板侧用 `i18n` 填值），不要硬编码中文
8. **复用主题 CSS 变量**（`--theme`/`--border`/`--secondary` 等）；暗色适配用 **`[data-theme="dark"]`**（主题机制是 `<html>` 上的属性），写 `.dark` 永远不触发
9. **配置一律进 `hugo.toml`**，模板里读 `site.Params.xxx`；`timeZone = 'Asia/Shanghai'` 与 `[outputs] home` 的 `'JSON'` **勿删**（前者决定当天文章能否上线，后者决定搜索是否可用）
10. **主题已提供的东西不要自己写**：先 grep `themes/PaperMod/layouts/` 与 `themes/PaperMod/assets/css/`。**`themes/PaperMod/` 不直接改**，要扩展行为优先用 hook，其次在 `hugo.toml` 找开关
11. **能问工具的就不要自己实现**：页面 URL 问 `hugo list all`（它输出每页 `path,permalink`），front matter 模板认 `archetypes/`，词表格式认 `data/taxonomy.yaml`
12. **新增校验加进 `.github/actions/validate/action.yml`**（不要在某个 workflow 里单独写，否则 `checks.yml` 与 `deploy.yml` 分叉），并想清楚是**阻断**（内容正确性：缺 front matter、坏链、公式错版）还是**只警告**（内部一致性：词表、编辑器字段表）。**同一份校验清单有三处登记**：`action.yml`（唯一事实源）、`scripts/push-blog.sh`（本地推送）、`tools/admin/lib/checks.mjs` 的 `ITEMS`（管理页体检面板）。**CI 里阻断的每一项，另外两处都必须有** —— `node scripts/check-consistency.mjs` 会强制断言这件事（CI 独有、只警告的项不要求同步）。加校验时忘了同步另两处的后果是具体的：push-blog 少一项 = 本地全绿推上去才被拦；体检面板少一项 = 面板谎报通过。**写校验脚本时不要「每个文件开一串子进程」**（Windows 的 Git Bash 里每次约 21ms，`check-frontmatter.sh` 曾因此独占一次推送 102 秒里的 72.6 秒）：用一次 awk 扫描 + bash 内建判断，循环里连 `$(…)` 命令替换都要避开（fork 约 8ms）。改这三个脚本必须拿带缺陷的 content/ 做新旧输出对拍，做法与实测数字见 [`docs/architecture.md`](docs/architecture.md) 第 4 节
13. **改 URL 需谨慎**：URL 由 `[permalinks]`、目录名、文章标题（`:slug` 取自标题）决定。giscus 用 `mapping='pathname'`（2026-09-18 从 `'title'` 改来，同名标题会串页），**评论跟着 URL 走**：文章改标题既换 URL 又丢评论关联；课程/项目页的评论只受目录名影响。管理页的 `slug` 字段可把文章 URL 固定下来
15. **课程内容与数学工具库是生成产物**：`content/courses/regression-analysis/**` 的正文、`data/math-toolbox.json`、`content/courses/*/toolbox/<id>/index.md` 全部由 `python tools/course-import/import_course.py` 从课程项目生成（脚本里默认写的是 `D:\\1.Study\\course\\回归分析`，2026-09-18 实测本机在 `D:\\Study\\courses\\回归分析` —— **跑之前先确认，需要时用 `--project` 指定**）。改内容改**课程项目里的 md**再重跑导入；手改博客这边的产物会在下次导入时被覆盖（`--check` 只比对不写盘）。**例外**：数学库的分支归属在 `data/math-branches.yaml`，那张表是手写的（两级：大类 → 细分），改它 + 重跑导入即可（见 docs/features.md ㉒）；`/library/` 下的大类页与细分页**不是文件**，由 `content/library/_content.gotmpl`（Hugo content adapter）按那张表现算生成，改表即改页面。正文里的数学引用**写结论的名字**、不写「工具 k.m」——脚本按名字表自动接上卡片链接。**在管理页「卡片库」里改过的卡会带上 `edited: true`，导入器会整条跳过它们**（`preserve_edited`）：那是用户在界面上做的修改，静默冲掉就是数据丢失。想把某张卡交回课程项目，删掉它的 `edited` 字段再重跑导入
14. **管理页（`tools/admin/`）受同样约束**：界面资源只能放 `tools/admin/ui/`（放进 `assets/**` 会被主题合并进公开站点资源 = 把管理界面发到线上）；写盘一律转交 `new-content.sh`/`push-blog.sh`，不要在 Node 里另写一套 front matter 或发布逻辑
16. **知识库（wiki）发布的卡片也是生成产物**：知识库在 `D:\Study\projects\wiki\statml-wiki`（**仓库外**，不在这个 repo 里），其中状态为「已验证」的卡片由 `python tools/wiki-publish/publish.py` 发布进来 —— 写进 `data/<库>-toolbox.json` 里**带 `source: wiki` 标记**的条目，以及对应的卡片页。**它只碰这些标记过的条目**，所以与规则 15 的 `import_course.py` 共存、互不覆盖。改内容改**知识库里的卡**再重跑发布；`--check` 只比对不写盘。归类取知识库 `maps/curriculum.yaml` 节点的 `分类`，key 必须在 `_meta/分类.yaml` 里，且与 `data/math-branches.yaml` / `data/cs-branches.yaml` 一致（发布器会校验这三张表）。**这条检查只在本地有意义**：知识库是仓库外的本地路径，CI 的机器上没有它 —— 所以它刻意不进 `.github/actions/validate/action.yml`、也不进 `scripts/push-blog.sh`，在体检面板里也只警告不阻断（判据与理由写在 `tools/admin/lib/checks.mjs` 那一项的注释里）

## 3. 内容怎么建

| 形态 | 结构 | 关键 front matter |
|---|---|---|
| 文章 | `content/posts/<slug>/index.md`（leaf bundle，封面图同目录） | `title`/`date`/`draft`/`tags`/`cover.image` |
| 课程 | `<课程>/_index.md`（**branch**，`layout: "course"`，`unit: "章"`）→ `<chapter-0N>/_index.md`（**branch**，`layout: "chapter"`，`math: false`）→ `notes\|homework\|lab/index.md`（**leaf**） | 课程标签只写在课程主页的 `cascade` 里；**材料页不要写 tags** |
| 项目（默认） | `content/projects/<项目>/index.md`（leaf bundle，**不分层**） | `title`/`date`/`description`/`tags`（技术栈也走 tags）/`repo`/`categories: ["项目"]`，**不需要写 layout** |
| 项目（分层，例外） | 项目主页 section（cascade）→ 子项目 section（**不写 tags**）→ 文档 regular page（`math: true`） | 只有项目里确实还要放子项目时才这么建 |

课程与项目的细节（模板认什么、附件怎么放、`cascade` 写法、脚手架每个子命令的参数、`remove` 的护栏）见 [`docs/content.md`](docs/content.md)。

**两条最容易犯的**：材料页/子项目页写 `tags`（会丢掉继承来的标签）；section 页写 `tags`（计数虚高且列表为空）。

## 4. 改功能去哪

| 功能 | 实现位置 | 细节 |
|---|---|---|
| Giscus 评论 + 主题跟随 | `layouts/_partials/comments.html`、`assets/js/giscus-theme-sync.js` | [`docs/features.md`](docs/features.md) |
| 系列文章导航 | `_partials/series-posts.html`、`03-widgets.css` | 同上 |
| 课程主页 / 章节入口页（材料按 笔记/习题/实验 分组，组别取**目录名**） | `layouts/courses/course.html`、`chapter.html`、`_partials/course-*.html`、`04-course.css` | [`docs/content.md`](docs/content.md) 第 2 节 |
| 站点背景（可切换的多套：黑长直少女 / 城市；或 **WebGL 动态背景**）+ 每套的蒙版 + 压在壁纸上的**局部玻璃底衬**（含页脚整条）与玻璃质感层 | `hugo.toml` 的 `[params.appearance].presets` 与 `[params.appearance.shader]`、`layouts/_partials/extend_head.html`（生成 `css/bg-image.css` + 首屏前置脚本 + shader 预置与接线）、`assets/js/bg-shader.js`（**动态背景本体**：极光 + 星野，按 `data-theme` 切两套配色；三条降级路径写在文件头）、`00-theme.css` 的 `body::before`（蒙版）与 `body::after`（质感层）及末尾的底衬清单、`assets/js/bg-switch.js`（切换循环里也有动态背景这一「套」，切到/切离它时由它调 `__bg.start()/stop()`；按钮的形状与悬停 2026-09-19 起在 `10-nav.css` 的「顶栏图标按钮」一节，`18-bg-switch.css` 已只剩说明）、`tools/backgrounds/make-backgrounds.py`（**生成产物，不要手改 assets/images/bg-*.webp**） | [`docs/features.md`](docs/features.md) 第 3 节 ⑫（含 24 组对比度实测、三条硬约束与出处；shader 的代价 / 对比度 / 降级链在同节末与 [`docs/exp-bg.md`](docs/exp-bg.md)） |
| 右下角看板娘（透明底抠图） | `_partials/extend_footer.html`、`14-mascot.css`、`tools/backgrounds/make-mascot.py`（**生成产物，不要手改 assets/images/mascot.webp**） | [`docs/features.md`](docs/features.md) 第 3 节 ㉕ |
| 首页的卡片组（63 张、**十六种卡面工艺**（普通 8 / 进阶 8 两档 —— **纯分类口径**，不驱动边框）、**六个等级**，一次一张；交叉淡入 + 方向位移；⤢ 弹层里是一张**能自由转动的 3D 真卡**（台面 600px，**十二个立体通道按等级递进**，**帧时间调速器**）） | `data/home-cards.yaml`（**清单，单一事实源**）、`_partials/home-cards.html`、`assets/js/home-deck.js`、`assets/css/extended/21-card-deck.css`（工艺的**结构层与主题层**：伪元素、`.home-card-lens`、深色覆写；令牌层已参数化，见 ㊺）、`data/card-styles.yaml`（**工艺参数的单一事实源**：15 种工艺的令牌；加一种工艺改这里，跑 `node tools/cards/render-styles.mjs` 重出 CSS 与 `STYLE_3D`）、`assets/css/extended/21-card-styles.css`（**生成产物**）、`tools/cards/render-styles.mjs`（**生成器**）、`assets/js/card-3d.js`（弹层里的 3D 卡：裸 WebGL，零依赖；`RANK_3D` 的**十五个立体通道** + `STYLE_3D` + `BACK_RING_*`；`CARD_N`（角的形状指数：与 CSS 的 `--cshape` 同一个数，驱动 `perimeter()` 与两处 SDF））、`tools/cards/make-cards.py` + `tools/cards/fetch-sources.py` + `tools/cards/sources/`（**生成产物，不要手改 `assets/images/cards/*.webp`**）、`tools/cards/make-depth.py` + `assets/images/cards/depth/`（**生成产物**：浮雕高度图，**轮廓要倒角**（`--fillet`，断崖变 sin 圆坡）、由 `image` 路径推导、不是 YAML 字段；额外依赖见 `tools/cards/requirements-depth.txt`）、`scripts/rank-deck.py`（**等级怎么定出来的**，可复跑、`--check` 看差异、`--apply` 写回）、`tools/cards/make-ornaments.py` + `assets/css/extended/20-card-ornaments.css`（**生成产物**：卡面纹样令牌 —— 雪花、裂缝网、星屑、珐琅格、雕花框零件；有机形状由「宽度沿脊柱变化」的轮廓生成；**第四轮**加了曲线族：六档徽记 `--mark-*`（圆 / 星形线 / 双纽线 / 内摆线 / 玫瑰线 / 蝴蝶，真曲线采样成密多边形）与三件曲线角花）、`scripts/check-deck.mjs`（清单校验，CI / push-blog / 体检面板三处都跑）；备选形式见 `_partials/home-chara.html` + `tools/backgrounds/make-ayaka-home.py` | 同上 ㉕（卡面诸事与两条取景判据、出处与对比度那两个坑）、㊳（3D 卡：倒角、**十二个立体通道**、**透明盖与外凸**（含 die-cut 样张的结论）、台面 600px 与 xl 卡面档、余韵 2.5s、性能读数）与 ㊴（六档阶梯：`rank` 必填、**等级管材料 / 工艺管纹样**这条两轴分工、三重编码、画框收窄、工艺两档（**哪一种是哪一档的定义在 `_partials/deck-manifest.html` 的 `$styleTier` 表**）、纹样生成器、定级脚本与守卫）；㊵（风格 16→8、取景填满且头像优先）、**`docs/pending.md`（跨会话的「等他拍板」清单）** |
| 收藏库（`/collection/`，63 张收藏卡铺成一页、可筛可点开 3D） | `content/collection/_index.md`、`layouts/_default/collection.html`、`_partials/{deck-wall,deck-manifest,deck-filters}.html`、`assets/js/deck-wall.js`、`21-card-deck.css` 的「卡片墙 / 筛选条」两段 | [`docs/features.md`](docs/features.md) 第 3 节 ㊿（含**筛选条重做**与**第三轮**：序号 `#NN` / 按系列分组 / 随机抽一张 / 隐藏档不泄底 / 主色垫底 / 出处清单 / hover 扫光 / `#deck-07` 深链 / 筛选进 URL；**第四轮**：数学曲线当骨架 —— 六档曲线徽记、曲线角花、超椭圆外框（`corner-shape`）、全息流光走对数螺线、光锥加玫瑰线花瓣；验收图在 `lab/shots/deck9/`） |
| 项目元信息（技术栈 + 源码） | `_partials/project-meta.html`、`05-project.css` | [`docs/content.md`](docs/content.md) |
| 相关内容区块 | `_partials/related-content.html`、`07-related.css` | [`docs/features.md`](docs/features.md) |
| 词条筛选框 | `assets/js/terms-filter.js`、`06-terms-filter.css` | 同上 |
| 搜索索引 | `layouts/index.json` + `hugo.toml` 的 `fuseOpts.keys`（**改一处必须同步另一处**） | 同上 |
| 站点外观（配色 / 深色令牌 / 面板透亮度 / 控件细边 `--edge` / 装饰层 / **明暗切换的过渡**） | `assets/css/extended/00-theme.css`、`03`…`13` 组件样式、`20-theme-fade.css` + `assets/js/theme-fade.js`（切换过渡） | [`docs/features.md`](docs/features.md) 第 3 节 ⑫（令牌、24 组对比度实测、过渡的实测代价）与 ㊱（导航/分页的交互） |
| 图标（favicon / apple-touch / 桌面快捷方式）与**导航栏的像素小人** | `tools/icons/make-icons.py`（**生成产物，不要手改 `static/` 下的 png/ico，也不要手改 `assets/images/nav/*.png`**）；图标位在 `hugo.toml` 菜单的 `pre` 字段、接线在 `extend_head.html`、样式在 `19-nav-px.css` | [`docs/architecture.md`](docs/architecture.md) 第 6 节 |
| 阅读进度条 / 目录当前项 | `assets/js/reading-progress.js`、`08-reader.css` | 同上 |
| 顶栏吸顶（毛玻璃吸顶 + 滚动后加深） | `assets/css/extended/10-nav.css`（「五、顶栏吸顶」）、`assets/js/header-sticky.js`、`00-theme.css` 的 `--surface-header` / `--shadow-sticky` | [`docs/features.md`](docs/features.md) ㊶ |
| 滚动出现动画（首屏之下的列表/卡片入场） | `assets/js/reveal.js`、`assets/css/extended/22-reveal.css` | [`docs/features.md`](docs/features.md) ㊷ |
| 首页头像的虹彩光环（悬停才转） | `layouts/_partials/index_profile.html`（`.avatar-halo` 壳）、`13-ornament.css` | [`docs/features.md`](docs/features.md) ㊸ |
| 代码块的**文件名标题条**（`{filename=...}`） | `layouts/_markup/render-codeblock.html`（渲染 hook，**别改成 `highlight .Inner`**）、`08-reader.css` | [`docs/features.md`](docs/features.md) ㊹ |
| 正文图片灯箱 | `assets/js/lightbox.js`、`26-lightbox.css`、`i18n/zh.toml` 的 `lightbox*` | 同上 ㊹ |
| 页脚标签胶囊 / 评论区玻璃容器 | `01-cards.css`（`.post-tags a`）、`08-reader.css`（`.giscus-wrapper`）、`comments.html` | 同上 ㊹ |
| 关于页的拼贴（Bento） | `data/about-bento.yaml`（清单）、`layouts/_shortcodes/bento.html`、`27-bento.css`；正文里一句 `{{< bento >}}` | [`docs/features.md`](docs/features.md) ㊺ |
| 正文分割线的霜晶 | `13-ornament.css`（`hr::after` 的 mask 形状） | 同上 ㊻ |
| 切页转场（原生 View Transitions） | `assets/css/view-transition.css`（**不压缩、单独外链**，别挪进 `css/extended/`）、`extend_head.html` | 同上 ㊻ |
| 首页时钟的数字字体（Playfair 数字子集） | `assets/fonts/rose-clock.woff2`（子集与换字体的做法在同目录 `README.md`）、`extend_head.html`（发布 + `@font-face` + preload，**只在首页**） | [`docs/features.md`](docs/features.md) ㊽ |
| 无障碍（跳过链接 / 动态列表播报 / 主题英文可访问名本地化 / `sr-only`） | `layouts/baseof.html`（第 7 处覆盖）、`assets/css/extended/17-a11y.css`、`assets/js/a11y-announce.js`、`assets/js/a11y-controls.js`（改主题模板里写死的 `aria-label`，不覆盖模板）、`terms-filter.js` 与 `list-tools.js` 里的 `role="status"` | [`docs/features.md`](docs/features.md) 第 4 节 |
| JSON-LD 结构化数据（删 `articleBody`、零值日期、`@type`） | `layouts/_partials/templates/schema_json.html`（第 8 处覆盖，逐字保留主题实现，共三处差异） | [`docs/features.md`](docs/features.md) 第 4 节第 8 条 + ㉟ |
| 正文横向溢出（行间公式滚动）/ 导航与分页悬停 | `assets/css/extended/08-reader.css`、`10-nav.css`，卡片的 `:focus-within` 在 `04`/`05`/`09` | [`docs/features.md`](docs/features.md) ㊱ |
| 首页（头像 / 快捷入口 / 站点规模 / **时钟** / 最近更新 / 入场动效 / **入站揭幕** / ≥1024px 两栏） | `_partials/index_profile.html`（整份覆盖）+ `_partials/home-scale.html`（站点规模）+ `_partials/home-clock.html` + `assets/js/home-clock.js`（时钟）+ `_partials/home-chara.html`（角色立绘）、`_partials/deck-splash.html` + `assets/css/extended/23-splash.css` + `home-deck.js` 末尾的退场段（**入站揭幕**：CSS 自带兜底退场，JS 挂了也不会挡人；`layouts/baseof.html` 里 `{{ if .IsHome }}` 挂载）、`09-home.css`、`hugo.toml` 的 `[params.home]`。**「按类浏览」那一栏 2026-09-21 已删**（`home-extras.html` 连 `09-home.css` 里的 `.home-browse` 组、4 个 i18n 键一起删掉了 —— 首页因此没有通往 `/categories/` 的入口，只剩主导航与 `/tags/`） | [`docs/features.md`](docs/features.md) ⑮、㊼ 与「2026-09-21 入站揭幕」 |
| 搜索快捷键（`Ctrl+K` / `/`）/ 搜索页 `?q=` 预填 | `assets/js/search-shortcut.js` | 同上 |
| 数学公式（构建期 KaTeX） | `layouts/_markup/render-passthrough.html`、`static/katex/` | [`docs/formulas.md`](docs/formulas.md) |
| 公式机械修复（`\*` → `*`、`§` → `\S`、圈号 → `\text{\textcircled{N}}`） | `scripts/fix-math-escapes.mjs`（管理页保存/新建与 `push-blog.sh` 都调它；`--selftest` 自测规则） | 同上 |
| 公式内容预检（嵌套 `$`、行内 `$` 数为奇数、JSON 双重转义指纹） | `scripts/check-math-syntax.mjs`（CI 与 `push-blog.sh` 都跑，阻断） | 同上（第 4 节） |
| 公式真检（Hugo 内嵌 KaTeX 逐条试渲染，覆盖全部语法错误；`--fix` 验证后才写盘地修双重转义） | `scripts/check-math-katex.mjs`（CI 与 `push-blog.sh` 都跑，阻断；`--selftest` 自测机制本身） | 同上（第 4 节） |
| 课程内容导入（课程项目 → 博客正文 + 工具库数据） | `tools/course-import/import_course.py`（**生成产物，不要手改**） | [`docs/content.md`](docs/content.md) 第 9 节 |
| 数学工具库（卡片墙 / 卡片页 / 引用弹窗） | `layouts/courses/{tools,toolcard}.html`、`_partials/{card-ref,toolbox-*}.html`、`assets/js/toolbox.js`、`11-toolbox.css` | [`docs/features.md`](docs/features.md) 第 3 节 ㉑ |
| 数学库（跨课程卡片索引，大类 → 细分 → 卡片三级） | `content/library/_content.gotmpl`（页面生成）、`layouts/_default/{library,library-branch,library-section}.html`、`data/math-branches.yaml`（分支归属，**非生成产物**） | [`docs/features.md`](docs/features.md) 第 3 节 ㉒ |
| 单页的左侧跟随目录 | `layouts/_partials/{toc-rail,extend_post_content}.html`、`12-toc-rail.css`（脚本**内联**在这支 partial 里，原来那个 `assets/js/toc-rail.js` 已删） | [`docs/features.md`](docs/features.md) 第 3 节 ㉓ |
| 新内容脚手架 / 删除 | `scripts/new-content.sh` | [`docs/content.md`](docs/content.md) |
| 标签词表 | `data/taxonomy.yaml`、`scripts/check-tags.sh` | 同上 |
| 本地管理页（新建 / 编辑 / 发布 / 体检面板 / 命令面板 `Ctrl+K` / 最近打开 / 插图） | `tools/admin/`（`start.sh`/`server.mjs`/`lib/`/`ui/`） | [`docs/admin.md`](docs/admin.md) |
| 校验与 CI | `.github/actions/validate/action.yml`、`scripts/check-*.sh`、`report-size.sh` | [`docs/architecture.md`](docs/architecture.md) |

**主题本身已提供**（不要重复实现）：明暗切换、TOC、面包屑、上下篇、代码复制、阅读时间、返回顶部（`#top-link`）、OG/JSON-LD/hreflang、robots.txt 与 sitemap。

## 5. 常用命令

```bash
bash tools/admin/start.sh                  # 本地管理页（新建/编辑/发布 + 内嵌预览）
bash scripts/preview.sh                    # 纯本地预览（含草稿）http://localhost:1313/my-blog/
hugo --minify --gc --cleanDestinationDir   # 生产构建（--cleanDestinationDir 不能省）
bash scripts/push-blog.sh "feat: 说明"     # 公式自动修复（机械层 + 真检验证层）→ 校验 → 构建 → commit → push（固定入口）
bash scripts/upgrade-hugo.sh <版本>        # 同步升级 Hugo + 配对的 KaTeX 样式
python tools/course-import/import_course.py           # 课程项目 → 博客内容 + 数学工具库（改完课程笔记后重跑）
python tools/course-import/import_course.py --check   # 只比对：博客是否落后于课程项目
```

跑完构建后单独校验：`check-sections.sh`、`check-frontmatter.sh`、`check-tags.sh`、`check-editor-schema.mjs`、`check-consistency.mjs`、`check-katex-pairing.sh`、`check-links.mjs`、`report-size.sh --fresh`；公式相关的都在**构建前**跑：`node scripts/fix-math-escapes.mjs`（机械修复，`--fix` 修、`--selftest` 自测规则）、`node scripts/check-math-syntax.mjs`（快检）、`node scripts/check-math-katex.mjs`（真检，`--selftest` 自测机制；`--fix` 验证后才写盘地修双重转义）。

## 6. 别做

- 不要改 `themes/PaperMod/`，也不要复制整份主题模板（例外清单见规则 5，现共十一处）
- 不要把管理页界面资源放进 `assets/**`；不要在 `tools/admin/ui/` 之外放界面文件
- **不要在 `.bat` 里写中文**（`启动管理页.bat` 现在一个非 ASCII 字节都没有，请保持；必须 CRLF、无 BOM）
- 不要把 `static/katex/katex.min.css` 与 `fonts/` 分到不同目录（CSS 用相对路径找字体）
- 不要新建 `content/tags.md` 之类带 `url` 的普通页去覆盖 taxonomy 总览页
- 不要 `rm` 内容文件、不要手写 front matter、不要在模板里硬编码中文文案或域名
- `scripts/*.sh` 与 `data/*.yaml` 必须保持 **LF**（`.gitattributes` 已钉住）；内容 `.md` 允许 CRLF
- 不要把裸 `$` 写进正文（会被当公式、构建直接失败），**也不要在数学区里再写 `$`**（`$…$` 遇到下一个 `$` 就收，会把区域截断），详见 [`docs/formulas.md`](docs/formulas.md)
- 数学里写裸 `*`（如 `$R^*$`），**不要**写成 `\*`（KaTeX 没这个命令，一处就让构建失败；散文里的 `\*` 转义不受影响）；数学区里的 `§` 写 `\S`、圈号写 `\text{\textcircled{N}}`。这三类由 `scripts/fix-math-escapes.mjs` 自动修（管理页保存与 `push-blog.sh` 都调它）。**另外不要把 JSON 转义过的字符串直接粘进正文**（如 `$\\theta$`，双重转义）：`\\` 在 LaTeX 里是合法换行，只能在发布时由真检 `--fix` 验证后自动修。见 [`docs/formulas.md`](docs/formulas.md) 第 3、4 节

## 7. 文档索引：改 X 前先读 Y

| 要改的东西 | 先读 |
|---|---|
| 目录布局、`hugo.toml` 任一项、CI / 部署 / 新增校验 | [`docs/architecture.md`](docs/architecture.md) |
| 要不要换框架 / 前后端分离（**已否决，别再提议**） | [`docs/architecture.md`](docs/architecture.md) 第 7 节 |
| 内容结构、front matter、`cascade`、标签词表、脚手架参数、附件 | [`docs/content.md`](docs/content.md) |
| 评论 / 系列 / 筛选框 / 相关内容 / 搜索索引 / 项目面板等具体功能 | [`docs/features.md`](docs/features.md) |
| 公式渲染、passthrough 定界符、升级 Hugo、公式显示错乱 | [`docs/formulas.md`](docs/formulas.md) |
| 管理页（类型分组、字段表、体检面板、命令面板、插图、安全边界、`.bat`） | [`docs/admin.md`](docs/admin.md) |
| 遇到怪现象、不确定某个机制为什么这样写 | [`docs/traps.md`](docs/traps.md) |

**保持本文件精简**：新知识写进对应的 `docs/` 文件，这里只在「这是一条每次都必须遵守的规则」时才加一行，并附上指针。
