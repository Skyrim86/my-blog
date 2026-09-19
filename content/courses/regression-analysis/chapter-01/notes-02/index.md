---
# 学习笔记（课程章下的 leaf bundle）：scripts/new-content.sh notes，
# 或 chapter 子命令的 --materials notes 生成。
# 不要在这里写 tags / categories —— 课程标签由课程主页 _index.md 的 cascade 下发，
# 而 cascade 只填空：本页一旦自己写了 tags，就会整体丢掉继承来的课程标签。
title: "学习笔记（中）"
weight: 2
icon: "📖"
date: 2026-09-15
draft: false
description: "§7–§11：系数与均值的假设检验、方差分析与 F 检验、区间估计与置信带、新观测的预测、决定系数。"
# summary 必须写：列表卡片摘要走 `.Summary | plainify`，正文公式已渲染成 HTML+MathML，会被拼成乱码
summary: "§7–§11：系数与均值的假设检验、方差分析与 F 检验、区间估计与置信带、新观测的预测、决定系数。"
---

## §7 回归系数的假设检验

§4 给了估计量与分布，§5 补上了 $\sigma$ 的估计。本节把它们组装成**检验程序**：给定 $H_0:\beta_1=\beta_{10}$，用数据判断是否有足够证据拒绝它。

### 7.1 从解释到检验

模型估计出来后的自然问题是"$x$ 与 $y$ 有关吗"。教科书式的提问是 $H_0:\beta_1=0\leftrightarrow H_1:\beta_1\ne0$，但一般形式为

$$
H_0:\beta_1=\beta_{10}\ \longleftrightarrow\ H_1:\beta_1\ne\beta_{10}\ (\text{或 }>\beta_{10},\ \text{或 }<\beta_{10}). \tag{7.1}
$$

$\beta_{10}$ 可以是有实际含义的常数，例如：

- **需求弹性**：$\ln Q=\beta_0+\beta_1\ln P+\epsilon$ 中 $\beta_1$ 是价格弹性；验证"是否富有弹性"即 $H_0:\beta_1=-1$ 对 $H_1:\beta_1<-1$。
- **传热与工艺标准**：管理方声称"环境温度每升高 1 度，月均蒸汽消耗增加 10 千磅"，即 $H_0:\beta_1=10$ 对 $H_1:\beta_1\ne10$。

### 7.2 检验的构造逻辑

**直观思路**：$\hat\beta_1$ 落在 $\beta_{10}$ 附近的某邻域内则不能否定 $H_0$。取拒绝域

$$
|\hat\beta_1-\beta_{10}|>c, \tag{7.2}
$$

临界值 $c$ 由第一类错误控制确定：

$$
P\big(|\hat\beta_1-\beta_{10}|>c\ \big|\ H_0\big)\le\alpha . \tag{7.3}
$$

$H_0$ 下 $\hat\beta_1\sim N\big(\beta_{10},\sigma^2/S_{xx}\big)$，于是 $c$ 必须是该正态分布的 $1-\alpha$ 分位点倍数。**问题是 $\sigma$ 未知**，只能先做两步替换。

**第一步：$\sigma$ 已知的理想情形（$z$ 检验）** 由 (4.6)，

$$
P\Big\{\Big|\frac{\hat\beta_1-\beta_{10}}{\sigma/\sqrt{S_{xx}}}\Big|>z_{\alpha/2}\Big\}=\alpha, \tag{7.4}
$$

故 $c=z_{\alpha/2}\sigma/\sqrt{S_{xx}}$，检验统计量

$$
z_0=\frac{\hat\beta_1-\beta_{10}}{\sigma/\sqrt{S_{xx}}},\qquad |z_0|>z_{\alpha/2}\ \text{时拒绝 } H_0. \tag{7.5}
$$

注意 $z_{\alpha/2}$ 的定义：$P(N(0,1)>z_{\alpha/2})=\alpha/2$（即标准正态的上的 $\alpha/2$ 分位点）。

**第二步：$\sigma$ 未知（$t$ 检验）** 把 $\sigma$ 换成 $\hat\sigma$ 会引入额外随机性，不能再查正态表。由定理 5.4，$\dfrac{RSS}{\sigma^2}\sim\chi^2_{n-2}$ 且与 $\hat\beta_1$ 独立。把 $z_0$ 拆成"标准正态 ÷ 独立卡方开方"的结构：

$$
t_0=\frac{\hat\beta_1-\beta_{10}}{\operatorname{se}(\hat\beta_1)}
=\frac{\hat\beta_1-\beta_{10}}{\hat\sigma/\sqrt{S_{xx}}}
=\underbrace{\frac{\hat\beta_1-\beta_{10}}{\sigma/\sqrt{S_{xx}}}}_{=z_0}\bigg/\underbrace{\sqrt{\frac{\hat\sigma^2}{\sigma^2}}}_{=\sqrt{\chi^2_{n-2}/(n-2)}}, \tag{7.6}
$$

其中分子是 $N(0,1)$、分母来自独立于分子的 $\chi^2_{n-2}$，故由 {{< tool "2.5" "t 分布与 F 分布的构造" >}}

$$
t_0\sim t_{n-2}\quad(\text{在 } H_0 \text{ 下}). \tag{7.7}
$$

### 7.3 拒绝域（三种备择假设）

**定理 7.1（三种备择假设的拒绝域）** 检验 $H_0:\beta_1=\beta_{10}$，显著性水平 $\alpha$，统计量 $t_0$ 由 (7.6) 给出。则

