# SPIKE-003: GLM-4-plus 端到端结构化 JSON 生成

**Status**: **VIABLE WITH CONDITIONS** ✅
**Date**: 2026-07-04
**Executor**: Backend
**Location**: `_spike/spike-003/`

---

## 目标（回顾）
验证 GLM 系列模型能否稳定输出完整学习包 JSON（快照 + 6 步路径 + 5-10 卡片 + 3 行动 + 3-5 测验），中英文均可。

## 环境
- Node 25.8.2 + fetch (原生)
- zod 3.23.8 (schema 校验)
- API: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- Model: `glm-4-flash`（用户提供 API key 对 glm-4-plus 余额不足，用户建议改用 flash——已验证）
- 参数: `temperature=0.3, top_p=0.7, max_tokens=4096, response_format={type:"json_object"}`

## 测试内容

5 个真实转录样本：
- `en-01-huberman-sleep` (英，睡眠工具箱)
- `en-02-lex-agi` (英，智能与压缩)
- `en-03-tim-focus` (英，晨间三页笔记)
- `zh-01-luoji` (中，读书四层)
- `zh-02-jike` (中，创业死因)

对每个样本调用 GLM，用 zod schema 校验输出。

## 结果

| Sample | Status | Latency | In tokens | Out tokens |
|---|---|---|---|---|
| en-01-huberman-sleep | ✅ ok | 27.9s | 832 | 1029 |
| en-02-lex-agi | ✅ ok | 25.8s | 802 | 963 |
| en-03-tim-focus | ✅ ok | 21.8s | 819 | 867 |
| zh-01-luoji | ✅ ok | 21.1s | 836 | 874 |
| zh-02-jike | ✅ ok | 24.8s | 867 | 875 |

**总结**:
- **成功率 5/5**（100%）
- **平均 latency**：24.3s（低于 60s 门槛）
- **Token 消耗**：平均 in≈831 / out≈922（每次总计约 1.75k tokens）
- **每次学习包成本估算**：¥0.0876（glm-4-flash 定价，注意实际以官方为准）
- **JSON schema 全通过**（zod strict 校验：snapshot 3 观点、path 6 步、cards 5-10、quiz 3-5、correct_index 0-3 全部满足）

原始输出保存在 `_spike/spike-003/results.json`。

## 已知问题（PRODUCTION 前需修）

### 问题 1: 英文输入 → 中文输出（关键，Sprint 2 前必修）

用户 prompt 说 `语言：en` 且 system prompt 说"所有字符串使用与输入相同的语言"，但 glm-4-flash 5 次英文样本全部返回**中文 snapshot / cards / quiz**：

- `en-01`: snapshot="通过调整光照、温度和避免咖啡因来改善睡眠质量" (中文)
- `en-02`: snapshot="智慧不仅仅是解决问题，更是压缩信息的能力。" (中文)
- `en-03`: snapshot="每天写三页晨间笔记能提高生产力" (中文)

**Fallback 策略（Sprint 2 前实施，二选一）**:
1. **强化 prompt**：把语言指令挪到 user prompt 开头 + 加英文示例："Output MUST be in English if input is English. Example output for English input: `snapshot.one_line`: 'The most important habit is X.' etc." 再测
2. **换 glm-4-plus 或 glm-4-air（用户充值 / 换更强模型）**：glm-4-flash 是免费级，跟随指令能力弱；付费模型跟随英文更好
3. **两次调用**：先用 GLM 生成中文，再翻译回英文。慢一倍，成本翻倍。**不推荐**

**推荐 Sprint 2 决策**：先 (1) 优化 prompt，若仍不行则 (2) 换 glm-4-air / glm-4-plus。

### 问题 2: 24s latency 用户可感知

平均 24s 生成一个学习包，MVP 阶段 UX 需给 loading + 进度提示。可考虑 SSE streaming（`stream: true`）分块推送到 UI。

### 问题 3: cards 数量偏少

样本中 cards 大多为 5-8 张，偏 lower bound。若产品要求"知识密度"更高，Sprint 2 需在 prompt 里明确"至少 8 张"或引入二次调用补齐。

### 问题 4: 成本

¥0.0876/pack（flash 免费级理论上极便宜；上面成本估算按 0.05¥/千 tokens 简化）。glm-4-plus 定价约 0.05 元 / 千 tokens input + 0.05 元 / 千 tokens output（若付费用 plus，成本类似）。若日活 100 用户 × 每人 3 pack = 300 pack/day = 约 ¥26/day = ¥800/month，对个人产品可承受。

## 结论

**VIABLE WITH CONDITIONS**：
- 技术链路（API 调用、JSON 强制、schema 校验）100% 通
- **前提**：Sprint 2 必须修复"英文输入返回中文"的 prompt 问题（问题 1），否则 M2/M3 播客场景失效
- 成本、latency 均在可承受范围

## 采纳到 knowledge

- `docs/qa/knowledge.md` 追加：SPIKE-003 GLM-4-flash 已验证 JSON 生成链路稳定，Sprint 2+ 关注英文输出问题
- `docs/prompts/glm-learning-pack.md` 保留 v1.0，Sprint 2 前将出 v1.1 修复语言问题

---
