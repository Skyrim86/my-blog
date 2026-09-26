---
# 2026-09-26 按 § 拆页分出（docs/pending.md「M1 三页拆页」）：切点与去向见 description。
# 学习笔记（课程章下的 leaf bundle）：scripts/new-content.sh notes，
# 或 chapter 子命令的 --materials notes 生成。
# 不要在这里写 tags / categories —— 课程标签由课程主页 _index.md 的 cascade 下发，
# 而 cascade 只填空：本页一旦自己写了 tags，就会整体丢掉继承来的课程标签。
title: "学习笔记（二）"
weight: 2
icon: "📖"
date: 2026-09-15
draft: false
description: "§4–§6：估计量的性质（线性性、无偏性、方差协方差、Gauss–Markov、抽样分布、有效性）、误差方差估计与回归系数的标准误、模型的中心化形式。"
# summary 必须写：列表卡片摘要走 `.Summary | plainify`，正文公式已渲染成 HTML+MathML，会被拼成乱码
summary: "§4–§6：估计量的性质（线性性、无偏性、方差协方差、Gauss–Markov、抽样分布、有效性）、误差方差估计与回归系数的标准误、模型的中心化形式。"
---

## §4 最小二乘估计量的性质

本节把 §3 的代数解升级为统计结论：先看"估计量是 $y$ 的线性函数"这一结构，再依次给出无偏性、方差、协方差，最后给出最优性（Gauss–Markov）。这些结论**只用 A1、A2**，不需要正态。

### 4.1 线性性

**引理 4.1（系数表示与正交性）** 记 $c_i=\dfrac{x_i-\bar x}{S_{xx}}$，$d_i=\dfrac1n-\bar xc_i$，则

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

**命题 4.6（{{< tool "3.5" "Cramér–Rao 下界" >}}可达）** 正态误差下，$\hat\beta_1$ 的 Fisher 信息为 $I(\beta_1)=S_{xx}/\sigma^2$，故无偏估计的方差下界（{{< tool "3.5" "Cramér–Rao 下界" >}}）为 $\sigma^2/S_{xx}$，恰好等于 $\operatorname{Var}(\hat\beta_1)$。

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

**定理 5.4（残差平方和的分布与独立性）** 在 A1、A2、A3（正态）下，

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

**定理 6.1（中心化后的截距与协方差）** 在中心化形式 (6.1) 下：

$$
\hat\beta_1=\frac{S_{xy}}{S_{xx}}\ (\text{与未中心化时相同}),\qquad \hat\beta_0'=\bar y, \tag{6.2}
$$

$$
\operatorname{Var}(\hat\beta_0')=\frac{\sigma^2}{n},\qquad \operatorname{Cov}(\hat\beta_0',\hat\beta_1)=0 . \tag{6.3}
$$

**证明** 中心化后 $\bar{x'}=0$，代入 (3.2) 得 $\hat\beta_0'=\bar y-\hat\beta_1\bar{x'}=\bar y$，斜率公式 $S_{x'y}/S_{x'x'}=S_{xy}/S_{xx}$ 不变。方差与协方差由 (4.3) 取 $\bar{x'}=0$ 即得。$\square$

**推论 6.2（均值与斜率估计不相关）** $\operatorname{Cov}(\bar y,\hat\beta_1)=\sigma^2\sum_i\frac1nc_i=\frac{\sigma^2}{n}\sum_ic_i=0$（用 (4.2)），即**响应均值与斜率估计不相关**。在正态假设下二者独立。

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
