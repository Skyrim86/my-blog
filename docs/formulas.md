# 数学公式：构建期 KaTeX 渲染

改公式管线、升级 Hugo、或页面上的公式显示不对时读这篇。

## 1. 机制

公式在**构建期**渲染：`layouts/_markup/render-passthrough.html` 调用 Hugo 内置的 `transform.ToMath`（KaTeX 以 WASM 内嵌在 Hugo 二进制里），把 `$...$` / `$$...$$` / `\(...\)` / `\[...\]` 渲染成 KaTeX 的 HTML 标记直接写进页面。

**浏览器端不加载任何 KaTeX JS**：原来的 `katex.min.js`（272KB）、`auto-render.min.js`、`katex-render.js` 已全部删除，只剩自托管的 `static/katex/katex.min.css` + `fonts/*.woff2`。

**收益与代价**（在公式最密的「问题一」页实测）：改前要下载 HTML 44KB + KaTeX JS 78KB(gzip) + CSS 3.5KB ≈ **123KB**，且浏览器要渲染 511 个公式；改后只需 HTML 75KB + CSS 3.5KB ≈ **77KB**，运行时渲染开销归零。**HTML 会明显变大**，因为标记从「浏览器运行时生成」变成了「写进文档」（gzip 后仍更小，因为标记高度重复）。

## 2. `math` 字段的含义

它现在**只决定「这一页要不要加载 `katex.min.css`」**，与是否渲染无关（渲染是无条件的）。

加载条件三项取或：`site.Params.math` / `.Params.math` / **页面里确实出现了公式**（兜底检测，匹配 `class="katex"`）。所以忘写 `math: true` 也不会再出现无样式公式。

