---
# 课程主页骨架：hugo new content courses/<课程>/_index.md
# （kind 取路径首段 "courses"，所以无需 --kind；章节入口页请用 --kind chapter）
# 章节目录由 layouts/_partials/course-index.html 按 weight 自动生成，不用在这里维护。
title: "贝叶斯统计"
# 课程规划：front matter 的 plan 列表 + 正文里一行 {{< course-plan >}} 会渲染成进度对照表。
# 已发布判定按 title 与子章节标题逐字相同，所以 plan 条目的 title 要和 _index.md 的 title 一致。
# 列表卡片封面（可选）：tools/covers/make-covers.py 生成后写 cover.image
layout: "course"
date: 2026-10-03
draft: false
cover:
  image: "images/covers/bayesian-statistics.webp"
  alt: "贝叶斯统计"
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "贝叶斯统计课程学习包：以 Hoff《A First Course in Bayesian Statistical Methods》为主线、茆诗松与汤银才《贝叶斯统计》作覆盖下界，按 13 章整理先验、后验、决策与 MCMC。"
summary: "先验与后验、共轭分析、贝叶斯推断与决策、蒙特卡洛与 MCMC、分层与回归的贝叶斯处理；13 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
plan:
  - weight: 1
    title: "贝叶斯推断的基本框架"
    summary: "三种信息；先验分布与后验分布；贝叶斯公式的密度形式；后验的归一化常数；条件方法"
  - weight: 2
    title: "可交换性与先验分布"
    summary: "可交换性；de Finetti 表示；主观概率；先验信息确定先验；利用边际分布定先验；无信息先验（均匀先验的参数化依赖、Jeffreys 先验）；多层先验与超参数"
  - weight: 3
    title: "单参数模型与共轭分析"
    summary: "共轭先验；二项–Beta、泊松–Gamma、指数–Gamma、正态–正态；单参数指数族通式；后验摘要量；超参数确定（矩法/分位数法）；充分统计量与因子分解定理；序贯更新；放弃共轭的判据"
  - weight: 4
    title: "贝叶斯推断：估计与区间"
    summary: "后验均值 / 中位数 / 众数；后验均方的分解；可信区间与 HPD 区间；后验渐近正态（Bernstein–von Mises）；似然原理"
  - weight: 5
    title: "假设检验、模型比较与预测"
    summary: "贝叶斯因子；Savage–Dickey 密度比；后验概率与决策阈值；后验预测分布；预测的边际化；后验预测检验"
  - weight: 6
    title: "决策的要素：收益、损失与效用"
    summary: "决策论公理与决策问题三要素；决策准则；先验期望准则；损失函数族（平方、绝对、0–1、LINEX）；效用函数与风险厌恶"
  - weight: 7
    title: "贝叶斯决策与统计决策理论"
    summary: "后验风险准则；常用损失下的贝叶斯估计；贝叶斯解的闭式表；抽样信息期望值（EVPI 与 EVSI）；最佳样本量；风险函数；容许性；最小最大准则；贝叶斯风险"
  - weight: 8
    title: "蒙特卡洛近似与直接抽样"
    summary: "蒙特卡洛估计的偏差与方差；标准误；重要性抽样；拒绝抽样；后验摘要的抽样实现"
  - weight: 9
    title: "马尔可夫链蒙特卡洛"
    summary: "马尔可夫链的平稳分布；细致平衡；Metropolis–Hastings；Gibbs 抽样；数据增广；混合性与自相关"
  - weight: 10
    title: "收敛诊断与计算实践"
    summary: "迹图；R̂（原始形式与秩归一化改进）；有效样本量；模型复杂度（DIC）；计算方案的取舍判据"
  - weight: 11
    title: "正态模型与多元正态模型"
    summary: "正态模型的共轭分析；方差参数的边际后验；多元正态；协方差矩阵的逆 Wishart；缺失数据下的 μ 与 Σ"
  - weight: 12
    title: "分层模型与分组比较"
    summary: "分组比较的两种极端；收缩与部分汇聚；分层先验；超先验的选定；交换性下的分层建模；收缩因子的解析式"
  - weight: 13
    title: "贝叶斯回归与广义线性模型"
    summary: "回归的贝叶斯处理；先验的作用；变量选择；GLM 与混合效应；潜变量与有序数据"
# 分类法只在这里写一次，由 cascade 下发给各章材料页。
# target.kind: page 表示只发给 regular page（笔记 / 作业 / 实验）——课程主页与章节入口页都是
# section，即使带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：材料页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: ["贝叶斯统计", "数学", "统计学"]
    categories: ["课程"]
  # 章节下的所有页面：关闭评论；加载 KaTeX 样式
  # （公式本身在构建期已渲染，见 layouts/_markup/render-passthrough.html；math 只控制样式加载）
  - comments: false
    math: true
---

贝叶斯统计把未知参数当作随机变量：先验给出我们已经知道什么，似然给出数据说了什么，后验把两者合成，再由后验做估计、检验、预测与决策。
本课程以 Hoff《A First Course in Bayesian Statistical Methods》为主线，茆诗松、汤银才《贝叶斯统计》第 2 版作覆盖下界与中文术语口径，共 13 章。

## 课程简介

- **目标**：写出给定模型下的先验、似然与后验，判定共轭性并求出后验；
- **前提**：概率论（条件概率、常见分布、期望与方差）、数理统计入门（似然、充分统计量）、线性代数（矩阵运算与多元正态）、一元微积分；不引入测度论。
- **重点**：共轭分析与后验摘要量、决策论要素与贝叶斯解、MCMC 与收敛诊断、分层与回归的贝叶斯处理。
- 构造并解释可信区间、贝叶斯因子与后验预测分布；
- 在先验与损失给定的决策问题里求贝叶斯解；
- 为不可解析的后验选择抽样方案，并判断抽样结果是否可信。
- **不在本包内**：测度论与贝叶斯非参数的理论框架、变分推断的推导、概率编程语言的软件教学、因果推断专门内容。

各章内容按大纲逐章整理，笔记、分档习题与卡片随写作进度上线；目前录入了规划。

## 课程规划

{{< course-plan >}}
