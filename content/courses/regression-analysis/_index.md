---
# 课程主页骨架：hugo new content courses/<课程>/_index.md
# （kind 取路径首段 "courses"，所以无需 --kind；章节入口页请用 --kind chapter）
# 章节目录由 layouts/_partials/course-index.html 按 weight 自动生成，不用在这里维护。
title: "回归分析"
# 课程规划：front matter 的 plan 列表 + 正文里一行 {{< course-plan >}} 会渲染成进度对照表。
# 已发布判定按 title 与子章节标题逐字相同，所以 plan 条目的 title 要和 _index.md 的 title 一致。
# 列表卡片封面（可选）：tools/covers/make-covers.py 生成后写 cover.image
layout: "course"
date: 2026-09-15
draft: false
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "回归分析课程笔记：以 Montgomery–Peck–Vining 为主线，按模块整理模型设定、最小二乘估计、推断与区间估计、模型诊断与变量选择，每个定理给完整证明。"
summary: "按模块整理的笔记、作业全解与 R 上机实验；前置数学工具与定理另成一张张可检索的卡片。"
# 列表卡片封面（生成产物：tools/covers/make-covers.py）
cover:
  image: "images/covers/regression-analysis.webp"
  alt: "回归分析"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
# 课程规划：正文里一行 {{< course-plan >}} 渲染成「规划 × 已发布」对照表。
# 已发布判定按 title 与章节 _index.md 的 title **逐字相同**；计划中的模块先按下列标题写。
plan:
  - weight: 1
    title: "回归分析与建模"
    summary: "回归模型与误差项、四类分析目的、数据来源与固定设计、因果解释的边界、建模的迭代循环、充分性与内插外推"
  - weight: 2
    title: "简单线性回归"
    summary: "模型与假设、最小二乘解、线性质与 Gauss–Markov、误差方差估计、t 检验与方差分析、区间估计与预测、决定系数、过原点回归、极大似然"
  - weight: 3
    title: "多元线性回归"
    summary: "矩阵形式与正规方程、正交投影与帽子矩阵、Gauss–Markov、额外平方和与一般线性假设检验、正交设计、区间估计"
  - weight: 4
    title: "模型充分性检验"
    summary: "残差及其分布、四种缩放残差、残差图、偏回归图、PRESS、异常点与影响、失拟检验、纯误差估计"
  - weight: 5
    title: "变换与加权"
    summary: "方差稳定变换、线性化变换、Box–Cox 变换族、加权最小二乘、广义最小二乘"
  - weight: 6
    title: "杠杆与影响诊断"
    summary: "帽子矩阵与杠杆、学生化残差、DFFITS 与 DFBETAS、Cook 距离"
  - weight: 7
    title: "多项式回归模型"
    summary: "多项式模型的性质、正交多项式、中心化、分段多项式与样条入门"
  - weight: 8
    title: "指示变量"
    summary: "哑变量编码、含指示变量的模型、交互项、分段回归、协方差分析形式"
  - weight: 9
    title: "多重共线性"
    summary: "共线性的诊断（VIF、条件数、方差分解比例）、岭回归、主成分回归"
  - weight: 10
    title: "变量选择与模型构建"
    summary: "全子集与逐步法、$C_p$、信息准则、PRESS、模型构建策略"
  - weight: 11
    title: "回归模型的验证"
    summary: "数据划分、交叉验证、PRESS 与预测能力的评估、模型确认"
  - weight: 12
    title: "非线性回归导论"
    summary: "非线性模型的线性化、非线性最小二乘、Gauss–Newton 迭代、参数的渐近推断"
  - weight: 13
    title: "广义线性模型"
    summary: "指数族、链接函数、偏差、IRLS、logistic 与 Poisson 回归"
  - weight: 14
    title: "时间序列数据的回归分析"
    summary: "自相关误差、AR 模型、Durbin–Watson 检验、广义最小二乘与 Cochrane–Orcutt"
  - weight: 15
    title: "其他主题"
    summary: "稳健回归、bootstrap、分类与回归树概览、测量误差"

# 分类法只在这里写一次，由 cascade 下发给各章材料页。
# target.kind: page 表示只发给 regular page（笔记 / 作业 / 实验）——课程主页与章节入口页都是
# section，即使带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：材料页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: ["回归分析", "数学", "统计学"]
    categories: ["课程"]
  # 章节下的所有页面：关闭评论；加载 KaTeX 样式
  # （公式本身在构建期已渲染，见 layouts/_markup/render-passthrough.html；math 只控制样式加载）
  - comments: false
    math: true
---

回归分析研究如何用一个（或一组）自变量解释响应变量，并把「估计得多准」写清楚。

本课程以 Montgomery, Peck & Vining *Introduction to Linear Regression Analysis*（6e）为主线，讲义与 R 上机并行：每个模块给出完整推导与证明，每条结论标注它用到哪几条假设——**不因讲义进度而在中途截断**。

## 课程简介

- **目标**：给定一份数据与一个问题，能选对模型、算得出来，并说清结论的可信范围。
- **前提**：概率论与数理统计、线性代数（矩阵运算与投影），以及一点 R。
- **重点**：最小二乘的代数与几何、估计量的分布性质、推断与诊断——方法本身只是这些性质的载体。

每章是一个独立入口，分别进入三块内容：

- **📖 学习笔记** — 按模块整理，定理给完整证明；一篇太长时按 § 拆成上/中/下三页。
- **📝 作业** — 课程作业全解，外加教材的推导型与反例型选解。
- **🧪 实验** — R 上机：可复跑脚本 + 实跑输出 + 图。

前置数学工具与全部定理卡片另成一册，正文里点一下引用就能就地展开：

- **🧰 数学工具库** — 按分支检索的卡片墙。

## 课程规划

{{< course-plan >}}

## 学习方法

每个方法建议按同一顺序过一遍：

1. 它为什么成立（代数推导或几何直观）
2. 在什么假设下成立，假设破了会怎样
3. 估计量/统计量的分布是什么，据此能给出什么推断
4. 用一个小例子手算，或用 R 验证

## 参考资料

- Montgomery, Peck & Vining, *Introduction to Linear Regression Analysis*
- Seber & Lee, *Linear Regression Analysis*
- Rencher & Schaalje, *Linear Models in Statistics*
- Weisberg, *Applied Linear Regression*