| 备择假设 | 拒绝域 | 依据 |
|---|---|---|
| $H_1:\beta_1\ne\beta_{10}$（双边） | $\lvert t_0\rvert>t_{\alpha/2}(n-2)$ | $t$ 分布对称，两侧各 $\alpha/2$ |
| $H_1:\beta_1>\beta_{10}$（上单边） | $t_0>t_{\alpha}(n-2)$ | 右侧 $\alpha$ |
| $H_1:\beta_1<\beta_{10}$（下单边） | $t_0<-t_{\alpha}(n-2)$ | 左侧 $\alpha$ |

其中 $t_\alpha(\nu)$ 表示 $P\big(t_\nu>t_\alpha(\nu)\big)=\alpha$ 的分位点；由对称性 $t_{\alpha/2}(\nu)$ 也是双侧 $1-\alpha$ 置信区间的倍数。

**注 7.2（为什么单边用 $\alpha$ 而不是 $\alpha/2$）** 单边检验把全部 $\alpha$ 的错误概率放在**一个方向**上，因此临界值更宽松。这不是技巧，而是"我们只关心某一侧的偏离"这一先验信息的合法利用——前提是**在看完数据之前**就已确定方向。事后根据 $\hat\beta_1$ 的符号挑方向，实际水平会膨胀到约 $2\alpha$。

**注 7.3（$\hat\beta_0$ 的检验）** 完全平行：$t_0=\big(\hat\beta_0-\beta_{00}\big)/\operatorname{se}(\hat\beta_0)\sim t_{n-2}$ 在 $H_0:\beta_0=\beta_{00}$ 下成立。一般线性组合 $a\beta_0+b\beta_1$ 的检验同理，方差由 (4.3) 组合得到。

### 7.4 显著性检验与其四种解读

**定义 7.4（显著性检验）** $\beta_{10}=0$ 时的双边检验 $H_0:\beta_1=0\leftrightarrow H_1:\beta_1\ne0$ 称**显著性检验**，此时

$$
t_0=\frac{\hat\beta_1}{\operatorname{se}(\hat\beta_1)}, \tag{7.8}
$$

称参数的 **$t$ 比**（参数估计除以其标准误）。$\alpha=0.05$ 时双侧临界值约 $2.10$（$n-2=18$）或 $1.96$（大样本）。

**结论不能简单读作"有关系/没关系"**，四种情形必须分开：

| 数据结论 | 可能的真实情况 | 下一步该做什么 |
|---|---|---|
| 不能拒绝 $H_0$ | $x$ 对 $y$ 的均值无线性贡献 | 检查是否漏了变量、是否该变换 |
| 不能拒绝 $H_0$ | 真实关系非线性（如 U 形），线性斜率恰为 $0$ | **画散点图与残差图**，别只看 $t$ 比 |
| 拒绝 $H_0$ | 线性模型充分 | 进入区间估计、预测 |
| 拒绝 $H_0$ | 存在更高阶曲率，线性项只是近似 | 残差诊断（M3）、加多项式项（M5） |

**关键**：$t$ 检验只回答"线性项的系数是否为零"，它对**模型形式是否恰当**完全沉默。这一点与 §11 的 $R^2$ 误解是同一类错误的两个面。

### 7.5 $p$ 值

**定义 7.5（p 值）** 设检验统计量取值为 $t_{\rm obs}$，则

$$
p=P\big(|t_{n-2}|>|t_{\rm obs}|\big)\quad(\text{双边}),\qquad p=P\big(t_{n-2}>t_{\rm obs}\big)\ \text{或}\ P\big(t_{n-2}<t_{\rm obs}\big)\quad(\text{单边}). \tag{7.9}
$$

**命题 7.6（p 值与拒绝域的等价）** $p<\alpha\iff$ 在水平 $\alpha$ 下拒绝 $H_0$。

**证明** 双边情形：$p<\alpha\iff P(|t_{n-2}|>|t_{\rm obs}|)<\alpha\iff |t_{\rm obs}|>t_{\alpha/2}(n-2)$，末式即拒绝域（$t$ 分布连续、分位点单调）。单边情形同理。$\square$

**性质 7.7（p 值的性质）** $p$ 值是"能拒绝 $H_0$ 的最小显著性水平"，因此**越小证据越强**；任何水平下的决策都可以只由 $p$ 作出，不必重新查表。单边检验的 $p$ 值是相应双边 $p$ 值的一半（$t$ 分布对称）。

**不要做的事**：把 $p$ 值当作"$H_0$ 为真的概率"，或用 $p=0.049$ 与 $p=0.051$ 区分"显著"与"不显著"。$p$ 值是**在 $H_0$ 下观测到如此极端或更极端结果的概率**，是数据与假设之间的度量，不含 $H_0$ 的先验概率。

样本量足够大时，任何微小的真实斜率都会送来一个极小的 $p$ 值。$p$ 小只说明"这个斜率不大可能是 0"，不说明它大到值得关心——这两件事经常被混为一谈。

### 7.6 检验与置信区间的等价性

**命题 7.8（检验与置信区间的对偶）** 在水平 $\alpha$ 下，双边检验 $H_0:\beta_1=\beta_{10}$ 不拒绝，当且仅当 $\beta_1$ 的 $1-\alpha$ **置信区间**（式 (9.3)）包含 $\beta_{10}$。

**证明** 不拒绝 $\iff|\hat\beta_1-\beta_{10}|\le t_{\alpha/2}(n-2)\operatorname{se}(\hat\beta_1)\iff\beta_{10}\in\big[\hat\beta_1\pm t_{\alpha/2}\operatorname{se}(\hat\beta_1)\big]$，即 $\beta_{10}$ 落在式 (9.3) 给出的区间内。$\square$

