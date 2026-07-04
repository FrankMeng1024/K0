# CR.md — K0 Change Requests

本文件是 PRD 之外所有需求变更的正式记录。PRD 一旦锁定不可直接编辑，所有变更走 CR。

**格式规范**:
```
## CR-NNN: [标题] (Sprint N)
**状态**: Approved | Withdrawn | Done
**批准者**: PO
**批准日期**: YYYY-MM-DD
**关联 Story**: STORY-NNNNN, ...

变更内容一句话说明。若与 PRD 冲突，CR 优先。
```

---

## CR-001: 平台从 Web 变更为 iOS 原生 App (Sprint 0/1 交界，2026-07-04)
**状态**: Approved
**批准者**: PO / 用户直接指令
**批准日期**: 2026-07-04
**关联 Story**: 所有 Sprint 1 Stories 需重写；TECH_SPEC 大幅重写；UI_SPEC 保留视觉风格但适配 RN 组件；PRD 保留业务逻辑不变。

### 变更内容
K0 从 **Full-Stack Web Application** 变更为 **iOS 原生 App（React Native + Expo）**。发布渠道为 App Store，通过 TestFlight 做内部测试。

### 关键决策（用户确认于 2026-07-04）
1. **技术栈**: React Native + Expo（不是 Swift/Flutter/Capacitor）
2. **QA 策略**: QA 仍用 Playwright 测 Web 版 —— 具体测 **`react-native-web`** 渲染的 Web 版（RN 组件在浏览器里跑）。iOS 原生细节由 TestFlight 内测覆盖。
3. **Backend**: 用户提示 —— yiiling.cn 服务器 + 数据库已有，我们有权限，可参考 Cairn 项目的用法。SM 待 Arch 确认后写入 TECH_SPEC。
4. **PRD 业务逻辑不变**：M1-M7 所有 Must-Have 功能保持；只是渲染载体从 Web 页面变成 iOS App 屏幕。

### 影响范围
| 文件 | 影响 |
|------|------|
| `docs/PRD.md` | 业务逻辑不变。§六 非功能性要求需更新（移动 375px 变成 iOS device sizes；深色模式 iOS 系统跟随；性能目标改成 mobile 标准） |
| `docs/TECH_SPEC.md` | **大改**：stack 换 RN+Expo；deploy 改成 TestFlight/App Store；start script 变 Expo CLI；test runner 改 Playwright 测 RN Web；viewports 改 iOS device sizes |
| `docs/UI_SPEC.md` | 保留 §chosen-style（风格 F Cutout Illustrated）；组件从 HTML/CSS 转为 RN styled 组件 |
| `docs/DB_SCHEMA.md` | 保留；数据库位置改为 yiiling.cn（待 Arch 与 Cairn 项目对齐后确认） |
| `docs/API_SPEC.md` | 保留（REST API 契约不变），只是消费者从 Web 前端变成 RN App |
| `tasks/jira/sprint1/` | 全部 Story 重写：SPIKE-004 MySQL 改用 yiiling.cn；STORY-00001 Next.js 改 Expo；STORY-00003 前端骨架改 RN + react-native-web |
| `docs/qa/knowledge.md` | 加 RN Web 测试策略章节 |
| `docs/ux/knowledge.md` | 加 iOS UX 规范（safe area、touch targets、iOS gesture pattern） |

### 明确保留（不受影响）
- PRD 业务目标、成功指标、成功承诺
- Product Soul（专注/可完成/值得信赖）
- 风格 F 视觉基因（撕纸剪贴/胖字母/6 色板/牛皮纸背景）
- GLM-4-plus AI 选型
- Acceptance mode: auto (Mode 2)

### PO 备注
这是**架构级 CR**，会导致 Sprint 1 完全重新计划。所有已建的 Sprint 1 Story 文件需要 SM 逐个重写。

---

