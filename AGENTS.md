# Skyrim 的博客 — AI 助手须知

Hugo 静态博客（中文）。本文件只放**每次动手都要遵守的规则 + 去哪找细节的指针**；机制、原因、实测数据都在 `docs/` 里，按第 7 节的索引**按需读单个文件**，不要通读全部。

## 1. 基本事实

- Hugo **0.165.0** extended + PaperMod 主题（**vendored** 在 `themes/PaperMod/`，不是 submodule）。版本钉的唯一事实源是 `.github/actions/validate/action.yml`
- `baseURL` 带子路径 `/my-blog/` —— 资源引用用 `absURL`/relref 或相对路径，**不要硬编码域名**
- 内容三类：**文章**（`content/posts/<slug>/index.md`）、**课程**（课程 → 章 → 材料页）、**项目**（默认平铺单页）
- 部署：push `main` → GitHub Actions `deploy.yml` → 校验 + 构建 → Pages。**校验与构建的唯一定义在 `.github/actions/validate/action.yml`**（`checks.yml` 与 `deploy.yml` 共用）
- 推送固定入口：`bash scripts/push-blog.sh "feat: 说明"`（自己跑校验、构建、commit、push；校验不过就中止，不推）

## 2. 硬规则

1. **内容一律走脚手架**：`bash scripts/new-content.sh <post|course|chapter|notes|homework|lab|project|sub|doc|section|remove>`，或用 `/new-post`、`/new-course`、`/new-project`、`/admin`，或双击 `启动管理页.bat`。**不要用 Write 直接创建内容文件、不要手抄 front matter**——`archetypes/` 是唯一事实源，手抄必然漂移。**删除也走 `remove`**（它有 bundle、section 根与 `_index.md` 的护栏：section 列表页不能单独删），不要手敲 `rm`
2. **标签只从 `data/taxonomy.yaml` 取**，不要手打；新词加 `--new-tag`（脚本自动写回词表）。词表格式被 shell grep 解析，**不要改成嵌套 YAML**
3. **标签只打在 regular page 上**：section 页（课程主页、章节入口页、项目页、子项目页）写 `tags`/`categories` 是**无效且有害**的（`/tags/` 计数虚高、词条页里却不出现）。课程/项目的标签写在主页的 `cascade` 里并加 `target: {kind: page}`；写作用范围用 **`target`**，不要用已弃用的 `_target`
4. **`cascade` 只填空、不合并**：子孙页一旦自己写了 `tags`（**空数组也算「已定义」**），继承来的标签会被**整体丢弃**。所以课程材料页与分层项目的子项目页/文档页**不要写 tags**
5. **不要整份复制主题模板**。用主题 hook：覆盖 `layouts/_partials/` 下的 `extend_head.html` / `extend_footer.html` / `extend_post_content.html` / `comments.html` 即生效。新建自定义 partial 放 `layouts/_partials/`（带下划线），不要用 `layouts/partials/` 或 `layouts/_default/`。**两处有意的整份覆盖**：`layouts/courses/{course,chapter}.html` 与 `layouts/index.json`
6. **JS 放 `assets/js/*.js`**，由 `extend_head.html` 用 `resources.Get | minify | fingerprint` 接线外链；不要内联 `<script>`（无 lint、无压缩、内联 defer 无效）。**CSS 放 `assets/css/extended/`**，一个职责一个文件、用 `NN-` 前缀控制合并顺序；模板里不要写 `<style>`
7. **面向访客的文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}`；JS 里的文案走自己 `<script>` 标签的 `data-*` 属性（模板侧用 `i18n` 填值），不要硬编码中文
8. **复用主题 CSS 变量**（`--theme`/`--border`/`--secondary` 等）；暗色适配用 **`[data-theme="dark"]`**（主题机制是 `<html>` 上的属性），写 `.dark` 永远不触发
9. **配置一律进 `hugo.toml`**，模板里读 `site.Params.xxx`；`timeZone = 'Asia/Shanghai'` 与 `[outputs] home` 的 `'JSON'` **勿删**（前者决定当天文章能否上线，后者决定搜索是否可用）
10. **主题已提供的东西不要自己写**：先 grep `themes/PaperMod/layouts/` 与 `themes/PaperMod/assets/css/`。**`themes/PaperMod/` 不直接改**，要扩展行为优先用 hook，其次在 `hugo.toml` 找开关
11. **能问工具的就不要自己实现**：页面 URL 问 `hugo list all`（它输出每页 `path,permalink`），front matter 模板认 `archetypes/`，词表格式认 `data/taxonomy.yaml`
12. **新增校验加进 `.github/actions/validate/action.yml`**（不要在某个 workflow 里单独写，否则 `checks.yml` 与 `deploy.yml` 分叉），并想清楚是**阻断**（内容正确性：缺 front matter、坏链、公式错版）还是**只警告**（内部一致性：词表、编辑器字段表）
13. **改 URL 需谨慎**：URL 由 `[permalinks]`、目录名、文章标题（`:slug` 取自标题）决定。giscus 用 `mapping='title'`，所以**改标题既换 URL 又丢评论关联**；改目录名只换 URL。管理页的 `slug` 字段可把文章 URL 固定下来
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
| 数学公式（构建期 KaTeX） | `layouts/_markup/render-passthrough.html`、`static/katex/` | [`docs/formulas.md`](docs/formulas.md) |
| 公式转义（`\*` → `*`）自动修复 | `scripts/fix-math-escapes.mjs`（管理页保存/新建与 `push-blog.sh` 都调它） | 同上 |
| 新内容脚手架 / 删除 | `scripts/new-content.sh` | [`docs/content.md`](docs/content.md) |
| 标签词表 | `data/taxonomy.yaml`、`scripts/check-tags.sh` | 同上 |
| 本地管理页 | `tools/admin/`（`start.sh`/`server.mjs`/`lib/`/`ui/`） | [`docs/admin.md`](docs/admin.md) |
| 校验与 CI | `.github/actions/validate/action.yml`、`scripts/check-*.sh`、`report-size.sh` | [`docs/architecture.md`](docs/architecture.md) |

**主题本身已提供**（不要重复实现）：明暗切换、TOC、面包屑、上下篇、代码复制、阅读时间、返回顶部（`#top-link`）、OG/JSON-LD/hreflang、robots.txt 与 sitemap。

