# Project State — K0

**Last updated**: 2026-07-04（CR-001 应用后）
**Current phase**: Sprint 0 完成中期 → **CR-001 平台变更（Web → iOS RN+Expo）已批准** → 重写 Sprint 1 → CP2 → Sprint 1 启动

---

## Status Overview

- **Project type**: iOS Native App（CR-001）
- **Acceptance mode**: auto (Mode 2)
- **Chosen style**: F — Cutout Illustrated（CP1 已过）
- **Tech stack**: React Native + Expo（App）· Express + mysql2（Backend，沿 Cairn） · MySQL 8 on 122.51.174.118 · GLM-4-plus · api.k0.yiiling.cn
- **Git**: Strategy A（每 Story Done + 每 bug 修复 commit），推 main

## Sprint 0 已完成
- [x] `docs/PRD.md` v1.0（业务逻辑不变，非功能性要求需微调 iOS 版）
- [x] `docs/TECH_SPEC.md` **v2.0**（CR-001 应用后大改完成）
- [x] `docs/DISCOVERY.md` v1.1（Project Type 已改 iOS）
- [x] `docs/API_SPEC.md` v1.0（REST 契约不变）
- [x] `docs/UI_SPEC.md` v1.1（+ §chosen-style；后续需加 RN 组件章节）
- [x] `docs/DB_SCHEMA.md` v1.0（迁移方式从 Prisma 改为 mysql2 手写 SQL）
- [x] `docs/CR.md`（含 CR-001）
- [x] `docs/BACKLOG.md`
- [x] `docs/qa/knowledge.md`（Sprint 0 initial —— 需加 RN Web + Playwright 章节）
- [x] `docs/ux/knowledge.md`（Sprint 0 initial —— 需加 iOS UX 章节）
- [x] `tasks/lessons.md`（Sprint 0 entries）
- [x] 风格 F 5 页 showcase
- [x] CP1 用户风格确认

## CR-001 待应用的文档更新
- [ ] `docs/PRD.md § 六 非功能性要求` 更新 iOS 目标（safe area、touch target、iOS 设备尺寸）
- [ ] `docs/UI_SPEC.md` 加"RN 组件映射"章节（撕纸滤镜在 RN 用 SVG，字体用 expo-font）
- [ ] `docs/DB_SCHEMA.md` 迁移策略更新
- [ ] `docs/qa/knowledge.md` 加 react-native-web + Playwright 章节
- [ ] `docs/ux/knowledge.md` 加 iOS HIG 关键条款
- [ ] `docs/BACKLOG.md` Story ID 前缀不变，说明中把"页面"改成"屏幕"

## Sprint 1 待完成（重写后）
- [ ] Sprint 1 Story 全部重写（6 Spike + 3 Foundation Story，见任务 #19）
- [ ] Expo 项目初始化（不是 Next.js）
- [ ] Backend Docker 部署到 122.51.174.118 上（新 service）
- [ ] CP2 用户 Sprint 0 完成确认
- [ ] 首次 git commit

## Sprint 1 计划（Spike Sprint —— 已按 CR-001 重排）

**目标**：6 个 Spike 全部 VIABLE + Expo App 骨架 + Backend 上线

| ID | 主题 | Owner |
|----|------|-------|
| SPIKE-001 | YouTube 官方字幕抓取 | Backend |
| SPIKE-002 | Apple/Spotify RSS 抓取 | Backend |
| SPIKE-003 | GLM-4-plus 结构化 JSON 生成 | Backend |
| SPIKE-004 | api.k0.yiiling.cn Docker + MySQL 隔离部署 | Backend + DevOps |
| SPIKE-005（**新**） | react-native-web + Playwright 集成可行性 | Frontend + QA |
| SPIKE-006（**新**） | Expo EAS Build 从 Windows 出 iOS TestFlight 包 | DevOps + Frontend |
| STORY-00001 | Expo 项目骨架 + Font 加载 + 健康检查 | Frontend + DevOps |
| STORY-00002 | Backend 骨架（Express+mysql2）+ auth middleware | Backend |
| STORY-00003 | RN 3 入口首页（风格 F 移植） | Frontend |


---
