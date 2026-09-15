# 本地管理页

改 `tools/admin/` 里的任何东西之前读这篇。它同时受 [`../AGENTS.md`](../AGENTS.md) 的约定约束。

## 1. 入口与构成

两个入口**等价**：

- **双击仓库根目录的 `启动管理页.bat`**（不用开终端，桌面快捷方式也指向它）
- 命令行 `bash tools/admin/start.sh`（对话里用 `/admin`）

双击后它会自动打开浏览器、并顺手带起 `hugo server` 预览。

它在本机起一个**零依赖的 Node 服务**（只用 `node:` 内置模块，**没有 package.json、没有 node_modules**），浏览器打开一个中文单页，五块功能：**新建**（九种内容类型的表单 + 词表 chips 选标签 + **拖入 .md 导入**）、**编辑**（内容文件树 + front matter 表单 + Markdown 工具条 + 删除 + **拖入 .md 替换正文** + **粘贴/拖入图片**）、**发布**（git 改动清单 + diff + 草稿与排期 + 提交历史 + CI 状态 + 流式日志）、**体检**（跑 `scripts/` 那批校验脚本，结果按文件列出、可点进编辑器，见第 14 节）、**同屏 iframe 预览**（可拖宽、可切设备宽度）。顶栏常驻仓库状态（分支 / 改动 / 草稿 / 排期 / 预览），随时可按 `Ctrl+K` 开命令面板。

```
tools/admin/
├── start.sh        # 启动器：参数解析、找 bash/node/hugo、开浏览器、exec server.mjs
├── server.mjs      # HTTP 服务：静态页 + JSON API（新建/删除/编辑/词表/git/发布）
├── lib/            # 业务模块：content / frontmatter / taxonomy / git / hugo / exec / checks / search / asset / ci
└── ui/             # index.html + app.js + style.css（原生前端，无框架无构建）
                    # + frost-light/dark.webp（背景图，程序生成）+ ayaka-bg.webp（备用插画）
                    # + ayaka.ico（标签页与桌面快捷方式图标）
```

**它是现有脚本的界面外壳，不是替代品**：新建一律调 `scripts/new-content.sh`（front matter 仍来自 `archetypes/`），**删除调 `new-content.sh remove`**，读词表调 `new-content.sh tags`，发布调 `scripts/push-blog.sh`。所以分支校验、构建校验、草稿与词表警告、commit/push/CI 那条链路一条都没有被复制。

## 2. 新建面板的两级类型选择

第一行是**分组**，第二行是该组下的**具体类型**：

```
[文章]  [课程 ▾]  [项目 ▾]
        └ 课程主页 / 章节 / 笔记 / 作业 / 实验
                          └ 项目：项目 / 子项目 / 项目文档
```

只有「文章」没有第二行（点了直接出表单），所以不会在它下面多出一个同名按钮。

**设计约束（改这里必须先读）**：分组**只影响界面**。`store.kind` 与按钮 payload 必须始终携带**叶子 id** —— `post` / `course` / `chapter` / `notes` / `homework` / `lab` / `project` / `sub` / `doc`。这些 id 同时是：

1. `scripts/new-content.sh` 的子命令名（`case "$cmd" in post) …`）
2. `tools/admin/lib/content.mjs` 的 allowlist（`buildCreateArgs` 里的 `KINDS` 与 `switch (kind)`），那里的注释明确写着「kind 的取值与脚本的子命令名一一对应」
3. 前端表单日志里打印的命令（`bash scripts/new-content.sh <kind> …`）

所以**加分组不涉及服务端改动**；反过来，**改叶子 id 会同时打断三处**。分组与叶子的映射表在 `ui/app.js` 的 `KIND_GROUPS`（唯一事实源），叶子规格在同一个文件的 `KINDS`。

实现要点：

- 分组按钮只带 `data-group`，叶子按钮只带 `data-kind`。`#kind-picker` 的点击委托先判 `data-group`——两者混用会把分组当成类型，`KINDS[store.kind]` 随即拿到 `undefined` 并抛错
- 切回某个分组时恢复**该组上次选的叶子**（`store.lastKindByGroup`），首次进入取 `kinds[0]`
- 重新点击当前类型只把分组切回来，**不清空已勾的标签、不重渲染表单**
- 选择存 `localStorage`（key `admin-create-kind`），读取时用 `KINDS[k] ? k : 'post'` 兜底——存的是坏数据（类型被删过）时不能让 `store.kind` 被带歪
- 切类型时字段值按字段名互相带过去（`snapshotCreateFields` 的既有行为，未清空），所以 `笔记 → 作业` 会保留已填的标题

