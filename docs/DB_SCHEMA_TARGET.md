# K0 目标 Schema（重构 north star）

> **本文档是 K0 数据库和后端设计的目标状态。**
> **写作日期**：2026-07-09
> **决策者**：Frank
> **状态**：草案 — 待 Frank Review + Approve

## 三条产品约束（决定所有 schema 决策）

Frank 2026-07-09 明确回答：

1. **多用户** —— 未来会有真正多用户（不再是 `default_user = 1`）
2. **多设备** —— 同一用户在 iPad + iPhone 上同步看数据（**无 Web**）
3. **分享/协作** —— 暂不做，很久以后也许——但 schema 不能把内容耦合到 user_id 上

## 核心哲学

> **只有一个版本 —— 不存在 v1/v2/v3 的概念。**
> **任何字段变更都是"当前唯一版本"的一次演进，通过 migration 追加，不通过版本号切换。**

## 系统边界

```
┌─────────────────────────────────────────────────────────────┐
│                     iPad + iPhone                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  客户端 (React Native + Expo)                          │   │
│  │  存储范围：                                             │   │
│  │    ✅ auth token (JWT/anonymousId)                    │   │
│  │    ✅ user preference (theme, locale)                 │   │
│  │    ✅ 日志上传队列（异步）                                │   │
│  │    ❌ 不存业务数据（pack/card/episode 一律 fetch）        │   │
│  └──────────────────────────────────────────────────────┘   │
│                              ↓ HTTPS                          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Node.js + Express)               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  路由层：所有 API 强制 Cache-Control: no-store          │   │
│  │  中间件：JWT 验证 + 请求日志 + 结构化 error 处理           │   │
│  │  路由分组：                                             │   │
│  │    /api/auth      → 登录注册                            │   │
│  │    /api/import    → URL → pack pipeline (job)          │   │
│  │    /api/packs     → 学习包读/写                          │   │
│  │    /api/library   → 用户 library 列表                    │   │
│  │    /api/review    → 复习队列                             │   │
│  │    /api/upload    → 图片上传                             │   │
│  │    /api/logs      → 客户端日志接收（新增）                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                              ↓                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  MySQL 8 @ yiiling.cn                        │
│                    (Single Source of Truth)                   │
└─────────────────────────────────────────────────────────────┘
```

## Schema 分域（4 个域，边界清晰）

### 域 1：Content（内容，全局共享，无 user_id）

**为什么全局共享**：user A 和 user B 导入同一集 Joe Rogan → GLM 只调一次，两人看同一份 pack。这是 v2 的正确决策，保留。

```
podcasts (节目主表)
   ↓ 1:N
episodes (单集元数据)
   ↓ 1:N
transcripts (转录，允许一集多个 provider 版本)
   ↓ 1:N
learning_packs (学习包，pack_json 里包含 snapshot/steps/cards/quizzes)
```

### 域 2：User（用户）

```
users (登录信息 + 偏好)
   ↓
（补丁 010 加的 username + password_hash 已合入）
```

### 域 3：Bridge（用户 × 内容，桥接表）

**关键**：用户对内容的**私人化行为**都存在这里，内容表本身不动。这样未来加"分享"只需要改桥接表权限，不用重构内容。

```
user_pack_access    ← 用户对哪个 pack 做过什么（starred, mode, personal_note）
user_cards           ← 用户对 pack 内 N 张卡片的操作（star/archive/review_state）
user_step_progress   ← 用户对 6 步引导的打勾
user_actions         ← 用户对行动清单的勾选（当前独立表，未来可合入 user_pack_access）
```

### 域 4：Ops（运维/日志/审计）

```
jobs             ← 后台任务状态
ai_call_logs     ← AI 调用审计（GLM/ASR 全部）
client_logs      ← 【新增】客户端日志异步上传（让 Claude 能读到用户操作链）
push_tokens      ← Expo APNs token
usage_events     ← 未来限流看板
schema_migrations ← migration 版本记录
user_uploads     ← 用户图片上传（迁到对象存储前的临时方案）
debug_uploads    ← 3-tap version popup debug 上传（内部工具）
```

---

## 每张表的目标定义（消化 v1/v2 差异后）

### podcasts

```sql
CREATE TABLE podcasts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(20) NOT NULL,           -- 'xiaoyuzhou', 'apple', 'spotify'
  platform_podcast_id VARCHAR(64) NOT NULL, -- 平台侧的节目 ID
  name VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  description TEXT,
  cover_image_url VARCHAR(500),
  rss_url VARCHAR(500),
  language VARCHAR(20),
  primary_genre VARCHAR(80),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_podcast (platform, platform_podcast_id),
  INDEX idx_language (language)
);
```

### episodes

**决策**：v1 有的 `source ENUM('youtube','apple','spotify','text')` 概念不保留——现实是只有 apple/xiaoyuzhou 走 audio，text 导入 M6 已经被移除（handler LEGACY_ENDPOINT）。所有 episode 都属于一个 podcast。

