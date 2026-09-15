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
title: "数学库"
layout: "library"
description: "按数学分支整理的定理、定义与工具卡：跨课程汇总，一张卡一个页面，正文里的引用可直接展开。"
---

这里按数学分支汇总各门课程里出现的定理、定义与工具卡。一张卡一个页面，编号稳定，可以直接引用或分享。

卡片正文不在本页：本页只铺索引（分支 → 卡片清单），点开才加载那张卡的完整内容——正文里的引用也一样，点一下就地展开。
