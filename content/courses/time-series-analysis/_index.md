---
# 课程主页骨架：hugo new content courses/<课程>/_index.md
# （kind 取路径首段 "courses"，所以无需 --kind；章节入口页请用 --kind chapter）
# 章节目录由 layouts/_partials/course-index.html 按 weight 自动生成，不用在这里维护。
title: "时间序列分析"
# 课程规划：front matter 的 plan 列表 + 正文里一行 {{< course-plan >}} 会渲染成进度对照表。
# 已发布判定按 title 与子章节标题逐字相同，所以 plan 条目的 title 要和 _index.md 的 title 一致。
# 列表卡片封面（可选）：tools/covers/make-covers.py 生成后写 cover.image
layout: "course"
date: 2026-10-03
draft: false
cover:
  image: "images/covers/time-series-analysis.webp"
  alt: "时间序列分析"
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "时间序列分析学习包：以 Brockwell & Davis《Introduction to Time Series and Forecasting》（3e）为主线，按 11 章覆盖平稳性与自协方差、ARMA 建模、谱分析、非平稳与季节模型。"
summary: "平稳性与自协方差、ARMA 的定阶估计与预测、谱分析、非平稳与季节模型、状态空间与波动率模型；11 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
plan:
  - weight: 1
    title: "引论与时间序列的描述"
    summary: "时间序列与实现、成分分解（加性/乘性）、iid 噪声与随机游走、趋势与季节成分的估计与消除、随机性检验"
  - weight: 2
    title: "平稳过程"
    summary: "严平稳与弱平稳、自协方差函数的性质与正定性、随机游走的非平稳性与差分平稳化、样本均值方差与样本自协方差的相合性、均方意义下的最佳线性预测"
  - weight: 3
    title: "ARMA 模型"
    summary: "线性过程、因果性与可逆性、平稳解的存在唯一性、ACF 与 PACF 的差分方程、Yule–Walker 方程、MA(1) 的多重表示"
  - weight: 4
    title: "谱分析"
    summary: "谱密度与自协方差的傅里叶对、线性滤波的谱、离散谱与混叠、周期图与谱估计的一致性"
  - weight: 5
    title: "ARMA 的建模与预测"
    summary: "Yule–Walker / Burg / 极大似然与最小二乘估计、Hannan–Rissanen、AIC 与 BIC 定阶、模型诊断、最优预测与预测误差"
  - weight: 6
    title: "非平稳与季节模型"
    summary: "差分与 ARIMA、单位根检验及其实分布、季节 ARIMA、回归含 ARMA 误差的 GLS 与 ML"
  - weight: 7
    title: "金融时间序列与波动率"
    summary: "对数收益的矩性质、ARCH 与 GARCH、平稳性与四阶矩条件、GARCH 变体导览、VaR 与风险度量"
  - weight: 8
    title: "多元时间序列"
    summary: "互协方差矩阵、VAR 的稳定性与估计、部分自相关、协整与误差修正、降秩与因子结构导览"
  - weight: 9
    title: "状态空间模型"
    summary: "状态空间表示、卡尔曼滤波与预测、平滑、结构模型、似然计算与参数估计、EM 的适用边界"
  - weight: 10
    title: "预测技术"
    summary: "指数平滑族（SES / Holt / Holt–Winters）、预测区间、精度度量与滚动评估、组合预测"
  - weight: 11
    title: "其他专题"
    summary: "非线性的几类表达（门限与状态依赖）、长记忆与分数差分、连续时间 ARMA、重抽样与自助法"
# 分类法只在这里写一次，由 cascade 下发给各章材料页。
# target.kind: page 表示只发给 regular page（笔记 / 作业 / 实验）——课程主页与章节入口页都是
# section，即使带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：材料页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: ["时间序列分析", "数学", "统计学"]
    categories: ["课程"]
  # 章节下的所有页面：关闭评论；加载 KaTeX 样式
  # （公式本身在构建期已渲染，见 layouts/_markup/render-passthrough.html；math 只控制样式加载）
  - comments: false
    math: true
---

时间序列分析处理的是一列按时间排开、彼此相关的观测：先判定平稳性与记忆结构，再把这种结构写成可估计的模型，最后落到预测与预测误差的分布。
本课程以 Brockwell & Davis《Introduction to Time Series and Forecasting》（3e）为主线，共 11 章，金融与波动率专题另由实务来源补强。

## 课程简介

- **目标**：判定序列的平稳性与记忆结构，写出它的自协方差、谱密度与差分方程表示；
- **前提**：微积分（级数、含参积分）、线性代数（矩阵运算、特征值与谱分解）、概率论（条件期望、二阶矩、均方收敛）、数理统计（估计、检验、极大似然）；谱分析一章另需复变函数的留数与围道积分。
- **重点**：平稳性与相关结构、ARMA 的定阶与估计、谱分析、非平稳与季节模型、状态空间与波动率模型。
- 从数据出发完成建模全流程：定阶、估计、诊断、预测，并给出预测误差的分布；
- 读懂金融与工程文献里的状态空间、GARCH 与协整建模，判断其结论依赖的假设强度。
- **不在本包内**：经济学识别的结构 VAR 与因果推断、贝叶斯时间序列的完整推导、机器学习时序预测、面板与时空模型、高频微观结构的完整理论。

各章内容按大纲逐章整理，笔记、分档习题与卡片随写作进度上线；目前录入了规划。

## 课程规划

{{< course-plan >}}
