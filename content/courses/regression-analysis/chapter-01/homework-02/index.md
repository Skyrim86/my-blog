---
# 2026-09-26 按 § 拆页分出（docs/pending.md「M1 三页拆页」）：切点与去向见 description。
# 作业（课程章下的 leaf bundle）：scripts/new-content.sh homework，
# 或 chapter 子命令的 --materials homework 生成。
# 与 notes.md 同理，不要在这里写 tags / categories（见该文件说明）。
title: "作业（01 章 · 困难）"
weight: "3"
icon: "📝"
date: 2026-09-15
draft: false
description: "档 2 全解（2 题）：均方误差最小的预测函数、不相关却不满足条件均值为零；题目与解答同页。"
# summary 必须写：列表卡片摘要走 `.Summary | plainify`，正文公式已渲染成 HTML+MathML，会被拼成乱码
summary: "档 2 全解（2 题）：均方误差最小的预测函数、不相关却不满足条件均值为零；题目与解答同页。"
---

## 题目

### 题 1 均方误差最小的预测函数

**题面** 设 $y$ 与 $x$ 的联合分布使 $\mathrm{E}(y^2)<\infty$。证明：对任意 $x$ 的函数 $g$（要求 $g(x)$ 平方可积），

$$\mathrm{E}\bigl[(y-g(x))^2\bigr]\ \ge\ \mathrm{E}\bigl[(y-\mathrm{E}(y\mid x))^2\bigr]$$

并说明等号成立的条件。再解释：把准则换成 $\mathrm{E}\lvert y-g(x)\rvert$ 时，最优预测为什么一般不再是条件均值。

### 题 2 不相关却不满足条件均值为零

**题面** 构造一组 $(x,\varepsilon)$ 使其满足 $\mathrm{Cov}(x,\varepsilon)=0$ 但 $\mathrm{E}(\varepsilon\mid x)\ne0$ 至少在某一个 $x$ 取值上成立，并逐条验证。要求给出三个支撑点、概率与全部数值，说明 $\mathrm{E}(\varepsilon)=0$、$\mathrm{E}(x\varepsilon)=0$ 与条件均值非零可以同时出现。再说明：把这种误差放进简单线性回归模型里，残差与回归元的样本协方差会是多少。

<!-- sources: S1 -->

---

## 解答

### 预备结论

**命题 A（重期望律）** 若 $\mathrm{E}\lvert u\rvert<\infty$，则 $\mathrm{E}(u)=\mathrm{E}\bigl[\mathrm{E}(u\mid x)\bigr]$。

- 条件：$\mathrm{E}\lvert u\rvert<\infty$。
- 结论：无条件期望等于条件期望的无条件期望。

**命题 B（条件期望的乘积性质）** 若 $h(x)$ 有界（或有适当的可积性），则 $\mathrm{E}\bigl[h(x)u\mid x\bigr]=h(x)\,\mathrm{E}(u\mid x)$，从而 $\mathrm{E}\bigl[h(x)u\bigr]=\mathrm{E}\bigl[h(x)\mathrm{E}(u\mid x)\bigr]$。

- 条件：$\mathrm{E}\lvert h(x)u\rvert<\infty$。
- 结论：给定 $x$ 后，$x$ 的函数可以当作常数提出条件期望；这条性质是全部「零条件均值推出不相关」类结论的来源。

**命题 C（协方差的展开）** $\mathrm{Cov}(u,v)=\mathrm{E}(uv)-\mathrm{E}(u)\mathrm{E}(v)$。

- 条件：二阶矩有限。
- 结论：直接由定义展开合并得到。

**命题 D（绝对误差损失下的最优预测是条件中位数）** 记 $m(x)$ 为 $y$ 在给定 $x$ 下的条件中位数，则对任意 $g$ 有 $\mathrm{E}\lvert y-g(x)\rvert\ge\mathrm{E}\lvert y-m(x)\rvert$。

- 条件：$\mathrm{E}\lvert y\rvert<\infty$。
- 结论：绝对误差损失下条件中位数最优；条件均值只在均方误差下最优。
- 证明思路：对固定的 $x$，函数 $t\mapsto\mathrm{E}(\lvert y-t\rvert\mid x)$ 在 $t$ 处的右导数等于 $2F(t\mid x)-1$，其中 $F(\cdot\mid x)$ 为条件分布函数；导数在 $t=m(x)$ 处变号，且该函数为凸，凸函数的零点即最小值点。对 $x$ 取期望保持不等式。

### 题 1 均方误差最小的预测函数

**题面摘要** 证明 $\mathrm{E}[(y-g(x))^2]\ge\mathrm{E}[(y-\mathrm{E}(y\mid x))^2]$ 并说明等号条件与绝对误差损失下的差异。

**解**

