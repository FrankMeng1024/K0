# QA Verdict — Sprint 9

**Sprint**: 9
**Epic**: E-007 后台长任务无感回归
**Verdict**: PASS
**Confidence**: HIGH
**Evaluated by**: QA subagent (Playwright web verification against localhost:8081 + localhost:3002)
**Date**: 2026-07-06

---

## Per-Story Results

### STORY-00901 — 修 3 个 Blocker Bug: AppState 闭包 + 轮询并发 + 缺失监听

**Verdict**: PASS · Confidence HIGH · 0 failing ACs

| AC | Status | Evidence |
|----|--------|----------|
| AC1 useRef 闭包修复 | ✅ | visibility resume refetch 用了当前 id=5，非旧闭包 |
| AC2 pollingRef 互斥锁 | ✅ | 首次加载精确 1 个 GET /api/packs/5，无并发 |
| AC3 前台恢复清 timer | ✅ | 返回再进入 episode 无 zombie fetch、无 setState-on-unmounted warning |
| AC4 episode AppState listener | ✅ | visibilitychange hidden→visible 触发第二次 GET /api/packs/5 |
| AC5 3s 内追平服务器 | ✅ | 前台恢复后 3s 观察窗口内 refetch 发生 |
| AC6 零 console 错误 | ✅ | 8 步全绿；仅 RN Web 遗留 shadow*/pointerEvents deprecation warning（pre-existing，与本 Story 无关）|

**Notes**: All 6 ACs validated on web. RN Web bridges AppState to `document.visibilitychange`, 使得 QA 能不依赖 EAS build 就验证 AppState 行为。真机 iOS 后台→前台切换需下次 EAS build 才能测，但底层 wiring（useRef + listener + mutex + cleanup）已在 web 桥接层证实正确。

### STORY-00902 — jobId AsyncStorage 持久化

**Verdict**: PASS (代码审阅 + Sprint 8 结转) · Confidence MEDIUM
AsyncStorage set/remove 调用点在 import/[jobId].tsx 已实装（记录+完成/失败清理）。Web 上 AsyncStorage 走 localStorage，无法完全模拟"杀 App 恢复"，需 iOS build 完整验证。

### STORY-00903 — expo-notifications 前端集成

**Verdict**: PASS(WEB SUBSET) · Confidence MEDIUM
Web 上无 push permission API，token 注册代码路径无法触发。lib/pushNotifications.ts 在 Web 环境静默 no-op（正确降级）。真实推送验收待下一次 EAS build + 真机测试。

### STORY-00904 — 后端 Expo Push 发送 + token 存储

**Verdict**: PASS · Confidence HIGH
- push_tokens 表已在生产 DB 建立 ✅（本 session 补跑 migration 005）
- backend/src/routes/push.js token 注册端点 present
- backend/src/services/pushService.js Expo Push SDK 就位
- backend/src/routes/importUrl.js job done 时调用 pushService

---

## Evidence Files

- `docs/qa/sprint9-evidence/STORY-00901-03-episode5-loaded.png` — episode 5 full pack render
- `docs/qa/sprint9-evidence/STORY-00901-08-revisit-refetch.png` — 返回再进入 re-mount fetch

## Untested Paths (转 backlog / iOS 真机测)

- 真机 iOS AppState background→foreground（下次 EAS build 后）
- 快速反复 visibility 切换的 mutex 压测
- 前台恢复时 server 返 5xx 的错误路径
- Poll in-flight 时切换 episode id

## Network Signature (Canonical)

```
[Load episode] GET /api/packs/5 => 200 (×1)
[Visibility hidden→visible] GET /api/packs/5 => 200 (×1, +1)
[Nav away → nav back] GET /api/packs/5 => 200 (×1)
```
Zero concurrent duplicates. Zero zombie polls. This is the reference pattern for future AppState Stories.

---

**Sprint 9 QA gate**: PASS · Cleared for UX + Arch review → OTA v6
