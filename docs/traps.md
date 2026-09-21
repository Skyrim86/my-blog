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
| CI 挂在「体积报告与预算（阻断）」上，日志只有 `sort: fflush failed: 'standard output': Broken pipe` / `sort: write error`，退码 **2**，连一行报告都没打印（步骤耗时 0s） | `find … \| sort -rn \| head -1` 里的 `head` 读完第一行就退出，`sort` 还在往管道里写 → 收到 SIGPIPE；脚本开了 `set -o pipefail`，于是 sort 的退出码（CI 上是 **2**，本机 Git Bash 实测 **141**）成了整条管道的状态，`set -e` 直接中止脚本。**这是竞态**：只有生产者输出超过管道缓冲（64 KB）才撞得上 —— `themes/` 里 PaperMod 的文件够多才越线，所以同一份代码能连着过好几次，然后某一次突然红 | 别用「提前退出的读者」：求最大值用 `awk 'NR==1 \|\| $1>m {m=$1} END {if (NR) print m}'`，取前 N 行用 `sed -n '1,10p'`（sed 会把输入读完再退出）。2026-09-19 修了 `report-size.sh` 三处（`newest_of`、最重页面、单页上限）与 `check-katex-pairing.sh` 一处；`grep … \| head -1` 这类小输出管道风险低（写不满缓冲就不会触发），但同一份脚本里别留两种写法 |
| 卡片墙上「附属结论」（引理/推论/性质）缩进挂到主卡下面时，点附属结论却打开了主卡 | 把附属结论的卡片塞进了主卡的 DOM 里。主卡那张卡有一层「整卡可点」的拉伸链接（`.tb-teaser-link::after { inset: 0 }`），它盖住了卡内的所有子节点 —— 点附属结论落到的还是主卡那层链接 | 附属结论必须是**独立的卡**，和主卡并排放在 `.tb-family-kids` 里（`_partials/toolbox-wall.html`），不能嵌进主卡的 `<article>`。验收判据：点附属结论打开的是附属结论自己的卡片页（实测：点「引理 4.1」应打开 `/toolbox/thm-4-1/`） |
| 搜索框里的「匹配 N / 80」和分组按钮上的张数对不上（总数偏大） | 同一张附属结论被多个主卡共用时，每个主卡下面都渲染了一份，页面上 `.tb-card` 的数量 > 卡片总数；`toolbox.js` 的筛选原先逐张 `.tb-card` 计数 | 计数时跳过 `.tb-teaser--dup`（重复份），并按 `.tb-family` 整体决定显示与否 —— 见 `toolbox.js` 的 `apply()`。这类「DOM 数量 ≠ 数据数量」的地方都要想一遍谁在数 |
| 给卡片墙的卡片加样式（如去掉左色条）不生效 | `.tb-card[data-kind]` 那条规则在文件里**更靠后**、特异度又相同（各 0,2,0），后者胜；只写 `.tb-card.xxx` 压不住它 | 选择器带上属性：`.tb-card[data-kind].tb-teaser--dup`（0,3,0）。判据：`getComputedStyle(el).boxShadow` 里还有没有那条 `inset 3px` |
| 工具库页搜索筛选后，页面上留下一排**空框**（框和「▸ N」箭头还在，里面的卡片没了） | `.tb-family` 原本是块级元素，2026-09-19 为了把折叠箭头摆到主卡右侧给它写了 `display: grid` —— **只要元素自己设了 `display`，UA 的 `[hidden]{display:none}` 就再也压不住它**（作者样式恒胜 UA 样式，跟特异度无关）。`toolbox.js` 的 `apply()` 里 `fam.hidden = !hit` 于是变成了「藏住里面的卡、留下框」 | 自己设过 `display` 的容器都要自己补一条 `[hidden]`：现有三处是 `.tb-card[hidden]`、`.tb-family[hidden]`、`.tb-family-toggle[hidden]`（按钮是 `display:flex`，出厂又带 `hidden`，同样非写不可）。自查：`grep -n "display:" 11-toolbox.css` 逐个问「它会不会被 `.hidden = true`」 |
| 背景套切换**卡在中途**：旧壁纸的临时图层（`.bg-ghost`）留在页面上、`data-bg` 一直不换、也没报错 | 关键流程只挂在 `requestAnimationFrame` 上。**标签页在后台时 rAF 完全不跑**（不进队列，不是「慢」），于是「等一帧再动手」的那一步永远等不到；而定时器在后台会被节流到约 1 秒，所以只加 rAF 的兜底等于没有兜底（2026-09-19 实测：`visibilityState` 是 `hidden` 时切换停在半路，切回前台约 1 秒后才补完） | 「等一帧」一律写成 **rAF 优先 + `setTimeout` 兜底**（`bg-switch.js` 的 `afterPaint`）。另外两条同源经验：量测时别指望后台标签页里的 rAF（无头环境里它几秒才回调一次，要在驱动侧用截图推帧，见 `../lab/shots/bgfade.py`）；真正影响渲染的流程（淡入淡出、过渡起始值）**必须有一次真实绘制**，光改 class 会被浏览器判成同一帧、过渡不成立 |
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
| 新加的一层视觉（渐变、滤镜）「明明改了却没进对比度表」，表还是全绿 | `contrast.js` 的模型是固定的：只读 `body::before` 的背景图 url + 按视口 y 插值的蒙版 alpha，**`background-image` 里的额外渐变层、`::after`、`filter`/`backdrop-filter` 它全都看不见** —— 不报错，只是不参与 | 与第 57 条同一族。要么别把保护建在这些层上（保护只认 `background-color` 的实心半透明色），要么把这类层放到 `body::after` 并**在注释与文档里写明「这一层测不到」**，同时把它的 alpha 压到可忽略（≤.28）并用截图 + 像素抽检兜底 |
| 面板**内**的文字被脚本判成不合格（首页改版后 4.23），抽真实像素却是达标的 | 上一条的反向情形：「看不见」不等于「偏乐观」。`backdrop-filter: blur()` 会把壁纸的亮点**抹匀**，于是面板内文字的真实对比度比脚本那个「没有模糊」的模型**更高**（2026-09-19 实测：深色少女套首页脚本 4.23，真实 4.75~4.88；把 blur 关掉再采同一片区域会掉到 4.03） | **先判定方向再决定改不改**：把面板的直接子元素 `visibility: hidden` 后截图，**避开圆角**采样区域取最坏像素（圆角外那几像素采到的是壁纸，会报出 1.x 的假值 —— 踩过）。真实值达标就照实在文档里记下来，别为了模型去改设计 |
| 明暗切换**没有过渡**（照样硬切），但 CSS 与 JS 都在、控制台干净 | 过渡类是脚本在 `MutationObserver` 的回调（微任务）里加的，而**只要有人在那之后、下一次样式计算之前读一次样式**（`getComputedStyle`、量尺寸都会强制样式计算），属性翻转就先被算掉了 —— 类赶到时「旧值 → 新值」已经发生，过渡不启动。自测脚本、giscus 的主题同步都可能在这个窗口里碰样式（实测踩到：检查脚本自己的 `getComputedStyle` 把过渡掐没了） | 类在**捕获阶段的 click 里、属性翻转之前**加（`assets/js/theme-fade.js`），observer 只作兜底。判据：点一下之后 ~120ms 采样面板的 `backgroundColor`，应读到**中间色**（如 `rgba(123,121,126,.8)`）而不是终值 |
| 明暗切换时**壁纸不再交叉淡入**，直接跳过去 | `20-theme-fade.css` 里那条 `!important` 过渡把 `.bg-ghost` 也命中了：临时图层自带的 `transition: opacity 250ms` 被整条顶掉，只剩颜色过渡、没有 opacity，淡出变成瞬间消失 | 选择器写 `*:not(.bg-ghost)`（现在就是），改那条规则时别把这半条丢了。机制见 [`features.md` ⑫](features.md) 的「明暗切换的过渡」 |
| 给控件加边框之后**导航换行点变了**／顶栏菜单冒出横向滚动条 | `border` 占进盒尺寸（每项 +2px）。菜单是 flex 行，1024px 视口下内容区只剩十几像素余量（实测：加了 `border` 的那一版菜单宽度从 625.2 涨到 641.2） | 这类边一律用 `box-shadow` 画环（不占尺寸）；要加内边距就按 [`features.md` ㊱](features.md) 那份等式一并把间距配平（`14n = 16(n-1)`，n=8 是唯一整数解），**改菜单项数量要重新配平** |
| 卡片 / 徽章上的**名牌文字**压在**任意画作**上，字看着糊、对比度不够 | 半透明名牌底的可读性取决于它下面那张画：底只有 58% 不透明度时，浅色画（2026-09-19 的「书桌」那张整幅都浅）会把底抬到约 129 的灰，白字掉到 **2.6:1**。**构建期看不出来、对比度脚本也测不准**（它只合成 `background-color`，不合成图片） | 名牌底做成**从上到下加深的渐变**（.62 → .92）：最坏情况（底下纯白）估算仍有 5.4:1，实测最浅那张卡 5.45:1。**并且要同时给一份实心 `background-color`**：脚本只合成 `background-color`，只写渐变会让它报 2.7:1 的**假失败**（实测踩到）—— 实心色喂模型、渐变喂肉眼。同类「压在图上」的文字（封面图标题、未来任何叠加层）都按这条：先把底垫厚，再抽真实像素复核 |
| 首页副标题的**玻璃底衬 / 入场动效失效**（页面看着只是「淡了一点」，不报错） | 加了 `.home-hero` 容器之后副标题不再是 `.profile_inner` 的直接子项，而玻璃底衬清单（`00-theme.css`）与入场动画（`09-home.css`）都写在 `.profile_inner > span` 上 | 两处同步改成 `.home-hero > span`。**2026-09-21 又改成类名 `.home-hero-subtitle`** —— 那次换选择器的直接原因是同一个结构选择器反向误伤了新加的头像壳（见第 97 条），等于把这条地雷一并拆了：现在四处（底衬、副标题样式、两条入场动画）都认类名。**同类选择器**（带结构假设的那些）改版式后要一并核，判据是 `getComputedStyle(el).backgroundColor` 里还有没有那层 `--glass-tint` |
| 往首页 hero 里新加的图**被裁成圆形**，或窄屏下**尺寸忽然跳到 85%** | 主题给头像写了两条会命中「hero 里任何一张图」的规则：`.profile img { border-radius: 50% }`（`profile-mode.css:20`）与 `@media (max-width: 768px) { .profile img { transform: scale(.85) } }`（`zmedia.css:8`）。它们的权重是 (0,1,1)，比单个类 (0,1,0) 高 —— 只写 `.home-chara { border-radius: 0; transform: none }` **压不住，而且不报错** | 覆盖规则要带上 `.profile` 这一层：`.profile .home-chara`（(0,2,0)）。判据：`getComputedStyle(el).borderRadius` 是 `0px`、`transform` 是 `none`；改宽度时 Height 必须配 `height: auto`，否则高度锁在属性值上会被纵向压扁 |
| 白底插画抠图，人物身上**出现透光的洞**（或反之：深色主题下一圈白边） | 两条对立的坑，取决于人物身上有没有接近背景色的区域。**全局色阈值**在「人物身上有纯白」时把该区域打穿（实例：绫华 Q 版那张的袜子实测 `(255,255,255)`，与画布边缘不连通但会被阈值命中）；**按暗度反解 alpha**（`a=(255-灰度)/(255-墨色)`）在「厚涂的淡色人物」上把整片浅色算成近乎透明（那公式假设轮廓是墨线压白，暗 = 覆盖度高） | **先找原生透明素材，再考虑抠图**：safebooru 上搜 `transparent_background` 标签拿到的就是带 alpha 的 PNG，白边/咬洞/反解那一整套坑都不存在（2026-09-19 首页那张场景插画就是这么找到的）。非要抠就得先量：「背景过渡带 / 人物最淡处 / 各部件」的差值分布，人物身上有纯白 → 用**从画布边缘灌水**（容差卡在「人物最淡处」之下）；厚涂淡色 → 不要反解 alpha，改成**前景 mask 向内收 1px** + 1px 软边。两条都必须**看预览图定**（`make-*-*.py` 会把深/浅两底的预览写到 `../lab/shots/`），脚本跑通不等于抠对了 |
| 收首页左栏的间距、页脚**纹丝不动**（首屏里总差最后一条） | 首页的页脚位置**不是**由 hero 的高度决定的，是主题给 `main` 的 `min-height: calc(100vh - --header-height - --footer-height)`（`main.css`）钉住的 —— 而它不知道我们在页脚**下面**还挂了一条 `.footer-rss`（约 37px），于是 1440×950 下总高正好 990。这个 min-height 撑出来的空白**加在 profile 与页脚之间**，所以从 hero 上省下的每一像素都被它吃掉（实测：收了两轮间距、hero 上移 23px，页脚一动不动） | 在首页覆盖那个 min-height（`09-home.css` 的 ≥1024px 块里）：`calc(100vh - var(--header-height) - var(--footer-height) - 40px)`，40 = RSS 块 37 + 主题对 header/footer 的估值 120 与实际 123 的差。header/footer 用**主题的变量**而不是写死数。判据：`document.documentElement.scrollHeight <= innerHeight` 且 `footer.getBoundingClientRect().bottom < innerHeight` |
| 某张卡在高分屏上**发虚**，别的卡都清楚 | `crop: figure` 的窗高**受源图高度限制**，而「源图长边压到 700」这条口径是按**竖构图**定的：横构图的长边落在宽度上，高度只剩 400 上下，5:7 的窗最高就是 400 → 出 600×840 要放大 1.5 倍、再出 544 那档就是 1.7 倍（2026-09-20 在 ayaka-15 上实测：1759×1126 的横图压成了 700×448） | 横构图的源图用 `tools/cards/fetch-sources.py --long-edge 1400`（高度回到 800 上下，出图与 544 档都是降采样）。脚本现在按**短边**报警（< 540 时提示「2x 档要靠放大 —— 横构图请给 --long-edge 1400」），别再只看长边 |
| 给叠加层加了 `mask-image` 之后，同一条规则上的**内亮边（inset box-shadow）少了一截** | mask 会把**整个元素**（背景图、边框、阴影）都按遮罩裁掉，不只是背景图。玻璃风格的上半圈内亮边原来画在 `::before` 上，而 `::before` 现在带了一个「上半透明、下半实心」的 mask | 把这类装饰边画到**别的层**上：玻璃那条改成卡片自己的 `box-shadow: var(--shadow-card), inset 0 0 0 1px …`（不占盒尺寸，也不受 `::before` 的 mask 影响）。判据：截图里看整圈亮边闭不闭合 |
| 清单里**明明写了** `credit_url`，校验脚本却报「没写」 | `scripts/check-deck.mjs` 的键名正则原来是 `[A-Za-z]+`，**不认下划线** —— `credit_url:` 这一行整个被跳过（不报错，只是那个字段永远读不到）。同类风险在 `check-cards.mjs` / `gen-cards.mjs` 的行解析里也存在 | 键名写成 `[A-Za-z_][A-Za-z0-9_]*`。判断这类「行解析 YAML」的脚本有没有踩到：拿一个带下划线的字段故意写错，看它报不报 |
| 进度条（或任何 CSS 动画）**只有第一次跑**，之后不再重播 | 连着对同一个元素「移除类 → 加回类」，浏览器不会重启动画 —— 中间没有任何样式计算的机会（JS 里换了 `src` 与名牌文字都不影响这一点） | 中间**强制一次回流**：`el.classList.remove('is-running'); void el.offsetWidth; el.classList.add('is-running');`（`assets/js/home-deck.js` 的 `restartProgress()`）。判据：连切三张卡，每张都从 0 走到 100% |
| 关掉弹层后**按 Tab 会从页面开头重来**（键盘用户） | 恢复焦点时用了「打开弹层前谁有焦点」，而弹层是 `zoomBtn.click()` 这种**程序化点击**打开的 —— 程序化 click 不移动焦点，所以那个「之前」根本不是放大按钮（实测恢复到了 `.list` 上） | **把焦点还给打开它的那个控件**（`zoomBtn.focus({ preventScroll: true })`）。只有一处入口的弹层，「还给入口」比「记快照」既简单又正确。判据：`document.activeElement` 是那个按钮 |
| 新加的卡面风格在**深色主题下消失或白成一片**（浅色下正常） | `--coverlay-op` 的深色值是**逐条给的**（`21-card-deck.css` 末尾那段），新增风格不补就落到默认那条 `.3`：用 `screen` / `color-dodge` 的风格在深底上提亮很猛、会白掉，`multiply` 那类则被压到看不见。另外 `::before` 用 `screen` 时黑色等于什么都没做 —— 暗角挂它会完全失效 | 新风格必须同时补一条深色值（`:root[data-theme="dark"] .home-card--X { --coverlay-op: … }`）；要让画面变暗的层（暗角）只能放 `::after` 并给 `mix-blend-mode: multiply`。判据：明暗两套各截一张风格对比图（`../lab/shots/deck2/styles-final-*.png` 就是这么出的） |
| 卡面纹样看着**像尺子画的**（纱窗/网格），不像手绘 | 纹样是用 `repeating-linear-gradient` 的 **1px 硬停**画的（`rgba(…,.34) 0 1px, transparent 1px 11px`），数学上就是一组完美的等距直线 —— 272px 下一屏几十条，眼睛立刻认出是机器画的。2026-09-20 量过：织锦一张卡约 **394 条**、麻叶纹 ≈97、和纸 ≈89、全息 ≈89 | 两件事一起做：① 线改成**软渐变停**（亮芯偏在一侧 + 一圈淡晕，如 `0 2.6px → 3.4px 亮芯 → 5px 淡晕 → 6.8px`），周期取互质数、每层错开 `background-position`；② 挂一个**共享的 SVG 位移滤镜**（`feTurbulence` + `feDisplacementMap scale=3`，内联在首页 partial 里）当「手抖」，一处生效、十四种共用。判据：把对比图放大到 2 倍看，直线应当有可见的起伏与宽窄变化。`check-deck.mjs` 现在会扫「1px 硬停的 repeating 渐变」并阻断 |
| `filter: url(#某id)` **没有任何效果**，页面照常、控制台干净 | 滤镜 id 拼错或那段内联 `<svg>` 没渲染出来时，`filter` 属性只是「引用了一个不存在的滤镜」—— CSS 与 SVG 都不报错，表现就是「看不出差别」（颗粒/手抖全没了）。这类静默失效正是这个仓库反复强调要拦的 | 滤镜定义**必须内联在文档里**（data-URI 里的 filter 在 WebKit 上不可靠），并让脚本核对 id：`check-deck.mjs` 会把 `21-card-deck.css` 里每个 `url(#x)` 与 `layouts/_partials/home-cards.html` 里的 `id="x"` 对一遍，缺一个就阻断 |
| 用 `feTurbulence` 做的颗粒**看着像电视雪花**、或者平铺处有接缝、或者颜色发脏 | 三个都常见：① 少了 `color-interpolation-filters='sRGB'` —— 滤镜默认在 **linearRGB** 里算，输出与设计工具里看到的不是一回事；② 少了 `stitchTiles='stitch'`，平铺边界露馅；③ 滤镜里没有 `feGaussianBlur`，逐像素的硬噪点就是雪花，加上 `stdDeviation='0.35~0.5'` 才成纸面 | 三个参数固定写全（见基础规则里的 `--grain*` 令牌）。另外颗粒层是**不透明的噪声矩形**、是背景层栈里的一层，**强度要烘进 alpha**（`feComponentTransfer` 的 `feFuncA slope`，取值 .10~.18）—— 按遮罩的思路给 .35 就等于给整张卡盖了一层 35% 的灰纱，下面的纹样全糊（第一版实测） |
| 用 SVG 路径当 **mask** 有形状，但形状**跑到卡片角落**或整个不见 | 那条 SVG **只有 `viewBox`、没有 `width`/`height`** 时，作为 CSS 图片的内禀尺寸是 undefined，浏览器按 300×150 兜底，再被 `mask-size: 100% 100%` 拉伸到卡片尺寸 —— 形状的坐标系就错位了（实测：272×381 的裂缝只剩角落里两小段）。另一类是自己画形状时忘了平铺的 tile 中心：`<path d='M0 0 L…'>` 全在 (0,0)，tile 56×48 里只有右下四分之一可见 | 每个形状 SVG 都写上**显式 `width`/`height`**（与 `viewBox` 一致）；平铺用的 tile 把整朵/整片**平移到 tile 中心**（`<g transform='translate(36 31)'>`）。判据：把该令牌当 `background-image` 铺在一个纯色块上，形状应当出现在预期的位置 |
| 新风格在**浅色画上不见了**（或深色画上不见了），但换一张画就正常 | 混合模式与画作明暗的相互作用：`screen` 是「提亮」，压在本来就接近白的画上等于什么都没做（金继第一版的金色裂缝放在「木刀」那张浅画上完全看不见）；`multiply` 是「压暗」，压在深色画上同理。而首页这 32 张卡里浅色画占多数 | 加「亮材料」（金、霜、雪、光）优先用 `normal` / `soft-light` / `overlay` + 半透明颜色；真要 `screen` 就把对比图做成「**同一批风格 × 浅色画 + 深色画**」两组一起看（`../lab/shots/deck2/styles-final-v2-*.png` 就是这么出的），别只挑一张画试 |
| 玻璃的**高光跑到下半张**、卡变成「上平下发白」 | 高光层挂在 `::before` 上，而那一层带着「磨砂只做下半张」的 `mask-image` —— mask 会把该元素上的**所有**背景层（含高光）一起裁到 mask 的形状里。玻璃的 mask 是「上透明、下实心」，于是高光全被推到底部 | 高光与边缘折射改挂**不带 mask 的层**（`.home-card--glass::after`，代价是这一种没有换卡扫光；金继的暗角也早就这么换掉了）。判据：明暗两套截图里看高光是否落在**左上**（光从上面来） |
| 换卡的过渡里，卡片**有一瞬是空的**（像闪了一下） | 只有一张 `<img>`，而过渡是「先淡出到 10% → 换 `src` → 再淡入」：换 src 的那一瞬旧画面已经没了、新画面还没画出来，中间那 200ms 卡上几乎没有东西 | 用一张**残影**（`.home-card-ghost`）装住刚显示过的那一张：它的 URL 就在缓存里（不多下一次请求），主图立刻换成新的，两张做交叉淡入 —— 没有空白帧。顺带把方向做成位移（`.is-next` / `.is-prev`），一眼能看出是往哪边翻。判据：连点十下，任何一帧都不该看到「空的卡」 |
| 无头浏览器里 **WebGL 页面截出来一片黑、控制台却干净** | `--headless=new` 下 Chromium 从 2024 起默认不提供 GPU 后端、也不再静默回退到软件渲染，`canvas.getContext('webgl2')` 直接返回 null。而「黑屏」与「画面本来就是黑的」在截图上看不出来 —— 拿这种图做验收等于假通过。**2026-09-21 复测更正**：本机 Edge 的 `--headless=new` 已经能拿到真 GPU（`WEBGL_debug_renderer_info` 读出 `ANGLE (NVIDIA GeForce RTX 5060 Laptop GPU, Direct3D11)`），所以「headless 一定黑屏／一定软渲染」不再成立 —— 但**结论没变**：截图前仍要先读一次 RENDERER 字符串，它随 Edge 版本与机器而变，读到 SwiftShader 就别拿那张图判断画质 | `lab/shots/shots.py` 加 `--gl swiftshader\|gpu`（默认软渲染保证可比，关键观感另拍一组真显卡对照），并先跑探针页 `lab/shots/gl-probe.html` 确认拿到了上下文与真实 RENDERER 字符串。**判据不能只看截图**：探针用 readPixels 数颜色种类（软/硬渲染实测 1612 vs 1599 种） |
| 3D 画布被**压扁**成 2:1（430×215，而不是 5:7 的 430×602） | 台面是 `display: grid; place-items: center`，而 grid 项的高度不是「确定」高度，子元素的 `height: 100%` 会解析成 `auto` —— canvas 于是退回自己的**固有比例**（`width`/`height` 属性默认 300×150） | 画布与大图都改成 `position: absolute; inset: 0`（绝对定位取的是台面已经算好的盒子，与 `aspect-ratio` 一致）。判据：断言画布盒与台面一致（`card3d.stats()` 里报了画布尺寸） |
| 卡片**自己转飞**（轻甩一下变成转好几圈，或回弹后停在 -85 弧度） | 弹簧/惯性的显式欧拉里阻尼项是 `vy * C * dt`，而 dt 会被慢帧撑到 0.05s，此时 `C·dt = 26×0.05 = 1.3 > 1` —— 每步速度翻号且放大，数值解直接发散（真机卡顿时同样会撞上，不只是无头环境） | 积分**分子步**：`integrate()` 把 dt 切成 ≤4ms 的子步（最多 24 步，`C·h = 0.104` 稳定）；惯性速度另加限幅 `INERTIA_MAX`，否则「轻甩」的总行程是 `v/(1-衰减)`，实测能到 7 弧度 |
| 3D 卡里**抬起来的主体在转动时戳出卡片轮廓**（头发越过卡边） | 网格位移只改 z，但抬起来的点在卡片转过角度后会**横向投影**到轮廓之外。物理上浮雕确实在卡面之前，观感上却像穿帮 | 位移在**靠近卡边处收敛到 0**（顶点着色器按圆角矩形 SDF 做 `smoothstep(0, 0.055, 到边距离)`）—— 这也是真压凸卡的边界条件：模具压不到离边太近的地方。判据：0°/26°/46°/63° 四张斜视图里主体轮廓都应当在卡边之内 |
| 翻面按钮的**文字与状态反着来**（已经翻到背面却写着「翻到背面」） | yaw 会随拖拽一直累加（甩两圈就是 12 弧度），而「现在看的是哪一面」的判据是 `|yaw| > π/2` —— 2π 等价于 0（正面）却被判成背面 | 每次停稳时把角度**折算到 (-π, π]**（`wrapAngle()`），一切「哪一面 / 还差多少度」的判断都在折算之后做 |
| 取景「整幅装进卡面 + 补边」→ **卡面两侧/上下露出空带** | `figure` 的口径原本要求画面内必须留出 16% 呼吸，装不下就退化成「整幅缩进 + 纯色补边」—— 实测 **32 张里 20 张**走的是这条路，卡面两侧于是各留一条色带。用户连续两轮指出这一点 | 口径改成**填满**：窗口按人物宽度定、纵向裁成胸像（头 + 上身），腿可以切、**头不能切**（窗口上沿 = 内容最上一行 − 留白，下面的夹取只会把窗口往下推、不会推到内容上沿以下）。两条「整幅缩进」的退路从生成器里删掉了。判据：比较卡面最外侧一列与往里 8% 处的颜色跳变（空带 = 又平又跳），63 张现在全为 0 |
| 等级覆膜在**浅色画上完全看不见** | 覆膜层用了 `mix-blend-mode: screen` —— screen 是「提亮」，压在本来就接近白的画上等于什么都没做。**这条坑 traps 里已经写过（第 84 条）**，我在等级这一版又踩了一遍 | 换成 `overlay`（跟着底子明暗走，浅画深画都读得出来）。加亮/加光的层一律先问一句：这张画是浅的还是深的？两种都要试 |
| 「在背面停留 1.5 秒」这条触发**永远不生效** | 判据写在 `update()` 里，而那张卡**停稳之后动画循环就停了**（这是刻意的省电行为）—— `update()` 不再被调用，检查自然永远不执行。更隐蔽的是：它不报错、相关代码也「看着对」 | 计时改用 `setTimeout`（与渲染循环解耦）。判据属于「时间」而不是「帧」时，就别挂在帧循环上 |
| 翻面按钮到背面时**同样不触发**（上一条修完仍然不触发） | `flip()` 刻意**不调用** `settleTarget()`（调用它会把刚设好的目标覆盖掉，「翻面」就永远翻不过去），而「停在背面」的记账写在 `settleTarget()` 里 —— 于是按钮这条路绕过了记账 | 把「现在停在正面还是背面」抽成共用函数 `noteFace()`，拖拽松手与翻面按钮两条路都走它。**绕过一个函数时，要想清楚它身上还挂着哪些副作用** |
| 片元着色器**编译失败**，卡片整块回退成平面大图 | 新加的卡边材质那段用到了 `fres`，而 `fres` 在它之后才定义。GLSL 不报「用了后定义的变量」这种语法错，只是在编译期失败 —— 而失败路径是回退（不静默，但功能全没了、页面上只是「3D 没出现」） | 改完着色器**先跑一次 `data-gl` 与 `stats()` 的断言**（本仓库的 `--js` 那一套），别只看截图「好像有画面」。着色器里的插入位置要靠变量定义顺序核对，不能靠代码块看起来顺眼 |
| 新加的元素**凭空多出内边距 / 底纹 / 入场动画**（不是少了，是多了） | 结构选择器**反向误伤**：`.home-hero > span` 这类写法本意只指副标题，但容器里多一个同标签子元素就一起命中。2026-09-21 给头像加装饰壳（`<span class="avatar-halo">`）时，**四处**规则同时命中它（`00-theme.css` 的玻璃底衬、`09-home.css` 的副标题样式与两条入场动画），表现是头像多出 `.12em` 内边距和一块玻璃底 —— **四份规则一个都没报错**。注意第 70 条记的是它的反面（结构一变、旧的命中不到），同一个选择器两种坏法 | 容器里的元素**一律用类名**，别用 `X > span` 这种带结构假设的选择器（本次把副标题改成 `.home-hero-subtitle`，四处一并换掉）。判据：改完版式/结构后，对新加元素打一次 `getComputedStyle(el)` 看 `padding`/`backgroundColor`/`animationName` 是不是「本来就该有的值」，别只看页面像不像坏了 |
| 改前/改后截图有 **1~2% 的差异，位置集中在左侧目录栏**，但页面正文完全一样 | 浏览器会**恢复上次的滚动位置**，而 `reading-progress.js` 按滚动位置算「当前小节」并可能滚动目录栏自身；两次拍摄落在不同滚动位置 ⇒ 目录高亮项与栏内 `scrollTop` 不同。这一条会把「没改动的部分」报成差异，最难查（bbox 只覆盖目录栏，看着像真的动了） | 截图前固定四件事：`history.scrollRestoration='manual'`、`documentElement.style.scrollBehavior='auto'`、`scrollTo(0,0)`、**再派发一次 `window.dispatchEvent(new Event('scroll'))`** —— 已固化在 `../lab/shots/beautify/capture.sh`。第四件是 2026-09-21 补的：站上两个悬浮按钮（主题的 `#top-link` 用 `window.onscroll`、本站的 `#bottom-link`「一键到底」用 `addEventListener('scroll')`）都靠 scroll 事件决定显隐，而 `#bottom-link` 的初始 `sync()` 跑在页脚解析时 —— 那时字体与看板娘图还没加载、页面高度不是最终值，「离底还有多远」这个判据在加载期算出来是错的，之后又没有 scroll 事件来纠正；症状是 about 页在改前/改后各拍到过一次那个 42×42 的向下箭头，看着像「站点多了个按钮」，其实是竞态。**判据：同一份构建连拍三次必须逐像素一致**，不一致就先修量法。另：吸顶改动会让目录栏文字的抗锯齿变一档（合成层变化），那种差异几何量仍逐字相同（`rail` 矩形、`scrollTop`、`document.documentElement.scrollHeight`），**先对几何量再判断是不是真位移** |
| `prefers-reduced-motion` 的分支**永远测不到**，改了什么都不知道 | 无头 Edge 默认只报 `no-preference`，那个媒体查询里包着的规则（入场动效、卡片组、进度条、`22-reveal.css`）在测试里从来没生效过 | `python ../lab/shots/shots.py --reduced-motion ...`（内部用 CDP `Emulation.setEmulatedMedia`，2026-09-21 加）。判据不只是 `matchMedia` 变 true，还要看**被门禁的脚本是否整个不介入**：课程章节页载入时 `.reveal-pending` 应当从 2 变成 0 |
| 模板里写的站内绝对链接**部署后才 404**（本地 `hugo server` / serve `public/` 时看着都正常） | `relURL "/courses/"` 对**以斜杠开头**的参数原样返回，不加 baseURL 子路径。实测对照：`relLangURL` 吃 `library/algebra/`（不带前导斜杠）才补成 `/my-blog/library/algebra/` | 模板里写 `{{ strings.TrimPrefix "/" .href | relLangURL }}`，数据文件里就还能照常写 `/courses/`。兜底的是 `scripts/check-links.mjs` 那条「站内绝对链接但没带 baseURL 子路径，部署后会 404」——关于页拼贴的第一版就是被它抓出来的 |
| CSS 写对了、页面却毫无反应（**不报错**），比如 `@view-transition` 加了但转场从不触发 | 构建链里的 CSS 压缩器会把**它不认识的 at-rule 整条丢掉**：实测产物 stylesheet.css 里 `navigation:auto` 匹配数为 0，而同文件的 `view-transition-name` 与 `::view-transition-*` 都原样保留 —— 名字和动画都在、开关没了 | 把这条 at-rule 挪出 `css/extended/`（那里会被 `resources.Concat` + `resources.Minify` 串进去压），单独放 `assets/css/`、由模板不压缩地外链（与 `css/bg-image.css`、`css/nav-icons.css` 同一种接线）。判据**不能是「产物里有这条规则」**，要功能探针：View Transitions 用旧页面的 `pageswap` 事件里 `event.viewTransition` 是否非 null。同类：老式的 `<meta name="view-transition">` opt-in 在本机 Edge 下不生效（试过） |
| 同一条 CSS 里**后半截规则集体失效**，前面几行却好好的 | 手改 CSS 时把一段说明的注释定界符（`/*` 或 `*/`）弄丢了，那几行中文成了**裸 token**：浏览器只把坏 token 丢掉、**不报错**，解析器恢复时还会把紧随其后的一条规则一起吞掉。实测症状：`.footer` 的 `view-transition-name` 生效、`.header` 的不生效（`.header` 正好排在裸文本后面） | 改完 CSS 用工具数一遍产物里的规则条数（`document.styleSheets` 里那份表的 `cssRules.length`），或直接 `getComputedStyle` 查被吞的那条属性。**解释性文字一律留在注释块内**，别裸放在规则之间 |
| 把内容**推到底部**（例如「让这块面板的底边与左栏齐平」）之后，右下角那块内容被看板娘压住 | 看板娘是 `position: fixed` 贴在视口右边缘的，而正文列在中等宽度下几乎顶到视口边缘 —— **横向让不开，只能纵向让**。实测 1100px 视口：面板右下角被压 54×27px，正好盖住最后一条的日期（1024px 压 63×16px；>1400px 时正文列右缘离她有 173px，不撞） | 给那一档宽度留出她的高度：`@media (min-width: 1024px) and (max-width: 1400px) { .home-recent { margin-bottom: calc(var(--float-bottom) - 4rem - 1.2rem) } }` —— 高度读她自己那套变量、不手抄第二份数字。**自查方法**：量 `getBoundingClientRect` 的相交（`dx>0 && dy>0` 即碰撞），别只看截图 —— 她盖住的往往是一列日期这种「不说话但重要」的内容 |
| 用「从 A 注释到 B 注释」的区间替换改 `09-home.css`，**把区间外的规则一起删掉了** | 这个文件里**注释的分节顺序不等于规则的分节顺序**：`.home-browse, .home-recent, .home-clock { … }` 那组面板共享规则（还有标题行、chip、最近更新的整组）夹在「首页时间卡」与「卡片组」两个注释之间，按注释找端点做区间替换就会把它们整段吃掉。症状是**不报错**：面板玻璃底、内边距、左对齐全没了，文字退回 `text-align: center`、日期黏在标题后面 | 改这个文件别用注释当端点：先把要换的那段**精确选中**（或先 `git diff --stat` 看一眼删除行数对不对）。删完立刻 `git diff <文件> | grep "^-"` 数一遍被删的规则选择器 —— 那次删了 154 行，其中 12 条规则是别人的 |
| 往一个元素写 `textContent`，**它里面的兄弟节点一起消失了**（不报错） | `el.textContent = x` 是替换**全部子节点**，不只是替换文本。时钟卡片里日期与问候语同在一个 `<p>`，日期那一行 `textContent` 一写，问候语那个 `<span>` 就从 DOM 里没了 —— 表现是「那一小块永远不显示」 | 要往「多个片段的容器」里填字，就填进各自的子 span（本站时钟是 `.home-clock-date-main`）。自查：`grep -n "textContent =" assets/js/*.js`，逐个问「这个节点里还有别的元素吗」 |
| 绝对定位的短文本**竖着排成两行**（`47` 显示成 4 和 7） | 绝对定位元素在 `left: 100%` 处可用宽度为 **0**，而宽度默认按「收缩到合适」算 —— 于是每个字符折一行 | 补 `white-space: nowrap; width: max-content`（本站时钟的秒数就是这两条）。同类：`overflow: hidden; text-overflow: ellipsis` 的 flex 项也要 `min-width: 0`，否则压不下去 |
| 加一个 `<script>`/样式表标签，**每页 HTML 的涨幅远大于脚本本身** | 指纹与 SRI 是随机串，**压不动**：体积极小但每页都要写一遍 | 心里有这笔账：2026-09-21 的两个新脚本自身只有 372 + 637 ≈ 1 KB gzip（且缓存一次就够），而每页 HTML 多约 **180 字节**（整站 gzip 6339 → 6377 KB）。要省就合并成一个文件（本次按「一个职责一个文件」的既有约定，没合） |
| 一块内容**越过自己的盒子、画到下面的兄弟元素上**（数字互相压在一起，控制台干净） | 两件事叠在一起：`grid-auto-rows: 1fr` 里的 `1fr` 是 `minmax(auto, 1fr)`，**行带内容最小高度**；而 grid 自己作为 flex 项时默认 `min-height: auto`，**压不下去**。于是外层被压矮时它不缩，直接溢出盒子往下画。实测（2026-09-21 打卡月历）：1024px 宽那档填充区只有 104px，而月历自然高约 180px，格子行高被压到 5.9px 时数字就糊成一片、还盖在下一条进度上 | 行高写 `minmax(0, 1fr)`，并给 grid 自己补 `min-height: 0`（两处都要）。更根本的办法是**别硬塞**：那一档改出退化形态（本站是「本月 mini 条」），为此还实测了卡高的跳变点（1400→1410）来钉媒体查询的阈值 |
| 往时间卡头部加一个元素，**下面月历的行高莫名变矮**（或整卡高度变了） | 头部那一行的高度由最高的子项决定；新元素只要高过时间那一行（实测 50px），头行就被顶高，而卡的总高被 `.home-clock` 的 `flex: 1 1 auto` 钉在 436 —— 差额只能从下面那块填充区里扣（实测头行每涨 10px，月历六行各矮 1.7px）。同时 `align-items: baseline` 会让新元素**按自己的基线**参与对齐，比 `align-self: center` 更容易把行顶高 | 新元素定高 ≤ 头行高并 `align-self: center`（本站微卡定 36×50）。**改完必须回头量头行高**，别只看那块新东西好不好看 |
| `data-*` 文案填好了、脚本里取到的却是空串（不报错） | `read()` 这类助手取的是**某个固定元素**的 `dataset`（本站全部取 `.home-clock` 这个 section），而属性写在了它的子元素上 —— `el.dataset[key]` 返回 `undefined`，`.replace` 之类通常又把它变成 `""`，于是 aria-label 静默为空。这一族坑在本仓库是**第三次**：卡片组那次是写在 `<script>` 上、导航那次是拼错了属性名 | 文案属性**一律挂在 read() 的那个元素上**（状态属性如 `data-pending` 才跟子元素走）。自查：`grep -n "dataset\[" assets/js/*.js` 对一遍「从哪个元素取的」，再在页面上 `el.getAttribute(...)` 抽查一条真正的值 |

