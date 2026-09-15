---
# 分层项目的子项目页（branch bundle / section 页）：
#   hugo new content projects/<项目>/<子项目>/_index.md --kind project-section
# 日常新建请优先用 scripts/new-content.sh sub。
#
# 这里刻意不写 tags / categories：分类法由上层项目主页的 cascade 下发，而 cascade 只填空，
# 本页一旦写了 tags（哪怕是空数组），其下的文档页就会整体丢掉继承来的标签。
title: "问题四"
date: 2026-09-12
draft: false
weight: 5
description: "问题四　含定向干扰源的搜索—定位—清除策略与算法"
---

问题四的完整解答：把定向干扰源（覆盖角有限）并入搜索—定位—清除策略后的建模与算法设计。公式、符号与判据见《问题四_公式》，小证明见《问题四_小证明》，问题级时间下界见《问题四_证明_下界》。
