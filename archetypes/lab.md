---
# 实验（课程章下的 leaf bundle）：scripts/new-content.sh lab 生成，
# 也可以由 chapter 子命令的 --materials 一次建好。
# 与 notes.md / homework.md 一样，不要在这里写 tags / categories —— 课程标签由
# 课程主页 _index.md 的 cascade 下发，而 cascade 只填空：本页一旦自己写了 tags，
# 就会整体丢掉继承来的课程标签。
# 键必须与 notes.md 完全一致：scripts/check-editor-schema.mjs 用一份字段表覆盖三种材料页。
title: "实验"
weight: 3
icon: "🧪"
date: {{ now.Format "2006-01-02" }}
draft: true
description: ""
---

实验目的、步骤、数据与结论。实验报告（PDF 等）直接放在本文件同级目录，会自动出现在页面下方的「附件下载」区。

同一章要放多个实验时，用 `--dir` 指定目录名（如 `lab-02`），title 与 weight 另填。
