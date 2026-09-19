# 内容结构、front matter 与标签

改内容、改脚手架、改标签规则之前读这篇。红线在 [`../AGENTS.md`](../AGENTS.md) 第 2 节（规则 3、4），这里是机制与原因。

## 1. 三种内容形态

| 形态 | 结构 | 层级 | 有附件下载区 | 有技术栈面板 |
|---|---|---|---|---|
| 文章 | `content/posts/<slug>/index.md`（leaf bundle） | 单页 | ✗ | ✗ |
| 课程 | 课程主页 → 章/周 → 材料页（笔记/作业/实验） | 三层 | ✓（材料页） | ✗ |
| 项目 | 平铺：`content/projects/<项目>/index.md`（leaf bundle） | 单页 | ✗ | ✓ |
| 项目（分层，仅 CMC2026） | 项目主页 section → 子项目 section → 文档 regular page | 三层 | ✗ | ✗ |

项目**默认是平铺单页**，没有「章」这一层、没有笔记/作业拆分、没有附件区。**只有项目里确实还要放子项目时**才改成分层——原因见第 4 节。

文章放 Page Bundle（`<slug>/index.md`），封面图 `cover.image` 放在同目录。文章的 `:slug` 取自**标题**而不是目录名：`content/posts/my-first-post/` 的实际 URL 是 `/2026/09/我的第一篇文章/`（用 `hugo list drafts` 打印的 permalink 核对）。

## 2. 课程结构（课程 → 章 → 材料页）

```
content/courses/<课程>/_index.md          # branch bundle，layout: "course"，unit: "章"
content/courses/<课程>/<chapter-0N>/_index.md   # branch bundle，layout: "chapter"
content/courses/<课程>/<chapter-0N>/notes/index.md      # leaf bundle，📖
content/courses/<课程>/<chapter-0N>/homework/index.md   # leaf bundle，📝
content/courses/<课程>/<chapter-0N>/lab/index.md        # leaf bundle，🧪
```

- **课程主页**由 `layouts/courses/course.html` 渲染：面包屑 + 标题 + `unit` 说明 + 自动章节目录（按 `weight` 排序，显示「第 N 章」、可点的材料徽章、`N 篇材料 · 更新于 …`）+ 大纲正文
- **课程规划与进度**：front matter 的 `plan` 列表（`weight` / `title` / `summary`）+ 正文里一行 `{{< course-plan >}}`，渲染成进度条与「已发布 / 计划中」对照表。已发布判定按 `title` 与子章节标题**逐字相同**（课程会跳章，按 weight 会算错），详见 docs/features.md 第 ⑯ 项
- **章节入口页**由 `layouts/courses/chapter.html` 渲染：把本章子页面按**类型分组**列成入口卡片（组名取 i18n 的 `courseGroup*`，卡片的名字取 `title`、图标取 `icon`、组内顺序取 `weight`）。**笔记、作业、实验不堆在同一页**，必须从这里分开进入
- **材料页**走主题 `single.html`：正文即内容，附件区由 `extend_post_content.html` 注入 `course-downloads.html`

**分组只认目录名，不认 front matter**：`notes`、`notes-02` → 笔记组，`homework` → 习题组，`lab`、`lab-02` → 实验组，其余一律进「其他」组。上一版是「不认目录名、只认章下面的 regular page」的一列平铺，2026-09-18 改成分组（要求来自使用侧：一章里笔记三页、作业实验各一页时，平铺看不出哪几页是一类）。取目录名而不是加一个 front matter 字段，是因为目录名**本来就是**材料的身份：`scripts/new-content.sh` 的子命令就叫 `notes|homework|lab`，`archetypes/lab.md` 里也写着「同一章要放多个实验时用 `--dir` 指定目录名（如 `lab-02`）」。所以已有的材料页一个都不用改，也没有新字段要同步到 `check-editor-schema.mjs`。

代价是**新增材料类型时要知道它会落到「其他」组**：`exam` 这类新目录名会照常显示、不会消失，但组名是「其他」——想要自己的组就改 `chapter.html` 的 `$groups`/`$known` 与 `i18n/zh.toml`。认不出目录名（非 `[a-z]+[-_0-9]*` 形状）时同样归「其他」。

