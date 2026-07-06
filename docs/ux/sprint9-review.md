# UX Review — Sprint 9

**Sprint**: 9
**Confidence**: MEDIUM (web-only subset; iOS native paths待下次 build 验证)
**Reviewed by**: UX subagent (first-time-user perspective, web observable + design intent)
**Date**: 2026-07-06

---

## Friction Items

### Critical (immediate fix)

**C1: 首次冷启动就请求推送权限 → 用户 deny → 通知流程失效**
- **Root cause**: `app/_layout.tsx` mount 时无脑调 `initPushNotifications()`，权限弹窗在用户没上下文时出现
- **Fix applied**: 
  - `initPushNotifications` 加 `opts.requestPermission` 参数
  - `_layout.tsx` 冷启动只 `attach listener`（不弹权限）
  - `PasteBar.onSubmit` URL 成功入 job 后触发 `initPushNotifications({ requestPermission: true })`
  - 用户此时刚粘链接明白 App 会做什么 → 权限接受度高
- **Status**: ✅ Fixed in Sprint 9

**C2: import/progress 屏缺"安全最小化"提示**
- **Verified false positive**: `app/import/[jobId].tsx` STAGE_HINTS 中 `generating: '你可以最小化 App，好了会提醒你'` 已存在（Sprint 8 加）
- UX subagent 无源码访问权限，只能推断，误判
- **Status**: ✅ 已实装

### Medium (backlog / already partially addressed)

**M1: Home 卡片"即将上线" → 真数字 flicker**
- **Fix applied**: 骨架态改为 `"…"` 而非"即将上线"
- **Status**: ✅ Fixed in Sprint 9

**M2: 前台恢复 silent refetch 无用户可见反馈**
- **Decision**: 不修。silent 就是设计目标（"无感回归"）；额外提示反成打扰
- **Status**: Backlog（若真机测试反馈"太安静"再加）

**M3: 通知 tap deep-link + 完成庆祝**
- **Verified**: `lib/pushNotifications.ts handleNotificationTap` 已实装 kind=job_ready → `/episode/[id]` 深链
- Episode 屏已有完成庆祝（Sprint 8 Loop 30）
- **Status**: ✅ 已实装（需 EAS build 真机才能视觉验证）

### Low (backlog)

**L1: 冷启动 jobId 恢复无可见 banner**
- 现状：直接跳 `/import/[jobId]` 屏，进度屏本身就是恢复标识
- **Status**: Backlog（Sprint 10 考虑 "resuming your last import…" toast）

**L2: OTA v5 badge 在生产 Home 可见**
- **Decision**: 保留，是 Frank 明确要的调试可见性（memory 已确认）
- **Status**: 不修

## Screenshots (Cutout Illustrated fidelity)
- `docs/qa/sprint9-evidence/STORY-00901-03-episode5-loaded.png` — Cutout Illustrated 撕纸背景 + 6 步骤卡片 + 3 知识卡片 + ★ 收藏 + 值分（信息密度 9/新鲜程度 8/可行动性 6）— 全部完好
- `docs/qa/sprint9-evidence/STORY-00901-08-revisit-refetch.png` — 返回再进入 render 一致

## Untested Paths (转 backlog / iOS 真机)
- iOS 权限对话框首次出现时机 + 文案（现改为 URL submit 时）
- 通知 tap → episode 深链
- 30s+ 真处理时长 + 真推送到达
- 强杀 App → 冷启动 jobId 恢复 UI
- 完成 haptic
- 权限被拒绝的降级 UX

## Sprint 9 UX Gate
**PASS**（Critical 全修，Medium 关键项已修，其余进 backlog）

---

**Sprint 10 UX 议题（Frank 决定是否开）**：
1. 完成庆祝 haptic + 视觉一致性巡检
2. 冷启动 jobId 恢复的 "resuming…" toast
3. 权限被拒绝的引导 UX（Settings 深链）
