# K0 数据库 Schema — 真实状态（2026-07-09）

> **本文档反映当前生产 DB 的真实结构，不是理想设计。**
> **重构目标（v3 全量迁移）另开 Story，不在本文档范围。**

**数据库**: MySQL 8 @ yiiling.cn (`122.51.174.118:3306`)
**库名**: `k0_dev`（开发）
**编码**: `utf8mb4` / `utf8mb4_unicode_ci`
**Driver**: `mysql2/promise`（未使用 ORM）

---

## 🚨 结构性现状：v1 + v2 双 schema 并存

K0 在 Sprint 6 引入 v2 schema (`backend/db/migrations/001-init-v2.sql`)，但 v1 表（Sprint 2-3 定义）**没有下线**。原因：`backend/src/routes/snapshots.js` 和 `backend/src/routes/episodes.js` 仍在读写 v1 结构。

**运行时事实**：
- 新用户从 `/api/import` 路径进来 → 写 v2 表（`podcasts` → `episodes` v2 → `transcripts` v2 → `learning_packs` v2）
- 快照页面 `/api/episodes/:id/snapshot` → 读 v1 `episodes` + v1 `transcripts` + v1 `snapshots`

**这是技术债，需要 v3 迁移 Story 消除。本文档如实记录。**

---

## Migration 文件全景

| 文件 | 作用 | 状态 |
|---|---|---|
| `backend/migrations/001_init.sql` | v1: `users` (email + display_name) + `schema_migrations` | 🟢 生效 |
| `backend/migrations/002_import_fields.sql` | v1: `episodes` (user_id 字段) + `transcripts` (text) | 🟡 v1，snapshots.js/episodes.js 依赖 |
| `backend/migrations/003_snapshots.sql` | v1: `snapshots` (episode_id + snapshot_json) | 🟡 v1，snapshots.js 依赖 |
| `backend/migrations/004_learning_packs.sql` | v1: `learning_packs` + `pack_snapshots` + `learning_steps` + `cards` + `quizzes` | 🟡 v1 定义仍存在，直接查询已迁走 |
| `backend/migrations/005_push_tokens.sql` | 补丁：Expo 推送 token | 🟢 生效 |
| `backend/migrations/006_user_actions.sql` | 补丁：用户行动清单勾选 | 🟢 生效 |
| `backend/migrations/007_pack_access_mode.sql` | 补丁：user_pack_access.mode (skip/quick/deep) | 🟢 生效 |
| `backend/migrations/008_debug_uploads.sql` | 补丁：3-tap version popup debug 上传 | 🟢 生效 |
| `backend/migrations/009_user_uploads.sql` | 补丁：产品级用户图片上传 | 🟢 生效 |
| `backend/migrations/010_auth_username.sql` | 补丁：users 加 username + password_hash | 🟢 生效 |
| `backend/db/migrations/001-init-v2.sql` | **v2 主 schema**：12 张表全量重构 | 🟢 生效（新流程走 v2） |

**注意**：v2 migration 在**独立目录** `backend/db/migrations/`，不在 v1 目录 `backend/migrations/`。这是两套并存的物理证据。

---

## v2 主 Schema（001-init-v2.sql，12 张表）

### 🟢 内容域（全局共享，无 user_id）

**podcasts** — 节目主表
```
id, platform, platform_podcast_id (UK: 组合),
name, author, description, cover_image_url, rss_url, language, primary_genre,
metadata JSON, created_at, updated_at
```

**episodes** (v2) — 单集元数据
```
id, podcast_id FK, platform, platform_episode_id (UK: 组合),
source_url, title, description, duration_seconds, cover_image_url, language,
published_at, audio_url, audio_format, audio_type, audio_size_bytes,
audio_url_expires_at, audio_last_refreshed_at, transcript_url_from_rss,
metadata JSON, first_imported_at, updated_at
```
⚠️ **与 v1 `episodes` 同名不同结构**。v1 有 `user_id`，v2 没有。

**transcripts** (v2) — 转录内容
```
id, episode_id FK, provider, provider_version,
segments JSON, segment_count, total_chars, duration_seconds, language,
quality_score, transcript_ms, metadata JSON, status, deleted_at, created_at
UNIQUE (episode_id, provider)
```
⚠️ **与 v1 `transcripts` 同名不同结构**。v1 是 `text MEDIUMTEXT`，v2 是 `segments JSON` 字幕数组。

