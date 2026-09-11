---
# 分层项目的文档页（regular page）：scripts/new-content.sh doc 自动生成
title: "{{ replace .Name "-" " " | title }}"
date: {{ now.Format "2006-01-02" }}
draft: true
weight: 1
# 公式本身在构建期已渲染（见 layouts/_markup/render-passthrough.html），这里的 math 只决定
# 本页要不要加载 KaTeX 样式。默认 true（本类文档通常含公式）；纯文字文档改成 false，省约 23KB。
math: true
description: ""
summary: ""
---

正文从这里开始。