三种规范材料的骨架是 `archetypes/notes.md`(weight 1, 📖) / `homework.md`(2, 📝) / `lab.md`(3, 🧪)，三者的键必须保持一致——`scripts/check-editor-schema.mjs` 用一份字段表覆盖它们。

**附件** = 与 `index.md` 同目录的任意非图片资源（PDF/zip…），Hugo 随页面发布，`.RelPermalink` 即下载地址，**不需要文件名前缀**（图片会被过滤掉，不会出现在下载列表）。

分区单位由课程主页的 `unit` 决定（`章` 或 `周`）；章节只写 `weight`，显示名自动拼成「第 N 章」。

## 3. 项目结构

**平铺**（默认）：`content/projects/<项目>/index.md`，front matter 用 `title` / `date` / `description` / `tags`（技术栈也走 tags，不另设字段，这样能进 `/tags/` 词条页）/ `repo`（仓库地址）/ `categories: ["项目"]`。项目页复用主题 `single.html`，技术栈与仓库链接由 `project-meta.html` 自动追加，**不需要写 layout**。

**分层**（例外，目前只有 `CMC2026`）：

```
content/projects/CMC2026/_index.md                    # 项目主页（section，含 cascade）
content/projects/CMC2026/problem-01/_index.md         # 子项目（section，刻意不写 tags）
content/projects/CMC2026/problem-01/solution.md       # 文档（regular page，math 默认 true）
```

leaf bundle **不能**包含子页面，所以「项目 → 子项目 → 文档」只能用 branch bundle / section 实现。三级都走主题 `list.html`（它取 `union .RegularPages .Sections` 渲染卡片），**依然没有自定义模板**。三点代价：

1. section 页不走 `single.html`，所以项目页与子项目页**不会**出现「技术栈 + 查看源码」面板（其下的文档页也不该有——`extend_post_content.html` 注入 `project-meta.html` 时必须限定 `Type == "projects"` **且 `.BundleType == "leaf"`**，否则分层项目下的文档页会把主题标签当成技术栈显示出来）
2. 项目主页的 `cascade` 只下发 `tags`/`categories`、**不含 `math`**，所以文档页要渲染公式仍须逐页写 `math: true`
3. 标签只写在项目主页的 `cascade` 里——给 section 页自己写 `tags`/`categories` 是**无效的**

子项目与其下文档都不要写 `tags`（会整体丢掉项目级标签）。某篇文档想有自己的主题标签时，按「cascade 只填空、不合并」的规则，该文档显式写全即可（此时会丢掉项目级标签）。这条已经做成 `check-frontmatter.sh` 的警告 d：判据是**祖先目录里存在 `_index.md`**（＝处在 cascade 之下），不写死项目名，所以以后新建的分层项目自动生效。

## 4. `cascade` 的三条硬规矩

课程主页与分层项目主页用 `cascade` 把 `tags`/`categories` 下发给后代，只需写一次。写法必须带 `target: {kind: page}`：

```yaml
cascade:
  - target:
      kind: page
    tags: ["数值分析", "数学"]
    categories: ["课程"]
```

1. **标签只打在 regular page 上**。section 页（课程主页、章节入口页、分层项目页与子项目页）即使带上标签，也只会让 `/tags/` 的计数虚高、词条页里却不出现——主题 `list.html:41` 取 `union .RegularPages .Sections`，而词条页（term）没有子 section，`.RegularPages` 又不含 branch bundle。实测：课程主页带标签时 `/tags/数值分析/` 计数 1、列表 0 条。`target.kind: page` 正是用来把 section 自己排除掉的
2. **`cascade` 只填空、不合并**：子孙页一旦自己写了 `tags`，继承来的标签会被**整体丢弃**（不是取并集）。所以 `archetypes/notes.md`、`homework.md`、`project-section.md` 刻意不含 `tags` 键——**空数组也算「已定义」**，同样会阻断继承
3. 写作用范围用新名字 **`target`**，不要写 `_target`（0.156 起弃用，虽能用但会打弃用警告）

补充：**`cascade` 不作用于 branch bundle 自身**——写在课程主页 `_index.md` 的 `cascade` 不会给课程主页自己打标签，只给后代。

