# CR-020 清理清单 — 2026-07-09

**执行原则**：只删**真无用**的东西，App 运行时不受任何影响。

**决策依据**：4 个 Explore subagent 侦察 + 主 agent 交叉验证 grep 引用。

---

## ✅ Tier A — 安全删除（HIGH confidence，全部零引用）

### A1. 前端死组件（全库 grep 无 import）
- `components/KnowledgeCard.tsx`
- `components/PathRibbon.tsx`
- `components/StubScreen.tsx`
- `components/ImageUploader.tsx`
- `components/FloatingBackButton.tsx`
- `components/PasteBar.tsx`
- `lib/pushNotifications.ts`（Sprint 9 v7 已回退，全库 import 已注释）

### A2. 过时设计文档（内容已实装到代码/其他文档）
- ~~`docs/DB_SCHEMA_v2.md`~~ → **移到 Tier B**（CR.md:115 仍引用，删前需修引用；本次 CR 保守保留）
- ~~`docs/DB_SCHEMA_v2_ai_logs.md`~~ → **移到 Tier B**（同上，与 v2 相关的历史文档一起保留）
- `docs/DEPLOY_v25.md`（Sprint 14 R3 单次部署清单，已执行完毕）
- ~~`docs/EAS_BUILD_CHECKLIST_v2.md`~~ → **移到 Tier B**（`docs/eas-review/product-review.md` 3 处引用）
- `docs/EAS_BUILD_EFFECTS_QUEUE.md`（已被 ONESHOT_MANIFEST 覆盖，无外部引用）

### A3. 构建产物 / 缓存 / 日志（可重建）
- `.expo/`
- `dist/`
- `.playwright-mcp/`
- `scripts/.keep-awake-v2.log`
- `scripts/.keep-awake-v2.pid`

### A4. Spike node_modules（npm install 可恢复）
- `_spike/spike-001/node_modules`
- `_spike/spike-002/node_modules`
- `_spike/spike-003/node_modules`
- `_spike/spike-005/node_modules`
- `spike/node_modules`（**Arch 补充**：项目根 spike/ 目录 Sprint 5 侦察遗留）

### A5. 一次性验证/临时文件
- `tmp/redteam_queries.txt`
- `tmp/redteam_results.md`

### A6. 后端一次性脚本（无 CI/生产引用，spike 结论已归档）
- `backend/scripts/spike-010-glm-2step.js`（结论在 `docs/spike-results/SPIKE-010.md`）
- `backend/scripts/mock-srs-test.js`（一次性 SRS 算法验证）

---

## ⚠️ Tier B — 保留（有生产依赖或审计价值）

### B1. v1 migrations（**app 依赖，不能删**）
- `backend/migrations/002_import_fields.sql` — 定义 v1 `episodes` + `transcripts`，被 `snapshots.js:75/85` 和 `episodes.js:203/254/270` 使用
- `backend/migrations/003_snapshots.sql` — 定义 v1 `snapshots`，被 `snapshots.js:96/120` 使用
- `backend/migrations/004_learning_packs.sql` — 定义 v1 `learning_packs/cards/quizzes` 等，虽直接查询少，但删除破坏 schema 历史；且新环境 migrate 必须按顺序执行
- 保留理由：Frank 明确要求 "app 本身要不受影响"。v1→v2 全量迁移是**另一个 Story**，不在本 CR 范围
- 状态：`docs/DB_SCHEMA.md` 会重写反映"v1+v2 并存"的真实状态

### B2. 补丁 migrations（活跃使用）
- 005 push_tokens / 006 user_actions / 007 pack_access_mode / 008 debug_uploads / 009 user_uploads / 010 auth_username —— 全部保留

### B3. 后端脚本（运维用途）
- `backend/scripts/apply_006.js`（新环境部署工具）
- `backend/scripts/verify-e2e.js` / `backend/scripts/smoke-test.js` / `backend/scripts/glm-copy.js`（本地开发工具，保守保留）

### B4. Spike 目录（代码保留，结论已归档）
- `_spike/spike-001` ~ `_spike/spike-005`（源码保留作参考，只删 node_modules）

### B5. 部署/参考文档
- `docs/EAS_BUILD_ONESHOT_MANIFEST.md`（build 决策基线）
- `docs/CAIRN_UPLOAD_PORT.md`（Cairn 抄袭参考，Sprint 15 架构追溯）
- `docs/AUDIO_PLAYER_DEMO.md`（音频播放实装参考）
- `docs/SPIKE_CONCLUSIONS.md`（Sprint 5 决策级文档）
- `docs/TESTFLIGHT_DEPLOY.md`（部署 SOP 记录）
- `docs/K0Card_D4_PLAN.md`（卡片重做 plan，实装追溯）
- `docs/prompts/glm-learning-pack.md`（GLM prompt v1，unclear→保守 KEEP）
- `style-demos/*.html`（UI demo，可能为 Sprint 0 style 参考）
- `style-demos/preview/`（UI 审计截图）
- `tasks/sprint8-loop-log.md`（生产部署日志）

### B6. Expo Router 页面（保守）
- `app/goal-select.tsx`（可能通过深链/动态路由触发，保留）

---

## 📝 Tier C — Schema 文档重写

`docs/DB_SCHEMA.md` 保留但**完全重写**，反映真实结构：
- v2 主表（001-init-v2 的 12 张表）为主线
- 明确标注 v1 遗留表（002-004）仍存在，被 snapshots.js/episodes.js 消费
- 补丁表 005-010 按顺序说明
- 补充 v1→v2 迁移路径（作为下一个 Story 的输入）

---

## 执行顺序

1. Arch subagent 复核本清单
2. 若 PASS → 按 A1-A6 顺序删除
3. 重写 DB_SCHEMA.md（Tier C）
4. 冒烟验证 backend 启动 + frontend expo start
5. git 全部改动 status，产出报告

## 不做的事

- ❌ 不改 backend/src/ 任何 .js 运行时代码
- ❌ 不动 v1 migrations
- ❌ 不删任何 tasks/jira/ 归档
- ❌ 不动 .env* / package-lock.json / node_modules（顶层）
