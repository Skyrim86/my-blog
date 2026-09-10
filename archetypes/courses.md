---
# 课程章节页骨架：hugo new content courses/<课程>/<chapter-0N>/index.md
# 目录内的 notes.md（学习笔记）与 homework.md（作业）、notes-* / hw-* 附件需手动添加。
title: "{{ replace .Name "-" " " | title }}"
weight: 1
date: {{ .Date }}
draft: true
description: ""
---
