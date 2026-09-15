---
# 学习笔记（课程章下的 leaf bundle）：scripts/new-content.sh notes，
# 或 chapter 子命令的 --materials notes 生成。
# 不要在这里写 tags / categories —— 课程标签由课程主页 _index.md 的 cascade 下发，
# 而 cascade 只填空：本页一旦自己写了 tags，就会整体丢掉继承来的课程标签。
title: "学习笔记（上）"
weight: 1
icon: "📖"
date: 2026-09-15
draft: false
description: "§1–§6：模型假设分层（A1/A2/A3）、最小二乘与几何投影、估计量性质与 Gauss–Markov、误差方差估计、中心化形式。"
---

## §1 为什么需要简单线性回归

### 1.1 回归要回答的四类问题

回归模型的用途通常归为四类，这四类决定了后续每一步技术选择的合理性：

| 用途 | 问题形式 | 对模型的要求 |
|---|---|---|
| 描述（data description） | 用什么式子概括这堆数据 | 拟合充分、形式可解释 |
| 参数估计（parameter estimation） | 某个机理常数是多少 | 估计量无偏、方差小 |
| 预测与估计（prediction） | 给定 $x_0$，$y$ 会是多少 | 预测区间有效、外推谨慎 |
| 控制（control） | 要把 $y$ 调到某值，$x$ 该定多少 | **必须**有因果性 |

第 4 类与前三类有本质差别：回归式用于**控制**时要求 $x\to y$ 是因果通道；只用于预测时只需"关系在新数据上仍然成立"。一个干净的例子：亚特兰大 8 月的日耗电量可以很好地预测当日最高气温，但靠限电来降温必然失败。

四类用途里只有"控制"需要因果通道。把预测方程当成控制方程用，是回归被误用得最狠的一种形态：数字算得没错，结论方向错了。这条纪律在 §13 展开。

### 1.2 相关与回归的区别

两个变量之间的关联有两种描述方式，它们的**对称性**不同：

- 相关系数 $\rho$（样本版 $r$）对称：$\rho_{XY}=\rho_{YX}$，它度量线性关联的强度，不区分因与果，也不给出方向。
- 回归函数 $E(Y\mid X=x)$ 不对称：$E(Y\mid X=x)$ 与 $E(X\mid Y=y)$ 一般是两条不同的直线。回归回答的是"在 $x$ 已定的条件下，$y$ 的平均水平如何变化"。

要讲清这一点，必须明确"回归"的对象是**条件期望**，而不是联合分布本身。M1 §16 会说明：当 $(x,y)$ 联合正态时两者互相决定，这也是 $R^2=r^2$ 的来源。

### 1.3 建模流程

```
理论/数据 → 模型设定 → 参数估计 → 模型充分性检查 ──不充分──┐
                ↑                                          │
                └──────────────────────────────────────────┘
                          充分 ↓
                    模型验证 → 使用
```

M1 只覆盖"设定 → 估计 → 简单推断"这一段；充分性检查（残差分析、失拟检验）在 M3，验证（数据分割、交叉验证）在 M4。**本模块的结论都以"模型设定正确"为前提**，这是后续模块存在的理由。

---

## §2 模型设定：从直觉到可检验的假设

### 2.1 定义与假设

**定义 2.1（简单线性回归模型）** 设响应变量 $y$ 与单个回归量 $x$ 满足

$$
y=\beta_0+\beta_1x+\epsilon, \tag{2.1}
$$

其中 $\beta_0$（截距）、$\beta_1$（斜率）为未知常数，$\epsilon$ 为随机误差。若数据为 $(x_i,y_i)$，$i=1,\dots,n$，则写为

$$
y_i=\beta_0+\beta_1x_i+\epsilon_i. \tag{2.2}
$$

**假设（按需要的强度分层，后续每步只用到其中一部分）**

| 记号 | 内容 | 从哪一节开始需要 |
|---|---|---|
| A1 | $E(\epsilon_i)=0$（若 $x$ 随机，则 $E(\epsilon_i\mid x_1,\dots,x_n)=0$） | §3 起全程 |
| A2 | $\operatorname{Var}(\epsilon_i)=\sigma^2$；$\operatorname{Cov}(\epsilon_i,\epsilon_j)=0$（$i\ne j$） | §4 起 |
| A3 | $\epsilon_i\sim N(0,\sigma^2)$ 且相互独立 | §7 起（推断） |

三点必须说清：

1. **A1 等价于"条件均值是线性的"**：$E(y_i\mid x_i)=\beta_0+\beta_1x_i$。线性性是关于**均值**的假设，不是关于每个观测点的假设。
2. **A2 只要求不相关与同方差，不要求独立、更不要求正态**。因此 §3–§6 的结论（无偏、Gauss–Markov）在很弱的条件下成立。
3. **A3 是可选的追加**，只为构造精确的 $t$、$F$ 分布；去掉 A3 后 §7 的检验仍然近似成立（§15）。

### 2.2 误差项里装了什么

$\epsilon$ 不是"测量误差"的同义词，它至少包含四个来源，理解这一点是判断模型是否可用的前提：

