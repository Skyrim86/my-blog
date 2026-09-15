---
# 作业（课程章下的 leaf bundle）：scripts/new-content.sh homework，
# 或 chapter 子命令的 --materials homework 生成。
# 与 notes.md 同理，不要在这里写 tags / categories（见该文件说明）。
title: "作业"
weight: 4
icon: "📝"
date: 2026-09-15
draft: false
description: "作业全解：练习 1.1、1.2，以及 ILRA 6e 第 2 章的推导型与反例型选解（数值计算型不重复录入）。"
---


> 录入范围：作业（练习 1.1、1.2）全解 + *Introduction to Linear Regression Analysis*（6th ed.，**ILRA 6e**）第 2 章推导型与反例型选解。数值计算型不录——方法已在正文算例中给出，重复无益。

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

**（2）$\operatorname{Cov}(\bar y,\hat\beta_1)=0$。** 由{{< tool "1.4" >}}（两两不相关时方差可加 $\operatorname{Var}\big(\sum a_iX_i\big)=\sum a_i^2\operatorname{Var}(X_i)$）与协方差的双线性（{{< tool "1.1" >}}），对 $\bar y=\frac1n\sum_iy_i$、$\hat\beta_1=\sum_ic_iy_i$ 有 $\operatorname{Cov}(\bar y,\hat\beta_1)=\sigma^2\sum_i\frac1nc_i$，而

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

其证明就是下面这一步（由引理 4.1 的系数与{{< tool "1.4" >}}）：

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

**（4）$E(SS_{\rm reg})=\sigma^2+\beta_1^2S_{xx}$。** 由 (2) 与引理 8.3，$SS_{\rm reg}=\hat\beta_1^2S_{xx}$；再用{{< tool "3.1" >}}的 MSE 分解 $\operatorname{MSE}(\hat\theta)=\operatorname{Var}(\hat\theta)+\operatorname{bias}^2(\hat\theta)$（此处偏差为零），配合定理 4.2（$E\hat\beta_1=\beta_1$）与定理 4.3（$\operatorname{Var}(\hat\beta_1)=\sigma^2/S_{xx}$）：

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
2. **无偏与方差。** 把 $\hat\beta_1$ 写成 $\beta_1+\dfrac{\sum_ix_i\epsilon_i}{\sum_ix_i^2}$：取期望得无偏；取方差由{{< tool "1.4" >}}得 $\sigma^2\dfrac{\sum_ix_i^2}{(\sum_ix_i^2)^2}=\dfrac{\sigma^2}{\sum_ix_i^2}$。
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

## B ILRA 6e 第 2 章推导型与反例型选解

#### ILRA 6e 2.25 协方差

**（a）$\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=- \bar x\sigma^2/S_{xx}$**；（**b）$\operatorname{Cov}(\bar y,\hat\beta_1)=0$**。

两问都由**定理 4.3**（A1、A2 下 $\operatorname{Var}(\hat\beta_1)=\sigma^2/S_{xx}$、$\operatorname{Var}(\hat\beta_0)=\sigma^2(1/n+\bar x^2/S_{xx})$、$\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=-\bar x\sigma^2/S_{xx}$）与协方差的双线性（{{< tool "1.1" >}}、{{< tool "1.4" >}}）推出，共用同一个技术：把估计量写成 $y$ 的线性组合，剩下的只是系数点积——§4.3 的全部协方差都走这条路。

**(a)** 用引理 4.1 的 $c_i=\dfrac{x_i-\bar x}{S_{xx}}$、$d_i=\dfrac1n-\bar xc_i$ 与 $\sum c_i=0$、$\sum c_i^2=1/S_{xx}$：

$$
\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=\sigma^2\sum_id_ic_i
=\sigma^2\Big(\frac1n\sum_ic_i-\bar x\sum_ic_i^2\Big)=-\frac{\bar x\sigma^2}{S_{xx}} .
$$

**(b)** $\bar y=\sum_i\frac1ny_i$，$\hat\beta_1=\sum_ic_iy_i$，由 $\sum_ic_i=0$：

$$
\operatorname{Cov}(\bar y,\hat\beta_1)=\sigma^2\sum_i\frac1nc_i=\frac{\sigma^2}{n}\sum_ic_i=0 .
$$

#### ILRA 6e 2.26 期望均方

**（a）$E(MS_{\rm R})=\sigma^2+\beta_1^2S_{xx}$**；（**b）$E(MS_{\rm res})=\sigma^2$**。

