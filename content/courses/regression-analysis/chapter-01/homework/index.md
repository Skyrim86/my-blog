---
# 作业（课程章下的 leaf bundle）：scripts/new-content.sh homework，
# 或 chapter 子命令的 --materials homework 生成。
# 与 notes.md 同理，不要在这里写 tags / categories（见该文件说明）。
title: "作业（一）"
weight: 6
icon: "📝"
date: 2026-09-15
draft: false
description: "课程作业全解：练习 1.1、1.2、E1.3、A2.1、A2.2（ILRA 6e 选解在《作业（二）》）。"
# summary 必须写：列表卡片摘要走 `.Summary | plainify`，正文公式已渲染成 HTML+MathML，会被拼成乱码
summary: "课程作业全解：练习 1.1、1.2、E1.3、A2.1、A2.2（ILRA 6e 选解在《作业（二）》）。"
---

> 录入范围：课程作业（练习 1.1、1.2、E1.3、A2.1、A2.2）全解。数值计算型不录——方法已在正文算例中给出，重复无益。ILRA 6e 第 2 章选解在《作业（二）》。

## A 课程作业全解

#### 练习 1.1 对简单线性模型证明四式

四问共用同一条结构：$\hat\beta_1,\hat\beta_0$ 是 $y$ 的线性组合，且系数满足固定的正交条件；所有矩的计算都化为对这些和式取期望与方差。

**引理 4.1** 记 $c_i=\dfrac{x_i-\bar x}{S_{xx}}$、$d_i=\dfrac1n-\bar xc_i$，则 $\hat\beta_1=\sum_ic_iy_i$、$\hat\beta_0=\sum_id_iy_i$，且

$$
\sum_ic_i=0,\quad \sum_ic_ix_i=1,\quad \sum_ic_i^2=\frac1{S_{xx}};\qquad \sum_id_i=1,\quad \sum_id_ix_i=0 .
$$

**（1）$E(\hat\beta_0)=\beta_0$。** **定理 4.2（无偏性）**：在 A1（$E(\epsilon_i)=0$，固定设计）下 $E(\hat\beta_0)=\beta_0$、$E(\hat\beta_1)=\beta_1$。按定义直接验证：

$$
E(\hat\beta_0)=\sum_id_iE(y_i)=\sum_id_i(\beta_0+\beta_1x_i)
=\beta_0\underbrace{\sum_id_i}_{=1}+\beta_1\underbrace{\sum_id_ix_i}_{=0}=\beta_0 .
$$

**（2）$\operatorname{Cov}(\bar y,\hat\beta_1)=0$。** 由{{< tool "1.4" "线性组合的方差公式" >}}（两两不相关时方差可加 $\operatorname{Var}\big(\sum a_iX_i\big)=\sum a_i^2\operatorname{Var}(X_i)$）与协方差的双线性（{{< tool "1.1" "期望与方差的运算法则" >}}），对 $\bar y=\frac1n\sum_iy_i$、$\hat\beta_1=\sum_ic_iy_i$ 有 $\operatorname{Cov}(\bar y,\hat\beta_1)=\sigma^2\sum_i\frac1nc_i$，而

$$
\sum_i\frac1nc_i=\frac1n\sum_ic_i=0
\ \Longrightarrow\ \operatorname{Cov}(\bar y,\hat\beta_1)=0 .
$$

**（3）$\operatorname{Var}(\hat\beta_0)=\sigma^2\big(\frac1n+\frac{\bar x^2}{S_{xx}}\big)$。** **定理 4.3（方差与协方差）**：在 A1、A2（不相关、同方差 $\sigma^2$）下

$$
\operatorname{Var}(\hat\beta_1)=\frac{\sigma^2}{S_{xx}},\qquad
\operatorname{Var}(\hat\beta_0)=\sigma^2\Big(\frac1n+\frac{\bar x^2}{S_{xx}}\Big),\qquad
\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=-\frac{\bar x\,\sigma^2}{S_{xx}} .
$$

其证明就是下面这一步（由引理 4.1 的系数与{{< tool "1.4" "线性组合的方差公式" >}}）：

$$
\operatorname{Var}(\hat\beta_0)=\sigma^2\sum_id_i^2=\sigma^2\sum_i\Big(\frac1n-\bar xc_i\Big)^2
=\sigma^2\Big(\underbrace{\sum_i\frac1{n^2}}_{=1/n}-2\frac{\bar x}{n}\underbrace{\sum_ic_i}_{=0}+\bar x^2\underbrace{\sum_ic_i^2}_{=1/S_{xx}}\Big)
=\sigma^2\Big(\frac1n+\frac{\bar x^2}{S_{xx}}\Big).
$$

**（4）$\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=-\bar x\sigma^2/S_{xx}$。** 同一条定理 4.3 的协方差式：