- **未纳入的变量**：影响 $y$ 但与 $x$ 无关的部分，以及**与 $x$ 相关**的部分。后者会让 A1 失效——这是 §13 讲的"遗漏变量偏误"的根源。
- **模型形式误差**：真实关系是曲线却用直线拟合。
- **测量误差**：$y$ 的观测误差（$x$ 的测量误差要单独处理，见 M3）。
- **内在随机性**：同一 $x$ 下 $y$ 本身有波动。

### 2.3 术语

| 记号 | 名称 | 说明 |
|---|---|---|
| $y$ | 响应变量 / 因变量 | dependent, response, regressand |
| $x$ | 回归量 / 自变量 | regressor, predictor, independent variable |
| $\beta_0,\beta_1$ | 回归系数 | $\beta_0$ 截距，$\beta_1$ 斜率 |
| $\epsilon$ | 误差 | 不可观测 |
| $e_i=y_i-\hat y_i$ | 残差 | 可计算，是误差的实现的可观测代理 |
| $\hat y_i=\hat\beta_0+\hat\beta_1x_i$ | 拟合值 | fitted value |

**误差与残差必须严格区分**：$\epsilon_i$ 是随机变量（模型的一部分），$e_i$ 是统计量（数据的函数）。M3 的全部诊断方法都是在用 $e$ 推断 $\epsilon$ 的性质是否如假设所述。

### 2.4 两种数据机制：固定设计 vs 随机设计

- **固定设计（fixed regressor）**：$x_1,\dots,x_n$ 由实验者在实验前选定，视为常数。期望与方差都是无条件（对 $\epsilon$）的。这是默认口径。
- **随机设计（random regressor）**：$(x_i,y_i)$ 是来自总体 $(x,y)$ 的随机样本，$x_i$ 是随机变量。此时所有矩理解为**条件矩**，如 $E(\hat\beta_1\mid x_1,\dots,x_n)=\beta_1$，$\operatorname{Var}(\hat\beta_1\mid x_1,\dots,x_n)=\sigma^2/S_{xx}$。§16 专门处理。

**记号约定**：本模块在需要区分时写条件符号，不区分时一律按固定设计读；两种机制下的**代数结论完全相同**，差别只在解释与前提。

### 2.5 适用范围：外推问题

$E(y\mid x)$ 是直线这一假设只在**观测数据的 $x$ 取值范围内**有依据。模型给出的直线可以延伸到任何 $x$，但延伸部分没有数据支撑。§13 会反复强调：**外推预测的危险不来自计算，而来自假设**。这一点与 §9 的置信带形状（离 $\bar x$ 越远越宽）互为印证。

---

## §3 最小二乘估计

### 3.1 准则

**"最小二乘"的含义**：选 $\beta_0,\beta_1$ 使残差平方和最小：

$$
RSS(\beta_0,\beta_1)=\sum_{i=1}^n\big(y_i-\beta_0-\beta_1x_i\big)^2\ \longrightarrow\ \min. \tag{3.1}
$$

用平方而非绝对值的原因有三：可导（一阶条件线性）、对应正态误差的极大似然（§15）、以及有{{< tool "4.1" "正交投影" >}}的几何意义。

### 3.2 解的存在性、唯一性与表达式

**定义 3.2（中心化平方和）**

$$
S_{xx}=\sum_{i=1}^n(x_i-\bar x)^2,\qquad S_{yy}=\sum_{i=1}^n(y_i-\bar y)^2,\qquad S_{xy}=\sum_{i=1}^n(x_i-\bar x)(y_i-\bar y).
$$

**定理 3.3（最小二乘估计）** 若 $S_{xx}>0$（即 $x_1,\dots,x_n$ 不全相等），则 $RSS$ 在 $\mathbb R^2$ 上有唯一最小值点

$$
\hat\beta_1=\frac{S_{xy}}{S_{xx}},\qquad \hat\beta_0=\bar y-\hat\beta_1\bar x. \tag{3.2}
$$

**证明** 一阶条件（驻点）：

$$
\frac{\partial RSS}{\partial\beta_0}\Big|_{\hat\beta}=-2\sum_{i=1}^n(y_i-\hat\beta_0-\hat\beta_1x_i)=0
\ \Longrightarrow\ \sum e_i=0,\ \text{即}\ \hat\beta_0=\bar y-\hat\beta_1\bar x, \tag{3.3}
$$

$$
\frac{\partial RSS}{\partial\beta_1}\Big|_{\hat\beta}=-2\sum_{i=1}^n x_i(y_i-\hat\beta_0-\hat\beta_1x_i)=0
\ \Longrightarrow\ \sum x_ie_i=0. \tag{3.4}
$$

把 (3.3) 代入 (3.4)：$\sum x_i\big(y_i-\bar y+\hat\beta_1\bar x-\hat\beta_1x_i\big)=0$，即 $\sum x_i(y_i-\bar y)-\hat\beta_1\sum x_i(x_i-\bar x)=0$。利用恒等式 $\sum x_i(y_i-\bar y)=\sum(x_i-\bar x)(y_i-\bar y)=S_{xy}$ 与 $\sum x_i(x_i-\bar x)=S_{xx}$，得 $\hat\beta_1=S_{xy}/S_{xx}$。

二阶条件：$RSS$ 的 Hessian 为

