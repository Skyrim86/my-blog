---
# 文章骨架：hugo new content posts/<slug>/index.md（content/posts/ 下没有 posts.md，故回退到此文件）
# 日常新建请优先用 scripts/new-content.sh post，它会顺带处理标签与封面等字段。
title: "{{ replace .Name "-" " " | title }}"
date: {{ now.Format "2006-01-02" }}
draft: true
tags: []
categories: []
# 系列文章：填写后文末自动渲染同系列导航（见 layouts/_partials/series-posts.html）
series: []
description: ""
# 封面图放同目录（Page Bundle）。relative 必须为 true，否则主题会找不到图片。
cover:
  image: ""
  alt: ""
  caption: ""
  relative: true
  hiddenInList: false
  hiddenInSingle: false
---

正文从这里开始。
