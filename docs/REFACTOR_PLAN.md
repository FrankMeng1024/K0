# K0 底层重构执行计划

> **决策**：Frank 2026-07-09
> **目标**：消灭 v1/v2/v3 概念，只有当前唯一版本；数据服务端权威；日志能让 Claude 读到用户行为链
> **风格**：Agile Sprint，4 个阶段，每阶段有明确的进入/退出条件
> **约束**：重构期间禁 OTA，所有改动累积到 Phase 4 完成后统一发

---

## 全局约束

- ✅ **不发 OTA** —— 累积改动到重建完成，一次性发布
- ✅ **App 运行时不受影响** —— 每次改动后 backend 冷启动 + 前端 expo config 都要通过
- ✅ **每阶段独立可 rollback** —— 卡在哪个阶段都能 git revert 回上一阶段
- ✅ **文档先于代码** —— 每阶段先改 spec，再改代码

---

## Phase 0 — 基础清理（**已完成 2026-07-09**）

### Done
- ✅ CR-020 记录
- ✅ 7 个前端死组件删除
- ✅ 2 个过时文档删除
- ✅ 4 个 spike node_modules + 构建产物清理
- ✅ 2 个后端一次性脚本删除
- ✅ v1 migrations 002-004 删除
- ✅ 死代码 `backend/src/routes/snapshots.js` + `episodes.js` 删除
- ✅ 死测试 `snapshots.test.js` + `episodes.import.test.js` 删除
- ✅ 死脚本 `smoke-test.js` + `verify-e2e.js` + `apply_006.js` 删除
- ✅ Migration 目录合并（`backend/db/migrations/` → `backend/migrations/`）
- ✅ 001-init-v2.sql 重命名为 `001_init.sql`（当前唯一初始）
- ✅ `docs/DB_SCHEMA.md` 重写反映真实状态
- ✅ `docs/DB_SCHEMA_TARGET.md` 目标 schema 定义

### 退出条件（全部满足）
- Backend 冷启动无 error（`DB pool initialized`）
- 剩余测试 4 个（auth/generate/langDetect/packs）
- git status 干净可 commit

---

## Phase 1 — 后端设计审查 + Schema 收敛（3-5 天）

**目标**：让 backend/migrations/ 成为可 replay 的完整 schema，删除生产库多余的 v1 表，代码 100% 走当前唯一版本。

### 1.1 生产库审查（0.5 天）
- 手动登入生产 MySQL，对比目标 schema (`DB_SCHEMA_TARGET.md`)：
  - 每张表字段一一对齐（列名、类型、UNIQUE、INDEX、FK）
  - 找出生产有但 target 没有的字段 → 决定 keep 或 drop
  - 找出 target 有但生产没有的字段 → 加迁移
- 产出 `docs/refactor/phase1-schema-diff.md`

### 1.2 Migration 重建（1 天）
- **不重写 001_init.sql**（生产已按此建表，重写会导致 checksum 不一致）
- 新增 `011_dedup_user_actions.sql`：DROP `user_actions.action_index` 字段
- 新增 `012_normalize_ai_call_logs.sql`（如审查发现需要）
- 更新 `docs/DB_SCHEMA.md` 反映最新
- 在**开发机上从零 rebuild** 一次数据库，验证 `npm run migrate` 从空库 → 完整生产结构

### 1.3 代码审查（1 天）
开 subagent 全库扫：
- 所有 SQL 语句，验证字段名和 target schema 一致
- 所有 route handler，验证输入/输出契约在 `docs/API_SPEC.md` 记录
- 所有 service，验证只 depend on 内部 modules 或明确的外部 API
- 产出 `docs/refactor/phase1-code-audit.md`：坏气味清单 + 优先级

### 1.4 API_SPEC 更新（1 天）
- 重写 `docs/API_SPEC.md`，反映当前**实际存在**的 endpoint（不写死代码）
- 每个 endpoint：method + path + 请求 body schema + 响应 schema + error code + auth 要求
- 与真实代码严格对齐（跑一遍主要 endpoint 对照）

### 退出条件
- [ ] 开发机上 `npm run migrate` 从空库能建出与生产一致的表
- [ ] `docs/API_SPEC.md` 与代码一致（可通过手动比对或 openapi 校验）
- [ ] 所有 backend 测试通过
- [ ] Backend 冷启动 + 主要 API 手动冒烟通过

---

## Phase 2 — 前端缓存清理 + React Query 化（2-3 天）

**目标**：客户端零业务缓存，所有数据从服务端拉，React Query 统一管缓存。