课程主页还必须显式写 `math: false` 覆盖自己下发的 `cascade`；没有公式的章节入口页也写 `math: false`（省下约 23KB 的 `katex.min.css`）。**入口页导语里确实有公式的必须写 `math: true`**——`chapter-02` 曾写成 `false`，那条公式长期在页面上原样显示成源码（现在有兜底检测托着，但 front matter 仍应写对）。

## 5. 标签词表

`data/taxonomy.yaml` 是**标签拼写的唯一事实源**。格式约定（脚本按此 grep 解析，**别改成嵌套 YAML**）：顶层键 `tags:` / `categories:`，词条每行写成「两个空格 + `-` + 空格 + 词条」，分组只用 `#` 注释。

新建内容时**从词表里选**而不是手打：`new-content.sh` 交互式列出编号让你挑，斜杠命令与管理页则用选择器勾选。词表里没有的词必须显式加 `--new-tag`（脚本会自动追加进词表，词表因此不会腐化）。

`scripts/check-tags.sh` 扫 `content/` 下所有 front matter 的 tags 与词表比对，报告未登记的词、大小写不一致、以及无法解析的块列表写法。`push-blog.sh` 会调它，**只警告不阻断**。

管理页的「加入词表」按钮走 `new-content.sh add-term <tags|categories> <词条>`（`--check` 只校验）：词表的读、写、校验都只有 shell 一份实现，界面上勾的新词会**先写进词表、再用 `tags` 子命令复核，复核不过就回滚**，全部校验通过才建内容。

**词条页的说明文字不在这个词表里**：`/tags/xxx/`、`/categories/xxx/` 页头那句介绍写在 `content/<taxonomy>/<词条>/_index.md`（只写 `title` + `description`，主题 `list.html` 会渲染 `.Description`）。**目录名必须与词条 URL 一致，而不是与词表里的写法一致**：`CMC2026` → `content/tags/cmc2026/`、`Go Template` → `content/tags/go-template/`、`CSS` → `content/tags/css/`，中文词条直接用中文字符（`content/tags/回归分析/`）。词表刻意不加描述字段 —— 它的格式被 `new-content.sh` 与 `check-tags.sh` 按行解析，加字段就得同时改两处解析。详见 [features.md ㉘](features.md)。

## 6. 脚手架：`scripts/new-content.sh`

一个入口覆盖文章 / 课程主页 / 章节（可含材料页）/ 三个材料子命令 / 平铺项目 / 分层项目 / 分层项目文档 / **section 列表页** / **删除**。**多文件结构是 `hugo new` 做不到的部分**（一章一次生成 `chapter-0N/_index.md` + 勾选的材料页，章号自动递增）。

实现要点：

- **front matter 的唯一事实源是 `archetypes/`**：脚本只调 `hugo new content <path> --kind <kind>`，不另抄一份模板（避免两处漂移）；之后用 awk 在首个 `---` 区块内做定向行替换，注入 `tags`/`title`/`weight`/`repo` 等
- **`--kind` 必须显式给**：`notes/index.md` 的默认 kind 会取路径首段 `courses`，拿到的是错的骨架
- 建文件前先 `[ -f ]` 判存在（`hugo new content` 冲突时退出码也是 1，无法区分原因）；**标签、`--materials` 与 `--date` 校验都在任何建文件动作之前完成**，避免校验失败留下半成品文件
- 默认 `draft: true`（与 archetype 一致），`--publish` 才写 `false`
- 三个通用选项（管理页拖入 `.md` 时用）：`--date YYYY-MM-DD` 覆盖骨架里的 `date`（必须 `YYYY-MM-DD` 开头）、`--description 文本`、`--body-stdin` 从**标准输入**读正文整体替换骨架的占位正文。`--body-stdin` 只作用于该子命令创建的**主页面**（`chapter` 作用于入口页 `_index.md`，材料页不带正文；`--layered` 项目作用于 `_index.md`），且 stdin 为空时保留骨架正文

子命令与材料页：