## 3. 九种类型

| 分组 | 类型（叶子 id） | 标签/分类可写 | 特有字段 |
|---|---|---|---|
| 文章 | 文章（`post`） | 标签 ✓ 分类 ✓ 系列 ✓ | `slug`（决定 URL） |
| 课程 | 课程主页（`course`） | 标签 ✓ 分类 ✓ | `unit`（章/周） |
| 课程 | 章节（`chapter`） | ✗ | `materials` 多选（建哪几个材料页） |
| 课程 | 笔记 / 作业 / 实验（`notes`/`homework`/`lab`） | ✗ | 实验多一个 `dir`（同章第二个实验填 `lab-02`） |
| 项目 | 项目（`project`） | 标签 ✓ 分类 ✓ | `repo`、`layered` |
| 项目 | 子项目（`sub`） | ✗ | 所属分层项目 |
| 项目 | 项目文档（`doc`） | 标签 ✓（分类 ✗） | `noMath`（纯文字不加载 KaTeX 样式） |

- 「章节」表单的材料多选（`type: 'checks'`）勾哪些建哪些、全不勾传 `none` 只建入口页
- **所有类型都有 `date` 与 `description` 字段**：`date` 留空就用骨架里的今天；它是拖入导入带日期过来所必需的
- 「笔记 / 作业 / 实验」三个入口用来**给已有章节补材料**：它们的「所属章节」下拉是唯一与其他字段有依赖的选项，跟着「所属课程」联动（`fillChapterOptions()`，选项由服务端 `options.chapters` 下发，前端不推导路径）
- `checks` 是字段渲染器里的一种类型：同名 checkbox 共用 `data-field`、靠 `data-cvalue` 区分，所以 `snapshotCreateFields`/`restoreCreateFields`/提交收集三处都必须把它们聚合成数组——按 `data-field` 直接赋值会让同组的多选框互相覆盖

## 4. 字段表与 `archetypes/` 是策展关系，不是副本

编辑器字段表是 archetype 的**子集 + 补充**（实测差异：只给 UI 的 `post.slug`、`material.math`、`project-doc.tags` 在 archetype 里没有；而有意不暴露的 `layout`、`cover.relative`、section 页的 `date` 等又在 archetype 里有）。

**`date` 是个例外中的例外**：`material` / `project` / `project-doc` 三类必须有 `date`（`check-frontmatter.sh` 的硬要求），所以编辑器也暴露它 —— 「文件没有 front matter」时要靠它补全，否则界面提示缺日期却给不出输入框。`post` 本来就有；section 页（`_index.md`）不需要，继续隐藏。详见第 6.1 节。

所以**没有**做「按 archetype 机械生成表单」——那会把 `layout`/`date` 顶进表单、丢掉 `slug`、并改掉每个类型的字段顺序，是行为回归。取而代之的是 `scripts/check-editor-schema.mjs`：archetype 里出现了既没被 UI 暴露、也不在它 `hidden` 列表里的键就报警，把**静默分叉**变成可见提醒。（这个检查在 `push-blog.sh` 与 CI 里跑，**只警告不阻断**。）

**列表页（section 的入口页）是一族类型**：`posts-list`（`content/posts/_index.md`）、`courses-list`、`projects-list`、`taxonomy-page`，加上兜底的 `section-list` —— 任何没被上面认领的 `_index.md` 都归到它（脚手架的 `section` 子命令能建任意路径的列表页；没有兜底的话这些文件会掉进「其他」，用错字段表与 tags 规则）。这五类共用同一份字段表（`title`/`description`/`summary`/`draft`，**不含** `date`/`weight`/`math`），骨架统一是 `archetypes/section.md`（`check-editor-schema.mjs` 的 `MAP` 里五类都指向它）。

## 5. 架构红线做成了界面约束

