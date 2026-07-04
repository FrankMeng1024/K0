# Sprint 3 Goal

**Sprint**: 3
**Duration**: 5-7 天
**Goal**: 用户导入播客后，可以选择学习目标（5 选 1），系统调用 GLM 生成完整学习包（快照 + 6 步路径 + 卡片），并在单集详情页看到快照卡片和学习路径。

---

## Success Metrics
- `POST /api/episodes/:id/generate` 接受 goal 参数，返回 jobId
- `GET /api/jobs/:jobId` 可查询进度（0-100）和结果（packId）
- `GET /api/packs/:id` 返回完整 PackObject（snapshot + steps + cards）
- Learn 屏幕导入成功后，展示 5 个学习目标按钮（≥ 56px 高）
- 选择目标 → 进入单集详情页（Episode screen）
- 单集详情页展示：学习快照（one-sentence + core points + value scores）
- 单集详情页展示：6 步学习路径列表（可打勾）
- 所有 API 端点有 unit test

## Definition of Done（Sprint 级别）
- [ ] STORY-00033, 00030, 00021, 00031, 00032 全部 Done
- [ ] 从 Learn 屏导入 → 选学习目标 → 看到快照卡片 的完整流程可跑通（no-DB mock 模式）
- [ ] Arch subagent review = PASS
- [ ] UX subagent 验证学习目标选择 + 快照展示流程
- [ ] QA subagent verdict = PASS
- [ ] 无未修复 Blocker/Critical bug
- [ ] 每 Story Done 后 git commit（Strategy A）

## Stories in this Sprint

| ID | 类型 | 主题 | Points | Owner |
|----|------|------|--------|-------|
| STORY-00033 | Foundation | DB migrations: learning_packs/steps/cards/snapshots + mock data | 2 | Backend/DBA |
| STORY-00030 | Feature (E-003) | 学习目标选择 UI（5 选 1）+ navigate to episode | 3 | Frontend |
| STORY-00031 | Feature (E-003) | 学习包生成 Backend：generate endpoint + job system + GLM prompt | 5 | Backend |
| STORY-00021 | Feature (E-002) | 快照 UI 卡片组件 + 单集详情页骨架 | 5 | Frontend |
| STORY-00032 | Feature (E-004) | 单集详情页：6 步路径 + 卡片列表 + 打勾 | 5 | Frontend + Backend |

**Total**: 20 points

## Sprint 3 Trade-offs（Arch）
1. GLM 生成学习包同步调用（无 jobs queue）——jobId 机制仍暴露，但 backend 同步等待 GLM 完成，轮询立即返回 ready
2. 无真实 DB（no-DB mock 模式）——Sprint 3 所有 API 在 no-DB 模式下返回 mock 数据；DB 集成推 Sprint 4
3. 6 步学习路径内容 markdown 渲染暂用纯文本展示——Sprint 4 引入 react-native-markdown
4. Ask AI 端点推 Sprint 4

## 已知风险
- GLM 生成全量学习包（snapshot + 6步 + cards + quiz + actions）单次调用可能超 30s → 需测试实际 latency
- SPIKE-006（EAS Build）仍 credential-blocked，不在 Sprint 3 DoD 中
