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
│   ├── css/extended/          #   自定义 CSS，主题自动 Concat + minify，**按文件名字典序**合并（每页都吃）
│   │   ├── 00-theme.css       #     设计令牌（配色/圆角/阴影）+ 站点背景图层 + 压背景文字的底衬
│   │   ├── 01-cards.css       #     文章列表卡片
│   │   ├── 02-typography.css  #     中文排版
│   │   ├── 03-widgets.css     #     系列导航
│   │   ├── 04-course.css      #     章节目录 + 入口卡片 + 附件下载
│   │   ├── 05-project.css     #     项目元信息（技术栈 + 仓库链接）
│   │   ├── 06-terms-filter.css#     词条筛选框
│   │   ├── 07-related.css     #     相关内容区块
│   │   ├── 08-reader.css      #     阅读进度条 + 目录当前项 + 正文卡片 + 代码块标题条
│   │   ├── 10-nav.css         #     窄屏导航折叠（配合 assets/js/nav-toggle.js）
│   │   ├── 11-toolbox.css     #     数学工具卡片墙 + 正文引用弹窗
│   │   ├── 12-toc-rail.css    #     单页左侧跟随目录
│   │   ├── 13-ornament.css    #     装饰层：标题竖线 / 分隔线菱形 / 页脚渐隐线 / 头像光环（第 3 节 ㉔）
│   │   ├── 14-mascot.css      #     右下角看板娘（第 3 节 ㉕）
│   │   ├── 15-extras.css      #     404 页 + 页脚 RSS 入口
│   │   ├── 16-list-tools.css  #     列表排序与标签筛选条（配合 assets/js/list-tools.js）
│   │   ├── 17-a11y.css        #     跳过导航链接 + .sr-only（见 features.md 第 4 节的第 7 处覆盖）
│   │   ├── 18-bg-switch.css   #     顶栏背景套切换按钮（配合 assets/js/bg-switch.js，见 ⑫）
│   │   ├── 19-nav-px.css      #     导航栏像素小人的盒子（图由 tools/icons/make-icons.py 生成，见第 6 节）
│   │   ├── 20-theme-fade.css  #     明暗切换的过渡（施加时机在 assets/js/theme-fade.js）
│   │   ├── 22-reveal.css      #     滚动出现动画（配对脚本：assets/js/reveal.js）
│   │   ├── 26-lightbox.css    #     正文图片灯箱（配对脚本：assets/js/lightbox.js）
│   │   └── 27-bento.css       #     关于页的拼贴 Bento（模板 _shortcodes/bento.html，数据 data/about-bento.yaml）
│   ├── css/decks/             #   **只有首页与收藏库**加载（extend_head.html 按页条件外链，见 features.md 追加十）
│   │   ├── 20-card-ornaments.css # **生成物**：卡面纹样令牌（data-URI SVG，由 tools/cards/make-ornaments.py 产出，不要手改）
│   │   ├── 21-card-deck.css   #     首页卡片组 + 收藏库卡片墙 + 3D 弹层
│   │   └── 21-card-styles.css #     **生成物**：data/card-styles.yaml 出的工艺令牌（tools/cards/render-styles.mjs）
│   ├── css/home/              #   **只有首页**加载（同上；09-home 与 23-splash 的类只出现在首页）
│   │   ├── 09-home.css        #     首页头像光环 / 快捷入口 / 站点规模 / 时间卡 / 最近更新 / 两栏布局
│   │   └── 23-splash.css      #     入站揭幕遮罩（结构在 _partials/deck-splash.html，退场在 home-deck.js）
│   ├── css/view-transition.css  # 切页转场（原生 View Transitions）。**不压缩、单独外链**，刻意不放进 extended/、decks/、home/
│   ├── fonts/                 #   自托管字体：rose-clock.woff2（首页时钟数字子集）+ LICENSE + 子集做法的 README
│   ├── images/
│   │   ├── avatar.jpg         #   首页头像（**必须放 assets/**，否则 120×120 被静默忽略）
│   │   ├── mascot.webp        #   右下角看板娘半身像（从 tools/backgrounds/ 那份素材抠出来，见 ㉕）
│   │   ├── ayaka-home.webp    #   首页看板娘的备选形态（生成器 tools/backgrounds/make-ayaka-home.py，当前首页不调用）
│   │   ├── bg-night-city.webp #   背景套「城市」的深色主题：夜景城市照片（见 docs/features.md ⑫）
│   │   ├── bg-daylight-city.webp # 背景套「城市」的浅色主题：日间城市照片（见 ⑫）
│   │   ├── bg-night-girl.webp    # 背景套「黑长直少女」的深色主题（默认套，见 ⑫）
│   │   ├── bg-daylight-girl.webp # 背景套「黑长直少女」的浅色主题（见 ⑫）
│   │   ├── bg-daylight-sky.webp  # 浅色主题备选背景（程序生成，当前未使用，见 ⑫）
│   │   ├── bg-velvet-night.webp  # 深色主题备选背景（程序生成，当前未使用，见 ⑫）
│   │   ├── cards/             #   卡面生成物：63 张 <角色>-<编号>.webp（tools/cards/make-cards.py）
│   │   │   └── depth/         #   同一批卡的浮雕高度图（tools/cards/make-depth.py，3D 查看器读它）
│   │   ├── nav/               #   导航栏像素小人 ×8（生成产物：tools/icons/make-icons.py，见第 6 节）
│   │   └── covers/            #   列表卡片封面（生成产物：tools/covers/make-covers.py）
│   └── js/                    #   自定义 JS 源码，经 extend_head.html minify+fingerprint 后外链
│       ├── a11y-announce.js      # 搜索结果的读屏播报（只挂搜索页，见 features.md 第 4 节）
│       ├── a11y-controls.js      # 主题硬编码英文可访问名的本地化（全站加载，见 features.md ㉞）
│       ├── bg-switch.js          # 背景套切换按钮（注入顶栏，偏好存 localStorage['pref-bg']，见 ⑫）
│       ├── card-3d.js            # 卡片 3D 查看器：弹层里那张卡可自由转动（有厚度、带浮雕）
│       ├── deck-wall.js          # 收藏库 /collection/ 的卡片墙：三排筛选 + 格子升级成按钮 + 开弹层
│       ├── giscus-theme-sync.js  # Giscus 主题跟随（只在实际有评论区的页面加载）
│       ├── header-sticky.js      # 顶栏吸顶后的状态标记（给 <html> 加 .is-scrolled）
│       ├── home-clock.js         # 首页时间卡：时间 / 今天与今年进度 / 本月打卡 / 今日一卡
│       ├── home-deck.js          # 首页卡片组：手动切 + 6s 自动轮播（悬停与后台暂停）
│       ├── lightbox.js           # 正文图片灯箱：点图 → 原生 <dialog> 里放大
│       ├── list-tools.js         # section / term 页的排序与标签筛选条
│       ├── nav-toggle.js         # 窄屏导航折叠（渐进增强，无 JS 时菜单照主题原样铺开）
│       ├── reading-progress.js   # 阅读进度条 + 目录高亮（只在单页加载）
│       ├── reveal.js             # 滚动出现动画：首屏之下的列表项滚进视口时淡入一次
│       ├── search-shortcut.js    # Ctrl/⌘+K 与「/」快捷键 + 搜索页 ?q= 预填
│       ├── terms-filter.js       # 标签/分类/系列总览页的词条筛选框
│       ├── theme-fade.js         # 明暗切换的过渡时机（样式在 20-theme-fade.css）
│       └── toolbox.js            # 数学/CS 卡片的引用弹窗与卡片墙筛选
├── content/                   # 站点内容（详见 docs/content.md）
│   ├── about.md  search.md                       # archives.md 已于 2026-09-15 删除（见第 3 节）
│   ├── categories/ tags/ series/ _index.md   # 三套分类法的总览页标题
│   ├── collection/            # 收藏库总览页（layout: collection）—— /collection/ 一页铺 63 张收藏卡，见 ㊿
│   ├── courses/<课程>/        # _index.md 主页 + <chapter-0N>/（notes|homework|lab 材料页）+ toolbox/（卡片页）
│   ├── library/               # 数学库的三级目录页（**不是文件**：content/library/_content.gotmpl 按分支表现算生成）
│   ├── cs/                    # CS 库索引的同名三级结构（页面由 scripts/gen-cards.mjs 生成）
│   ├── posts/<slug>/index.md  # 文章用 Page Bundle（封面图放同目录）
│   └── projects/<项目>/       # 平铺项目 index.md；CMC2026 是分层项目（section + 文档）
├── data/                      # 站点数据（模板直接读，不进 content/）
│   ├── taxonomy.yaml          #   标签 / 分类词表（**唯一事实源，要入库**）
│   ├── tag-groups.yaml        #   词条按学科分组（/tags/ 总览页分块用，见 features.md ㉛）
│   ├── libraries.yaml         #   卡片库登记表：key / label / data / path / cards / math
│   ├── math-branches.yaml     #   数学库分支表（两级：大类 → 细分，手写）
│   ├── math-toolbox.json      #   数学卡（由 tools/course-import/import_course.py 生成）
│   ├── cs-branches.yaml       #   CS 库分支表（手写）
│   ├── cs-toolbox.json        #   CS 卡（手写维护，页面由 scripts/gen-cards.mjs 生成）
│   ├── card-parents.yaml      #   卡片的主次关系：附属结论挂在哪张主卡下面
│   ├── home-cards.yaml        #   首页卡片组清单（**单一事实源**：tools/cards/make-cards.py 按它出卡面）
│   ├── about-bento.yaml       #   关于页拼贴的瓦片清单（_shortcodes/bento.html 读它）
│   └── rank-scores.json       #   卡片等级评分（由 scripts/rank-deck.py 生成）
├── i18n/zh.toml               # 站点级 UI 文案（与主题 i18n 合并，同名覆盖）
├── layouts/
│   ├── baseof.html            # 覆盖主题：跳过导航链接 + lang=zh-CN（第 7 处覆盖，见 features.md 第 4 节）
│   ├── index.json             # 覆盖主题：搜索索引（正文截断 + tags + 页内标题）
│   ├── rss.xml                # 覆盖主题：<language> 改用 .Language.Locale（第 11 处覆盖，见第 4 节）
│   ├── 404.html               # 覆盖主题：404 提示 + 返回首页/搜索/各卡片库（第 5 处覆盖）
│   ├── taxonomy.html          # 覆盖主题：词条按 data/tag-groups.yaml 分块（第 6 处覆盖）
│   ├── _default/              # 多 section 共用的 layout（见 features.md 第 4 节末段）
│   │   ├── library.html       #   卡片库总览（/library/ 与 /cs/ 共用，按 .Section 认库）
│   │   ├── library-branch.html    #   大类页（细分目录）
│   │   ├── library-section.html   #   细分页（卡片索引）
│   │   ├── toolcard.html      #   单张卡片页（数学卡与 CS 卡共用）
│   │   └── collection.html    #   收藏库总览页（layout: "collection"，见 ㊿）
│   ├── _markup/               # 渲染钩子
│   │   ├── render-passthrough.html   # 公式渲染钩子（构建期 KaTeX）
│   │   ├── render-image.html         # 覆盖主题：内容图补 width/height + PNG 转无损 WebP（第 9 处覆盖，见 ㊲）
│   │   └── render-codeblock.html     # 新增的渲染 hook：```python {filename=…} 出窗口标题条（见 ㊹）
│   ├── courses/course.html    # 课程主页模板（由 layout: course 显式命中，第 1 处覆盖）
│   ├── courses/chapter.html   # 章节入口页模板（由 layout: chapter 命中，同上）
│   ├── courses/tools.html     # 数学工具库页（卡片墙 + 索引卡，见第 3 节 ㉑）
│   ├── projects/project-home.html  # 分层项目主页模板（由 layout: project-home 命中）
│   ├── _shortcodes/           # 正文里能用的短代码
│   │   ├── course-plan.html   #   课程规划与进度（{{< course-plan >}}）
│   │   ├── card.html          #   引用一张数学/CS 卡片（渲染成索引卡 + 弹窗）
│   │   ├── tool.html          #   工具卡（正交表的行内引用）
│   │   ├── thm.html           #   定理 / 定义等环境块
│   │   └── bento.html         #   关于页的拼贴（读 data/about-bento.yaml）
│   └── _partials/             # 全部自定义模板（注意是 _partials 带下划线）
│       ├── extend_head.html   #   覆盖主题 hook：JS 接线 + KaTeX 样式 + 背景图 CSS
│       ├── extend_footer.html #   覆盖主题 hook：右下角看板娘
│       ├── extend_post_content.html  # 覆盖主题 hook：系列导航 + 附件 + 项目元信息 + 相关内容 + 目录栏
│       ├── comments.html      #   覆盖主题同名 partial（Giscus）
│       ├── google_analytics.html  #  覆盖主题缺失的 partial：**有意的空实现**（第 5 节末段）
│       ├── templates/         #   主题的模板 partial
│       │   ├── schema_json.html   # 覆盖主题：JSON-LD（第 8 处覆盖，见 ㉟）
│       │   └── opengraph.html     # 覆盖主题：og:locale（第 10 处覆盖）
│       ├── index_profile.html #   覆盖主题同名 partial：首页 hero + 右栏（第 3 处覆盖）
│       ├── post_meta.html     #   覆盖主题同名 partial：只在末尾追加一行卡片 chips（第 4 处覆盖）
│       ├── page-head.html     #   面包屑 + 标题 + 描述（课程页 / 章节页 / 项目主页共用）
│       ├── toc-rail.html      #   单页左侧跟随目录（**脚本内联在这支 partial 里**）
│       ├── card-chips.html    #   列表卡片的计数 / 技术栈 chips
│       ├── type-label.html    #   页面类型徽标文案（相关内容与首页共用）
│       ├── series-posts.html  #   系列内导航（03-widgets.css）
│       ├── related-content.html   # 相关内容区块（07-related.css）
│       ├── course-index.html  #   课程主页的章节目录
│       ├── project-index.html #   分层项目主页的子页目录（各子项目文档数 + 更新时间）
│       ├── course-downloads.html  project-meta.html
│       ├── home-scale.html    #   首页「站点规模」那行小字
│       ├── home-clock.html    #   首页「时间与时钟」面板（数字由 assets/js/home-clock.js 填）
│       ├── home-cards.html    #   首页 hero 底部的卡片组（一次一张 + 3D 弹层入口）
│       ├── home-chara.html    #   首页 hero 里的角色立绘（备选形态，**当前不调用**）
│       ├── deck-splash.html   #   首页入站揭幕遮罩（只在 .IsHome 时由 baseof.html 挂载；退场不依赖 JS）
│       ├── deck-manifest.html #   卡片清单 → 条目切片（渲染与 JS 共用的那一份数据）
│       ├── deck-filters.html  #   卡片的手绘感滤镜（**必须内联**：data-URI filter 在 WebKit 上不可靠）
│       ├── deck-wall.html     #   收藏库的卡片墙（63 张一次铺开，见 ㊿）
│       ├── lib-config.html    #   按 URL 第一段认出是哪个库，回表取配置 / 数据 / 分支表
│       ├── toolbox-wall.html  #   卡片墙：主卡 + 挂在它下面的附属结论 = 一家子一个格子
│       ├── toolbox-card.html  #   单张卡的渲染
│       ├── toolbox-teaser.html    #   正文里的卡片索引小卡（点开弹窗）
│       ├── toolbox-md.html    #   卡片正文里的引用改写（[名字](#card-…) → 卡片页地址）
│       ├── card-ref.html      #   正文里引用一张卡
│       ├── card-find.html     #   在所有库里按 id 或名字/别名找一张卡
│       ├── card-href.html     #   卡片 id → 卡片页地址
│       └── card-rel.html      #   卡片的主次关系（data/card-parents.yaml）
├── scripts/                   # 内容与 CI 工具（bash / Node，零依赖）
│   ├── new-content.sh         # 新内容脚手架 + 删除（唯一实现）
│   ├── check-frontmatter.sh   # 阻断：front matter 与 section/material 的 tags 规则
│   ├── check-sections.sh      # 阻断：每个 section 目录必须有 _index.md（列表页）
│   ├── fix-math-escapes.mjs   # 公式机械修复（\* → *、§ → \S、圈号 → \text{\textcircled{N}}）：默认只检查（阻断），--fix 自动修正，--selftest 自测规则
│   ├── check-math-syntax.mjs  # 阻断：公式内容预检（嵌套 $、行内 $ 为奇数、JSON 双重转义指纹）
│   ├── check-math-katex.mjs   # 阻断：公式真检（Hugo 内嵌 KaTeX 逐条试渲染；--selftest 自测机制，--fix 验证后才写盘地修双重转义）
│   ├── check-tags.sh          # 只警告：标签词表比对
│   ├── check-katex-pairing.sh # 阻断：KaTeX 样式与 Hugo 内嵌版本是否配对
│   ├── check-links.mjs        # 阻断：站内链接与锚点（同站绝对链接也在内）
│   ├── check-css-split.mjs    # 阻断：按页拆包的接线与产物是否一致（谁带卡片类就得带卡片表）
│   ├── check-seo.mjs          # 只警告：sitemap / robots / 首页 meta / RSS / 页面 JSON-LD 的产物体检
│   ├── check-editor-schema.mjs# 只警告：archetypes 与管理页字段表的漂移
│   ├── check-consistency.mjs  # 阻断：三处校验清单 / 阻断口径 / 时区 / front matter 键表的漂移
│   ├── check-cards.mjs        # 阻断：卡片数据的字段与 id 唯一性（两个库一起查）
│   ├── check-deck.mjs         # 阻断：卡片组的清单 vs 源图 vs 产物 vs CSS 类，以及纹样令牌
│   ├── gen-cards.mjs          # 阻断（--check）：从 data/<库>.json 生成卡片页（CS 库用）
│   ├── rank-deck.py           # 生成 data/rank-scores.json（卡片等级评分，不参与 CI）
│   ├── report-size.sh         # 阻断：页面体积预算（raw 与 gzip 双轨；--fresh 消除 public/ 陈旧产物影响）
│   ├── push-blog.sh           # 一键公式转义自动修复 + 构建 + 校验 + 提交 + 推送
│   ├── preview.sh             # 本地预览（hugo server -D，HUGO_BASEURL 指本机，见 traps.md 第 3 节）
│   ├── upgrade-hugo.sh        # Hugo + KaTeX 一键同步升级
│   └── pin-actions.mjs        # 把 Actions 的 uses 从可变标签改成 commit SHA
├── tools/icons/               # 图标生成（见第 6 节；不参与 Hugo 构建）
│   ├── make-icons.py          #   生成 static/ 下的全部图标 + 管理页图标
│   ├── source-ojou-chibi.png  #   站点图标素材（Q 版黑长直少女，出处见第 6 节）
│   └── source-ayaka-chibi.png #   管理页图标素材（Q 版神里绫华，两条线互不影响）
├── tools/covers/              # 列表卡片封面生成（不参与 Hugo 构建）
│   └── make-covers.py         #   渐变 + 底纹 + 标题字，写 assets/images/covers/*.webp
├── tools/backgrounds/         # 背景图与看板娘生成（不参与 Hugo 构建）
│   ├── make-backgrounds.py    #   站点背景：日间城市照片 + 夜景城市照片 + 两张程序生成备选（`--frost` 时额外生成管理页霜雪备选）
│   ├── make-admin-bg.py       #   管理页绫华插画 → 深/浅两版（见 docs/admin.md §20）
│   ├── make-mascot.py         #   站点图标素材 → 右位看板娘透明图（白底抠图：色差切背景 + 去污染 + 预乘缩放，见 features.md ㉕）
│   ├── make-mascot-left.py    #   左位看板娘生成器（**该看板娘已于 2026-09-18 从站点移除**，脚本与源图保留以便再生成，见 features.md ㉕）
│   ├── make-ayaka-home.py     #   首页绫华的备选形态（生成 assets/images/ayaka-home.webp，当前不调用）
│   ├── source-night-city.jpg  #   深色背景的底图（夜景城市，358 KB，出处见 features.md ⑫）
│   ├── source-daylight-city.jpg # 浅色背景的底图（日间城市，2048×1365，346 KB，Unsplash，同上）
│   ├── source-mascot-left.jpg #   左位素材来源（113 KB，当前未使用）
│   ├── source-girl-day.jpg    #   「黑长直少女」套的日间源图（出处见 features.md ⑫）
│   ├── source-girl-night.jpg  #   同上，夜间源图
│   ├── source-ayaka-*.png|jpg #   管理页绫华的素材四张（透明围裙 / 和服 / 持剑 / 头纱，见 docs/admin.md §20）
│   └── source-lady-slice.webp #   「夜城 + 提灯少女」那版的切片（**图与生成函数 2026-09-21 已删**，切片留着：它是卡片出处清单里的一项，见 features.md ⑫）
├── tools/cards/               # 卡面生成（不参与 Hugo 构建；依赖见 tools/requirements.txt）
│   ├── fetch-sources.py       #   按清单把源立绘下载到 sources/（只跑一次，不参与出图）
│   ├── make-cards.py          #   按 data/home-cards.yaml 出 63 张卡面 → assets/images/cards/*.webp
│   ├── make-depth.py          #   同一批卡的浮雕高度图 → assets/images/cards/depth/
│   ├── make-ornaments.py      #   卡面纹样令牌 → assets/css/decks/20-card-ornaments.css（**生成物，不要手改**）
│   ├── sources/               #   55 张源立绘（清单里用到的那批 + 备用的）
│   └── requirements-depth.txt #   高度图那条线的额外依赖
├── tools/course-import/       # 课程项目 → 博客内容 + 数学卡（import_course.py，**生成产物不要手改**）
├── tools/wiki-publish/        # 知识库（仓库外）→ 带 source: wiki 标记的卡片（publish.py，见 AGENTS 规则 16）
├── tools/admin/               # 本地管理页（零依赖 Node 服务 + 原生前端，不参与 Hugo 构建）
│   ├── start.sh               #   启动器（.bat 调它）
│   ├── server.mjs             #   HTTP 服务：静态页 + JSON API
│   ├── lib/                   #   content / frontmatter / taxonomy / git / hugo / exec / checks
│   └── ui/                    #   index.html + app.js + style.css + ayaka.ico
├── tools/requirements.txt     # Python 生成器的依赖（Pillow / numpy / opencv，只在本地用，见第 6 节）
├── static/                    # 原样发布（无内容指纹）
│   ├── images/site-cover.jpg  #   默认 OG 分享图（头像不在这里，见 assets/images/）
│   ├── favicon.ico  favicon-16x16.png  favicon-32x32.png  apple-touch-icon.png  safari-pinned-tab.svg
│   │                          #   全部由 tools/icons/make-icons.py 生成（见第 6 节），不要手改
│   ├── katex/                 #   自托管 KaTeX：katex.min.css + fonts/*.woff2（版本必须与 Hugo 配对）
│   └── BingSiteAuth.xml  googledfe2280ece06bc5c.html   # 站长验证
├── .github/
│   ├── actions/validate/action.yml  # 校验+构建的**唯一定义**（checks.yml 与 deploy.yml 共用）
│   ├── workflows/deploy.yml   # push main：校验 → 构建 → 部署（校验不过不部署）
│   ├── workflows/checks.yml   # PR / 非 main：只校验
│   ├── workflows/links.yml    # 每周外链检查（lychee，非阻断，查线上站点）
│   └── dependabot.yml         # 给已固定 SHA 的 Actions 留更新通道
├── .agents/commands/          # 斜杠命令（admin / new-post / new-course / new-project / preview / push-blog）
├── .editorconfig  .gitattributes  .gitignore  .lychee.toml
└── themes/PaperMod/           # vendored 主题（已剪裁，见第 5 节；不要直接修改）

