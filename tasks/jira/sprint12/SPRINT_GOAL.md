# Sprint 12 Goal

**Sprint**: 12
**Start**: 2026-07-07
**Theme**: Frank 22 问题修复 + 卡片结构 v3 重构

**One-sentence Goal**: 修复 Frank 手机测试暴露的 22 个问题，重点是卡片结构重构（4+1 字段：quote+insight+timestamp+context+myNote）+ 6 页 UI 一致性 + Step 2 后台恢复实测。

## Stories

| Story | Points | Owner | Priority | 对应问题 |
|---|---|---|---|---|
| STORY-01201 修卡片删除崩溃 | 1 | Frontend | P0 Blocker | #17 |
| STORY-01202 修 Step 2 job 后台恢复实测 | 2 | Frontend/Backend | P0 | #12 |
| STORY-01203 卡片结构 v3 重构 | 3 | Full | Must | #18 |
| STORY-01204 Prompt v4 重写 | 2 | Backend | Must | #6,#16,#18,#19 |
| STORY-01205 UI 一致性大修 | 3 | Frontend | Must | #1-5,#10,#13-15 |
| STORY-01206 摘要转录 + 段落制 | 2 | Full | Must | #8,#20 |
| STORY-01207 快照页禁左滑回退 | 0.5 | Frontend | Must | #9 |
| STORY-01208 Review 翻面 + SRS Mock 验证 | 2 | Full | Must | #21,#22 |
| STORY-01209 快照页评分+胖字体 | 1 | Frontend | Must | #6,#7 |
| STORY-01210 Sprint 12 QA + OTA v17 | 1 | SM/QA | Must | - |

**Total: ~17.5 points**

## 关键决策（Frank 头脑风暴逐条确认）

- **卡片新字段（4+1）**：quote / insight / timestamp+▶(占位) / context(展开) / myNote(用户可编辑)
- **删除字段**：type / core / usage / challenge / AI myApplication
- **音频回放**：Sprint 12 仅占位 ▶，Sprint 13 专项实现真回放（expo-av spike）
- **行动清单**：GLM prompt 允许空档；前端"此集没提供这一档行动建议"优雅提示
- **速学 vs 快照**：速学独立页面但 UI 完全对齐快照
- **删测验**：已 Sprint 11 CR-003 生效，本 Sprint 无涉

## 依据

- 3 个 subagent 调研共识（Snipd/Anki/Zettelkasten/Cornell/得到/微信读书/Baymard/NN-g）
- Frank 22 问题清单
- Sprint 11 完成后手机实测反馈

## Constraints

- 允许 OTA（Frank 授权）
- 禁止 EAS build（native 变更）
- Backend prompt 改动 + 数据结构变化，无需 alter table（pack_json 是 JSON 列）
- OTA-safe: 无 app.json 变更、无新 top-level native import