$$
\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=\sigma^2\sum_id_ic_i
=\sigma^2\Big(\frac1n\underbrace{\sum_ic_i}_{=0}-\bar x\underbrace{\sum_ic_i^2}_{=1/S_{xx}}\Big)=-\frac{\bar x\sigma^2}{S_{xx}} .
$$

**注** (2) 与 (3) 合起来说明：$\operatorname{Var}(\hat\beta_0)=\operatorname{Var}(\bar y)+\bar x^2\operatorname{Var}(\hat\beta_1)$，正是"$\bar y$ 与 $\hat\beta_1$ 不相关"的方差分解形式——这也是 §6 中心化形式 $\operatorname{Var}(\hat\beta_0')=\sigma^2/n$ 的来源。

#### 练习 1.2 四个等式

**（1）$\hat\beta_1=\hat\rho_{xy}\cdot\dfrac{\hat\sigma_y}{\hat\sigma_x}$。** **命题 16.3**：样本层面 $\hat\beta_1=\hat r\cdot\dfrac{\hat\sigma_y}{\hat\sigma_x}$，且 $\hat\sigma^2=S_{yy}(1-r^2)\dfrac1{n-2}$，其中 $\hat r$ 是样本相关系数，$\hat\sigma_x^2=S_{xx}/(n-1)$ 、$\hat\sigma_y^2=S_{yy}/(n-1)$。构造性验证：

$$
\hat\rho_{xy}\frac{\hat\sigma_y}{\hat\sigma_x}
=\frac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}\cdot\sqrt{\frac{S_{yy}/(n-1)}{S_{xx}/(n-1)}}
=\frac{S_{xy}}{S_{xx}}=\hat\beta_1.
$$

（比值中 $n-1$ 相消，与样本方差的自由度约定无关。）

**（2）$SS_{\rm reg}=\hat\beta_1S_{xy}$。** **引理 8.3**：含截距时

$$
SS_{\rm reg}=\hat\beta_1S_{xy}=\hat\beta_1^2S_{xx}=\frac{S_{xy}^2}{S_{xx}} .
$$

证明只用两件事：推论 3.4(4)（回归直线过数据中心点 $\bar y=\hat\beta_0+\hat\beta_1\bar x$）与 $\hat\beta_1=S_{xy}/S_{xx}$。由 $SS_{\rm reg}=\sum_i(\hat y_i-\bar y)^2$，

$$
SS_{\rm reg}=\sum_i\big(\hat\beta_0+\hat\beta_1x_i-\bar y\big)^2=\hat\beta_1^2\sum_i(x_i-\bar x)^2=\hat\beta_1^2S_{xx}=\hat\beta_1\,(\hat\beta_1S_{xx})=\hat\beta_1S_{xy},
$$

末式用了 $\hat\beta_1=S_{xy}/S_{xx}$；再代入一次即得 $S_{xy}^2/S_{xx}$。

**（3）$SS_{\rm reg}/SS_{\rm T}=\hat\rho_{xy}^2$。** **定义 11.1（决定系数）** 含截距模型中 $R^2=\dfrac{SS_{\rm reg}}{SS_{\rm T}}=1-\dfrac{SS_{\rm res}}{SS_{\rm T}}$，且 $0\le R^2\le1$；**定理 11.2** 给出 $R^2=r^2$，其中 $r=\dfrac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}$。由 (2)，$SS_{\rm reg}=\hat\beta_1S_{xy}=\dfrac{S_{xy}^2}{S_{xx}}$，故

$$
\frac{SS_{\rm reg}}{SS_{\rm T}}=\frac{S_{xy}^2}{S_{xx}S_{yy}}=\hat\rho_{xy}^2 .
$$

**（4）$E(SS_{\rm reg})=\sigma^2+\beta_1^2S_{xx}$。** 由 (2) 与引理 8.3，$SS_{\rm reg}=\hat\beta_1^2S_{xx}$；再用{{< tool "3.1" "均方误差分解" >}} $\operatorname{MSE}(\hat\theta)=\operatorname{Var}(\hat\theta)+\operatorname{bias}^2(\hat\theta)$（此处偏差为零），配合定理 4.2（$E\hat\beta_1=\beta_1$）与定理 4.3（$\operatorname{Var}(\hat\beta_1)=\sigma^2/S_{xx}$）：

$$
E(\hat\beta_1^2)=\operatorname{Var}(\hat\beta_1)+\big(E\hat\beta_1\big)^2=\frac{\sigma^2}{S_{xx}}+\beta_1^2
\ \Longrightarrow\ E(SS_{\rm reg})=S_{xx}\Big(\frac{\sigma^2}{S_{xx}}+\beta_1^2\Big)=\sigma^2+\beta_1^2S_{xx}.
$$

