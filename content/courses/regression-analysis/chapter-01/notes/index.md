---
# 学习笔记（课程章下的 leaf bundle）：scripts/new-content.sh notes，
# 或 chapter 子命令的 --materials notes 生成。
# 不要在这里写 tags / categories —— 课程标签由课程主页 _index.md 的 cascade 下发，
# 而 cascade 只填空：本页一旦自己写了 tags，就会整体丢掉继承来的课程标签。
title: "学习笔记（一）"
weight: 1
icon: "📖"
date: 2026-09-15
draft: false
description: "§1–§3：为什么需要简单线性回归（四类问题、相关与回归、建模流程）、模型设定与假设分层、最小二乘估计（存在唯一性、计算式、几何解释、例 2.1）。"
# summary 必须写：列表卡片摘要走 `.Summary | plainify`，正文公式已渲染成 HTML+MathML，会被拼成乱码
summary: "§1–§3：为什么需要简单线性回归（四类问题、相关与回归、建模流程）、模型设定与假设分层、最小二乘估计（存在唯一性、计算式、几何解释、例 2.1）。"
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