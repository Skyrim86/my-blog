---
# 课程主页骨架：hugo new content courses/<课程>/_index.md
# （kind 取路径首段 "courses"，所以无需 --kind；章节入口页请用 --kind chapter）
# 章节目录由 layouts/_partials/course-index.html 按 weight 自动生成，不用在这里维护。
title: "深度学习"
# 课程规划：front matter 的 plan 列表 + 正文里一行 {{< course-plan >}} 会渲染成进度对照表。
# 已发布判定按 title 与子章节标题逐字相同，所以 plan 条目的 title 要和 _index.md 的 title 一致。
# 列表卡片封面（可选）：tools/covers/make-covers.py 生成后写 cover.image
layout: "course"
date: 2026-10-03
draft: false
cover:
  image: "images/covers/deep-learning.webp"
  alt: "深度学习"
# 分区单位：本课程按「章」组织（改成 "周" 即切换为第 N 周）
unit: "章"
description: "深度学习学习包：以《动手学深度学习》（PyTorch 版）为主线，按 15 章从线性回归走到 Transformer，每个模型给出损失与梯度推导，并落到可跑的最小实现。"
summary: "线性回归与 softmax、多层感知机、卷积与现代卷积网络、循环网络与注意力、优化与计算性能；21 章规划已录入，材料随写作进度上线。"
# 课程主页自身没有公式；公式渲染由下面的 cascade 传给各章节材料页
math: false
plan:
  - weight: 1
    title: "引言"
    summary: "机器学习的关键组件；监督 / 无监督 / 强化、回归 / 分类 / 标注问题的划分"
  - weight: 2
    title: "预备知识"
    summary: "张量运算；矩阵乘法与范数；导数与梯度、链式法则；计算图与反向传播；期望、方差、贝叶斯定理"
  - weight: 3
    title: "线性神经网络"
    summary: "线性回归；平方损失；解析解与正规方程；梯度下降；softmax 回归与交叉熵；对数似然"
  - weight: 4
    title: "多层感知机"
    summary: "仿射变换与激活函数；万能逼近的直观；训练误差与泛化误差；权重衰减与 L_2 正则；暂退法；前向与反向传播；梯度消失与爆炸；参数初始化；协变量偏移与标签偏移"
  - weight: 5
    title: "深度学习计算"
    summary: "层与块；参数管理与初始化；延后初始化；自定义层；参数读写；GPU 上的模型与数据搬运"
  - weight: 6
    title: "卷积神经网络"
    summary: "互相关与卷积运算；填充与步幅；通道；汇聚；感受野与平移不变性；LeNet"
  - weight: 7
    title: "现代卷积神经网络"
    summary: "深度网络的退化问题与残差连接；批规范化；1×1 卷积与瓶颈结构；多分支与稠密连接"
  - weight: 8
    title: "循环神经网络"
    summary: "markov 假设与自回归模型；语言模型与困惑度；隐状态与循环计算；通过时间反向传播；梯度截断"
  - weight: 9
    title: "现代循环神经网络"
    summary: "门控机制；GRU 与 LSTM 的信息流；深度与双向循环网络；编码器–解码器；seq2seq；束搜索"
  - weight: 10
    title: "注意力机制"
    summary: "注意力汇聚；评分函数（加性 / 缩放点积）；Bahdanau 注意力；多头注意力；自注意力；位置编码；Transformer 结构"
  - weight: 11
    title: "优化算法"
    summary: "局部极小与鞍点；凸性判别；动量；AdaGrad / RMSProp / Adadelta / Adam 的更新规则；学习率调度"
  - weight: 12
    title: "计算性能"
    summary: "命令式与符号式执行；异步计算与并行；多 GPU 数据并行；参数服务器的通信代价"
  - weight: 13
    title: "计算机视觉"
    summary: "图像增广；微调；边界框与锚框；IoU 与非极大值抑制；单发多框检测；区域卷积网络；转置卷积与全卷积网络；风格迁移"
  - weight: 14
    title: "自然语言处理：预训练"
    summary: "词嵌入；跳元模型与连续词袋；负采样；全局向量；子词嵌入；BERT 的掩蔽语言建模与下一句预测"
  - weight: 15
    title: "自然语言处理：应用"
    summary: "情感分析；自然语言推断；针对下游任务微调 BERT"
# 分类法只在这里写一次，由 cascade 下发给各章材料页。
# target.kind: page 表示只发给 regular page（笔记 / 作业 / 实验）——课程主页与章节入口页都是
# section，即使带上标签也只会让 /tags/ 的计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：材料页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: ["深度学习"]
    categories: ["课程"]
  # 章节下的所有页面：关闭评论；加载 KaTeX 样式
  # （公式本身在构建期已渲染，见 layouts/_markup/render-passthrough.html；math 只控制样式加载）
  - comments: false
    math: true
---

这套资料把深度学习从「会调包」推到「说得清」：每章的模型给出损失函数与梯度的推导，再落到可跑的最小实现。
以 Aston Zhang 等《动手学深度学习》（PyTorch 版，Release 2.0.0）为主线，共 15 章——从线性回归、多层感知机一路到卷积、循环、注意力与 Transformer。

## 课程简介

- **目标**：写出并推导线性回归、softmax 回归与多层感知机的损失与梯度，独立实现训练循环；
- **前提**：微积分（偏导与链式法则）、线性代数（矩阵乘法、范数、特征值概念）、概率（期望与方差、条件概率、最大似然）、Python 与 NumPy 基本操作；缺失项在 02 章补齐。
- **重点**：反向传播与梯度推导、卷积与残差结构、序列模型与注意力、优化算法与训练诊断。
- 说明卷积、池化、残差连接、门控循环单元与自注意力各自解决什么问题，并给出计算量的量级；
- 针对具体任务选模型结构与优化器，判断训练不收敛、过拟合与分布偏移分别该动哪个环节。
- **不在本包内**：大规模分布式训练工程、框架源码级实现、强化学习、生成模型（扩散与变分自编码器）、2023 年之后的大模型训练细节。

各章内容按大纲逐章整理，笔记、分档习题与卡片随写作进度上线；目前录入了规划。

## 课程规划

{{< course-plan >}}
