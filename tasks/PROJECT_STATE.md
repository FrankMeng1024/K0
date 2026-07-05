# Project State — K0

**Last updated**: 2026-07-05
**Current phase**: Sprint 3 COMPLETE → Sprint 4 Planning

---

## Status Overview

- **Project type**: iOS Native App（CR-001）
- **Acceptance mode**: auto (Mode 2)
- **Chosen style**: F — Cutout Illustrated（CP1 已过）
- **Tech stack**: React Native + Expo（App）· Express + mysql2（Backend，沿 Cairn） · MySQL 8 on 122.51.174.118 · GLM-4-plus · api.k0.yiiling.cn
- **Git**: Strategy A（每 Story Done + 每 bug 修复 commit），推 main

---

## Sprint History

### Sprint 0 ✓ COMPLETE (2026-07-04)
Docs 全部建立，Style F 确认。

### Sprint 1 ✓ COMPLETE (2026-07-05) — Spike Sprint
6 个 Spike 全部结论，5 VIABLE + 1 BLOCKED (EAS)。

### Sprint 2 ✓ COMPLETE (2026-07-05) — Feature Sprint
Home + Learn 完整流程 + 快照 backend。

### Sprint 3 ✓ COMPLETE (2026-07-05) — Feature Sprint
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

## Sprint 4 — IN PLANNING

**主题**: 美术精修 + iOS 原生 UX 校准

**Stories (总点数 25)**：
- STORY-00100 Design 插画精修（撕纸边+多层+错位）
- STORY-00101 Home 底部固定 primary CTA
- STORY-00102 GoalSelect 顺序重排 + preview 改进
- STORY-00103 Episode 评分/进度视觉重做（撕纸风）
- STORY-00104 iPhone SE 小屏卡片优化
- STORY-00105 微交互全套（tilt / haptic / 页面过渡）
- STORY-00106 iOS 原生返回样式 + back gesture
- STORY-00107 pill/chip 视觉分级
- STORY-00110 中文长文本粘贴 flow 验收

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
