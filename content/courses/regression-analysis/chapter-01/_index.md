---
# 章节入口页骨架：hugo new content courses/<课程>/<chapter-0N>/_index.md --kind chapter
# 日常新建请优先用 scripts/new-content.sh chapter，它会自动排好章号，并按 --materials
# （默认 notes,homework）一并建好本章的材料页。三种材料分别是：
#   notes/index.md（📖 学习笔记）/ homework/index.md（📝 作业）/ lab/index.md（🧪 实验）
# 章目录下**任何** leaf bundle 都会被入口页列为材料卡片，所以材料还能之后再补：
#   bash scripts/new-content.sh notes|homework|lab <课程> chapter-0N
title: "回归分析与建模"
layout: "chapter"
weight: 1
date: 2026-09-15
draft: false
# 入口页通常没有公式，写 false 覆盖课程主页 cascade 的 math: true，省下约 23KB 的 KaTeX 样式。
# 但若导语里确实写了公式（参考 chapter-02），必须改成 true。
math: false
description: "回归是什么、模型把响应拆成哪两部分、误差项承担哪些内容、四类分析目的各要什么、数据来源与设计怎样决定推断语句、因果解释的边界，以及建模的迭代循环与充分性判断。"
---

本章先不估计，先把话说明白：回归把响应拆成条件均值与误差项，条件均值管形状、误差项管剩余——接着分层讲清模型假设的两种来源、四类分析目的各要什么、数据的来源与设计怎样决定推断语句、因果解释的边界，最后给建模的迭代循环与充分性判断。