```bash
bash scripts/new-content.sh post     <slug> --title "标题" --tags A,B [--series "系列名"]
bash scripts/new-content.sh course   <课程> --tags A,B [--unit 章] [--title 标题]
bash scripts/new-content.sh chapter  <课程> <章节标题> [--materials notes,homework,lab|none]
bash scripts/new-content.sh notes|homework|lab <课程> <章节> [--dir 目录名] [--title 标题]
bash scripts/new-content.sh project  <项目> --tags A,B [--repo URL] [--layered]
bash scripts/new-content.sh sub      <项目> <子项目>
bash scripts/new-content.sh doc      <项目>/<子项目> <文档名> [--no-math]
bash scripts/new-content.sh section  <路径> --title 标题 [--description 描述]
bash scripts/new-content.sh remove   <content 路径> [--with-bundle] [--dry-run]
```

- `notes`/`homework`/`lab` 分别建三个 leaf bundle（`--dir` 可改目录名，用于同一章的第二个实验 `lab-02`）
- `chapter --materials` 决定一并建哪些材料页，**默认 `notes,homework`**，`none` 只建入口页；漏掉的材料之后用子命令单独补
- 补材料时 `<章节>` 填**章节目录名**（如 `chapter-01`），不是章节标题
- **`next_material_weight()` 与 `next_weight()` 是两个函数**：后者数的是 `*/_index.md` 与 `*.md`（`sub`/`doc` 用），材料页是 `*/index.md`，用它会永远得 1 —— 这个错误实测出现过，`--dir lab-02` 因此拿到 weight 1 与笔记撞号
- **`section` 建的是「分区的列表页」**（`content/<路径>/_index.md`）：路径相对 `content/` 写（`posts`、`projects/CMC2026/approach`），`--title` **必填**（列表页标题会显示在导航与页面上，不填就会静默留下目录名）；骨架 `archetypes/section.md` 只有 `title` + `description`，**没有** `tags`/`date`/`draft`（与现有那些列表页一致，传 `--publish`/`--date` 只提示忽略）。它拒绝带 `content/` 前缀的路径、拒绝 leaf bundle 目录、要求目录已存在——职责是「补列表页」，不是「开新分区」

**`remove` 是删除的唯一实现**（管理页也调它）：只接受 `content/` 内的 `.md`、拒绝 `..`、拒绝删 `content/` 本身；`--with-bundle` 时 `index.md` 删所在 leaf bundle 目录（含附件）、`_index.md` 删所在 branch 目录，但**直接位于 `content/` 下的 section 根一律拒绝**（否则一键就能清空 `content/courses`）。先打印将删除的文件清单再动手，`--dry-run` 到此为止。另外**`_index.md` 不允许单独删除**（不带 `--with-bundle` 直接拒绝）：它是分区的列表页，删掉后整个分区就没有入口页了。

### 每个 section 目录都必须有 `_index.md`

「列表页」= 分区的入口页：`/posts/`、`/courses/`、`/projects/`、`/tags/` 这些 URL 都靠 `content/<分区>/_index.md` 存在。没有它，Hugo 只会给一个**隐式 section**——页面能不能存在取决于下面还有没有子页面；最后一个子页面被删空时，列表页本身与所有指向它的入口（导航栏、首页、正文链接）会一起 404。`content/posts/` 曾经就是靠一篇占位文章撑着的，文章一删 `/posts/` 整个消失，而当时没有任何校验发现。

这条不变量由三处一起守：

| 环节 | 在哪 | 拦什么 |
|---|---|---|
| 结构校验（阻断） | `scripts/check-sections.sh` | 有子页面却没有 `_index.md` 的目录；`index.md` 与 `_index.md` 同时存在的目录 |
| 链接校验（阻断） | `scripts/check-links.mjs` | 列表页真的没了时，导航栏/首页/正文里指向它的链接（同站绝对链接也在检查范围内） |
| 删除护栏 | `scripts/new-content.sh remove` | `_index.md` 不能单独删；一级分区的整目录删除一律拒绝 |

补一个列表页：`bash scripts/new-content.sh section <路径> --title 标题`。

## 7. 在对话里建内容

用 `/new-post`、`/new-course`、`/new-project`，或打开管理页（`bash tools/admin/start.sh`）。**不要用 Write 直接创建内容文件、也不要手抄 front matter**——`archetypes/` 是唯一事实源，手抄必然漂移（`archetypes/default.md` 的 `cover.relative` 就曾长期是错的）。**删除也一样**走 `new-content.sh remove`，不要在会话里手敲 `rm`。

## 9. 课程内容从课程项目导入（含数学工具库）