```

`public/`（构建产物）、`resources/`（Hugo 缓存）、`.hugo_build.lock` 均不入库。`data/taxonomy.yaml` 是标签词表，**要入库**。

`docs/`、`tools/`、`README.md` 都在 Hugo 的构建目录之外（Hugo 只读 `content/ layouts/ static/ assets/ data/ i18n/ themes/ archetypes/` 与根配置），不会被发布到线上。

**仓库外的 `../lab/`（2026-09-19 建，2026-09-22 再归拢）**：量测脚本、候选素材与截图**一律不入库**，全部放在与本仓库并列的 `lab/` 下 —— 文档里写的 `../lab/结果/...` 指的就是它：

| 目录 | 内容 |
|---|---|
| `lab/结果/` | 性能 / 对比度 / A-B 量测脚本与结果（`perf.py`、`startjank.py`、`girlbg/`、`navtest/`、`libshot/`、`bg-shader/`、`craft-ab/`、`craft-ctl/`、`cards-412/`、`mathml-exp/`…） |
| `lab/素材/` | 抓来筛选的背景与角色候选素材（成品由 `tools/backgrounds/` 生成进 `assets/images/`） |
| `lab/站点副本/` | 手工 serve 出来的站点副本（量线上表现用；副本用完即删，按需重建） |
| `lab/转储/` | 零引用的一次性转储：旧版样式稿（`deck-styles-*.css`）、素材清单、旧版 features / traps 草稿 |
| `lab/工具/` | 一次性仪器与提取器（`extract_style_params.py`、`gen_style_yaml.py`） |
| `lab/工作树/mathml/` | **暂缓**的 MathML 实验工作树（分支 `exp/mathml`，`dc0d7e3`）；其余三个实验工作树 2026-09-22 已删，改动在 main |
| `lab/记录/` | 外部体检报告与每次清理的动作记录（`cleanup-<日期>.md`） |
| `lab/HANDOFF-*.md`、`lab/exp*.md` | 跨会话交接与实验报告的正本（`docs/exp-*.md` 是落地版，两者分工：lab 版记现场，docs 版记结论） |

此前它们是仓库旁三个平级的 `.shots/` / `.assets/` / `.serve/`，改名只为让「哪边是仓库、哪边是草稿」一眼可辨。里面那些脚本带写死的绝对路径，复跑前先读 [`traps.md` 第 4 节](traps.md)。

2026-09-22 那一轮清掉的东西：`lab/cibuild/`（落后主线的整仓克隆 39 MB）、`lab/站点副本/my-blog/`（构建副本 9.9 MB）、仓库里的 `d/DevEnv/` 事故树（26 MB，MSYS 路径没被翻译）、被文档指回却躺在临时区的证据（`craft-ab` / `craft-ctl` / `bg-shader` / `cards-412` / `mathml-exp`）—— 后者一律**迁进 `lab/结果/` 再引用**，因为临时区 72 小时自清，文档指过去会变成悬空引用。同理，量测仪器与原始数据先落 `lab/`，再写进文档。

## 3. hugo.toml 配置要点

单文件配置，没有 `config/` 分段。改任何一条都要想清楚后果：

| 配置段 | 说明 |
|---|---|
| 全局 | **`timeZone = 'Asia/Shanghai'` 必须保留**（否则当天发布的文章当天不会上线，见 [`traps.md`](traps.md)）；`baseURL` 带 `/my-blog/` 子路径；`hasCJKLanguage = true`（影响摘要与字数统计）；`enableEmoji`、`enableRobotsTXT`、`enableGitInfo`（文章显示 Git 最后修改时间）均开启；`title = 'Skyrim 的学习笔记'` **兼作首页 `<title>`**（主题 head.html 在首页直接忽略 `.Title`，`profileMode.title/subtitle` 不参与任何 head 标签），同时是导航栏品牌、页脚版权、RSS channel 标题、`og:site_name` 与 JSON-LD 的 name —— 改它等于全站改名 |
| `[frontmatter]` | `lastmod` 优先取 Git 提交时间 —— 所以首页「最近更新」的日期是「最后编辑日」，同一次提交里的页面日期相同（见 [`features.md`](features.md) ⑮） |
| `[taxonomies]` | 三套分类法：`tags`、`categories`、**`series`（自定义，支撑系列导航）**。`series` 目前零词条、`/series/` 是个空列表页，但**刻意保留**（2026-09-18 复核后定为最终决定）：要让 `/series/` 真正消失得删掉 `content/series/_index.md`，而 `new-content.sh remove` 的护栏拒绝删除 section 根目录；只删这一行更糟 —— 会留下一个普通空 section，还让 `new-content.sh post --series` 与管理页的「系列」字段变成静默无效的功能。要用连载直接用它即可。**词条页的说明**（`/tags/xxx/` 那句介绍）写在 `content/<taxonomy>/<词条>/_index.md`，目录名要与词条 URL 一致（`CMC2026` → `cmc2026`、`Go Template` → `go-template`）；词表本身不加描述字段（格式被两个脚本解析），见 [`content.md` 第 5 节](content.md#5-标签词表) |
| `[outputs]` | 首页输出 `HTML + RSS + JSON + LLMS`。**JSON 索引供 Fuse.js 搜索使用，勿删**（字段由 `layouts/index.json` 决定）。`LLMS` 产出 `public/llms.txt`（站点页面清单，给 AI 爬虫/摘要工具），模板是主题里那份递归版 `themes/PaperMod/layouts/llms.txt`，输出格式定义见同文件的 `[outputFormats.LLMS]` —— 2026-09-18 之前这个模板一直躺在仓库里但没有输出格式，**从来没产出过文件**。已知瑕疵：标了 `searchHidden` 的卡片页被模板过滤掉后，`## CS 库`、`## 数学库`、`### 数学工具库` 会剩下没有条目的空标题（模板先判「有子页」、再按 `searchHidden` 过滤链接）；模板在主题里不能改，留作已知项 |
| `[permalinks]` | 文章 URL 格式 `/:year/:month/:slug/`。改动会破坏已发布链接 |
| `[params]` | `env='production'`、`mainSections=['posts']`（文章列表与上下篇只统计文章）、阅读时间/面包屑/上下篇/代码复制/RSS 按钮开；`images=['images/site-cover.jpg']` 为默认 OG 图；`DateFormat='2006年1月2日'`；**目录三项**：`ShowToc=true`、`TocOpen=false`（页内目录默认收起）、`UseHugoToc=true`（页内目录与左侧目录栏同用 `.TableOfContents`，见 features.md ㉓）。`[params.home] recentCount = 8` 控制首页「最近更新」条数（0 = 关掉该区块）。**与主题默认等价的三个开关（`defaultTheme`/`ShowShareButtons`/`disableThemeToggle`）已刻意删掉**，不要再加回来。**一句话现状**：`posts/` 下 0 篇文章，所以凡是拿 `mainSections` 当判据的东西（首页文章列表、`ShowPostNavLinks`）目前都不产出 HTML —— 这是**预期状态**，写进第一篇即自行生效，届时不用改配置 |
| `[params.cover]` | `responsiveImages`、`linkFullImages`（点击封面看原图）开启 |
| `[params.giscus]` | 评论全部参数；`mapping='pathname'` 按 URL 关联 Discussion（2026-09-18 从 `'title'` 改来：数值分析两章的「学习笔记」「作业」同名，按标题关联会把两页的评论并成一条）；`theme='light'` 是初始值，实际由同步脚本动态切换 |
| `[params.profileMode]` | **首页是 Profile Mode**（头像 + 标题 + 副标题，无按钮）；要加按钮用 `[[params.profileMode.buttons]]` |
| `[params.fuseOpts]` | 搜索权重 `['title','permalink','summary','tags','content']`。**keys 里出现的字段必须由 `layouts/index.json` 实际输出**，改一处要同步另一处 |
| `[[menu.main]]` | 8 个导航项，weight 十进位留插入空间：首页(10)/数学库(15)/CS 库(16)/课程(20)/项目(30)/标签(60)/搜索(70)/关于(80)。**40 与 50 是空出来的**——40 原来放「文章」，2026-09-18 摘掉（`/posts/` 下 0 篇文章，点进去是空列表页，与归档页同一口径；section 与 `content/posts/_index.md` 都保留，写第一篇后按 weight=40 加回）；50 原来放「归档」，2026-09-15 删除（`mainSections=['posts']` 而当时同样 0 篇，页面渲染出来只有标题和 RSS 图标；想恢复就把 `content/archives.md` 加回来，主题自带 `layouts/archives.html`） |
| `[markup.highlight]` | monokai 主题，行号开启 |
| `[markup.goldmark.extensions.passthrough]` | 公式的 delimiters（`$`、`$$`、`\(\)`、`\[\]`）——**单 `$` 必须显式写**，passthrough 默认不含它。改这里要同步看 `layouts/_markup/render-passthrough.html` |
| `[imaging]` | 图片质量 75、lanczos |
| `[security.exec]` | `allow = ['^git$']`。原先还列着 `dart-sass-embedded` / `go` / `npx` / `postcss`，那是照抄主题默认值留下的 —— 本站没有任何 Sass、PostCSS 或 Hugo Modules 管线（`enableGitInfo` 由 go-git 直接读仓库，也不 exec）。2026-09-18 收窄；日后真要加 Sass/PostCSS，Hugo 会明确报「exec 被禁用」，按提示加回来即可 |

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