## 5. 常用命令

```bash
bash tools/admin/start.sh                  # 本地管理页（新建/编辑/发布 + 内嵌预览）
bash scripts/preview.sh                    # 纯本地预览（含草稿）http://localhost:1313/my-blog/
hugo --minify --gc --cleanDestinationDir   # 生产构建（--cleanDestinationDir 不能省）
bash scripts/push-blog.sh "feat: 说明"     # 公式转义自动修复 → 校验 → 构建 → commit → push（固定入口）
bash scripts/upgrade-hugo.sh <版本>        # 同步升级 Hugo + 配对的 KaTeX 样式
```

跑完构建后单独校验：`check-sections.sh`、`check-frontmatter.sh`、`check-tags.sh`、`check-editor-schema.mjs`、`check-katex-pairing.sh`、`check-links.mjs`、`report-size.sh --fresh`。

## 6. 别做

- 不要改 `themes/PaperMod/`，也不要复制整份主题模板（两处例外见规则 5）
- 不要把管理页界面资源放进 `assets/**`；不要在 `tools/admin/ui/` 之外放界面文件
- **不要在 `.bat` 里写中文**（`启动管理页.bat` 现在一个非 ASCII 字节都没有，请保持；必须 CRLF、无 BOM）
- 不要把 `static/katex/katex.min.css` 与 `fonts/` 分到不同目录（CSS 用相对路径找字体）
- 不要新建 `content/tags.md` 之类带 `url` 的普通页去覆盖 taxonomy 总览页
- 不要 `rm` 内容文件、不要手写 front matter、不要在模板里硬编码中文文案或域名
- `scripts/*.sh` 与 `data/*.yaml` 必须保持 **LF**（`.gitattributes` 已钉住）；内容 `.md` 允许 CRLF
- 不要把裸 `$` 写进正文（会被当公式、构建直接失败），详见 [`docs/formulas.md`](docs/formulas.md)
- 数学里写裸 `*`（如 `$R^*$`），**不要**写成 `\*`：KaTeX 没这个命令，一处就让构建失败（散文里的 `\*` 转义不受影响；发布与管理页保存会自动修，见 [`docs/formulas.md`](docs/formulas.md) 第 3 节）

## 7. 文档索引：改 X 前先读 Y

| 要改的东西 | 先读 |
|---|---|
| 目录布局、`hugo.toml` 任一项、CI / 部署 / 新增校验 | [`docs/architecture.md`](docs/architecture.md) |
| 内容结构、front matter、`cascade`、标签词表、脚手架参数、附件 | [`docs/content.md`](docs/content.md) |
| 评论 / 系列 / 筛选框 / 相关内容 / 搜索索引 / 项目面板等具体功能 | [`docs/features.md`](docs/features.md) |
| 公式渲染、passthrough 定界符、升级 Hugo、公式显示错乱 | [`docs/formulas.md`](docs/formulas.md) |
| 管理页（含新建面板的类型分组、字段表、安全边界、`.bat`） | [`docs/admin.md`](docs/admin.md) |
| 遇到怪现象、不确定某个机制为什么这样写 | [`docs/traps.md`](docs/traps.md) |

**保持本文件精简**：新知识写进对应的 `docs/` 文件，这里只在「这是一条每次都必须遵守的规则」时才加一行，并附上指针。
