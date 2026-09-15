# Skyrim 的博客 — AI 助手须知

Hugo 静态博客（中文）。本文件只放**每次动手都要遵守的规则 + 去哪找细节的指针**；机制、原因、实测数据都在 `docs/` 里，按第 7 节的索引**按需读单个文件**，不要通读全部。

## 1. 基本事实

- Hugo **0.165.0** extended + PaperMod 主题（**vendored** 在 `themes/PaperMod/`，不是 submodule）。版本钉的唯一事实源是 `.github/actions/validate/action.yml`
- `baseURL` 带子路径 `/my-blog/` —— 资源引用用 `absURL`/relref 或相对路径，**不要硬编码域名**
- 内容三类：**文章**（`content/posts/<slug>/index.md`）、**课程**（课程 → 章 → 材料页）、**项目**（默认平铺单页）
- 部署：push `main` → GitHub Actions `deploy.yml` → 校验 + 构建 → Pages。**校验与构建的唯一定义在 `.github/actions/validate/action.yml`**（`checks.yml` 与 `deploy.yml` 共用）
- 推送固定入口：`bash scripts/push-blog.sh "feat: 说明"`（自己跑校验、构建、commit、push；校验不过就中止，不推）
- **可能同时有别的会话在改这个仓库**（人在两个窗口里对话时就会这样）：`push-blog.sh` 的 `git add -A` 会把**别人写到一半的文件**一起提交推送——实测踩过：另一个会话提交了一个没闭合的模板注释，CI 构建直接失败（线上不受影响，Pages 继续发上一次成功的版本）。所以推送前后都 `git status` 看一眼，发现不认识的改动先问人，别急着 add

## 2. 硬规则

