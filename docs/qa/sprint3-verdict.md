# QA Verdict — Sprint 3

**Date**: 2026-07-05
**Sprint**: 3
**Verdict**: PASS

## Summary

Sprint 3 Feature Sprint 主流程（Home → Learn → 粘贴文本 → GoalSelect → Episode 学习包）已在真实运行环境端到端跑通，覆盖 iPhone SE (375×667) / iPhone 14 (390×844) / iPhone 15 Pro Max (430×932) 三档手机视口，0 console error，3 个 API 调用（import/generate/jobs）全部 200。

Smoke test 期间发现 2 个 bug 并已修复验证：BUG-00003（Blocker，no-DB 无 GLM fallback）+ BUG-00004（Medium，GoalSelect 返回后按钮 disabled）。

## Per-Story

| Story | Verdict | Confidence | Notes |
|-------|---------|-----------|-------|
| STORY-00021 | PASS | HIGH | Episode 快照卡片渲染完整：一句话主题 + 3 核心点 + 3 维度评分（8/7/6）+ 时长 + 2 受众 tag。见 smoke-03。 |
| STORY-00030 | PASS | HIGH | GoalSelect 5 目标按钮渲染 + 点击 POST /generate + 跳转。BUG-00004 fixed & verified。见 smoke-02。 |
| STORY-00031 | PASS | HIGH | POST /generate 返回 jobId+processing，GET /jobs 轮询到 ready，GET /packs 返回完整 pack。BUG-00003 fixed & verified。 |
| STORY-00032 | PASS | HIGH | Episode 页 6 步学习路径 + 3 知识卡片 + 3 行动计划（今天/本周/长期）。见 smoke-03。 |
| STORY-00033 | PASS | MEDIUM | no-DB mock pack 结构完整（通过 Episode 页端到端渲染间接验证）。直查 GET /api/packs/1 raw JSON 未单独取证 —— 置信度 MEDIUM。 |

## Bugs (found + verified)

- **BUG-00003**（Blocker，STORY-00031）：no-DB 模式 generate 无 GLM fallback，GLM_API_KEY 是 placeholder 时用户被阻塞。Fix：`backend/src/routes/generate.js` no-DB 分支检测 key 无效则调 `buildMockPack`。Verified via smoke re-run.
- **BUG-00004**（Medium，STORY-00030）：GoalSelect 从 Episode goBack 回来后 5 个按钮全 disabled。Fix：`app/goal-select.tsx` 用 `useFocusEffect` 重置 loading/loadingGoal/error state。Verified via smoke re-run.

## Untested Paths

- Chinese language input flow（本 Sprint 只测了 547 字英文样本）
- Real GLM API key generation（只测了 placeholder → mock fallback）
- DB 模式（只测了 no-DB in-memory）
- Job polling failure/timeout
- Pack generation malformed input error branch
- Rapid double-tap on goal button race condition
- Deep nav regression: Episode → back → Learn → re-import
- Landscape orientation on any viewport
- Accessibility: screen reader / dynamic type scaling

## Knowledge Updates (appended to docs/qa/knowledge.md)

- no-DB 模式必须为所有 AI 依赖 Story 提供确定性 mock fallback；Sprint 0 立项时就应检查。
- GoalSelect 类多按钮页面从下游 route 返回时需要显式 useFocusEffect 重置 state — 加入 UX 回归清单。
- 三档手机视口截图（iPhone SE / 14 / 15 Pro Max）现为 K0 UI Sprint 基线 — 记录到 TECH_SPEC §viewports。
- Happy-path 端到端渲染可作为 backend 结构 AC 的间接证据，但直接 JSON 证据仍建议采集以将置信度从 MEDIUM 提到 HIGH。
- 语言自动识别只测了英文；中文/混合语言路径必须在项目完成前显式排期。

## Evidence

`docs/qa/sprint3-evidence/`：smoke-01 (Home iPhone 14), smoke-02 (GoalSelect iPhone 14), smoke-03 (Episode full page iPhone 14), smoke-04 (Home iPhone SE), smoke-05 (Home iPhone 15 Pro Max)。
