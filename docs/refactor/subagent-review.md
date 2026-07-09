# Subagent Review 综合意见（DB_SCHEMA_TARGET + REFACTOR_PLAN）

**日期**: 2026-07-09
**Verdict**:
- DB_SCHEMA_TARGET.md: `PASS_WITH_ISSUES` (15 issues, 2 Blocker / 8 Critical / 5 Medium/Low)
- REFACTOR_PLAN.md: `PASS_WITH_ISSUES` (11 issues, 2 Blocker / 6 Critical / 3 Medium/Low)

## Blocker（必修，未修不能进 Phase 1）

### B1. pack_json 契约与生产代码不对齐（DB_SCHEMA_TARGET）
- 目标文档写 `snapshot.one_sentence` 嵌套结构
- 生产 `library.js:59` 实际 `JSON_EXTRACT '$.oneSentence'` 顶层
- `library.js:159-170` JSON_TABLE 取字段是 `type/title/explanation/quote/insight/context/sourceTimestamp`（8 字段），目标文档写 5 字段
- **修法**：DB_SCHEMA_TARGET 里 pack_json 契约按线上真实字段落地，重写"当前 shape"章节；目标 shape 作为"未来演进"

### B2. learning_packs UNIQUE 含 status（DB_SCHEMA_TARGET）
- `UNIQUE (transcript_id, goal, glm_model, prompt_version, status)` 允许多条 ready
- **修法**：改成 (a) UNIQUE 不含 status + 应用层保证；或 (b) generated column `status_active` = IF(status='ready',1,NULL) 上 UNIQUE

### B3. Phase 2 缓存清理会误登出用户（REFACTOR_PLAN）
- 白名单只列 JWT/anonymousId/device_id/theme/locale
- 但 `lib/auth.ts` 有 `CREDS_KEY`（记住的用户名密码）和 `SESSION_KEY`
- app_version 首次运行不存在 → undefined != current → 强制清空
- **修法**：Phase 2.1 用 grep 列所有 AsyncStorage key 清单；2.2 白名单必须包含 CREDS_KEY；首次运行"若 app_version 不存在则写入不清空"

### B4. Phase 4 rollback plan 缺失（REFACTOR_PLAN）
- 没写 OTA v48 出问题如何回 v47
- Phase 2 版本检测已清 client 缓存，回 v47 后 v47 不认识 client_logs 表
- **修法**：Phase 4 新增 4.5 Rollback Plan 演练；准备 v47 hotfix bundle 预留

### B5. 8-13 天禁 OTA 阻塞生产 hotfix（REFACTOR_PLAN）
- K0 每 Sprint 都有 fix bug（CR.md 显示 CR-013 到 CR-019 都是 hotfix）
- **修法**：从 main 分离 `refactor/phase-1-4` 分支，main 上保持 v47 可 hotfix；phase 4 前 rebase

## Critical（需 Frank 决策后继续）

- C1: **多设备同步**——目标 schema 无 revision / change_events / CAS，iPad+iPhone 会静默丢数据
- C2: **client_logs 规模+保留+隐私**——1 亿行/天，无 PII 脱敏会撞 App Store 5.1.2
- C3: **users 表账号合并**——匿名→Apple 登录合并路径没设计
- C4: **user_uploads LONGBLOB**——多用户 1 万后爆 5GB，无迁移路径
- C5: **CASCADE delete 灾难**——podcast 删除 CASCADE 到用户桥接表
- C6: **文档冲突**——REFACTOR_PLAN 说 001 不动 vs DB_SCHEMA_TARGET 说 001 = 新目标
- C7: **user_actions UNIQUE**——每档 1 条限制与 PRD 每档 3 条冲突

## Medium / Low（Phase 1 期间补齐）

- pack_json_schema_version 加版本号支持兼容分支
- user_cards 复合索引 (user_id, pack_id, archived, starred)
- TIMESTAMP → DATETIME(6) 避免 2038 问题
- ai_call_logs / client_logs 分区+清理
- podcasts.rss_url UNIQUE
- 命名约定不一致（user_step_progress / user_actions 应叫 user_pack_step_progress / user_pack_actions）
- CAIRN_UPLOAD_PORT.md 依赖确认
- device_id 用 `Application.getIosIdForVendorAsync()` 替代 uuid
- React Query staleTime=0 太激进，改 30s
- 引 zod/openapi 自动生成 API_SPEC

## 6 个必须 Frank 决策的问题

1. **多设备同步语义**：`revision + CAS 冲突检测` 还是 `last-write-wins 简单同步 30 秒内一致`？
2. **匿名 → Apple 登录**：需要迁移匿名期数据？还是"重新开始也可以"？
3. **client_logs 保留时长**：7 天 / 30 天 / 90 天 / 永久？决定要不要分区 / ClickHouse
4. **重构期 v47 hotfix 通道**：保留（开 refactor 分支）还是不保留（8-13 天不修）？
5. **Phase 2 CREDS_KEY** 保留还是清？（保留 = 老用户无感升级；清 = 更安全但要求全体重新登录）
6. **一次发 OTA vs 分两次发**：分两次风险更低但要多做一次 4-eyes review

## 建议流程

1. Frank review 本文档，回答 6 个决策问题
2. 根据答案更新 DB_SCHEMA_TARGET.md（修 B1/B2 + 相关 Critical）
3. 根据答案更新 REFACTOR_PLAN.md（修 B3/B4/B5 + rollback plan + branch strategy）
4. 完成后 Phase 1 才能启动

## 附：完整 subagent JSON

见 output file:
- `C:\Users\I585134\AppData\Local\Temp\claude\C--ClaudeCodeProjects-K0\a8e422a8-184e-4571-9426-a6f3e99526d4\tasks\ad7c263d48ddd44b0.output` (DB_SCHEMA_TARGET review)
- `C:\Users\I585134\AppData\Local\Temp\claude\C--ClaudeCodeProjects-K0\a8e422a8-184e-4571-9426-a6f3e99526d4\tasks\a50e23210d149e37b.output` (REFACTOR_PLAN review)