```sql
CREATE TABLE episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  podcast_id BIGINT UNSIGNED NOT NULL,
  platform VARCHAR(20) NOT NULL,
  platform_episode_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(500) NOT NULL,          -- 用户当初粘贴的 URL（audit）
  title VARCHAR(500) NOT NULL,
  description TEXT,
  duration_seconds INT,
  cover_image_url VARCHAR(500),
  language VARCHAR(20),
  published_at TIMESTAMP,
  audio_url VARCHAR(1000),                    -- 直链 mp3，可能过期
  audio_format VARCHAR(20),
  audio_type VARCHAR(80),
  audio_size_bytes BIGINT,
  audio_url_expires_at TIMESTAMP,             -- 过期需刷新
  audio_last_refreshed_at TIMESTAMP,
  transcript_url_from_rss VARCHAR(500),
  metadata JSON,
  first_imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_episode (platform, platform_episode_id),
  INDEX idx_podcast_id (podcast_id),
  INDEX idx_language (language),
  INDEX idx_published_at (published_at),
  CONSTRAINT fk_episodes_podcast FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE
);
```

### transcripts

**决策**：不再用 v1 的 `text MEDIUMTEXT`，全部 `segments JSON` 结构化（未来必需，因为音频回放需时间戳）。允许一集多个 provider（BCUT / Apple caption / 官方字幕）。

```sql
CREATE TABLE transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,       -- 'bcut', 'apple_caption', 'official'
  provider_version VARCHAR(30),
  segments JSON NOT NULL,              -- [{ start, end, text }, ...]
  segment_count INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT,
  language VARCHAR(20),
  quality_score TINYINT,               -- 未来质量打分
  transcript_ms INT,                    -- 生成耗时
  metadata JSON,
  status VARCHAR(20) DEFAULT 'ready',
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_provider (episode_id, provider),
  INDEX idx_episode_id (episode_id),
  INDEX idx_status (status),
  CONSTRAINT fk_transcripts_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
```

### learning_packs

**决策**：所有生成内容压进 `pack_json`，字段设计不进 DB 列。原因：
- 卡片结构过去改了 3 次（v1 8 字段 → v2 5 字段 → 未来可能加音频引用），DB 列硬扛不住
- JSON 里的字段可以随 prompt 版本演进，DB 不动
- pack_json 结构定义在应用代码里，不在 schema 里

**pack_json 契约**（在代码里而不在 DB 里）：
```typescript
type PackJson = {
  snapshot: { one_sentence, core_points[], audience[], value_scores, worth_listening[], skippable[] };
  steps: { step_number, title, content, citations[] }[];  // 6 步
  cards: { quote, insight, timestamp, context, my_note_default }[];  // 5 字段
  quizzes: { type, question, options[], answer, explanation }[];
  concepts: { term, simple, contextual, extended }[];
  actions: { today, week, longterm };  // 允许 null
};
```

```sql
CREATE TABLE learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,               -- 'quick_understand','deep_learn',...
  glm_model VARCHAR(30) NOT NULL,          -- 'glm-4-plus','glm-5.2'
  prompt_version VARCHAR(20) NOT NULL,     -- 'v4','v5'
  generation_strategy VARCHAR(20) DEFAULT 'plan-b',
  language VARCHAR(20),
  pack_json JSON NOT NULL,
  status VARCHAR(20) DEFAULT 'ready',
  generation_ms INT,
  input_tokens INT,
  output_tokens INT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 同 transcript + goal + model + prompt 只保留一份 ready
  UNIQUE KEY uk_pack (transcript_id, goal, glm_model, prompt_version, status),
  INDEX idx_transcript_id (transcript_id),
  INDEX idx_goal (goal),
  CONSTRAINT fk_packs_transcript FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);
```

### users

**决策**：合入 Sprint 16 R2 的 username/password_hash。保留多种登录 ID 字段（apple/wechat/phone），因为 iOS 上 Sign in with Apple 是硬性合规要求。**未来可拆 `user_identities` 表**，但现在不做（YAGNI）。

```sql
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  anonymous_id CHAR(36) UNIQUE,             -- 匿名首次进入时生成
  username VARCHAR(64) UNIQUE,               -- Sprint 16 R2 加的
  password_hash VARCHAR(255),                -- Sprint 16 R2 加的
  apple_user_id VARCHAR(255) UNIQUE,
  apple_email VARCHAR(255),
  wechat_openid VARCHAR(64) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  locale VARCHAR(10) DEFAULT 'zh-Hans',
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  subscription_tier VARCHAR(20) DEFAULT 'free',
  subscription_expires_at TIMESTAMP,
  metadata JSON,
  last_seen_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  INDEX idx_last_seen (last_seen_at)
);
```

### user_pack_access（桥接）

**决策**：合入 007 加的 `mode` 字段。

