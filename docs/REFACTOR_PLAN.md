# K0 底层重构执行计划 v2

> **决策日期**：Frank 2026-07-09 决策 6 大方向后修订
> **目标**：消灭 v1/v2/v3 概念，只有当前唯一版本；服务端权威；日志能让 Claude 读到用户行为链
> **约束**：重构期间**无真实用户**，可以放心 breaking change；发布方式由 Frank 决定，非本计划范围

---

## Frank 6 大决策（north star）

| # | 决策 | 影响 |
|---|---|---|
| 1 | **多设备同步**：Last-write-wins，不实时联动 | schema **不加** revision/CAS/change_events |
| 2 | **匿名账户**：不存在，脏数据要清 | schema 删 `users.anonymous_id`；代码强制走登录 |
| 3 | **client_logs 保留**：7 天，当天用完就丢 | MySQL 单表够，不用分区/ClickHouse |
| 4 | **hotfix 通道**：重构期无用户，简化 | 单 main 分支，无 v47 hotfix bundle |
| 5 | **AsyncStorage 清理**：代码不读就等于不存在 | Phase 2 只改代码，不写清缓存迁移脚本 |
| 6 | **发布策略**：Playwright 测完 → 通知 Frank → 交 DB + 后端结构 → Frank 调整 → 全部完成才 OTA | Phase 4 分 4a（自动测）+ 4b（Frank 决策） |

---

## 全流程 4-eyes Review 规则（memory: feedback_refactor_4eyes_review.md）

每个 Phase 结束前必须开 4 subagent 独立 review：
- **Product review** — 从 PRD/CR 视角看是否偏离产品目标
- **Arch review** — 从代码架构/schema 完整性看
- **QA review** — 从测试覆盖率/回归风险看
- **Risk review** — 从上线风险/rollback/blast radius 看

规则：
- 所有 subagent 用 opus 模型
- 全部 PASS 才能进下一 Phase
- 任何 subagent 提 Blocker → 修完再 relaunch subagent，直到 PASS

---

## Phase 0 — 基础清理（**已完成 2026-07-09**）

Commit: `2af86e3` (local, unpushed)

**Done**:
- ✅ v1 死代码全删（`snapshots.js` + `episodes.js` + 3 v1 migrations + 2 测试）
- ✅ 前端死组件 7 个 + `lib/pushNotifications.ts` 删除
- ✅ 过时文档 2 个 + 一次性脚本 3 个删除
- ✅ Migration 目录合并（`backend/db/migrations/` → `backend/migrations/`）
- ✅ `001_init.sql` = 唯一初始 schema
- ✅ `docs/DB_SCHEMA.md` 重写反映真实结构
- ✅ Playwright Golden Path 全流程 verdict PASS（3 viewport, 0 error）
- ✅ 生产库 audit 产出 `docs/refactor/phase1-schema-audit.md`

**Pending**: Phase 0 补 4-eyes review（事后审计，主要防止漏改）

---

## Phase 1 — Schema 收敛 + 代码去 V 化（2-3 天）

**目标**：`backend/migrations/` 是可 replay 的**唯一完整 schema**；backend/src/ 代码 100% 走当前唯一版本；`docs/API_SPEC.md` 与代码严格一致。

### 1.0 - 解决文档冲突（0.25 天）
- DB_SCHEMA_TARGET.md 和 REFACTOR_PLAN.md 关于 001_init.sql 是否重写的冲突已在决策 5 解决：**保留生产 schema_migrations 记录**，新变更走 011+
- 输出：本文档（v2）已修正

### 1.1 - 生产库 audit + gap 识别（0.5 天）
- ✅ `docs/refactor/phase1-schema-audit.md` 已产出（336 行，Phase 0 事后完成）
- diff DB_SCHEMA_TARGET.md：
  - `users.anonymous_id` 存在但要清（决策 2）
  - `user_pack_access` 缺 `updated_at`
  - `user_cards` 索引可加复合 `(user_id, pack_id, archived, starred)`
  - `learning_packs.uk_transcript_goal_model_prompt_status` 应改为不含 status
  - `user_actions.action_index` 冗余（duplicate with timeframe）
  - `subscription_expires_at` TIMESTAMP → DATETIME(6)（2038 问题）
  - `client_logs` 表还没建
- 输出：`docs/refactor/phase1-schema-diff.md`

### 1.2 - Migration 011-016（1 天）
按顺序追加：
- `011_drop_anonymous_id.sql`：`ALTER TABLE users DROP COLUMN anonymous_id`（先备份数据）
- `012_dedup_user_actions.sql`：`ALTER TABLE user_actions DROP COLUMN action_index`
- `013_learning_packs_unique_fix.sql`：`ALTER TABLE learning_packs DROP INDEX uk_transcript_goal_model_prompt; ADD UNIQUE (transcript_id, goal, glm_model, prompt_version)`
- `014_user_pack_access_updated_at.sql`：加 updated_at 字段 + ON UPDATE CURRENT_TIMESTAMP
- `015_user_cards_composite_index.sql`：加复合索引
- `016_datetime_upgrade.sql`：`subscription_expires_at` TIMESTAMP → DATETIME(6)
- **开发机 rebuild** 验证：从空库 → `npm run migrate` → 得到目标 schema

