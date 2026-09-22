# assets/fonts/ —— 艺术字体（目前只有时钟数字那一款）

## rose-clock.woff2

首页时间卡里「几点几分」用的数字字体。**只有 12 个字形**（`0-9` 与 `:`），子集后 1.5 KB。

- **字体**：Playfair Display（SIL Open Font License 1.1，见同目录 `rose-clock.LICENSE.txt`）
- **来源**：Google Fonts，`https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600`，
  取 latin 子集的 woff2（约 23 KB）再子集化
- **为什么选它**：didone 高对比衬线 —— 笔画粗细对比大、有「墨」的味道，与站上标题那套
  衬线栈同族；而「墨与蔷薇」的蔷薇感来自这种古典时装感的对比，不是来自花体手写
  （手写体做过对比图，`../lab/结果/revamp2/cmp-fonts.png` 里那版 `Italianno` 更花，
  但两位数读起来吃力，做时钟不合适）
- **重新生成**（换字体或换字形集都走这条）：

  ```bash
  curl -s -A "Mozilla/5.0 … Chrome/120" \
    "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600&display=swap" -o f.css
  # 从 f.css 里取最后一条 woff2 URL（latin 子集）
  curl -s -A "Mozilla/5.0 …" "<那个 URL>" -o full.woff2
  pyftsubset full.woff2 --text=0123456789: --flavor=woff2 --output-file=rose-clock.woff2 \
      --layout-features= --no-hinting --desubroutinize
  ```

  需要 `fonttools` 与 **`brotli`**（woff2 编解码靠它，缺了会报
  "The WOFF2 decoder requires the Brotli Python extension"）。

**这个文件不经过 Hugo 资源管线**：`@font-face` 里写 `url()` 只是文本，Hugo 不会因此把字体
发布到 `public/`。所以字体由 `layouts/_partials/extend_head.html` 用
`resources.Get | fingerprint` 发布（带内容指纹），`@font-face` 也由那段模板生成成
`css/clock-font.css`、**只在首页输出**，并附带一条 `preload`。改字体只改这里 + 重跑子集命令。

**不要把它扩成中文字体**：站上「零 webfont」那条规矩针对的是中文（5 MB 起），
整个设计是围着系统字体栈搭的。这里破例是因为 12 个字形只有 1.5 KB。