复合动作里的顺序是「先快后慢」，且**这份顺序就是权威**：

1. 校验清单一致性（阻断）→ 2. 标签词表（警告）→ 3. front matter（阻断）→ 4. 卡片页与数据一致性（阻断）→ 5. 卡片数据（阻断）→ 6. 首页卡片组清单（阻断）→ 7. section 结构（阻断）→ 8. 公式转义（阻断：规则自测 + 内容扫描）→ 9. 公式内容预检（阻断）→ 10. 公式真检（阻断：机制自测 + 逐条渲染）→ 11. 编辑器字段表漂移（警告）→ **构建** → 12. KaTeX 配对（阻断）→ 13. 体积预算（阻断）→ 14. 站内链接与锚点（阻断）→ 15. SEO 与订阅产物（含页面 JSON-LD）体检（警告）

第 12–15 项读 `public/`，所以必须排在构建之后；第 1 项只读文本文件，排最前是因为它挂了后面的检查结果就不必看。**改这份清单要同步另外两处**，否则第 1 项自己会报出来（见下）。

其中 **section 结构校验**（`check-sections.sh`）断言每个 section 目录都有 `_index.md`：列表页缺了的话，该分区的入口页（`/posts/` 这类）会在最后一个子页面被删空时静默消失，导航栏与首页指向它的链接跟着 404。判据与修法见 [`content.md`](content.md)。

