# 实验 3：卡片墙 412 档 + 扩张推演 —— 结论（部分）

> 2026-09-22 由主会话补完实测部分；同日改动落地 main（`699796b`，另含预算抬到 gzip 11264 KB）。
> 实验工作树与分支：`wt/cards` / `exp/cards`（`f1cb4cc`）—— 工作树 2026-09-22 已删，分支留档。
> 仪器与全部量测数据在 `../lab/结果/cards-412/`（原在临时区，2026-09-22 迁入；临时区 72 小时自清）。

## 改动

`layouts/_partials/deck-manifest.html` 新增一档 `412x webp q72`（卡片墙专用），
`deck-wall.html` 的 `<img>` 改用 `w` 描述符 srcset：
`272w / 412w / 544w`，`sizes="(max-width: 767px) 44vw, 206px"`。
**必须是 412 而不是 410**：srcset 按「候选密度 = 宽 / 槽宽」选图，槽宽 205.73 CSS px，DPR2 需要 411.5 px。

## 实测（`wallmeasure.py`，1440×1000，滚完整页，冷缓存）

| 口径 | base（改前） | 412 档（改后） | 差 |
|---|---|---|---|
| DPR2 卡片下载（63 张） | 1710.4 KB | 1322.1 KB（首次请求口径） | **−388.2 KB（−22.7%）** |
| DPR2 整页卡片请求合计（含重复） | 1728.8 KB | 1455.9 / 1436.0 KB（两次） | **−272.9 KB（−15.8%）** |
| DPR1 卡片下载 | 860.2 KB | 860.2 KB | **0（0/63 换档，符合预期）** |

- DPR1 下仍选 272 档（`ayaka-sword_hu_d46ec594b410bd5`），确认没有把小屏拖下水。
- DPR2 下 58/63 张干净换档到 412；**5 张（ayaka-sword / ayaka-16 / ayaka-21 / emilia-07 / emilia-27）
  出现「544 + 412 双下载」**，两次独立测量**稳定复现**。这 5 张多下的 544 档约 160 KB，
  把净收益从 −24.8% 压到 −15.8%。原因**未查明**（不是产物缺失：这 5 张的 412 档都在，
  且页面里 63 张卡全部带 412w 候选）。
- 新增产物体积：412 档 63 张 = 1286.1 KB（磁盘）。

## 观感对照

`lab/结果/cards-412-vs-544/sheet-412-vs-544.jpg`：四张卡（ayaka-kimono / ayaka-desk /
emilia-01 / kafka-03）在 **411 物理像素**（= 205.7 CSS px × DPR2，与真实显示一致）下
左 412 档、右 544 档，右侧再各带一张 3× 放大的局部。

像素差（两档都归到 411 宽后逐像素比）：均差 3.4~5.7 / 255，>2 的像素占 43%~68%。
注意这个差**全部来自重采样**（544 档被下采样到 411），不是「412 档更糊」——
在 DPR2 屏上 412 档是 1:1 映射，理论上最锐。

单张省的比例（同一批卡）：ayaka-desk 31.6%、ayaka-kimono 30.8%、emilia-01 28.4%、kafka-03 23.9%。

## 复跑

```bash
R=D:/projects/blog/my-blog
L=D:/projects/blog/lab
# 站点副本必须带前缀剥离：产物里的资源路径是 /my-blog/...，普通 http.server 会 404
python $L/shots/serve_public.py 8793 $R/public &
cd $L/shots/cards-412
python wallmeasure.py --url http://127.0.0.1:8793/collection/ --dpr 2 --out new-coll-dpr2.json
python wallmeasure.py --url http://127.0.0.1:8793/collection/ --dpr 1 --out new-coll-dpr1.json
```

## 未完成

1. 那 5 张双下载的成因未查明 —— 这是拿到 −24.8% 的唯一障碍。
2. 189 格扩张推演（`content/exp-tiles/` + `layouts/_default/exptiles.html` 是为此建的临时页）没做完。
   两个临时物**只在 `exp/cards` 分支上**，没进 main；要么补完、要么从分支里删掉。
3. `report-size.sh --fresh` 的预算影响：2026-09-22 随改动复跑过，整站 gzip 预算抬到 `11264 KB`
   （提交 `699796b`，当前实测 10546 KB，通过）。

---

# 实验 4：换卡的加载等待（2026-09-22 晚）

问的是「卡片切换、以及弹层里切卡片，能不能更流畅」。这个坑本身不新鲜：**「按下去了」与「画面换人」
之间隔着一次下载** —— 三处改动各拆掉一段。

## 改动

