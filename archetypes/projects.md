---
# 项目详情页骨架：hugo new content projects/<项目名>/index.md
# 列表页 /projects/ 由 content/projects/_index.md 提供，无需改动。
# 正文写项目介绍（README 风格）；tags 与 repo 会在正文下方自动渲染成
# 「技术栈标签 + 查看源码按钮」（见 layouts/_partials/project-meta.html）。
#
# 注意：技术栈就用 tags 分类法（不是另设的字段），所以标签既能点进 /tags/ 词条页，
# 也会让 /tags/ 的对应词条页列出这个项目。
# 日常新建请优先用 scripts/new-content.sh project（--layered 可建分层项目）。
title: "{{ replace .Name "-" " " | title }}"
date: {{ now.Format "2006-01-02" }}
draft: true
description: ""
# 技术栈标签；填了才显示（每个都会链接到 /tags/ 对应词条页）
tags: []
# 仓库地址：填了才显示「查看源码」按钮
repo: ""
categories: ["项目"]
---

在这里写项目介绍：做了什么、怎么实现、踩过什么坑。
