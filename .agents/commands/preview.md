---
description: 本地预览博客（含草稿），打开 http://localhost:1313/my-blog/
---

启动 Hugo 预览服务器：

```bash
bash scripts/preview.sh
```

约束：

- `hugo server` 是阻塞进程，**必须放到后台运行**（run_in_background），不要在前台等它结束。
- 启动后把 http://localhost:1313/my-blog/ 告诉用户，并说明改文件会自动刷新、停止后台任务即关闭。
- 若 1313 端口被占用，改用 `bash scripts/preview.sh 1314`。
