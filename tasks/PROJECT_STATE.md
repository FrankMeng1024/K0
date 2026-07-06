# Project State — K0

**Last updated**: 2026-07-07
**Current phase**: Sprint 11 COMPLETE → OTA v15 已推 → 手机验证方案 v2

---

## Status Overview

- **Project type**: iOS Native App（CR-001）
- **Acceptance mode**: auto (Mode 2)
- **Chosen style**: F — Cutout Illustrated（CP1 已过）
- **Tech stack**: React Native + Expo（App）· Express + mysql2（Backend，沿 Cairn） · MySQL 8 on 122.51.174.118 · GLM-4-plus · api.k0.yiiling.cn
- **Git**: Strategy A（每 Story Done + 每 bug 修复 commit），推 main

---

## Sprint History

### Sprint 10 ✓ COMPLETE (2026-07-06) — PRD Must-Have 收尾

**主题**：概念解释器 + 卡片完整交互 + 测验题 + 闪卡 + 行动承诺

- STORY-01001 概念解释器 → Done（GLM prompt + Episode 页 ConceptsPanel 三层折叠）
- STORY-01002 卡片删除 → Done（user_cards.archived + PATCH endpoint + confirm UI）
- STORY-01003 卡片"我的应用" → Done（GLM myApplication + personal_note 覆盖 + inline 编辑）
- STORY-01004 行动清单 → Review 承诺 → Done（migration 006 user_actions 表 + 4 endpoints + Episode checkbox + Review 承诺 section）
- STORY-01005 测验题 → Done（QuizPanel 组件 MCQ + short answer + 得分汇总）
- STORY-01006 闪卡模式 → Done（Review 屏本身即闪卡，Sprint 8 Loop 30 已实装）
- STORY-01007 worthListening/skippable → Done（zh/en prompt 强化 required + 详细约束）
- **Backend deploy PENDING**：新 `/api/review/actions*` endpoints 未部署到生产（app 侧 .catch{} 兜底不崩）
- **OTA v8 推送成功**：Update Group `8d835202-8a38-4ff7-84cf-cd9ce72d424c`，commit `8315387`
- **push 到 GitHub 失败**（网络代理），commit 本地保留

**PRD Must-Have 覆盖率**：~100%（M1 YouTube/Spotify 因 spike blocked 保留 xiaoyuzhou/Apple 覆盖）

---

### Sprint 0 ✓ COMPLETE (2026-07-04)
Docs 全部建立，Style F 确认。

### Sprint 1 ✓ COMPLETE (2026-07-05) — Spike Sprint
6 个 Spike 全部结论，5 VIABLE + 1 BLOCKED (EAS)。

### Sprint 2 ✓ COMPLETE (2026-07-05) — Feature Sprint
Home + Learn 完整流程 + 快照 backend。

### Sprint 4 ✓ COMPLETE (2026-07-05) — UX Polish Sprint

**主题**：美术精修 + iOS 原生 UX 校准（回应 Sprint 3 UX 7 Critical + 6 Medium friction）

- STORY-00100: Cutout Illustrated 插画精修 → Done（撕纸 scale 9→18，多层阴影+高光）
- STORY-00101: Home 底部固定 PasteBar → Done（primary CTA 落拇指区）
- STORY-00102: GoalSelect 反转 + preview 改进 + 移除冗余 pill → Done
- STORY-00103: Episode 撕纸评分 + PathRibbon 进度带 + goalStatusPill → Done
- STORY-00104: iPhone SE 响应式尺寸 → Done
- STORY-00105: 微交互全套（tilt+haptic+页面 spring 浮入）→ Done
- STORY-00106: iOS 原生返回样式"‹ 首页" → Done
- STORY-00107: pill/chip 视觉分级 → Done（Episode goalStatusPill 独立样式，BubbleTag 未加 variant prop）
- STORY-00110: 中文长文本 flow 端到端验收 → Done
- Arch review: PASS · QA verdict: PASS · UX review: HIGH confidence（Sprint 3 全部 Critical 消除）
- **无新 bug**

## TestFlight 首发准备（进行中）

准备 EAS Build iOS binary + Expo Updates OTA 配置，让 Sprint 5+ JS 改动可 OTA 推送。

---

## Sprint 3 ✓ COMPLETE (2026-07-05) — Feature Sprint
- STORY-00021: 快照 UI 卡片 → Done
- STORY-00030: 学习目标 5 选 1 UI → Done
- STORY-00031: 学习包 backend + job system → Done
- STORY-00032: 单集详情页 6 步 + 卡片 → Done
- STORY-00033: DB migrations + mock data → Done
- Arch review: PASS · QA verdict: PASS · UX review: HIGH confidence
- 2 bugs found/fixed: BUG-00003 (Blocker: no-DB GLM fallback), BUG-00004 (Medium: GoalSelect state reset)
- **UX 发现 7 个 Critical friction**（美术粗糙 + iOS 原生模式偏差）→ 全部转 Sprint 4 Story
- **验收视口**：iPhone SE 375×667 / iPhone 14 390×844 / iPhone 15 Pro Max 430×932（三档全覆盖，之后每 Sprint 保持）

---

## Sprint 4 — COMPLETE (see above)

---

## Open Bugs

None（Sprint 3 BUG-00003/00004 均 Verified，Sprint 4 Planning 前会 SM 关档）。

---

## CR Tracker

| CR | Status | Sprint |
|----|--------|--------|
| CR-001 | Done | Sprint 0/1 |

---

## Key Docs

| Doc | Version | Last updated |
|-----|---------|--------------|
| `docs/PRD.md` | v1.0 | 2026-07-02 |
| `docs/TECH_SPEC.md` | v2.0 | 2026-07-04 |
| `docs/API_SPEC.md` | v1.0 | 2026-07-04 |
| `docs/UI_SPEC.md` | v1.1 | 2026-07-04 |
| `docs/DB_SCHEMA.md` | v1.0 | 2026-07-04 |
| `docs/qa/knowledge.md` | Sprint 3 updated | 2026-07-05 |
| `docs/ux/knowledge.md` | Sprint 3 updated | 2026-07-05 |
| `docs/qa/sprint3-verdict.md` | PASS | 2026-07-05 |
| `docs/ux/sprint3-review.md` | HIGH conf, 7 Critical | 2026-07-05 |
| `docs/arch/sprint3-review.md` | PASS | 2026-07-05 |