换句话说：**「公式能不能显示」不再取决于 `math`**。要省体积就在没有公式的页面写 `math: false`（约 23KB）——课程主页与无公式的章节入口页就是这么做的，见 [`content.md` 第 4 节](content.md#4-cascade-的三条硬规矩)。

渲染钩子里 `throwOnError = true`（Hugo 默认）：公式有语法错误会**让构建失败并报出位置**，比静默渲染成一团红字更好。想让个别错误不阻断构建，把它改成 `false` 并配 `errorColor`。

`output` 必须是 `htmlAndMathml`（HTML 排版 + 隐藏的 MathML 供无障碍，与改造前的浏览器端 KaTeX 一致）。改成纯 `mathml` 会变成浏览器原生渲染，外观不同，同时也就不再需要 `katex.min.css`。

## 3. 公式源文必须先被 markdown「放过」

`hugo.toml` 已开启 `[markup.goldmark.extensions.passthrough]`（`block` = `$$`/`\[ \]`，`inline` = `$`/`\( \)`，**单 `$` 必须显式写，passthrough 默认不含它**），goldmark 在解析阶段整体跳过公式，源文原样交给渲染钩子。

**这是必需的**，否则：

- `R^*` 的 `*` 会被当作强调符与同行的 `**` 配对、注入 `<em>` 把文本节点切开
- `\{`、`\}`、`\%`、`\!`、`\,` 这类由标点构成的 LaTeX 命令会被 CommonMark 的转义规则吃掉反斜杠

所以：正文里正常写 `R^*`、`\Big\{`、`\%` 即可，**不要**改成 markdown 转义写法。反过来说，**一旦有人关掉 passthrough，`R^*` 会立刻退化成原样输出的 `$R^*$` 并可能把相邻文字斜体化。**

**数学区里有三类写法会被 KaTeX 判错，且正确写法都是机械可推的**，所以都能自动修：

| 坏 | 好 | 为什么 |
|---|---|---|
| `\*` | `*` | LaTeX 里没有 `\*` 这个命令（散文里它却是合法转义：想让星号原样显示时写 `\*`），KaTeX 报 `Undefined control sequence: \*` |
| `§` | `\S` | KaTeX 的 `\S` 定义就是 §（math/text 两种模式都有）。裸 `§` 在**纯**数学模式里其实能过，但包进 `\text{}` 就报 `Unrecognized Unicode character`——而「见 §3.4」几乎总写在 `\text{}` 里，所以一律换成 `\S` 最稳；紧跟字母时补成 `\S{}` |
| 圈号 `①`–`⑳` | `\text{\textcircled{N}}` | 圈号不在符号表内；`\textcircled` 是**文本模式**的 accent，直接写在数学区会报 `LaTeX's accent \textcircled works only in text mode`，必须包一层 `\text{}` |

**自动修复有两层，按「改动需不需要验证」划分：**

| 层 | 管什么 | 实现 | 什么时候跑 |
|---|---|---|---|
| 机械层 | 上表三类 | `scripts/fix-math-escapes.mjs` | 管理页保存/新建自动修、`push-blog.sh` 发布前自动修、CI 只检查 |
| 验证层 | **双反斜杠**（`\\theta` 这类 JSON 双重转义） | `scripts/check-math-katex.mjs --fix` | 只在 `push-blog.sh`：候选修法**改完试渲染通过才写盘** |

为什么双反斜杠进不了机械层：`\\` 在 LaTeX 里是**合法的换行符**（多行公式、矩阵分行都用它），盲替换会改坏——所以它只能"改了确实能渲染"才落盘。详见第 4.4 节。

机械层的实现只有 `scripts/fix-math-escapes.mjs` 一份：它剔除围栏代码块与行内代码，只对 `$$…$$` / `$…$` / `\(…\)` / `\[…\]` 内部动手，所以散文里的 `\*强调\*`、`§3.4`、代码块里的 `\*` 都不会被碰。手动跑：`node scripts/fix-math-escapes.mjs`（查）/ `--fix`（修）/ `--selftest`（自测规则本身）。

改定界符时 `hugo.toml` 与 `render-passthrough.html` 要一起看。

## 4. 裸 `$` 会让构建失败

passthrough 会把两个 `$` 之间的内容当公式交给 KaTeX。正文里裸写的 `$`（比如想写金额或变量名）会让构建失败，报错形如：

```
KaTeX parse error: ... Unicode text character "到" used in math mode
```

并准确指出 `文件:行:列`。**改法就是把 `$` 写成 `\$`**。已验证：`\$` 能正常输出成 `$`，且**行内代码 `` `$HOME` `` 与代码块里的 `$` 都安全**（code span / fence 不会被 passthrough 处理），shell 片段照常写。

若更希望这类问题只警告不阻断，把 `render-passthrough.html` 的 `throwOnError` 改成 `false`（按 `errorColor` 渲染成红字），或加上 `strict: "warn"`。

### 4.1 数学区里也不要再写 `$`

`$…$` 的配对规则是「遇到下一个 `$` 就收」。数学区里再写一个 `$`（或行里掉下一个孤立的 `$`），会把区域**提前截断**，KaTeX 收到的是半截公式，报 `Unexpected end of input in a macro argument, expected '}'`：

| 坏 | 好 | 说明 |
|---|---|---|
| `$=(\text{$r$ 步 $5$ m})\times(…)$` | `$=(r\text{ 步 }5\text{ m})\times(…)$` | 已经在数学模式里，`r` 本来就是斜体，不必再套 `$` |
| `环内移到 \rho=1028$ 后，位于 $r>1000$ m` | `环内移到 $\rho=1028$ 后，位于 $r>1000$ m` | 少了一个开定界符，本行后面的配对全部错位 |

**这类错误别靠 `hugo` 报的行号定位**：它经 `.Content`（JSON-LD 等）报出来时给的是**模板渲染位置、不是公式位置**——实测三个坏页都报 `19:13`，真缺陷在 107/109/160 行。公式本体的位置看第 4.3 节的预检。

### 4.2 数学区里的字符必须在 KaTeX 符号表内

严格模式（Hugo 默认 `strict: 'error'`）只认符号表里的字符（下面都是实测结论）：

- **能过**：中文、全角标点里的 `，`、`（`、`）`、`–`、`—`、以及**纯数学模式下的裸 `§`**
- **不能过**：**全角冒号 `：`**（`Unicode text character "：" used in math mode`，`，` 能过它不能——写 `\text{…：}` 或半角 `:`）、`\text{}` 里的裸 `§`（`Unrecognized Unicode character "§"`）、圈号 `①`–`⑳`（不在符号表内）、**单独用的** `\textcircled{N}`（`LaTeX's accent \textcircled works only in text mode`）

`§` 是最常踩的（写「见 §3.4」时顺手带进了公式）：**一律写成 `\S`**——KaTeX 的 `\S` 就是 §，math 与 text 两种模式都认，所以 `\S3.4` 与散文里的 `§3.4` 视觉一致。圈号写成 `\text{\textcircled{N}}`。这两类都已进机械层自动修复（见第 3 节），不用手改。

其它字符以构建结果为准——预检只覆盖最容易踩的这几类。

### 4.3 两道预检（都是阻断）

| 脚本 | 是什么 | 覆盖 | 位置信息 |
|---|---|---|---|
| `scripts/check-math-syntax.mjs` | **快检**：正则，不依赖 hugo | `{}` 不配对（嵌 `$` 的指纹）、某一行 `$` 的个数为奇数、**连续反斜杠 + 字母**（JSON 双重转义的指纹） | 公式本体的 `文件:行:列`，并给出人话改法 |
| `scripts/check-math-katex.mjs` | **真检**：把每个数学区逐条交给 Hugo 内嵌的 KaTeX 试渲染 | **全部 KaTeX 语法错误**（缺参数、环境没闭合、`\left` 没 `\right`、命令拼错…） | 同样给公式本体的 `文件:行:列` 与公式片段 |

`§` 与圈号**不在**这两道预检里：它们已进机械层（第 3 节），由 `scripts/fix-math-escapes.mjs` 独占报告，免得同一处被两个脚本各报一遍、口径还不一致。

**真检的机制**：Hugo 没有「把字符串交给 KaTeX 试解析」的命令行入口，但模板里的 `try (transform.ToMath …)`（Hugo ≥ 0.141）能捕获错误。于是在系统临时目录搭一个最小站点、用 `--renderToMemory` 逐条渲染，失败的打成 `MATHFAIL|下标|消息` 再映射回行列号——用的是与线上**完全同一套** KaTeX，不装任何依赖（实测 41 个文件、8229 个数学区约 5 秒）。

两道都由 `bash scripts/push-blog.sh` 与 CI（`.github/actions/validate/action.yml`）自动跑，正常入口下不需要手动调用。**`push-blog.sh` 的顺序是：机械层 `--fix` → 真检 `--fix`（验证后写盘）→ 快检 → 真检 → 构建**——能自动修的都在前面修完了，走到预检的还是错的，才是真需要人看的。两点要知道：

- **真检是「失败开放」的**：它跑不起来时（缺 hugo、Hugo 太老没有 `try`…）只警告不阻断——诊断工具坏了不该拦住发布。代价是「机制静默失效」也会退 0，所以 CI 里额外跑 `--selftest`（内置好/坏片段自测），把机制本身盯住。
- **它们补了 `hugo` 的两个盲点**：① 报的行列号是**模板渲染位置、不是公式位置**（实测三个坏页都报 `19:13`，真缺陷在 107/109/160 行）；② **Hugo 一旦报渲染错误就会取消剩下的页面，列出的坏页可能不全**（实测 3 个坏页只报出 2 个）。所以「修完报出来的错误」不等于构建就能过——修完仍要构建到绿。

### 4.4 JSON 双重转义（`\\theta`）

外部工具（编辑器、LLM 批量改稿）有时会把**已经 JSON 转义过**的字符串再写进正文，于是数学区里出现成对的反斜杠：

| | |
|---|---|
| 坏 | `$\\theta_{\\rm gap}\\le120^\\circ$`（每个命令都多转义了一层） |
| 好 | `$\theta_{\rm gap}\le120^\circ$` |

**它不能靠"看到双反斜杠就改"来修**：`\\` 在 LaTeX 里本身是合法的换行符（多行公式、`\begin{aligned}` 与矩阵分行都用它），盲替换会改坏。所以分两处处理：

- **快检**只报「连续反斜杠后面紧跟字母」这一种指纹——合法的换行 `\\` 后面跟的是空白、`&` 或 `[`，不会是字母。这条是快检独有的价值：`\\` 被当成换行符、后面的命令降级成普通文本时，**公式能解析**，真检抓不到，只有这里能拦。
- **真检 `--fix`** 才是修它的地方：候选 = 去掉一层转义（必要时再套一遍机械层规则），**只有候选能渲染才写盘**。本来就能解析的公式根本不进这个流程，所以修复器不会碰好公式。
- 管理页保存**不做**这一层（保存路径不跑 hugo，要保持秒级），发布时由 `push-blog.sh` 统一处理。

实测（2026-09-13）：`问题四.md` 里一处 `\\theta_{\\rm gap}\\le120^\\circ` 被真检报 `Got function '\' with no arguments as superscript` 并阻断发布；`--fix` 去掉一层转义、重新试渲染通过后才落盘，复检转绿。

## 5. KaTeX 样式版本必须与 Hugo 内嵌版本配对 ⚠️

**最容易踩的坑**（Hugo 官方 issue #15254 记录的就是它）：

| Hugo 版本 | 内嵌 KaTeX | 内部 class | 需要的 CSS |
|---|---|---|---|
| **≤ 0.165** | 0.16.22 | 无前缀（`base`、`strut`、`sizing`） | **katex@0.16.x** |
| **≥ 0.166** | 0.18.4+ | 带前缀（`katex-base`、`katex-strut`、`katex-sizing`） | **katex@0.18.4+** |

配错的表现是**公式排版错乱**（上下标错位、分数塌陷）。站内当前是 `katex@0.16.x` 的 `katex.min.css` + `fonts/*.woff2`（20 个），与 Hugo 0.165 精确配对。

**判据只认类名是否带前缀，`katex-base` 是唯一可靠的判别符**（`katex-display`/`katex-html` 两套都有）：

```bash
grep -c 'katex-base' static/katex/katex.min.css
# 0    = 0.16.x（无前缀）
# 非 0 = 0.18.4+（带前缀）
```

这条判据用 npm 上的包实测过：`katex@0.16.47` 是 `.base{}`/`.strut{}`、无 `katex-base`；`katex@0.18.7` 反之；两者都带 20 个 woff2 字体。

**升级不要手动换文件**：跑 `bash scripts/upgrade-hugo.sh <版本>`，它按上面的配对表选 KaTeX 版本、改版本钉、换 CSS/fonts，并在写坏时自动回滚。

**每次构建都有 CI 兜底**：`scripts/check-katex-pairing.sh` 拿真实 Hugo 构建产物比对类名方案（取样「公式最多」的那一页），配错直接判失败——因为只有拿真 Hugo 构建完才知道它内嵌的是哪一套。

历史教训：`extend_head.html` 里原本的注释写着「当前版本：0.18.7」，而实际是 **0.16.x（无前缀）**。照那行注释去换 0.18.x 的 CSS 会让全站公式错版。现已改成实测口径。

## 6. 其它两条约束

- **`katex.min.css` 与 `fonts/` 必须同级**：CSS 用**相对路径** `fonts/...` 引用字体，分到不同目录会让公式变成方框。只装了 `woff2`（现代浏览器均支持，CSS 中排第一位，`woff`/`ttf` 回退不会被请求）
- 这些静态文件**没有内容指纹**，访客可能需要强刷才能看到更新。字体已在 `.gitattributes` 里标为 binary，避免换行符转换损坏