1. **页内那一档按 DPR 挑**（`home-deck.js` 的 `pageTier()`）：`srcset` 是 `s 272w … l 544w`，2x 屏
   才走 `l`。旧代码无脑预取 `l`，**1x 屏上那次预取等于白下**。预取完再 `decode()`。
2. **弹层要用的那两张单独预取**（`prefetch(n, withXL)`）：页内那一档与弹层里那张 760（`xl`）+
   深度图不是一回事（每张约 64 KB）。打开弹层时按「这一张先、后两张随后」排队 —— 四张一起排会把
   打开弹层从 2.2 s 拖到 3.2 s（本地 HTTP/1.1 单连接，`fetchPriority: low` 不改变排队顺序）。
3. **意图预取**（`prefetchAt()` + `onIntent()` / `deck-wall.js` 的 `pointerover`·`focusin`）：
   指针停 200 ms 才取。悬停即取会让匆匆划过的指针白下 60 KB；一进页面为 63 张各下 64 KB 更不行。
4. **低清先上**（`card-3d.js` 的 `setItem`，这条才是主因）：原来只有「xl 到了才换画面」，
   于是等多久取决于 760 那一档下多久。现在先上传**页内那张真正下过的档**
   （`home-deck.js` 的 `lowTierOf()` 从 `currentSrc` 读，不猜档：首页 `l`/`s`、收藏库格子 **412**），
   它必然在缓存里 → 画面立刻换人；xl 到了再换一次，观感「先变过来、再变锐」。
   `faceSeq` 防晚到的图盖住后来居上的那一张；没 WebGL 时走平面大图那条路，同样先低清再升级
   （`check-fallback.py` 用 `--disable-webgl` 单独验：低清 6 ms 落地、xl 1933 ms 升级）。

## 实测

工具：`../lab/结果/deck-perf/check-cardflow.py`。本地站点 + **512 kbit/s 节流**（80 ms 延迟）、
冷缓存、DPR2（DPR1 的那一档单独跑）；判据是 `card3d.stats().faceSwaps` **自增** = 卡面贴图真的换人了，
不是「某张图下完」。改前那一列取的是「xl 那张下完」—— 旧代码里这两件事本来就是同一时刻。

| 档位 | 改前 | 改后 |
|---|---|---|
| ③ 弹层里按 › 翻卡 | 1453～2935 ms | **18～89 ms** |
| ② 首页 ⤢ 开弹层 | 2594～3545 ms | **223～429 ms** |
| ④ 收藏库点开一格 | 3065～9238 ms | **45～233 ms** |
| ① 页内换下一张（**DPR1**） | 437～1040 ms | **1～20 ms** |

同一轮还做了两件与读数有关的事，都是被读数骗过之后才发现的：

- **`--only <档位>` 必须每个档位单起一个浏览器进程**：同一进程里连着跑几档，Blink 的**内存图片缓存
  跨导航存活**，上一档下过的图下一档直接命中 —— 读出来是个位数毫秒，量的是缓存不是预取。
- **收藏库那一档要先等网络安静**：那一页自己要下 63 张卡面（512 kbit/s 下约 20 s），不等它下完就点，
  量到的是「这条管子被卡片墙占着」。脚本里的 `quiet()` 就是等这一段（资源条目数连续 1.2 s 不变）。

## 复跑

```bash
R=D:/projects/blog/my-blog
L=D:/projects/blog/lab
python $L/工具/serve_public.py 8793 $R/public &
cd $L/结果/deck-perf
for sc in home-next-dwell home-next-now home-open ov-next wall-open; do
  python check-cardflow.py --kbps 512 --only $sc      # 每个档位单起一次
done
python check-cardflow.py --kbps 512 --dpr 1 --only home-next-now   # DPR1 那一档
python check-cardflow.py --kbps 512 --only wall-open --hover       # 意图预取生效的样子
python check-fallback.py --kbps 512            # 无 WebGL 那条路：低清先落地、xl 再升级
```

## 已知口径

- 本地服务是 `http.server` 那一系：**HTTP/1.0 + `Connection: close` + 没有 `Cache-Control`**，
  每条请求都新建连接，且同一张图在「带 `crossOrigin` 的 GL 请求」与「不带它的 `<img>` 请求」之间
  **不会复用** —— 线上（HTTP/2 + 指纹文件名 + 强缓存）只会更快。
- 读数有两个维度容易混：**「画面换人」（贴图换人）** 与 **「画质到位」（xl 到货）**。低清先上之后
  这两件事相差 1～1.5 s（512 kbit/s），别拿后者当前者报。
