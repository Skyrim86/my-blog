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
#
# 大类页（/library/<大类>/）与细分页（/library/<大类>/<细分>/）**没有**对应的 md 文件：
# 它们由 content/library/_content.gotmpl（内容适配器）从 data/math-toolbox.json 现算生成，
# 见 docs/features.md ㉒。所以这里不写 math —— 本页只有大类名，没有公式。
title: "数学库"
layout: "library"
description: "按数学分支整理的定理、定义与命题卡：先挑大类，再进细分，一张卡一个页面，正文里写名字就能点开。"
# 这一支不要 RSS：/library/ 下的页面全是导航页（大类 / 细分），大类和细分页由
# content/library/_content.gotmpl 生成、没有正文，喂进 feed 只会多出 23 条空条目。
outputs: ["HTML"]
---

这里按**大类 → 细分**汇总各门课程里出现的定理、定义与命题。每张卡的身份是**类别 + 名字**（卡片左缘的色条与徽章配色就是类别），一张卡一个页面、地址固定，可以直接引用或分享。

页面分三级：这一页是大类（概率论、数理统计……）；点进去是大类下的细分方向；再点进去才是卡片清单。**卡片正文不在这些页面上**——到了细分那一层，点开某一张卡就地展开，正文里的引用也一样。
