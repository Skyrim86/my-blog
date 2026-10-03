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
description: "贝叶斯统计课程学习包：以 Hoff《A First Course in Bayesian Statistical Methods》为主线、茆诗松与汤银才《贝叶斯统计》作覆盖下界，按 8 章整理先验、后验、共轭分析、推断、计算与决策。"
summary: "先验与后验、共轭分析、贝叶斯推断与决策、蒙特卡洛与 MCMC、分层与回归的贝叶斯处理；8 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
plan:
  - weight: 1
    title: "贝叶斯推断的基本框架"
    summary: "三种信息、先验分布与后验分布、贝叶斯公式的密度形式、后验的归一化常数、条件方法"
  - weight: 2
    title: "可交换性与先验分布"
    summary: "可交换性与 de Finetti 表示、主观概率、利用先验信息与边际分布确定先验、无信息先验（参数化依赖与 Jeffreys 先验）、多层先验与超参数"
  - weight: 3
    title: "单参数模型与共轭分析"
    summary: "共轭先验与二项–Beta／泊松–Gamma／指数–Gamma／正态–正态、单参数指数族通式、后验摘要量、超参数确定、充分统计量与序贯更新"
  - weight: 4
    title: "贝叶斯推断：估计与区间"
    summary: "后验均值／中位数／众数、后验均方的分解、可信区间与 HPD 区间、后验渐近正态、似然原理"
  - weight: 5
    title: "假设检验、模型比较与预测"
    summary: "贝叶斯因子与 Savage–Dickey 密度比、后验概率与决策阈值、后验预测分布、预测的边际化、后验预测检验"
  - weight: 6
    title: "计算入门：蒙特卡洛与 MCMC"
    summary: "蒙特卡洛估计的偏差与方差、重要性抽样与拒绝抽样、马尔可夫链的平稳分布与细致平衡、Metropolis–Hastings、Gibbs 抽样、混合性与收敛诊断"
  - weight: 7
    title: "决策的要素与贝叶斯解"
    summary: "决策论三要素与决策准则、先验期望准则、损失函数族与效用函数、后验风险准则、常用损失下的贝叶斯估计、EVPI 与 EVSI、容许性与最小最大准则"
  - weight: 8
    title: "正态与分层模型"
    summary: "正态模型的共轭分析、方差参数的边际后验、多元正态与逆 Wishart、分组比较与收缩、分层先验与超先验、收缩因子的解析式"

---

贝叶斯统计把未知参数当作随机变量：先验给出我们已经知道什么，似然给出数据说了什么，后验把两者合成，再由后验做估计、检验、预测与决策。
本课程以 Hoff《A First Course in Bayesian Statistical Methods》为主线，茆诗松、汤银才《贝叶斯统计》第 2 版作覆盖下界与中文术语口径，共 8 章；面向初学者，只保留前八个方向的入门部分。

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