### 2.1 客户端存储盘点（0.5 天）
subagent 扫 `app/` + `hooks/` + `services/`：
- 所有 `AsyncStorage.setItem/getItem`
- 所有 `SecureStore`
- 所有 `MMKV`（如有）
- 所有 `expo-sqlite`（如有）
- 分类：**auth token / user preference / 业务数据**
- 产出 `docs/refactor/phase2-cache-inventory.md`

### 2.2 拆除业务缓存（1 天）
- 业务数据缓存全删（pack/card/episode/library list 等）
- 保留：JWT token / anonymousId / device_id / theme / locale
- 加 app 启动版本检测：若 `AsyncStorage['app_version']` != current → 清空所有非白名单 key
- OTA 更新 hook 加相同逻辑

### 2.3 引入 React Query（1 天）
- 加 `@tanstack/react-query` 依赖
- 包 `<QueryClientProvider>`
- 默认 `staleTime: 0`, `cacheTime: 5min`, `refetchOnMount: 'always'`
- 关键页面改造：Library / Episode / Snapshot / Review
- 加 pull-to-refresh 强制 refetch

### 2.4 API 层加固（0.5 天）
- Backend 全局已 `Cache-Control: no-store` ✅（Sprint 16 R20 已加）
- 客户端 fetch 层统一走 wrapper：注入 auth + trace_id + Cache-Control: no-store
- 客户端 fetch 失败重试策略明确

### 退出条件
- [ ] `docs/refactor/phase2-cache-inventory.md` 里所有业务缓存标记为 removed
- [ ] 手机真机测试：切用户 / OTA 升级后，看到的数据 100% 是最新服务端数据
- [ ] React Query 覆盖所有业务列表
- [ ] 手动测试："改一条 → 立刻在另一个页面看到"

---

## Phase 3 — 日志强化（2-3 天）

**目标**：Claude 能通过 grep 后端日志 + `client_logs` 表重建任意用户在任意时间的完整操作链。

### 3.1 后端日志规范化（0.5 天）
- 每个 API endpoint 入口出口 log（`pino` 结构化）
- Log 内容：`{ trace_id, user_id, endpoint, method, params, response_status, duration_ms, error? }`
- 敏感字段（token/password/upload blob）不进 log
- Log 目的地：`backend/logs/api-<date>.log` 或 stdout 由 pm2 收
- 保留 30 天

### 3.2 `client_logs` 表和 API（0.5 天）
- 加 migration `013_client_logs.sql`（按 DB_SCHEMA_TARGET.md 定义）
- 加 `POST /api/logs` endpoint（body: batch of log events, max 100 per batch, max 1MB）
- 加 rate limit（防日志洪水）
- 加 `GET /api/logs/query` 内部工具（Frank/Claude 用，需 admin token）

### 3.3 客户端日志上传（1.5 天）
参考 Cairn 项目 `docs/CAIRN_UPLOAD_PORT.md` 里图片上传的架构：
- 新建 `services/logUploader.ts`
- 内存队列 + AsyncStorage 持久化（重启不丢）
- 生成 `device_id`（首次 uuid）+ `trace_id`（每次冷启动新）
- Hook 埋点：
  - **导航**：Expo Router 的 `useSegments` 变化时 log
  - **点击**：关键按钮加 `onPress` wrapper log
  - **API 调用**：fetch wrapper 前后 log
  - **错误**：`ErrorBoundary` + `AppState` change log
  - **生命周期**：`AppState` foreground/background log
- Flush 时机：
  - 队列满 20 条 → flush
  - 每 30 秒 → flush
  - AppState 变 `background` → flush
- 网络失败：本地缓存重试，缓存超 500 条丢弃最老

### 3.4 Claude 查询工具（0.5 天）
写一个 `scripts/query-user-logs.js`，Claude 会用：
- 输入：user_id / anonymous_id / device_id / trace_id / 时间范围
- 输出：合并后端 log + client_logs，按 ts 排序的完整行为链
- 存在 `backend/scripts/`

### 退出条件
- [ ] `client_logs` 表跑通，客户端能上传，后端能查
- [ ] Frank 手机上做一个"打开 app → 浏览 → 生成 pack → 复习"完整流程，Claude 能通过 `query-user-logs.js` 重建
- [ ] 后端 API log 30 天保留策略生效
- [ ] 客户端断网/重连日志不丢

---

## Phase 4 — 端到端验证 + 发布准备（1-2 天）

**目标**：确认所有改动稳定，准备一次性发 OTA/build。