1. 加减条件均值：$y-g(x)=\bigl[y-\mathrm{E}(y\mid x)\bigr]+\bigl[\mathrm{E}(y\mid x)-g(x)\bigr]$。记 $h(x)=\mathrm{E}(y\mid x)-g(x)$，则 $h$ 是 $x$ 的函数。
2. 平方并取期望：$\mathrm{E}\bigl[(y-g(x))^2\bigr]=\mathrm{E}\bigl[(y-\mathrm{E}(y\mid x))^2\bigr]+2\mathrm{E}\bigl[h(x)\bigl(y-\mathrm{E}(y\mid x)\bigr)\bigr]+\mathrm{E}\bigl[h(x)^2\bigr]$。
3. 交叉项为零：由命题 B，$\mathrm{E}\bigl[h(x)\bigl(y-\mathrm{E}(y\mid x)\bigr)\bigr]=\mathrm{E}\bigl\{h(x)\,\mathrm{E}\bigl[y-\mathrm{E}(y\mid x)\mid x\bigr]\bigr\}=\mathrm{E}\{h(x)\cdot0\}=0$。
4. 于是 $\mathrm{E}\bigl[(y-g(x))^2\bigr]-\mathrm{E}\bigl[(y-\mathrm{E}(y\mid x))^2\bigr]=\mathrm{E}\bigl[h(x)^2\bigr]\ge0$，等号成立当且仅当 $\mathrm{E}\bigl[h(x)^2\bigr]=0$，即 $g(x)=\mathrm{E}(y\mid x)$ 几乎处处。

**答案** 不等式成立，交叉项由命题 B 消去，余项 $\mathrm{E}[h(x)^2]$ 非负；等号当且仅当 $g(x)=\mathrm{E}(y\mid x)$ 几乎处处。

绝对误差损失下条件均值一般不再最优。差别出在第 2 步的展开：均方误差下「$y$ 与条件均值之差」和任何 $x$ 的函数都正交，误差被拆成两项且无交叉；换成绝对值之后没有这种正交分解，损失在 $t$ 处的最优由条件分布的累积概率决定，中位数处 $\Pr(y\le t\mid x)$ 与 $\Pr(y\ge t\mid x)$ 各半。分布对称时两者重合，偏斜分布则不同：例如条件分布取 $0$ 与 $9$ 各半、再以极小概率取一些大值，条件均值会被大值拉高，条件中位数停在 $0$ 与 $9$ 之间。

**注** 用均方误差拟合得到的直线对极端观测的敏感，正是这一步正交分解的代价；换成绝对误差需要迭代计算，得到的也不再是闭式解。

### 题 2 不相关却不满足条件均值为零

**题面摘要** 构造 $\mathrm{Cov}(x,\varepsilon)=0$ 而 $\mathrm{E}(\varepsilon\mid x)\ne0$ 的例子并验证；说明放进线性回归后残差与回归元的样本协方差。

**解**

1. 取 $x$ 在 $\{-1,0,1\}$ 上等可能取值，概率各为 $1/3$。
2. 取 $\varepsilon=x^2-\dfrac23+u$，其中 $u$ 与 $x$ 独立、$\mathrm{E}(u)=0$、$\mathrm{Var}(u)=\sigma_u^2>0$。
3. 条件均值：$\mathrm{E}(\varepsilon\mid x)=x^2-\dfrac23$，在 $x=\pm1$ 处等于 $\dfrac13$，在 $x=0$ 处等于 $-\dfrac23$，三个取值上都不等于零。
4. 无条件均值：$\mathrm{E}(\varepsilon)=\mathrm{E}(x^2)-\dfrac23=\dfrac23-\dfrac23=0$。
5. 乘积期望：$\mathrm{E}(x\varepsilon)=\mathrm{E}\bigl[x(x^2-\tfrac23)\bigr]+\mathrm{E}(xu)$。第一项为 $\frac13(-1)(\frac13)+\frac13(0)(-\frac23)+\frac13(1)(\frac13)=0$，因为 $x^3$ 关于原点对称；第二项由独立性得 $\mathrm{E}(x)\mathrm{E}(u)=0$。
6. 协方差：由命题 C，$\mathrm{Cov}(x,\varepsilon)=\mathrm{E}(x\varepsilon)-\mathrm{E}(x)\mathrm{E}(\varepsilon)=0-0=0$。

**答案** 例子如上：$\mathrm{E}(\varepsilon)=0$、$\mathrm{Cov}(x,\varepsilon)=0$，而 $\mathrm{E}(\varepsilon\mid x)=x^2-\frac23$ 在三处均非零。三个支撑点上的误差取值为 $\varepsilon=1/3$（$x=\pm1$）与 $-2/3$（$x=0$），加上独立的零均值扰动 $u$ 不改变两条矩等式。

把这种误差当作真实误差放进简单线性回归，最小二乘的正规方程仍给出 $\sum e_i=0$、$\sum x_ie_i=0$，因此残差与回归元的样本协方差仍恰为零——条件均值非零这件事在这一步完全不被发现。函数的曲率被线性模型整体吸收进截距：直线会用 $\hat\beta_0$ 去逼近 $\mathrm{E}(y\mid x)$ 在三个点上的平均高度，而在 $x=\pm1$ 处系统性偏低、在 $x=0$ 处系统性偏高，残差对 $x$ 呈对称的 U 形，符号正负成对出现。

**注** 这就是「残差与回归元不相关」不足以验证模型形式的机制：$x^2$ 与 $x$ 在对称设计下正交，线性模型看不见它。要发现它只能靠残差图，或者显式把 $x^2$ 作为回归元放进来再检验其系数。

<!-- sources: S1 -->