两个量由**定义 8.6（均方）**给出：$MS_{\rm reg}=\dfrac{SS_{\rm reg}}{df_{\rm reg}}$、$MS_{\rm res}=\dfrac{SS_{\rm res}}{df_{\rm res}}$；由**命题 8.4**，$df_{\rm reg}=1$、$df_{\rm res}=n-2$。

**(b)** **定理 5.3（$\hat\sigma^2$ 无偏）**：在 A1、A2 下 $E(RSS)=(n-2)\sigma^2$，从而 $E(\hat\sigma^2)=\sigma^2$，其中 $\hat\sigma^2=RSS/(n-2)$（定义 5.1）。故

$$
E(MS_{\rm res})=\frac{E(SS_{\rm res})}{n-2}=\frac{(n-2)\sigma^2}{n-2}=\sigma^2 .
$$

**(a)** $MS_{\rm R}=SS_{\rm reg}/1=SS_{\rm reg}$，由练习 1.2(4) 的 $E(SS_{\rm reg})=\sigma^2+\beta_1^2S_{xx}$ 直接得到。

**注** 二式的对比给出了 $F$ 检验的方向依据（§8.5）：$H_0:\beta_1=0$ 时二者期望相等，否则分子期望更大。

#### ILRA 6e 2.27 遗漏变量的偏误（反例型）

真模型 $E(y)=\beta_0+\beta_1x_1+\beta_2x_2$，却拟合了只含 $x_1$ 的简单线性回归 $\hat y=\hat\beta_0+\hat\beta_1x_1$。

**（a）$\hat\beta_1$ 无偏吗？** **不无偏**（除非 $\beta_2=0$ 或 $S_{x_1x_2}=0$）。

**（b）偏差的大小。** 记 $S_{11}=\sum_i(x_{i1}-\bar x_1)^2$、$S_{12}=\sum_i(x_{i1}-\bar x_1)(x_{i2}-\bar x_2)$。由**引理 4.1**，$\hat\beta_1=\sum_ic_iy_i$，其中 $c_i=(x_{i1}-\bar x_1)/S_{11}$，且 $\sum_ic_i=0$、$\sum_ic_ix_{i1}=1$。把真模型代入：

$$
E(\hat\beta_1)=\beta_0\underbrace{\sum_ic_i}_{0}+\beta_1\underbrace{\sum_ic_ix_{i1}}_{1}+\beta_2\sum_ic_ix_{i2}
=\beta_1+\beta_2\frac{S_{12}}{S_{11}},
$$

故

$$
\text{bias}(\hat\beta_1)=\beta_2\frac{S_{12}}{S_{11}} .
$$

**读法**：遗漏变量的偏误 = 遗漏变量的真实系数 × 被保留变量与遗漏变量的（简单回归）斜率。这一"遗漏变量偏误公式"在观测数据研究中是判断"该不该控制某个变量"的基本工具，M2 会以 FWL 引理（{{< tool "4.3" >}}）给出多元版本。

#### ILRA 6e 2.28 $\sigma^2$ 的 MLE 的偏差

**（a）偏差量**：$\text{bias}(\tilde\sigma^2)=-\dfrac{2\sigma^2}{n}$。**（b）$n\to\infty$ 时**偏差趋于 $0$。

**定理 15.2**：$\sigma^2$ 的 MLE 为

$$
\tilde\sigma^2=\frac{SS_{\rm res}}{n}=\frac{n-2}{n}\hat\sigma^2,\qquad
E(\tilde\sigma^2)=\frac{n-2}{n}\sigma^2,\qquad \text{bias}=-\frac{2\sigma^2}{n}.
$$

代入**定理 5.3**的 $E(SS_{\rm res})=(n-2)\sigma^2$：

$$
E\tilde\sigma^2=\frac{(n-2)\sigma^2}{n}=\frac{n-2}{n}\sigma^2
\ \Longrightarrow\ \text{bias}(\tilde\sigma^2)=\frac{n-2}{n}\sigma^2-\sigma^2=-\frac{2\sigma^2}{n}\xrightarrow[n\to\infty]{}0 .
$$

这是 MLE 渐近无偏性的一个直接算例。

#### ILRA 6e 2.29 使斜率标准误最小的设计（反例型）

$x$ 的"关注区间"为 $[-1,1]$，问 $x_1,\dots,x_n$ 应如何取值。

**答案**：**把观测尽可能放在区间两端** $x=\pm1$（各约一半）。

