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
