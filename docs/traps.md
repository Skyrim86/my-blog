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
| 构建失败，报 `Unrecognized Unicode character "①"` | 数学模式里写了圈号 `①②③`。KaTeX 严格模式（Hugo 默认 `strict: 'error'`）只认它符号表里的字符，`①`（U+2460）不在其中，**即使包在 `\text{}` 里也会报错**（中文能过是因为在符号表内） | 数学模式里别用圈号：写成 `\text{(1) …}`；正文（公式外）的 `①` 不受影响 |
| 页面上直接显示 `**` 或公式源码 | 见第 2 节 | 见第 2 节 |
| 本地量页面数/体积总是偏大 | `public/` 不会自动清空 | 构建加 `--cleanDestinationDir`；或用 `report-size.sh --fresh` |
| 词条页（`/tags/xxx/`）计数比列表条数多 | 给 section 页写了 `tags` | 见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩) |
| 材料页突然从 `/tags/<课程标签>/` 里消失 | 材料页自己写了 `tags`，cascade 只填空不合并，继承的标签被整体丢弃 | 见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩) |
| 公式样式没加载，但公式本身显示正常 | `math` 字段只决定要不要加载 `katex.min.css`，与渲染无关；忘了写也有兜底检测 | 显式写 `math: true`；无公式的页面写 `false` 省约 23KB |
| 首页头像糊 / 没缩到 120×120 | 头像放在了 `static/` | **必须放 `assets/images/`**：主题用 `resources.Get` 去 assets 找，找不到就退回直出原图，`imageWidth/Height` 被**静默忽略**（曾如此：原图 22 KB 直出，而不是 4.8 KB 的 120×120） |
| 改首页布局没反应 | 首页是 Profile Mode | 去 `[params.profileMode]`，不是普通 list 模板；按钮已移除，入口走顶部导航 |
| 搜索整站失效 | 首页 JSON 输出被删 | `[outputs] home` 里的 `'JSON'` 勿删 |
| 长文里明明有的词搜不到 | 索引正文被截断到每页前 400 字（有意为之） | 预期行为，不是 bug；要改调 `layouts/index.json` 的 `truncate 400` 并同步 `fuseOpts.keys`。见 [`features.md` 第 3 节 ⑪](features.md) |
| 「标签」入口整页空白 | 新建了 `content/tags.md` 之类带 `url` 的普通页，把 `kind=taxonomy` 的列表页顶替成了普通文章页 | 总览页标题只写在 `content/<taxonomy>/_index.md`，不要再建同名普通页 |
| 换 logo 后看不到新图标 | `static/` 下是无内容指纹的静态文件 | 访客强刷即可；换 logo 直接覆盖 `favicon.ico`、`favicon-16x16.png`、`favicon-32x32.png`、`apple-touch-icon.png`、`safari-pinned-tab.svg` 五个文件，无需改代码 |
| 改明暗颜色的代码不生效 | 监听/匹配了 `.dark` class | 主题机制是 `<html>` 上的 **`data-theme` 属性**，用 `[data-theme="dark"]` |
| bash 脚本报 `$'\r': command not found` | 全新 checkout 得到 CRLF | `scripts/*.sh` 与 `data/*.yaml` **必须 LF**（`.gitattributes` 已用 `text eol=lf` 钉住）。内容 `.md` 允许 CRLF（Hugo 与两个校验脚本都能处理） |
| 管理页窗口里出现 `'会自动打开' is not recognized…`，但服务起来了 | `.bat` 里混进了中文 | 见 [`admin.md` 第 12 节](admin.md#12-启动管理页bat-的硬约束) |
| 管理界面被发布到线上 | 界面资源放进了 `assets/` | 只能放 `tools/admin/ui/`，见 [`admin.md` 第 11 节](admin.md#11-安全边界) |

## 2. 会「静默」出错的那一类

这些问题的共同点：**构建是绿的，但页面其实是坏的**。`hugo --minify --gc` 不会报错，所以靠 `check-frontmatter.sh` 等脚本拦——它们也因此被设计成**阻断**（见 [`architecture.md` 第 4 节](architecture.md#4-构建与部署)）。

- **整页没有 front matter**：标题会退化成站点名
- **缺 `title`/`date`/`draft`**：`date` 缺失会让页面按零值时间排序
- **section 页写了顶层 `tags`**：计数虚高、词条页里不出现
- **`draft: false` 却把 `date` 写在未来**：CI 直接不构建它
- **两个页面 title 完全相同**：giscus 用 `mapping='title'` 关联 Discussion，会并成同一条评论串（`check-frontmatter.sh` 会警告）
- **`\textcircled{1}` 构建通过但圈号是错的**：它不会报错，可是 `static/katex/katex.min.css`（0.16.x）里**没有 `.textcircled` 规则**，KaTeX 的 HTML 输出就把 `◯` 当成 accent 压在数字**上方**。实测量过几何位置：圆心比数字中心高 27px、偏左 66px，不是「数字在圈里」。要圈号就别指望它，数学模式里写 `(1)`，或把 `①` 留在公式外的正文里

### 加粗收尾紧接中文会无法闭合

`**…**` 闭合的 `**` 前面是标点、**后面紧跟普通汉字**时，按 CommonMark 的 flanking 规则不算 right-flanking，**闭不上**，页面上会直接显示 `**`。

两种写法的实测结果：

- `**附录 2（测向机原理与交会定位法**）建立模型` → **能渲染**，但 `）` 落在加粗外面
- `**附录 2（…）**建立模型` → **闭不上**，页面上显示 `**`

**修法**：让闭合的 `**` 后面跟标点/空白（例如补一个 `，`），或者让加粗范围不包含结尾的 `）`。

**排查方法**：`grep -o '<strong>[^<]*</strong>'` 看渲染结果，或在构建产物里搜残留的 `\*\*`。

## 3. 构建与测量

- **`public/` 不会被自动清空**：Hugo 默认不清目标目录（`Cleaned` 恒为 0），所以只要跑过一次 `hugo -D`，`public/` 里就会留下草稿页等陈旧产物。本地量页数与体积前**必须**用 `--cleanDestinationDir`，否则量的是错的东西（实测页数虚高 5 页，giscus 脚本的「加载页面数」也被这 5 个陈旧页面污染）
- **不能用「构建还过」来判断删主题文件是否安全**：主题 `_partials/head.html` 无条件调用的 `google_analytics.html` 在站点与主题里**都不存在**，而 og:/JSON-LD 照常渲染、构建一直是绿的。**Hugo 会静默容忍缺失的 partial。** 详见 [`architecture.md` 第 5 节](architecture.md#5-主题剪裁记录2026-09-12)
- **`hugo server` 会改写 `public/`**（管理页的预览就是它）：实测在干净构建后 public 里有 16 个带 `class=katex` 的页面，一启动 `hugo server` 就变成 0（而 public 里仍有 78 个 html，说明确实被写过）。于是所有**读 public/** 的校验会给出假结果——`check-katex-pairing.sh` 报「没有找到含公式的页面」、`check-links.mjs` 报坏链、`report-size.sh` 量到别的页数。所以：**跑构建/校验前先停掉管理页预览（或 `hugo server`）**，校验失败时也先确认没有预览在跑

## 4. 工具与脚本

- **`hugo list all` 是页面 URL 的权威来源**（`path,slug,title,date,…,permalink,kind,section`）。任何需要「这一页最终 URL 是什么」的地方都应该问它，不要自己实现 slugify + permalinks + `pathToLower`（管理页原先的第二份实现已删除）。解析它输出的两个坑：**标题里可能有逗号**（不能按逗号朴素切分）；**顶层页面的 `section` 是空字符串**
- **shell `case` 的通配 `*` 会跨 `/`**，不是「一层」。`check-frontmatter.sh` 里 `content/courses/*/*/index.md` 正是靠这一点覆盖 `content/courses/<课程>/<章>/<材料>/index.md`，所以新增材料目录（`lab`、`lab-02`）会自动被覆盖。改这类模式时要意识到这一点
- **`next_weight()` 与 `next_material_weight()` 是两个函数**，别用错：前者数 `*/_index.md` 与 `*.md`（`sub`/`doc` 用），材料页是 `*/index.md`，用它永远得 1（实测踩过：`--dir lab-02` 与笔记撞成同一个 weight）
- **KaTeX 版本注释曾把警告说反**：`extend_head.html` 里原本写着「当前版本：0.18.7」，实际是 0.16.x（无前缀）。照那行注释去换 0.18.x 的 CSS 会让全站公式错版。判据与自查命令见 [`formulas.md` 第 5 节](formulas.md#5-katex-样式版本必须与-hugo-内嵌版本配对-)

## 5. 导航与排序的「反直觉」

- **课程/项目的 URL 由目录名决定**，改名即改 URL（文章不同：URL 由 `[permalinks]` + 取自标题的 `:slug` 决定）。改标题既换 URL 又丢评论关联，所以管理页提供了 `slug` 字段把 URL 固定下来。详见 [`content.md` 第 8 节](content.md#8-url-与内容的关系)
- **材料页的目录名与它在页面上的名字、位置无关**：入口页卡片取 `title`/`icon`/`weight`，所以新增材料类型不需要动模板
- **课程材料页的附件不用文件名前缀**：bundle 里除图片外的资源都会进下载区
- **项目页与课程页不在归档页与首页列表里**（`mainSections=['posts']` 只放行文章），但**都会**进搜索索引、`sitemap.xml` 与 `/categories/`。词条页只列 regular page —— `CMC2026` 这种 section 形式的项目**它自己**不在词条页里，但它下面的文档页（靠 cascade 拿到标签）会正常出现