### 1.3 - 代码去匿名化（0.5 天）
- backend/src/routes/auth.js: 删除 `getOrCreateUserByAnonymousId`
- backend/src/services/userStore.js: 同上
- backend/src/routes/**/*.js: 删除所有 `req.query.anonymousId` 处理逻辑
- 前端 lib/auth.ts: 删除 `k0.anonymous_id` localStorage 读写
- 前端 app/_layout.tsx: 冷启动强制 login guard，不再 fallback anonymous
- 前端所有 `anonymousId` 相关代码删除

### 1.4 - API_SPEC.md 重写（0.5 天）
- 用 `scripts/introspect-routes.js`（新增）自动扫 backend/src/routes/ 列出所有 endpoint
- 人工补 body/response schema
- 输出：`docs/API_SPEC.md` 与代码 1:1 对齐

### Phase 1 Exit（必须全部 pass）
- [ ] 开发机上 `npm run migrate` 从空库能建出与生产结构一致的表
- [ ] 生产库执行完 011-016，`users.anonymous_id` 消失，其他 breaking change 生效
- [ ] `docs/API_SPEC.md` 与代码 1:1 对齐（脚本自动 diff）
- [ ] 所有 backend 测试通过（除 langDetect 1 个 pre-existing）
- [ ] Backend 冷启动 + 手动冒烟 login/register/library/review 通过
- [ ] Playwright 全流程 verdict = PASS
- [ ] **4-eyes review PASS**（Product/Arch/QA/Risk 全通过）

---

## Phase 2 — 前端零业务缓存 + React Query（2 天）

**目标**：客户端零业务缓存，所有业务数据服务端拉，React Query 统一管缓存。

**关键决策 5**：不主动清老 AsyncStorage。新代码严格不读业务数据 key。老数据留在那儿不干扰。

### 2.1 - 客户端存储盘点（0.25 天）
- subagent 扫 `app/` + `hooks/` + `services/` 所有 `AsyncStorage` 用法
- 分类：`保留`（auth token, user preference）/ `不再读也不再写`（业务数据）
- 输出：`docs/refactor/phase2-storage-inventory.md`

### 2.2 - 拆除业务数据读取（0.75 天）
- 前端所有业务数据（pack/card/episode/library list）改为**只从 API 拉**
- `AsyncStorage.getItem('cards')` 等调用删除
- **不写清空迁移**（决策 5：代码不读 = 数据不存在）

### 2.3 - 引入 React Query（0.75 天）
- 加 `@tanstack/react-query` 依赖
- 包 `<QueryClientProvider>`
- 默认策略：`staleTime: 30s`（决策修正版，不用 0 避免过度 refetch）
- 关键页面改造：Library / Episode / Snapshot / Review
- 加 pull-to-refresh 强制 refetch

### 2.4 - API 层加固（0.25 天）
- Backend 全局 `Cache-Control: no-store` ✅（Sprint 16 R20 已加）
- 客户端 fetch 层统一 wrapper：注入 auth token + `X-Trace-Id`（为 Phase 3 铺路）

### Phase 2 Exit
- [ ] `docs/refactor/phase2-storage-inventory.md` 里所有业务缓存标记为 removed
- [ ] React Query 覆盖 Library / Review / 学习包页面
- [ ] Playwright 测试："改一条 → 立刻在另一页看到"
- [ ] Backend + Frontend 冷启动 0 error
- [ ] **4-eyes review PASS**

---

## Phase 3 — 日志强化（2 天）

**目标**：Claude 能 grep 后端日志 + `client_logs` 表重建任意用户任意时间的完整操作链。

**关键决策 3**：保留 7 天。MySQL 单表够。

### 3.1 - 后端日志规范化（0.25 天）
- 每个 API endpoint 入口出口 log（结构化 pino）
- Log: `{ trace_id, user_id, endpoint, method, params, response_status, duration_ms, error? }`
- 敏感字段（password/token/upload blob）不进 log
- 保留 7 天，logrotate 或 pino-roll 按天切割

### 3.2 - `client_logs` 表（0.25 天）
```sql
CREATE TABLE client_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,        -- 必须（决策 2 无匿名）
  trace_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64),                    -- expo-application ID for vendor
  device_platform VARCHAR(20),
  app_version VARCHAR(20),
  ota_version VARCHAR(20),
  event_type VARCHAR(40) NOT NULL,
  event_name VARCHAR(80) NOT NULL,
  event_data JSON,                          -- 应用侧 sanitize，无 PII
  screen VARCHAR(60),
  ts_client TIMESTAMP(3) NOT NULL,
  ts_server TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_ts (user_id, ts_client),
  INDEX idx_trace (trace_id)
);
```
- 每晚 cron 删 7 天前记录（简单，不分区）
- `POST /api/logs` 接收 batch，rate limit 60s/100 条/user