「回归分析」这类课程的项目根不在博客仓库里（`D:\1.Study\course\回归分析`），博客侧的内容与数据由脚本生成：

```bash
python tools/course-import/import_course.py            # 生成 / 更新
python tools/course-import/import_course.py --check    # 只比对（CI 不跑：CI 里没有课程项目目录）
```

| 产物 | 来源 |
|---|---|
| `content/courses/<课程>/<chapter>/<材料>/index.md` 的**正文** | 课程项目的 `笔记/`、`作业/`、`实验/` 里的 md。front matter 仍由 `new-content.sh` 生成，脚本只替换正文；正文里**写结论的名字**（「由全方差律」），脚本按名字表换成 `{{< tool "1.2" "全方差律" >}}`；残留的旧写法 `【工具 k.m】` 会让导入报错退出 |
| `data/math-toolbox.json` | `工具/00_数学工具.md`（按 `## k 名称` 分 6 组，条目形如 `### 名字 {#tool-1-2}` + 可选 `<!-- 别名: … -->`）+ 各模块笔记里的定理/定义/命题块。**每块都必须写名字**（`**引理 4.1（系数表示与正交性）**`）：没写名字导入器直接报错退出（`require_name`），因为无名卡在卡片墙上只是一个裸类别词。每张卡另加 `kind`（类别：定义/定理/命题…）、`num`（课程侧的编号：只进锚点 id、`{{< tool >}}` 参数与搜索关键词，**不再显示**）、`course`（属于哪门课）、`branch`（大类）与 `section`（细分）|
| `data/math-branches.yaml` | **不是产物**：数学库（`/library/`）的**两级**分支清单（大类 → 细分）+ 卡片归属规则，手写维护，见 docs/features.md ㉒ |
| `content/library/<大类>/`、`content/library/<大类>/<细分>/` 的页面 | **不是文件**：由 `content/library/_content.gotmpl`（Hugo content adapter）按 `data/math-branches.yaml` 现算生成——分支表加一项就自动多一页。所以这几个 URL 不在 `hugo list all` 的输出里，`check-sections.sh` 也看不见它们 |
| `content/courses/<课程>/toolbox/<id>/index.md` | 与上同一批卡片：一张卡一个页面，front matter 由脚本生成、正文为空，模板按目录名从 data 取内容。它的 `title` 是**「名字（类别）」**（如 `Gauss–Markov（定理）`，2026-09-19 起不带编号）：JSON 里可能带公式，模板用 `RenderString` 渲染成真公式；而写进 front matter 的 title 要进 `<title>`、列表卡片与「相关内容」，不经过 Markdown/KaTeX，所以脚本会先降级成纯文本（`$F$ 检验` → `F 检验`；span 里是 `\hat\sigma^2` 这类命令时整段丢掉，`$\hat\sigma^2$ 无偏` → `无偏`）。**名字整段是公式的名字会被导入器拒收**（那样 h1 会变成空标题），所以名字里要留可读的纯文本部分 |
| `实验/<lab>/figs/*.png` | 直接复制进对应材料页的 bundle |

**改内容一律改课程项目里的 md，再重跑导入**——博客侧这几类文件是生成产物，手改会在下次导入时被覆盖。

**脚本里的 `DEFAULT_PROJECT` 可能不是本机的路径**（默认 `D:\1.Study\course\回归分析`，2026-09-18 实测本机在 `D:\Study\courses\回归分析`）：先 `--dry-run` 看清要改哪些文件，再决定要不要 `--project <目录>`。

一条笔记太长时按 § 拆成多页（`MODULES["notes"]` 里的 `first`/`last` 指定保留哪几节）：1575 行、2500 多个数学区渲染出来约 2.5 MB，会撞 `report-size.sh` 的单页预算。

项目文档页（`content/projects/<项目>/<子项目>/*.md`）同样受单页预算约束，但没有导入管线可用，得手工拆：把附录这类**不参与正文推导**的整块（伪代码、代码清单）搬成同目录下的一页（先例：问题三的附录 A/B → 《问题三_参考实现》，`math: false` 关掉 KaTeX，主页附录处留一行指向新页）。手工拆的**唯一代价是锚点**——外部书签指向 `问题三/#附录-b…` 会失效，站内引用则要跟着改（grep `问题三.md》` 之类）。