**learning_packs** (v2) — 学习包
```
id, transcript_id FK, goal, glm_model, prompt_version, generation_strategy,
language, pack_json JSON, status, generation_ms, input_tokens, output_tokens,
metadata JSON, created_at, updated_at
UNIQUE (transcript_id, goal, glm_model, prompt_version, status)
```
⚠️ **与 v1 `learning_packs` 同名不同结构**。v1 有 `user_id + episode_id`，v2 是 `transcript_id`；v1 内容散在 5 张表，v2 全部压进 `pack_json`。

### 🟢 用户域

**users** (v2 版) — 定义在 001-init-v2.sql
```
id, anonymous_id (UK), apple_user_id (UK), apple_email,
wechat_openid (UK), phone (UK),
display_name, avatar_url, locale, timezone,
subscription_tier, subscription_expires_at,
metadata JSON, last_seen_at, created_at, updated_at, deleted_at
```
补丁 010 追加：`username (UK)` + `password_hash`（Sprint 16 登录系统）

⚠️ v1 `001_init.sql` 也定义了 `users`（email + display_name）。**MySQL `CREATE TABLE IF NOT EXISTS` 让先跑的赢**——生产库以 v1 结构为底，v2 结构字段是 001-init-v2 在 v1 之上补齐的（通过后续 ALTER）。**这里需要人工核对生产库实际字段**。

### 🟢 桥接域（用户 × 内容）

**user_pack_access** — 用户对包的私人访问 (桥接表)
```
id, user_id FK, pack_id FK,
first_accessed_at, last_accessed_at, access_count,
starred, personal_note, metadata JSON
UNIQUE (user_id, pack_id)
```
补丁 007 追加：`mode ENUM('skip','quick','deep')` — 快照页选的学习深度

**user_cards** — 卡片私人操作（内容在 `learning_packs.pack_json`，此表只存 star/archive/review）
```
id, user_id FK, pack_id FK, card_index (小于 pack_json.cards.length),
starred, archived, personal_note,
review_state, review_next_at, review_interval_days, review_count,
metadata JSON, created_at, updated_at
UNIQUE (user_id, pack_id, card_index)
```

**user_step_progress** — 6 步学习路径打勾
```
id, user_id FK, pack_id FK, step_index,
completed_at, time_spent_seconds
UNIQUE (user_id, pack_id, step_index)
```

### 🟢 运维域

**jobs** — 后台任务状态（CHAR(36) uuid PK）
```
id (uuid), user_id FK, input_url, input_type, goal,
episode_id FK opt, transcript_id FK opt, pack_id FK opt,
status, progress, stage_message, cache_hit,
error_code, error_message, metadata JSON,
created_at, updated_at, started_at, completed_at
```

**ai_call_logs** — 所有 GLM/ASR 调用审计
```
id, call_type, provider, model, prompt_version,
user_id FK opt, job_id FK opt, episode_id, transcript_id, pack_id,
request_headers JSON, request_body_hash, request_body_snippet, request_full_body,
response_status, response_body_snippet, response_full_body,
parse_ok, input_tokens, output_tokens, total_tokens, latency_ms,
error_code, error_message, quality_flagged, quality_note,
metadata JSON, created_at
```

**usage_events** — 未来限流看板
```
id, user_id FK opt, event_type, entity_type, entity_id,
metadata JSON, ip_hash, created_at
```

**schema_migrations** — 迁移版本记录
```
version PK, applied_at
```

---

## 补丁表（005-009，与 v2 主 schema 平级）

**push_tokens** — Expo APNs token
```
id, user_id FK, token (UK), platform, app_version,
created_at, updated_at, last_used_at
```

**user_actions** — 行动清单勾选（承诺）
```
id, user_id FK, pack_id (未加 FK),
action_index (0/1/2), action_text, timeframe (today/week/longterm),
status (pending/done), done_at, created_at, updated_at
UNIQUE (user_id, pack_id, action_index)
```
⚠️ 冗余：`action_index` 与 `timeframe` 一一对应，重构时可删一个。

**debug_uploads** — 3-tap version popup 上传图片
```
id, upload_id (UK), batch_id,
image_blob LONGBLOB, image_bytes, image_format,
meta JSON, app_version, user_id (无 FK), uploaded_ip, uploaded_at
```

