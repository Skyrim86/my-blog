---
# 项目详情页骨架：hugo new content projects/<项目名>/index.md
# 列表页 /projects/ 由 content/projects/_index.md 提供，无需改动。
# 正文写项目介绍（README 风格）；tech 与 repo 会在正文下方自动渲染成
# 「技术栈标签 + 查看源码按钮」（见 layouts/_partials/project-meta.html）。
title: "{{ replace .Name "-" " " | title }}"
date: {{ .Date }}
draft: true
description: ""
# 技术栈：填了才显示标签
tech: []
# 仓库地址：填了才显示「查看源码」按钮
repo: ""
categories: ["项目"]
---

在这里写项目介绍：做了什么、怎么实现、踩过什么坑。
