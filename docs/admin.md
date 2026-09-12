# 本地管理页

改 `tools/admin/` 里的任何东西之前读这篇。它同时受 [`../AGENTS.md`](../AGENTS.md) 的约定约束。

## 1. 入口与构成

两个入口**等价**：

- **双击仓库根目录的 `启动管理页.bat`**（不用开终端，桌面快捷方式也指向它）
- 命令行 `bash tools/admin/start.sh`（对话里用 `/admin`）

双击后它会自动打开浏览器、并顺手带起 `hugo server` 预览。

它在本机起一个**零依赖的 Node 服务**（只用 `node:` 内置模块，**没有 package.json、没有 node_modules**），浏览器打开一个中文单页，四块功能：**新建**（九种内容类型的表单 + 词表 chips 选标签）、**编辑**（内容文件树 + front matter 表单 + Markdown 工具条 + 删除）、**发布**（git 改动清单 + diff + 提交说明 + 流式日志）、**同屏 iframe 预览**。

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
- 「笔记 / 作业 / 实验」三个入口用来**给已有章节补材料**：它们的「所属章节」下拉是唯一与其他字段有依赖的选项，跟着「所属课程」联动（`fillChapterOptions()`，选项由服务端 `options.chapters` 下发，前端不推导路径）
- `checks` 是字段渲染器里的一种类型：同名 checkbox 共用 `data-field`、靠 `data-cvalue` 区分，所以 `snapshotCreateFields`/`restoreCreateFields`/提交收集三处都必须把它们聚合成数组——按 `data-field` 直接赋值会让同组的多选框互相覆盖

## 4. 字段表与 `archetypes/` 是策展关系，不是副本

编辑器字段表是 archetype 的**子集 + 补充**（实测差异：只给 UI 的 `post.slug`、`material.math`、`project-doc.tags` 在 archetype 里没有；而有意不暴露的 `layout`、`date`、`cover.relative` 等又在 archetype 里有）。

所以**没有**做「按 archetype 机械生成表单」——那会把 `layout`/`date` 顶进表单、丢掉 `slug`、并改掉每个类型的字段顺序，是行为回归。取而代之的是 `scripts/check-editor-schema.mjs`：archetype 里出现了既没被 UI 暴露、也不在它 `hidden` 列表里的键就报警，把**静默分叉**变成可见提醒。（这个检查在 `push-blog.sh` 与 CI 里跑，**只警告不阻断**。）

## 5. 架构红线做成了界面约束

`content/courses/**/notes|homework|lab`、章节入口页、子项目页、各类 section/列表页的 **tags 字段在界面上隐藏并禁用**（理由见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩)：section 写 tags 只会让计数虚高；材料页写了会整体丢掉 cascade 下发的标签）。分层项目的文档页写 tags 会给出「会丢掉项目级标签」的提示。

**服务端也会忽略不属于该类型 schema 的字段**——实测在材料页硬塞 tags 不会写进文件。所以界面护栏与后端规则不会分叉。

**新标签先入词表、再建内容**：界面上勾的新词会先经 `/api/taxonomy/add` 写进 `data/taxonomy.yaml`（写后立刻用 `new-content.sh tags` 复核，复核不过就回滚原文件），全部校验通过才建文件——沿用 `new-content.sh`「校验早于建文件」的原则。建内容前的预检走 `new-content.sh add-term --check`，**校验规则也只有 shell 那一份**。

## 6. 写入收敛

`data/taxonomy.yaml` 的追加不再由 Node 自己拼 YAML —— `new-content.sh` 提供了 `add-term <tags|categories> <词条>` 子命令（`--check` 只校验），界面只是调它。原先 Node 侧那份 `insertTerm`/`validateTerm` 已删除，词表的读、写、校验现在都只有 shell 一份实现。

同理，**页面 URL 不再由 Node 自己算，而是问 Hugo**：`hugo list all` 输出每页的 `path,permalink`（`lib/content.mjs` 的 `previewUrl` 读它，缓存 5s，保存/新建时失效）。所以 `permalinks` 规则、`pathToLower`（`CMC2026` → `cmc2026`）、front matter 的 `url`、中文的百分号编码都由 Hugo 说了算，配置改了不会与界面分叉；只有「Hugo 列不到这一页」（刚新建还没落盘、或 hugo 不可用）时才退回启发式，并标 `source: 'heuristic'`。

这条是通用原则：**能问工具的就不要自己实现**。此前两处重复实现（Node 拼词表、Node 算 URL）都因为「自己又写了一遍」而必然腐化，已删除。

## 7. 删除：两步确认 + 预检

编辑器头部的「删除」按钮第一次点击先发 `POST /api/content/delete` 带 `dryRun: true`，`remove --dry-run` 把将删除的文件清单回报上来（渲染在 `#ed-delete-notice` 里，含文件数、未保存改动提醒、`git checkout --` 恢复命令），按钮转红变「确认删除」；第二次点击才真删。

**判定规则不在 Node 里**：`buildRemoveArgs()` 只做「必须在 `content/` 内、不含 `..`」的最小护栏，其余（连不连目录删、section 根拒绝）全在 `new-content.sh` 的 `cmd_remove`。