**公式这一项本地会分两层自动修**（都在 `scripts/push-blog.sh` 里、都在算「工作区是否有改动」之前——这样修出来的改动才进同一次 commit）：先跑 `node scripts/fix-math-escapes.mjs --fix`（机械层：`\*` / `§` / 圈号，写操作），再跑 `node scripts/check-math-katex.mjs --fix`（验证层：JSON 双重转义，**改完试渲染通过才写盘**）。所以管理页的「发布」与命令行发布都不会被这些写法拦住；CI 只检查不修改，用来兜住绕过这两条入口的提交。详见 [`formulas.md`](formulas.md) 第 3、4.4 节。

**验证层那一趟有个前置判断**（2026-09-18 加，省 7.6 秒）：`--fix` 只对**渲染失败**的公式试候选修法，而其中唯一还没被机械层覆盖的就是 JSON 双重转义 —— 那正是 `check-math-syntax.mjs` 会报的 `doublebs` 指纹。所以 `push-blog.sh` 把这道只读的预检（约 0.14 秒）提前跑一次：**预检通过就跳过 `--fix`**（没有要修的双重转义，跑它只是把全部数学区再试渲染一遍），预检不通过才跑它。dirty 分支里复用这次结果（预检通过时之后没有任何写盘）；预检不通过时那趟 `--fix` 可能已改过文件，所以下面**重跑**一次预检，看到的是修完之后的文件。

