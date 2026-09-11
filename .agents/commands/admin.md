---
description: 打开本地博客管理页（新建/编辑内容、管理词表、查看改动、一键发布 + 内嵌预览）
---

启动本地管理页：

```bash
bash scripts/admin.sh
```

约束：

- `scripts/admin.sh` 会 `exec node scripts/admin/server.mjs`，是**阻塞进程，必须放到后台运行**（run_in_background），不要在前台等它结束。
- 启动后把 **http://127.0.0.1:1414/** 告诉用户，并说明：
  - 顶部三个页签是「新建 / 编辑 / 发布」，右侧是同屏预览（会自己带起 `hugo server`，已就绪后 iframe 会在保存后自动刷新）；
  - 「发布」页签走的是同一个 `scripts/push-blog.sh`（构建校验失败即中止，不提交不推送）；
  - 停止后台任务即关闭管理页，它启动的 hugo 预览也会一起关掉。
- 若 1414 端口被占用（提示 EADDRINUSE，多半是上一次没关），改用 `bash scripts/admin.sh --port 1415`。
- 不需要为这件事探索仓库结构，也不需要额外起 `scripts/preview.sh`——管理页自带预览。
- 只在用户明确要求时再用 `--host 0.0.0.0`：那会把「能执行命令的页面」暴露到局域网，启动时会打印风险提示。