**实用推论**：软件只给置信区间就够做检验，反之亦然。这也是"参数显著 $\iff$ 其置信区间不含零点"这句话的出处。

### 7.7 例（续例 2.1）

由 §5.5，$\hat\beta_1=-37.154$，$\operatorname{se}(\hat\beta_1)=2.889$，$n-2=18$，$t_{0.025}(18)=2.101$。

$$
t_0=\frac{-37.154}{2.889}=-12.860,\qquad \lvert t_0\rvert=12.860>2.101\ \Rightarrow\ \text{拒绝 } H_0:\beta_1=0 .
$$

$$
p=2P\{t_{18}>12.860\}=1.643\times10^{-10}.
$$

结论：推进剂年龄对剪切强度有显著影响（在 $0.1,0.05,0.01$ 各水平下都拒绝）。输出中的 `t value -12.86`、`Pr(>|t|) 1.64e-10` 与此一致。

---

## §8 方差分析与 $F$ 检验

同一假设 $H_0:\beta_1=0$ 可以用**变异分解**的方式检验。两条路线在含截距的简单线性回归中完全等价（$F_0=t_0^2$），但方差分析的框架可以推广到多元与一般线性假设（M2），因此必须掌握。

### 8.1 总变异的分解

**定理 8.1（平方和分解）** 对含截距的最小二乘拟合，

$$
\underbrace{\sum_{i=1}^n(y_i-\bar y)^2}_{SS_{\rm T}}
=\underbrace{\sum_{i=1}^n(y_i-\hat y_i)^2}_{SS_{\rm res}}
+\underbrace{\sum_{i=1}^n(\hat y_i-\bar y)^2}_{SS_{\rm reg}} . \tag{8.1}
$$

**证明** 从恒等式 $y_i-\bar y=(y_i-\hat y_i)+(\hat y_i-\bar y)$ 出发，两边平方求和，交叉项为

$$
2\sum_{i=1}^ne_i(\hat y_i-\bar y)=2\Big(\underbrace{\sum_ie_i\hat y_i}_{=0}-\bar y\underbrace{\sum_ie_i}_{=0}\Big)=0,
$$

两处均为零由推论 3.4 的性质 3 与性质 1。$\square$

**几何读法**：$\{\mathbf 1\}$ 与 $\{\mathbf 1,\mathbf x\}$ 是两个嵌套子空间，$\mathbf y-\bar y\mathbf 1$ 是 $\mathbf y$ 在 $\mathbf 1$ 正交补上的投影，它被正交分解为"落在 $\mathbf x$ 方向上的部分" $(\hat{\mathbf y}-\bar y\mathbf 1)$ 与"残差部分" $\mathbf e$，即勾股定理。

**注 8.2（分解式依赖截距）** 分解式用的关键一步是 $\sum e_i=0$，它只在模型含截距时成立（注 3.5）。过原点回归中 (8.1) 不成立，这是 §14 决定系数必须重新定义的根源。

### 8.2 三个平方和的显式表达

**引理 8.3（回归平方和的分解）** 含截距时

$$
SS_{\rm reg}=\hat\beta_1S_{xy}=\hat\beta_1^2S_{xx}=\frac{S_{xy}^2}{S_{xx}} . \tag{8.2}
$$

**证明** 由 $\bar y=\hat\beta_0+\hat\beta_1\bar x$，

$$
SS_{\rm reg}=\sum_i\big(\hat\beta_0+\hat\beta_1x_i-\bar y\big)^2=\hat\beta_1^2\sum_i(x_i-\bar x)^2=\hat\beta_1^2S_{xx},
$$

再代入 (3.2) 的 $\hat\beta_1=S_{xy}/S_{xx}$ 得其余两式。$\square$

### 8.3 自由度与分布

**命题 8.4（自由度分解）** $df_{\rm T}=n-1$，$df_{\rm res}=n-2$，$df_{\rm reg}=1$，且 $df_{\rm T}=df_{\rm res}+df_{\rm reg}$。

**证明** $SS_{\rm T}$ 围绕样本均值有 $n-1$ 个自由方向；$SS_{\rm res}$ 的自由度为 $\operatorname{rank}(I-H)=n-2$（定理 5.4）；$SS_{\rm reg}$ 只依赖一个参数 $\hat\beta_1$。三者满足 $n-1=(n-2)+1$。$\square$

**定理 8.5（分布）** 在 A1–A3 下，

$$
\frac{SS_{\rm T}}{\sigma^2}\sim\chi^2_{n-1},\qquad
\frac{SS_{\rm res}}{\sigma^2}\sim\chi^2_{n-2},\qquad
\frac{SS_{\rm reg}}{\sigma^2}\sim\chi^2_{1}(\lambda),\quad \lambda=\frac{\beta_1^2S_{xx}}{\sigma^2},
$$

其中 $SS_{\rm reg}$ 的分布是**非中心**卡方，非中心参数 $\lambda$；当 $\beta_1=0$ 时退化为中心 $\chi^2_1$。且
$$
\frac{SS_{\rm res}}{\sigma^2}\ \text{与}\ \frac{SS_{\rm reg}}{\sigma^2}\ \text{独立}.
$$

**证明** $SS_{\rm T}/\sigma^2\sim\chi^2_{n-1}$ 是 {{< tool "2.6" "Fisher 引理" >}}的结论（取 $\mu=0$ 的 $n$ 个观测的离差）。$SS_{\rm res}/\sigma^2\sim\chi^2_{n-2}$ 与独立性是定理 5.4。

