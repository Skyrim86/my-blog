---
# 课程主页骨架：hugo new content courses/<课程>/_index.md
# （kind 取路径首段 "courses"，所以无需 --kind；章节入口页请用 --kind chapter）
# 章节目录由 layouts/_partials/course-index.html 按 weight 自动生成，不用在这里维护。
title: "金融数学"
# 课程规划：front matter 的 plan 列表 + 正文里一行 {{< course-plan >}} 会渲染成进度对照表。
# 已发布判定按 title 与子章节标题逐字相同，所以 plan 条目的 title 要和 _index.md 的 title 一致。
# 列表卡片封面（可选）：tools/covers/make-covers.py 生成后写 cover.image
layout: "course"
date: 2026-10-03
draft: false
cover:
  image: "images/covers/financial-mathematics.webp"
  alt: "金融数学"
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "金融数学课程学习包：以 Ross《An Elementary Introduction to Mathematical Finance》（3e）为主线、Hull《Options, Futures, and Other Derivatives》补实务，按 7 章讲概率与随机模型、利率与现值、无套利定价、Black–Scholes 与风险—收益的权衡。"
summary: "概率与随机模型、利率与现值、无套利定价与二叉树、Black–Scholes 与希腊字母、均值方差与期望效用；7 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
plan:
  - weight: 1
    title: "概率基础"
    summary: "概率与事件、条件概率与独立性、随机变量与期望、方差与协方差、条件期望"
  - weight: 2
    title: "正态随机变量"
    summary: "正态分布与标准正态、正态的线性组合、正态的独立与不相关、中心极限定理的陈述、对数正态分布与它的矩"
  - weight: 3
    title: "几何布朗运动"
    summary: "随机游走、布朗运动的初等刻画、几何布朗运动、对数正态性、波动率的估计"
  - weight: 4
    title: "利率与现值分析"
    summary: "连续复利与贴现、现值与净现值准则、年金、内部收益率、久期"
  - weight: 5
    title: "用套利给合约定价"
    summary: "远期与期货、期权的基本头寸、套利机会、复制组合、看涨看跌平价、二叉树定价"
  - weight: 6
    title: "Black–Scholes 与期权结果"
    summary: "风险中性估值的启发式推导、Black–Scholes 公式、希腊字母、隐含波动率、美式期权与提前行权、红利的处理、看跌期权的解析定价"
  - weight: 7
    title: "均值方差与期望效用"
    summary: "效用函数与风险厌恶、确定性等价与 Jensen 不等式、Arrow–Pratt 测度、均值方差准判据与有效前沿、两基金分离、风险中性测度与真实测度的差别"
# 分类法只在这里写一次，由 cascade 下发给各章材料页。
# target.kind: page 表示只发给 regular page（笔记 / 作业 / 实验）——课程主页与章节入口页都是
# section，即使带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：材料页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: ["金融数学", "数学"]
    categories: ["课程"]
  # 章节下的所有页面：关闭评论；加载 KaTeX 样式
  # （公式本身在构建期已渲染，见 layouts/_markup/render-passthrough.html；math 只控制样式加载）
  - comments: false
    math: true
---

金融数学把「一份合约现在值多少」变成可计算的定价问题：先由无套利论证出价格必须满足的关系，再用复制组合或风险中性概率把数值算出来。
本课程以 Ross《An Elementary Introduction to Mathematical Finance》（3e）为主线，Hull《Options, Futures, and Other Derivatives》补实务与制度，共 7 章：前六章是定价主线，第 07 章补风险与收益一侧；推导链在不引入随机微积分的前提下自足。

## 课程简介

- **目标**：用无套利论证给远期、期货与看涨看跌期权定价，解释复制组合与风险中性概率各自的角色；
- **前提**：一元微积分；线性代数初步（矩阵、二次型）；概率论（随机变量、期望与方差、条件期望、协方差、正态分布）。
- **重点**：无套利与风险中性定价、二叉树与 Black–Scholes、希腊字母与隐含波动率、美式期权与提前行权、均值方差与期望效用。
- 计算 Black–Scholes 价格与希腊字母，判断价格对执行价、到期、利率与波动率的敏感性方向与量级；
- 用二叉树与风险中性概率给欧式、美式期权定价，说清连续时间公式与离散递推的对应关系；
- 说明这套定价框架依赖的假设，并指出它们在何处失效（隐含波动率微笑、跳跃）。
- **不在本包内**：套利定理（状态价格与不完全市场）、随机序关系、最优化模型、随机动态规划与最优停时、异国期权的解析定价；Itô 积分的严格构造、鞅表示定理与测度变换的一般理论、连续时间最优控制、偏微分方程的数值解法、信用衍生品与利率曲线的完整建模。

各章内容按大纲逐章整理，笔记、分档习题与卡片随写作进度上线；目前录入了规划。

## 课程规划

{{< course-plan >}}
