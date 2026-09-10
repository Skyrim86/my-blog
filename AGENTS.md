# Skyrim 的博客 — 项目架构文档（供 AI 助手阅读）

> 本文档面向 AI 编码助手：当你被要求为本博客添加新功能时，先读完本文，按文中"约定"一节动手，不要重新发明已有机制。
> 最后更新：2026-09-09

## 1. 项目概览

- **类型**：Hugo 静态博客（中文，zh-CN）
- **主题**：PaperMod，**vendored**（直接提交在 `themes/PaperMod/`，无 submodule、无 go.mod），要求 Hugo ≥ 0.146 的新模板结构（`layouts/_partials/`，无 `_default/`）
- **Hugo 版本**：本地与 CI 均为 **0.165.0**（extended），版本已在 `deploy.yml` 中固定，不要随意升级
- **部署**：GitHub Pages，URL 为 `https://skyrim86.github.io/my-blog/`（注意 **baseURL 带子路径 `/my-blog/`**，所有绝对链接和资源引用都会带此前缀）
- **仓库**：`skyrim86/my-blog`，主分支 `main`

## 2. 目录结构

```
my-blog/
├── hugo.toml                  # 唯一配置文件（无 config/ 目录分段）
├── archetypes/default.md      # 新文章 front matter 模板（含注释掉的 series 字段）
├── assets/
│   ├── css/extended/          # 自定义 CSS（主题自动 Concat + minify，按文件名排序）
│   │   ├── 01-cards.css       #   文章列表卡片
│   │   ├── 02-typography.css  #   中文排版
│   │   └── 03-widgets.css     #   返回顶部 + 系列导航
│   └── js/                    # 自定义 JS 源码（经 extend_head.html minify+fingerprint 后外链）
│       ├── back-to-top.js     #   返回顶部按钮
│       └── giscus-theme-sync.js # Giscus 主题跟随
├── i18n/zh.toml               # 站点级 UI 文案（与主题 i18n 合并，同名覆盖）
├── layouts/_partials/         # 全部自定义模板（注意是 _partials 带下划线）
│   ├── extend_head.html       # 覆盖主题 hook：仅做 JS 资产接线，不含逻辑
│   ├── extend_post_content.html # 覆盖主题 hook：注入系列文章导航
│   ├── series-posts.html      # 系列文章导航组件（文案走 i18n）
│   └── comments.html          # Giscus 评论组件（覆盖主题同名 partial）
├── content/
│   ├── about.md               # 关于页（url: /about/）
│   ├── archives.md            # 归档页（layout: archives）
│   ├── search.md              # 搜索页（layout: search, url: /search/）
│   ├── tags.md                # 标签页（layout: tags, url: /tags/）
│   ├── courses/_index.md      # 课程 section 列表页（url: /courses/）
│   └── posts/<slug>/index.md  # 文章用 Page Bundle（cover 图放同目录）
├── static/
│   ├── images/avatar.png      # 首页头像（profileMode 引用）
│   ├── images/site-cover.png  # 默认 OG 分享图（params.images 引用）
│   ├── BingSiteAuth.xml       # Bing 站长验证
│   └── googledfe2280ece06bc5c.html  # Google Search Console 验证
├── .github/workflows/deploy.yml  # GitHub Actions 部署
└── themes/PaperMod/           # vendored 主题，不要直接修改
```

`public/`（构建产物）、`resources/`（Hugo 缓存）、`.hugo_build.lock` 均不入库；`data/`、`i18n/` 目前不存在（Hugo 允许缺失）。

## 3. hugo.toml 配置要点

