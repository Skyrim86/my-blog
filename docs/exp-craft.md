# 实验 2：卡片工艺参数化 —— 结论（样板 2 种 → 2026-09-22 全量 15 种）

> 2026-09-22 由主会话补完。下面是**已有实测数据的判读**，不是新一轮实验：
> 全部数字来自 `../lab/shots/craft-ab/`（三臂全量）与 `../lab/shots/craft-ctl/`（灵敏度臂）。
> 这两份数据原在临时区 `scratch/shots/`，2026-09-22 迁入 `lab/`（临时区 72 小时自清）。

## 结论

**参数化可行，且像素代价为零。** 两种工艺（silk / nacre）已从手写 CSS 块改成
`data/card-styles.yaml` 里的参数条目 + 生成器（`tools/cards/render-styles.mjs`）输出的
`assets/css/extended/21-card-styles.css`，`card-3d.js` 的 `STYLE_3D` 那一行也由生成器重写。

## 判读用的三件套证据

| 对照 | 可比格 | 像素 | max 差 | >2/255 的像素 |
|---|---|---|---|---|
| **A↔A**（同臂 a-8795 重拍一次） | 63 | 14.88 Mpx | 全部 0 | 0 |
| **A↔B**（原版 vs 参数化） | 126 | 29.76 Mpx | 全部 0 | 0 |
| **A↔ctrl**（故意改一处的产物，灵敏度自证） | — | — | `silk` = 8，`glass` = 2 | `silk` 22310 |

- 三臂的 CSS 文件 sha256 **两两不同**，排除「两臂其实是同一份产物」：
  `base 012ecd1d…` / `var 9fd38b17…` / `ctrl 97807062…`（且与页面内 fetch 到的文本 sha256 一致）。
- A↔A 全 0 ⇒ 这套测量的**重复性本底为零**；A↔B 全 0 ⇒ 参数化产物与原手写块**逐像素等价**。
- A↔ctrl 报出非零 ⇒ 仪器**不是**「永远报 0」，上两行的 0 有判别力。
- 3D 弹层也测了：卡 #5 / #8 各 1.56 Mpx，A↔A = 0、A↔B = 0。
- 5 格出现过「几何漂移」（截图时元素矩形位置与基准不同：暗色主题下标 0/1/10，浅色 0/6），
  但每格的 `misaligned` 都是 false，即对齐后照常比较。

## 现状测绘：「加一种工艺」要动多少（`tools/cards/style-footprint.py`）

一种工艺此前散在**五处**，16 种合计同步面 **271 行**（≈17 行/种）：

| 处 | 位置 | 规模 |
|---|---|---|
| ① | `data/home-cards.yaml` 的 `style:` | 每种 3 张卡，各 1 行 |
| ② | `21-card-deck.css` 的 `.home-card--<名>` 块 | 13 种工艺 220 行 / 12.7 KB |
| ③ | `card-3d.js` 的 `STYLE_3D` | 每种 1 行 |
| ④ | `i18n/zh.toml` 的 `deckStyle<名>` | 16 行 |
| ⑤ | `deck-manifest.html` 的 `styleLabel` + `$styleTier` | 36 行 |

参数化把 ②③ 变成**生成的**（读 yaml → 写 CSS → 重写 `STYLE_3D`），
`node scripts/check-deck.mjs` 核对产物与参数表是否一致（不一致即阻断）。
④⑤ 仍是手写，但 yaml 里已留 `labelKey` / `tier` 两个字段，check-deck 拿它与模板那两张表**对拍**，
所以表还在模板里也不会读岔。

样板规模：`data/card-styles.yaml` 182 行（含大段字段说明）、生成器 `render-styles.mjs` 372 行、
产物 `21-card-styles.css` 53 行。

## 复跑

```bash
R=D:/Study/projects/blog/my-blog
L=D:/Study/projects/blog/lab
# 三份产物：out/base（原版）· out/var（参数化）· out/ctrl（故意改一处，作灵敏度对照）
# 这三份构建是一次性的（原在临时区，2026-09-22 已随 72 小时规则清掉），复跑要自己重建，端口别撞
cd <base 构建目录> && python -m http.server 8795 --bind 127.0.0.1 &
cd <var  构建目录> && python -m http.server 8796 --bind 127.0.0.1 &
cd $R && python tools/cards/ab-card-styles.py \
    --a http://127.0.0.1:8795/ --b http://127.0.0.1:8796/ --control \
    --out $L/shots/craft-ab --dialog 5,8
python tools/cards/style-footprint.py     # 「一种工艺散在哪五处」
```

## 2026-09-22 迁移完成：15 种工艺全部数据驱动

**范围**：13 种主块（aurora / enamel / filigree / frostcrack / glass / gold / holo-prism / ink /
kintsugi / silver / starnight / washi / yukika）搬进 `data/card-styles.yaml`（+ 样板 nacre / silk = 15 种）。
**foil 不在表里** —— 它没有主块，`.home-card` 的基础声明本身就是全息的观感。

**仍然手写的**（有意留在 `21-card-deck.css`）：伪元素（`glass::before/::after`、`kintsugi::after`、
`holo-prism::before` 与 `:hover::before`）、后代（`.home-card-lens`）、深色主题覆写
（`:root[data-theme="dark"] … { --coverlay-op }`）。这些是几何与主题，不是材质参数。
每个工艺的原位只留它原有的设计注释 + 一行指针。

