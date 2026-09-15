---
# 分层项目的项目主页（branch bundle / section 页）：
#   hugo new content projects/<项目>/_index.md --kind project-home
# 平铺单页项目请用 --kind projects（见 projects.md）；子项目请用 --kind project-section。
#
# 为什么分区：leaf bundle 不能有子页面，所以「项目 → 子项目 → 文档」只能用 section 实现。
# 代价是 section 页不走 single.html，因此不会自动出现「技术栈 + 查看源码」面板 ——
# 这一页靠下面的 layout 命中自定义模板补回来。
#
# layout: "project-home" 命中 layouts/projects/project-home.html：
#   技术栈/仓库面板 + 子页目录（各子项目文档数 + 更新时间）+ 正文。
#   删掉这一行会退回主题 list.html（只有一列卡片，看不到层级与进度）。
# 列表卡片封面可选：tools/covers/make-covers.py 生成后写 cover.image。
layout: "project-home"
title: "{{ replace .Name "-" " " | title }}"
date: {{ now.Format "2006-01-02" }}
draft: true
description: ""
# 分类法只在这里写一次，由 cascade 下发给各子项目与文档页。
# target.kind: page 表示只发给 regular page：项目主页与子项目页都是 section，
# 即使带上标签也只会让 /tags/ 计数虚高、词条页里并不出现（见 AGENTS.md）。
# 注意 cascade 只填空、不合并：子孙页自己写了 tags 就会整体丢掉这里下发的标签。
cascade:
  - target:
      kind: page
    tags: []
    categories: ["项目"]
---

在这里写项目介绍：做了什么、怎么组织下级内容。
