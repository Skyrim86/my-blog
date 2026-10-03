---
title: "数值分析"
layout: "course"
date: 2026-09-10
draft: false
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "数值分析课程学习包：以 Burden、Faires & Burden《Numerical Analysis》（10e）为主干、李庆扬等《数值分析》作中文覆盖下界，按 6 章讲误差与稳定性、方程求根、插值与数值微积分、线性方程组的解法、常微分方程初值问题。"
# 列表卡片封面（生成产物：tools/covers/make-covers.py）
cover:
  image: "images/covers/numerical-analysis.webp"
  alt: "数值分析"
summary: "误差与条件数、方程求根、插值与逼近、数值积分与微分、线性方程组与特征值、常微分方程初值问题；6 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
# 本课程的分类法只在这里写一次，由 cascade 下发给各章材料页。
# 注意 target.kind: page —— 只发给 regular page（笔记 / 作业）。课程主页与章节入口页
# 都是 section，即便带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
cascade:
  - target:
      kind: page
    tags: ["数值分析", "数学", "科学计算"]
    categories: ["课程"]
  # 章节目录下的所有页面：关闭评论；开启数学公式渲染（KaTeX，见 extend_head.html）
  - comments: false
    math: true
# 课程规划：正文里用 {{< course-plan >}} 渲染成「规划 × 已发布」对照表 + 进度条
# （模板见 layouts/_shortcodes/course-plan.html）。
# title 必须与 content/courses/<课程>/chapter-XX/_index.md 的 title **逐字一致**，
# 匹配得上才算「已发布」；weight 是本课程里的计划章号（用于显示「第 N 章」）。
plan:
  - weight: 1
    title: "误差分析与算法基础"
    summary: "浮点数系与机器精度、绝对/相对误差与有效数字、误差传播的条件数、收敛阶、算法稳定性、后向误差、补偿求和与 Horner 格式"
  - weight: 2
    title: "一元方程的数值解法"
    summary: "二分法收敛界、不动点迭代与压缩映射、Newton 法二次收敛、割线法与 Müller 法、Aitken 与 Steffensen 加速、多项式零点的病态性"
  - weight: 3
    title: "插值与多项式逼近"
    summary: "Lagrange 插值与余项、均差与 Newton 形式、Neville 算法、Hermite 插值、Runge 现象、分段插值与三次样条"
  - weight: 4
    title: "数值微分与数值积分"
    summary: "差分公式与截断误差、Richardson 外推、Newton–Cotes 与代数精度、复合求积的收敛阶、Romberg 算法、Gauss 求积"
  - weight: 5
    title: "线性方程组的数值解法"
    summary: "向量与矩阵范数、Gauss 消去与 LU 分解、列主元与增长因子、Cholesky 分解与追赶法、条件数与误差界、Jacobi/Gauss–Seidel/SOR 的收敛判据"
  - weight: 6
    title: "常微分方程初值问题"
    summary: "适定性与 Lipschitz 条件、Euler 与 Taylor 方法、Runge–Kutta 与阶条件、步长控制、线性多步法与预测–校正、相容性与稳定性"

---

数值分析回答「算法算出来到底差多少」：每个方法都给出收敛阶与误差界，并把总误差拆成截断与舍入两部分，各自给出量级。
本课程以 Burden、Faires & Burden《Numerical Analysis》（10e）为主干，李庆扬、王能超、易大义《数值分析》第 5 版作中文覆盖下界，共 6 章；面向初学者，只保留主干前六个方向的入门部分。

## 课程简介

- **目标**：判定给定计算问题的条件数与所用算法的数值稳定性，把总误差拆成截断与舍入并各给量级估计；
- **前提**：单变量与多变量微积分（中值定理、Taylor 公式、一致收敛）、线性代数（矩阵分解、特征值与特征向量、内积空间与范数）、常微分方程基础。
- **重点**：误差分析与数值稳定性、插值与逼近、数值积分、线性方程组的直接与迭代解法、微分方程数值解。
- 对求根、插值、逼近、求积、线性方程组与特征值问题选择算法，推导其收敛阶与误差界；
- 为常微分方程初值、边值问题与三类偏微分方程写出差分格式，判定相容性、稳定性与收敛性。
- **不在本包内**：逼近论与快速傅里叶变换、特征值近似与奇异值分解、非线性方程组的数值解法、常微分方程边值问题与偏微分方程数值解；实习与代码实现（本课程不产出代码）、并行与高性能实现、数值软件的使用手册式内容、蒙特卡洛与随机数值方法、反问题与正则化。

各章内容按大纲逐章整理，笔记、分档习题与卡片随写作进度上线；目前录入了规划。

## 课程规划

{{< course-plan >}}