| 配置段 | 说明 |
|---|---|
| 全局 | `baseURL` 带 `/my-blog/` 子路径；`hasCJKLanguage = true`（中日韩分词，影响摘要与字数统计）；`enableEmoji`、`enableRobotsTXT`、`enableGitInfo`（文章显示 Git 最后修改时间）均开启 |
| `[frontmatter]` | `lastmod` 优先取 Git 提交时间 |
| `[taxonomies]` | 三套分类法：`tags`、`categories`、**`series`（自定义，支撑系列导航功能）** |
| `[outputs]` | 首页输出 `HTML + RSS + JSON`，**JSON 索引供 Fuse.js 搜索使用**，勿删 |
| `[permalinks]` | 文章 URL 格式 `/:year/:month/:slug/`（如 `/2026/09/我的第一篇文章/`）；改动会破坏已发布链接 |
| `[params]` | `env='production'`、`defaultTheme='auto'`（跟随系统明暗）、开启阅读时间/TOC(默认展开)/面包屑/上下篇/代码复制/RSS 按钮；分享按钮关闭；`images=['images/site-cover.png']` 为默认 OG 图；`DateFormat='2006年1月2日'` |
| `[params.cover]` | `responsiveImages`、`linkFullImages`（点击封面看原图）开启 |
| `[params.giscus]` | 评论系统全部参数；`mapping='title'` 按文章标题关联 Discussion（非 pathname）；`theme='light'` 是初始值，实际由同步脚本动态切换 |
| `[params.profileMode]` | **首页是 Profile Mode**（个人名片 + 3 个按钮：文章/标签/关于），不是普通文章列表 |
| `[params.fuseOpts]` | Fuse.js 搜索权重：`['title','permalink','summary','content']` |
| `[[menu.main]]` | 7 个导航项：首页(10)/**课程(15)**/文章(20)/归档(30)/标签(40)/搜索(50)/关于(60) |
| `[markup.highlight]` | monokai 主题，行号开启 |
| `[imaging]` | 图片质量 75、lanczos |
| `[security.exec]` | 允许 git 等 exec（GitInfo 需要） |

## 4. 功能清单与实现位置

### 4.1 主题内置（PaperMod 提供，勿重复实现）
- 明暗切换（`auto/light/dark`，用户偏好存 `localStorage['pref-theme']`，auto 模式按系统给 `<body>`/`<html>` 加 `dark` class）
- 响应式明暗切换的 CSS 变量：`--theme`、`--content`、`--border`、`--secondary`、`--primary`、`--code-bg` 等，自定义样式请复用这些变量
- TOC、面包屑、上下篇导航、代码复制按钮、阅读时间
- SEO：Open Graph/Twitter meta、`templates/schema_json.html`（JSON-LD）、hreflang
- `robots.txt` 与 `sitemap.xml` 生成（`hugo.IsProduction` 判断，生产环境不 Disallow）

### 4.2 自定义功能

**① 返回顶部按钮** — `assets/js/back-to-top.js`
- JS 动态 `createElement('button')`（id `#back-to-top`），滚动 >400px 显示，rAF 节流
- 由 `extend_head.html` 接线加载；样式在 `03-widgets.css` 第 1 节

**② Giscus 评论** — `layouts/_partials/comments.html`（覆盖主题同名 partial）
- 参数全部读自 `hugo.toml [params.giscus]`，由 `params.comments=true` 全局启用
- **主题同步机制**（`assets/js/giscus-theme-sync.js`）：Giscus iframe 里的主题不会自动跟随站点，此脚本三路监听：MutationObserver 观察 `body/html` class 变化、监听主题按钮点击（延迟 50ms 再同步）、轮询最多 30s 等懒加载 iframe 出现；每次同步向 `https://giscus.app` postMessage `setConfig`，并 600ms 后重发一次兜底
- 主题信号源优先级：`localStorage['pref-theme']` → body/html 的 `dark` class → `prefers-color-scheme`

**③ 系列文章导航** — `layouts/_partials/series-posts.html` + `extend_post_content.html`
- 文章 front matter 写 `series: ['系列名']` 即生效
- 渲染为可折叠 `<details open>` 列表：同系列全部文章按日期排序，当前篇加 `class="current"` 加粗高亮
- 标题文案来自 `i18n/zh.toml` 的 `seriesTitle` key
- 通过 `extend_post_content.html` hook 注入（文章正文后、footer 前）；样式在 `03-widgets.css` 第 2 节