**理由**：$\operatorname{se}(\hat\beta_1)=\sigma/\sqrt{S_{xx}}$，依据是**定理 4.3** 的 $\operatorname{Var}(\hat\beta_1)=\sigma^2/S_{xx}$，故只需最大化 $S_{xx}=\sum_i(x_i-\bar x)^2$。对任意 $x_i\in[l,u]$（此处 $l=-1,u=1$）有 Popoviciu 型不等式 $S_{xx}\le n(u-l)^2/4$：

$$
S_{xx}=\sum_i(x_i-\bar x)^2\le\sum_i\Big(x_i-\frac{l+u}2\Big)^2\le n\Big(\frac{u-l}2\Big)^2,
$$

第一个不等号因为平方和 $\sum_i(x_i-c)^2$ 在 $c=\bar x$ 处最小，第二个因为 $|x_i-\frac{l+u}2|\le\frac{u-l}2$。取 $x_i=\pm1$ 时 $\bar x=0$、$S_{xx}=n$，恰好达到上界 $n\cdot2^2/4=n$，故最优。

**实践上的代价**：

1. **无法检验线性假设**：只有两端的观测时，中间的曲率完全看不见，"直线"是先验而非数据支持的结论。
2. **外推风险**：若真实关系弯曲，端点设计会把偏差放大到整段区间；而分散设计至少能在数据范围内暴露曲率。
3. **$\hat\sigma^2$ 无法检验失拟**：没有中间点就没有纯误差信息（对照命题 11.6）。
4. **实际折中**：在关注区间内**铺开**取值（含若干中间点），仅在重点区域加密。这就是响应面设计中"设计点选择"的雏形（M4 与实验设计课程）。

#### ILRA 6e 2.31 $R^2<1$

若同一 $x$ 处有取值不同的 $y$ 重复观测，则 $R^2<1$。

**命题 11.6**：若数据在同一 $x$ 值处有**不同**的 $y$ 观测，则 $R^2<1$。证明：此时存在 $i,j$ 使 $x_i=x_j$ 而 $y_i\ne y_j$。若 $R^2=1$，则 $SS_{\rm res}=0$，所有 $e_i=0$，即每个点都落在回归直线上；但同一 $x$ 处的直线只有一个取值，与 $y_i\ne y_j$ 矛盾。

**注意结论的强弱**：这条只排除 $R^2=1$，并不保证 $R^2$ 小。重复观测是 $R^2$ 永远达不到 $1$ 的原因，也是纯误差信息的来源——M3 的失拟检验靠的就是它。

#### ILRA 6e 2.32 截距已知的模型

模型 $y_i=\beta_0+\beta_1x_i+\epsilon_i$，$\beta_0$ **已知**。

**（a）$\beta_1$ 的最小二乘估计。** 最小化 $Q(\beta_1)=\sum_i(y_i-\beta_0-\beta_1x_i)^2$：

$$
Q'(\beta_1)=-2\sum_ix_i(y_i-\beta_0-\beta_1x_i)=0
\ \Longrightarrow\
\hat\beta_1=\frac{\sum_ix_i(y_i-\beta_0)}{\sum_ix_i^2}. \tag{B.1}
$$

**是否合理**：合理。这等价于"先把已知的理论水平减掉，再作过原点的回归"，$\sum_ix_i\ne0$ 时需要保留 $\sum_ix_i\beta_0$ 项（不能化简为 $\sum_ix_iy_i/\sum_ix_i^2$，除非 $\sum_ix_i=0$）。

**（b）方差。** 由 (B.1) 的系数平方和（{{< tool "1.4" >}}）：

$$
\operatorname{Var}(\hat\beta_1)=\frac{\sigma^2}{\sum_ix_i^2}. \tag{B.2}
$$

**（c）置信区间与比较。** 残差 $e_i=y_i-\beta_0-\hat\beta_1x_i$ 满足 $\sum_ix_ie_i=0$。这是**定理 14.2、14.3**的同构情形——过原点型模型 $\operatorname{Var}(\hat\beta_1)=\sigma^2/\sum_ix_i^2$、$\hat\sigma^2=SS_{\rm res}/(n-1)$——故损失 $1$ 个自由度，$\hat\sigma^2=SS_{\rm res}/(n-1)$，正态误差下 $\dfrac{\hat\beta_1-\beta_1}{\hat\sigma/\sqrt{\sum_ix_i^2}}\sim t_{n-1}$，据此

$$
\beta_1\in\hat\beta_1\pm t_{\alpha/2}(n-1)\frac{\hat\sigma}{\sqrt{\sum_ix_i^2}}. \tag{B.3}
$$

