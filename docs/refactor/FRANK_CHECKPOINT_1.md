# 📌 Frank Checkpoint — Phase 2.1 完成 · DB + 后端设计 Review

**日期**: 2026-07-09
**位置**: Phase 2.1 客户端存储盘点已完成，Phase 2.2/2.3/2.4 未开动
**目的**: 给你一份完整的 DB + 后端结构快照 review，可以就当前设计给反馈

---

## 状态汇总

**已完成**：Phase 0 (清理) → Phase 1 (schema+auth 重构) → Phase 2.1 (前端存储盘点)
**进行中**：无
**待启动**：Phase 2.2 (业务缓存拆除 — 好消息见下) / 2.3 (React Query) / 2.4 (trace_id)

## 你要 review 的三份材料

### 1. 数据库结构 `docs/refactor/phase2-db-snapshot.md`（420 行）

**17 张表全景**：
- **内容域**（4 表，全局共享无 user_id）：`podcasts` / `episodes` / `transcripts` / `learning_packs`
- **用户域**（1 表）：`users`
- **桥接域**（4 表，user × content）：`user_pack_access` / `user_cards` / `user_step_progress` / `user_actions`
- **运维域**（8 表）：`jobs` / `ai_call_logs` / `client_logs`（Phase 3 才写入）/ `push_tokens` / `usage_events` / `debug_uploads` / `user_uploads` / `schema_migrations`

**当前数据**（测试残留）：
- `users`: 2 rows (frank_final + 之前测试)
- `podcasts`: 1 row (硬地骇客)
- `episodes`: 1 row (EP127)
- `transcripts`: 1 row (BCUT ASR 结果)
- `learning_packs`: 1 row (pack_id=1, quick 模式, 4 cards)
- `user_pack_access`: 1 row (frank_final ↔ pack 1, mode=quick)
- 其他表: 0 rows

### 2. 后端 API 结构 `docs/refactor/phase2-backend-routes.md`（36 行）

**28 endpoints，12 个 route 文件**：
```
/health
/api/auth/register + /login              (无 auth)
/api/whoami
/api/episodes/import-url + /:id/generate
/api/jobs/:jobId
/api/library/packs + /cards + /stats + DELETE /packs/:packId
/api/review/queue + /rate + /stats + /actions (GET/PATCH/DELETE/commit/uncommit)
/api/push/register + /test
/api/uploads/* + /api/debug/upload/*
```

**代码规模**：backend/src/ 总 4341 行，其中 3 个大文件：
- `packs.js` 556 行 (最重)
- `packGenerator.js` 443 行 (GLM 逻辑)
- `review.js` 383 行 (SRS + actions)

### 3. 前端存储 `docs/refactor/phase2-storage-inventory.md`

**4 个 AsyncStorage key** —— 只有 auth 相关，无业务缓存！这是**关键好消息**：
- `k0.token` ✅ 保留（JWT session）
- `k0.credentials` ✅ 保留（记住密码）
- `k0.anonymous_id` ⚠️ 停用（老数据留着不管）
- `k0.pendingJob` 🤔 需要你决定（Job 恢复书签，不是业务数据）

**结论**：Phase 1 顺手把业务缓存的老代码都清了。**Phase 2.2 几乎无事可做**。

---

## Phase 2 剩余工作量重估

原计划 Phase 2 是 2 天。**实际压缩到 1 天**（因为业务缓存已清）：
- 2.2: 0.25 天（就是决定 k0.pendingJob + 加 lint 规则）
- 2.3: 0.5 天（React Query 只需覆盖 4 页面）
- 2.4: 0.25 天（apiFetch 加 trace_id）

## 我想请你 review 决定的几个点

### A. DB schema 层

1. **`user_uploads` / `debug_uploads` LONGBLOB 存图片**
   - 现状：小于 12MB 图片直接存 MySQL BLOB
   - 4-eyes Risk B4 提到"多用户 1 万后爆 5GB"
   - Frank 决策 4："重构期无用户，可 breaking" —— 但**用户量起来后**这就是限制
   - 问题：你想现在改（加 `storage_backend` 字段 + 未来迁 OSS 铺路）还是等真的用了再说？

2. **`ai_call_logs` LONGTEXT 存完整请求/响应**
   - 每次 GLM 调用存 request_full_body + response_full_body（几十 KB 到几 MB）
   - 没保留策略（跟 client_logs 7 天类似但没实施）
   - 问题：需要现在加清理策略吗？（比如 30 天自动删）

3. **`push_tokens` 和 `debug_uploads` / `user_uploads` 缺 FK**
   - k0_user 无 REFERENCES 权限（生产 DB 限制）
   - 应用层理论上应该 cascade 删（用户注销 → 桥接表都清），但**目前没有用户注销 endpoint**
   - 问题：现在需要写 user delete 端点吗？还是留到有实际需求？

4. **`user_step_progress` 只有 `completed_at`，无 uncompleted 状态**
   - 4-eyes Arch 提到：多设备下想"取消打勾"只能 DELETE row，历史丢
   - Frank 决策 1 last-write-wins 下**其实可以接受** —— 最后一次操作胜出
   - 问题：接受现状？还是加 `status ENUM('done','undone')`？

### B. 后端代码层

1. **`packs.js` 556 行** —— 是所有 route 里最大的，混合了 pack 查询、卡片操作、Step 2 触发、步骤打勾
   - 问题：值得拆吗？还是保持整体但重构内部？

2. **`generate.js` 211 行 + `importUrl.js` 331 行**
   - 两者共用 packGenerator.js，但 route 层各写各的
   - 问题：`generate.js` 是否已废弃（生产流量都走 `importUrl.js`）？

3. **无 user delete endpoint** —— 未来 GDPR / 用户主动注销都需要
   - 现在做还是留到 Phase 3？

### C. 客户端存储层

1. **`k0.pendingJob` 去留**
   - 保留 = 用户切后台 24h 内回来能自动跳回 Job 等待屏
   - 删除 = 完全服务端权威，用户回来必须自己找 Library（那时 pack 可能已好了）
   - 建议保留（不算业务数据缓存）
   - 你的意见？

2. **`k0.credentials` 明文** —— 4-eyes 没提，但严格说是安全问题
   - 现状：用户勾"记住密码" → AsyncStorage 存 `{ username, password }` 明文
   - iOS AsyncStorage 未加密（不同于 Keychain）
   - 问题：改用 SecureStore（iOS Keychain）？还是接受现状（K0 是学习工具，不是银行）？

---

## 我等你反馈的事项

你只要说：
- **A1-A4 每个的决策**（改 / 不改 / 暂缓）
- **B1-B3 每个的决策**（拆 / 不拆 / 删）
- **C1-C2 每个的决策**（保留 / 删除 / 换 SecureStore）
- 或者你有别的想改的地方（schema 里看着不爽的字段/命名/结构）

**如果你想更细看某张表 / 某个 endpoint / 某个文件**，告诉我，我贴代码给你。

## 待你 review 期间我在做什么

**空转**。不动 Phase 2.2/2.3/2.4，也不动数据库和 backend 代码。你回来告诉我决策，我再推进。

（后端服务器 :3002 + expo :8081 依然在跑，你如果想手动 curl 或看 UI 都可以）