### 3.3 - 客户端日志上传（1 天）
参考 Cairn 项目 `docs/CAIRN_UPLOAD_PORT.md`（若不可用，Phase 3.3 spike）：
- 新建 `services/logUploader.ts`
- 内存队列 + AsyncStorage 持久化重启不丢
- `device_id` 用 `Application.getIosIdForVendorAsync()` （跨重装保持一致）
- `trace_id` 每次冷启动新 uuid
- Hook 埋点（导航 / 点击 / API 调用 / 错误 / 生命周期）
- Flush 时机：队列满 20 条 / 30 秒 / AppState background
- 网络失败重试，队列 > 500 条丢弃最老
- **PII 白名单**：event_data 只允许 screen_id / event_name / target_id / duration_ms / status_code / error_code。**禁止**：email / phone / password / note_content / search_query 明文

### 3.4 - Claude 查询工具（0.25 天）
- `backend/scripts/query-user-logs.cjs`：输入 user_id + 时间范围 → 输出合并后端 log + client_logs 的完整行为链
- 供 Claude 未来 debug 时用

### Phase 3 Exit
- [ ] `client_logs` 表跑通，客户端上传，后端 rate limit 生效
- [ ] Playwright 走完整流程后，`query-user-logs.cjs` 能重建全部操作链
- [ ] 客户端断网重连日志不丢
- [ ] PII 脱敏 sanitize 函数单测通过
- [ ] **4-eyes review PASS**

---

## Phase 4a — 端到端 Playwright 冒烟（0.5 天，Claude 做）

**目标**：Playwright 全流程走完，产出交给 Frank 的最终交付包。

- Playwright 走完 Golden Path（注册 → 登录 → 导入 URL → Job → 快照 → 学习包 → 卡片 → 复习）
- 三档 viewport (iPhone SE / 14 / 15 Pro Max)
- 断网/弱网测试
- 产出：
  - `docs/DB_SCHEMA_FINAL.md` — 重构完成后的真实数据库结构
  - `docs/BACKEND_STRUCTURE_FINAL.md` — 重构完成后的后端代码结构
  - `docs/qa/refactor-final-evidence/` — Playwright 全流程截图
- **4-eyes review PASS**（4 subagent 全部通过后才通知 Frank）
- 通知 Frank 进入 Phase 4b

### Phase 4a Exit
- [ ] Playwright 全流程 PASS
- [ ] DB + 后端结构文档产出
- [ ] 4-eyes review PASS

---

## Phase 4b — Frank Review + 调整 + OTA（Frank 做）

**目标**：Frank 拿到最终交付物，做他需要的调整，全部完成后统一发 OTA。

Claude 在此阶段：
- 只响应 Frank 的具体调整要求（不主动改动）
- 每次调整后重跑 Playwright + 4-eyes review
- 直到 Frank 说"可以发了"

### Phase 4b Exit（Frank 决定）
- [ ] Frank 明确 approve
- [ ] Frank 亲自跑或授权 EAS build / OTA（memory: k0_eas_build_authorization.md）

---

## 风险与 Mitigation（简化版）

| 风险 | Mitigation |
|---|---|
| Phase 1 生产 DB 迁移出错 | mysqldump 备份；迁移用事务；开发机预演 |
| Phase 2 React Query 破坏页面 | 逐个页面改，每个独立测试 |
| Phase 3 日志洪水 | rate limit + batch + 队列限长；7 天自动清 |
| Phase 3 PII 泄漏 | 白名单机制 + 服务端 reject 含黑名单 pattern |
| 我判断错误 | 每 Phase 4-eyes review 拦截 |

**Frank 决策后不再存在的风险**（原 REFACTOR_PLAN v1 列的）：
- ~~重构期用户报新 bug~~（决策 4：无用户）
- ~~清缓存误登出~~（决策 5：不主动清）
- ~~多设备静默丢数据~~（决策 1：last-write-wins 接受）
- ~~账号合并复杂度~~（决策 2：无匿名）

---

## Non-Goals

- ❌ 不引 ORM（Prisma/TypeORM）
- ❌ 不引 Redis
- ❌ 不改 UI 视觉
- ❌ 不重写 GLM prompt
- ❌ 不加"用户间分享"字段
- ❌ 不做 Web 版
- ❌ 不加多设备实时同步（决策 1）
- ❌ 不迁 LONGBLOB 到对象存储（重构期无用户，容量非问题；实际上线前另开 Story）

---

## 时间线（v2 修正）

| Phase | 估算 | 备注 |
|---|---|---|
| 0 | ✅ Done | 2026-07-09 单次会话 |
| 1 | 2-3 天 | schema 收敛 + 代码去 V + API_SPEC |
| 2 | 2 天 | 缓存清理 + React Query |
| 3 | 2 天 | 日志强化 |
| 4a | 0.5 天 | Playwright + 交付物产出 + 4-eyes review |
| 4b | Frank 决定 | Frank 调整 + OTA |
| **净开发** | **6.5-7.5 天** | 比 v1 少 1.5 天（决策简化） |

---

## Next Step

Claude 立刻启动 Phase 1，从 1.0（本文档 v2）开始。Phase 1 完成后触发第一次 4-eyes review。
