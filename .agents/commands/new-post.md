---
description: 新建一篇文章（自动带词表标签与正确的 front matter 骨架）
---

用脚手架建文章，不要手抄 front matter：

```bash
bash scripts/new-content.sh post <slug> --title "标题" --tags A,B [--series "系列名"] [--categories X]
```

流程：

1. 从 `$ARGUMENTS` 里解析出 slug 与标题。slug 用于 URL（`/:year/:month/:slug/`），必须是英文短横线形式；标题可以是中文。
2. 读 `data/taxonomy.yaml` 的 `tags` 段，用 AskUserQuestion 让用户**勾选**标签——不要让用户手动输入标签，词表存在的意义就是免手输。用户没提标签时也问一次，可以一个都不选。
3. 只有当用户明确要求一个词表里没有的新标签时，才加 `--new-tag`（脚本会自动把它写进词表）。
4. 跑脚本，然后告诉用户新建的文件路径，以及还需要他手写的部分（正文、可选封面图 `cover.image`）。

约束：

- 不要用 Write 工具直接创建文章文件，一律走脚本：front matter 的唯一事实源是 `archetypes/`。
- 脚本默认 `draft: true`；用户说「要发布」时才加 `--publish`，否则提醒他写完要改掉 draft。
- 同名文件已存在时脚本会拒绝覆盖，如实转述即可，不要绕过。