**user_uploads** — 产品级用户图片上传
```
id, upload_id (UK), batch_id,
image_blob LONGBLOB, image_bytes, image_format, width, height,
meta JSON, app_version, user_id (无 FK), uploaded_ip, uploaded_at, deleted_at
```
⚠️ LONGBLOB 存二进制，未来扩展时会成瓶颈，应迁到对象存储。

---

## 🟡 v1 遗留 Schema（002-004，仍被代码消费）

以下表定义仍在 migration 里，`snapshots.js` + `episodes.js` 仍在读写。**新流程 (`importUrl.js` / `generate.js` / `packStore.js`) 走 v2**。

**episodes** (v1) — 定义在 002_import_fields.sql
```
id, user_id FK NOT NULL, source ENUM('youtube','apple','spotify','text'),
source_url, source_id, title, channel, duration, language ENUM,
cover_url, audio_url, published_at,
import_status ENUM, created_at, updated_at
UNIQUE (user_id, source, source_id)
```
消费者：`snapshots.js:75`（SELECT），`episodes.js:203/254/270`（多处）

**transcripts** (v1) — 定义在 002_import_fields.sql
```
id, episode_id FK, text MEDIUMTEXT, language ENUM, created_at
```
消费者：`snapshots.js:85`

**snapshots** (v1) — 定义在 003_snapshots.sql
```
id, episode_id FK UK, snapshot_json JSON, language ENUM, created_at, updated_at
```
消费者：`snapshots.js:96/120`

**learning_packs / pack_snapshots / learning_steps / cards / quizzes** (v1) — 定义在 004_learning_packs.sql
- 表定义仍存在
- 直接 SQL 查询已迁走（grep 零结果）
- 保留原因：v1 `learning_packs` 与 v2 `learning_packs` 同名，删了会破坏 CREATE 顺序；且 schema 历史需保留作审计

---

## 关系图（v2 主域）

```
podcasts (1) ─────< episodes v2 (N) ─────< transcripts v2 (N) ─────< learning_packs v2 (N)
                                                                          │
users (1)                                                                 │
   ├──< user_pack_access (M:N) ──────────────────────────────────────────┤
   ├──< user_cards (N) ─FK────> learning_packs                            │
   ├──< user_step_progress (N) ─FK────> learning_packs                    │
   ├──< user_actions (N) ─无 FK 但 pack_id 逻辑指向 learning_packs         │
   ├──< push_tokens (N)                                                   │
   ├──< jobs (N) ─FK opt────> episodes/transcripts/learning_packs         │
   ├──< ai_call_logs (N) ─FK opt────> jobs                                │
   ├──< user_uploads / debug_uploads (N)                                  │
```

---

## v3 迁移路径（另开 Story，本文档只列出）

**目标**：消除 v1/v2 双 schema。

**必须做的代码改动**：
1. `backend/src/routes/snapshots.js` 重写，读 v2 `transcripts` (segments JSON) + v2 `learning_packs.pack_json` 里的 snapshot 字段（若已在 pack_json 内则直接读；若不在则新增字段）
2. `backend/src/routes/episodes.js` 重写，改读 v2 `episodes` (podcast_id + platform + platform_episode_id)
3. 数据迁移脚本：v1 数据搬到 v2 表
4. 下线 v1 表：手动 `DROP TABLE snapshots, learning_steps, pack_snapshots, quizzes, concepts, cards` 及 v1 `episodes/transcripts/learning_packs`（后三个需 RENAME 后 DROP，避免和 v2 同名冲突）
5. 清空 002/003/004 migration 文件或改为 no-op

**风险点**：
- 生产 DB 里 v1 数据可能有 v2 没保留的字段（例如老的 `cards.type` 5 分类）
- 迁移期间需 dual-write
- `snapshots` (v1) 和 `snapshot_json` 在 pack_json 内的结构未必一致

**评估**：v3 迁移是 3-5 天工作量的独立 Sprint，不含在本 CR-020。

---

## 索引清单（生效中）

已加：
- 所有主键（自增 id）
- 所有外键索引
- 高频查询：`(user_id, created_at)`, `(user_id, starred)`, `(user_id, archived)`, `(user_id, review_next_at)`
- 唯一约束：`(user_id, pack_id)`, `(transcript_id, goal, glm_model, prompt_version, status)` 等

暂不加（负载不明）：
- 全文搜索索引（v1 `cards` 有 FULLTEXT，v2 未加）
- `learning_packs.pack_json` 内部路径索引（MySQL 8 支持但未启用）