`content/courses/**/notes|homework|lab`、章节入口页、子项目页、各类 section/列表页的 **tags 字段在界面上隐藏并禁用**（理由见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩)：section 写 tags 只会让计数虚高；材料页写了会整体丢掉 cascade 下发的标签）。分层项目的文档页写 tags 会给出「会丢掉项目级标签」的提示。

**服务端也会忽略不属于该类型 schema 的字段**——实测在材料页硬塞 tags 不会写进文件。所以界面护栏与后端规则不会分叉。

**新标签先入词表、再建内容**：界面上勾的新词会先经 `/api/taxonomy/add` 写进 `data/taxonomy.yaml`（写后立刻用 `new-content.sh tags` 复核，复核不过就回滚原文件），全部校验通过才建文件——沿用 `new-content.sh`「校验早于建文件」的原则。建内容前的预检走 `new-content.sh add-term --check`，**校验规则也只有 shell 那一份**。

## 6. 拖入 .md 导入（新建与编辑面板）

两个面板都是拖放目标（也可以点击拖放区选文件）：

- **新建面板**：正文替换骨架里的占位正文，front matter 按文件里的值补全，缺的用 archetype 默认值。
- **编辑面板**：替换该文件正文；front matter **只补空缺字段**，勾上「拖入 .md 时用文件里的 front matter 覆盖已有字段」才覆盖（默认不勾）。当前正文有未保存改动时，拖入前会先 `confirm()`。

拖入只做三件事，每一步都复用已有实现：

1. 浏览器把文件读成文本（先按 UTF-8 严格解码，失败退回 GBK 并提示；客户端上限 4MB），`POST /api/content/analyze` 交给服务端解析。
2. 解析用 `lib/frontmatter.mjs` 的 `splitFrontMatter`/`getField`/`getList` —— **不在浏览器里再写一遍 YAML 解析**。返回 `values`（文件里真实存在的键）、`fill`（推荐填进表单的值，`title`/`slug`/`date` 允许从正文一级标题、文件名、站点今天兜底）、`warnings`、`unknownKeys`、`notApplicable`。
3. 确认后才走原有两条写盘路径：新建走 `POST /api/content`（正文由服务端作为 **stdin** 交给 `new-content.sh`，argv 里只有 `--body-stdin` 开关，文本不进命令行）；编辑走 `PUT /api/content/file`，与手动编辑同一条路。

几条刻意的取舍：

- **标签只自动勾选词表里已有的**（与 `store.taxonomy` 求交），词表外的只在提示里列出来 —— 拖一个文件不应该顺手改 `data/taxonomy.yaml`。
- **`draft` 永远不因为导入而改变**：文件里写 `draft: false` 只给一条提示。是否发布只由「直接发布」勾选框（**默认勾上**）与编辑器的「仍是草稿」决定。
- 内容类型与目标目录**仍由表单选**（文件内容推不出该放哪）；`doc` 的「文档名」用原文件名 —— 这个仓库的项目文档本来就是中文文件名。
- 正文里的裸 `$` 用编辑器同一份 `lintDollar()` 提前报警：那会让 Hugo 构建失败，`push-blog.sh` 随即中止。
- 全局拦下 `dragover`/`drop`（`document` 上），否则浏览器会直接用它打开拖进来的文件、把管理页顶掉。

### 6.1 「按默认值补全」：修没有 front matter 的文件

`readContentFile` 会返回 `missingRequired`（规则与 `scripts/check-frontmatter.sh` 对齐：`title` 一律必填；`content/posts|courses|projects` 下非 `_index.md` 还要 `date` + `draft`）。缺键时编辑器显示红色提示 + 「按默认值补全」按钮：标题取正文第一个 `#` 标题、日期用站点今天（`store.state.siteToday`）、`draft: true`，文件原本没有 front matter 时再补 `weight: 1` / `math: true`。**只填进表单，仍要点「保存」才写盘。**

**为什么 `date` 必须暴露给这三类**：`check-frontmatter.sh` 要求 `material` / `project` / `project-doc` 必有 `date`，而这三个类型的 `editorSchema` 原先隐藏了 `date` —— 于是「文件没有 front matter」时界面只提示日期、却给不出可改的输入框，补全后仍然过不了校验（`content/projects/CMC2026/problem-0{3,4}/*.md` 就是这种文件）。所以规则是：**check-frontmatter 要求 `date` 的类型，编辑器就必须能改 `date`**（`post` 本来就有）；`scripts/check-editor-schema.mjs` 的 `hidden` 列表同步去掉了这三个类型的 `date`。

