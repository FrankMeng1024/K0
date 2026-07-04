# SPIKE-003: GLM-4-plus 端到端结构化 JSON 生成

**Epic**: E-002/E-003
**Sprint**: Sprint 1
**Points**: 5
**Owner**: Backend
**Status**: Done

## Description
As Arch, I want to verify GLM-4-plus 能否稳定输出完整学习包 JSON（快照 + 6 步 + 5-10 卡 + 3 行动 + 3-5 测验）。

## Expected Result
`docs/spike-results/SPIKE-003.md` 包含 Prompt 模板、5 次调用输出、latency、schema validity、成本估算。

## Acceptance Criteria
- [ ] 5 次调用 5 次成功或明确失败模式
- [ ] 每次 wall-clock < 60 秒
- [ ] 输出 JSON 全部通过 zod schema
- [ ] 中/英文对应输出
- [ ] Prompt 保存到 `docs/prompts/glm-learning-pack.md`
- [ ] 每次学习包生成成本估算