这是一次「拿时间换覆盖面」的取舍：跳过 `--fix` 后，若出现**预检看不见、只有真检测得出**的公式错误，就失去了自动修复的机会 —— 但下面那道**阻断**的真检仍会报出来并中止推送，方向是「拦住」而不是「蒙混过去」。

**新增校验一律加进 `action.yml`**，不要在某个 workflow 里单独写，否则 `checks.yml` 与 `deploy.yml` 会分叉。同时想清楚是**阻断**还是**只警告**：内容正确性问题（缺 front matter、坏链、公式错版）阻断；内部一致性与拼写问题（词表、编辑器字段表）只警告，别让它们拦住发布。

### 校验脚本在 Windows 上要避开「每文件一串子进程」（2026-09-18）

一次推送原先要 **102 秒**，其中 `check-frontmatter.sh` 独占 **72.6 秒**、`check-sections.sh` 8.0 秒、`check-tags.sh` 4.0 秒。这三项加起来 84 秒**与检查逻辑无关**：它们对每个文件调十几次到二十几次外部命令（`head` / `tr` / `awk` / `cut` / `grep` / `dirname`），而 Windows 的 Git Bash 里每次进程创建约 **21ms**（实测：200 次 `head -1` = 4.06 秒；1000 次 bash 内建循环 = 25ms）。`check-frontmatter.sh` 对 150 个文件约 3600 次 spawn ≈ 76 秒，与实测完全对上。

改法（三个脚本同一条路子，**规则与输出逐字未变**）：