$$
\begin{pmatrix}\partial^2RSS/\partial\beta_0^2 & \partial^2RSS/\partial\beta_0\partial\beta_1\\ \cdot & \partial^2RSS/\partial\beta_1^2\end{pmatrix}
=2\begin{pmatrix}n&\sum x_i\\ \sum x_i&\sum x_i^2\end{pmatrix},
$$

其行列式为 $4\big(n\sum x_i^2-(\sum x_i)^2\big)=4nS_{xx}>0$，且 $n>0$，故 Hessian 正定，$RSS$ 严格凸，驻点是**唯一全局最优点**。$\square$

**式 (3.3)(3.4) 称为正规方程（normal equations）**，它们在数值上比 (3.2) 更重要：软件实际解的是正规方程，并且 (3.3)(3.4) 直接给出了残差的两条正交性。

**推论 3.4（残差的正交性质）** 对含截距的最小二乘拟合：

1. $\sum_{i=1}^ne_i=0$；
2. $\sum_{i=1}^nx_ie_i=0$，等价地 $\sum(x_i-\bar x)(e_i-\bar e)=\sum(x_i-\bar x)e_i=0$；
3. $\sum_{i=1}^n\hat y_ie_i=0$，即残差与拟合值不相关（因为 $\hat y_i$ 是 $1$ 与 $x_i$ 的线性组合，由 1、2 得）；
4. 回归直线过数据中心点：$\bar y=\hat\beta_0+\hat\beta_1\bar x$（即 (3.3)）。

**证明** 1、2 是正规方程本身；3 由 $\sum\hat y_ie_i=\hat\beta_0\sum e_i+\hat\beta_1\sum x_ie_i=0$；4 是 (3.3) 的改写。$\square$

**注 3.5（性质 1、3、4 的依赖条件）** 这三条都依赖**模型含截距**。过原点回归（§14）中 $\sum e_i\ne0$，性质 1、4 失效；这正是 §14 中 $R^2$ 分解式失效的根源。

**注 3.6（$S_{xx}=0$ 的退化情形）** 若所有 $x_i$ 相同，则 $x$ 无变异，斜率不可识别：$RSS$ 的最小值在任意 $\beta_1$ 处（$\beta_0$ 被唯一确定）取得，最小二乘解不唯一，$\hat\beta_1$ 无定义。这是"数据无信息"的极端情形，软件会报奇异。

这个解值得记的不是公式，而是它的适用限度：$S_{xx}=0$（所有 $x$ 相同）时解不存在。这不是数学上的麻烦，是数据里根本没有斜率的信息——换任何方法都救不回来。

### 3.3 计算式与数值稳定性

代数等价但计算性质不同的表达式：

$$
S_{xx}=\sum x_i^2-n\bar x^2=\sum x_i^2-\frac{(\sum x_i)^2}{n},\qquad
S_{xy}=\sum x_iy_i-n\bar x\bar y=\sum x_iy_i-\frac{(\sum x_i)(\sum y_i)}{n}.
$$

**使用建议**：手算时用右端（只需三个和），**编程时用中心化形式**（左端）。当 $x$ 的量级很大（比如 $x$ 是年份）时，$\sum x_i^2$ 与 $n\bar x^2$ 都是大数，相减会出现灾难性抵消。

### 3.4 几何解释

把数据看成 $\mathbb R^n$ 中的向量 $\mathbf y=(y_1,\dots,y_n)'$，把 $\mathbf 1=(1,\dots,1)'$ 与 $\mathbf x=(x_1,\dots,x_n)'$ 张成的二维子空间记为 $\mathcal C(\mathbf X)$。最小化 $RSS=\|\mathbf y-\beta_0\mathbf 1-\beta_1\mathbf x\|^2$ 就是求 $\mathbf y$ 在 $\mathcal C(\mathbf X)$ 上的{{< tool "4.1" "正交投影" >}}：$\hat{\mathbf y}=H\mathbf y$，$\mathbf e=(I-H)\mathbf y$，其中 $H$ 为{{< tool "4.1" "正交投影" >}}矩阵。残差的正交性质 1、2 就是"$\mathbf e\perp\mathcal C(\mathbf X)$"的分量形式。

几何语言在 M2 中会成为主线；M1 中它只是提供直觉与几个等价表述。

### 3.5 例 2.1（火箭推进剂数据）

数据：$n=20$ 个固体燃料火箭发动机，$x=$ 推进剂使用年龄（周），$y=$ 剪切强度（psi）。

样本统计量：

$$
n=20,\quad \bar x=13.3625,\quad \bar y=2131.358,\quad S_{xx}=1106.559,\quad RSS=166254.9 .
$$

$$
\hat\beta_1=\frac{S_{xy}}{S_{xx}}=-37.1536,\qquad \hat\beta_0=\bar y-\hat\beta_1\bar x=2627.822 .
$$

拟合方程

$$
\widehat{\text{Strength}}=2627.822-37.154\,\text{Age}. \tag{3.5}
$$

解释：推进剂年龄每增加 1 周，剪切强度的平均估计值下降约 37.15 psi。截距 $2627.82$ 表示"年龄为 0 时的平均强度"，在本数据范围内属于内插（年龄观测范围为 0–20 周），但仍受直线假设约束，不宜过度解读。

