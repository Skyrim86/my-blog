---
description: 新建课程主页，或给已有课程加一章（自动建好笔记+作业三件套）
---

两种用法：

```bash
bash scripts/new-content.sh course  <课程> --tags A,B [--unit 章] [--title 标题]
bash scripts/new-content.sh chapter <课程> <章节标题>
```

流程：

1. 先判断用户是要**开一门新课**（course）还是**给已有课程加一章**（chapter）。
2. 开课时，读 `data/taxonomy.yaml` 的 `tags` 段，用 AskUserQuestion 让用户勾选标签（课程标签只需在这里写一次，会由 cascade 自动下发给各章材料页）。
3. 加章时只需课程名与章节标题；章号（`chapter-01`、`chapter-02`…）由脚本按现有目录自动递增，不要自己编号。

约束：

- 一切走脚本，不要手工创建课程文件。
- **材料页（notes / homework）绝对不要写 tags**：课程标签由课程主页的 `cascade`（带 `target.kind: page`）下发，而 cascade 只填空、不合并——材料页一旦自己写了 tags，就会整体丢掉继承来的课程标签。
- 章节入口页必须保留 `math: false`（骨架已带），否则会继承课程主页 pipeline 的 `math: true`，白加载约 300KB KaTeX。