删除成功后要一起做四件事：清空编辑器占位、`loadItems(true)` + `renderTree()`、`renderCreateFields()`（课程/章节下拉跟着变）、并把预览改指到仍然存在的最邻近祖先 `_index.md`（`nearestSurvivingIndex()`）——否则 iframe 会停在已删掉的地址上。

重新渲染编辑器时必须 `resetDeleteArm()`：不解除武装的话，「确认删除」会落到下一个刚打开的页面上。

## 8. URL 与预览

预览由内置的 `hugo server -D -F --disableFastRender` 提供，iframe 指向 `http://127.0.0.1:<预览端口>/my-blog/<页面路径>/`，保存后 livereload 自动刷新。

**两个 hugo server 的坑，都在代码里处理掉了**：

- `--disableFastRender` 不能省（Fast Render 模式下新建的文件不会真正出现在站点里）
- `-F` 不能省（否则看不到日期写在未来的排期稿）

另外 hugo server 不会把「保存后固定链接变了」的页面注册到新地址上（`date`/`title`/`slug` 触发），所以界面在这三种字段被改动且预览在跑时会**自动重启预览**（重启即可复现正常）。

## 9. 夜间模式

顶栏 `#theme-toggle` 切换，偏好存 `localStorage` 的 `admin-theme`（与站点主题用的 `pref-theme` 无关）。

- 状态是 `<html>` 上的 `data-theme="light|dark"`，`style.css` 只留 `:root` 浅色 + `html[data-theme="dark"]` 暗色两份色板。**不要再用 `prefers-color-scheme` 媒体查询**：系统偏好各写一份色板的话，会和手动选择互相打架（属性选择器特异性高于 `:root`，媒体查询里那份就永远漏出来）
- `ui/theme.js` 在 `<head>` 里**同步**加载（**不能加 `defer`**），属性要在首屏绘制前写进 `<html>`，否则会闪一下；点击绑定放在 `DOMContentLoaded`
- 没存过偏好时跟随系统，且系统偏好变了实时跟随；手动切换过就以手动选择为准，不再跟随
- localStorage 读写都包 try/catch（隐私模式下会抛错），沿用 `app.js` 里 `admin-create-kind` 那套写法
- `color-scheme` 跟着一起切，否则搜索框、复选框、滚动条这些原生控件还是浅色的
- `--log-bg` / `--log-fg` 有意不在暗色块里覆盖：日志区任何时候都是深底

**预览不同步，这是有意的**：管理页在 `:1414`、hugo 预览在 `:1313`，**端口不同就是不同 origin**，localStorage 不互通，所以切管理页主题不会影响 iframe 里的站点；要看预览的暗色就在 iframe 里点站点自己的主题按钮。不做 `postMessage` 同步——那得往站点模板加代码，为本地工具改站点不划算。

## 10. 安全边界

因为这个服务**能执行 shell**：

- 默认只绑 `127.0.0.1`
- 校验 `Host` 白名单（防 DNS rebinding：外来域名解析到 127.0.0.1 也会被拒）
- 所有写操作要求自定义头 `X-Admin-Request: 1`（防其他网页对本地端口发跨站 POST）
- 所有 `path` 参数限制在 `content/` 内、拒绝 `..`
- `--host 0.0.0.0` 只在显式传参时生效并打印风险提示

**界面资源绝不能放进 `assets/js/` 或 `assets/css/extended/`**：那两个目录会被主题合并进公开站点资源，等于把管理界面发到线上。所以它们在 `tools/admin/ui/`，由 Node 服务直接提供。

## 11. `启动管理页.bat` 的硬约束

**必须保持纯 ASCII + CRLF**，这不是风格偏好：批处理里一旦有中文，`chcp 65001` 之后 cmd.exe 会按错误的字节偏移重读文件、把半行当命令执行。实测症状很有迷惑性——窗口里出现 `'会自动打开' is not recognized as an internal or external command`，**但服务其实照常起来了**，所以只看到「能跑」就以为没事。

因此**面向用户的中文提示全部由 `tools/admin/start.sh` 打印**（bash 写 UTF-8，配合启动器的 `chcp 65001` 显示正常），`.bat` 里只留英文注释与英文错误。`.gitattributes` 里的 `*.bat text eol=crlf` 就是为此加的（只有 LF 的 .bat 会让 `label`/`goto` 之类按行定位的语法出问题）。

启动器找 bash 的顺序刻意**先查 Git for Windows 的安装位置、再退回 PATH**：`C:\Windows\System32\bash.exe` 是 WSL 的 bash，用它跑这个脚本路径会全错。顺序为 `ADMIN_BASH` → `%ProgramFiles%\Git\bin\bash.exe` → `%ProgramFiles(x86)%\...` → `%LOCALAPPDATA%\Programs\Git\...` → 从 `where git` 反推 `..\bin\bash.exe`。找不到就打印 Git 下载地址并 `pause`，参数原样透传（`启动管理页.bat --port 1415` 可用）。

## 12. 已知限制

- 只在本机可用（不做在线后台）
- 幂等性没做文件锁，**不要同时开两个管理页改同一批文件**
- `start.sh` 的 `usage()` 用 `sed -n '2,14p' "$0"` 打印文件头注释——**改文件头时行号要一起调**（注释块是第 2–14 行）