section 页（课程主页 / 章节 / 分层项目主页 / 子项目页 / 列表页）缺 front matter 时不重建 `layout`/`cascade`/`weight` 这些结构键 —— 那是骨架的职责，界面只提示重建。**列表页的提示指向 CLI**（`bash scripts/new-content.sh section <路径> --title 标题`）：新建面板里的 kind 一一对应 `new-content.sh` 的子命令，而列表页走的是 `section` 子命令，面板里并没有这个入口（`app.js` 的 `LIST_TYPES` 就是用来区分这两种提示的）。

## 7. 写入收敛

`data/taxonomy.yaml` 的追加不再由 Node 自己拼 YAML —— `new-content.sh` 提供了 `add-term <tags|categories> <词条>` 子命令（`--check` 只校验），界面只是调它。原先 Node 侧那份 `insertTerm`/`validateTerm` 已删除，词表的读、写、校验现在都只有 shell 一份实现。

同理，**页面 URL 不再由 Node 自己算，而是问 Hugo**：`hugo list all` 输出每页的 `path,permalink`（`lib/content.mjs` 的 `previewUrl` 读它，缓存 5s，保存/新建时失效）。所以 `permalinks` 规则、`pathToLower`（`CMC2026` → `cmc2026`）、front matter 的 `url`、中文的百分号编码都由 Hugo 说了算，配置改了不会与界面分叉；只有「Hugo 列不到这一页」（刚新建还没落盘、或 hugo 不可用）时才退回启发式，并标 `source: 'heuristic'`。

这条是通用原则：**能问工具的就不要自己实现**。此前两处重复实现（Node 拼词表、Node 算 URL）都因为「自己又写了一遍」而必然腐化，已删除。

### 7.1 公式写法自动修复（`\*`、`§`、圈号）

数学区里有三类写法会让 KaTeX 报错而整站构建中止，**而它们的正确写法都是机械可推的**：`\*` → `*`、`§` → `\S`、圈号 `①`–`⑳` → `\text{\textcircled{N}}`。但 `\*` 在 markdown 散文里是合法转义、`§3.4` 在散文里也该原样保留——所以**不能全局替换**，只能认数学区域。修法与扫描只有 `scripts/fix-math-escapes.mjs` 一份实现，管理页只是导入它的 `fixMathEscapes()`：

- **保存**（`handleSave`）：对「即将写入的正文」跑一遍。哪怕只是打开一个已写坏的文件、原样点保存，也会被修好。命中时响应里回传 `mathFix` 与修正后的 `body`，前端据此同步编辑器正文（不同步的话下次保存又会把坏文本写回去）并提示修了几处。
- **新建**（`handleCreate`）：喂给 `new-content.sh` 的 stdin 正文先过同一个函数，`mathFix` 一并回传，日志里打一行说明。
- **发布**：修在 `scripts/push-blog.sh` 里（管理页的「发布」就是调它，命令行发布同一入口共用），见 [`architecture.md`](architecture.md) 第 4 节。

扫描器先剔除围栏代码块与行内代码，再只对 `$$…$$` / `$…$` / `\(…\)` / `\[…\]` 内部动手：散文里的 `\*强调\*`、`§3.4`、代码块里的 `\*` 一律不碰。`\\*`（换行符 + 普通星号）也不会被误改。已知不覆盖四空格缩进的代码块（与列表缩进无法可靠区分）。

**保存路径故意不做第二层修复**：JSON 双重转义（`\\theta` 这类）要跑 Hugo 试渲染验证后才敢写盘，而管理页的保存要保持秒级响应，所以那一层只在 `push-blog.sh` 里由 `scripts/check-math-katex.mjs --fix` 执行（见 [`formulas.md`](formulas.md) 第 4.4 节）。

## 8. 删除：两步确认 + 预检