**是否比两者都未知时更窄**：**是**。两个理由，各自都成立：

- **分母更大**：$\sum x_i^2=S_{xx}+n\bar x^2\ge S_{xx}$，故标准误更小（对照定理 4.3 的 $\sigma^2/S_{xx}$）；
- **自由度更大**：$n-1>n-2$，故 $t$ 临界值更小。

（代价是引入先验 $\beta_0$ 为真的假设；若该假设错，$\hat\beta_1$ 有偏。）

#### ILRA 6e 2.33 残差的方差（反例型）

**结论**

$$
\operatorname{Var}(e_i)=\sigma^2\Big[1-\frac1n-\frac{(x_i-\bar x)^2}{S_{xx}}\Big]. \tag{B.4}
$$

**证明** **引理 5.2（残差的一个恒等式）**：在 A1、A2 下

$$
e_i=\big(\epsilon_i-\bar\epsilon\big)-\big(\hat\beta_1-\beta_1\big)(x_i-\bar x),\qquad
RSS=\sum_i(\epsilon_i-\bar\epsilon)^2-\frac{S_{x\epsilon}^2}{S_{xx}},\quad S_{x\epsilon}:=\sum_i(x_i-\bar x)\epsilon_i .
$$

取第一式，三项计算（第二、三式用**定理 4.3**的 $\operatorname{Var}(\hat\beta_1)=\sigma^2/S_{xx}$ 与**引理 4.1**的 $\hat\beta_1=\beta_1+\sum_kc_k\epsilon_k$）：

$$
\operatorname{Var}(\epsilon_i-\bar\epsilon)=\sigma^2\Big(1-\frac1n\Big),\qquad
\operatorname{Var}(\hat\beta_1)=\frac{\sigma^2}{S_{xx}},\qquad
\operatorname{Cov}(\epsilon_i-\bar\epsilon,\ \hat\beta_1)=\sigma^2\frac{x_i-\bar x}{S_{xx}},
$$

第三式：$\operatorname{Cov}(\epsilon_i,\hat\beta_1)=\sigma^2c_i$，而 $\operatorname{Cov}(\bar\epsilon,\hat\beta_1)=\sigma^2\frac1n\sum_kc_k=0$，故协方差为 $\sigma^2(x_i-\bar x)/S_{xx}$。合并：

$$
\operatorname{Var}(e_i)=\sigma^2\Big(1-\frac1n\Big)+(x_i-\bar x)^2\frac{\sigma^2}{S_{xx}}-2(x_i-\bar x)\frac{\sigma^2(x_i-\bar x)}{S_{xx}}
=\sigma^2\Big[1-\frac1n-\frac{(x_i-\bar x)^2}{S_{xx}}\Big].\ \square
$$

**残差的方差不是常数吗？** **不是。** 三条推论值得记住：

1. $h_{ii}=\frac1n+\frac{(x_i-\bar x)^2}{S_{xx}}$ 称为**杠杆值**（$H$ 的第 $i$ 个对角元），$\operatorname{Var}(e_i)=\sigma^2(1-h_{ii})$，$x$ 越极端残差方差越**小**。
2. 反直觉之处：高杠杆点的残差**倾向于小**（直线被它"拉"过去），所以**只看残差图会漏掉高杠杆点**。M3 因此要专门看杠杆与影响度量（$h_{ii}$、Cook's $D$）。
3. 由于 $\sum_ih_{ii}=\operatorname{tr}(H)=2$，平均杠杆为 $2/n$；当 $h_{ii}$ 接近 $1$ 时该点几乎决定了自己的拟合值，模型对它是"饱和"的。

#### ILRA 6e 2.38 从平方和反推

$n=20$，$SS_{\rm T}=100$，$SS_{\rm reg}=80$，求 $\hat\sigma^2$。

用**定义 5.1**（$\hat\sigma^2=MS_{\rm res}=RSS/(n-2)$）、**定理 8.1**的分解 $SS_{\rm T}=SS_{\rm res}+SS_{\rm reg}$ 与**命题 8.4**（$df_{\rm res}=n-2$）：$SS_{\rm res}=SS_{\rm T}-SS_{\rm reg}=20$，$df_{\rm res}=18$，故

$$
\hat\sigma^2=\frac{20}{18}=1.111,\qquad R^2=\frac{SS_{\rm reg}}{SS_{\rm T}}=\frac{80}{100}=0.80 .
$$

（顺带：$F_0=MS_{\rm reg}/MS_{\rm res}=80/1.111=72.0$，$df=(1,18)$。）

