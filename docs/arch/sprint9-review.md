# Arch Code Review — Sprint 9

**Sprint**: 9
**Verdict**: PASS
**Reviewed by**: Arch subagent (isolated, diff-summary + API_SPEC.md context only)
**Date**: 2026-07-06

---

## Verdict

**PASS** — Clear for QA→UX→OTA v6.

## Issues Reviewed

Arch subagent flagged 5 Medium items. Main agent core-checked each against actual code:

### 1. forceRefresh 释放 mutex 的竞态 (STORY-00901)
**Concern**: `forceRefresh` 在触发 `poll()` 前无条件 `pollingRef.current = false`。若前次 fetch 仍 in-flight，可能允许并发。
**Verified**: 前次 in-flight fetch 的 `finally` 仅设回 false，不触发新请求；且 GET /api/packs/:id 是 idempotent。Sprint 8 已加 30s AbortController，真机后台切回时前 fetch 大概率已 abort。
**Decision**: 风险低，**记入 backlog**（下 Sprint 加"若 in-flight 则不预清 mutex，让 poll 自身 mutex-check 拒绝"）。不阻塞 Sprint 9。

### 2. 30min 新鲜度只在 index.tsx (STORY-00902)
**Concern**: 通知 tap 直进 import 屏时未做时效检查。
**Verified**: 通知 tap → `router.push('/episode/[id]')` 直达 episode，不经 import 屏；import 屏只在 index.tsx 冷启动恢复路径触发。**Not applicable**。

### 3. push token 校验 (STORY-00903/904)
**Concern**: token 长度/格式/enum/参数化查询/唯一索引。
**Verified**: `token typeof string && length >= 10` ✅；`platform default 'ios'` ✅；`ON DUPLICATE KEY UPDATE` upsert ✅；参数化 `db.execute(sql, [...])` ✅；migration 005 `UNIQUE KEY uniq_token` ✅。**全通过**。

### 4. push 同步阻塞 pipeline (STORY-00903)
**Concern**: pushService 慢/挂会阻塞 HTTP 响应。
**Verified**: importUrl.js:200-211 已包 `try/catch`，`push_notification_failed` warn 但不 rethrow，业务不受影响。**已妥善**。

### 5. client push 幂等注册 (STORY-00903)
**Concern**: 重复上报、permission-denied 抛错。
**Verified**: lib/pushNotifications.ts 已 memoize `registeredToken`，相等即 skip；`permission-denied` 返回 `{ok:false, reason}` 不 throw；`register-failed` 亦不 throw。**已妥善**。

## Spec Drift
None. New endpoint `POST /api/push/register` 遵循 Sprint 8 API_SPEC 风格。migration 005 延续 001-004 编号规范。AsyncStorage key `k0.*` 命名空间保留。

## Backlog Added
- **[STORY-00901 后续]** forceRefresh 在 in-flight 时不预清 mutex（改由 poll 自身 mutex-check 拒绝重入）— 优先级 Low。
