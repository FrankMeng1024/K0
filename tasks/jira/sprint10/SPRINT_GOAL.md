# Sprint 10 Goal

**Sprint**: 10
**Start**: 2026-07-06
**Theme**: PRD Must-Have 收尾 — 概念解释器 + 卡片完整交互 + 测验题 + 闪卡

**One-sentence Goal**: 完成 PRD Must-Have M4-B / M4-C / M4-D / M5 全部剩余功能，让 K0 Learning Pack 真正"从看完到记住"。

## Stories

| Story | Points | Owner | Priority |
|---|---|---|---|
| STORY-01001 概念解释器 | 3 | Backend + Frontend | Must |
| STORY-01002 卡片删除 UI | 1 | Frontend | Must |
| STORY-01003 卡片"我的应用"字段 | 2 | Backend + Frontend | Must |
| STORY-01004 行动清单勾选进 Review | 2 | Backend + Frontend | Must |
| STORY-01005 测验题生成 + 答题 UI | 3 | Backend + Frontend | Must |
| STORY-01006 闪卡模式 | 2 | Frontend | Must |
| STORY-01007 GLM prompt 稳定 worthListening/skippable | 1 | Backend | Should |

**Total: ~14 points**（1 developer 1-2 天/2 points，Sprint 10 上限 14 合理）

## PRD Coverage Post-Sprint

Sprint 10 完成后，PRD Must-Have MVP 覆盖率将达到 **~100%** —— 剩余仅优化项（YouTube/Spotify、AskAI、audio_url 过期刷新）已在"Won't have"或"Should have"。

## Constraints

- 严格遵守 Sprint 9 事故教训：所有 OTA 改动**必须 OTA-safe**
  - 无 `app.json` plugin/native config 变更
  - 无新增 top-level native import
  - 无新增 native npm 依赖
- 全部用 web Playwright QA + iOS 视口验证
- 每个 Story Done 后单独 commit（便于回滚）
- Sprint 结束一次性推 OTA v8