对 $SS_{\rm reg}$：由 (8.2)，$SS_{\rm reg}=\hat\beta_1^2S_{xx}$，而 $\hat\beta_1\sim N(\beta_1,\sigma^2/S_{xx})$，故 $\hat\beta_1\sqrt{S_{xx}}/\sigma\sim N(\beta_1\sqrt{S_{xx}}/\sigma,1)$，其平方服从非中心 $\chi^2_1$，非中心参数为均值平方 $\beta_1^2S_{xx}/\sigma^2$（{{< tool "2.7" "非中心卡方" >}}的定义）。$SS_{\rm reg}$ 是 $\hat{\mathbf y}$ 的函数、$SS_{\rm res}$ 是 $\mathbf e$ 的函数，二者独立已由定理 5.4 的证明给出。$\square$

### 8.4 $F$ 统计量与 $F$ 检验

**定义 8.6（均方）** $MS_{\rm reg}=\dfrac{SS_{\rm reg}}{df_{\rm reg}}$，$MS_{\rm res}=\dfrac{SS_{\rm res}}{df_{\rm res}}$。

**定理 8.7（$F$ 检验）** 检验 $H_0:\beta_1=0$，统计量

$$
F_0=\frac{MS_{\rm reg}}{MS_{\rm res}}=\frac{SS_{\rm reg}/1}{SS_{\rm res}/(n-2)} . \tag{8.3}
$$

在 $H_0$ 下 $F_0\sim F_{1,n-2}$，拒绝域为 $F_0>F_{\alpha,1,n-2}$。

**证明** 在 $H_0$ 下由定理 8.5 得 $SS_{\rm reg}/\sigma^2\sim\chi^2_1$、$SS_{\rm res}/\sigma^2\sim\chi^2_{n-2}$ 且相互独立，代入 {{< tool "2.5" "t 分布与 F 分布的构造" >}}：

$$
F_0=\frac{(SS_{\rm reg}/\sigma^2)/1}{(SS_{\rm res}/\sigma^2)/(n-2)}\sim F_{1,n-2}.\ \square
$$

**命题 8.8（与 $t$ 检验的等价性）** 在含截距的简单线性回归中 $F_0=t_0^2$，其中 $t_0$ 为显著性检验 (7.8) 的统计量；故两者的 $p$ 值相等，结论一致。

**证明** $t_0^2=\dfrac{\hat\beta_1^2}{\operatorname{se}^2(\hat\beta_1)}=\dfrac{\hat\beta_1^2S_{xx}}{\hat\sigma^2}=\dfrac{SS_{\rm reg}}{MS_{\rm res}}=F_0$（用 (8.2) 与 (5.5)）。$\square$

### 8.5 期望均方：检验方向的依据

**定理 8.9（均方的期望与检验方向）** 在 A1、A2 下，

$$
E\big(MS_{\rm res}\big)=\sigma^2,\qquad
E\big(MS_{\rm reg}\big)=\sigma^2+\beta_1^2S_{xx}=\sigma^2\Big(1+\frac{\lambda}{1}\Big). \tag{8.4}
$$

**证明** 第一式由定理 5.3。第二式：$E[SS_{\rm reg}]=E[\hat\beta_1^2S_{xx}]=S_{xx}\big(\operatorname{Var}(\hat\beta_1)+\beta_1^2\big)=S_{xx}\big(\sigma^2/S_{xx}+\beta_1^2\big)=\sigma^2+\beta_1^2S_{xx}$（用{{< tool "3.1" "均方误差分解" >}}，偏差为零）。$\square$

**为什么这个结论重要**：$MS_{\rm res}$ 的期望**与 $\beta_1$ 无关**，$MS_{\rm reg}$ 的期望只在 $\beta_1=0$ 时才等于 $\sigma^2$，否则多出 $\beta_1^2S_{xx}$。因此

- $F_0$ 在 $H_0$ 下取值在 $1$ 附近（分子分母同量纲）；
- $F_0$ 大 $\iff$ $MS_{\rm reg}$ 明显超出误差水平 $\iff$ $\beta_1\ne0$ 的旁证。

这就是"$F$ 检验是单侧拒绝"的原因：只有**偏大**的 $F_0$ 才是反对 $H_0$ 的证据。

### 8.6 方差分析表

| 变异来源 | 平方和 | 自由度 | 均方 | $F_0$ |
|---|---|---|---|---|
| 回归 | $SS_{\rm reg}=\hat\beta_1S_{xy}$ | $1$ | $MS_{\rm reg}$ | $MS_{\rm reg}/MS_{\rm res}$ |
| 残差 | $SS_{\rm res}=SS_{\rm T}-SS_{\rm reg}$ | $n-2$ | $MS_{\rm res}=\hat\sigma^2$ | |
| 总计 | $SS_{\rm T}=S_{yy}$ | $n-1$ | | |

### 8.7 例（续例 2.1）

$$
SS_{\rm T}=S_{yy}=1693738\ (=SS_{\rm reg}+SS_{\rm res}),\quad
SS_{\rm reg}=1527483,\quad SS_{\rm res}=166255,
$$

$$
MS_{\rm reg}=1527483,\qquad MS_{\rm res}=166255/18=9236.4,\qquad
F_0=\frac{1527483}{9236.4}=165.4 .
$$

$F_{0.05,1,18}=4.41$，$F_0$ 远超临界值，拒绝 $H_0:\beta_1=0$（与 §7.7 的 $t$ 检验同结论；核对 $t_0^2=(-12.860)^2=165.4$ $\checkmark$）。R 的 `anova(fit)` 输出与此一致。

