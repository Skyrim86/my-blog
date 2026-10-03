---
# 作业（课程章下的 leaf bundle）：scripts/new-content.sh homework，
# 或 chapter 子命令的 --materials homework 生成。
# 与 notes.md 同理，不要在这里写 tags / categories（见该文件说明）。
title: "作业（01 章 · 简单与中档）"
weight: "2"
icon: "📝"
date: 2026-09-15
draft: false
description: "档 1 全解（4 题）：三个模型的线性性判断、条件均值为零推出的两条结论、条件均值与两个替代预测的均方误差、相关系数与两边回归的斜率；题目与解答同页。"
# summary 必须写：列表卡片摘要走 `.Summary | plainify`，正文公式已渲染成 HTML+MathML，会被拼成乱码
summary: "档 1 全解（4 题）：三个模型的线性性判断、条件均值为零推出的两条结论、条件均值与两个替代预测的均方误差、相关系数与两边回归的斜率；题目与解答同页。"
---

## 题目

### 题 1 三个模型的线性性判断

**题面** 判断下列模型是否属于线性回归模型，对属于的写出回归元与待估参数，对不属于的指出哪一条性质被破坏：

（a）$y_i=\beta_0+\beta_1x_i^2+\varepsilon_i$；
（b）$y_i=\beta_0e^{\beta_1x_i}+\varepsilon_i$；
（c）$y_i=\beta_0+\beta_1x_{i1}+\beta_2x_{i1}x_{i2}+\varepsilon_i$。

### 题 2 条件均值为零推出的两条结论

**题面** 设对每个 $x$ 有 $\mathrm{E}(\varepsilon\mid x)=0$，且 $\mathrm{E}(\varepsilon^2)<\infty$、$\mathrm{E}(x^2)<\infty$。证明 $\mathrm{E}(\varepsilon)=0$ 与 $\mathrm{Cov}(x,\varepsilon)=0$，并说明这两条结论在拟合完成后对应到残差上的表现，以及它们能否用来判断回归函数的形式写得对不对。

### 题 3 条件均值与两个替代预测的均方误差

**题面** 设 $(x,y)$ 的联合分布为：$x=0$ 与 $x=1$ 各以概率 $0.5$ 出现；当 $x=0$ 时 $y$ 恒等于 $1$，当 $x=1$ 时 $y$ 以概率 $0.5$ 取 $0$、以概率 $0.5$ 取 $3$。

（a）求 $\mathrm{E}(y\mid x=0)$ 与 $\mathrm{E}(y\mid x=1)$；
（b）分别计算三个预测函数的均方误差：$g(x)=\mathrm{E}(y\mid x)$、常数预测 $g(x)=1.5$、$g(x)=x$；
（c）按大小排序，并说明 $\mathrm{E}(y\mid x)$ 的优势来自哪一步。

### 题 4 相关系数与两边回归的斜率

**题面** 五个观测：$x=(2,\ 4,\ 6,\ 8,\ 10)$，$y=(3,\ 5,\ 4,\ 8,\ 9)$。

（a）求样本相关系数 $r$；
（b）以 $y$ 为响应、$x$ 为回归元，估计斜率 $\hat\beta_{y\mid x}$；
（c）以 $x$ 为响应、$y$ 为回归元，估计斜率 $\hat\beta_{x\mid y}$；
（d）计算两个斜率的乘积，并与 $r^2$ 比较，说明这组结果显示的相关与回归的差别。

<!-- sources: S1, S2 -->

---

## 解答

### 预备结论

**命题 A（重期望律）** 对随机变量 $u$ 与 $x$，只要期望存在，$\mathrm{E}(u)=\mathrm{E}\bigl[\mathrm{E}(u\mid x)\bigr]$。

- 条件：$\mathrm{E}\lvert u\rvert<\infty$。
- 结论：无条件期望等于条件期望的期望。
- 证明：按条件期望的定义，$\mathrm{E}(u\mid x)$ 是 $u$ 在 $x$ 生成的 $\sigma$ 代数上的投影，对两侧取期望保持等式。离散情形可直接验证：$\mathrm{E}(u)=\sum_x p(x)\sum_u u\,p(u\mid x)=\sum_{x,u}u\,p(x,u)$。

**命题 B（协方差的乘积与线性性）** $\mathrm{Cov}(u,v)=\mathrm{E}(uv)-\mathrm{E}(u)\mathrm{E}(v)$；$\mathrm{Cov}(\cdot,\cdot)$ 对每个变元线性。

- 条件：$\mathrm{E}(u^2)<\infty$ 、$\mathrm{E}(v^2)<\infty$。
- 结论：按上式展开与合并即可，无需进一步假设。

