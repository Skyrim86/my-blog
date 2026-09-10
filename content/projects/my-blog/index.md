---
title: "本博客"
date: 2026-09-10
draft: false
description: "用 Hugo + PaperMod 搭建的静态博客：课程、项目、系列文章与自托管 KaTeX"
tech: ["Hugo", "Go Template", "CSS", "GitHub Actions"]
repo: "https://github.com/Skyrim86/my-blog"
categories: ["项目"]
---

这是本站本身，也算一个持续维护的项目：从零配置 Hugo 主题，逐步加上评论、系列导航、课程结构与项目展示。

## 做了什么

- **主题定制**：PaperMod 直接 vendored 进仓库，所有改动走主题预留的 hook，不复制主题模板
- **评论**：Giscus，并写了一段主题同步脚本让评论区跟随站点明暗切换
- **系列文章**：front matter 写 `series` 即自动生成同系列导航
- **课程结构**：课程 → 章 → 学习笔记/作业，笔记里的公式按需加载自托管的 KaTeX
- **项目展示**：即本页所在的 section，技术栈与仓库链接从 front matter 自动渲染
- **部署**：push 到 main 后由 GitHub Actions 自动构建并发布到 GitHub Pages

## 工程取向

自定义层只保留必要的东西：JS 放 `assets/js/` 经 minify + fingerprint 外链，CSS 按职责拆分为编号文件由主题合并，UI 文案集中在 `i18n/zh.toml`。仓库根目录的 `AGENTS.md` 记录了全部结构与约定。