**这是本模块的贯穿算例**：§5 估计 $\sigma$，§7 检验斜率，§8 作方差分析，§9 求区间，§10 作预测，§11 算 $R^2$，§14 与无截距模型比较——全部用它，便于核对每一步。
## §4 最小二乘估计量的性质

本节把 §3 的代数解升级为统计结论：先看"估计量是 $y$ 的线性函数"这一结构，再依次给出无偏性、方差、协方差，最后给出最优性（Gauss–Markov）。这些结论**只用 A1、A2**，不需要正态。

### 4.1 线性性

**引理 4.1** 记 $c_i=\dfrac{x_i-\bar x}{S_{xx}}$，$d_i=\dfrac1n-\bar xc_i$，则

$$
\hat\beta_1=\sum_{i=1}^nc_iy_i,\qquad \hat\beta_0=\sum_{i=1}^nd_iy_i, \tag{4.1}
$$

且这两组系数满足

$$
\sum c_i=0,\quad \sum c_ix_i=1,\quad \sum c_i^2=\frac1{S_{xx}}; \qquad \sum d_i=1,\quad \sum d_ix_i=0 . \tag{4.2}
$$

**证明** 由 (3.2)，$\hat\beta_1=S_{xy}/S_{xx}=\frac{1}{S_{xx}}\sum(x_i-\bar x)(y_i-\bar y)=\sum c_i(y_i-\bar y)$，而 $\sum c_i=0$ 使 $\sum c_i(y_i-\bar y)=\sum c_iy_i$，第一式得证。$\hat\beta_0=\bar y-\hat\beta_1\bar x=\sum\big(\frac1n-\bar xc_i\big)y_i$，第二式得证。系数的和式：$\sum c_i=\frac{\sum(x_i-\bar x)}{S_{xx}}=0$；$\sum c_ix_i=\frac{\sum(x_i-\bar x)x_i}{S_{xx}}=\frac{S_{xx}}{S_{xx}}=1$；$\sum c_i^2=\frac{\sum(x_i-\bar x)^2}{S_{xx}^2}=\frac1{S_{xx}}$；$\sum d_i=1-\bar x\sum c_i=1$；$\sum d_ix_i=\bar x-\bar x\sum c_ix_i=0$。$\square$

**这条引理的意义** "线性估计"（{{< tool "3.2" "线性估计与 BLUE" >}}）不是近似说法，而是精确结构。此后所有矩的计算都变成对 (4.1) 用{{< tool "1.1" "期望与方差的运算法则" >}}与{{< tool "1.4" "线性组合的方差公式" >}}。

### 4.2 无偏性

**定理 4.2（无偏性）** 在 A1（$E(\epsilon_i)=0$，固定设计）下，

$$
E(\hat\beta_0)=\beta_0,\qquad E(\hat\beta_1)=\beta_1 .
$$

**证明** 对 $\hat\beta_1=\sum c_iy_i$ 取期望：$E\hat\beta_1=\sum c_iE(y_i)=\sum c_i(\beta_0+\beta_1x_i)=\beta_0\sum c_i+\beta_1\sum c_ix_i=\beta_1$（用 (4.2)）。同理 $E\hat\beta_0=\sum d_i(\beta_0+\beta_1x_i)=\beta_0\sum d_i+\beta_1\sum d_ix_i=\beta_0$。$\square$

**注（无偏性的本质是 $\hat\beta$ 的系数与 $x$ 正交于 $1$）** (4.2) 的两组正交条件同时充当"无偏约束"（证明中用到）与"最优性约束"（§4.4 用到）。这不是巧合：$E\hat\beta_1=\beta_1$ 对**所有** $\beta_0,\beta_1$ 成立，等价于系数同时与 $\mathbf 1$ 和 $\mathbf x$ 正交的恒等式。

### 4.3 方差与协方差

**定理 4.3（方差与协方差）** 在 A1、A2（不相关、同方差 $\sigma^2$）下，

$$
\operatorname{Var}(\hat\beta_1)=\frac{\sigma^2}{S_{xx}},\qquad
\operatorname{Var}(\hat\beta_0)=\sigma^2\Big(\frac1n+\frac{\bar x^2}{S_{xx}}\Big),\qquad
\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=-\frac{\bar x\,\sigma^2}{S_{xx}}. \tag{4.3}
$$

**证明** 由 (4.1) 与{{< tool "1.4" "线性组合的方差公式" >}}（只要求不相关）：

$$
\operatorname{Var}(\hat\beta_1)=\sum_i c_i^2\operatorname{Var}(y_i)=\sigma^2\sum_i c_i^2=\frac{\sigma^2}{S_{xx}},
$$

$$
\operatorname{Var}(\hat\beta_0)=\sigma^2\sum_i d_i^2=\sigma^2\sum_i\Big(\frac1n-\bar xc_i\Big)^2
=\sigma^2\Big(\underbrace{\sum_i\frac1{n^2}}_{=1/n}-2\frac{\bar x}{n}\underbrace{\sum_ic_i}_{=0}+\bar x^2\underbrace{\sum_ic_i^2}_{=1/S_{xx}}\Big)
=\sigma^2\Big(\frac1n+\frac{\bar x^2}{S_{xx}}\Big),
$$

