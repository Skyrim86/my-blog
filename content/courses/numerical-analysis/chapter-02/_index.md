---
title: "非线性方程求根"
layout: "chapter"
weight: 2
date: 2026-09-10
draft: false
# 入口页通常没有公式、写 math: false 以免白加载 KaTeX；但本页导语里确实写了 $f(x)=0$，
# 所以这里必须是 true（原先写 false，导致那条公式在页面上原样显示成源码）
math: true
description: "二分法、不动点迭代、牛顿法与割线法的推导、收敛阶与失效情形。"
---

本章解决 $f(x) = 0$ 的数值求解：从保证收敛的慢方法，到收敛快但需要条件的迭代法。