| 卡片墙里的卡被**拉高**（5:7 变成细长条）、上下行贴在一起、卡下的名字被挤没 | `.home-card` 的基类**没写 `display`**，而它在首页那处是 `<div>`（块级，所以一直没暴露）。收藏库把它放进 `<button>` 里 —— button 的内容模型只允许 phrasing content，塞 div 是非法 HTML，只能写成 `<span>`，而 **inline 盒子会忽略 `width` 与 `aspect-ratio`**：壳子按行盒排，`::before`/`::after` 那两层覆盖画到比画作大得多的框上 | 基类显式补 `display: block`（一处生效，首页是 div、本来就是块级，无副作用）。自查：组件被搬进新容器时，量一次 `getBoundingClientRect` 的宽高比是不是它该有的（本站卡是 5:7），别只看截图 —— 拉伸后的卡「也像一张卡」 |
| 点一格卡片墙**开出的却是下一张**（点「白鹭」显示「星夜」），而且首屏每 6 秒有一格自己在换 | 复用首页那支脚本时，轮播判据写成「容器里有没有 `.home-card`」——而卡片墙的**每一格里就有一个** `.home-card`（卡面本身），于是 63 格全被判成「有轮播卡」：墙根节点上的点击监听同时触发了 `go(1)`，自动轮播也起来了（在第一格上换图） | 判据两层：轮播卡只认**直接子元素**（`:scope > .home-card`），并且由模板显式声明（首页容器带 `data-deck-carousel`），不靠 DOM 形状去猜。自查：一段「有没有 X 元素」的判据被复用到新容器时，先数一下那个选择器在新容器里会命中**几个** |
| 把一段「按 id 被 CSS 引用」的模板片段抽成 partial 之后，某一页**悄悄少了那个效果**（不报错） | `filter: url(#deck-rough)` 是按 id 找的（同前面那条手抖滤镜）：定义被搬进 `deck-filters.html` 之后，没 include 它的那一页照样渲染，只是那张卡没有手抖/颗粒感 | 谁用谁 include，并且让守卫盯住这件事：`check-deck.mjs` 现在除了核 id 在不在，还会核 `home-cards.html` 与 `deck-wall.html` **都 include 了** `deck-filters.html` |

