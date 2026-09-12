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

**唯一要小心的例外是 `\*`**：LaTeX 里没有这个命令（KaTeX 会报 `Undefined control sequence: \*` 并因 `throwOnError` 让整站构建失败），而它在 markdown 散文里却是合法的转义（想让星号原样显示时写 `\*`）。所以**数学里一律写裸 `*`**，`\*` 只允许出现在非公式位置。

这件事有三道防线，都不需要你手改：

| 场合 | 行为 |
|---|---|
| 管理页保存 / 新建 | 自动把数学区内的 `\*` 改成 `*`，并在提示里说明修了几处 |
| `bash scripts/push-blog.sh` | 发布前先自动修好（写操作），修出来的改动进入同一次 commit |
| CI | `node scripts/fix-math-escapes.mjs` **只检查不修改**，阻断并给出 `文件:行:列` |

修法只有 `scripts/fix-math-escapes.mjs` 一份实现：它会剔除围栏代码块与行内代码，只对 `$$…$$` / `$…$` / `\(…\)` / `\[…\]` 内部动手，所以散文里的 `\*强调\*`、代码块里的 `\*` 都不会被碰。手动跑：`node scripts/fix-math-escapes.mjs`（查）/ `--fix`（修）。

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

严格模式（Hugo 默认 `strict: 'error'`）只认符号表里的字符，**包在 `\text{}` 里也不例外**：

- **能过**（实测）：中文、全角标点（`，`、`（`、`）`）、`–`、`—`
- **不能过**（实测报错）：`§`、圈号 `①`–`⑳`

`§` 是这一类里最常踩的（写「见 §3.4」时顺手带进了公式）：把它移到公式外，或写成「第 3.4 节」；圈号按第 2 节用 `\textcircled{N}`。其它字符以构建结果为准——预检只覆盖最容易踩的这几类。

### 4.3 两道预检（都是阻断）

| 脚本 | 是什么 | 覆盖 | 位置信息 |
|---|---|---|---|
| `scripts/check-math-syntax.mjs` | **快检**：正则，不依赖 hugo | 已知最容易踩的四类：`{}` 不配对（嵌 `$` 的指纹）、某一行 `$` 的个数为奇数、`§`、圈号 `①②③` | 公式本体的 `文件:行:列`，并给出人话改法 |
| `scripts/check-math-katex.mjs` | **真检**：把每个数学区逐条交给 Hugo 内嵌的 KaTeX 试渲染 | **全部 KaTeX 语法错误**（缺参数、环境没闭合、`\left` 没 `\right`、命令拼错…） | 同样给公式本体的 `文件:行:列` 与公式片段 |

**真检的机制**：Hugo 没有「把字符串交给 KaTeX 试解析」的命令行入口，但模板里的 `try (transform.ToMath …)`（Hugo ≥ 0.141）能捕获错误。于是在系统临时目录搭一个最小站点、用 `--renderToMemory` 逐条渲染，失败的打成 `MATHFAIL|下标|消息` 再映射回行列号——用的是与线上**完全同一套** KaTeX，不装任何依赖（实测 41 个文件、8229 个数学区约 5 秒）。

两道都由 `bash scripts/push-blog.sh` 与 CI（`.github/actions/validate/action.yml`）自动跑，正常入口下不需要手动调用。两点要知道：

- **真检是「失败开放」的**：它跑不起来时（缺 hugo、Hugo 太老没有 `try`…）只警告不阻断——诊断工具坏了不该拦住发布。代价是「机制静默失效」也会退 0，所以 CI 里额外跑 `--selftest`（内置好/坏片段自测），把机制本身盯住。
- **它们补了 `hugo` 的两个盲点**：① 报的行列号是**模板渲染位置、不是公式位置**（实测三个坏页都报 `19:13`，真缺陷在 107/109/160 行）；② **Hugo 一旦报渲染错误就会取消剩下的页面，列出的坏页可能不全**（实测 3 个坏页只报出 2 个）。所以「修完报出来的错误」不等于构建就能过——修完仍要构建到绿。

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
