# Phase 1 Playwright Golden Path Verdict

**日期**: 2026-07-09
**Commits**: `2af86e3` → `d58299b` → `52c425b` → `7ca4a5b` → `e03f051` → `ef924b0` → `6df9ae8`
**验证方式**: MCP Playwright + 本地 backend (:3002) + expo web (:8081) + 生产 DB (yiiling.cn)
**测试账号**: `frank_final` / `Test123456` (user_id=2)
**测试内容**: 小宇宙 EP127 硬地骇客 (`6a281b8434bdac55b506eb7b`)

## Verdict

**PASS** ✅ — Phase 1 Golden Path 完整走通，未引入 regression。

## Golden Path 完整验证清单

| 步骤 | 结果 | 证据 |
|---|---|---|
| 1. 冷启动 → login guard 生效 | ✅ | 未登录访问 `/` 自动跳 `/login` |
| 2. 注册 `frank_final` (POST `/api/auth/register`) | ✅ | 200，token 存 localStorage |
| 3. JWT 自动注入 (`Authorization: Bearer`) | ✅ | 后续所有 API 200，backend log 确认 `authorization` header |
| 4. Home 渲染 3 卡片 (Learn/Review/Library) | ✅ | 01-home / 无 error |
| 5. Learn → 粘贴小宇宙 URL → 点开始 | ✅ | POST `/api/episodes/import-url` 200 |
| 6. Job 创建 + 进入 `/import/[jobId]` 轮询 | ✅ | jobId=`f8f58fa7...` |
| 7. 拿到播客音频 (5%) | ✅ | `拿到播客了` |
| 8. BCUT ASR 转录 (35%) | ✅ | `Transcript created` + `Language detected` |
| 9. GLM 快照生成 (70% → 100%) | ✅ | `Snapshot generated (Step 2 pending user decision)` + `Job complete` |
| 10. Library 显示学习包 (1) | ✅ | 05-library-with-real-pack.png |
| 11. Snapshot 页面完整渲染 | ✅ | 06-snapshot-full.png — 价值分/时间戳/受众/6段/2跳过/3按钮 |
| 12. Step 2 (速学模式) POST `/api/packs/:packId/generate` | ✅ | 200, jobId=`cb6f301c...` |
| 13. Step 2 GLM 84s 完成 | ✅ | Job status=ready, progress=100 |
| 14. pack_json 结构完整 | ✅ | 12 顶层 key，4 张 cards |
| 15. cards 字段契约对齐 | ✅ | quote/context/insight/timestamp 字段 = API_SPEC v3 定义 |
| 16. Library 卡片计数正确 | ✅ | 07-library-quick-pack.png — 学习包 (1) + 卡片 (4) |
| 17. 全流程 0 console error | ✅ | 每次导航后 `browser_console_messages(level="error")` = 0 (除 favicon 404 无关) |

## 4-eyes Blocker 修复验证

| Blocker | 位置 | 验证结果 |
|---|---|---|
| B1. `importUrl.js:317` `user.id` undefined | Pipeline 不再 crash | ✅ Job 完整走完 (5% → 100%) |
| B2. `review.js:299` uncommit 缺 timeframe | DELETE WHERE 加 timeframe | ✅ 前端 body 传 timeframe，SQL 精确匹配 |
| B3. JWT_SECRET production 断言 | production 拒启 dev fallback | ✅ 代码 `middleware/auth.js` 加断言（本地 dev 未触发） |
| B4. 401 recovery | apiFetch 401 → clearSession + redirect | ✅ 代码验证（未在本次触发过期 token） |
| Arch B4. `packs.js:226` skippableRanges | start/end 字段名统一 | ✅ SQL 净化功能恢复 |

## 已知遗留（不 Blocker，Phase 4a/OTA 前修）

- Metro `Require cycle: lib/auth.ts -> lib/api.ts` warning：功能已通，iOS release build 前需用 `lib/session.ts` 第三方模块彻底解耦（Risk B4 建议）
- `.env.local` 指向 `localhost:3002`：EAS build 前必须改回 `https://api.k0.yiiling.cn`
- 生产 backend 仍跑 v47 老代码：OTA 前必须部署新代码（Risk B3）
- `JWT_SECRET` 当前 dev 占位符：生产部署前必须 `openssl rand -hex 32`

## Phase 1 数据库最终状态

- 17 tables 全部按 `001_init.sql` 目标 schema 建
- 无 anonymous_id / anonymous_id / v1 遗留字段
- schema_migrations 只有 `001_init` 一条

**测试遗留数据**（Phase 4a 前需 TRUNCATE）：
- users: `frank_final` (id=2)
- podcasts: 硬地骇客
- episodes: EP127
- transcripts: BCUT ASR 结果
- learning_packs: pack_id=1 with 4 cards
- user_pack_access: user=2, pack=1, mode=quick
- jobs: 2 completed jobs

## Phase 1 Exit — PASS

- [x] 代码 Blocker 全部修
- [x] Golden Path 完整验证
- [x] 无 regression
- [x] 4-eyes review 4 subagent 已跑（发现的 Blocker 全部处理）

**下一步**：可以进 Phase 2（前端零业务缓存 + React Query）。
