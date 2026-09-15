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
layout: "tools"
title: "数学工具库"
description: "课程用到的前置数学工具与各模块的定理、定义，按分类整理成可检索的卡片。"
# 卡片页（每张卡一个页面）不参与标签体系：课程主页的 cascade 会给下属页面下发
# tags，若不在这里清掉，80 张卡片会涌进 /tags/ 词条页与「相关内容」区块。
# cascade 只填空、不合并，所以这里写空数组就等于「显式不要标签」。
cascade:
  - tags: []
    comments: false
    math: true
---

课程里反复用到的**前置数学工具**，以及各模块的**定理、定义、命题**，都在这页按分类排成卡片。

- 正文里遇到带底色的引用（如 {{< tool "1.4" >}}、{{< thm "4.4" >}}）点一下，卡片就地弹出，不必翻附录。
- 卡片的**证明默认收起**，展开才看推导；顶部搜索框按编号、标题或内容筛选，分类按钮只留一类。
- 每张卡片有固定链接（标题右侧的 `#`），可以把某一条直接发出去。