**模型扩了 5 个字段**（否则搬不动）：`mask`（**多层**，与 print 同构 —— yukika 是十二片
`var(--tex-flake*)`）/ `maskSize` / `maskPosition` / `maskRepeat` / `boxShadow`（玻璃那 7 段倒角与体积光）。
另外 `gemColor` 由必填改可选（一半工艺的宝石色本来就取 `--cplate-accent`），
`print` 的 kind 加 `repeating-conic`（holo-prism 的放射虹彩）。

**等价性怎么证的**：不靠眼睛 —— 逐声明比对。把 13 个手写主块反向解析成 `{属性 → 值}`，
与生成块的同一张表比（压掉空白差异）：**13 种全部逐字一致**，含 glass 的 7 段 box-shadow
与 yukika 的十二片 mask。渲染器的 `--check` 与 `node scripts/check-deck.mjs` 同时全绿。

**三个坑**（都只在「含连字符的工艺名」或「数组值」上暴露，样板那两个单词名看不见）：

1. `renderThreeDLine` 用 `/^[a-z][a-z0-9-]*$/` 决定键名要不要加引号 —— `holo-prism` 匹配它，
   于是生成 `holo-prism: {…}`（非法 JS），**只在 hugo 的 minify 阶段炸**。判据改成「合法 JS 标识符」。
2. 反向提取 STYLE_3D 时用 `[^,}]+` 取值，把 `tint: [0.94, 0.98, 1.00]` 截成 `[0.94`。
   要先把方括号整体吞掉（`\[[^\]]*\]`）。
3. `check-deck.mjs` 的「手写块与生成块不许并存」若按「`.home-card--<名>` 出现过」判，
   删掉主块后会有 11 种工艺因伪元素/深色覆写仍在而**误报**。判据改成「行首恰好是主块」。

**规模变化**：`21-card-deck.css` 2277 → 2022 行（−255），生成文件 353 行；
合并后的主样式 174716 → 174225 B（生成器不写行内注释、注释里的设计说明也不重复）。

**迁移怎么做的**：写了一次性反向提取器（`../lab/scripts/extract_style_params.py` + `gen_style_yaml.py`）
把主块解析成 YAML 条目 —— 13 种 × 约 20 行不可能靠手抄保证逐字一致。

**加一种工艺现在的成本**：`data/card-styles.yaml` 一条（11~14 个字段）+（若有伪元素再写结构 CSS）
+ i18n 一行 + 模板两张表一行；后两者仍手写，但与 YAML 的 `labelKey` / `tier` **对拍**。

### filigree：迁移顺手修好的一处手写损坏（24 格像素冒烟里唯一的非零差异）

像素冒烟（24 格 × dark × A/B/对照）里其余工艺 A↔B 全部 = 0，只有 **filigree** 报 `max=57 / 844 像素`，
差在**卡面四角的宝石**：A（手写版）=(127,164,135) 青绿、B（参数化）=(184,157,112) 金褐。

成因在手写源里一眼可见：

```css
.home-card--filigree {
  --fret-line: #e9ca86;   /* 边框装饰线的材质色（结构仍由等级给） */
     「每种进阶工艺都有自己的框」这件事在代码里一眼可见，也让守卫的检查口径统一。 */   ← 孤儿
  --craft-gem-color: #f0b96a;
```

第二行是一段注释的**结束行**，但它的 `/*` 已不在（某次编辑留下的残骸）。CSS 解析器在声明列表里
遇到这段裸文本会**跳到下一个分号**，于是紧跟其后的 `--craft-gem-color: #f0b96a;` **整条被丢弃**
—— 四角宝石退回 `background-color: var(--craft-gem-color, #6fcaa0)` 的兜底青绿，一直如此。

参数化把它恢复了：YAML 里 `gemColor: "#f0b96a"` 生成的是合法声明。**这是修复，不是回归**，
方向也与设计意图一致（`21-card-deck.css` 里那条规则注释写着「颜色由 --craft-gem-color 给」）。
反向提取器逐字读的是那段文本里的值，所以这一处的「等价」是**对损坏文本的等价**，生成后反而变正确。
留意同类残骸：判据是「以 `*/` 收尾但不含 `/*` 且不在注释块里」—— 全文件扫过一遍，除这一处，
其余命中都是正常的多行注释末行。

## 未完成 / 未测

1. ~~其余 14 种工艺没有迁移~~ → **已完成（2026-09-22）**：13 种主块全部搬进 YAML，逐声明逐字一致；
   仍手写的是结构层（伪元素/后代）与主题层（深色覆写）。
2. `style-footprint.py` 在「已参数化：nacre, silk」那段崩（`TypeError: NoneType`），
   因为它仍按手写态去查那两种工艺的 CSS 块 —— 修法是让它在工艺已被参数化时改查产物。
3. 3D 视图的等价只在 2 张卡上验过（#5 / #8）。
4. 一次全量 A/B 的耗时很长（380 张截图量级）；本次重跑因与别的浏览器测量抢端口而在第 40 格崩掉，
   **并发跑浏览器测量会互相打断** —— 要重跑就独占机器。