$$
\operatorname{Cov}(\hat\beta_0,\hat\beta_1)=\sigma^2\sum_id_ic_i=\sigma^2\Big(\frac1n\underbrace{\sum_ic_i}_{=0}-\bar x\underbrace{\sum_ic_i^2}_{=1/S_{xx}}\Big)=-\frac{\bar x\sigma^2}{S_{xx}}.\ \square
$$

**四点结论，逐条记住其含义**

1. $\operatorname{Var}(\hat\beta_1)\propto1/S_{xx}$：$x$ 的**变异越大**，斜率的估计越精确。这是实验设计的第一条原理，§4.3 的方差公式与它互为因果。
2. $\operatorname{Var}(\hat\beta_0)$ 里有 $\bar x^2/S_{xx}$ 项：$\bar x$ 离原点越远，截距越难估。这正是 §6 中心化要解决的问题。
3. $\operatorname{Cov}(\hat\beta_0,\hat\beta_1)$ 的符号：$\bar x>0$ 时负相关——"直线绕数据中心点转动"的形象说法。
4. 三个式子都含 $\sigma^2$。$\sigma$ 未知时必须先估计它（§5），才能做推断（§7）。

### 4.4 Gauss–Markov 定理

**定理 4.4（Gauss–Markov）** 在 A1、A2 下，对任意常数 $a,b$（不全为 $0$），线性组合 $\theta=a\beta_0+b\beta_1$ 的**一切线性无偏估计量**中，$a\hat\beta_0+b\hat\beta_1$ 的方差最小。特别地 $\hat\beta_0,\hat\beta_1$ 分别是 $\beta_0,\beta_1$ 的 {{< tool "3.2" "BLUE" >}}。

**证明** 先刻画线性无偏估计类。设 $\tilde\theta=\sum_i k_iy_i$。由 $E\tilde\theta=\sum k_i(\beta_0+\beta_1x_i)=a\beta_0+b\beta_1$ 对一切 $\beta_0,\beta_1$ 成立，得约束

$$
\sum_ik_i=a,\qquad \sum_ik_ix_i=b. \tag{4.4}
$$

方差为 $\operatorname{Var}(\tilde\theta)=\sigma^2\sum_ik_i^2$——**只依赖系数向量的欧氏范数**，与 $\beta$ 无关。

记 $k_i^*=ad_i+bc_i$，即 $\tilde\theta^*=a\hat\beta_0+b\hat\beta_1$ 的系数。由 (4.2) 直接验证 $k^*$ 满足 (4.4)：

$$
\sum_ik_i^*=a\cdot1+b\cdot0=a,\qquad \sum_ik_i^*x_i=a\cdot0+b\cdot1=b,
$$

且 $k_i^*=\dfrac an+\Big(b-a\bar x\Big)c_i$ 落在 $\operatorname{span}\{\mathbf 1,\mathbf x\}$ 中（$c_i$ 是 $x_i$ 的仿射函数）。

现在设 $\tilde\theta$ 为任一线性无偏估计，写 $k_i=k_i^*+\delta_i$。因为 $k$ 与 $k^*$ 满足同一组约束 (4.4)，$\delta$ 满足

$$
\sum_i\delta_i=0,\qquad \sum_i\delta_ix_i=0,
$$

即 $\boldsymbol\delta\perp\operatorname{span}\{\mathbf 1,\mathbf x\}$，而 $\mathbf k^*\in\operatorname{span}\{\mathbf 1,\mathbf x\}$，故 $\sum_ik_i^*\delta_i=0$。于是

$$
\sum_ik_i^2=\sum_i(k_i^*+\delta_i)^2=\sum_i(k_i^*)^2+2\underbrace{\sum_ik_i^*\delta_i}_{=0}+\sum_i\delta_i^2\ \ge\ \sum_i(k_i^*)^2,
$$

即 $\operatorname{Var}(\tilde\theta)\ge\operatorname{Var}(\tilde\theta^*)$；等号成立当且仅当 $\sum\delta_i^2=0$，即 $\delta_i=0$ 对一切 $i$，此时 $\tilde\theta=\tilde\theta^*$。唯一性也得证。$\square$

**这个证明值得记住的三点**

- 最优性来自**正交分解**：任何无偏估计的系数 = 最优系数 + 与之正交的扰动，扰动只增加方差。
- "线性"是必需的限定。若允许有偏估计，$\operatorname{MSE}$ 可以更小（系统偏差换取方差下降），M4 的岭回归就是这条路。
- 证明**没有用到正态性**。正态性只在构造分布（§7）时才需要。

### 4.5 正态假设下的抽样分布

**定理 4.5（抽样分布）** 在 A1、A2、A3（$\epsilon_i$ iid $N(0,\sigma^2)$）下，

$$
\hat\beta_1\sim N\Big(\beta_1,\ \frac{\sigma^2}{S_{xx}}\Big),\qquad
\hat\beta_0\sim N\Big(\beta_0,\ \sigma^2\Big(\frac1n+\frac{\bar x^2}{S_{xx}}\Big)\Big), \tag{4.5}
$$