### 8.8 本节要记住的三件事

1. $SS_{\rm T}=SS_{\rm res}+SS_{\rm reg}$ 是**代数的**（含截距时恒成立），$F_0$ 的分布是**统计的**（需 A1–A3）。
2. $F$ 检验与 $t$ 检验在简单线性回归中冗余；在多元回归中 $F$ 检验回答"整组变量是否有贡献"，$t$ 检验回答"单个系数是否为零"，二者不可互相替代（M2 §3.3）。
3. $E(MS_{\rm reg})=\sigma^2+\beta_1^2S_{xx}$ 里的 $\beta_1^2S_{xx}$ 是**非中心参数**的由来，也是 M4 讨论"检验功效与样本量/设计"的起点：$\lambda$ 越大，检验越容易发现问题。
## §9 区间估计

假设检验回答"能否否定某个值"，区间估计回答"参数可能在什么范围内"。二者的技术核心是同一个：找出一个**分布不依赖未知参数的枢轴量**（pivot）。§9 与 §10 的全部公式都由此推出。

### 9.1 区间估计的构造逻辑

**枢轴量法**：若统计量 $Q(\mathbf y;\theta)$ 的分布与 $\theta$ 无关，则可取

$$
P\big\{q_{1-\alpha/2}\le Q(\mathbf y;\theta)\le q_{\alpha/2}\big\}=1-\alpha, \tag{9.1}
$$

再对括号内的不等式**解出 $\theta$**，即得 $1-\alpha$ 置信区间。含截距回归中有三个现成的枢轴量：

$$
\frac{\hat\beta_i-\beta_i}{\operatorname{se}(\hat\beta_i)}\sim t_{n-2}\ (i=0,1),\qquad
\frac{(n-2)\hat\sigma^2}{\sigma^2}\sim\chi^2_{n-2},\qquad
\frac{\hat\mu_{y\mid x_0}-\mu_{y\mid x_0}}{\operatorname{se}(\hat\mu_{y\mid x_0})}\sim t_{n-2}. \tag{9.2}
$$

**置信区间不是"参数在区间内的概率为 $1-\alpha$"**。频率学派的正确读法：重复抽样会得到不同的区间，其中约 $100(1-\alpha)\%$ 覆盖真值；区间一旦算出，$\theta$ 与它是否相遇是确定的，概率陈述属于**程序**而非单次实现。这一条在 §16 与 M2 讨论随机设计时还会用到。

### 9.2 回归系数的置信区间

**定理 9.1（β 的置信区间）** 在 A1–A3 下，$\beta_i$（$i=0,1$）的 $1-\alpha$ 置信区间为

$$
\hat\beta_i\pm t_{\alpha/2}(n-2)\,\operatorname{se}(\hat\beta_i). \tag{9.3}
$$

**证明** 由 (9.2) 第一式与 (9.1) 的枢轴量法直接得到。$\square$

**命题 9.2（与检验的等价性）** $\beta_i$ 的 $1-\alpha$ 区间不包含 $\beta_{i0}$ $\iff$ 水平 $\alpha$ 下 $H_0:\beta_i=\beta_{i0}$ 被拒绝（即命题 7.8）。

**例 9.3（续例 2.1）** $\hat\beta_1=-37.154$，$\operatorname{se}(\hat\beta_1)=2.889$，$t_{0.025}(18)=2.101$：

$$
\beta_1\in-37.154\pm2.101\times2.889=[-43.22,\ -31.08].
$$

区间不包含 $0$，与 §7.7 的拒绝结论一致。区间长度约 $12.1$，含义是：推进剂年龄每增加 1 周，剪切强度的平均变化量介于 $-43.2$ 与 $-31.1$ psi 之间（置信度 95%）。

### 9.3 误差方差的置信区间

**定理 9.4（σ² 的置信区间）** 在 A1–A3 下，$\sigma^2$ 的 $1-\alpha$ 置信区间为

$$
\Big[\frac{(n-2)\hat\sigma^2}{\chi^2_{\alpha/2}(n-2)},\ \ \frac{(n-2)\hat\sigma^2}{\chi^2_{1-\alpha/2}(n-2)}\Big], \tag{9.4}
$$

其中记号约定：$\chi^2_p(\nu)$ 表示 $P\{\chi^2_\nu>\chi^2_p(\nu)\}=p$ 的**上分位点**，故 $\chi^2_{1-\alpha/2}<\chi^2_{\alpha/2}$，不等式方向在取倒数后翻转。

**证明** 由 $\dfrac{(n-2)\hat\sigma^2}{\sigma^2}\sim\chi^2_{n-2}$（定理 5.4），

$$
P\Big\{\chi^2_{1-\alpha/2}(n-2)<\frac{(n-2)\hat\sigma^2}{\sigma^2}<\chi^2_{\alpha/2}(n-2)\Big\}=1-\alpha,
$$

对 $\sigma^2$ 解不等式：$(n-2)\hat\sigma^2/\chi^2_{\alpha/2}<\sigma^2<(n-2)\hat\sigma^2/\chi^2_{1-\alpha/2}$。$\square$

**性质** 该区间**不对称**（右尾长），因为 $\chi^2$ 分布右偏；样本量小时区间很宽——$n=20$ 时 $\sigma^2$ 的 95% 区间跨度接近 $4$ 倍。这说明**用回归标准误 $\hat\sigma$ 作精度声明时，其自身的不确定性常常比研究者以为的大得多**。

**例 9.5（续例 2.1）** $(n-2)\hat\sigma^2=RSS=166254.9$，$\chi^2_{0.975}(18)=8.231$，$\chi^2_{0.025}(18)=31.526$：