#### ILRA 6e 2.39 $p$ 值的上界

$n=25$，检验斜率是否为零的 $t$ 统计量为 $2.75$，求 $p$ 的上界。

用**定理 7.1**：检验 $H_0:\beta_1=\beta_{10}$ 时，统计量

$$
t_0=\frac{\hat\beta_1-\beta_{10}}{\operatorname{se}(\hat\beta_1)}=\frac{\hat\beta_1-\beta_{10}}{\hat\sigma/\sqrt{S_{xx}}}\ \sim t_{n-2}\quad(H_0\ \text{下}),
$$

双边拒绝域为 $\lvert t_0\rvert>t_{\alpha/2}(n-2)$，$p$ 值为 $2P\{t_{n-2}>\lvert t_{\rm obs}\rvert\}$。

此处 $df=23$。查表：$t_{0.01}(23)=2.500$、$t_{0.005}(23)=2.807$。由 $2.500<2.75<2.807$，得

$$
P\{t_{23}>2.75\}\in(0.005,\ 0.01)\ \Longrightarrow\ p=2P\{t_{23}>2.75\}\in(0.01,\ 0.02).
$$

**故 $p<0.02$**（同时 $p>0.01$）。做这类题的关键是把 $\lvert t_{\rm obs}\rvert$ 夹在两张表的分位点之间，**不要**去估计具体数值。

#### ILRA 6e 2.40–2.44 判断题（每题给答案 + 依据）

| 题 | 命题 | 答案 | 依据（结论先写出，编号在后） |
|---|---|---|---|
| 2.40 | 含截距的线性回归模型总通过数据中心 | **对** | 推论 3.4(4)：$\bar y=\hat\beta_0+\hat\beta_1\bar x$ |
| 2.41 | 预测响应的方差在预测变量均值处最小 | **对** | 定理 9.7：$\operatorname{Var}(\hat\mu_{y\mid x_0})=\sigma^2\big[\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}\big]$，在 $x_0=\bar x$ 处取最小值 $\sigma^2/n$ |
| 2.42 | 均值响应的置信区间总比同点新观测的预测区间宽 | **错** | 命题 10.4：$\sqrt{1+\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}\ge\sqrt{\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}$，预测量多出 $\sigma^2$ 一项，预测区间恒更宽 |
| 2.43 | 最小二乘法保证斜率与截距估计是 BLUE | **错** | 定理 4.4（Gauss–Markov）：在 A1、A2 下，一切线性无偏估计量中 $a\hat\beta_0+b\hat\beta_1$ 的方差最小；最小二乘本身只是"使 $RSS$ 最小"的代数操作，没有 A1、A2 就不保证无偏，更不保证最优 |
| 2.44 | 含截距模型中残差之和恒为零 | **对** | 推论 3.4(1)：$\sum_ie_i=0$，即正规方程 (3.3) |

#### ILRA 6e 2.9 无截距模型的辩护（讨论题）

分析师主张："若送达 $0$ 箱，则补货时间为 $0$，故直线必须过原点，含截距模型无效。"

**回应要点**：

1. **论证本身是对的，结论跳到太远**。"过原点"是关于 $x=0$ 的**模型假设**，应当被**检验**而不是被断言。检验方式：拟合含截距模型并检验 $H_0:\beta_0=0$（定理 7.1 的平行情形，$t_0=\hat\beta_0/\operatorname{se}(\hat\beta_0)\sim t_{n-2}$）。软饮数据中该检验给出 $t=-0.653$、$p=0.525$，**不能拒绝**——数据与"截距为零"相容。
2. **不能只看截距的显著性就选择无截距模型**，还要看整体拟合。本例中无截距模型的 $\hat\sigma=0.2988$ 小于含截距模型的 $0.3051$，两者一致支持无截距模型。
3. **若数据范围远离原点**，即使机理上过原点成立，强行无截距也会引入偏差：温度–产量一类关系的数据若全部取自远离 $0$ 的区间，过原点相当于把一次极端外推写进模型（§14.5）。
4. **不能比较两种模型的 $R^2$**：过原点模型报告的是**注 14.5**定义的

$$
R_0^2=\frac{\sum_i\hat y_i^2}{\sum_iy_i^2}=1-\frac{\sum_i(y_i-\hat y_i)^2}{\sum_iy_i^2},
$$

即"围绕**原点**的变异中被解释的比例"，与含截距模型的 $R^2$ 定义不同（§14.4）；比较应用 $\hat\sigma$，并注意自由度差异（$n-1$ 对 $n-2$）。