- **一次 awk 扫过全部文件**，把后面判断要用的东西一次性抽成 TSV（顶层键值、正文有没有 `$`、首个 `---` 是否在第一行 / 每个目录递归的 `.md` 数量 / 行内数组拆成的标签）；bash 侧只做**内建**判断（关联数组查键、`${d%/*}` 取目录名、`case` 匹配路径、`${var,,}` 折叠大小写）。
- **循环里不要用 `$(…)` 命令替换**：命令替换要 fork，Cygwin 的 fork 实测约 8ms —— 第一版改完还剩 8 秒，就是每文件 5–6 次 `$(get_val …)` 造成的。键值一律写成关联数组的直接展开 `${VAL["$rel|date"]-}`。
- 差分验证的做法：搭一个临时 git 仓库（`content/` + `data/` 的副本 + 三个脚本），补一批**带缺陷的**内容文件覆盖每条错误/警告分支（缺 front matter / 缺 title / 坏日期 / 未来日期 / section 与材料页写 tags / cascade 下自带 tags / 未知键 / 公式缺 summary / 重复标题 / 块列表标签 / 词表外标签与大小写漂移 / 分组表漂移 / 隐式 section / 双 bundle 目录），然后 **新旧输出逐字 diff、退出码一起比**。改这三个脚本时必须重跑这套对拍。

结果：`check-frontmatter` 72.6s → **0.56s**、`check-sections` 8.05s → **0.21s**、`check-tags` 4.0s → **0.27s**，整条推送 102s → **约 12s**。剩下的主要成本是 `check-math-katex.mjs` 的契约式计算（逐条交给 Hugo 的 KaTeX 试渲染，7.6 秒）与 `hugo` 构建（1.5 秒），这两项没有可省的办法（`--fix` 那一趟另有一个前置判断，见上文）。

`check-consistency.mjs` 会**从 `check-frontmatter.sh` 的文本里**抽 `TZ=` 与 `KNOWN_KEYS="…"`（正则匹配到第一个引号为止）。改这个文件时：这两个锚点要原样保留，**注释里也不要写出「KNOWN_KEYS 加引号」的样子**（踩过：正则先命中注释、抽出一段空词表，规则 E 会报一堆假的「没登记」）。

**唯一的例外**是 `check-consistency.mjs`：它是内部一致性检查，按上面这条本该只警告，但**定成阻断**。理由是它查的漂移本身就是「本地全绿、CI 拒收」这类发布路径缺陷 —— 例如 `gen-cards` 此前只在 CI 里、push-blog 与管理页体检都没跑，改了 `data/cs-toolbox.json` 忘了重生成卡片页时，本地会一路绿灯推到 CI 才炸。只警告的话这条检查等于不存在（没人看 CI 的黄色感叹号）。

**同一份校验清单有三处登记**，`check-consistency.mjs` 就是用来防止它们分叉的：

| 登记处 | 作用 | 谁跑 |
|---|---|---|
| `.github/actions/validate/action.yml` | **唯一事实源**，定义跑什么、什么顺序、阻断还是警告 | CI（deploy / checks） |
| `scripts/push-blog.sh` | 本地推送前跑同一批（少跑一项 = 本地绿、CI 红） | 人手动推送 |
| `tools/admin/lib/checks.mjs` 的 `ITEMS` | 管理页「体检」面板（少一项 = 面板谎报通过） | 双击 `启动管理页.bat` |

三处之间**没有生成关系，是人工同步的**，所以脚本里那些「必须与另外两处保持一致」的注释以前全靠自觉。现在 `check-consistency.mjs` 强制断言：**CI 里阻断的每一项，另外两处都必须有，且阻断口径一致**。反向不做要求 —— CI 独有的**只警告**项（如 `check-seo.mjs`）不必同步到本地，它拦不住发布，本地缺它不会产生「本地绿 CI 红」。它同时还会查时区单一来源（`hugo.toml` 的 `timeZone` vs `check-frontmatter.sh` 硬编码的 `TZ`）与 front matter 键表是否登记齐全。

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

**`themes/PaperMod/layouts/` 与 `assets/` 刻意没有剪**，这不是偷懒而是结论：**Hugo 会静默容忍缺失的 partial** —— 主题 `_partials/head.html` 无条件调用的 `google_analytics.html` 曾经在站点与主题里**都不存在**，而 og:/JSON-LD 照常渲染、构建一直是绿的。既然构建成功无法证明删模板文件安全，而 `layouts/` 里那些死文件（`share_icons.html`、`home_info.html`、8 个 shortcode、被站点覆盖的 `index.json`）总共不到 40 KB，就不值得为它承担「某条只走一次的渲染路径被删掉、且没人发现」的风险。

**2026-09-18 补充**：那个缺失的 partial 已经补上了 —— 站点侧新增 `layouts/_partials/google_analytics.html`，内容是**有意的空实现**（只有注释，不产出任何字符，页面字节数不变）。它把「静默缺失」变成「已登记的空实现」：想知道本站有没有统计的人打开这个文件就有答案，要加统计也就在那里写。注意这**不改变**上面那条结论 —— Hugo 容忍缺失 partial 这件事仍然成立，「构建还过」仍然不能用来判断删主题文件是否安全，只是这个具体的坑填上了。

**要再剪主题，只能按引用分析逐个确认，不能靠「构建还过」来验证。** 升级上游后这些被删的文件会重新出现，需要按本节清单再剪一次。

## 6. 图标（`tools/icons/`）

`static/` 下五个图标**全部是生成产物**，唯一事实源是 `tools/icons/make-icons.py`：

```bash
python tools/icons/make-icons.py                 # 重新生成（默认 --style art）
python tools/icons/make-icons.py --style pixel   # 换成脚本自绘的像素风
python tools/icons/make-icons.py --preview OUT   # 只渲染预览图，不写盘
python tools/icons/make-icons.py --preview-nav OUT  # 只渲染导航像素小人的预览（浅底/深底各一行）
python tools/icons/make-icons.py --check         # 比对 static/ 与 assets/images/nav/ 是否与脚本一致（本地用，没进 CI）
```

| 产物 | 尺寸 | 用在哪 |
|---|---|---|
| `static/favicon.ico` | 16/32 两帧 | 旧浏览器兜底 |
| `static/favicon-16x16.png`、`favicon-32x32.png` | 16、32 | 主题 `head.html` 默认引用 |
| `static/apple-touch-icon.png` | 180（256 色量化） | iOS 收藏/主屏 |
| `static/safari-pinned-tab.svg` | 单色路径 | Safari 固定标签 |
| `tools/admin/ui/ayaka.ico` | 16→256 六帧 | 管理页标签页图标 + 桌面快捷方式图标（`博客管理页.lnk` 的 `IconLocation` 指向它） |
| `assets/images/nav/*.png` | 32（32 色量化，367~398 B/张） | 导航栏 8 个菜单项的像素小人（见下面「第三条线」） |

**为什么不把 `tools/admin/ui/ayaka.ico` 塞进 `static/`**：那会把 169 KB 的 256×256 帧发到线上，而站点的 `favicon.ico` 只要 16/32 两帧（2.9 KB）。站点图标和桌面图标要的尺寸集合不同，故意分成两个文件。

**两条独立的线**（站点换了人设，管理页可以继续用旧那张）：

| 线 | 素材 | 渲染 | 产物 |
|---|---|---|---|
| 站点图标 | `source-ojou-chibi.png`（Q 版黑长直） | 抠掉平灰背景（`ART_KEY`）压到酒红底板（`ART_PLATE`） | `static/` 下五个文件 |
| 管理页图标 | `source-ayaka-chibi.png`（Q 版神里绫华） | 保留素材自带白底 + 冷色乘算（`APP_ART_TINT`） | `tools/admin/ui/ayaka.ico` |
| 导航小人 | **无素材，脚本自绘**（`NAV_CHARS` 里的发色 + 配饰参数） | 32×32 网格上逐像素画（复用 `Grid` / `draw_chibi` 的几何） | `assets/images/nav/*.png` |