**命题 C（{{< tool "1.3" "Cauchy–Schwarz 不等式" >}}）** $\lvert\mathrm{E}(uv)\rvert\le\sqrt{\mathrm{E}(u^2)\mathrm{E}(v^2)}$，等号当且仅当 $u$ 与 $v$ 几乎必然成比例。

- 条件：$\mathrm{E}(u^2)<\infty$ 、$\mathrm{E}(v^2)<\infty$。
- 结论：对样本矩同样成立，取 $u=x-\bar x$、$v=y-\bar y$ 得到 $\lvert S_{xy}\rvert\le\sqrt{S_{xx}S_{yy}}$。

**命题 D（简单线性回归的最小二乘解）** 对观测 $(x_i,y_i)$，$i=1,\dots,n$，模型 $y_i=\beta_0+\beta_1x_i+\varepsilon_i$ 在 $S_{xx}=\sum(x_i-\bar x)^2>0$ 时的最小二乘估计为

$$\hat\beta_1=\frac{S_{xy}}{S_{xx}},\qquad \hat\beta_0=\bar y-\hat\beta_1\bar x$$

其中 $S_{xy}=\sum(x_i-\bar x)(y_i-\bar y)$。

- 条件：$S_{xx}>0$。
- 结论：解唯一；把 $x$ 与 $y$ 的角色互换求解，得到另一个斜率 $S_{xy}/S_{yy}$，两者分母不同。
- 证明：对 $Q(\beta_0,\beta_1)=\sum(y_i-\beta_0-\beta_1x_i)^2$ 求偏导并令其为零得正规方程，第一式给出 $\hat\beta_0=\bar y-\hat\beta_1\bar x$，代回第二式并用 $\sum(x_i-\bar x)=0$ 化简便得 $\hat\beta_1=S_{xy}/S_{xx}$；二阶条件由 $Q$ 的严格凸性给出。

### 题 1 三个模型的线性性判断

**题面摘要** 判断 $y=\beta_0+\beta_1x^2+\varepsilon$、$y=\beta_0e^{\beta_1x}+\varepsilon$、$y=\beta_0+\beta_1x_1+\beta_2x_1x_2+\varepsilon$ 是否为线性回归，写出回归元与参数。

**解**

1. 「线性」修饰的是参数向量 $\boldsymbol\beta$：回归函数对 $\boldsymbol\beta$ 的梯度必须与 $\boldsymbol\beta$ 无关。
2. （a）取回归元为 $x^2$，梯度为 $(1,x^2)'$，不含参数，属于线性回归。
3. （b）回归函数 $f(\beta_0,\beta_1)=\beta_0e^{\beta_1x}$ 对 $\beta_1$ 的偏导为 $\beta_0xe^{\beta_1x}$，含参数，梯度依赖 $\boldsymbol\beta$，不属于线性回归。
4. （c）取回归元为 $x_1$ 与 $x_1x_2$，梯度为 $(1,x_1,x_1x_2)'$，不含参数，属于线性回归。

**答案** （a）属于，回归元 $x^2$，参数 $\beta_0,\beta_1$；（b）不属于，回归函数对参数非线性；（c）属于，回归元 $x_1$ 与 $x_1x_2$，参数 $\beta_0,\beta_1,\beta_2$。

**注** 对响应作变换同样可以回到线性框架（例如对 $y$ 取对数使其正数），但那改变了误差的分布假设，也改变了预测值的反变换方式；变换响应与变换回归元不是同一件事。

### 题 2 条件均值为零推出的两条结论

**题面摘要** 由 $\mathrm{E}(\varepsilon\mid x)=0$ 证明 $\mathrm{E}(\varepsilon)=0$ 与 $\mathrm{Cov}(x,\varepsilon)=0$，并说明它们在残差上的表现。

**解**

1. 无条件期望：由命题 A，$\mathrm{E}(\varepsilon)=\mathrm{E}\bigl[\mathrm{E}(\varepsilon\mid x)\bigr]=\mathrm{E}(0)=0$。
2. 乘积期望：$\mathrm{E}(x\varepsilon)=\mathrm{E}\bigl\{x\,\mathrm{E}(\varepsilon\mid x)\bigr\}=\mathrm{E}(x\cdot0)=0$。这一步用的是「$x$ 在给定 $x$ 的条件下是常数」，可以提到条件期望之外。
3. 协方差：由命题 B，$\mathrm{Cov}(x,\varepsilon)=\mathrm{E}(x\varepsilon)-\mathrm{E}(x)\mathrm{E}(\varepsilon)=0-0=0$。
4. 拟合后的表现：$SS_{Res}=\sum e_i^2$ 取到最小的必要条件给出 $\sum e_i=0$、$\sum x_ie_i=0$，样本协方差 $\frac1n\sum(x_i-\bar x)e_i$ 因此恰为零，与第 3 步的总体结论对应。
5. 能否判断回归函数形式：不能。第 4 步是必要条件，不相关只是条件均值为零的一个推论；误差与回归元的样本协方差为零是每一种最小二乘拟合的必然结果，与直线写对没有关系。