$$
\sigma^2\in\Big[\frac{166254.9}{31.526},\ \frac{166254.9}{8.231}\Big]=[5273.5,\ 20199.2],
$$

即 $\sigma\in[72.6,\ 142.1]$。

### 9.4 均值响应的区间估计

**定义 9.6（均值响应的点估计）** 给定 $x=x_0$，$\mu_{y\mid x_0}=E(y\mid x_0)=\beta_0+\beta_1x_0$ 的**点估计**为

$$
\hat\mu_{y\mid x_0}=\hat\beta_0+\hat\beta_1x_0=\bar y+\hat\beta_1(x_0-\bar x) \tag{9.5}
$$

（第二个等号用了 (3.3)，即 (6.4)）。

**定理 9.7（均值响应的置信区间）** 在 A1–A3 下，$E(\hat\mu_{y\mid x_0})=\mu_{y\mid x_0}$，且

$$
\operatorname{Var}(\hat\mu_{y\mid x_0})=\sigma^2\Big[\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}\Big], \tag{9.6}
$$

$$
\frac{\hat\mu_{y\mid x_0}-\mu_{y\mid x_0}}{\hat\sigma\sqrt{\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}}\sim t_{n-2},\qquad
\mu_{y\mid x_0}\in\hat\mu_{y\mid x_0}\pm t_{\alpha/2}(n-2)\,\operatorname{se}(\hat\mu_{y\mid x_0}) . \tag{9.7}
$$

**证明** 无偏性：$E\hat\mu=\beta_0+\beta_1x_0$（定理 4.2）。方差：用中心化形式最省事。$\hat\mu=\bar y+\hat\beta_1(x_0-\bar x)$，而 $\operatorname{Cov}(\bar y,\hat\beta_1)=0$（推论 6.2），故由{{< tool "1.4" "线性组合的方差公式" >}}

$$
\operatorname{Var}(\hat\mu)=\operatorname{Var}(\bar y)+(x_0-\bar x)^2\operatorname{Var}(\hat\beta_1)=\frac{\sigma^2}{n}+(x_0-\bar x)^2\frac{\sigma^2}{S_{xx}},
$$

即 (9.6)。正态性：$\hat\mu$ 是 $y_i$ 的线性组合（{{< tool "2.2" "正态线性组合" >}}）。分布：把 (9.6) 中的 $\sigma$ 换成 $\hat\sigma$，同 (7.6) 的构造，用定理 5.4 的独立性与 {{< tool "2.5" "t 分布与 F 分布的构造" >}}得 $t_{n-2}$。$\square$

**注意两个方差的来源**：$1/n$ 项来自"$\bar y$ 的不确定性"，$(x_0-\bar x)^2/S_{xx}$ 项来自"斜率的不确定性被放大到距离 $x_0-\bar x$ 上"。

**例 9.8（续例 2.1）** 在 $x_0=\bar x=13.3625$ 处 $\hat\mu=\bar y=2131.358$，且

$$
\operatorname{se}(\hat\mu)=\frac{96.106}{\sqrt{20}}=21.49,\qquad
\mu\in2131.358\pm2.101\times21.49=[2086.2,\ 2176.5].
$$

注意在 $x_0=\bar x$ 处方差只剩 $\sigma^2/n$，**这是全部 $x_0$ 中最窄的点**。

### 9.5 置信带：形状与意义

令 $x_0$ 遍历取值范围内的所有值，把每点的置信区间首尾相连，得到**总体回归线的置信带**

$$
\hat\mu_{y\mid x}\pm t_{\alpha/2}(n-2)\,\hat\sigma\sqrt{\frac1n+\frac{(x-\bar x)^2}{S_{xx}}}. \tag{9.8}
$$

**三条性质**（几何上都由图看出，代数上由 (9.8) 看出）：

1. **最窄处在 $x=\bar x$**，宽度为 $2t_{\alpha/2}\hat\sigma/\sqrt n$；
2. **向两侧张开**，形状为以 $(\bar x,\bar y)$ 为中心的双曲线，宽度按 $(x-\bar x)^2$ 的平方根增长；
3. **在数据范围外侧急速变宽**——这解释了 §2.5 与 §13 反复强调的外推风险：**置信带的宽度就是外推代价的可视化**。

**注 9.9（逐点 vs 同时）** (9.8) 的覆盖概率 $1-\alpha$ 只对**单个预先指定的 $x$** 成立。若要"整条回归线同时被覆盖"的概率为 $1-\alpha$，需要**同时置信带**：

- **Bonferroni 法**：若要同时对 $m$ 个点作区间，每个点用水平 $\alpha/m$，则联合覆盖概率 $\ge1-\alpha$（由布尔不等式 $P(\cup A_j)\le\sum P(A_j)$）。简单、通用，代价是区间变宽。
- **Working–Hotelling 带**（补充内容）：整条回归线的同时置信带用 $\sqrt{2F_{\alpha,2,n-2}}$ 代替 $t_{\alpha/2}(n-2)$，对**所有** $x$ 同时成立。本模块不要求掌握其推导，只需知道存在这种"一条带罩住整条线"的方法。
- **Scheffé 法**（M2 的一般线性假设）：把同时性推广到任意线性组合，$\sqrt{2F_{\alpha,m,n-p}}$ 的形式。

**为什么必须区分**：先看数据再挑"最显著的那个 $x_0$"，报告的区间覆盖率不再是 $1-\alpha$。这是多重比较问题在回归里的第一个形态，M4 的变量选择会以更严重的面貌重现它。

