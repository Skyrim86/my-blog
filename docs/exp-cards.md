# 实验 3：卡片墙 412 档 + 扩张推演 —— 结论（部分）

> 2026-09-22 由主会话补完实测部分；同日改动落地 main（`699796b`，另含预算抬到 gzip 11264 KB）。
> 实验工作树与分支：`wt/cards` / `exp/cards`（`f1cb4cc`）—— 工作树 2026-09-22 已删，分支留档。
> 仪器与全部量测数据在 `../lab/shots/cards-412/`（原在临时区，2026-09-22 迁入；临时区 72 小时自清）。

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

`lab/shots/cards-412-vs-544/sheet-412-vs-544.jpg`：四张卡（ayaka-kimono / ayaka-desk /
emilia-01 / kafka-03）在 **411 物理像素**（= 205.7 CSS px × DPR2，与真实显示一致）下
左 412 档、右 544 档，右侧再各带一张 3× 放大的局部。

像素差（两档都归到 411 宽后逐像素比）：均差 3.4~5.7 / 255，>2 的像素占 43%~68%。
注意这个差**全部来自重采样**（544 档被下采样到 411），不是「412 档更糊」——
在 DPR2 屏上 412 档是 1:1 映射，理论上最锐。

单张省的比例（同一批卡）：ayaka-desk 31.6%、ayaka-kimono 30.8%、emilia-01 28.4%、kafka-03 23.9%。

## 复跑

```bash
R=D:/Study/projects/blog/my-blog
L=D:/Study/projects/blog/lab
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