### 第三条线：导航栏的像素小人（2026-09-19）

8 个菜单项各配一个 Q 版像素小人，角色优先取原神/Re:Zero（派蒙 / 纳西妲 / 甘雨 / 蕾姆 / 可莉 / 胡桃 / 莫娜 / 艾米莉娅），一个导航项一个角色。

**为什么自绘**：safebooru 上这几个角色的 `pixel_art` 少到凑不成一套（艾米莉娅 **0** 张、蕾姆 6 张、派蒙 15 张，且来源是游戏拆包 + 同人混着）；也试过把精细的 Q 版插画压到 32×32 —— 五官糊成一团、边缘还留一圈灰毛边（对比图 `../lab/结果/navtest/sweep-emilia.png`）。自绘顺带把许可问题解决干净：不复制任何官方素材，只是按角色的配色与特征自己画（所以这一条线**没有**上面那两张的许可顾虑）。

**辨识度押在「发色 + 配饰剪影 + 发长」上，不是五官**：16px 显示时整张脸只有约 6×6 像素。八个角色的发色刻意拉开（奶白 / 白绿 / 淡蓝紫 / 天蓝 / 金 / 暖棕 / 深紫 / 银白），配饰剪影各不相同（王冠 / 叶芽 / 双角 / 女仆头饰 / 便帽 / 梅花 / 女巫帽 / 花）。眼睛沿用 `draw_chibi()` 那套 3×4 结构（上眼睑重线 + 虹膜 + 一点高光）—— 画成 5 宽的整块色会变成护目镜。

**尺寸是 16px = 主网格 32px 的一半**，整数倍缩放才不糊；再配 `image-rendering: pixelated` 让 2 倍屏的放大也走最近邻（`assets/css/extended/19-nav-px.css`）。这是 16px 这条下限的又一次应用（与 `--style art` 的 favicon 同一个理由）。

**接线**（三处，缺一处图标就不显示）：

| 位置 | 作用 |
|---|---|
| `hugo.toml` 各菜单项的 `pre` | 放一个空 `<span class="nav-px np-<identifier>">`。Hugo 的 `MenuEntry.Pre` 是 `template.HTML`，**不会被转义**（实测确认过），所以能这样塞标记 —— 但别把 HTML 塞进 `name`（那个会被转义成文本） |
| `layouts/_partials/extend_head.html` | 按 identifier 去 `assets/images/nav/<id>.png` 找图，生成 `css/nav-icons.css`。**约定「文件名 == identifier」**，所以加导航项时放一张同名 PNG 就自动有图标；找不到图会 `warnf` 提示，且只显示文字（不留空白，见下条） |
| `assets/css/extended/19-nav-px.css` | 盒子：16×16、`background-repeat:no-repeat`、`background-size:16px`、`image-rendering:pixelated`、与文字的基线偏移。**基础规则是 `display:none`**，生成的那条才给 `inline-block` —— 忘了放图就不会留一个 16px 空洞 |

**为什么用 `<span>` + `background-image` 而不是 `<img src>`**：`src` 必须带站点子路径 `/my-blog/`，写在 `hugo.toml` 里等于把子路径钉死；走 `RelPermalink` 生成的 CSS 没这个问题（与站点背景同一套做法）。另外图标是纯装饰（旁边就是文字标签），用背景图就不需要 `alt`。生成的选择器写成 `.nav-px.np-<id>`（而不是只写 `.np-<id>`）是为了让优先级 (0,2,0) 压过基础规则的 (0,1,0)，不依赖两张样式表谁先加载。

**每个页面会下载这 8 张图**（导航栏在每页都渲染）：所以做了 32 色量化，实测 10.3 KB → 3.1 KB。`png_bytes()` 的 `colors` 参数只服务这一处。

**素材与许可**：两张都是 safebooru 站收录的非商用同人，**没有可声明的开放许可**。站点那张原作者 `uni_762`（X `@uni_762`，原帖 `https://x.com/uni_762/status/2097146578435969402`，safebooru post `7126608`，胸像 + 白底）；管理页那张原作者 `maidsan_(littlemaidsan)`（Pixiv 作品 `92959293`）。管理页背景图与桌面图标这类**本地不发布**的用途直接用；站点 favicon 若要彻底规避风险，把 `--style pixel` 生成的图标覆盖上去即可（像素风素材由脚本自绘，许可干净）。
裁切框、背景抠图容差、底板色、圆角都是脚本里的常量（`ART_CROP` / `ART_KEY` / `ART_KEY_TOL` / `ART_KEY_SOFT` / `ART_PLATE` / `ART_RADIUS`）：素材背景要求是一块平整的纯色，脚本按 `ART_KEY` 抠掉它、再压到 `ART_PLATE`（酒红）上。**容差必须远低于「肤色到背景色」的距离**：白底素材的肤白离白只有 ~27 个通道，`ART_KEY_TOL` 设成 40 就会把脸一起抠成半透明、底板透上来整张脸红掉（实测踩过）。——黑发压浅底太软、压深底会糊成一团，所以底板色由脚本控而不是让素材自带。换图只改这一组常量 + 换掉源文件。

**`--check` 没进 CI**：它需要 Python + Pillow，而 `action.yml` 目前只有 Hugo + Node。图标是低频改动，本地跑一次就够；真要挂 CI，得先给复合动作加 `actions/setup-python` 与 `pip install pillow`。

**Python 依赖已声明**（2026-09-18）：`tools/requirements.txt` 钉住 Pillow / numpy / opencv-python，装法 `pip install -r tools/requirements.txt`。在此之前这三项完全没有声明 —— 换台机器想重生成图标或背景图，只能读脚本的 import 反推，而仓库其余部分的锁版本纪律很严（Hugo 钉在 `action.yml`、Actions 钉到 commit SHA、KaTeX 入库并配对校验），唯独这一角是空的。它**不改变**上面那条「不进 CI」的结论：这个文件只服务本地生成器。`tools/course-import/import_course.py` 只用标准库，不需要它。

## 7. 已评估否决：不迁 Next.js、不分离前后端（2026-09-15）

**一、不迁框架。** 评估时的版本现状：Next.js 15 已退到 maintenance LTS（15.5.21，2026-07-20），current stable 是 **16.3**（16.0 GA 2025-10-21）；React **19.3**（2026-09-09，没有 20）。所以「Next 15 + React 19」本身就是一个过时的组合，真要动目标也是 16.3。

维持 Hugo 的直接理由：本站的能力面用不上 Next 的任何一条（无登录、无数据库、无个性化、无实时数据；RSC / PPR / ISR / Cache Components 全无对应场景——站点全是内容页）。而迁移的真实成本不在写页面，在**重建这台机器**：

| 项 | 现在 | 迁移后 |
|---|---|---|
| 规模 / 构建 | 150 md → 211 HTML，全量 **1.5 s 上下**（冷启动更久） | 内容管线全部重写 |
| 输出 / JS | 25 MB 输出（gzip 后 8.9 MB —— 其中 5.9 MB 是 63 张卡的派生图）；**全部 JS 112 KB**（18 个脚本，最大的也不到 20 KB；搜索索引另计 48 KB）；零 `node_modules`，唯一构建依赖是 `action.yml` 里钉的 hugo 二进制 | MDX 侧 JS 预算必然上涨 |
| 公式 | **构建期**渲染：`render-passthrough.html` + `transform.ToMath`（`throwOnError = true`，公式写错即构建失败）+ 三层校验 + KaTeX↔Hugo 版本配对表 | 换 rehype-katex 重写，或退回客户端 KaTeX（正是当初刻意去掉的那条） |
| 校验 | 15 项（front matter / section 结构 / 站内链接与**锚点** / 体积预算 / 公式三层校验 …）绑在 Hugo 的 URL 结构上 | 按新框架产物重写 |
| Hugo 白送 | `enableGitInfo` lastmod、tags/categories/series 三套分类与自定义视图、`data/taxonomy.yaml` 词表、图片 Resize、RSS + JSON 搜索索引、`/:year/:month/:slug/` 永久链接 | 逐项自建，且已发布的链接一条都不能断 |

