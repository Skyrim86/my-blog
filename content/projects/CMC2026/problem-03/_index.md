---
# 分层项目的子项目页（branch bundle / section 页）：
#   hugo new content projects/<项目>/<子项目>/_index.md --kind project-section
# 日常新建请优先用 scripts/new-content.sh sub。
#
# 这里刻意不写 tags / categories：分类法由上层项目主页的 cascade 下发，而 cascade 只填空，
# 本页一旦写了 tags（哪怕是空数组），其下的文档页就会整体丢掉继承来的标签。
title: "问题三"
date: 2026-09-12
draft: false
weight: 4
description: "问题三　全向干扰源的搜索—定位—清除策略与算法"
---

问题三的完整解答：全向干扰源（位置、频道、有效接收半径均未知）的搜索—定位—清除策略建模、算法设计与本地模拟器批量演练。公式与符号见《问题三_公式》，小证明与数值证书见《问题三_小证明》，问题级时间下界见《问题三_证明_下界》。
