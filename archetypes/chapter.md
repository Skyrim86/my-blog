---
# 章节入口页骨架：hugo new content courses/<课程>/<chapter-0N>/_index.md --kind chapter
# 日常新建请优先用 scripts/new-content.sh chapter，它会自动排好章号，并按 --materials
# （默认 notes,homework）一并建好本章的材料页。三种材料分别是：
#   notes/index.md（📖 学习笔记）/ homework/index.md（📝 作业）/ lab/index.md（🧪 实验）
# 章目录下**任何** leaf bundle 都会被入口页列为材料卡片，所以材料还能之后再补：
#   bash scripts/new-content.sh notes|homework|lab <课程> chapter-0N
title: "{{ replace .Name "-" " " | title }}"
layout: "chapter"
weight: 1
date: {{ now.Format "2006-01-02" }}
draft: true
# 入口页通常没有公式，写 false 覆盖课程主页 cascade 的 math: true，省下约 23KB 的 KaTeX 样式。
# 但若导语里确实写了公式（参考 chapter-02），必须改成 true。
math: false
description: ""
---

这里是本章导语，会显示在入口页顶部。