触发再评估的条件：真需要服务端鉴权 / 个性化 / 增量内容 API。若只是 `output: 'export'` 静态导出，那 Next 只是一个更复杂的 Hugo，无收益。

**二、不分离前后端。** 站点已经是三段分离（构建期 → GitHub Actions + Pages 发布 → 本机 `tools/admin/` 写作），**线上没有任何后端进程**，运行期无后端可分离。唯一可拆的是 `tools/admin/`：它的 `ui/` 与 `server.mjs` 本来就靠 fetch 通信，技术分离零成本，但搬到公网易养认证 / 会话 / CORS / 密钥托管 / HTTPS / 进程守护，而现有三条安全边界（绑 loopback、`Host` 白名单防 DNS rebinding、写操作要 `X-Admin-Request` 头）的前提全是「攻击面 = 本机」；同时唯一的写盘入口 `new-content.sh` / `push-blog.sh` 会被拆散。**保持可分离性，不实际分离。**

真要「换设备写、手机写、别人投稿」，正确做法是把后端外包给 Git-based CMS（Decap / Sveltia 之类，拿 GitHub API 当后端）：仓库、CI、静态站形态都不动，只换编辑器。

## 8. 性能：实测数字与三条否决（2026-09-18，数字 2026-09-21 重测）

**先测量再优化**，因为直觉在这里是错的：本站看起来「很胖」（25 MB 输出、单页约 1 MB），但那是**磁盘上的字节**，不是访客下载的量。公式页的 raw HTML 里绝大部分是 KaTeX 在构建期逐符号生成的 `<span>`，压缩比极高。

| 指标 | raw | gzip -6 | 倍数 |
|---|---|---|---|
| 整站 | 25090 KB | **9221 KB** | 2.7× |
| 最重一页（raw 口径：`courses/regression-analysis/chapter-01/homework/`） | 1028 KB | 77 KB | 13.3× |
| 最重一页（gzip 口径：`projects/cmc2026/problem-04/问题四/`） | 836 KB | **77 KB** | 10.9× |
| HTML 合计 | 17783 KB | — | 占整站 72%；已删掉 JSON-LD 里的正文副本（见下） |
| 图片合计 | 6529 KB | — | 占整站 26%：63 张卡的 3 档派生图 5.9 MB + 深度图 0.6 MB + 背景/看板娘/封面（见下） |
| JS 合计 | 112 KB | — | 18 个脚本，已经很小 |
| CSS 合计 | 199 KB | — | 主包（26 个 extended 文件 Concat + minify）约 168.5 KB + 自托管 KaTeX 22.8 KB，其余是零星小包。2026-09-21 加四种工艺后 21-card-deck.css 117.1 → 120.0 KB、加入站揭幕后 23-splash.css 约 3.1 KB。**2026-09-23 按页拆包**：主包只剩 24 个文件（61.5 KB raw / 13.1 KB gz），卡片组 `css/decks/*`（96.1 KB / 20.5 KB gz）与首页专属 `css/home/*`（12.6 KB / 3.1 KB gz）改成条件外链 —— 见 features.md 第 6 节追加十 |
| 搜索索引 | 48 KB | — | 预算 56 KB，余量 14% |

**2026-09-18 做过一次真实瘦身**：删掉 JSON-LD 里 BlogPosting 的 `articleBody`（把整篇正文复制进 `<head>`，见 features.md ㉟）与左侧看板娘。整站 gzip 3260 → 2934 KB，最重一页 gzip 108 → 75 KB。这是本章唯一一次「测出问题并动手」的例子——其余都是测量后确认无需改动。

**2026-09-21 重测**：raw 18249 → **24782 KB**、gzip 2934 → **8914 KB**，增量几乎全部来自卡片组 —— 63 张卡各出 272 / 544 / 760 三档派生图（`deck-manifest.html` 里显式给质量），输出里的图片从 0 涨到 6222 KB、占 25%，HTML 反而从 94% 降到 72%。同期 JS 32 → 112 KB（新增 8 个脚本）、CSS 70 → 193 KB。体积预算因此从 4608 抬到 9600，抬升的每一步理由都写在 `scripts/report-size.sh` 的注释里。**这一笔涨幅是产品决定（卡面是首页的主角），不是性能问题** —— 但它把 gzip 余量压到 7%，再想加卡或加档位之前先看这一条。

**2026-09-21 晚第二次重测（3D 卡画质）**：raw 24783 → **25090 KB**、gzip 8914 → **9221 KB**。
增量的全部（307 KB）是**深度图**从 WEBP q75 抬到 q92（63 张 341 → 647 KB）。理由不是「更好看」：
q75 在高度场这种大面积平滑渐变上留下的块与台阶，会被浮雕的法线**差分**放大成画面上的条纹
（截图实测见 features.md ㊳ 的「2026-09-21 画质一轮」）。**gzip 余量因此从 7% 压到 3.9%（379 KB）
—— 这是目前最紧的一条预算**，再加卡、加档位或加派生图之前先看它。

**结论：当前没有需要修的性能问题。** 最重一页实际传输 77 KB，正常。真正的问题在于**度量口径**：体积预算此前只量 raw，而 raw 那 1.6 MB 的预算在描述真实传输量时是失真的（它更像「内容规模的棘轮」，比 gzip 更早察觉内容增长）。`scripts/report-size.sh` 现在**两条都量、都阻断**：raw 保留为早期警报，gzip 才是用户视角（单页 ≤ 160 KB、整站 ≤ 9600 KB）。线上由 GitHub Pages 的 gzip/brotli 兜着。

### 已评估否决，不要再提

1. **给 `static/katex/*` 加内容指纹。** 会破坏 `katex.min.css` 里 `fonts/` 的相对路径 —— 指纹化要经 Hugo 资源管线，而该管线不会重写 CSS 里的字体 URL，除非把 CSS 与 `fonts/` 拆到不同目录，而 AGENTS 规则 6 明令不许拆。现状代价是升级 KaTeX 后访客可能要强刷一次（`docs/formulas.md` 已记载这个取舍），可接受。
2. **关键 CSS 内联（critical CSS）。** 违反 AGENTS 规则 6「模板里不要写 `<style>`」，而且主包已经用 `rel="preload" as="style"` 加载、只有 48 KB；收益小、破坏的是「样式只有一份事实源」这条更值钱的性质。
3. **自托管 Fuse.js（搜索库）。** 这个提议的前提不成立：**Fuse 早已是 vendored 的** —— 主题 `_partials/head.html` 用 `resources.Get "js/fuse.basic.min.js"` 把它与 `license.js`、`fastsearch.js` 串成一个指纹化的 `search.js`，不是 CDN。站上唯一的第三方运行期依赖是 Giscus 的 iframe（`giscus.app`）。

**仍然可选、但没做**：给 `giscus.app` 加 `preconnect`，让评论区早一点开始连接。没做的原因是它会**提前**建立第三方连接（现在只在页面滚到评论区时才连），与站点「零第三方运行时依赖」的姿态有张力，收益也只是一个懒加载 iframe 的握手时间。要做得先想清楚是否接受这个取舍。
