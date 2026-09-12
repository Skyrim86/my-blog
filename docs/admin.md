# 本地管理页

改 `tools/admin/` 里的任何东西之前读这篇。它同时受 [`../AGENTS.md`](../AGENTS.md) 的约定约束。

## 1. 入口与构成

两个入口**等价**：

- **双击仓库根目录的 `启动管理页.bat`**（不用开终端，桌面快捷方式也指向它）
- 命令行 `bash tools/admin/start.sh`（对话里用 `/admin`）

双击后它会自动打开浏览器、并顺手带起 `hugo server` 预览。

它在本机起一个**零依赖的 Node 服务**（只用 `node:` 内置模块，**没有 package.json、没有 node_modules**），浏览器打开一个中文单页，四块功能：**新建**（九种内容类型的表单 + 词表 chips 选标签 + **拖入 .md 导入**）、**编辑**（内容文件树 + front matter 表单 + Markdown 工具条 + 删除 + **拖入 .md 替换正文**）、**发布**（git 改动清单 + diff + 提交说明 + 流式日志）、**同屏 iframe 预览**。

```
tools/admin/
├── start.sh        # 启动器：参数解析、找 bash/node/hugo、开浏览器、exec server.mjs
├── server.mjs      # HTTP 服务：静态页 + JSON API（新建/删除/编辑/词表/git/发布）
├── lib/            # 业务模块：content / frontmatter / taxonomy / git / hugo / exec
└── ui/             # index.html + app.js + style.css（原生前端，无框架无构建）
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
- **`draft` 永远不因为导入而改变**：文件里写 `draft: false` 只给一条提示，要发布得自己勾「直接发布」/ 取消「仍是草稿」。
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

### 7.1 公式转义（`\*`）自动修复

`\*` 不是 KaTeX 命令（数学里只认裸 `*`），而它在 markdown 散文里是合法转义——所以**不能全局替换**，只能认数学区域。修法与扫描只有 `scripts/fix-math-escapes.mjs` 一份实现，管理页只是导入它的 `fixMathEscapes()`：

- **保存**（`handleSave`）：对「即将写入的正文」跑一遍。哪怕只是打开一个已写坏的文件、原样点保存，也会被修好。命中时响应里回传 `mathFix` 与修正后的 `body`，前端据此同步编辑器正文（不同步的话下次保存又会把坏文本写回去）并提示修了几处。
- **新建**（`handleCreate`）：喂给 `new-content.sh` 的 stdin 正文先过同一个函数，`mathFix` 一并回传，日志里打一行说明。
- **发布**：修在 `scripts/push-blog.sh` 里（管理页的「发布」就是调它，命令行发布同一入口共用），见 [`architecture.md`](architecture.md) 第 4 节。

扫描器先剔除围栏代码块与行内代码，再只对 `$$…$$` / `$…$` / `\(…\)` / `\[…\]` 内部动手：散文里的 `\*强调\*`、代码块里的 `\*` 一律不碰。`\\*`（换行符 + 普通星号）也不会被误改。已知不覆盖四空格缩进的代码块（与列表缩进无法可靠区分）。

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

## 13. 已知限制

- 只在本机可用（不做在线后台）
- 幂等性没做文件锁，**不要同时开两个管理页改同一批文件**
- 拖入 .md 的客户端上限 **4MB**（更大会被拒；服务端 JSON 请求体上限是 8MB）
- `start.sh` 的 `usage()` 用 `sed -n '2,14p' "$0"` 打印文件头注释——**改文件头时行号要一起调**（注释块是第 2–14 行）