**答案** $\mathrm{E}(\varepsilon)=0$、$\mathrm{Cov}(x,\varepsilon)=0$ 成立；两者在残差上的表现是残差和为零、残差与回归元的样本协方差为零，而这两条对任何最小二乘拟合都自动成立，因此无法用来判断回归函数的形式。

**注** 反过来把「残差与回归元不相关」当作模型正确的证据，是设定检验里最常见的空转：想做这件事必须看残差对回归元或拟合值的图形结构。

### 题 3 条件均值与两个替代预测的均方误差

**题面摘要** $x$ 取 $0,1$ 各半；$x=0$ 时 $y\equiv1$，$x=1$ 时 $y$ 取 $0$、$3$ 各半。求条件均值并比较三个预测函数的均方误差。

**解**

1. 条件均值：$\mathrm{E}(y\mid x=0)=1$；$\mathrm{E}(y\mid x=1)=0.5\times0+0.5\times3=1.5$。
2. 条件均值的均方误差：$x=0$ 处误差为零，$x=1$ 处误差为 $\mathrm{E}\bigl[(y-1.5)^2\mid x=1\bigr]=0.5\times1.5^2+0.5\times1.5^2=2.25$，故 $\mathrm{MSE}=0.5\times0+0.5\times2.25=1.125$。
3. 常数预测 $1.5$：$x=0$ 处误差为 $(1-1.5)^2=0.25$，$x=1$ 处仍为 $2.25$，故 $\mathrm{MSE}=0.5\times0.25+0.5\times2.25=1.25$。
4. 预测函数 $g(x)=x$：$x=0$ 处误差为 $(1-0)^2=1$，$x=1$ 处误差为 $\mathrm{E}\bigl[(y-1)^2\mid x=1\bigr]=0.5\times1+0.5\times4=2.5$，故 $\mathrm{MSE}=0.5\times1+0.5\times2.5=1.75$。

**答案** $\mathrm{MSE}=1.125$（条件均值）、$1.25$（常数 $1.5$）、$1.75$（$g(x)=x$）；大小顺序为 $1.125<1.25<1.75$。

条件均值的最小性来自把误差拆成「$y$ 与条件均值的差」加上「条件均值与 $g(x)$ 的差」：第一项与 $g$ 无关，第二项非负，故 $g$ 一旦偏离条件均值，均方误差只会增加。

**注** 常数预测 $1.5$ 的误差只比最优值大 $0.125$，这说明最优性不意味着优势一定明显——差别的大小取决于条件均值本身的变异程度。

### 题 4 相关系数与两边回归的斜率

**题面摘要** $x=(2,4,6,8,10)$、$y=(3,5,4,8,9)$，求 $r$、两个方向的斜率及其乘积。

**解**

1. 汇总量：$\bar x=6$、$\bar y=5.8$，$S_{xx}=40$、$S_{yy}=26.8$、$S_{xy}=30$。
2. 相关系数：$r=\dfrac{S_{xy}}{\sqrt{S_{xx}S_{yy}}}=\dfrac{30}{\sqrt{40\times26.8}}=0.916271$，$r^2=0.839552$。
3. 以 $y$ 为响应：$\hat\beta_{y\mid x}=S_{xy}/S_{xx}=30/40=0.750000$。
4. 以 $x$ 为响应：$\hat\beta_{x\mid y}=S_{xy}/S_{yy}=30/26.8=1.119403$。
5. 乘积：$0.750000\times1.119403=0.839552$，与 $r^2$ 相等——这是 $S_{xy}^2/(S_{xx}S_{yy})$ 的恒等式，不是巧合。

**答案** $r=0.916271$，$\hat\beta_{y\mid x}=0.750000$，$\hat\beta_{x\mid y}=1.119403$，乘积 $0.839552=r^2$。

两个斜率方向不同、数值不同，一个说「$x$ 每增加一个单位平均带动 $y$ 增加 $0.75$」，另一个说「$y$ 每增加一个单位平均带动 $x$ 增加 $1.12$」，两句话不能互相推出。相关系数把两个方向压成同一个数，代价是丢掉了方向与量纲；$r^2$ 之所以在两个方向上相同，是因为它只衡量线性关联的强度。

**注** 两个斜率的乘积恒等于 $r^2$，这一恒等式只在简单线性回归、且两个方向的斜率都由同一组数据算出时成立；多元回归里没有对应的结论。

<!-- sources: S1, S2 -->