且二者**联合**正态，协方差由 (4.3) 的第三式给出。

**证明** $\hat\beta_1,\hat\beta_0$ 是独立正态变量 $y_1,\dots,y_n$ 的线性组合（(4.1)），由{{< tool "2.2" "正态线性组合" >}}知其边际分布为正态，均值方差由定理 4.2、4.3。联合正态性：把 $(\hat\beta_0,\hat\beta_1)'$ 写成 $A\mathbf y$（$2\times n$ 常数矩阵），由{{< tool "2.3" "多元正态的线性变换" >}}保持多元正态。$\square$

**等价的标准化形式**

$$
z=\frac{\hat\beta_1-\beta_1}{\sigma/\sqrt{S_{xx}}}\sim N(0,1),\qquad
z_0=\frac{\hat\beta_0-\beta_0}{\sigma\sqrt{1/n+\bar x^2/S_{xx}}}\sim N(0,1). \tag{4.6}
$$

这两个 $z$ 统计量**仍含未知的 $\sigma$**，不能直接用于检验；把 $\sigma$ 换成 $\hat\sigma$ 之后，自由度 $n-2$ 的 $t$ 分布才登场（§5、§7）。

### 4.6 有效性：OLS 是否"已经到头"

**命题 4.6** 正态误差下，$\hat\beta_1$ 的 Fisher 信息为 $I(\beta_1)=S_{xx}/\sigma^2$，故无偏估计的方差下界（{{< tool "3.5" "Cramér–Rao 下界" >}}）为 $\sigma^2/S_{xx}$，恰好等于 $\operatorname{Var}(\hat\beta_1)$。

**证明** 似然函数见 (15.1)；对数似然对 $\beta_1$ 的二阶导为 $-S_{xx}/\sigma^2$（与 $\mathbf y$ 无关），故 $I(\beta_1)=E[S_{xx}/\sigma^2]=S_{xx}/\sigma^2$。下界 $1/I=\sigma^2/S_{xx}$ 与 (4.3) 相等。$\square$

**结论的强度分级**（定义见附录 B.1）：

- 无偏性（定理 4.2）：**已证**，仅需 A1。
- 方差公式与协方差（定理 4.3）：**已证**，仅需 A1、A2。
- {{< tool "3.2" "BLUE" >}}（定理 4.4）：**已证**，仅需 A1、A2；限定"线性无偏类"。
- 有效性（命题 4.6）：**条件成立**，需 A3（正态）；在正态模型下 OLS 是全部无偏估计中的有效估计。
## §5 误差方差的估计与回归系数的标准误

§4 的所有方差公式都含 $\sigma^2$，而 $\sigma^2$ 在实际问题中未知。本节解决它，并给出做推断所需的一切数量。

### 5.1 从残差平方和到 $\hat\sigma^2$

**定义 5.1（残差平方和与误差方差估计）**

$$
RSS=\sum_{i=1}^ne_i^2=\sum_{i=1}^n\big(y_i-\hat\beta_0-\hat\beta_1x_i\big)^2,\qquad
\hat\sigma^2=MS_{\rm res}=\frac{RSS}{n-2},\qquad
\hat\sigma=\sqrt{\hat\sigma^2}. \tag{5.1}
$$

$\hat\sigma$ 称为**回归标准误**（standard error of regression）或**残差标准误**，软件输出中的 `Residual standard error` 即它。

**为什么分母是 $n-2$ 而不是 $n$** 三条互相印证的理由：

1. **自由度记账**：$RSS$ 是 $y_1,\dots,y_n$ 的离差平方和，但要先由数据估出 $\beta_0,\beta_1$ 两个参数；残差受两个线性约束 (3.3)(3.4) 的牵制，$n$ 个残差只有 $n-2$ 个"自由"方向。
2. **秩的论证**：$\mathbf e=M\boldsymbol\epsilon$，$M=I-H$ 对称幂等，$\operatorname{rank}(M)=n-\operatorname{rank}(H)=n-2$（{{< tool "4.2" "幂等矩阵的秩与迹" >}}）；二次型 $\mathbf e'\mathbf e$ 的自由度就是 $M$ 的秩。
3. **无偏性**：下面的定理 5.3 证明只有 $n-2$ 这个分母才能得到无偏。

### 5.2 无偏性

**引理 5.2（残差的一个恒等式）** 在 A1、A2 下，

$$
e_i=\big(\epsilon_i-\bar\epsilon\big)-\big(\hat\beta_1-\beta_1\big)(x_i-\bar x), \tag{5.2}
$$

$$
RSS=\sum_{i=1}^n(\epsilon_i-\bar\epsilon)^2-\frac{S_{x\epsilon}^2}{S_{xx}},\qquad
S_{x\epsilon}:=\sum_{i=1}^n(x_i-\bar x)\epsilon_i . \tag{5.3}
$$

**证明** $y_i-\hat y_i=(\beta_0+\beta_1x_i+\epsilon_i)-(\hat\beta_0+\hat\beta_1x_i)$。代入 $\hat\beta_0=\bar y-\hat\beta_1\bar x$：$e_i=\epsilon_i-(\bar y-\beta_0-\beta_1\bar x)-(\hat\beta_1-\beta_1)x_i$。注意 $\bar y=\beta_0+\beta_1\bar x+\bar\epsilon$，故 $\bar y-\beta_0-\beta_1\bar x=\bar\epsilon$，得 (5.2)。

