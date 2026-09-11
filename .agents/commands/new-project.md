---
description: 新建项目页（平铺单页，或带子项目/文档的分层项目）
---

四种用法：

```bash
bash scripts/new-content.sh project <项目> --tags A,B [--repo URL]     # 平铺单页（默认）
bash scripts/new-content.sh project <项目> --layered --tags A,B         # 分层项目主页
bash scripts/new-content.sh sub     <项目> <子项目>                     # 分层项目的子项目
bash scripts/new-content.sh doc     <项目>/<子项目> <文档名> [--no-math] # 分层项目的文档
```

流程：

1. **先问清楚结构**：这个项目是「平铺单页」（一个 `index.md` 到底）还是「下面还要放子项目或若干文档」（分层）。这决定用不用 `--layered`，不要替用户猜。
2. 技术栈标签读 `data/taxonomy.yaml` 的 `tags` 段，用 AskUserQuestion 让用户勾选，不要让用户手动输入。
3. 有仓库地址就传 `--repo`，页面的「查看源码」按钮由它驱动。

约束：

- 一切走脚本，不要手工创建项目文件。
- 平铺项目页是 regular page，标签正常写在 `tags:`；**分层项目的子项目页与文档页不要写 tags**（由项目主页 cascade 下发，写了反而会整体丢掉继承来的标签）。
- 分层项目的文档默认 `math: true`；确认是纯文字文档时才加 `--no-math`。
- 注意：分层项目的项目页/子项目页走主题 `list.html`，**不会**出现「技术栈 + 查看源码」面板，这是既有设计，不要为此去复制主题模板。
