---
# 课程主页骨架：hugo new content courses/<课程>/_index.md
# （kind 取路径首段 "courses"，所以无需 --kind；章节入口页请用 --kind chapter）
# 章节目录由 layouts/_partials/course-index.html 按 weight 自动生成，不用在这里维护。
title: "单变量微积分"
# 课程规划：front matter 的 plan 列表 + 正文里一行 {{< course-plan >}} 会渲染成进度对照表。
# 已发布判定按 title 与子章节标题逐字相同，所以 plan 条目的 title 要和 _index.md 的 title 一致。
# 列表卡片封面（可选）：tools/covers/make-covers.py 生成后写 cover.image
layout: "course"
date: 2026-10-03
draft: false
cover:
  image: "images/covers/single-variable-calculus.webp"
  alt: "单变量微积分"
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "单变量微积分课程学习包：以 Stewart《Calculus: Early Transcendentals》（9e）为主线、MIT 18.01SC 定交付边界、同济《高等数学》第八版定中文口径，按 9 章从极限走到级数与 Taylor 展开。"
summary: "极限与连续、导数与中值定理、定积分与积分技巧、反常积分、级数与 Taylor 展开；9 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
plan:
  - weight: 1
    title: "函数、极限与连续"
    summary: "函数与它的表示；初等函数的反函数、指数与对数；极限的直观描述与精确定义（ε-）；极限的运算法则与夹逼定理；无穷远处的极限与无穷极限；连续性与间断点的分类；介值定理与最值定理"
  - weight: 2
    title: "导数与求导法则"
    summary: "导数作为切线的斜率与变化率；可导蕴涵连续（反之不然）；幂、积、商、链式法则；隐函数求导与反函数的导数；高阶导数；相关变化率；线性逼近与微分；指数函数与对数函数的导数"
  - weight: 3
    title: "微分的应用"
    summary: "极值与闭区间最值；Rolle 定理与中值定理；单调性与凹凸性、拐点；图形描绘与渐近线；不定式与洛必达法则；最优化应用；牛顿法；原函数与不定积分的记号"
  - weight: 4
    title: "定积分与基本定理"
    summary: "面积问题与 Riemann 和；定积分的定义与可积性；微积分基本定理的两部分；净变化定理；不定积分与换元法"
  - weight: 5
    title: "积分的应用"
    summary: "曲线之间的面积；体积（圆盘法、垫圈法、柱壳法）；弧长与旋转曲面的面积；功与函数的平均值；概率密度、期望与累积分布函数"
  - weight: 6
    title: "积分技巧"
    summary: "分部积分；三角函数的积分；三角代换；有理函数的部分分式分解；积分技巧的选择策略"
  - weight: 7
    title: "数值积分与反常积分"
    summary: "中点法则、梯形法则与 Simpson 法则及其误差界；反常积分的定义；比较判别法与 p 型积分；被积函数无界与积分区间无穷的收敛性"
  - weight: 8
    title: "序列与级数"
    summary: "序列的极限、单调有界定理；级数与部分和；几何级数与调和级数；积分判别法与比较判别法；交错级数与交错级数估计定理；绝对收敛、比值判别法与根值判别法"
  - weight: 9
    title: "幂级数与 Taylor 展开"
    summary: "幂级数与收敛半径；函数表示为幂级数、逐项求导与逐项积分；Taylor 级数与 Maclaurin 级数；Taylor 多项式的误差估计与它的应用（求极限、近似积分、近似函数值）"
# 分类法只在这里写一次，由 cascade 下发给各章材料页。
# target.kind: page 表示只发给 regular page（笔记 / 作业 / 实验）——课程主页与章节入口页都是
# section，即使带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：材料页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: ["微积分", "数学"]
    categories: ["课程"]
  # 章节下的所有页面：关闭评论；加载 KaTeX 样式
  # （公式本身在构建期已渲染，见 layouts/_markup/render-passthrough.html；math 只控制样式加载）
  - comments: false
    math: true
---

单变量微积分从极限说起，把导数与积分建立成一对互逆运算，最后走到级数与 Taylor 展开——一元部分的全部工具都在这一条线上。
本课程以 Stewart《Calculus: Early Transcendentals》（9e）为主线，MIT 18.01SC 给出交付边界，同济《高等数学》第八版上册作中文术语与记号口径，共 9 章。

## 课程简介

- **目标**：用极限的精确定义与求导法则求导数，判断函数在一点的可导性与连续性，并说清二者不等价的反例；
- **前提**：高中代数与三角（含指数函数、对数函数与反三角函数的基本性质）；不预设微积分经验。
- **重点**：极限的定义与计算、导数与中值定理、积分技巧与反常积分、级数与 Taylor 展开。
- 用中值定理与一阶、二阶导数研究单调性、凹凸性与极值，处理最优化、相关变化率与线性逼近；
- 用 Riemann 和与微积分基本定理计算定积分，并用于面积、体积、弧长、功与平均值；
- 按被积函数形态选积分技巧、判定反常积分收敛，判断级数收敛并给出 Taylor 截断误差估计。
- **不在本包内**：多元微积分与向量分析、微分方程、参数方程与极坐标、实数完备性与一致收敛的严格理论。

各章内容按大纲逐章整理，笔记、分档习题与卡片随写作进度上线；目前录入了规划。

## 课程规划

{{< course-plan >}}
