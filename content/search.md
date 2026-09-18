---
title: "搜索"
layout: "search"
url: "/search/"
summary: "搜索文章"
placeholder: "输入关键词搜索..."
# 搜索页是纯客户端功能页，没有可索引的正文：别进 sitemap，也别让搜索引擎收。
# 它在搜索索引与列表页里已经被 layouts/index.json、主题 list.html 按 layout 名排除掉了。
sitemap:
  disable: true
robotsNoIndex: true
---