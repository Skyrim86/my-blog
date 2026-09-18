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
| 搜索整站失效 | 首页 JSON 输出被删 | `[outputs] home` 里的 `'JSON'` 勿删 |
| 长文里明明有的词搜不到 | 索引正文被截断到每页前 400 字（有意为之） | 预期行为，不是 bug；要改调 `layouts/index.json` 的 `truncate 400` 并同步 `fuseOpts.keys`。见 [`features.md` 第 3 节 ⑪](features.md) |
| 列表卡片里的公式显示成重复三遍（`e=x^−xe = \hat{x} - xe=x^−x`），或卡片摘要整块空白 | 卡片摘要走主题 `list.html` 的 `.Summary \| plainify`。公式在**构建期**已被 KaTeX 渲染成 HTML+MathML，`plainify` 剥掉标签后把 MathML 文本、`annotation` 里的 TeX 源码与视觉文本拼在了一起；正文为空的生成页（工具卡片）则是摘要本来就空 | 给会出现在列表页的页面写 front matter **`summary`**（纯文本，`.Summary` 会直接返回它）。`check-frontmatter.sh` 对「正文含公式却没写 summary」的页面发警告；不能写进 `archetypes` —— 空字符串会被当成「已设置」，卡片会变成空白 |
| 订阅者收到一排没有摘要的条目，或 `pubDate` 是 `Mon, 01 Jan 0001` | 首页 RSS 取 `site.RegularPages` 且不过滤 `mainSections`：正文为空的生成页（80 张工具卡片、`/library/` 三级页）`description` 为空；没有 `date` 的静态页（`about`）日期是零值 | 给这些页面加 **`hiddenInRss: true`**（`themes/PaperMod/layouts/rss.xml` 里唯一的消费者）。工具卡片与 `/library/` 三级页写在各自的 cascade / 适配器 `params` 里。`check-seo.mjs` 会盯住这两类 |
| 给 `/tags/xxx/` 写了说明文字却显示不出来 | 说明文件放在了与**词条 URL** 不一致的目录名里：Hugo 是按词条的 URL 路径去找 `content/tags/<路径>/_index.md` 的，找不到就静默忽略（页面照常构建、页头就是空的）。写成 `content/tags/CMC2026/`（词表的写法）而不 `content/tags/cmc2026/`（产物的 URL）就中招 | 目录名照构建产物的 URL 定：小写、空格换连字符、中文保持原样。自查：构建后 `grep -o 'post-description[^>]*>[^<]*' public/tags/<词条>/index.html` 应有输出。见 [`features.md` ㉘](features.md)、[`content.md` 第 5 节](content.md#5-标签词表) |
| 在工具库页 / 卡片库细分页点开卡片，弹窗里**只有抬头没有正文** | 索引卡与完整卡片共用 `.tb-card` 类，而索引卡（`.tb-card.tb-teaser`）也带 `data-id`：`toolbox.js` 的 `loadCard` 先用「本页有没有同 id 的 `.tb-card`」做短路命中，命中的是那张**没有正文**的索引卡 | 选择器一律排除 `.tb-teaser`（`'.tb-card[data-id="…"]:not(.tb-teaser)'`，本页与抓回来的文档两处都要）。2026-09-18 修，两库都受影响 |
| 某个 section 的页面**静默**回落到主题 `list.html`（本该用自己的 layout） | Hugo 的布局查找是**先看 `layouts/<section>/<layout>.html`**：`layout: library` 只在 section 恰好叫 `library` 时才命中 —— 数学库是撞上的；section 换成别的名字（如 `cs`）就找不到模板、回落到主题列表页，页面照常构建、内容完全不对 | 多个 section 共用的 layout 放 `layouts/_default/<layout>.html`（通用回落位），front matter 的 `layout:` 不用改。2026-09-18 把 library / library-branch / library-section / toolcard 四个模板移到了那里，见 [`features.md` 第 4 节](features.md) |
| 卡片 id 与分支/细分 key 撞名，两边页面互相覆盖 | 两者都会变成 `/<库>/<key>/` 这一层 URL | `node scripts/gen-cards.mjs <库>` 生成前会校验并直接报错退出；改卡片 id 或分支 key |
| 卡片库的生成逻辑「明明一样却要写两份」 | `AddPage` 的 `path` **相对适配器所在目录**，适配器没法生成别的目录下的页面 | 每个库一份实例（`content/library/_content.gotmpl` 与 `content/cs/_content.gotmpl`），差别只有 `$libKey` 一行；改完两边都要跑一遍页面核对 |
| 「标签」入口整页空白 | 新建了 `content/tags.md` 之类带 `url` 的普通页，把 `kind=taxonomy` 的列表页顶替成了普通文章页 | 总览页标题只写在 `content/<taxonomy>/_index.md`，不要再建同名普通页 |
| 导航栏某个入口 404，或 `/posts/` 这类列表页整页消失 | 该 section 目录没有 `_index.md`：Hugo 给的是**隐式 section**，页面靠子页面撑着，最后一篇内容被删掉时列表页与所有指向它的入口一起 404。实例：`content/posts/` 曾经只有一篇占位文章 | 用 `bash scripts/new-content.sh section <路径> --title 标题` 补列表页。现在 `check-sections.sh`（阻断，拦「有子页面却没列表页」）与 `check-links.mjs`（同站绝对链接也在检查范围内）都会拦住它，`remove` 也拒绝单独删 `_index.md` |
| 换 logo 后看不到新图标 | `static/` 下是无内容指纹的静态文件 | 访客强刷即可；换图标**不要手改那些 png/ico**，改 `tools/icons/make-icons.py` 后重新生成（见 `architecture.md` 第 6 节），桌面快捷方式还要 `ie4uinit.exe -show` 刷 Explorer 的图标缓存 |
| 改明暗颜色的代码不生效 | 监听/匹配了 `.dark` class | 主题机制是 `<html>` 上的 **`data-theme` 属性**，用 `[data-theme="dark"]` |
| bash 脚本报 `$'\r': command not found` | 全新 checkout 得到 CRLF | `scripts/*.sh` 与 `data/*.yaml` **必须 LF**（`.gitattributes` 已用 `text eol=lf` 钉住）。内容 `.md` 允许 CRLF（Hugo 与两个校验脚本都能处理） |
| 单页的左侧目录栏不跟着滚（或整栏跑到正文末尾） | `.post-single` 上的 `backdrop-filter` 会成为 fixed 后代的**包含块**——留在正文容器里的 `position: fixed` 是相对卡片定位的，于是跟着正文一起滚 | `layouts/_partials/toc-rail.html` 里**内联**的那段脚本把 `#toc-rail` 挪到 `<body>` 下；显示与否挂在 `body.has-toc-rail` 上，没 JS 时不显示（正文顶部的折叠目录照旧）。见 [`features.md` 第 3 节 ㉓](features.md) |
| 两份目录的条目数量不一样（页内目录比左栏多） | 页内那份走的是主题自建目录（正则扫 h1–h6），左栏走 `.TableOfContents`（h2–h3）——有 h4 的页面就会差出一截（实测 lab 页 30 vs 15） | `hugo.toml` 设 `UseHugoToc = true`，两边同源。顺带修掉了主题自建目录对含公式标题 `plainify` 出的乱码（「手算 ttt 检验时用」） |
| 同一类页面之间内容串页：A 页的侧栏/页脚出现 B 页的目录 | 主题 baseof 用 `partialCached "footer.html" . .Layout .Kind …`，同 (Layout, Kind) 的页面**共用一份渲染结果**（`extend_footer.html` 里的页面相关输出会串） | 页面相关的内容一律挂 `extend_post_content.html`（`partial`，逐页渲染）；`extend_footer.html` 只放与页面无关的东西 |
| 目录里冒出 `HAHAHUGOSHORTCODE372s2HBHB` | 标题行里有 `{{< … >}}`：`.TableOfContents` 不执行短代码，占位符原样进目录 | 导入脚本的接线要跳过标题行（`import_course.py` 的 `SKIP_ZONE`）；正文里也别手写短代码进标题 |
| 管理页窗口里出现 `'会自动打开' is not recognized…`，但服务起来了 | `.bat` 里混进了中文 | 见 [`admin.md` 第 12 节](admin.md#12-启动管理页bat-的硬约束) |
| 管理界面被发布到线上 | 界面资源放进了 `assets/` | 只能放 `tools/admin/ui/`，见 [`admin.md` 第 11 节](admin.md#11-安全边界) |

## 2. 会「静默」出错的那一类

这些问题的共同点：**构建是绿的，但页面其实是坏的**。`hugo --minify --gc` 不会报错，所以靠 `check-frontmatter.sh` 等脚本拦——它们也因此被设计成**阻断**（见 [`architecture.md` 第 4 节](architecture.md#4-构建与部署)）。

- **整页没有 front matter**：标题会退化成站点名
- **缺 `title`/`date`/`draft`**：`date` 缺失会让页面按零值时间排序
- **section 页写了顶层 `tags`**：计数虚高、词条页里不出现
- **section 目录没有 `_index.md`**：该分区会退化成「隐式 section」，最后一篇内容被删掉时列表页与指向它的入口（导航栏、首页）一起 404。`check-sections.sh` 拦「有子页面却没列表页」，`check-links.mjs` 拦「列表页已经没了」，`remove` 拒绝单独删 `_index.md`
- **`draft: false` 却把 `date` 写在未来**：CI 直接不构建它
- **两个页面 title 完全相同**：列表页与搜索结果里分不出谁是谁（`check-frontmatter.sh` 会警告）。2026-09-18 之前这条还意味着**评论串页**——当时 giscus 用 `mapping='title'`，数值分析两章的「学习笔记」「作业」会共用同一条 discussion；现在 `mapping='pathname'`（URL 唯一），评论不再串页
- **`\textcircled{1}` 在这套环境下渲染是**对的**，别因为 CSS 里搜不到 `.textcircled` 就以为它坏了**：`static/katex/katex.min.css` 里确实没有 `circled`/`enclose` 规则，但圈的定位是 KaTeX 生成的 vlist **内联**布局，不依赖那条 CSS。实测（`content/projects/CMC2026/problem-01/solution.md` 里那 5 处）：圈 20×23px、数字 10×23px，**中心偏移 (0, 0)**，数字正好在圈里。教训是**不要用「CSS 里搜不到类名」推断渲染坏掉**；真要量就量**同一构造内**配对的元素——第一次量出「圈浮在数字上方 27px」是因为把相邻构造的数字和圈配到了一起

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
- **性能量法脚本的路径可能与本机不一致**：`features.md` 第 6 节写的量法在 `D:\blog\.shots\...`，而本机实际在 `D:\Study\projects\blog\.shots\`（`D:\blog` 不存在）；`startjank.py` 里还有两处写死的 `D:\blog\.shots`（Edge 的 profile 目录与输出 json），直接跑会报错。复跑时把脚本连同 `frameab.py` 复制到临时目录、只替换那两处路径，**别改原文件**（路径是别人机器上的布局）。依赖：Edge + `websockets` + `python` 都在本机可用

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
- **「接入 Lighthouse CI」收益低于成本**：站点已有 12 步校验（含 `report-size.sh` 的单页/整站/索引体积预算）与每周 lychee 外链检查；Lighthouse CI 在 Pages 子路径下需要额外的 server 与 token，且它的产出与本地 `D:\blog\.shots\` 那套手测量法重复
