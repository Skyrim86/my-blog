---
description: 构建校验并推送博客到 origin/main（自动 add/commit，CI 自动部署）
---

执行推送脚本，把用户给的文字作为提交说明：

```bash
bash scripts/push-blog.sh "$ARGUMENTS"
```

约束：

- 不要为这件事探索仓库（不需要读 `content/`、`layouts/`、`themes/`、`git log`、`git status`）。
- 只把脚本输出转述给用户：是否构建通过、提交哈希与说明、是否推送成功、CI 状态。
- 脚本若因构建失败中止，如实报告失败原因与日志尾部，**不要**绕过校验重试推送。
