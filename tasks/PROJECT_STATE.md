# Project State — K0

**Last updated**: 2026-07-05
**Current phase**: Sprint 3 — Planning

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
- `docs/PRD.md` v1.0 locked
- `docs/TECH_SPEC.md` v2.0 (CR-001 applied)
- `docs/DISCOVERY.md` v1.1
- `docs/API_SPEC.md` v1.0
- `docs/UI_SPEC.md` v1.1
- `docs/DB_SCHEMA.md` v1.0
- Style F confirmed (CP1), CP2 passed

### Sprint 1 ✓ COMPLETE (2026-07-05) — Spike Sprint
- SPIKE-001: YouTube 字幕抓取 → NOT VIABLE (GFW blocked) → 产品降级到手工粘贴
- SPIKE-002: Apple/Spotify RSS → VIABLE
- SPIKE-003: GLM-4-plus JSON 生成 → VIABLE
- SPIKE-004: Docker backend 部署 → VIABLE (pending user SSH)
- SPIKE-005: react-native-web + Playwright → VIABLE
- SPIKE-006: EAS Build → TestFlight → BLOCKED (credential-dependent, carried to Sprint 2)
- STORY-00001: Expo 骨架 + 字体 → Done
- STORY-00002: Backend 骨架 + auth middleware → Done
- STORY-00003: RN 3-入口首页 (风格 F) → Done

### Sprint 2 ✓ COMPLETE (2026-07-05) — Feature Sprint
- STORY-00090: Sprint 1 tech debt carry-forward → Done
- STORY-00091: UX polish (Home M2/M3/M4) → Done
- STORY-00011: Apple Podcasts 元数据抓取 backend → Done
- STORY-00010: Learn 屏幕 UI + 联调 → Done
- STORY-00013: 语言自动识别 → Done
- STORY-00020: GLM 快照端点 → Done
- SPIKE-006: EAS Build → still BLOCKED (carried to Sprint 3)
- QA verdict: PASS · UX verdict: ACHIEVED · Arch review: PASS
- 2 bugs found/fixed: BUG-00001 (canGoBack), BUG-00002 (GLM_API_ERROR 502)

---

## Sprint 3 — IN PLANNING

**Next Stories (candidates from backlog)**:
- STORY-00021: 快照 UI 卡片 + 3 后续动作按钮 (E-002)
- STORY-00030: 学习目标 5 选 1 UI + 参数传递 (E-003)
- STORY-00031: 6 步学习路径生成 GLM backend (E-003)
- STORY-00040: 单集页面：状态栏 + 快照区 + 路径打勾 (E-004)

**Open items**:
- SPIKE-006: EAS Build → TestFlight (still credential-dependent, low priority)

---

## Open Bugs

None (all Sprint 2 bugs Closed).

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
| `docs/qa/knowledge.md` | Sprint 2 updated | 2026-07-05 |
| `docs/ux/knowledge.md` | Sprint 2 updated | 2026-07-05 |