## 8. URL 与内容的关系

- 课程各页 URL 由目录名决定（`/courses/<课程>/<chapter-0N>/notes/`），改名即改 URL；课程主页 URL（`/courses/<课程>/`）保持不变
- 项目页同样由目录名决定（`/projects/<项目>/`），分层项目再多一层（`/projects/cmc2026/problem-01/solution/`）
- 文章 URL 由 `[permalinks]` + `:slug`（取自标题）决定
- **改 URL 需谨慎**：giscus 用 `mapping='pathname'`（2026-09-18 从 `'title'` 改来，因为站上有多对同名标题会串页），**评论跟着 URL 走**。于是：文章的 URL 由 `:slug`（取自标题）决定，**改标题既换 URL、也丢评论关联**；课程页与项目页的 URL 由目录名决定，改标题不影响评论、**改目录名**才影响。改 URL 后外部链接会一起失效，管理页因此提供了 `slug` 字段用于把文章 URL 固定下来
- 项目页与课程页都**不在**首页列表中（`mainSections=['posts']` 只放行文章；曾经也影响归档页，但归档页已于 2026-09-15 删除，见 architecture.md 第 3 节），但**都会**进搜索引擎索引（`site.RegularPages`）、`sitemap.xml` 与 `/categories/`。词条页只列 regular page：平铺项目页正常出现；`CMC2026` 是 section 形式的项目，**它自己**不在词条页里，但它下面的文档页（靠 cascade 拿到标签）会正常出现

## 10. 卡片库（数学库 / CS 库）与正文引用

两套卡片库结构完全一样（**大类 → 细分 → 卡片**，一张卡一个页面，正文里点名字就地弹窗），差别只在卡片内容从哪来：

| | 数学库 `/library/` | CS 库 `/cs/` |
|---|---|---|
| 卡片数据 | `data/math-toolbox.json`（**生成产物**） | `data/cs-toolbox.json`（**手写**） |
| 分支表 | `data/math-branches.yaml` | `data/cs-branches.yaml` |
| 卡片页 | `/courses/<课程>/toolbox/<id>/` | `/cs/<id>/` |
| 谁生成页面 | `import_course.py` | `node scripts/gen-cards.mjs cs` |
| 要不要 KaTeX | 要（卡片标题里有公式） | 不要（`libraries.yaml` 里 `math: false`） |

**给 CS 库加一张卡**（数学库走课程导入，见上一节）：

1. 往 `data/cs-toolbox.json` 的 `cards` 里加一条：`id`（同时是 URL 段与引用键，**不能与分支/细分 key 撞名**）、`num`、`kind`（沿用 定义/定理/命题/引理/推论/性质 —— 卡片的类别徽标按这几个值配色，新类别要同步改 `11-toolbox.css`）、`title`、`aliases`（正文按名字引用时能命中的别名）、`branch` / `section`（必须是 `data/cs-branches.yaml` 里真实存在的 key）、`body` / `usage` / `note` / `proof`（markdown，正文里**不要写裸 `$`** —— 那是数学定界符，构建会失败）。
2. 跑 `node scripts/gen-cards.mjs cs` 生成卡片页（`--check` 只比对，CI 会跑它防止忘记重生成）。
3. 分支表里没有的方向先在 `data/cs-branches.yaml` 加细分；**空分支不出页面**（加了大类但没卡片时页面不会出现）。

**正文里引用卡片**（三种写法都行，推荐第一种）：

| 写法 | 说明 |
|---|---|
| `{{< card "全方差律" >}}` | **推荐**：按名字或别名在所有库里找，不必记编号、也不必知道它属于哪个库。第二参数可覆盖显示文字 |
| `{{< tool "1.4" >}}` / `{{< thm "4.4" >}}` | 按编号引用；`import_course.py` 自动接线生成的就是这种（80 处），保留兼容 |
| 直链 | 卡片页地址稳定（`/cs/<id>/`、`/courses/<课程>/toolbox/<id>/`），可以直接分享 |

显示文字的顺序：显式第二参数 → 卡片名字 → 卡片自己的 `label`（「定理 10.2」）→ id。点开由 `assets/js/toolbox.js` 拦成弹窗，**没有 JS 时就是普通链接**，跳到完整可读的卡片页。
