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
description: ""
---

在这里写子项目简介，下级文档由主题列表模板自动列出。