编辑器头部的「删除」按钮第一次点击先发 `POST /api/content/delete` 带 `dryRun: true`，`remove --dry-run` 把将删除的文件清单回报上来（渲染在 `#ed-delete-notice` 里，含文件数、未保存改动提醒、`git checkout --` 恢复命令），按钮转红变「确认删除」；第二次点击才真删。

**判定规则不在 Node 里**：`buildRemoveArgs()` 只做「必须在 `content/` 内、不含 `..`」的最小护栏，其余（连不连目录删、section 根拒绝）全在 `new-content.sh` 的 `cmd_remove`。

删除成功后要一起做四件事：清空编辑器占位、`loadItems(true)` + `renderTree()`、`renderCreateFields()`（课程/章节下拉跟着变）、并把预览改指到仍然存在的最邻近祖先 `_index.md`（`nearestSurvivingIndex()`）——否则 iframe 会停在已删掉的地址上。

重新渲染编辑器时必须 `resetDeleteArm()`：不解除武装的话，「确认删除」会落到下一个刚打开的页面上。

## 9. URL 与预览

预览由内置的 `hugo server -D -F --disableFastRender` 提供，iframe 指向 `http://127.0.0.1:<预览端口>/my-blog/<页面路径>/`，保存后 livereload 自动刷新。

**两个 hugo server 的坑，都在代码里处理掉了**：

- `--disableFastRender` 不能省（Fast Render 模式下新建的文件不会真正出现在站点里）
- `-F` 不能省（否则看不到日期写在未来的排期稿）

另外 hugo server 不会把「保存后固定链接变了」的页面注册到新地址上（`date`/`title`/`slug` 触发），所以界面在这三种字段被改动且预览在跑时会**自动重启预览**（重启即可复现正常）。

## 10. 夜间模式

顶栏 `#theme-toggle` 切换，偏好存 `localStorage` 的 `admin-theme`（与站点主题用的 `pref-theme` 无关）。

- 状态是 `<html>` 上的 `data-theme="light|dark"`，`style.css` 只留 `:root` 浅色 + `html[data-theme="dark"]` 暗色两份色板。**不要再用 `prefers-color-scheme` 媒体查询**：系统偏好各写一份色板的话，会和手动选择互相打架（属性选择器特异性高于 `:root`，媒体查询里那份就永远漏出来）
- `ui/theme.js` 在 `<head>` 里**同步**加载（**不能加 `defer`**），属性要在首屏绘制前写进 `<html>`，否则会闪一下；点击绑定放在 `DOMContentLoaded`
- 没存过偏好时跟随系统，且系统偏好变了实时跟随；手动切换过就以手动选择为准，不再跟随
- localStorage 读写都包 try/catch（隐私模式下会抛错），沿用 `app.js` 里 `admin-create-kind` 那套写法
- `color-scheme` 跟着一起切，否则搜索框、复选框、滚动条这些原生控件还是浅色的
- `--log-bg` / `--log-fg` 有意不在暗色块里覆盖：日志区任何时候都是深底

**预览不同步，这是有意的**：管理页在 `:1414`、hugo 预览在 `:1313`，**端口不同就是不同 origin**，localStorage 不互通，所以切管理页主题不会影响 iframe 里的站点；要看预览的暗色就在 iframe 里点站点自己的主题按钮。不做 `postMessage` 同步——那得往站点模板加代码，为本地工具改站点不划算。

## 11. 安全边界

因为这个服务**能执行 shell**：

- 默认只绑 `127.0.0.1`
- 校验 `Host` 白名单（防 DNS rebinding：外来域名解析到 127.0.0.1 也会被拒）
- 所有写操作要求自定义头 `X-Admin-Request: 1`（防其他网页对本地端口发跨站 POST）
- 所有 `path` 参数限制在 `content/` 内、拒绝 `..`
- `--host 0.0.0.0` 只在显式传参时生效并打印风险提示

**界面资源绝不能放进 `assets/js/` 或 `assets/css/extended/`**：那两个目录会被主题合并进公开站点资源，等于把管理界面发到线上。所以它们在 `tools/admin/ui/`，由 Node 服务直接提供。

## 12. `启动管理页.bat` 的硬约束

**必须保持纯 ASCII + CRLF**，这不是风格偏好：批处理里一旦有中文，`chcp 65001` 之后 cmd.exe 会按错误的字节偏移重读文件、把半行当命令执行。实测症状很有迷惑性——窗口里出现 `'会自动打开' is not recognized as an internal or external command`，**但服务其实照常起来了**，所以只看到「能跑」就以为没事。