| 「今日一卡」点下去**没反应**（按钮在、样式对、控制台干净） | 那一块按下标调卡片组的 `openAt`，而卡片组 2026-09-21 起**只轮当天随机抽的 12 张**（`data-deck-daily`），时间卡却自己去解析了整副 63 张 —— 它抽中的卡常常不在这 12 张里，下标越界被 `openAt` 的边界判断挡掉，**不报任何错** | 跨脚本共享「同一份池子」时，池子只能有**一个来源**：这里让时间卡读 `window.homeDeck.items`（卡片组暴露的当前那份），读不到才退回整副。同时**注册顺序**要保证 —— `home-deck.js` 必须排在 `home-clock.js` 前面（defer 按文档顺序执行），否则时间卡首次 tick 时 `window.homeDeck` 还没建、它照样会退回整副。自查：凡是「A 按下标/B 按下标」对接的两块，先问一句「两边的列表长度一样吗、谁保证的」 |
| 构建直接失败：`parse of template failed: unexpected "{" in operand`，指向一行看起来完全正常的模板 | 把 `{{- /* 注释 */ -}}` 写进了 `(dict … "k" $v)` 的**括号里面**。Go 模板的注释是一个独立**动作**，不能出现在表达式中间 —— 报错会指向那一行的列号，很容易误以为是引号或逗号写错了 | 注释放在括号表达式**之外**（行首或上一行）。自查：Hugo 报 `unexpected "X" in operand` 时，先看那个括号里有没有插注释或变量声明 —— `deck-manifest.html` 里那张 `rankLabel` 表的注释就是这么挪出去的 |
| 与基线逐页比产物，比出十几处「非卡片页却不同」的**假回归** | 两种成因，第二种更隐蔽：① 这台机器 `core.autocrlf` 生效，检出时把 LF 换成 CRLF，这些字节会**原样进产物**（静态文件，以及正文里内嵌的 KaTeX `annotation` —— 它就是源文本本身）；② CRLF 进了数据后又被 JSON 转义成**字面的** `\r`（搜索索引 `index.json`），**按行尾归一化盖不住它**。另外这个站点有一页会把**构建机的绝对路径**印在页面上（项目索引的文档路径），换目录构建必然不同 | 基线必须 **`git -c core.autocrlf=false clone`** 再构建（不是 `git stash` —— 那会动工作区、把 21 个文件的改动全卷进去）。比较脚本在做行尾归一化的同时要把绝对路径也归一化，并**打印归一化的处数**（免得它悄悄掩盖了真改动）。工具 `lab/shots/deck6/regress.py`，判据是「非卡片页 0 处不同」 |
| 量「名牌条里那个徽章有多大」，量出 40×30（等于窗口尺寸），看着像「徽章很大」 | 名牌条**自己也内缩**（`right: var(--cart-inset)`，低档 14px），所以按**卡右边缘**取窗口时右半边落在亮金属框上；把窗口缩到贴住卡右边缘，又会够到卡号文字（也是亮字）。同一个坑踩了两次 | **几何用像素量、元素用 DOM 量**：徽章干脆不在像素上量，改由 `lab/shots/deck6/probe.js` 读 `getBoundingClientRect` 与 `clip-path`（顺带证明了「形状真画出来了」）。非要像素量，就先 `crop` 出来看一眼那个窗口里到底有什么 —— 别从坐标算术上推 |

