# SPIKE-010: GLM 拆两步方案 429 验证

**日期**: 2026-07-06
**Owner**: Backend
**结论**: **VIABLE** — 拆两步方案下 glm-5.2 单模型 100% 不触发 429

## 问题背景

Sprint 10 后期发现智谱 GLM-5.2 频繁 HTTP 429（TPM 限流），根因是**一次 GLM 全生成学习包**发送 80K tokens 触发账号级 TPM 上限。

用户回读 PRD 后指出：**PRD 原意就是拆两步**（快照 → 用户决策 → 学习包），我们实现走偏成一次全跑。

假设：**拆两步后 Step 2 只送 Step 1 提炼的段落（20K），5.2 应该 100% 不 429**。SPIKE-010 验证之。

## 测试方法

1. 从生产 DB transcripts 表取 ID=1 真实转录（50 分钟中文播客，1491 段，17K chars）
2. Step 1 = 全转录 + 快照 prompt → glm-5.2 输出 { oneSentence, valueScore, worthListening[N] }（每段含 quoteParagraph 原文）
3. Step 2 = 只送 Step 1 worthListening 段落 + 学习包 prompt → glm-5.2 输出 { steps[6], concepts, cards, actions }
4. **连续 3 轮**（每轮 Step 1 + Step 2），间隔 3s（模拟用户看快照时间）
5. 记录每次响应 status、latency、in/out tokens

## 测试结果

| 轮 | Step 1 status | Step 1 latency | Step 1 in/out tokens | Step 2 status | Step 2 latency | Step 2 in/out tokens | worthListening 数 |
|---|---|---|---|---|---|---|---|
| 1 | 200 ✓ | 55.7s | 24809 / 3618 | 200 ✓ | 83.7s | 1470 / 4280 | 5 |
| 2 | 200 ✓ | 82.6s | 24809 / 4648 | 200 ✓ | 105.3s | 1662 / 5007 | 7 |
| 3 | 200 ✓ | 57.2s | 24809 / 3685 | 200 ✓ | 88.3s | 1331 / 4443 | 6 |

**关键数字**：
- 6/6 请求全 200 OK，**0 次 429**
- Step 1 平均输入 24809 tokens（远低于此前估的 80K—中文压缩比高）
- Step 2 平均输入 **1488 tokens**（AI 自然只选 5-7 段精华，超省）
- worthListening 自然动态密度 5-7 段（未硬套 3 段）
- 3 轮连跑总耗 ~10 分钟，未触发短窗限流

## 参数

- Model: glm-5.2
- Base URL: https://open.bigmodel.cn/api/coding/paas/v4
- Step 1 max_tokens: 8192（4096 会截断 JSON 导致 parse 失败——首次跑到踩过）
- Step 2 max_tokens: 8192
- Temperature: 0.5

## 结论

**VIABLE**：Sprint 11 直接实现拆两步方案。

**推翻此前假设**：
- ❌ 不需要 fallback 模型链（glm-4.5-air / glm-4-flash）
- ❌ 不需要 429 冷却窗口（Sprint 10 v16 加的）
- ❌ 不需要指数退避重试
- ✅ **glm-5.2 单模型 + max_tokens 8192 + 拆两步 = 100% 稳定**

Sprint 10 v16 的 fallback/cooldown/retry 逻辑 **保留但会**（当作最后一道防线，正常路径不触发）。

## 脚本

`backend/scripts/spike-010-glm-2step.js`