### 4.1 全面冒烟（0.5 天）
- Playwright 走完 Golden Path（导入 → 快照 → 学习包 → 卡片 → 复习）
- 三种 viewport：iPhone SE / 14 / 15 Pro Max
- 手机真机测试 iOS 18.x
- 断网/弱网测试
- OTA 升级测试（从 v47 → 新版本，验证客户端存储正确迁移）

### 4.2 QA/UX/Arch 独立 subagent 审查
- QA subagent：verdict PASS
- UX subagent：no Blocker friction
- Arch subagent：code review PASS

### 4.3 Virtual User 验收（如 acceptance_mode = auto）
- 走完整流程，score >= 9.5，verdict = ACCEPTED

### 4.4 发布决策（由 Frank 决定）
- OTA channel（production/preview）
- 版本号（app.json + 3-tap version popup 同步）
- 4-eyes review（Product/Arch/QA/Risk）
- EAS build 是否需要（若有 native 变动如 push notification 库变化）

### 退出条件
- [ ] 三份 subagent verdict 全 PASS
- [ ] VU verdict ACCEPTED（Mode 2）或 Frank 亲手 demo 通过（Mode 1）
- [ ] Frank 明确说"可以发了"

---

## 风险和 Mitigation

| 风险 | 概率 | 影响 | Mitigation |
|---|---|---|---|
| Phase 1 生产 DB 迁移出错 | 低 | 高 | 迁移前 mysqldump 备份；迁移用 transaction；开发机预演 |
| Phase 2 React Query 引入破坏现有页面 | 中 | 中 | 逐个页面改，每个都独立测试；保留 fallback |
| Phase 3 日志洪水拖垮服务器 | 中 | 中 | rate limit + batch + 客户端队列限长 |
| Phase 3 客户端上传阻塞 UI | 低 | 高 | 严格异步 + AsyncStorage 队列 + 失败不重试主流程 |
| 重构期用户报新 bug | 中 | 中 | 每个 Phase 完成后独立 commit，能定位到具体 Phase 回滚 |
| Frank 中途改主意加需求 | 中 | 中 | 新需求走 CR，明确是否延到重建后；不打断当前 Phase |

---

## 不做的事（明确）

- ❌ 不迁 ORM（保留 mysql2 手写 SQL）
- ❌ 不引 Redis（服务端权威哲学要求少缓存）
- ❌ 不改 UI 视觉（重构只碰数据层和逻辑层）
- ❌ 不重写 GLM prompt（保留 v4）
- ❌ 不动 EAS build config（除非 Phase 3 客户端日志库需要）
- ❌ 不加"用户间分享"字段（YAGNI，Frank 明确暂不做）
- ❌ 不做 Web 版（Frank 明确 iOS-only）

---

## 依赖关系

```
Phase 0 (基础清理)
   ↓ 完成
Phase 1 (Schema 收敛) ← 独立进行
   ↓ 完成
Phase 2 (缓存清理) ← 依赖 Phase 1 的 API 稳定
   ↓ 完成
Phase 3 (日志强化) ← 可与 Phase 2 部分并行
   ↓ 完成
Phase 4 (端到端 + 发布)
```

Phase 2 和 Phase 3 前半可以并行做（前者主要动前端，后者主要动后端 + 前端日志层）。若时间紧，可以 Phase 2/3 并行提交。

---

## 时间线（估算）

| Phase | 估算 | 备注 |
|---|---|---|
| 0 | 已完成 | 2026-07-09 单次会话 |
| 1 | 3-5 天 | 依赖生产库审查耗时 |
| 2 | 2-3 天 | React Query 首次引入需要试错 |
| 3 | 2-3 天 | 客户端日志埋点是重点 |
| 4 | 1-2 天 | 冒烟 + subagent 审查 |
| **总计** | **8-13 天** | 净开发时间 |

不设 Sprint 边界，按 Phase 走。每个 Phase 完成 = 独立 commit + git tag（`phase-1-done` / `phase-2-done` 等）。

---

## 首个决策点

**Frank 需要做的第一个决策**：Phase 1 什么时候开始？

选项 A：**立刻开始**——Phase 0 已完成，继续同一会话推进
选项 B：**先 Review 本计划**——Frank 看完 REFACTOR_PLAN.md + DB_SCHEMA_TARGET.md 提反馈，改完再动
选项 C：**分头改**——Frank 有其他事，Claude 后台推进 Phase 1，Frank 空了 review

Claude 建议 **B**——两份纸面产物是全部工作的 north star，30 分钟 review 时间省下未来几天返工。
