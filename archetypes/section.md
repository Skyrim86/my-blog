---
# section 列表页（branch bundle / section 页）：
#   hugo new content <路径>/_index.md --kind section
# 日常新建请用 scripts/new-content.sh section <路径> --title "标题"
#
# 「列表页」= 一个分区的入口页：/posts/、/courses/、/projects/、/tags/ 这类 URL 都靠它存在。
# 少了它，Hugo 只会生成一个「隐式 section」—— 页面能不能存在，取决于下面还有没有子页面；
# 最后一个子页面被删空时，列表页本身与所有指向它的入口（导航栏、首页、正文链接）会一起 404。
# 实测踩过，判据与修法见 scripts/check-sections.sh 与 docs/traps.md。
#
# 这里刻意不写 tags / categories：section 页写标签只会让 /tags/ 计数虚高、词条页里并不出现
# （见 AGENTS.md 规则 3）。也不写 date / draft：这类页面没有草稿与排期语义
# ——现有列表页（content/{posts,courses,projects,tags,categories,series}/_index.md）
# 都只有 title + description，本骨架与它们保持一致。
title: "{{ replace .Name "-" " " | title }}"
description: ""
---

在这里写这个列表页的说明（一句话讲清这个分区放什么）。