**④ 中文排版优化** — `02-typography.css`：PingFang/雅黑字体栈、行高 1.85、两端对齐、标题行高收紧、中文不斜体等

**⑤ 列表卡片化** — `01-cards.css`：文章列表项圆角+阴影+悬浮上浮，含暗色模式适配

## 5. 约定（添加新功能必读）

1. **永远不要整份复制主题模板来覆盖**（如 copy `single.html`）。PaperMod 提供的 hook（覆盖 `layouts/_partials/` 下同名文件即可生效）：
   - `extend_head.html` — `<head>` 末尾，加 CSS/JS
   - `extend_footer.html` — footer 末尾
   - `extend_post_content.html` — 文章正文之后
   - `comments.html` — 评论区整体替换
   - 其他 partial（`post_meta.html` 等）也可覆盖，但优先找 hook
   - 新建自定义 partial 一律放 `layouts/_partials/`（带下划线），不要用旧的 `layouts/partials/` 或 `layouts/_default/`
2. **JS 一律放 `assets/js/*.js`，由 `extend_head.html` 用 `resources.Get | minify | fingerprint` 接线外链**；不要往模板里写内联 `<script>`（无法 lint、无压缩、内联 defer 无效）。脚本按 defer 语义编写：执行时 DOM 已就绪
3. **自定义 CSS 放 `assets/css/extended/`**，一个职责一个文件，用 `01-`/`02-`/`03-` 数字前缀控制合并顺序（主题会 Concat + minify 成单文件）；模板中不要写 `<style>`
4. **面向访客的 UI 文案放 `i18n/zh.toml`**，模板用 `{{ i18n "key" }}` 引用；不要在模板里硬编码中文文案
5. **复用主题 CSS 变量**（`--theme`/`--border`/`--secondary` 等），并始终为 `.dark` 写暗色适配——站点 `defaultTheme='auto'`
6. **配置一律进 `hugo.toml`**，模板里通过 `site.Params.xxx` 读取，不要在模板中硬编码
7. 文章放 `content/posts/<slug>/index.md`（Page Bundle），封面图 `cover.image` 放同目录；新文章从 `archetypes/default.md` 的结构复制 front matter。**课程与文章结构相同**，放 `content/courses/<slug>/index.md`（`content/courses/_index.md` 是列表页本身）
8. URL 变更需谨慎：permalinks 和 `mapping='title'` 的 giscus 都对路径/标题敏感，改名会丢评论关联
9. `themes/PaperMod/` 不直接改；如需扩展主题行为，优先用 hook，其次在 `hugo.toml` 找开关
10. 涉及 `baseURL` 的资源引用用 Hugo 的 `absURL`/relref 或相对路径，勿硬编码域名（站点在 `/my-blog/` 子路径下）

## 6. 本地开发与部署

```bash
hugo server -D        # 本地预览（含草稿），http://localhost:1313/my-blog/
hugo --minify --gc    # 生产构建，输出到 public/
```

部署全自动：push 到 `main` → GitHub Actions（`deploy.yml`）→ checkout(fetch-depth:0，GitInfo 需要) → Setup Hugo 0.165.0 extended → `hugo --minify --gc` → 上传 artifact → `actions/deploy-pages@v4`。无手动步骤。

## 7. 已知事项 / 陷阱

- Giscus 用 `mapping='title'`：**改文章标题 = 丢评论**；换回 pathname 前需权衡
- 首页是 Profile Mode，改首页布局要去 `[params.profileMode]`，不是普通 list 模板
- 搜索依赖首页 JSON 输出（`[outputs] home` 的 `'JSON'`），删掉即搜索失效
- `enableGitInfo` 依赖完整 git 历史（CI 的 `fetch-depth: 0` 勿删）
- 旧 git 历史中部分中文 commit message 是 GBK 编码（显示乱码），仅影响历史可读性；新提交请保持 UTF-8
