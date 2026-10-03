---
title: "数值分析"
description: "课程笔记与作业：误差与浮点数、二分法与迭代法、牛顿法与割线法。"
# 这个词条页目前**没有任何内容**：本站唯一的数值分析课程（/courses/numerical-analysis/）
# 的两章材料已于 2026-09-30 下线，而该课程的 cascade 只对 `kind: page`（regular page）下发标签，
# 课程主页本身是 section、拿不到标签 —— 于是这个词条既没有页面、也没有计数。
# 词条仍留在 data/taxonomy.yaml 与 data/tag-groups.yaml（拼写事实源与分组不删，
# 材料上线后它会自己活过来），但页面对爬虫与访客都不该是「一个空列表」。
#
# 为什么只需要 sitemap.disable（本轮实测过两个开关，见 lab/结果/audit-2026-10-03/）：
#   · sitemap.disable → 真的从 sitemap.xml 里去掉（实测：加之前 -c 能命中，加之后 0 命中）
#   · noindex / robotsNoIndex → **不生效**。仓库里没有任何模板读这两个键（extend_head.html
#     只按 .Kind "404" 输出 robots meta），所以写它们只是看着像在管、实际什么都不做。
#     content/search.md 里那条 robotsNoIndex 同属无效配置，未在本轮一并改。
# 内容上线后删掉 sitemap 这三行即可（sitemap 在 KNOWN_KEYS 里，会被 check-frontmatter.sh 守住）。
sitemap:
  disable: true
---
