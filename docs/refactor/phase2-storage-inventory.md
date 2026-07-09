# Phase 2.1 客户端存储盘点

**日期**: 2026-07-09
**范围**: 全前端 (app/ + lib/ + components/ + hooks/)
**扫描方式**: grep AsyncStorage/SecureStore/MMKV/localStorage 所有用法

## 全部存储用法（4 个 key）

| Key | 类型 | 用途 | 分类 |
|---|---|---|---|
| `k0.token` | 全 Session (userId+token+username JSON) | JWT 认证 token | ✅ **保留** — auth |
| `k0.credentials` | 明文 username+password JSON | "记住账号密码" 预填 | ✅ **保留** — user preference |
| `k0.anonymous_id` | UUID | Phase 1 已废弃 | ⚠️ **保留但停用** — 决策 5「代码不读=不存在」；已无代码读它 |
| `k0.pendingJob` | { jobId, url, savedAt } | 后台 Job 恢复（Sprint 9 STORY-00902） | 🤔 **重新评估** — 见下方分析 |

## 详细分析

### ✅ 保留：`k0.token` + `k0.credentials`

**位置**：`lib/auth.ts`

- `k0.token` = JWT session token 持久化，用户不用每次开 app 重登
- `k0.credentials` = 明文 username+password，勾"记住账号密码"存的
- 都在 Frank 决策 5 白名单内（"除了登录时候的用户名密码，其他都从数据库调"）
- **Phase 2.2 保持不动**

### ⚠️ 保留但停用：`k0.anonymous_id`

**位置**：无（Phase 1.3/1.4 已删所有读写代码）

- 老 iOS 设备上的 `k0.anonymous_id` 依然存在
- 新代码不读、不写、不判断
- Frank 决策 5：不主动清，代码不读就等于不存在
- Risk B7 提到未来 iterator 扫 `k0.` 前缀可能捞到脏数据 → 命名新 key 时避免前缀冲突即可
- **Phase 2.2 不动**

### 🤔 重新评估：`k0.pendingJob`

**位置**：`app/index.tsx`, `app/import/[jobId].tsx`, `app/episode/[id].tsx:1169`, `app/snapshot/[packId].tsx:118`

**当前作用**：
- Sprint 9 STORY-00902 需求：用户在 Learn 页启动 Job 后切后台，24 小时内回来能看到"你有个 Job 在跑"提示
- 保存内容：`{ jobId, url, savedAt }`（**元数据**，不是业务数据）
- 24 小时后自动清

**决策 5 边界判断**：
- 严格意义："业务数据全从 DB 拉" —— `pendingJob` 存的是 jobId 引用，jobId 对应的 job 状态从 `GET /api/jobs/:jobId` 拉。**这不是业务数据缓存，是"未完成任务的书签"**
- 用户体验价值：切后台后再开 App，直接跳到 import 等待屏，不用手动回想"我刚才在哪导入的"
- **如果删掉**：用户切后台 → 回来看 Home 3 卡片 → 不知道自己 job 在哪 → 有可能刷新 Library 也不见（Job 还没跑完）→ 需要重新粘 URL

**建议**：**保留**。它符合"服务器权威"精神（jobId 只是索引），本身没缓存业务数据。归类为"用户当前进行中的任务书签"，与"业务缓存"（cards/packs/library）性质不同。

如果 Frank review 时觉得应该删，可以在 Phase 2.2 一并删（改成 URL query param 传 jobId 而不是 AsyncStorage）。

## 全库 grep 确认无其他持久化

- `expo-sqlite`: **零使用**
- `MMKV`: **零使用**
- `SecureStore`: **零使用**
- `sessionStorage`: **零使用**
- `localStorage`: 只在 `apiFetch` 的 debug var (`__K0_API_BASE__`) 里用了 globalThis 挂载，不是持久化
- 图片缓存: `Image.prefetch` 有用，但 iOS 系统 URLCache 层，不是应用层

## 结论

**Phase 2.2 需要做的**：**几乎什么都不用做**！

原因：Phase 1 已经在做 anonymousId 移除时**顺便把业务数据缓存的老代码都删了**（Phase 1.4 subagent 报告确认）。当前前端**已经没有业务数据 AsyncStorage 用法**。

**Phase 2.2 实际动作**：
1. 补一份"Phase 2.2 already done in Phase 1" 说明
2. Frank 决定 `k0.pendingJob` 是否算业务缓存 → 决定删或留
3. 加个 lint 规则或 CI check 禁止未来引入业务数据 AsyncStorage

## Phase 2 剩余工作聚焦到 2.3 / 2.4

- **Phase 2.3 React Query**：新增依赖 + 改造 Library/Review/Episode/Snapshot 4 页面
- **Phase 2.4 trace_id**：apiFetch 加 X-Trace-Id header，为 Phase 3 客户端日志铺路

**Phase 2 净工作量**：从原估 2 天可能压缩到 1 天。