```sql
CREATE TABLE user_pack_access (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  first_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INT DEFAULT 1,
  starred BOOLEAN DEFAULT FALSE,
  mode ENUM('skip','quick','deep'),          -- 快照页选的学习深度
  personal_note TEXT,
  metadata JSON,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user_id (user_id),
  INDEX idx_user_mode (user_id, mode),
  CONSTRAINT fk_upa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_upa_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

### user_cards（桥接）

**决策**：`card_index` 指向 `pack_json.cards[i]`，不引 v1 的 `cards` 表。

```sql
CREATE TABLE user_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  card_index TINYINT UNSIGNED NOT NULL,     -- pack_json.cards 数组下标
  starred BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  personal_note TEXT,
  review_state VARCHAR(20),                  -- 'new','learning','review','graduated'
  review_next_at TIMESTAMP,
  review_interval_days INT,
  review_count INT DEFAULT 0,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_card (user_id, pack_id, card_index),
  INDEX idx_user_starred (user_id, starred),
  INDEX idx_user_archived (user_id, archived),
  INDEX idx_review_due (user_id, review_next_at),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

### user_step_progress（桥接）

保持现状（合理）。

### user_actions（桥接）

**决策**：合并 `action_index` 和 `timeframe` 的冗余——只留 `timeframe`，index 用查询时按 timeframe 排。

```sql
CREATE TABLE user_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  timeframe ENUM('today','week','longterm') NOT NULL,
  action_text VARCHAR(500) NOT NULL,
  status ENUM('pending','done') DEFAULT 'pending',
  done_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_timeframe (user_id, pack_id, timeframe),
  INDEX idx_user_status (user_id, status),
  CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ua_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

### jobs / ai_call_logs / push_tokens / usage_events

保持现状（合理）。

### 🆕 client_logs（新增，日志强化核心）

**用途**：客户端异步上传用户操作日志，让 Claude 能通过 grep 后端日志重建用户行为链。

```sql
CREATE TABLE client_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED,                   -- 允许 null（匿名首次操作）
  anonymous_id CHAR(36),
  trace_id VARCHAR(64) NOT NULL,             -- 客户端生成，一次 session 一个
  device_id VARCHAR(64),                     -- 客户端本地生成，用于跨 session 追踪
  device_platform VARCHAR(20),               -- 'ios-iphone','ios-ipad'
  app_version VARCHAR(20),
  ota_channel VARCHAR(20),
  ota_version VARCHAR(20),
  event_type VARCHAR(40) NOT NULL,           -- 'nav','tap','api_call','api_result','error','lifecycle'
  event_name VARCHAR(80) NOT NULL,           -- 具体事件名如 'library.tab_change'
  event_data JSON,                           -- 参数/结果
  screen VARCHAR(60),                        -- 当前所在页面
  ts_client TIMESTAMP(3) NOT NULL,           -- 客户端时间戳（毫秒精度）
  ts_server TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_ts (user_id, ts_client),
  INDEX idx_trace (trace_id),
  INDEX idx_event (event_type, event_name),
  INDEX idx_device_ts (device_id, ts_client)
);
```

**API**：`POST /api/logs` 接受 batch（数组），单次最多 100 条，body 上限 1MB。

**客户端行为**：
- 每个用户动作产生 1 条 log 放入本地队列
- 每 30 秒或前后台切换时 flush 队列
- 网络失败重试，重试队列超过 500 条时丢弃最老的（不阻塞 UI）
- 无 user_id 时也上传，服务端 auto-link

---

## Migration 文件结构（目标）

```
backend/migrations/
├── 001_init.sql                    ← 新目标 schema（本文档定义的所有表）
├── 002_client_logs.sql             ← 加 client_logs 表
└── 003_user_actions_dedup.sql      ← user_actions 去 action_index 字段
```

**当前生产库 → 目标 schema 的迁移方案**：见 REFACTOR_PLAN.md 阶段 2。

---

## 决策原则（未来加字段时用）

1. **能用 JSON 就用 JSON**，除非要 index 或者要 JOIN
2. **内容表永远不加 user_id**，用户维度全部走桥接表
3. **桥接表命名 `user_<content>`**，字段命名一致（`starred / archived / personal_note`）
4. **任何 ENUM 有第 4 个候选值时立刻扩宽为 VARCHAR**
5. **每张新表必须有 `created_at + updated_at`**（audit 基线）
6. **敏感字段**（password_hash / email / phone）不进 JSON，用独立列 + index
7. **不加"逻辑删除"字段**，除非 UX 明确需要"垃圾桶"（现在没有 → 不加）

---

## Non-Goals（明确不做）

- ❌ 不引入 ORM（Prisma / TypeORM）—— 当前 `mysql2/promise` 手写 SQL 够用，ORM 隐藏成本大
- ❌ 不引入 GraphQL —— REST 够用，客户端只有 iOS
- ❌ 不引入 Redis / 缓存中间件 —— MySQL 8 + 索引够快，"服务器权威"哲学要求少缓存
- ❌ 不引入 event sourcing / CQRS —— K0 是 CRUD 应用，事件驱动过度设计
- ❌ 不引入分表分库 —— 用户量级到 10 万再考虑
- ❌ 不引入对象存储（先） —— `user_uploads` LONGBLOB 短期够用，等图片总量 > 5GB 再迁 OSS