---

## §10 新观测的预测

### 10.1 "估计均值"与"预测新值"是两件事

| | 估计均值 $\mu_{y\mid x_0}$ | 预测新观测 $y_0$ |
|---|---|---|
| 问题 | $x=x_0$ 时 $y$ 的**平均**是多少 | $x=x_0$ 时**某一个**新观测是多少 |
| 随机性来源 | 参数估计误差 | 参数估计误差 **+** 该观测自身的随机误差 |
| 点估计 | 都是 $\hat y_0=\hat\beta_0+\hat\beta_1x_0$ | 同左 |
| 区间宽度 | $\sigma^2\big[\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}\big]$ | $\sigma^2\big[1+\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}\big]$ |

**这条区分是回归应用中出错最多的地方之一**。业务场景说的"预测"通常指第二种（要覆盖个体波动），而不少报告给出的是第一种（只覆盖平均水平），于是区间被系统性低估。

### 10.2 预测误差及其方差

**定义 10.1（预测误差）** $\psi=y_0-\hat y_0$。

**定理 10.2（新观测预测的无偏性）** 在 A1–A3 下，且新观测 $y_0$ 与建模数据**独立**，

$$
E(\psi)=0,\qquad
\operatorname{Var}(\psi)=\sigma^2\Big[1+\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}\Big]. \tag{10.1}
$$

**证明** 写

$$
\psi=\underbrace{y_0-\mu_{y\mid x_0}}_{=\epsilon_0\ (\text{新误差})}-\underbrace{\big(\hat\mu_{y\mid x_0}-\mu_{y\mid x_0}\big)}_{\text{估计误差}},
$$

两项相互独立（$\hat\mu$ 只依赖旧数据，$\epsilon_0$ 来自新观测）。取期望：$E\psi=0-0=0$。取方差：由{{< tool "1.1" "期望与方差的运算法则" >}}与独立性

$$
\operatorname{Var}(\psi)=\operatorname{Var}(\epsilon_0)+\operatorname{Var}(\hat\mu_{y\mid x_0})=\sigma^2+\sigma^2\Big[\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}\Big].\ \square
$$

**问题**：$\epsilon_0$ 的分布未知，因此 $\psi$ 的正态性需要 A3 才能断言。在 A3 下 $\psi$ 是独立{{< tool "2.2" "正态变量的线性组合" >}}，$\psi\sim N(0,\operatorname{Var}\psi)$。

### 10.3 预测区间

**定理 10.3（预测区间）** 在 A1–A3 下，$y_0$ 的 $1-\alpha$ **预测区间**为

$$
\hat y_0\pm t_{\alpha/2}(n-2)\,\hat\sigma\sqrt{1+\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}. \tag{10.2}
$$

**证明** 由定理 10.2 与定理 5.4 的独立性，

$$
\frac{y_0-\hat y_0}{\sigma\sqrt{1+\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}}\sim N(0,1). \tag{10.3}
$$

把 $\sigma$ 换成 $\hat\sigma$：分母相对分子是独立的 $\sqrt{\chi^2_{n-2}/(n-2)}$（定理 5.4），由 {{< tool "2.5" "t 分布与 F 分布的构造" >}}得 $t_{n-2}$。按 (9.1) 解出 $y_0$ 即 (10.2)。$\square$

**命题 10.4（宽于置信区间，且随 $n$ 的收敛速度不同）**

$$
\sqrt{1+\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}\ \ge\ \sqrt{\frac1n+\frac{(x_0-\bar x)^2}{S_{xx}}}, \tag{10.4}
$$

即预测区间**总是**宽于同点的均值置信区间；且当 $n\to\infty$ 时前者趋于 $\sigma$、后者趋于 $0$。

**含义**：增加样本量能把"估计均值"的精度提到任意高，但**不能**把"预测个体"的误差降到 $\sigma$ 以下。个体波动是模型之外的、不可消除的部分——这是预测问题的根本限度。

**例 10.5（续例 2.1）** 预测推进剂年龄 $x_0=10$ 时的剪切强度：

$$
\hat y_0=2627.822-37.154\times10=2256.282,
$$

$$
\operatorname{se}_{\rm pred}=96.106\times\sqrt{1+\frac1{20}+\frac{(10-13.3625)^2}{1106.559}}
=96.106\times\sqrt{1.06022}=98.96,
$$

$$
y_0\in2256.282\pm2.101\times98.96=[2048.37,\ 2464.19].
$$


**对比**：同一点 $x_0=10$ 的均值置信区间为

$$
2256.282\pm2.101\times96.106\times\sqrt{\frac1{20}+\frac{11.31}{1106.559}}
=2256.282\pm2.101\times23.58=[2206.7,\ 2305.8],
$$

宽度约 $99$，而预测区间宽度约 $416$——**相差四倍多，全部来自"个体误差 $\epsilon_0$"这一项**。

### 10.4 预测带与应用纪律

令 $x_0$ 变化即得**预测带**，其性质与置信带平行：在 $\bar x$ 处最窄，向两侧张开，但**无论 $n$ 多大都不会收拢到零宽度**。

**应用上的三条纪律**：

1. **报告预测时必须说明是哪一种区间**（均值还是个体），否则无法判断其含义。
2. **不要在数据范围外作预测**，除非有独立的机理依据支持线性关系的延伸（§2.5、§13）。
3. **预测区间假定新观测与建模数据来自同一机制**。若预测期存在系统性变化（工艺调整、政策改变、人口结构变化），区间无效——这是"模型有效"与"预测有效"的分界。
## §11 决定系数