#### 练习 E1.3 过原点模型的估计

模型 $y_i=\beta_1x_i+\epsilon_i$，$\epsilon_i\sim IID(0,\sigma^2)$（$x_i$ 不全为 $0$）。两条结论先写出，推导一并给全：

**定理 14.2** 模型 $y_i=\beta_1x_i+\epsilon_i$（误差零均值、不相关、同方差 $\sigma^2$）的最小二乘估计为

$$
\hat\beta_1=\frac{\sum_ix_iy_i}{\sum_ix_i^2},
$$

它是 $\beta_1$ 的无偏估计，且 $\operatorname{Var}(\hat\beta_1)=\dfrac{\sigma^2}{\sum_ix_i^2}$。

**定理 14.3（误差方差的无偏估计）** 在同一模型下 $E(SS_{\rm res})=(n-1)\sigma^2$，故

$$
\hat\sigma^2=\frac{SS_{\rm res}}{n-1}.
$$

**推导**

1. **最小二乘解。** 最小化 $Q(\beta_1)=\sum_i(y_i-\beta_1x_i)^2$：$Q'(\beta_1)=-2\sum_ix_i(y_i-\beta_1x_i)=0$ 给出 $\hat\beta_1=\dfrac{\sum_ix_iy_i}{\sum_ix_i^2}$；$Q''=2\sum_ix_i^2>0$，故这是唯一最小值点。
2. **无偏与方差。** 把 $\hat\beta_1$ 写成 $\beta_1+\dfrac{\sum_ix_i\epsilon_i}{\sum_ix_i^2}$：取期望得无偏；取方差由{{< tool "1.4" "线性组合的方差公式" >}}得 $\sigma^2\dfrac{\sum_ix_i^2}{(\sum_ix_i^2)^2}=\dfrac{\sigma^2}{\sum_ix_i^2}$。
3. **误差方差的自由度。** 记 $e_i=y_i-\hat\beta_1x_i=\epsilon_i-(\hat\beta_1-\beta_1)x_i$，平方求和并代入 $\hat\beta_1-\beta_1=\sum_ix_i\epsilon_i/\sum_ix_i^2$：

$$
SS_{\rm res}=\sum_i\epsilon_i^2-\frac{\big(\sum_ix_i\epsilon_i\big)^2}{\sum_ix_i^2}.
$$

取期望：$E\sum_i\epsilon_i^2=n\sigma^2$；又 $\sum_ix_i\epsilon_i$ 零均值、方差 $\sigma^2\sum_ix_i^2$，故其平方的期望为 $\sigma^2\sum_ix_i^2$。于是 $E(SS_{\rm res})=(n-1)\sigma^2$，$\hat\sigma^2=SS_{\rm res}/(n-1)$ 无偏。

**分母是 $n-1$ 而不是 $n-2$**：只估了斜率一个参数，且过原点模型**没有** $\sum_ie_i=0$ 这条约束（命题 14.4），损失的自由度比含截距模型少一个。

#### 练习 A2.1 证明 $SS_{\rm reg}=\hat\beta_1^2S_{xx}$

**引理 8.3**：含截距时 $SS_{\rm reg}=\hat\beta_1S_{xy}=\hat\beta_1^2S_{xx}=\dfrac{S_{xy}^2}{S_{xx}}$，其中 $SS_{\rm reg}=\sum_i(\hat y_i-\bar y)^2$。

证明（$\bar y=\hat\beta_0+\hat\beta_1\bar x$ 由推论 3.4(4) 来）：

$$
SS_{\rm reg}=\sum_i\big(\hat y_i-\bar y\big)^2
=\sum_i\big(\hat\beta_0+\hat\beta_1x_i-\hat\beta_0-\hat\beta_1\bar x\big)^2
=\hat\beta_1^2\sum_i(x_i-\bar x)^2=\hat\beta_1^2S_{xx}.
$$

另两式由 $\hat\beta_1=S_{xy}/S_{xx}$ 代入得到，本例不需要。

#### 练习 A2.2 证明 $R^2=r^2$

**定理 11.2**：对简单线性回归 $R^2=r^2$，其中 $r=\dfrac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}$。

证明：$R^2=\dfrac{SS_{\rm reg}}{SS_{\rm T}}$（定义 11.1），$SS_{\rm reg}=\dfrac{S_{xy}^2}{S_{xx}}$（引理 8.3），$SS_{\rm T}=S_{yy}$，故

$$
R^2=\frac{S_{xy}^2/S_{xx}}{S_{yy}}=\Big(\frac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}\Big)^2=r^2 .
$$

这个等式是**一元**回归的性质：只有一个回归量时 $r$ 恰好是标准化后的斜率。多元回归中 $R^2$ 与任一两变量相关系数都无此关系。

---