(5.2) 两边平方求和：$\sum(\epsilon_i-\bar\epsilon)^2-2(\hat\beta_1-\beta_1)\sum(x_i-\bar x)(\epsilon_i-\bar\epsilon)+(\hat\beta_1-\beta_1)^2S_{xx}$。由 $\sum(x_i-\bar x)\bar\epsilon=0$，交叉项的求和为 $S_{x\epsilon}$；又 $\hat\beta_1-\beta_1=S_{x\epsilon}/S_{xx}$，故后两项为 $-2S_{x\epsilon}^2/S_{xx}+S_{x\epsilon}^2/S_{xx}=-S_{x\epsilon}^2/S_{xx}$。$\square$

**定理 5.3（$\hat\sigma^2$ 无偏）** 在 A1、A2 下，$E(RSS)=(n-2)\sigma^2$，从而 $E(\hat\sigma^2)=\sigma^2$。

**证明** 在 (5.3) 两边取期望。第一项：$\sum(\epsilon_i-\bar\epsilon)^2$ 是 $n$ 个同方差、不相关（故由{{< tool "1.4" "线性组合的方差公式" >}}）的量的离差平方和，其中 $\operatorname{Var}(\epsilon_i-\bar\epsilon)=\sigma^2(1-1/n)$，故

$$
E\sum_i(\epsilon_i-\bar\epsilon)^2=\sum_i\operatorname{Var}(\epsilon_i-\bar\epsilon)=(n-1)\sigma^2 .
$$

第二项：$S_{x\epsilon}=\sum(x_i-\bar x)\epsilon_i$ 是零均值、不相关的 $\epsilon_i$ 的线性组合，由 (4.2) 型的计算得 $\operatorname{Var}(S_{x\epsilon})=\sigma^2S_{xx}$，又 $E S_{x\epsilon}=0$，故 $E[S_{x\epsilon}^2]=\sigma^2S_{xx}$。

代入 (5.3)：$E(RSS)=(n-1)\sigma^2-\sigma^2S_{xx}/S_{xx}=(n-2)\sigma^2$。$\square$

### 5.3 分布与独立性

**定理 5.4** 在 A1、A2、A3（正态）下，

$$
\frac{RSS}{\sigma^2}\sim\chi^2_{n-2}, \tag{5.4}
$$

且 $RSS$（等价地 $\hat\sigma^2$）与 $(\hat\beta_0,\hat\beta_1)$ **相互独立**。

**证明** 用 §3.4 的投影语言记 $\hat{\mathbf y}=H\mathbf y$、$\mathbf e=(I-H)\mathbf y$。

*独立性与分布*：$\operatorname{Cov}(\hat{\mathbf y},\mathbf e)=\operatorname{Cov}(H\mathbf y,(I-H)\mathbf y)=H\operatorname{Var}(\mathbf y)(I-H)'=\sigma^2H(I-H)=0$。又 $(\hat{\mathbf y}',\mathbf e')'$ 是 $\mathbf y$ 的线性变换，由{{< tool "2.3" "多元正态的线性变换" >}}联合正态，"协方差为零 $\Rightarrow$ 独立"。于是 $\mathbf e$ 与 $\hat{\mathbf y}$ 独立，而 $(\hat\beta_0,\hat\beta_1)$ 是 $\hat{\mathbf y}$ 的线性函数（取 $\hat{\mathbf y}$ 的前两个投影方向的坐标），故与 $\mathbf e$ 独立，进而与 $RSS=\|\mathbf e\|^2$ 独立。

*分布*：$\mathbf e=(I-H)\mathbf y=(I-H)(\mathbf X\boldsymbol\beta+\boldsymbol\epsilon)=(I-H)\boldsymbol\epsilon$（因 $(I-H)\mathbf X=0$），故 $\mathbf e/\sigma\sim N_n(\mathbf 0,I-H)$。矩阵 $M=I-H$ 对称幂等、秩 $n-2$，由{{< tool "2.4" "幂等二次型的分布" >}}得 $\|\mathbf e\|^2/\sigma^2\sim\chi^2_{n-2}$，即 (5.4)。$\square$

**这个定理是全部推断的支柱**：它同时提供了 $t$ 统计量的分母（$\chi^2$ 分布）与分子分母的独立性（{{< tool "2.5" "t 分布与 F 分布的构造" >}}前提）。

### 5.4 标准误

**定义 5.5（估计标准误）** 把定理 4.3 的方差公式中的 $\sigma^2$ 换成 $\hat\sigma^2$ 并开方，得到**参数估计的标准误**：

$$
\operatorname{se}(\hat\beta_1)=\sqrt{\widehat{\operatorname{Var}}(\hat\beta_1)}=\frac{\hat\sigma}{\sqrt{S_{xx}}},\qquad
\operatorname{se}(\hat\beta_0)=\hat\sigma\sqrt{\frac1n+\frac{\bar x^2}{S_{xx}}}. \tag{5.5}
$$