## 2. 会「静默」出错的那一类

这些问题的共同点：**构建是绿的，但页面其实是坏的**。`hugo --minify --gc` 不会报错，所以靠 `check-frontmatter.sh` 等脚本拦——它们也因此被设计成**阻断**（见 [`architecture.md` 第 4 节](architecture.md#4-构建与部署)）。

- **整页没有 front matter**：标题会退化成站点名
- **缺 `title`/`date`/`draft`**：`date` 缺失会让页面按零值时间排序
- **section 页写了顶层 `tags`**：计数虚高、词条页里不出现
- **section 目录没有 `_index.md`**：该分区会退化成「隐式 section」，最后一篇内容被删掉时列表页与指向它的入口（导航栏、首页）一起 404。`check-sections.sh` 拦「有子页面却没列表页」，`check-links.mjs` 拦「列表页已经没了」，`remove` 拒绝单独删 `_index.md`
- **`draft: false` 却把 `date` 写在未来**：CI 直接不构建它
- **两个页面 title 完全相同**：列表页与搜索结果里分不出谁是谁（`check-frontmatter.sh` 会警告）。2026-09-18 之前这条还意味着**评论串页**——当时 giscus 用 `mapping='title'`，数值分析两章的「学习笔记」「作业」会共用同一条 discussion；现在 `mapping='pathname'`（URL 唯一），评论不再串页
- **`\textcircled{1}` 在这套环境下渲染是**对的**，别因为 CSS 里搜不到 `.textcircled` 就以为它坏了**：`static/katex/katex.min.css` 里确实没有 `circled`/`enclose` 规则，但圈的定位是 KaTeX 生成的 vlist **内联**布局，不依赖那条 CSS。实测（`content/projects/CMC2026/problem-01/solution.md` 里那 5 处）：圈 20×23px、数字 10×23px，**中心偏移 (0, 0)**，数字正好在圈里。教训是**不要用「CSS 里搜不到类名」推断渲染坏掉**；真要量就量**同一构造内**配对的元素——第一次量出「圈浮在数字上方 27px」是因为把相邻构造的数字和圈配到了一起

### 静默回退：三层兜底链里最差的那一层被用上了

`card-3d.js` 取卡面写的是 `next.xl || next.l || next.s` —— 三层兜底。**兜底链本身没错，
错的是上层永远是 `undefined`**：`home-deck.js` 组装对象时只传了 `s` 与 `l`，
`xl` 那一档（`deck-manifest.html` 专门生成、63 张 2.4 MB）从头到尾没被任何页面加载过。
表现就是「3D 卡比它该有的清晰度低一档」，而构建、控制台、`check-deck.mjs` 全绿：
`||` 吃掉 `undefined` 不报错，旁边注释里甚至写着「面贴图优先用 xl 那一档（760px）」。

**判据**：凡是 `A || B || C` 这类兜底链，都要问一句「A 真的会被填上吗」。
最省事的验证是把那一层的**尺寸量出来**跟预期比 —— 这次是靠「画布 dpr 反推出纹理高 761」
（760 档该是 1064）才发现的，不是靠读代码。**量出来的尺寸比代码里的注释可信。**

### 设计好的动效一直不跑：CSS 写全了、类名却没人加

首页卡片组的换卡动效（方向位移 + 画面交叉 + 扫光）整套写在 `21-card-deck.css` 的 `.home-card.is-in` 下，而 `home-deck.js` 里只有 `card.classList.remove('is-in')`（回收的那一半），**`add` 从来没人写** —— 于是动画一次都没跑过，换卡实际是「新图瞬切 → 旧图盖住 → 340ms 后啪一下消失」。2026-09-21 用户报「卡片切换太生硬」，才把它翻出来。

**为什么静默**：类名缺失不是错误 —— CSS 规则齐全、构建全绿、控制台干净、链接与体积校验也都绿，`prefers-reduced-motion` 更管不着它。**判据**：动效「有 CSS 却看不出在跑」时，先查那个触发类有没有被加上 ——
`document.querySelector('.home-card').getAnimations().map(a => a.animationName)` 返回空数组就是它。

**同一类还有第二种形态**：类加了，但元素不在渲染树里（弹层的 `.home-deck-stage` 在 `hidden` 的弹层下）——`getAnimations()` 对**不在渲染树**的元素返回空，会让人误判成「没绑上」。要量弹层里的动效就先打开弹层。

**验证办法**（`lab/shots/deckcheck.py`）：点一次换卡后**同一 tick** 读四点 —— ① 触发类在不在；② `getAnimations()` 里三条动画的名字与时长；③ 主图与残影的 computed opacity 起点是不是 `0 / 1`（互补）；④ 整卡的 opacity 是不是恒 1。截图看不出这些，而且 headless 里 `Page.captureScreenshot` 一次要几百 ms，等它回来 340ms 的动画早跑完了（实测每个采样点都落在结束态）—— 采样只能用纯 `evaluate` 快采。

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

**同一类错误的第二种形态：靠 URL 形状猜身份。** 弹窗内的卡内交叉引用原先写成 `el.closest('.tb-modal-content a[href*="/toolbox/"]')`（装栏的那个容器 2026-09-19 改叫 `.tb-modal-panes` 了，因为它现在装的是并排的**栏**）—— CS 库的卡片页在 `/cs/<id>/`、不含 `/toolbox/`，于是 CS 卡正文里的交叉引用不被拦截、点一下整页跳走（数学库却是就地弹窗）。现在由 `toolbox-md.html` 在改写锚点的同时给链接补 **`data-card="<id>"`**，JS 按 `data-card` 认卡。**身份写在链接上，不要从地址里猜** —— 以后加库不必回来改选择器。

顺带一条布局侧的同类坑：**索引卡外面那圈内边距在链接之外**。`.tb-teaser { padding: 0 }` 是死代码（`.tb-card` 的内边距写在同一文件更靠后、特异度相同，一直把它盖掉），所以每张索引卡实际有 16px 内边距裹在 `<a>` 外面：点在那圈上落在 `<article>` 上 —— 有 JS 时正是上面那个 404 的入口，没 JS 时点了毫无反应。修法是**拉伸链接**（`.tb-card.tb-teaser { position: relative }` + `.tb-teaser-link::after { inset: 0 }`）：伪元素属于 `<a>`，整张卡因此都是点击区，视觉不变。左缘那条类色条也从 `border-left: 3px` 改成 `box-shadow: inset 3px 0 0` —— border 画在卡片边框区，同样是链接够不到的地方。

### 加粗收尾紧接中文会无法闭合

`**…**` 闭合的 `**` 前面是标点、**后面紧跟普通汉字**时，按 CommonMark 的 flanking 规则不算 right-flanking，**闭不上**，页面上会直接显示 `**`。

两种写法的实测结果：

- `**附录 2（测向机原理与交会定位法**）建立模型` → **能渲染**，但 `）` 落在加粗外面
- `**附录 2（…）**建立模型` → **闭不上**，页面上显示 `**`

**修法**：让闭合的 `**` 后面跟标点/空白（例如补一个 `，`），或者让加粗范围不包含结尾的 `）`。

**排查方法**：`grep -o '<strong>[^<]*</strong>'` 看渲染结果，或在构建产物里搜残留的 `\*\*`。

### `disabled` 只挡真实事件，挡不住合成事件

收藏库筛选条的「0 张那一项置灰点不动」第一版只靠 `disabled` 属性：真实鼠标、触摸、键盘确实到不了
被禁用的表单控件，所以手动点着一切正常。**但它是可以被绕过的** —— `dispatchEvent(new MouseEvent('click'))`
照样把 click 事件送到监听器上（`element.click()` 反而不会，那条路浏览器自己会拦）。写断言脚本时先用的
就是这个派发法，于是「置灰项点了没反应」这条当场变成假绿 → 现在处理器开头自己判一次 `chip.disabled`。

更值得记的是它背后那条**不变量**（本轮真正依赖的东西）：**可点的 chip 不会因为「自己这一下」变成
disabled**。理由两条 —— ① 每次选择都是往 OR 里**加**一项，结果集只会变大；② 每颗 chip 的计数按
**其它排**的当前选择算（同排是 OR，不该把自己排除掉），所以它的禁用状态只由别的排决定，而别的排
不会因为它被点而改变。因此**不可能点出一颗马上就禁用、还顺手把焦点扔到 `body` 上的 chip**，
整段「焦点回到哪里」的处理都不必写。反过来，如果哪天把某个维度改成「会收窄结果」的（比如加一个
排除项、或把同排改成 AND），这条不变量当场失效，那时必须回头补焦点兜底。

### 判据对「已经平滑过」的输入不成立：倒角静默没生效（63 张里 58 张）

深度图倒角（`tools/cards/make-depth.py --fillet`）第一版照参考实现按**单像素落差 ≥ 0.15** 找崖边，
而本脚本上一步刚做过 sigma 2 的高斯：一个 0.8 的台阶被摊到 6~8 像素、每像素只走约 0.16 ——
阈值正好卡在边缘上。结果 **63 张里 58 张一个崖边都没找到**，输出与改前**字节完全相同**，
页面上也看不出来（「这张卡没有倒角」与「这张卡本来就是平的」在渲染结果上没有区别）。

**它是怎么被发现的**：写前后对比脚本时，拿备份与重出后的文件一 `md5sum` —— 58 张一模一样。
**单元测试当时是绿的**：合成高度场用的是硬台阶（0→0.8 一步到位），判据当然成立。
教训有两条：
① 测这种「判据」时，**输入必须与真实管线的输入同形态**（已经过高斯平滑的场），拿理想数据测等于没测；
② 交产物前后各留一次指纹（`md5sum`/字节数）是对付这类静默失败最便宜的办法 ——
它不解释原因，但会当场告诉你「这一步其实什么也没做」。

**修法**：判据换成「**离背景多远**」（`h · sin(π/2 · d/R)`，d = 到最近背景像素的距离），
不再依赖落差大小 —— 无论上一步平滑多狠都成立。同一批还立了第二条口径：**倒角必须在锐场上做**
（先高斯再倒角只砍掉坡脚，实测坡宽仍 6px、最大每像素落差仍 0.160，与完全不倒角一样）。

### `wrapAngle()` 没有返回值，它**就地改状态**

`card-3d.js` 的 `wrapAngle()` 把 `yaw/baseYaw` 就地折算到 (-π, π]，函数本身无返回值。
写卡内背景视差时顺手写成 `var dyaw = wrapAngle(yaw - baseYaw)` —— 拿到的是 `undefined`，
于是 `bx/by` 是 NaN、`uBgPar` 是 NaN：**背景视差整条静默失效**（对比图上只是「看不出动」）。
更糟的是它还有副作用：如果当时写成 `wrapAngle()`（无参），那是在 `draw()` 里**每帧改一次状态**。

要角度差就在调用处自己算：`dy -= Math.round(dy / (2π)) * 2π`。
`stats()` 里那个读数也顺手改了：`fx.bgPar` 原本记的是**这一帧的位移**，静止时必然是 0 ——
拿它当「这条通道有没有生效」的证据会永远读成没有（同一类错：**读数要取「这一档能给到的最大值」，
不是「此刻的瞬时值」**）。

### 这个仓库的工作区是 CRLF：守卫里的 `\n` 正则匹配不到

新加的守卫用 `function draw\(\)\s*\{([\s\S]*?)\n  \}\n` 取函数体，**永远匹配不到** ——
工作区是 CRLF，实际文本是 `\r\n  }\r\n`。它的表现是「解析不出」而不是「对不上」，
所以守卫红了但指错了地方（好在红的是它自己，不是被守的东西）。
本仓库里稳妥的取法有两种：把 `\n` 写成 `\r?\n`，或者**按两个函数头切片**
（`js.indexOf('function draw()')` … `js.indexOf('function rankOf()')`）—— 后者对格式改动也更稳。

### 深度模型的补丁网格：一个一直都在、直到把浮雕加大才看得见的缺陷

把台面放大、浮雕倍率从 1.0 提到 2.4 之后，卡面上出现了一层**等距的细直线网格**（放大 3 倍才看清，
静图上像「渲染坏了」）。它看着完全像是这一轮新加的七条通道之一干的。

**第一直觉（错的）**：深度图是 webp，16×16 宏块的压缩块效应。**用编码质量一测就否掉了** ——
同一张图 q75 / q85 / q90 / q95 的「块边界梯度峰/谷」是 1.58 / 1.50 / 1.57 / 1.73×，**抬质量不降反升**。

**第二直觉（也不对）**：新加的某条通道。于是做了一次**一次只开一个通道**的隔离实验（全关 / 只开
sparkle / 只开 holo / 只开 cliff / 只开 halo 各拍一张同一角度同一区域）—— **「全关」那张也有网格**。
到这一步才能确定：它是**基线上就有**的东西，只是被放大暴露了。

**真正的来源**：Depth Anything（ViT 架构）在 518×518 上推理再插值回 600×840，14 像素的补丁映射回来
正好落在**约 16 像素**的网格上，在高度场上留下一道约一个灰度级的小台阶。着色器的法线是 ±1 像素的
梯度、还要除以 `2*uTexel`（≈ 600 倍放大），于是一道 1/255 的台阶变成一道细棱。**判据**：按 16 取模的
列梯度峰/谷 = 1.61×（对照按 13 取模只有 1.05×，说明这个周期是真的）。

**修法（数据侧，不是画面侧）**：生成器里在高斯之前加一道 **3×3 中值** —— 峰/谷 1.61 → 1.20，
再叠原本那道高斯到 **1.09**。中途试过在着色器里用「窄窗 + 宽窗两尺度平均」的法线，确实也能压掉
（代价是整幅画面变软），**但那是用画质换的**；中值是保边的，专治 1 像素台阶，所以最后选数据侧、
把着色器还原成单尺度（画面最锐）。**别只把高斯加大**：高斯 4.0 也能压到 1.04×，但那把 6 像素级的
真细节（发丝、花瓣边）一起糊了 —— 三条路的读数都在 `make-depth.py` 的注释里。

**教训**：① **放大一个既有的东西，会把它的既有缺陷一起放大** —— 「新加的代码有问题」是最省事的
假设，也最容易错；一次只改一个变量的隔离实验几十秒就能定案。② 下游的放大器（这里是 600 倍的法线
梯度）会让「看不见的 1/255」变成「看得见的棱」——量缺陷时要把放大倍数算进去。


### 跨构建比图会把「另一个变量」当成结论

给透明盖做前后对比时，我拿**新构建**的一张截图与**上一轮构建**的一张并排，看到新图多出一圈白边与一片
浅色，就认定「白边是盖子干的」。**结论是错的**：那两张图的**取景本来就不一样**（面板位置差了几十像素、
卡片大小也略有不同）—— 跨构建、跨会话的两张图里，除了想比的那一项，还夹着取景、别的改动、甚至
`devicePixelRatio` 的差异。白边其实是**画面自带的框**加上早就存在的倒角折射。

**做法**：要 A/B 就在**同一构建、同一次会话**里、**一次只改一个变量**地拍（`deck7/sheetfx.py` 就是为此
写的：每格一次导航，只差 `setFx` 的覆盖值）。「六格全关那一格也有白边」这句话正是当场否掉错结论的依据 ——
它只有在同构建同会话下才成立。

### 多一整遍全屏填充的代价：一层透明盖让帧时间涨 36%

盖子的第一版是单独一层几何 + 开 `gl.BLEND` 混合绘制。观感对，读数很糟：p50 **6.1 → 8.3 ms**，
211 帧里 **179 帧**超过 6.06 ms 的帧预算（165 Hz）。退法不是降画质，而是**换实现路径** ——
盖子与卡面 footprint 相同、且永远在卡面之前，于是「盖上」在数值上就是卡面片元里的一次 `mix`：
同样的观感、**零额外填充**，读数回到 p50 6.1 / 0 帧超预算。
**要问的是「有没有多一遍全屏绘制」。** 顺带：这一轮的**POM 步数**顶端也从 24 收到 20 —— 24 步同样越线
（8.3 ms），而那是纯逐片元成本，只能从步数上让。

### 性能量测期间别同时干别的（同一台机器）

这一轮的读数出现过自相矛盾的一轮：`steps:16` 比 `steps:20` 还慢。原因是量测期间同一台机器还在跑别的
进程（构建、截图、模型推理）。判据：**默认状态连量三次看是否一致**（奇迹档 8.3 / 8.4 / 8.3 / 8.2 ——
一致，可以当结论；注入对比那几轮互相打架，只能丢）。

### 注入式测试要读返回值：一次静默失败的压测

给帧时间调速器做压测时，我在驱动脚本里注入了一句 JS「把台面改成 2200px」（想用超大画布把 GPU 压垮），
跑了两轮，报告里画布都写着 **808×1130**（正常尺寸）—— 我一度以为「这台机器太强、压不动」。

真相是：那句注入**抛了异常**（限速 20× 时页面脚本还没跑完，`.home-deck-stage` 还不存在），
而 `Runtime.evaluate` 的返回值我根本没看。**「注入没生效」与「生效了但没用」在读数上长得一模一样。**

**做法**：注入式的压测（改窗口大小、改 DOM、改限速）**必须把返回值读出来并打日志** ——
要么让注入自己返回一个可核对的量（`'stage=' + 宽度`），要么检查 `exceptionDetails`。
后来把注入改成「先轮询等元素出现」并打印 `注入大台面： stage=2200`，这类假阴性就没了。
同一条道理适用于任何「我设了但没验」的动作：**设完要能证明它真的生效**。

### 别的会话里容易再犯的三条（前一轮的教训）

- **量「最重的一档」时别量到最便宜的那一档**：奇迹卡在**显形前借用收藏的参数**，
  第一次用量法读到的是 `relief 0.032 / steps 8`（那是最便宜的配置）。性能脚本因此加了
  「先翻面等它显形再量」这一步。
- **比值/读数要分成「表里的值」与「生效值」**：`stats()` 新增的 `fx` 回的是**送进着色器的生效值**
  （已过弱设备打折与编译期上限两道）。让 lab 回读参数表会假绿 —— 中间那两道夹取正是最容易出问题的地方。
- **「只读一条」的断言会在另一条路上翻车**：`bgPar` 的读数、奇迹的单调性、`relief` 的工艺系数 ——
  三处都是「同一个量在不同条件下含义不同」，所以断言要么按**同一张卡前后比**（奇迹），
  要么在**表上**比（`check-deck.mjs` 核 `RANK_3D` 单调），要么明确排除（工艺参与的那两个通道）。

### 手改 CSS 丢了分号：浏览器一个字都不报（已加守卫）

真事故：用脚本往 `.home-card-rank--epic` 的尾部插一行 `--fret-corner`，插入点落在了
「最后一个声明」与 `; }` 之间 —— 于是 `--cframe: linear-gradient(...)` **丢了分号**，
新声明被并进它的值里，六档里那三档的**卡框金属色成了非法值**。hugo、浏览器、其余 11 个
校验脚本全绿，是**在浏览器里读 `getPropertyValue('--cframe')` 才发现的**（读回来不是渐变）。

判据与守卫：`check-deck.mjs` 的守卫 ⓪ —— 一行以 `)` 收尾、没有分号、下一行又是声明 ⇒ 直接 fail
（合法的换行续写只会以 `,` 或未闭合括号收尾，所以不误报；守卫本身用一个同形的假故障验过它抓得住）。
**别在「某条声明的尾部」做字符串插入**：要改就在整条规则上替换，然后跑守卫。

### 点一个 `display:none` 的元素：不报错，也不发生

`el.click()` 对隐藏元素照样派发事件，于是「点了但没反应」与「点了但逻辑自己判了可见性」
两种都不报错。真事故：URL 筛选（`?rank=`）把不匹配的格子留成 `display:none`，探针点
「第一个 `.deck-tile`」→ 六档读到的是同一个默认态，而读数**看起来很正当**（全 0 恰好是收藏档的真值）。

做法：探针先挑 `getComputedStyle(el).display !== 'none'` 的那个，并把「读到的通道等不等于
该档应给的值」写成断言 —— **值对不对是能查的，别只看「有没有报错」**。

### 探针里 `JSON.stringify(null)` 不是 `null`

`js()` 的约定是「返回字符串且以 `[` / `{` 开头就 `JSON.parse`」。所以
`return x ? JSON.stringify(x) : JSON.stringify(null)` 的空值那一支给回来的是**字符串 `"null"`**，
下游按对象用就炸成 `string indices must be integers`。空值直接 `return null`。

## 3. 构建与测量

- **`public/` 不会被自动清空**：Hugo 默认不清目标目录（`Cleaned` 恒为 0），所以只要跑过一次 `hugo -D`，`public/` 里就会留下草稿页等陈旧产物。本地量页数与体积前**必须**用 `--cleanDestinationDir`，否则量的是错的东西（实测页数虚高 5 页，giscus 脚本的「加载页面数」也被这 5 个陈旧页面污染）
- **不能用「构建还过」来判断删主题文件是否安全**：**Hugo 会静默容忍缺失的 partial。** 最直接的证据：主题 `_partials/head.html` 在生产环境无条件调用 `partial "google_analytics.html"`，而这个文件在站点与主题里曾经**都不存在**，og:/JSON-LD 却照常渲染、构建一直是绿的。这个具体的坑已于 2026-09-18 填上（站点侧 `layouts/_partials/google_analytics.html` 是有意的空实现，只含注释、不产出字符），但**结论不变** —— 构建成功仍然不能证明删模板文件安全，因为下一条只走一次的渲染路径照样可能是缺失的。详见 [`architecture.md` 第 5 节](architecture.md#5-主题剪裁记录2026-09-12)
- **`hugo server` 会改写 `public/`**（管理页的预览就是它）：实测在干净构建后 public 里有 16 个带 `class=katex` 的页面，一启动 `hugo server` 就变成 0（而 public 里仍有 78 个 html，说明确实被写过）。于是**读 `public/` 的校验会给出假结果**——`check-katex-pairing.sh` 报「没有找到含公式的页面」、`check-links.mjs` 报坏链、`report-size.sh` 量到别的页数。注意 CI 与 `push-blog.sh` **不受影响**：`.github/actions/validate/action.yml` 里这三个检查都排在「构建」之后，构建会先把 public 刷新一遍。只有**手动**跑这些校验时要保证前面刚构建过；校验失败时先确认没有预览在跑
- **`hugo server --baseURL` 只在首次构建生效**：实测传了 `--baseURL http://localhost:1313/my-blog/` 后，页面里的菜单/favicon 一开始确实是本机地址，但**改一个文件触发重建就又变回 `hugo.toml` 里的线上地址**——本地预览里点菜单会跳到线上站点、改了图标/样式也看不到。改用环境变量 `HUGO_BASEURL=...`（每次构建都读），实测重建前后都保持本机地址。`scripts/preview.sh` 与 `tools/admin/lib/hugo.mjs` 都走环境变量
- **但资源级 `.Permalink`（封面/图片这类）环境变量救不了**：Hugo 在资源处理时就把 baseURL 烘进绝对地址，所以**跑过一次完整 `hugo`（用配置里的线上 baseURL）之后，正在运行的 preview 会跟着 emit 线上地址**——预览里封面变成空白框、图片 404，而页面链接还是本机的。判据：`curl 127.0.0.1:1313/my-blog/projects/ | grep 'src=".*covers'`，出现 `skyrim86.github.io` 就是中的这个。**修法：重启 preview**（顺序是「先完整构建、后起 preview」，别反过来）
- **别在 `hugo server`（watch 模式）跑着的时候执行 `hugo --cleanDestinationDir`**：实测 server 的 watcher 会 panic 退出（`hugolib.(*HugoSites).Build` 栈），预览直接死掉。要跑完整构建就先把 preview 停掉
- **有展开动画的容器：裁切矩形要「拍之前现量」**：弹层刚打开时量到的舞台是 0 宽，`Page.captureScreenshot` 直接报 `Cannot take screenshot with 0 width`。探针里要「先等动画、再量、宽高都 >80 才裁」，别复用刚打开时读到的那份矩形
- **生成物里的点数/精度按「显示尺寸」给，不是按源图尺寸**：三个曲线角花是 26px 源图、却被 mask 成 6~12px，用 96/160/200 个点是纯过剩（降到 48/64/72 观感不变、字节省一半）。这类 token 放在**每一页都会下载的全局样式表**里，一个点≈13 字节，六档徽记 + 角花加起来就是 gzip +3.6 KB —— 先按显示尺寸算，再谈观感
- **模板里不能写 `site.Data.math-toolbox`**：Go 模板的字段名不允许连字符，写出来是 `bad character U+002D '-'` 的**语法错误**（而且报在 1:1，指向文件开头，看着像别的地方坏了）。带连字符的 data 只能用 `index hugo.Data "math-toolbox"`。同理任何 `data/` 文件名带 `-` 的都逃不掉
- **Hugo 报公式渲染错误时会「取消剩下的页面」，所以它列出的坏页可能不全**：实测一次推送里其实有 **3** 个坏页（`问题二_证明笔记.md` 107 行的嵌套 `$`、`问题三_小证明.md` 109 行多出来的 `$`、`问题三_证明_下界.md` 160 行的 `§`），而 `hugo` 只报出前两个——渲染是并行的，报错即取消未完成的任务。**所以「修完报出来的错误」不等于构建就能过**，必须重新构建到绿；`scripts/check-math-katex.mjs`（真检，逐条试渲染）能一次扫全，上面那个第三个坏页就是这一路扫出来的

## 4. 工具与脚本

- **`hugo list all` 是页面 URL 的权威来源**（`path,slug,title,date,…,permalink,kind,section`）。任何需要「这一页最终 URL 是什么」的地方都应该问它，不要自己实现 slugify + permalinks + `pathToLower`（管理页原先的第二份实现已删除）。解析它输出的两个坑：**标题里可能有逗号**（不能按逗号朴素切分）；**顶层页面的 `section` 是空字符串**。**例外**：content adapter 生成的页面（`/library/<大类>/`、`/library/<大类>/<细分>/`，见 docs/features.md ㉒）不在它输出里——它们没有对应的 content 文件，`.File` 也是 nil（碰 `.File.Dir` 会直接报错），要拿 URL 只能在模板里自己拼
- **shell `case` 的通配 `*` 会跨 `/`**，不是「一层」。`check-frontmatter.sh` 里 `content/courses/*/*/index.md` 正是靠这一点覆盖 `content/courses/<课程>/<章>/<材料>/index.md`，所以新增材料目录（`lab`、`lab-02`）会自动被覆盖。改这类模式时要意识到这一点
- **`next_weight()` 与 `next_material_weight()` 是两个函数**，别用错：前者数 `*/_index.md` 与 `*.md`（`sub`/`doc` 用），材料页是 `*/index.md`，用它永远得 1（实测踩过：`--dir lab-02` 与笔记撞成同一个 weight）
- **`.File.Dir` 在 Windows 上给的是反斜杠**（`projects\my-blog\`）：模板里 `split (.File.Dir) "/"` 会得到 1 段，按目录深度做判断（根页 / 文档页）会全部算错，且**不报错**——表现是「某些卡片上少了一整块内容」。先 `strings.Replace $dir "\\" "/"` 再切。「标题里的逗号」「section 为空字符串」是 `hugo list all` 的两个同类坑（见上一条）
- **生成二进制产物要原子写**：`tools/icons/make-icons.py` 与 `tools/covers/make-covers.py` 都先写同目录的 `.tmp` 再 `os.replace`。直接写目标文件时，正在跑的 `hugo server`（watch）会读到写了一半的 PNG/WebP，报 `cover.html:36:45: failed to load image config: image: unknown format` 并**中断那一次重建**（实测：13:44 生成封面时踩到，页面上封面暂时空白；重启预览或改一次文件即可恢复，构建产物本身没问题）
- **KaTeX 版本注释曾把警告说反**：`extend_head.html` 里原本写着「当前版本：0.18.7」，实际是 0.16.x（无前缀）。照那行注释去换 0.18.x 的 CSS 会让全站公式错版。判据与自查命令见 [`formulas.md` 第 5 节](formulas.md#5-katex-样式版本必须与-hugo-内嵌版本配对-)
- **原生 Windows 程序不认 MSYS 的 `/tmp`**（2026-09-21 修 `report-size.sh --fresh` 时踩到）：`bash` 侧 `mktemp -d` 给的 `/tmp/tmp.XXXX` 在 MSYS 里能用，但递给 **node**（原生 exe）时它按「当前盘符的绝对路径」解释 → 实际去找 `D:\tmp\tmp.XXXX`，报 `ENOENT: scandir 'D:\tmp\…\site'`，看着像「刚构建好的产物不见了」。同一个脚本里 hugo 那一段早就 `cygpath -m` 转过了，**每一处对外部 exe 的路径都要各自转一次**（`cygpath` 不存在时留原样，别在 Linux CI 上写死）。判据：`cygpath -w "$T"` 与 `ls "$T"` 指的是同一个目录才叫对
- **`lab/shots/` 这套脚本有三处 CDP 坑，第三轮的 hover 探针一次踩全**（2026-09-21，脚本见 `../lab/shots/deck8/{hover,zoom_filters}.py`）：
  ① **上一次跑留下的 Edge 会一直占着 9334 端口**。`shots.py` 用 `DETACHED_PROCESS` 起 Edge 且从不管退出，脚本跑完那个浏览器还在；下一次跑时新起的那个**绑不上端口**，而 `pick_target()` 照样拿到了 `/json/version` —— 于是量的是**上一个浏览器**。症状很隐蔽：截图突然变成 2 MB（上一个会话 `Emulation.setDeviceMetricsOverride` 设的 DPR2 还留着），或者 `Page.navigate` 到「只差一个 fragment」的地址被浏览器当成同文档导航、**页面根本没重新加载**（深链看起来「失效了」，其实是没重载）。判据：量之前先 `urllib.request.urlopen(http://127.0.0.1:9334/json/version)`，能连上就说明有残留、直接报错退出；自己起的 Edge 必须在 `finally` 里 `terminate()`（hover.py 现在两件都做了）。临时绕过：URL 上加个 `?x=1`（search 变了就是真导航）
  ② **`Page.captureScreenshot` 的 `clip` 用的是「页面坐标」**（文档原点，含滚动），不是 `getBoundingClientRect()` 给的视口坐标 —— 忘了 `+ window.scrollY` 会截到文档顶部那片文字上（第一次截出来是一段说明文字，很像「标错了元素」）
  ③ **`:hover` 没法用 JS 合成**（`new MouseEvent('mouseover')` 不产生悬停态），必须走 CDP `Input.dispatchMouseEvent{type:'mouseMoved'}`；反过来，**键盘事件必须从 `document.activeElement` 派发**，从容器上派发的合成 keydown 其 `target` 是容器本身，`e.target.closest('.deck-tile')` 会判成「不在格子里」而直接 return（键盘本来是好的，是探针没打到点上）
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
