# Sprint 13 Goal

**Sprint**: 13
**Start**: 2026-07-07
**Theme**: 22 问题全量修复 + 卡片 UI 撕纸风重构 + Review dashboard + 挑战复盘

**One-sentence Goal**: 修完 Frank 22 问题（旧 12 遗留 + 新 10 个），全部符合拼布/撕纸手工风格，Playwright APP 模式验证 + 挑战 subagent 挑刺 + PM/Arch/SM 复盘。

## Stories

12 个 story：01301-01312。总 ~24 points，一个 Sprint。

## 关键产品决策（Frank 头脑风暴确认，5 项）

- **Review 图标**：改 **沙漏/时钟型**，呼应 SRS 时间复利
- **Review 颜色**：黄底 + **深色字**（inkPrimary），对齐 Snipd/得到规范
- **Review 上方**：加**待复习 dashboard**（今日 N 张 / 本周 M 张 / 下次日期 list）
- **Library filter**：全部 **tab 下方**（Snipd/Readwise/Notion 标准）
- **弹窗风格**：所有 double confirm 用**自定义撕纸风 Modal**（禁 native Alert）

## Constraints

- 允许 OTA（Frank 授权）
- 禁止 EAS build（native config）
- Backend prompt 改动 + 数据结构变化，无需 alter table
- OTA-safe: 无 app.json 变更
- **必须 Playwright APP 模式验证并存截图**
- **必须挑战 subagent + PM/Arch/SM 复盘**
