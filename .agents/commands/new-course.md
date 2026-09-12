---
description: 新建课程主页，或给已有课程加一章（可选一并建好笔记/作业/实验），或给已有章节补一个材料页
---

三种用法：

```bash
bash scripts/new-content.sh course  <课程> --tags A,B [--unit 章] [--title 标题]
bash scripts/new-content.sh chapter <课程> <章节标题> [--materials notes,homework,lab|none]
bash scripts/new-content.sh notes|homework|lab <课程> <章节> [--dir 目录名] [--title 标题]
```

流程：

1. 先判断用户是要**开一门新课**（course）、**给已有课程加一章**（chapter），还是**给已有章节补一个材料页**（notes / homework / lab）。
2. 开课时，读 `data/taxonomy.yaml` 的 `tags` 段，用 AskUserQuestion 让用户勾选标签（课程标签只需在这里写一次，会由 cascade 自动下发给各章材料页）。
3. 加章时只需课程名与章节标题；章号（`chapter-01`、`chapter-02`…）由脚本按现有目录自动递增，不要自己编号。是否一并建材料页由 `--materials` 决定（**默认 notes,homework**，与改造前的行为一致）；用户明确说「先不建笔记/作业」时才传 `none`。
4. 补材料时 `<章节>` 填**章节目录名**（如 `chapter-01`），不是章节标题。

三种材料页：

| 子命令 | 目录 | 默认标题 | 图标 |
|---|---|---|---|
| `notes` | `notes/` | 学习笔记 | 📖 |
| `homework` | `homework/` | 作业 | 📝 |
| `lab` | `lab/` | 实验 | 🧪 |

同一章要放第二个实验时用 `--dir lab-02`（权重自动接着排）。章目录下**任何** leaf bundle 都会被章入口页列为材料卡片，顺序由 `weight` 决定 —— 所以材料页的**目录名与它在页面上的名字、位置无关**。

约束：

- 一切走脚本，不要手工创建课程文件。
- **材料页（notes / homework / lab）绝对不要写 tags**：课程标签由课程主页的 `cascade`（带 `target.kind: page`）下发，而 cascade 只填空、不合并——材料页一旦自己写了 tags，就会整体丢掉继承来的课程标签。
- 章节入口页必须保留 `math: false`（骨架已带），否则会继承课程主页 cascade 的 `math: true`，白加载约 23KB KaTeX 样式。
- 管理页（`bash tools/admin/start.sh`）的「新建」页签有同样的入口：顶部选「课程」，二级里再选「章节 / 笔记 / 作业 / 实验」，走的是同一个脚本。