因此**面向用户的中文提示全部由 `tools/admin/start.sh` 打印**（bash 写 UTF-8，配合启动器的 `chcp 65001` 显示正常），`.bat` 里只留英文注释与英文错误。`.gitattributes` 里的 `*.bat text eol=crlf` 就是为此加的（只有 LF 的 .bat 会让 `label`/`goto` 之类按行定位的语法出问题）。

启动器找 bash 的顺序刻意**先查 Git for Windows 的安装位置、再退回 PATH**：`C:\Windows\System32\bash.exe` 是 WSL 的 bash，用它跑这个脚本路径会全错。顺序为 `ADMIN_BASH` → `%ProgramFiles%\Git\bin\bash.exe` → `%ProgramFiles(x86)%\...` → `%LOCALAPPDATA%\Programs\Git\...` → 从 `where git` 反推 `..\bin\bash.exe`。找不到就打印 Git 下载地址并 `pause`，参数原样透传（`启动管理页.bat --port 1415` 可用）。

## 13. 体检面板（把校验搬进界面）

`scripts/` 下那批校验脚本过去只出现在终端和 `push-blog.sh` 里。体检面板按**同一口径**跑一遍，并且**不在管理页里复刻规则**：`lib/checks.mjs` 只负责「调哪个脚本、怎么解析输出」，脚本改了规则界面自动跟上。

| 档 | 检查项 | 说明 |
| --- | --- | --- |
| 快检 | 分区结构 / Front matter / 公式内容预检 / 标签词表 / 编辑器字段表 | 约 20 秒，其中 `check-frontmatter.sh` 独占 16–18 秒（Windows 上 bash 逐文件读的开销），其余都是秒级 |
| 全检 | 上面 5 项 + 公式真检 / 站点构建 / KaTeX 配对 / 站内链接 / 体积预算 | 实测约 30 秒（本机：front matter 18s + 公式真检 5s + 其余每项不到 2s）。后 3 项要读构建产物，所以「站点构建」排在它们前面 |

- 结果用 **SSE 流式**推：跑完一项推一项。慢项不会让界面全程空白，每项带耗时
- 阻断判定服从 `push-blog.sh`：`blocking` 的项失败时结论标「会阻断发布」；`check-tags` / `check-editor-schema` 只算提醒
- 输出解析成「文件 + 行号 + 级别」，按文件分组，每行「定位」按钮直接跳到编辑器对应行（文件行号减掉 front matter 高度才是正文行号）
- 全检里的「站点构建」会 `hugo --minify --gc --cleanDestinationDir` 重写 `public/`。`public/` 在 `.gitignore` 里，不会污染发布页的改动清单

## 14. 命令面板与快捷键

| 键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + K` | 开/关命令面板（也可点顶栏「搜索」） |
| `↑` `↓`（或 `Ctrl+N` / `Ctrl+P`） | 移动选择 |
| `Enter` | 执行 |
| `Esc` | 关面板 |
| `Ctrl/Cmd + S` | 保存当前编辑的文件 |
| `Ctrl/Cmd + Shift + S` | 保存并切到发布页（与编辑器头部的「保存并去发布」同一个动作） |

面板里三类结果混排：**动作**（切 tab、跑快检、刷新/重启预览、切主题、保存 / 保存并去发布 / 聚焦新建表单）、**文件**（本地已有的 `store.items`）、**正文命中**（`GET /api/search`，服务端按 mtime+size 缓存正文行，敲字时每 130ms 问一次也不重读磁盘）。正文命中带行号，回车跳到那一行。

### 14.1 三个「少跳一次」的动作

为「写完就能发」加的，都只做跳转与本地记录，**不新增任何写盘路径**：

- **最近打开**（`#tree-recent`，树上方，最多 6 条，存 `localStorage` 的 `admin-recent-files`）：树是按类型分组的，跨类型找「刚写的那篇」要翻两组以上。**只记路径，标题每次从 `store.items` 现取**——文件被删或改名后条目自然消失，不需要另写失效逻辑。同名条目（每章都有「章节入口页」）右边补一个短标签：入口页（`index.md` / `_index.md`）取所在目录名、其他取文件名去 `.md`。树搜索框有输入时整块隐藏，让位给结果
- **保存并去发布**（编辑器头部按钮 / `Ctrl+Shift+S`）：保存成功后 `activateTab('publish')`。**保存失败不跳**——把人送到一个还没有改动的发布页没有意义
- **创建后直接打开编辑器**（新建面板的勾选框，默认勾上，存 `admin-create-open`）：创建成功后用 `createdFiles(stdout)` 的第一条 `openInEditor()`。批量建材料页（章节的 `materials` 多选）时取消勾选，留在原地看日志

