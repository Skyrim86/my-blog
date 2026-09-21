---
# section 列表页（branch bundle / section 页）：
#   hugo new content <路径>/_index.md --kind section
# 日常新建请用 scripts/new-content.sh section <路径> --title "标题"
#
# 「收藏库」= 首页那副卡片组（63 张收藏卡）的总览页。少了这个 _index.md，Hugo 只会生成一个
# 「隐式 section」—— 页面能不能存在取决于下面还有没有子页面，而这一页**永远没有子页面**
# （卡片不是 content 页面，数据在 data/home-cards.yaml），所以它会直接 404。
# 判据与修法见 scripts/check-sections.sh 与 docs/traps.md。
#
# 与数学库/CS 库的区别（这两个词容易混）：
#   · 数学库 / CS 库（/library/、/cs/）是**知识卡**：定理、定义、命题，一张卡一个页面。
#   · 收藏库（/collection/）是**收藏卡**：首页那副全息卡的浏览页，卡不是页面、点开看 3D。
# 本页刻意不写 tags / categories（section 页写标签只会让 /tags/ 计数虚高，见 AGENTS.md 规则 3），
# 也不写 date / draft（这类页面没有草稿与排期语义）。
title: "收藏库"
layout: "collection"
description: "63 张收藏卡的全家福：八种工艺、六个等级，可以按系列、工艺或等级筛，点一张就看它的三维卡。"
# 这一页不要 RSS：它是一张图墙，正文本就只有一句话，喂进 feed 只会多出一条没有信息的条目。
# 与 /library/ 同一条口径（那边是因为整支都是导航页）。
outputs: ["HTML"]
---

这里放着首页卡片组里的**全部 63 张收藏卡**——首页一次只翻一张，这一页把它们一次铺开。

每张卡的卡面、工艺（全息、和纸、金继……）与等级（收藏 → 珍稀 → 史诗 → 秘藏 → 传世 → 奇迹）
都在**数据里**（`data/home-cards.yaml`），这一页只是换个方式把它们排出来，不另抄一份清单。
点任意一张会打开与首页同一个三维查看器：可以拖着转、翻面看卡背。
