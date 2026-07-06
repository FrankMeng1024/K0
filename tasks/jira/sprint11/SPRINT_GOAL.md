# Sprint 11 Goal

**Sprint**: 11
**Start**: 2026-07-06
**Theme**: 方案 v2 完整重构 — GLM 拆两步 + 快照/学习包分离 + UI 全面对齐首页美学

**One-sentence Goal**: 把 K0 从"一次生成一切"重构为 PRD 原意的"快照 → 用户决策 → 学习包"两步流，同时统一所有内页美学到首页撕纸手工风。

## Stories

| Story | Points | Owner | Priority |
|---|---|---|---|
| STORY-01101 Backend 拆两步 GLM API | 3 | Backend | Must |
| STORY-01102 快照页新建 | 3 | Frontend | Must |
| STORY-01103 学习包页重构（quick/deep 共用） | 3 | Frontend | Must |
| STORY-01104 Library 重构（4 外 tab + 2 内 tab） | 2 | Frontend | Must |
| STORY-01105 Review 卡片视图升级 | 1 | Frontend | Must |
| STORY-01106 抽 ScreenHeader 组件 | 1 | Frontend | Must |
| STORY-01107 Prompt v2（Step 1 + Step 2 独立 prompt） | 2 | Backend | Must |
| STORY-01108 Arch/QA/UX review + OTA v15 | 1 | SM/QA | Must |

**Total: ~16 points**

## 依据

- SPIKE-010 已 3 轮实证：拆两步 glm-5.2 单模型 0 次 429，Step 1 in=25K/out=4-5K，Step 2 in=1.5K/out=4-5K，共 6 次调用全 200
- 7 个 CR 已与用户逐条确认（见 docs/CR.md CR-002 ~ CR-012）
- 现有 packGenerator 保留（Step 2 复用），删除内部 quiz 生成，输出结构升级
- 现有 6 步、概念解释器、行动清单 保留（PRD 原字）
- 卡片字段从 5 → 8，数量 5-10 → 动态 3-18

## Constraints

- 允许 OTA（Frank 授权）
- 禁止 EAS build（native config 变更必先讨论）
- 生产 DB 业务表已 truncate，可自由 alter learning_packs schema
- Backend 拆两步实现后，import 屏 loading 时间从 60-180s 缩到 30-60s（只跑 Step 1）
- 用户点速学/精学 → 触发 Step 2（30-60s loading）
- OTA-safe: 无 app.json plugin/native 变更、无新 top-level native import、无新 package.json 依赖