深链：地址栏是 `#<tab>` 或 `#edit/<文件路径>`，刷新与收藏都能回原处。**只做单向同步**——状态变化时写 hash、hash 变化时恢复状态，不回写，否则两边互相触发。

未保存保护：有脏文件时 `beforeunload` 拦一次；树上的条目也会带「未保存」标记。

## 15. 插入图片

正文里**粘贴或拖入图片**即落盘：

- 存到**当前编辑文件所在目录**（Hugo leaf bundle 约定），插入的引用是 `./文件名`
- `POST /api/asset/upload` 收 `data:` URL；白名单 png / jpg / webp / gif / svg / avif，单张上限 8MB（该路由的 JSON 请求体上限相应提到 16MB，其余接口仍是 8MB）
- 文件名清洗后去重（`x.png` 已存在就写 `x-2.png`），`resolveContentPath` 保证只落进 `content/`
- 图片是**真实文件**，会被 `git add -A` 带进发布——这是有意的：封面与正文配图本来就要进仓库

## 16. 预览：宽度与设备宽度

- 中间的分隔条可拖动（宽度存 `localStorage` 的 `admin-preview-w`），双击复位到默认 `42vw`
- 三档设备宽度：桌面（撑满）、平板 834px、手机 390px，存 `admin-preview-device`；后两档在 iframe 上加边框与阴影，切回桌面即还原

## 17. 发布页的三块新信息

顶栏与 `/api/state` 里早就有这些数据，界面过去没用上：

- **草稿与排期**：`drafts` / `futureDated` 逐条列出。草稿行有「转正式」——只改 `draft` 一个字段（`PUT /api/content/file`），正文原样交回，服务端按行替换，其他内容不动
- **最近提交**：`recentCommits`（`git log --oneline`）
- **CI 状态**：`GET /api/ci` 读 GitHub Actions 最近 6 次运行。**不用 `gh`**：本机 gh 装过但没登录，而公开仓库未认证的 REST 就能读；想提限流额度就设 `GH_TOKEN`

CI 这块走 `curl` 而不是 Node 的 `fetch`：这台机器上 `fetch` 直连 `api.github.com` 会挂（实测 socket 超时 / 504），同一地址走本地 HTTP 代理 7 秒回 200。代理来源 `ADMIN_PROXY` → `HTTPS_PROXY` → `https_proxy`；`start.sh` 启动时按 `7891 → 7890 → 10809 → 1080` 探一次，探到就设 `ADMIN_PROXY`。**都探不到也不影响别的功能**，CI 那块只显示「读不到」。结果缓存 5 分钟，发布后自动失效。

## 18. 新增 API

| 路由 | 作用 |
| --- | --- |
| `GET /api/check/items` | 检查项表（来自 `lib/checks.mjs`），界面用它渲染左栏 |
| `POST /api/check` | 跑体检，SSE 流：`start` / `item-start` / `item-done` / `done` |
| `GET /api/search?q=` | 正文全文搜索，返回 `path` / `title` / `line` / `text` / `kind` |
| `POST /api/asset/upload` | 图片落盘，返回 `{path, markdown}` |
| `GET /api/ci` | GitHub Actions 最近运行 |

`lib/` 里新增四个模块：`checks.mjs`、`search.mjs`、`asset.mjs`、`ci.mjs`。

## 19. 已知限制