记号说明：$\widehat{\operatorname{Var}}(\cdot)$ 表示"用估计量代替未知参数后得到的方差估计"，即 $\widehat{\operatorname{Var}}(\hat\beta_1)=\hat\sigma^2/S_{xx}$。由{{< tool "3.1" "均方误差分解" >}}，$\widehat{\operatorname{MSE}}=\widehat{\operatorname{Var}}+\widehat{\text{bias}^2}$，而估计量无偏时偏差项为零，故标准误就是 RMSE 的平方根。

**注意** $\operatorname{se}(\hat\beta_1)$ **是随机变量**（含 $\hat\sigma$），$\sqrt{\operatorname{Var}(\hat\beta_1)}=\sigma/\sqrt{S_{xx}}$ 才是常数。软件的 `Std. Error` 列报告的是前者。

### 5.5 数值例（续例 2.1）

$$
RSS=166254.9,\quad \hat\sigma^2=\frac{166254.9}{18}=9236.4,\quad \hat\sigma=96.106,
$$

$$
\operatorname{se}(\hat\beta_1)=\frac{96.106}{\sqrt{1106.559}}=2.889,\qquad
\operatorname{se}(\hat\beta_0)=96.106\times\sqrt{\frac1{20}+\frac{13.3625^2}{1106.559}}=44.184 .
$$



### 5.6 $\hat\sigma^2$ 的脆弱性

$\hat\sigma^2$ 完全由残差构造，因此**对 A1–A3 的任何偏离都敏感**：

- 若真实关系是曲线而拟合了直线，残差里混入系统性成分，$\hat\sigma^2$ 被高估；
- 若存在离群点，$RSS$ 被平方放大，$\hat\sigma$ 与全部标准误被抬高，检验失去功效；
- 若存在异方差，$\hat\sigma^2$ 只是"平均意义上的"方差，$\operatorname{se}(\hat\beta_1)$ 不再是 $\operatorname{Var}(\hat\beta_1)$ 的正确估计（M3 §5）。

因此**看到 $\hat\sigma$ 异常大或异常小时，第一反应应是回去查模型形式与数据异常，而不是继续做检验**。

---

## §6 模型的中心化形式

### 6.1 重参数化

对给定的数据，把 (2.2) 改写（不加任何新假设）：

$$
y_i=\beta_0'+\beta_1(x_i-\bar x)+\epsilon_i,\qquad \beta_0'=\beta_0+\beta_1\bar x . \tag{6.1}
$$

这等价于对"中心化后"的数据 $(x_i-\bar x,\ y_i)$ 拟合回归。记该模型的估计量为 $\hat\beta_0'$。

### 6.2 三条结论

**定理 6.1** 在中心化形式 (6.1) 下：

$$
\hat\beta_1=\frac{S_{xy}}{S_{xx}}\ (\text{与未中心化时相同}),\qquad \hat\beta_0'=\bar y, \tag{6.2}
$$

$$
\operatorname{Var}(\hat\beta_0')=\frac{\sigma^2}{n},\qquad \operatorname{Cov}(\hat\beta_0',\hat\beta_1)=0 . \tag{6.3}
$$

**证明** 中心化后 $\bar{x'}=0$，代入 (3.2) 得 $\hat\beta_0'=\bar y-\hat\beta_1\bar{x'}=\bar y$，斜率公式 $S_{x'y}/S_{x'x'}=S_{xy}/S_{xx}$ 不变。方差与协方差由 (4.3) 取 $\bar{x'}=0$ 即得。$\square$

**推论 6.2** $\operatorname{Cov}(\bar y,\hat\beta_1)=\sigma^2\sum_i\frac1nc_i=\frac{\sigma^2}{n}\sum_ic_i=0$（用 (4.2)），即**响应均值与斜率估计不相关**。在正态假设下二者独立。

### 6.3 为什么中心化如此有用

1. **截距的方差最小化**：$\operatorname{Var}(\hat\beta_0)\ge\operatorname{Var}(\hat\beta_0')=\sigma^2/n$，且当 $\bar x=0$ 时取等号。把原点搬到数据中心，截距就从"离数据最远的点的外推"变成"数据中心处的内插"。
2. **预测式的可读形式**：

$$
\hat y=\bar y+\hat\beta_1(x-\bar x). \tag{6.4}
$$

预测值 = 样本均值 + 斜率 × 偏离均值的距离。这把"回归"讲成了最直白的一句话。
3. **参数估计不再互相纠缠**：$\operatorname{Cov}(\hat\beta_0',\hat\beta_1)=0$ 意味着截距与斜率的信息互不干扰（软件中表现为两个估计的相关系数为零），在 M4 讨论共线性时会看到这一点的推广。
4. **预警外推**：由 (6.4)，$\hat y$ 的可靠性依赖 $(x-\bar x)$。**模型的有效范围以 $\bar x$ 为中心**，这是 §9 置信带形状的直接解释。

**注 6.3（中心化不改变斜率估计的方差）** $\operatorname{Var}(\hat\beta_1)=\sigma^2/S_{xx}$ 与原点位置无关。中心化改善的是截距与二者的协方差，**不改变斜率的精度**——这一点常被误解。
