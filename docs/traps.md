# 陷阱清单

**症状 → 原因 → 改法。** 每条只讲一次；机制细节在对应主题文档里，这里只给结论与去处。

## 1. 症状速查

| 症状 | 原因 | 改法 |
|---|---|---|
| 当天发布的文章当天不上线，次日才出现 | `hugo.toml` 缺 `timeZone`，`archetypes` 的 `date` 只有日期没有时刻，Hugo 按 UTC 零点解析，在东八区就成了「未来 8 小时」的内容，而 `buildFuture=false` 会**静默跳过** | 顶层 `timeZone = 'Asia/Shanghai'` **必须保留**。实测对照：不设时 `hugo --minify --gc` 不产出当天日期的文章，设了就产出。管理页对已发布的未来日期页面也会单独提醒（`/api/state` 的 `futureDated`） |
| 改了 `date`/`title`/`slug` 后预览 404 | hugo server 不会把「保存后固定链接变了」的页面注册到新地址 | 管理页在这三个字段被改动且预览在跑时会自动重启预览；手动时自己重启 server |
| 公式排版错乱（上下标错位、分数塌陷） | KaTeX 样式与 Hugo 内嵌版本不配对 | 见 [`formulas.md` 第 5 节](formulas.md#5-katex-样式版本必须与-hugo-内嵌版本配对-) |
| 构建失败，报 `KaTeX parse error: … Unicode text character "到" used in math mode` | 正文里裸写了 `$`（两个 `$` 之间的内容被当成公式） | 写成 `\$`；行内代码与代码块里的 `$` 是安全的。见 [`formulas.md` 第 4 节](formulas.md#4-裸--会让构建失败) |
| 构建失败，报 `Undefined control sequence: \*` | 公式里用了 KaTeX 不认的写法：`L^\*`、`R^\*_2` 这类（AI 生成的公式里常见）。`\*` 在 LaTeX 里也不是星号的正规写法 | 改成 `^*`（`L^*`、`R^*_2`），渲染结果一致 |
| 构建失败，报 `Unicode text character "：" used in math mode` | 数学区里写了**全角冒号 `：`**——`，`、`（`、`）` 能过，`：` 不能 | 挪进 `\text{}`（`\text{固定设计：}`）或改用半角 `:`。这类错误用 `node scripts/check-math-katex.mjs` 定位，报的位置就是真位置 |
| 构建失败，报 `Unrecognized Unicode character "①"` | 数学模式里直接写了圈号 `①②③`。KaTeX 严格模式（Hugo 默认 `strict: 'error'`）只认它符号表里的字符，`①`（U+2460）不在其中，**即使包在 `\text{}` 里也会报错**（中文能过是因为在符号表内） | 用 LaTeX 的圈号命令并**包一层 `\text{}`**：`\text{\textcircled{1}}`（实测渲染正确）。**单独用 `\textcircled{1}` 会报 `LaTeX's accent \textcircled works only in text mode`**——它是文本模式的 accent。正文（公式外）的 `①` 不受影响；这类现在由 `scripts/fix-math-escapes.mjs --fix` 自动修好 |
| 构建失败，报 `Unexpected end of input in a macro argument, expected '}'` 或 `Unrecognized Unicode character "§"` | ① **公式里又写了一个 `$`**（如 `$\text{$r$ 步 $5$ m}`、`环内移到 \rho=1028$ 后`）：`$…$` 是「遇到下一个 `$` 就收」，多写一个就把区域**提前截断**，KaTeX 收到半截公式；② 数学区里写了 **`§`**（裸 `§` 在纯数学模式里能过，但包进 `\text{}` 就报 `Unrecognized Unicode character`，而「见 §3.4」几乎总在 `\text{}` 里） | ① 数学区里不要再写 `$`（已经在数学模式里，`r` 本来就是斜体）：改成 `$=(r\text{ 步 }5\text{ m})$`、`$\rho=1028$`；② `§` 写成 `\S`（KaTeX 的 `\S` 就是 §，math/text 双模式都认），圈号写 `\text{\textcircled{1}}`——两类都已进 `scripts/fix-math-escapes.mjs` 自动修复。这类错误**别靠 Hugo 的行号定位**——它报的是模板渲染位置（实测三个坏页全报 `19:13`，真缺陷在 107/109/160 行），用 `node scripts/check-math-syntax.mjs`（快检，给人话改法）与 `node scripts/check-math-katex.mjs`（真检，Hugo 内嵌 KaTeX 逐条试渲染，覆盖全部语法错误）。详见 [`formulas.md` 第 4 节](formulas.md#4-裸--会让构建失败) |
| 页面上直接显示 `**` 或公式源码 | 见第 2 节 | 见第 2 节 |
| 本地量页面数/体积总是偏大 | `public/` 不会自动清空 | 构建加 `--cleanDestinationDir`；或用 `report-size.sh --fresh` |
| 词条页（`/tags/xxx/`）计数比列表条数多 | 给 section 页写了 `tags` | 见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩) |
| 材料页突然从 `/tags/<课程标签>/` 里消失 | 材料页自己写了 `tags`，cascade 只填空不合并，继承的标签被整体丢弃 | 见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩) |
| 公式样式没加载，但公式本身显示正常 | `math` 字段只决定要不要加载 `katex.min.css`，与渲染无关；忘了写也有兜底检测 | 显式写 `math: true`；无公式的页面写 `false` 省约 23KB |
| 首页头像糊 / 没缩到 120×120 | 头像放在了 `static/` | **必须放 `assets/images/`**：主题用 `resources.Get` 去 assets 找，找不到就退回直出原图，`imageWidth/Height` 被**静默忽略**（曾如此：原图 22 KB 直出，而不是 4.8 KB 的 120×120） |
| 改首页布局没反应 | 首页是 Profile Mode | 去 `[params.profileMode]`，不是普通 list 模板；按钮已移除，入口走顶部导航 |
| 图片在窄屏被**纵向压扁**（宽度缩了、高度没跟着缩） | 给 `<img>` 补了 `width`/`height` 属性，而主题 reset 只有 `img { max-width: 100% }`（`core/reset.css`）**没有 `height: auto`** —— 宽度被压到 100% 时高度仍锁在属性值上。**构建不报错，只有看图才发现** | `.post-content img` 补 `height: auto`（`assets/css/extended/00-theme.css`，㊲ 已加）。补上后浏览器仍按属性里的宽高比预留空间，防跳动的收益不受影响。判据：400px 视口下 660×440 的图应渲染成 333×222（宽高比 1.5）而不是 333×440。见 [`features.md` ㊲](features.md) |
| 搜索整站失效 | 首页 JSON 输出被删 | `[outputs] home` 里的 `'JSON'` 勿删 |
| 长文里明明有的词搜不到 | 索引正文被截断到每页前 400 字（有意为之） | 预期行为，不是 bug；要改调 `layouts/index.json` 的 `truncate 400` 并同步 `fuseOpts.keys`。见 [`features.md` 第 3 节 ⑪](features.md) |
| 列表卡片里的公式显示成重复三遍（`e=x^−xe = \hat{x} - xe=x^−x`），或卡片摘要整块空白 | 卡片摘要走主题 `list.html` 的 `.Summary \| plainify`。公式在**构建期**已被 KaTeX 渲染成 HTML+MathML，`plainify` 剥掉标签后把 MathML 文本、`annotation` 里的 TeX 源码与视觉文本拼在了一起；正文为空的生成页（工具卡片）则是摘要本来就空 | 给会出现在列表页的页面写 front matter **`summary`**（纯文本，`.Summary` 会直接返回它）。`check-frontmatter.sh` 对「正文含公式却没写 summary」的页面发警告；不能写进 `archetypes` —— 空字符串会被当成「已设置」，卡片会变成空白 |
| 订阅者收到一排没有摘要的条目，或 `pubDate` 是 `Mon, 01 Jan 0001` | 首页 RSS 取 `site.RegularPages` 且不过滤 `mainSections`：正文为空的生成页（80 张工具卡片、`/library/` 三级页）`description` 为空；没有 `date` 的静态页（`about`）日期是零值 | 给这些页面加 **`hiddenInRss: true`**（`themes/PaperMod/layouts/rss.xml` 里唯一的消费者）。工具卡片与 `/library/` 三级页写在各自的 cascade / 适配器 `params` 里。`check-seo.mjs` 会盯住这两类 |
| 给 `/tags/xxx/` 写了说明文字却显示不出来 | 说明文件放在了与**词条 URL** 不一致的目录名里：Hugo 是按词条的 URL 路径去找 `content/tags/<路径>/_index.md` 的，找不到就静默忽略（页面照常构建、页头就是空的）。写成 `content/tags/CMC2026/`（词表的写法）而不 `content/tags/cmc2026/`（产物的 URL）就中招 | 目录名照构建产物的 URL 定：小写、空格换连字符、中文保持原样。自查：构建后 `grep -o 'post-description[^>]*>[^<]*' public/tags/<词条>/index.html` 应有输出。见 [`features.md` ㉘](features.md)、[`content.md` 第 5 节](content.md#5-标签词表) |
| 在工具库页 / 卡片库细分页点开卡片，弹窗里**只有抬头没有正文**；或分享来的深链 `#card-tool-1-4` 在细分页上**毫无反应** | 索引卡与完整卡片共用 `.tb-card` 类，而索引卡（`.tb-card.tb-teaser`）也带 `data-id`：`toolbox.js` 里凡是按 `.tb-card[data-id=…]` 找「本页已有的完整卡片」的地方，都会命中那张**没有正文**的索引卡 —— `loadCard` 命中的结果是空弹窗，深链的守卫则直接跳过、什么都不发生 | 这些选择器**一律排除 `.tb-teaser`**（`:not(.tb-teaser)`）。`loadCard` 2026-09-18 修，深链守卫 2026-09-19 修（同一个坑的第三处），两库都受影响 |
| 点卡片**有时开弹窗、有时直接跳到 404 页**，地址栏末尾是一串 `/null`（如 `…/library/algebra/linear-algebra/null`） | `toolbox.js` 的 `targetOf()` 从**被点到的元素**取 href：卡片里的标题/类别徽章是 `<span>`，真实鼠标点上去时 `e.target` 就是那个 span（没有 href）→ 拿到 `null` → `pathOf(null)` **不抛错**，把字符串 `"null"` 当相对地址解析成一个语法合法、只是不存在的 URL → 抓取 404 → 兜底 `location.href = url` 把访客送去 404 页。只有恰好点在 `<a>` 自己的内边距空白处才正常 | 链接一律从**组件自己的 `<a>`** 上取（`teaser.querySelector("a[href]")`）；`pathOf()` 对空 href 返回 `""`；点击处理器只在拿到非空地址时才 `preventDefault()`（拿不到就不拦截，让浏览器按链接自己走）。2026-09-19 修，两库每一张索引卡都受影响。机制与第二种形态见第 2 节 |
| 某个 section 的页面**静默**回落到主题 `list.html`（本该用自己的 layout） | Hugo 的布局查找是**先看 `layouts/<section>/<layout>.html`**：`layout: library` 只在 section 恰好叫 `library` 时才命中 —— 数学库是撞上的；section 换成别的名字（如 `cs`）就找不到模板、回落到主题列表页，页面照常构建、内容完全不对 | 多个 section 共用的 layout 放 `layouts/_default/<layout>.html`（通用回落位），front matter 的 `layout:` 不用改。2026-09-18 把 library / library-branch / library-section / toolcard 四个模板移到了那里，见 [`features.md` 第 4 节](features.md) |
| 卡片 id 与分支/细分 key 撞名，两边页面互相覆盖 | 两者都会变成 `/<库>/<key>/` 这一层 URL | `node scripts/gen-cards.mjs <库>` 生成前会校验并直接报错退出；改卡片 id 或分支 key |
| 卡片墙上「配件」（引理/推论/性质）缩进挂到正主下面时，点配件却打开了正主 | 把配件的卡片塞进了正主卡片的 DOM 里。正主那张卡有一层「整卡可点」的拉伸链接（`.tb-teaser-link::after { inset: 0 }`），它盖住了卡内的所有子节点 —— 点配件落到的还是正主那层链接 | 配件必须是**独立的卡**，和正主并排放在 `.tb-family-kids` 里（`_partials/toolbox-wall.html`），不能嵌进正主的 `<article>`。验收判据：点配件打开的是配件自己的卡片页（实测：点「引理 4.1」应打开 `/toolbox/thm-4-1/`） |
| 搜索框里的「匹配 N / 80」和分组按钮上的张数对不上（总数偏大） | 同一张配件被多个正主共用时，每个正主下面都渲染了一份，页面上 `.tb-card` 的数量 > 卡片总数；`toolbox.js` 的筛选原先逐张 `.tb-card` 计数 | 计数时跳过 `.tb-teaser--dup`（重复份），并按 `.tb-family` 整体决定显示与否 —— 见 `toolbox.js` 的 `apply()`。这类「DOM 数量 ≠ 数据数量」的地方都要想一遍谁在数 |
| 给卡片墙的卡片加样式（如去掉左色条）不生效 | `.tb-card[data-kind]` 那条规则在文件里**更靠后**、特异度又相同（各 0,2,0），后者胜；只写 `.tb-card.xxx` 压不住它 | 选择器带上属性：`.tb-card[data-kind].tb-teaser--dup`（0,3,0）。判据：`getComputedStyle(el).boxShadow` 里还有没有那条 `inset 3px` |
| 加了「节」相关的自动归类，工具卡的编号和课程笔记的节号串了 | 两边的编号都是 `X.Y`：工具卡按 `## X 名称` 分组（1–6），课程笔记按 `§X`（1–16），数字会撞上但**内容毫无关系**（工具分组的「2 正态分布与抽样分布」≠ 笔记 §2「简单线性回归模型」） | 分节时把**来源**也带进 key：`(id 前缀, 编号第一段)`，如 `("tool","2")` 与 `("thm","2")`。见 `import_course.py` 的 `section_key_of` |
| 卡片库的生成逻辑「明明一样却要写两份」 | `AddPage` 的 `path` **相对适配器所在目录**，适配器没法生成别的目录下的页面 | 每个库一份实例（`content/library/_content.gotmpl` 与 `content/cs/_content.gotmpl`），差别只有 `$libKey` 一行；改完两边都要跑一遍页面核对 |
| 「标签」入口整页空白 | 新建了 `content/tags.md` 之类带 `url` 的普通页，把 `kind=taxonomy` 的列表页顶替成了普通文章页 | 总览页标题只写在 `content/<taxonomy>/_index.md`，不要再建同名普通页 |
| 导航栏某个入口 404，或 `/posts/` 这类列表页整页消失 | 该 section 目录没有 `_index.md`：Hugo 给的是**隐式 section**，页面靠子页面撑着，最后一篇内容被删掉时列表页与所有指向它的入口一起 404。实例：`content/posts/` 曾经只有一篇占位文章 | 用 `bash scripts/new-content.sh section <路径> --title 标题` 补列表页。现在 `check-sections.sh`（阻断，拦「有子页面却没列表页」）与 `check-links.mjs`（同站绝对链接也在检查范围内）都会拦住它，`remove` 也拒绝单独删 `_index.md` |
| 换 logo 后看不到新图标 | `static/` 下是无内容指纹的静态文件 | 访客强刷即可；换图标**不要手改那些 png/ico**，改 `tools/icons/make-icons.py` 后重新生成（见 `architecture.md` 第 6 节），桌面快捷方式还要 `ie4uinit.exe -show` 刷 Explorer 的图标缓存 |
| 改明暗颜色的代码不生效 | 监听/匹配了 `.dark` class | 主题机制是 `<html>` 上的 **`data-theme` 属性**，用 `[data-theme="dark"]` |
| 首屏先闪一下默认背景、再换成自己存的那套背景 | 背景套靠 `<html data-bg="…">` 选中，而这个属性必须**在首次绘制前**写好。改成 defer 外链（或把脚本挪到 `</body>` 前）就会先按默认套下一张图、再换成访客存的那张——白下载一百来 KB 还闪一下 | 那段前置脚本留在 `extend_head.html` 里**内联**（AGENTS 规则 6 的唯一例外）。它只做一件事：读 `localStorage['pref-bg']`、校验 id 仍在 `presets` 里、写属性。主题自己处理 `pref-theme` 用的是同一招，位置也与之对齐 |
| 新增一套背景后，切到浅色主题显示的是**另一套**的图 | 生成的 `[data-bg]` 块必须**变量写全**：某套只写了 `dark` 没写 `light`，块里若没有 `--bg-image-light:none`，它就会继承 `:root`（默认套）的值 —— 两套混着显示 | 生成逻辑在 `extend_head.html`：每个预设的 6 个变量都无条件写（缺图写 `none`，缺 `position`/蒙版用模板里的兜底值）。别改成「只写有值的」，那会把自洽性交给继承 |
| 关掉背景后页面上还留着一层灰 | `presets` 留空时整段背景 CSS 不生成，此时若 CSS 里给蒙版写了 `var(--bg-mask-light-1, .5)` 这类兜底值，就会只剩一层纯灰蒙版压在底色上 | `00-theme.css` 的 `body::before` **刻意不写**蒙版与 position 的 var() 兜底：求值失败会让 `background-image` 回落到 `none`，正是「关闭背景」该有的样子。这也是不在这里再放第二份「默认数值」的理由 |
| 改背景套的 `maskLight`/`maskDark`/`position` 不生效 | 这三个键的大小写在 Hugo 的 `Params` 里不敏感（都能读到），但**蒙版必须正好三个数**，否则构建直接报错；`position` 写错（如 `center 25` 少个 %）不会报错，只会让 `background-position` 整条失效 | 三个数是 [顶, 中, 底] 三档不透明度；`position` 用合法的 `center 25%` 形式。报错信息里会指出是第几套的哪个键 |
| 往菜单 `name` 里塞 HTML，页面上原样显示了标签 | `MenuEntry.Name` 是普通字符串（会被转义）；只有 **`Pre`/`Post` 是 `template.HTML`，按原样输出** | 图标之类要放 HTML 就写进 `pre`（导航栏的像素小人就是这么接的，见 [`architecture.md`](architecture.md) 第 6 节）；文案仍走 `name` |
| 新加的导航项图标不显示，但构建是绿的 | 生成 CSS 的判据是「`assets/images/nav/<identifier>.png` 存在」，而图标位的 `np-<id>` 类名要跟 identifier 对上；基础规则是 `display:none`，所以没图时**只是没有图标、不留空白，也不会报错** | 文件名照菜单的 `identifier` 起（放一张同名 PNG 即可）；构建时对缺图的 identifier 会 `warnf`，搜一下构建输出里的「没有图标」就知道漏了哪个 |
| bash 脚本报 `$'\r': command not found` | 全新 checkout 得到 CRLF | `scripts/*.sh` 与 `data/*.yaml` **必须 LF**（`.gitattributes` 已用 `text eol=lf` 钉住）。内容 `.md` 允许 CRLF（Hugo 与两个校验脚本都能处理） |
| 单页的左侧目录栏不跟着滚（或整栏跑到正文末尾） | `.post-single` 上的 `backdrop-filter` 会成为 fixed 后代的**包含块**——留在正文容器里的 `position: fixed` 是相对卡片定位的，于是跟着正文一起滚 | `layouts/_partials/toc-rail.html` 里**内联**的那段脚本把 `#toc-rail` 挪到 `<body>` 下；显示与否挂在 `body.has-toc-rail` 上，没 JS 时不显示（正文顶部的折叠目录照旧）。见 [`features.md` 第 3 节 ㉓](features.md) |
| 两份目录的条目数量不一样（页内目录比左栏多） | 页内那份走的是主题自建目录（正则扫 h1–h6），左栏走 `.TableOfContents`（h2–h3）——有 h4 的页面就会差出一截（实测 lab 页 30 vs 15） | `hugo.toml` 设 `UseHugoToc = true`，两边同源。顺带修掉了主题自建目录对含公式标题 `plainify` 出的乱码（「手算 ttt 检验时用」） |
| 同一类页面之间内容串页：A 页的侧栏/页脚出现 B 页的目录 | 主题 baseof 用 `partialCached "footer.html" . .Layout .Kind …`，同 (Layout, Kind) 的页面**共用一份渲染结果**（`extend_footer.html` 里的页面相关输出会串） | 页面相关的内容一律挂 `extend_post_content.html`（`partial`，逐页渲染）；`extend_footer.html` 只放与页面无关的东西 |
| 目录里冒出 `HAHAHUGOSHORTCODE372s2HBHB` | 标题行里有 `{{< … >}}`：`.TableOfContents` 不执行短代码，占位符原样进目录 | 导入脚本的接线要跳过标题行（`import_course.py` 的 `SKIP_ZONE`）；正文里也别手写短代码进标题 |
| 管理页窗口里出现 `'会自动打开' is not recognized…`，但服务起来了 | `.bat` 里混进了中文 | 见 [`admin.md` 第 12 节](admin.md#12-启动管理页bat-的硬约束) |
| 管理界面被发布到线上 | 界面资源放进了 `assets/` | 只能放 `tools/admin/ui/`，见 [`admin.md` 第 11 节](admin.md#11-安全边界) |
| 写了降级/覆盖规则却不生效，构建全绿、只有看图才发现 | `:is()` 的权重取参数里**最高**的那个，不是「一组同类选择器」。实例：`… :is(.post-single, .page-header, …, article.post-entry)` 里 `article.post-entry`（元素+类）把整条抬到 (0,2,2)，而降级段只写 `:is(.post-single, .page-header)` 是 (0,2,1) —— 低一档，基础声明一直赢 | 基础规则与它的覆盖/降级规则**成对使用完全相同的选择器形状**，靠「后出现」取胜；改完到目标条件下**回读计算值**断言（`getComputedStyle(...).<属性>`），别只看构建 |
| 以为「滚到某处再截图」做了滚动测试，其实页面根本没滚（不同 scrollY 的截图逐字节相同） | `00-theme.css` 里有 `html { scroll-behavior: smooth }`，而隐藏标签页里 rAF 被节流 → 平滑动画完全不推进，`scrollTop = y` 赋值静默无效 | 测前把 `scroll-behavior` 覆盖成 `auto`，并**回读 `scrollTop` 断言真的滚了**再取图。与第 6 节「量滚动卡顿的两个坑」同族（真窗口被遮挡时 rAF 冻结会得到「0 帧」这种假流畅；逐帧 `scrollBy` 被平滑动画吃掉） |
| 用脚本设了 `data-theme` 再截图，拍出来还是旧主题 | 页面脚本会按 `localStorage['pref-theme']` 把主题刷回去 | 设 `data-theme` 的同时写 `localStorage`，并**回读 `getAttribute('data-theme')` 断言**；连续切多次要每次都验 |
| 在 `backdrop-filter` 里引用 SVG 滤镜（`backdrop-filter: url(#f)`）毫无效果、也不报错 | `backdrop-filter` 的语法允许 `url()`，但 Chromium **不处理这个引用**（实测：同一条纹区域 `url(#f)` 的像素标准差 111.88 ≈ 没滤，`blur(8px)` 是 5.79） | 要折射身后内容只能自己复制一层背景图、再对它用 `filter: url(#…)`；否则只能用 filter 函数（blur 等） |
| 照规范写了「`filter` 指向不存在的定义时元素完全不渲染」，实测不对 | Chromium 下那只是**当作没有滤镜、照常渲染**（实测红色方块均色仍是纯红） | 别把规范当实测抄进注释。要靠「元素会消失」来做兜底设计时先自己验一遍；兜底理由要写清是防御性的还是实测的 |
| 听信「`transform` 会打断 `background-attachment: fixed`」，为它删掉 hover 抬升 / 改布局 | 2026-09-19 实测**不成立**：元素自身 identity 变换、自身 `translateY(-2px)`、祖先 `translateY(0)`、祖先 `filter: blur(0)` 四种情形下背景都仍锚定视口（滚动前后同一屏幕区域差异 98~100%，被打断才会接近 0） | 别为这条改设计。真会打断锚定的是 **iOS Safari 把 `background-attachment: fixed` 当 `scroll`** —— 那条只能用断点降级处理 |
| 加了半透明底衬之后，对比度脚本报出 1.4x 的**假失败**（比没加底衬还差） | 脚本用 `match(/[\d.]+/g)` 取色，而 `color-mix()` 的**计算值**会序列化成 `color(srgb 0.968627 0.960784 0.972549 / 0.72)`，分量是 0~1 的比例 —— 老解析器把 `0.96` 当成 `0.96/255`，即近黑。2026-09-19 实测：浅色城市套首页从 4.74 假跌到 1.49，而真实值反而升高了 | 底衬这类色值写成 **`rgba()` 字面量**（如 `--glass-tint`），别用 `color-mix()`；`../lab/shots/girlbg/contrast.js` 的解析器已补 `color()` 分支，但换成旧副本的脚本仍会误报 |
| 背景/面板「灰蒙蒙」，于是想靠**改蒙版**或**加不透明度**解决，结果文字对比度掉到 AA 以下 | 把「亮度」与「彩度」当成了同一个旋钮。**WCAG 对比度只看亮度**，而「灰不灰」看彩度：往白里洗（提高蒙版 alpha）能保文字但把彩度一起洗掉；提不透明度同理。2026-09-19 实测少女套被削两轮彩度（管线 `Color(0.95)` + 运行时蒙版）才是根源 | 两个旋钮分开拧：**彩度用 `ImageEnhance.Color` / `saturate()`**（按 luma 混合，**逐像素亮度不变**，所以不用重量对比度 —— 实测 12 组数值只动 0.01~0.04）；**亮度（`Brightness(...)`、蒙版 alpha、`--surface` 不透明度）改了必须重跑 `../lab/shots/girlbg/measure.py`**。想同时要「画面鲜活 + 面板通透 + 文字达标」，唯一的出路是提彩度而不是动亮度 |
| 换了 `assets/images/` 下的背景图字节，老访客还是看到旧图 | 壁纸 URL 原先由 `resources.Get $path` 直接取 `.RelPermalink`，**不带内容 hash**，浏览器按 URL 缓存（仓库里同类的坑：换 logo 要强刷） | `resources.Get $path \| fingerprint`，URL 带 hash 后换素材自动失效（`extend_head.html` 已改）。**注意 `public/` 里的旧文件要 `--cleanDestinationDir` 才清掉** |
| 量背景对比度得到「好得不像话」的数字（面板区域像素几乎全平、极值只差 1） | 截图时**壁纸图还没解码完** → 量到的是「没有壁纸」时的合成值（面板内外都等于主题色，或等于底色盖主题色）。2026-09-19 实测：浅色正文面板量出 13.38，重拍后是 10.55 | 取图前先 `await new Image().decode()`，并**核对一个面板外像素不等于主题色**（如浅色下 (20,450) 应接近壁纸的天空色而不是 (247,245,248)）；这条同时适用于隐藏文字后的取图 |
| 对比度表一直是绿的，页面上其实有 2~3:1 的灰字 | **表的页型覆盖不全**。原表只测首页 / 笔记页 / 章节入口页三种，而「不在面板里的裸文本」主要长在**课程主页、词条页、404** 上 —— 那三种页型从来没进过表，于是全绿是假的 | 2026-09-19 把页型扩到 6 个，扩完立刻看见课程主页 3.89、词条页 3.72 早就不达标。**改测量脚本的覆盖面与改样式同等重要**：加页型、加主题、加背景套都要重新对一遍全表，别只信「上次是绿的」 |
| 给文字加了玻璃底衬，截图里却看不到玻璃（或不透明得像一块白板） | 两条各管一半：`backdrop-filter` 在 **`display: inline`** 的元素上不可靠（浏览器可以不建、也可以建得很怪），而旧写法靠 `box-decoration-break: clone` 支持跨行 —— 直接改成 `inline-block` 又会让窄屏的长文本整段不换行（横向溢出） | 底衬**一律挂块级盒**：flex 子项、`inline-block` 的原子盒、块级标题都可以；行内的 `<span>` 就把它所在的容器做成面（页脚因此是**整条** `footer` 加玻璃，顺带盖住了选不中的裸文本节点 ` · `）。填充用 `inset box-shadow` 而不是 `border`，免得顶开行高 |
| 关掉背景（`presets` 留空）后，纯色主题上仍残留一层高光/暗角 | 新增的质感层 `body::after` **不引用任何预设变量**，所以不会跟着 `presets` 一起消失（与第 40 条同一族：都是「关了背景还留痕」） | 每条声明都引用一个恒为 0 的哨兵，如 `--t0: calc(var(--bg-mask-light-1) * 0)` 再 `rgba(255,255,255,var(--t-sheen))`：变量不存在时整条声明在**计算值阶段**失效、回落到初始值 `none`，整层消失。乘 0 不是笔误（只借存在性）。**改完实际验一遍**：清空 presets 后断言 `getComputedStyle(document.body,'::after').backgroundImage === 'none'` 且 `boxShadow === 'none'` |
| 新加的一层视觉（渐变、滤镜）「明明改了却没进对比度表」，表还是全绿 | `contrast.js` 的模型是固定的：只读 `body::before` 的背景图 url + 按视口 y 插值的蒙版 alpha，**`background-image` 里的额外渐变层、`::after`、`filter`/`backdrop-filter` 它全都看不见** —— 不报错，只是不参与，于是数字偏乐观 | 与第 57 条同一族。要么别把保护建在这些层上（保护只认 `background-color` 的实心半透明色），要么把这类层放到 `body::after` 并**在注释与文档里写明「这一层测不到」**，同时把它的 alpha 压到可忽略（≤.28）并用截图 + 像素抽检兜底 |

## 2. 会「静默」出错的那一类

这些问题的共同点：**构建是绿的，但页面其实是坏的**。`hugo --minify --gc` 不会报错，所以靠 `check-frontmatter.sh` 等脚本拦——它们也因此被设计成**阻断**（见 [`architecture.md` 第 4 节](architecture.md#4-构建与部署)）。

- **整页没有 front matter**：标题会退化成站点名
- **缺 `title`/`date`/`draft`**：`date` 缺失会让页面按零值时间排序
- **section 页写了顶层 `tags`**：计数虚高、词条页里不出现
- **section 目录没有 `_index.md`**：该分区会退化成「隐式 section」，最后一篇内容被删掉时列表页与指向它的入口（导航栏、首页）一起 404。`check-sections.sh` 拦「有子页面却没列表页」，`check-links.mjs` 拦「列表页已经没了」，`remove` 拒绝单独删 `_index.md`
- **`draft: false` 却把 `date` 写在未来**：CI 直接不构建它
- **两个页面 title 完全相同**：列表页与搜索结果里分不出谁是谁（`check-frontmatter.sh` 会警告）。2026-09-18 之前这条还意味着**评论串页**——当时 giscus 用 `mapping='title'`，数值分析两章的「学习笔记」「作业」会共用同一条 discussion；现在 `mapping='pathname'`（URL 唯一），评论不再串页
- **`\textcircled{1}` 在这套环境下渲染是**对的**，别因为 CSS 里搜不到 `.textcircled` 就以为它坏了**：`static/katex/katex.min.css` 里确实没有 `circled`/`enclose` 规则，但圈的定位是 KaTeX 生成的 vlist **内联**布局，不依赖那条 CSS。实测（`content/projects/CMC2026/problem-01/solution.md` 里那 5 处）：圈 20×23px、数字 10×23px，**中心偏移 (0, 0)**，数字正好在圈里。教训是**不要用「CSS 里搜不到类名」推断渲染坏掉**；真要量就量**同一构造内**配对的元素——第一次量出「圈浮在数字上方 27px」是因为把相邻构造的数字和圈配到了一起

### 点卡片跳到 `/null`：`null` 会被 URL 解析器变成一个「能用」的坏地址

`assets/js/toolbox.js` 的 `targetOf()` 曾经这么取地址：

```js
var teaser = el.closest(".tb-teaser");
if (teaser) return { id: teaser.dataset.id, url: pathOf(el.getAttribute("href")) };  // el = e.target
```

`el` 是**被点到的最内层元素**。卡片里的标题与类别徽章都是 `<span>`，真实鼠标点上去时 `e.target` 就是那个 span —— 它没有 `href`，`getAttribute("href")` 返回 `null`。而

```js
new URL(null, location.href).pathname   // → "/my-blog/library/algebra/linear-algebra/null"
```

**不抛错**：`null` 先被转成字符串 `"null"`，再当相对地址拼到当前目录后面，得到一个语法完全合法、只是不存在的 URL。接着 `if (url)` 判真 → 抓取 404 → 兜底 `location.href = url` → 访客落在 404 页，地址栏里一串 `/null`。

**为什么是「静默」的**：不报错、控制台干净、构建与链接检查全绿 —— `check-links.mjs` 查的是**静态链接**，而这个坏地址是运行时算出来的，任何页面的 HTML 里都不存在。两条判据：① 「点卡片有时好有时坏」—— 点在 `<a>` 的内边距空白处能开，点在标题/徽章上就 404；② 地址栏末尾是 `/null`。

**修法**（2026-09-19）：从**组件自己的 `<a>`** 取链接（`teaser.querySelector("a[href]")`）、`pathOf()` 对空 href 返回 `""`、点击处理器只在拿到非空地址时才 `preventDefault()`（拿不到就不拦截，让浏览器按链接自己走，也就是「没有 JS 时」那条路）。

**同一类错误的第二种形态：靠 URL 形状猜身份。** 弹窗内的卡内交叉引用原先写成 `el.closest('.tb-modal-content a[href*="/toolbox/"]')` —— CS 库的卡片页在 `/cs/<id>/`、不含 `/toolbox/`，于是 CS 卡正文里的交叉引用不被拦截、点一下整页跳走（数学库却是就地弹窗）。现在由 `toolbox-md.html` 在改写锚点的同时给链接补 **`data-card="<id>"`**，JS 按 `data-card` 认卡。**身份写在链接上，不要从地址里猜** —— 以后加库不必回来改选择器。

顺带一条布局侧的同类坑：**索引卡外面那圈内边距在链接之外**。`.tb-teaser { padding: 0 }` 是死代码（`.tb-card` 的内边距写在同一文件更靠后、特异度相同，一直把它盖掉），所以每张索引卡实际有 16px 内边距裹在 `<a>` 外面：点在那圈上落在 `<article>` 上 —— 有 JS 时正是上面那个 404 的入口，没 JS 时点了毫无反应。修法是**拉伸链接**（`.tb-card.tb-teaser { position: relative }` + `.tb-teaser-link::after { inset: 0 }`）：伪元素属于 `<a>`，整张卡因此都是点击区，视觉不变。左缘那条类色条也从 `border-left: 3px` 改成 `box-shadow: inset 3px 0 0` —— border 画在卡片边框区，同样是链接够不到的地方。

### 加粗收尾紧接中文会无法闭合

`**…**` 闭合的 `**` 前面是标点、**后面紧跟普通汉字**时，按 CommonMark 的 flanking 规则不算 right-flanking，**闭不上**，页面上会直接显示 `**`。

两种写法的实测结果：

- `**附录 2（测向机原理与交会定位法**）建立模型` → **能渲染**，但 `）` 落在加粗外面
- `**附录 2（…）**建立模型` → **闭不上**，页面上显示 `**`

**修法**：让闭合的 `**` 后面跟标点/空白（例如补一个 `，`），或者让加粗范围不包含结尾的 `）`。

**排查方法**：`grep -o '<strong>[^<]*</strong>'` 看渲染结果，或在构建产物里搜残留的 `\*\*`。

## 3. 构建与测量

- **`public/` 不会被自动清空**：Hugo 默认不清目标目录（`Cleaned` 恒为 0），所以只要跑过一次 `hugo -D`，`public/` 里就会留下草稿页等陈旧产物。本地量页数与体积前**必须**用 `--cleanDestinationDir`，否则量的是错的东西（实测页数虚高 5 页，giscus 脚本的「加载页面数」也被这 5 个陈旧页面污染）
- **不能用「构建还过」来判断删主题文件是否安全**：**Hugo 会静默容忍缺失的 partial。** 最直接的证据：主题 `_partials/head.html` 在生产环境无条件调用 `partial "google_analytics.html"`，而这个文件在站点与主题里曾经**都不存在**，og:/JSON-LD 却照常渲染、构建一直是绿的。这个具体的坑已于 2026-09-18 填上（站点侧 `layouts/_partials/google_analytics.html` 是有意的空实现，只含注释、不产出字符），但**结论不变** —— 构建成功仍然不能证明删模板文件安全，因为下一条只走一次的渲染路径照样可能是缺失的。详见 [`architecture.md` 第 5 节](architecture.md#5-主题剪裁记录2026-09-12)
- **`hugo server` 会改写 `public/`**（管理页的预览就是它）：实测在干净构建后 public 里有 16 个带 `class=katex` 的页面，一启动 `hugo server` 就变成 0（而 public 里仍有 78 个 html，说明确实被写过）。于是**读 `public/` 的校验会给出假结果**——`check-katex-pairing.sh` 报「没有找到含公式的页面」、`check-links.mjs` 报坏链、`report-size.sh` 量到别的页数。注意 CI 与 `push-blog.sh` **不受影响**：`.github/actions/validate/action.yml` 里这三个检查都排在「构建」之后，构建会先把 public 刷新一遍。只有**手动**跑这些校验时要保证前面刚构建过；校验失败时先确认没有预览在跑
- **`hugo server --baseURL` 只在首次构建生效**：实测传了 `--baseURL http://localhost:1313/my-blog/` 后，页面里的菜单/favicon 一开始确实是本机地址，但**改一个文件触发重建就又变回 `hugo.toml` 里的线上地址**——本地预览里点菜单会跳到线上站点、改了图标/样式也看不到。改用环境变量 `HUGO_BASEURL=...`（每次构建都读），实测重建前后都保持本机地址。`scripts/preview.sh` 与 `tools/admin/lib/hugo.mjs` 都走环境变量
- **但资源级 `.Permalink`（封面/图片这类）环境变量救不了**：Hugo 在资源处理时就把 baseURL 烘进绝对地址，所以**跑过一次完整 `hugo`（用配置里的线上 baseURL）之后，正在运行的 preview 会跟着 emit 线上地址**——预览里封面变成空白框、图片 404，而页面链接还是本机的。判据：`curl 127.0.0.1:1313/my-blog/projects/ | grep 'src=".*covers'`，出现 `skyrim86.github.io` 就是中的这个。**修法：重启 preview**（顺序是「先完整构建、后起 preview」，别反过来）
- **别在 `hugo server`（watch 模式）跑着的时候执行 `hugo --cleanDestinationDir`**：实测 server 的 watcher 会 panic 退出（`hugolib.(*HugoSites).Build` 栈），预览直接死掉。要跑完整构建就先把 preview 停掉
- **模板里不能写 `site.Data.math-toolbox`**：Go 模板的字段名不允许连字符，写出来是 `bad character U+002D '-'` 的**语法错误**（而且报在 1:1，指向文件开头，看着像别的地方坏了）。带连字符的 data 只能用 `index hugo.Data "math-toolbox"`。同理任何 `data/` 文件名带 `-` 的都逃不掉
- **Hugo 报公式渲染错误时会「取消剩下的页面」，所以它列出的坏页可能不全**：实测一次推送里其实有 **3** 个坏页（`问题二_证明笔记.md` 107 行的嵌套 `$`、`问题三_小证明.md` 109 行多出来的 `$`、`问题三_证明_下界.md` 160 行的 `§`），而 `hugo` 只报出前两个——渲染是并行的，报错即取消未完成的任务。**所以「修完报出来的错误」不等于构建就能过**，必须重新构建到绿；`scripts/check-math-katex.mjs`（真检，逐条试渲染）能一次扫全，上面那个第三个坏页就是这一路扫出来的

## 4. 工具与脚本

- **`hugo list all` 是页面 URL 的权威来源**（`path,slug,title,date,…,permalink,kind,section`）。任何需要「这一页最终 URL 是什么」的地方都应该问它，不要自己实现 slugify + permalinks + `pathToLower`（管理页原先的第二份实现已删除）。解析它输出的两个坑：**标题里可能有逗号**（不能按逗号朴素切分）；**顶层页面的 `section` 是空字符串**。**例外**：content adapter 生成的页面（`/library/<大类>/`、`/library/<大类>/<细分>/`，见 docs/features.md ㉒）不在它输出里——它们没有对应的 content 文件，`.File` 也是 nil（碰 `.File.Dir` 会直接报错），要拿 URL 只能在模板里自己拼
- **shell `case` 的通配 `*` 会跨 `/`**，不是「一层」。`check-frontmatter.sh` 里 `content/courses/*/*/index.md` 正是靠这一点覆盖 `content/courses/<课程>/<章>/<材料>/index.md`，所以新增材料目录（`lab`、`lab-02`）会自动被覆盖。改这类模式时要意识到这一点
- **`next_weight()` 与 `next_material_weight()` 是两个函数**，别用错：前者数 `*/_index.md` 与 `*.md`（`sub`/`doc` 用），材料页是 `*/index.md`，用它永远得 1（实测踩过：`--dir lab-02` 与笔记撞成同一个 weight）
- **`.File.Dir` 在 Windows 上给的是反斜杠**（`projects\my-blog\`）：模板里 `split (.File.Dir) "/"` 会得到 1 段，按目录深度做判断（根页 / 文档页）会全部算错，且**不报错**——表现是「某些卡片上少了一整块内容」。先 `strings.Replace $dir "\\" "/"` 再切。「标题里的逗号」「section 为空字符串」是 `hugo list all` 的两个同类坑（见上一条）
- **生成二进制产物要原子写**：`tools/icons/make-icons.py` 与 `tools/covers/make-covers.py` 都先写同目录的 `.tmp` 再 `os.replace`。直接写目标文件时，正在跑的 `hugo server`（watch）会读到写了一半的 PNG/WebP，报 `cover.html:36:45: failed to load image config: image: unknown format` 并**中断那一次重建**（实测：13:44 生成封面时踩到，页面上封面暂时空白；重启预览或改一次文件即可恢复，构建产物本身没问题）
- **KaTeX 版本注释曾把警告说反**：`extend_head.html` 里原本写着「当前版本：0.18.7」，实际是 0.16.x（无前缀）。照那行注释去换 0.18.x 的 CSS 会让全站公式错版。判据与自查命令见 [`formulas.md` 第 5 节](formulas.md#5-katex-样式版本必须与-hugo-内嵌版本配对-)
- **`check-seo.mjs` 只查构建产物**（sitemap / robots / 首页 meta / RSS），和 `check-links.mjs` 一样**必须紧跟一次构建**跑：它读 `public/`，而 `hugo server` 会改写 `public/`（见上一节）。用法 `node scripts/check-seo.mjs [输出目录]`；CI 里按「只警告」接入（`validate/action.yml`），找出的问题不一定阻断发布
- **safebooru 的 dapi 有两个反直觉行为**（2026-09-18 抓「黑长直少女」背景素材时踩到，脚本留在 `../lab/shots/pick-girl-bg.py`）：① **无结果时返回的是空响应体，不是 `[]`**，`json.loads('')` 直接抛异常——看着像网络坏了，其实是那个标签组合真的 0 条（`1girl+solo+…+wide_image` 就是这种）；② `rating:general` 只是 `rating:safe` 的一个**小子集**（同一组标签实测 95 vs 437），拿 `general` 当「SFW 全集」会白白丢掉四分之三的候选。另外 `sample_url` 的长边被压到 1500，**不能当成品源**（成品要 1600 宽，会放大），它只适合拼接触表；选中的要按 `file_url` 下原图。`pic.re` 的 `file_url` 则相反：没有协议前缀（`cdn.pic.re/…`），直接喂 `urllib` 报 `unknown url type`，要自己补 `https://`
- **别在同一个输出目录上并发跑两次抓图脚本**：`../lab/shots/pick-girl-bg.py` 一次要跑上百个请求，重复启动会让两边同时写同一批文件（实测出现过「元数据写成了 `[]`，但样本图还在陆续落盘」的错位状态，看不出以哪次为准）。脚本里对已存在的图有短路复用（`get_to`），所以重跑很便宜——先确认没有残留进程再跑
- **性能量法脚本的路径可能与本机不一致**：2026-09-19 起量法脚本统一在仓库外的 `../lab/shots/`（此前 `.shots/` 与本仓库并列，`features.md` 里旧写的 `D:\blog\.shots\` 并不存在）；但 `startjank.py` **内部**还有两处写死的 `D:\blog\.shots`（Edge 的 profile 目录与输出 json），直接跑会报错。复跑时把脚本连同 `frameab.py` 复制到临时目录、只替换那两处路径，**别改原文件**（路径是别人机器上的布局）。依赖：Edge + `websockets` + `python` 都在本机可用

## 5. 导航与排序的「反直觉」

- **课程/项目的 URL 由目录名决定**，改名即改 URL（文章不同：URL 由 `[permalinks]` + 取自标题的 `:slug` 决定）。评论跟着 URL 走（2026-09-18 起 giscus 用 `mapping='pathname'`）：**文章改标题 ⇒ 换 URL ⇒ 丢评论关联**（要固定 URL 就用管理页的 `slug` 字段）；课程/项目页改标题不影响评论，改目录名才影响。换掉 `'title'` 的收益是同名标题不再串页（见第 2 节）。详见 [`content.md` 第 8 节](content.md#8-url-与内容的关系)
- **材料页的目录名不影响它的「名字」，只影响它落在哪个分组**：入口页卡片的显示名取 `title`、图标取 `icon`、组内顺序取 `weight`；2026-09-18 起 `chapter.html` 还按目录名（`notes*` / `homework*` / `lab*`）把它分进「笔记 / 习题 / 实验」组，认不出的一律进「其他」组。所以改标题、换图标不用动模板，**但目录名不再只是内部文件名**——把 `notes` 改名成 `study-notes`，那页就会从「笔记」掉进「其他」
- **课程材料页的附件不用文件名前缀**：bundle 里除图片外的资源都会进下载区
- **项目页与课程页不在首页列表里**（`mainSections=['posts']` 只放行文章），但**都会**进搜索索引、`sitemap.xml` 与 `/categories/`。词条页只列 regular page —— `CMC2026` 这种 section 形式的项目**它自己**不在词条页里，但它下面的文档页（靠 cascade 拿到标签）会正常出现

## 6. 外部体检报告里的误报

2026-09-18 拿一份外部 AI 评审报告逐条实测过，它的三条「必须修复」里有两条经复现不成立、一条早已完成。再收到同类报告，先按这节对账，别照着改。

- **「sitemap.xml 不可访问」不成立**：线上返回的是合法 XML（`<urlset>`，80 余条 `<loc>`），`robots.txt` 里也有指向它的 `Sitemap:` 行、且没有 `Disallow: /`。报告多半是**漏了 baseURL 的子路径**（查 `https://<域名>/sitemap.xml` 而不是 `https://<域名>/my-blog/sitemap.xml`）。复现方法：`curl -sI <那个 URL>`，再拿一个故意不存在的路径对照看是否 404 —— 能区分「站点不可达」与「路径写错」。现在 `check-seo.mjs` 把「sitemap 里的 URL 必须带 baseURL 前缀」变成了断言
- **「缺少面包屑导航」不成立**：`ShowBreadCrumbs = true` 一直开着，主题 `breadcrumbs.html` 在 `single.html`/`list.html` 与自定义 `page-head.html` 里都在调用，JSON-LD 里也有 `BreadcrumbList`
- **「需要集成评论系统」早已完成**：Giscus 早接好了（`[params.giscus]` + `layouts/_partials/comments.html` + 深浅色同步脚本）
- **「首页标题是光秃秃的站点名 / 汉字排版没优化」不是漏做**：中文正文字体栈、行高 1.85、两端对齐、标题衬线栈、双侧目录、阅读进度条、代码复制按钮、深浅色全部已就位。首页 `<title>` **只能**是 `site.Title` —— 主题 `head.html` 在首页直接忽略 `.Title`，要改就得整份复制该模板，与 AGENTS 规则 5/10 冲突，故不做
- **「首页最近更新的六条日期完全一样」不是 bug**：这个区块按 `.Lastmod` 排序，而 `[frontmatter] lastmod` 会回退到 **git 提交时间** —— 首次导入把 content 一次性提交，所有页面自然同一天；之后单独改哪个文件，只有那个页面的日期会变。真正缺的只是**年份**（显示格式已从 `01-02` 改成 `2006-01-02`）
- **「主题的 chroma 配色与行号样式没生效」属实但不影响外观**：`[markup.highlight]` 没设 `noClasses`（默认 `true` = 内联 style），所以 `chroma-styles.css`/`chroma-mod.css` 确实是**没有匹配元素的死代码**。但内联 monokai 的背景会被 `.md-content pre code` 的 `--code-block-bg` 覆盖，深浅色下都是一致的深色代码块。想要那套 Catppuccin 配色就把 `noClasses` 设成 `false`，代价是换掉 monokai 且需重新目视核对（见上一节那条「CSS 里搜不到类名 ≠ 渲染坏掉」）
- **「接入 Lighthouse CI」收益低于成本**：站点已有 12 步校验（含 `report-size.sh` 的单页/整站/索引体积预算）与每周 lychee 外链检查；Lighthouse CI 在 Pages 子路径下需要额外的 server 与 token，且它的产出与本地 `../lab/shots/` 那套手测量法重复