- 只在本机可用（不做在线后台）
- 幂等性没做文件锁，**不要同时开两个管理页改同一批文件**
- 体检的**全检会重建 `public/`**（数分钟）。期间预览照常，但别同时点发布——`push-blog.sh` 自己还会再构建一遍，白等一次
- CI 状态要有能连 `api.github.com` 的通道（本机得靠代理，见第 17 节）。拿不到时那块只显示「读不到」，**不影响发布本身**
- 拖入 .md 的客户端上限 **4MB**（更大会被拒；服务端 JSON 请求体上限是 8MB）
- `start.sh` 的 `usage()` 用 `sed -n '2,14p' "$0"` 打印文件头注释——**改文件头时行号要一起调**（注释块是第 2–14 行）

## 20. 外观：霜雪背景、配色与图标

风格是神里绫华：冰蓝（`--accent`）、霜白（`--bg` / `--card`）、樱花粉（`--sakura`，只做点缀），`--gold` 只用在细描边。整套令牌在 `style.css` 顶部，装饰细节在文件末尾的「霜雪细节」段。

- **对比度按 WCAG AA 卡过**：浅色 `--accent #3a76a4` 配白字 4.9:1、`--muted #4e6b80` 在底色上 5.2:1；深色 `--accent #7fc0e8` 配深字 9.3:1。**`--sakura` 只有 2.6:1，只能做装饰，不许当正文色或按钮底色**。面板是 `color-mix(in srgb, var(--card) 66%, transparent)`，按合成公式（66% 面板 + 34% 背景层）折下来浅色正文 15.6:1、次要文字 5.5:1，深色 15.2:1 / 7.5:1。
- **背景图就是仓库里那张绫华插画**（`ui/ayaka-bg.webp`，2560×1459，146 KB，和风庭院 + 风铃 + 樱花）。两版：`ui/ayaka-day.webp`（84 KB，浅色主题）、`ui/ayaka-night.webp`（58 KB，深色主题，压暗 + 冷调），都由 `tools/backgrounds/make-admin-bg.py` 从源图生成（**源图入库**，否则这两版不可复现）。
- **只做色温校正，不虚化、不洗白**：原图是庭院暖光 + 青绿植物，和界面的冰蓝/霜白不在一个色温上，压一层薄蓝（浅色 7%、深色 16%）就落回来了。用薄蓝混色而不是 `hue-rotate`——后者会把樱花粉染成紫。**人物要看得清**：这张构图是认过的，不该为了「干净」把它糊掉（试过霜白化版本，被否了）。
- **构图要求：画面散、别只有居中的大特写**。面板 66% 半透明又几乎占满宽度，背景只在四周和中缝露出来，居中的特写会被面板盖掉大半。要换图先按这条筛。
- 想回到「没有人像的纯霜雪质感」：跑 `python tools/backgrounds/make-backgrounds.py --frost` 生成 `ui/frost-{light,dark}.webp`，再把 `body::before` 的 `url()` 指过去（默认不生成，免得仓库里躺两张没人用的图）。
- 接线方式和站点用的是同一套：`html` 承担底色、`body` 置透明、`body::before` 固定层放 `linear-gradient(蒙版) + url("/ayaka-day.webp")`。**`body` 忘了置透明就整张图看不见**（和 `00-theme.css` 那个坑一样，理由见 `features.md` ⑫）
- 蒙版浅色 `.46→.70`、暗色 `.58→.84`。**面板从 84% 一路调到 66% 的约束不是对比度而是「再低背景就喧宾夺主」**——这条结论没变，换背景图也不影响
- 顶栏 `color-mix(... 82% ...)` + `backdrop-filter`，滚动时背景从下面透出来
- 换图：把新图放进 `ui/`（**必须是平铺文件名**——`server.mjs` 的 `serveStatic` 只接受 `[A-Za-z0-9._-]+`，不支持子目录），改 `style.css` 里的 `url()`。新增扩展名要同时加进 `STATIC_TYPES`（`.webp` / `.png` 已加）
- **`ayaka.ico`（169 KB，16→256 六帧）只给本地用**：管理页标签页图标 + 桌面快捷方式。桌面快捷方式 `博客管理页.lnk` 的 `IconLocation` 指向它；换图标后 Explorer 有缓存，跑 `ie4uinit.exe -show` 或注销一次才刷新
- 图标与站点那套同源，都由 `tools/icons/make-icons.py` 生成（素材出处与许可见 `architecture.md` 第 6 节）