1. **内容一律走脚手架**：`bash scripts/new-content.sh <post|course|chapter|notes|homework|lab|project|sub|doc|section|remove>`，或用 `/new-post`、`/new-course`、`/new-project`、`/admin`，或双击 `启动管理页.bat`。**不要用 Write 直接创建内容文件、不要手抄 front matter**——`archetypes/` 是唯一事实源，手抄必然漂移。**删除也走 `remove`**（它有 bundle、section 根与 `_index.md` 的护栏：section 列表页不能单独删），不要手敲 `rm`
2. **标签只从 `data/taxonomy.yaml` 取**，不要手打；新词加 `--new-tag`（脚本自动写回词表）。词表格式被 shell grep 解析，**不要改成嵌套 YAML**
3. **标签只打在 regular page 上**：section 页（课程主页、章节入口页、项目页、子项目页）写 `tags`/`categories` 是**无效且有害**的（`/tags/` 计数虚高、词条页里却不出现）。课程/项目的标签写在主页的 `cascade` 里并加 `target: {kind: page}`；写作用范围用 **`target`**，不要用已弃用的 `_target`
4. **`cascade` 只填空、不合并**：子孙页一旦自己写了 `tags`（**空数组也算「已定义」**），继承来的标签会被**整体丢弃**。所以课程材料页与分层项目的子项目页/文档页**不要写 tags**
5. **不要整份复制主题模板**。用主题 hook：覆盖 `layouts/_partials/` 下的 `extend_head.html` / `extend_footer.html` / `extend_post_content.html` / `comments.html` 即生效。新建自定义 partial 放 `layouts/_partials/`（带下划线），不要用 `layouts/partials/` 或 `layouts/_default/`；自定义 layout 模板放 `layouts/<section>/<layout>.html`（如 `layouts/projects/project-home.html`，由 front matter 的 `layout:` 命中，不是复制主题模板）。**四处有意的覆盖**：`layouts/courses/{course,chapter}.html`、`layouts/index.json`、`layouts/_partials/index_profile.html`、`layouts/_partials/post_meta.html`（只逐字保留主题实现 + 末尾追加一行，见 docs/features.md 第 4 节）
6. **JS 放 `assets/js/*.js`**，由 `extend_head.html` 用 `resources.Get | minify | fingerprint` 接线外链；不要内联 `<script>`（无 lint、无压缩、内联 defer 无效）。**CSS 放 `assets/css/extended/`**，一个职责一个文件、用 `NN-` 前缀控制合并顺序；模板里不要写 `<style>`
7. **面向访客的文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}`；JS 里的文案走自己 `<script>` 标签的 `data-*` 属性（模板侧用 `i18n` 填值），不要硬编码中文
8. **复用主题 CSS 变量**（`--theme`/`--border`/`--secondary` 等）；暗色适配用 **`[data-theme="dark"]`**（主题机制是 `<html>` 上的属性），写 `.dark` 永远不触发
9. **配置一律进 `hugo.toml`**，模板里读 `site.Params.xxx`；`timeZone = 'Asia/Shanghai'` 与 `[outputs] home` 的 `'JSON'` **勿删**（前者决定当天文章能否上线，后者决定搜索是否可用）
10. **主题已提供的东西不要自己写**：先 grep `themes/PaperMod/layouts/` 与 `themes/PaperMod/assets/css/`。**`themes/PaperMod/` 不直接改**，要扩展行为优先用 hook，其次在 `hugo.toml` 找开关
11. **能问工具的就不要自己实现**：页面 URL 问 `hugo list all`（它输出每页 `path,permalink`），front matter 模板认 `archetypes/`，词表格式认 `data/taxonomy.yaml`
12. **新增校验加进 `.github/actions/validate/action.yml`**（不要在某个 workflow 里单独写，否则 `checks.yml` 与 `deploy.yml` 分叉），并想清楚是**阻断**（内容正确性：缺 front matter、坏链、公式错版）还是**只警告**（内部一致性：词表、编辑器字段表）
13. **改 URL 需谨慎**：URL 由 `[permalinks]`、目录名、文章标题（`:slug` 取自标题）决定。giscus 用 `mapping='title'`，所以**改标题既换 URL 又丢评论关联**；改目录名只换 URL。管理页的 `slug` 字段可把文章 URL 固定下来
15. **课程内容与数学工具库是生成产物**：`content/courses/regression-analysis/**` 的正文、`data/math-toolbox.json`、`content/courses/*/toolbox/<id>/index.md` 全部由 `python tools/course-import/import_course.py` 从课程项目（`D:\\1.Study\\course\\回归分析`）生成。改内容改**课程项目里的 md**再重跑导入；手改博客这边的产物会在下次导入时被覆盖（`--check` 只比对不写盘）。**例外**：数学库的分支归属在 `data/math-branches.yaml`，那张表是手写的（两级：大类 → 细分），改它 + 重跑导入即可（见 docs/features.md ㉒）；`/library/` 下的大类页与细分页**不是文件**，由 `content/library/_content.gotmpl`（Hugo content adapter）按那张表现算生成，改表即改页面。正文里的数学引用**写结论的名字**、不写「工具 k.m」——脚本按名字表自动接上卡片链接
14. **管理页（`tools/admin/`）受同样约束**：界面资源只能放 `tools/admin/ui/`（放进 `assets/**` 会被主题合并进公开站点资源 = 把管理界面发到线上）；写盘一律转交 `new-content.sh`/`push-blog.sh`，不要在 Node 里另写一套 front matter 或发布逻辑

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
| 课程主页 / 章节入口页 | `layouts/courses/course.html`、`chapter.html`、`_partials/course-*.html`、`04-course.css` | [`docs/content.md`](docs/content.md) |
| 项目元信息（技术栈 + 源码） | `_partials/project-meta.html`、`05-project.css` | [`docs/content.md`](docs/content.md) |
| 相关内容区块 | `_partials/related-content.html`、`07-related.css` | [`docs/features.md`](docs/features.md) |
| 词条筛选框 | `assets/js/terms-filter.js`、`06-terms-filter.css` | 同上 |
| 搜索索引 | `layouts/index.json` + `hugo.toml` 的 `fuseOpts.keys`（**改一处必须同步另一处**） | 同上 |
| 站点外观（配色 / 深色令牌 / 背景图） | `assets/css/extended/00-theme.css`、`hugo.toml` 的 `[params.appearance]` | [`docs/features.md`](docs/features.md)（背景图出处与性能账见第 6 节） |
| 图标（favicon / apple-touch / 桌面快捷方式） | `tools/icons/make-icons.py`（**生成产物，不要手改 static/ 下的 png/ico**） | [`docs/architecture.md`](docs/architecture.md) 第 6 节 |
| 阅读进度条 / 目录当前项 | `assets/js/reading-progress.js`、`08-reader.css` | 同上 |
| 首页（头像 / 快捷入口 / 最近更新） | `_partials/index_profile.html`（整份覆盖）、`09-home.css`、`hugo.toml` 的 `[params.home]` | 同上 |
| 搜索快捷键（`Ctrl+K` / `/`）/ 搜索页 `?q=` 预填 | `assets/js/search-shortcut.js` | 同上 |
| 数学公式（构建期 KaTeX） | `layouts/_markup/render-passthrough.html`、`static/katex/` | [`docs/formulas.md`](docs/formulas.md) |
| 公式机械修复（`\*` → `*`、`§` → `\S`、圈号 → `\text{\textcircled{N}}`） | `scripts/fix-math-escapes.mjs`（管理页保存/新建与 `push-blog.sh` 都调它；`--selftest` 自测规则） | 同上 |
| 公式内容预检（嵌套 `$`、行内 `$` 数为奇数、JSON 双重转义指纹） | `scripts/check-math-syntax.mjs`（CI 与 `push-blog.sh` 都跑，阻断） | 同上（第 4 节） |
| 公式真检（Hugo 内嵌 KaTeX 逐条试渲染，覆盖全部语法错误；`--fix` 验证后才写盘地修双重转义） | `scripts/check-math-katex.mjs`（CI 与 `push-blog.sh` 都跑，阻断；`--selftest` 自测机制本身） | 同上（第 4 节） |
| 课程内容导入（课程项目 → 博客正文 + 工具库数据） | `tools/course-import/import_course.py`（**生成产物，不要手改**） | [`docs/content.md`](docs/content.md) 第 9 节 |
| 数学工具库（卡片墙 / 卡片页 / 引用弹窗） | `layouts/courses/{tools,toolcard}.html`、`_partials/{card-ref,toolbox-*}.html`、`assets/js/toolbox.js`、`11-toolbox.css` | [`docs/features.md`](docs/features.md) 第 3 节 ㉑ |
| 数学库（跨课程卡片索引，大类 → 细分 → 卡片三级） | `content/library/_content.gotmpl`（页面生成）、`layouts/library/{library,library-branch,library-section}.html`、`data/math-branches.yaml`（分支归属，**非生成产物**） | [`docs/features.md`](docs/features.md) 第 3 节 ㉒ |
| 单页的左侧跟随目录 | `layouts/_partials/{toc-rail,extend_post_content}.html`、`assets/js/toc-rail.js`、`12-toc-rail.css` | [`docs/features.md`](docs/features.md) 第 3 节 ㉓ |
| 新内容脚手架 / 删除 | `scripts/new-content.sh` | [`docs/content.md`](docs/content.md) |
| 标签词表 | `data/taxonomy.yaml`、`scripts/check-tags.sh` | 同上 |
| 本地管理页（新建 / 编辑 / 发布 / 体检面板 / 命令面板 `Ctrl+K` / 插图） | `tools/admin/`（`start.sh`/`server.mjs`/`lib/`/`ui/`） | [`docs/admin.md`](docs/admin.md) |
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

跑完构建后单独校验：`check-sections.sh`、`check-frontmatter.sh`、`check-tags.sh`、`check-editor-schema.mjs`、`check-katex-pairing.sh`、`check-links.mjs`、`report-size.sh --fresh`；公式相关的都在**构建前**跑：`node scripts/fix-math-escapes.mjs`（机械修复，`--fix` 修、`--selftest` 自测规则）、`node scripts/check-math-syntax.mjs`（快检）、`node scripts/check-math-katex.mjs`（真检，`--selftest` 自测机制；`--fix` 验证后才写盘地修双重转义）。

## 6. 别做

- 不要改 `themes/PaperMod/`，也不要复制整份主题模板（两处例外见规则 5）
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
| 内容结构、front matter、`cascade`、标签词表、脚手架参数、附件 | [`docs/content.md`](docs/content.md) |
| 评论 / 系列 / 筛选框 / 相关内容 / 搜索索引 / 项目面板等具体功能 | [`docs/features.md`](docs/features.md) |
| 公式渲染、passthrough 定界符、升级 Hugo、公式显示错乱 | [`docs/formulas.md`](docs/formulas.md) |
| 管理页（类型分组、字段表、体检面板、命令面板、插图、安全边界、`.bat`） | [`docs/admin.md`](docs/admin.md) |
| 遇到怪现象、不确定某个机制为什么这样写 | [`docs/traps.md`](docs/traps.md) |

**保持本文件精简**：新知识写进对应的 `docs/` 文件，这里只在「这是一条每次都必须遵守的规则」时才加一行，并附上指针。