### 11.1 定义与解释

**定义 11.1（决定系数）** 含截距模型中

$$
R^2=\frac{SS_{\rm reg}}{SS_{\rm T}}=1-\frac{SS_{\rm res}}{SS_{\rm T}},\qquad
0\le R^2\le1. \tag{11.1}
$$

**含义**：$SS_{\rm T}$ 是 $y$ 相对其均值 $\bar y$ 的总变异，$SS_{\rm res}$ 是模型解释之后剩下的变异。两者之比即**被 $x$ 的线性关系解释掉的变异比例**。这一含义是唯一稳妥的解释，其余解读都要打折扣（§11.4）。

**例（续例 2.1）** $R^2=1527483/1693738=0.9018$：剪切强度变异的 $90.18\%$ 可以由推进剂年龄的线性关系解释。

### 11.2 $R^2$ 与样本相关系数的关系

**定理 11.2（R² 等于 r²）** 对简单线性回归，

$$
R^2=r^2,\qquad r=\frac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}. \tag{11.2}
$$

**证明** 由引理 8.3，$SS_{\rm reg}=\hat\beta_1^2S_{xx}=\Big(\dfrac{S_{xy}}{S_{xx}}\Big)^2S_{xx}=\dfrac{S_{xy}^2}{S_{xx}}$，故

$$
R^2=\frac{S_{xy}^2/S_{xx}}{S_{yy}}=\Big(\frac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}\Big)^2=r^2.\ \square
$$

**推论 11.3（R² 的取值范围）** $0\le R^2\le1$ 是 {{< tool "1.3" "Cauchy–Schwarz 不等式" >}} $|r|\le1$ 的直接后果；$R^2=1\iff$ 所有点共线。

**为什么这只是一元情形的巧合**：$R^2=r^2$ 依赖"只有一个回归量"，此时 $\pm r$ 恰好是标准化后的斜率。多元回归中 $R^2$ 与任一两变量相关系数都无此关系（M2 §3.5）。

### 11.3 调整决定系数

**定义 11.4（自由度与调整 R²）** 记模型参数个数为 $p$（简单线性回归 $p=2$），

$$
R^2_{\rm adj}=1-\frac{SS_{\rm res}/(n-p)}{SS_{\rm T}/(n-1)}
=1-\frac{n-1}{n-p}\big(1-R^2\big). \tag{11.3}
$$

**性质 11.5（调整 R² 的性质）**

1. $R^2_{\rm adj}\le R^2$，且 $R^2$ 明显小于 $1$ 时差距可观（例 2.1 中 $0.8964$ 对 $0.9018$）。
2. 加入新变量时 $R^2$ **必然**不减，而 $R^2_{\rm adj}$ 可能下降——这正是它存在的理由：它对"无贡献的变量"施加惩罚。
3. $R^2_{\rm adj}$ 也不是"越大越好"的通用判据，M4 会给出更严格的模型选择准则（$C_p$、AIC、PRESS、交叉验证）。

**例** 输出中 `Multiple R-squared: 0.9018, Adjusted R-squared: 0.8964`；$0.9018=1-\frac{18}{19}(1-R^2_{\rm adj})$ 可反推验证。

### 11.4 $R^2$ 的六条误用（本节是 M1 的核心纪律）

| 误解 | 反例／纠正 |
|---|---|
| $R^2$ 大 = 模型拟合好 | 只要 $x,y$ 都单调变化（哪怕毫无因果牵连），$R^2$ 也可以很大（§13.4 的伪回归例） |
| $R^2$ 大 = 模型充分 | 真实关系为曲线时（如 $y=x^2$ 在对称区间上）直线拟合也能有大 $R^2$，但残差有结构 |
| $R^2$ 小 = 模型无用 | §12.1 的医疗满意度案例，残差诊断无异常，对管理层仍有决策价值 |
| $R^2$ 大 = 预测准 | $R^2$ 只描述样本内变异分解；预测精度由预测区间宽度决定，且依赖模型形式在外推区是否成立 |
| $R^2$ 衡量斜率大小 | $R^2$ 对 $x$ 的单位与量纲不敏感（标准化后不变），斜率则完全依赖单位 |
| 用 $R^2$ 比较不同模型 | 加变量必然增大 $R^2$；过原点与含截距模型的 $R^2$ 定义不同（§14.4）、不可比 |

**唯一的稳妥表述**：$R^2$ 表示"$y$ 的**样本**变异中被 $x$ 的**线性**关系解释的比例"。超出这句话的解释都需要额外假设。

$R^2$ 是对这一组样本的描述，不是模型优劣的判据。指望它替你做模型判断，等于把决定权交给一个不知道你研究目的的数。

### 11.5 $R^2=1$ 何时不可能

**命题 11.6（重复观测下 R² 严格小于 1）** 若数据在同一 $x$ 值处有**不同**的 $y$ 观测（重复观测且响应不同），则 $R^2<1$。

**证明** 此时存在 $i,j$ 使 $x_i=x_j$ 而 $y_i\ne y_j$，且 $i\le n$、$j\le n$ 处均有数据。若 $R^2=1$，则 $SS_{\rm res}=0$，所有 $e_i=0$，即每个点都落在回归直线上；但同一 $x$ 上的直线只有一个值，与 $y_i\ne y_j$ 矛盾。$\square$

**推论** 重复观测处 $y$ 的差异给出了**纯误差**（pure error），它构成了 $SS_{\rm res}$ 中不可被任何模型消除的下限——这正是不存在失拟时残差仍非零的原因，也是 M3 失拟检验（lack of fit test）的基础。

---
