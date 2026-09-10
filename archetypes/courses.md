---
# 章节入口页骨架：hugo new content courses/<课程>/<chapter-0N>/_index.md
# 之后手工创建同级 notes/index.md 与 homework/index.md（正文写在那里，附件与各自 index.md 同目录）。
title: "{{ replace .Name "-" " " | title }}"
layout: "chapter"
weight: 1
date: {{ .Date }}
draft: true
description: ""
---

这里是本章导语，会显示在入口页顶部。
