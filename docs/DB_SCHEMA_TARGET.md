# K0 目标 Schema（重构 north star）

> **本文档是 K0 数据库和后端设计的目标状态。**
> **写作日期**：2026-07-09
> **决策者**：Frank
> **状态**：草案 — 待 Frank Review + Approve

## 三条产品约束（决定所有 schema 决策）

Frank 2026-07-09 明确回答：

1. **多用户** —— 未来会有真正多用户（不再是 `default_user = 1`）
2. **多设备** —— 同一用户在 iPad + iPhone 上同步看数据（**无 Web**）
   - **同步语义**: Last-write-wins（不做 CAS / revision / change_events）
   - iPhone 停留在旧页面不动就看旧数据，下次调接口才刷新
   - 不实时推送
3. **分享/协作** —— 暂不做，很久以后也许——但 schema 不能把内容耦合到 user_id 上
4. **匿名账户** —— 不存在。所有用户必须走登录路径。任何 `anonymous_id` 字段/数据都是脏数据要清
5. **重构期用户情况** —— 重构期间无真实用户在用，可以放心 breaking change
6. **日志保留** —— client_logs 保留 7 天（当天用完就丢），不需要分区/归档

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
- 卡片结构过去改了 3 次，DB 列硬扛不住
- JSON 里的字段可以随 prompt 版本演进，DB 不动
- pack_json 结构定义在应用代码里，不在 schema 里

**pack_json 契约（当前线上真实 shape，reverse-engineered from library.js + review.js + packStore.js）**：

```typescript
type PackJson = {
  // 快照区块（顶层字段，非 snapshot.* 嵌套）—— library.js:59 用 $.oneSentence
  oneSentence: string;
  corePoints: { point: string; timestamp: number }[];
  audience: string[];
  valueDensity: number;   // 1-10
  valueNovelty: number;
  valueActionability: number;
  estimatedCostMinutes: number;
  worthListening: { start: number; end: number; reason: string }[];
  skippable: { start: number; end: number; reason: string }[];

  // 6 步引导 —— packs.js 消费
  steps: { stepNumber: number; title: string; content: string; citations: any[] }[];

  // 卡片（当前 7 字段 —— library.js:159-170 JSON_TABLE 消费）
  cards: {
    type: string;              // opinion / method / case / reflection / action
    title: string;
    explanation: string;
    quote: string;             // Sprint 12 CR-013 加的
    insight: string;           // Sprint 12 CR-013 加的
    context: string;           // Sprint 12 CR-013 加的
    sourceTimestamp: number;
    // my_note 存 user_cards.personal_note，不在 pack_json 里
  }[];

  // 测验题
  quizzes: { type: string; question: string; options?: string[]; answer: string; explanation: string }[];

  // 概念解释器
  concepts: { term: string; simpleExplanation: string; contextualExplanation: string; extendedExplanation: string }[];

  // 行动清单 —— 允许 null（CR-017）
  actions: { today: string | null; week: string | null; longterm: string | null };
};
```

**Schema 版本演进**：pack_json 结构改变时**不改 DB schema**，改 `prompt_version` 字段。应用代码按 `prompt_version` 走兼容分支。

```sql
CREATE TABLE learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,               -- 'quick_understand','deep_learn',...
  glm_model VARCHAR(30) NOT NULL,          -- 'glm-4-plus','glm-5.2'
  prompt_version VARCHAR(20) NOT NULL,     -- 'v4','v5' —— pack_json shape 版本
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
  -- UNIQUE 不含 status（B2 修正）：同一 (transcript, goal, model, prompt) 只有一份，
  -- 应用层保证：新生成成功 → 老的 status 改 'stale' → 删除。绝不并存两条。
  UNIQUE KEY uk_pack (transcript_id, goal, glm_model, prompt_version),
  INDEX idx_transcript_id (transcript_id),
  INDEX idx_goal (goal),
  INDEX idx_status (status),
  CONSTRAINT fk_packs_transcript FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
);
```

### users

**决策**：删除 `anonymous_id` 字段（Frank 明确匿名账户不存在，是脏数据）。合入 Sprint 16 R2 的 username/password_hash。保留多种登录 ID 字段（apple/wechat/phone），因为 iOS 上 Sign in with Apple 是硬性合规要求。**未来可拆 `user_identities` 表**，但现在不做（YAGNI + 多设备用 last-write-wins 不需要账号合并）。

```sql
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
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
  subscription_expires_at DATETIME(6),        -- DATETIME 避免 2038 溢出
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

**决策**：合并 `action_index` 和 `timeframe` 的冗余——只留 `timeframe`。PRD 每档最多 3 条，`UNIQUE` 不能强制每档 1 条（B7 修正）。

```sql
CREATE TABLE user_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  timeframe ENUM('today','week','longterm') NOT NULL,
  slot_index TINYINT UNSIGNED NOT NULL DEFAULT 0,  -- 每 timeframe 内的位置 0/1/2
  action_text VARCHAR(500) NOT NULL,
  status ENUM('pending','done') DEFAULT 'pending',
  done_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 一个用户 + 一个 pack + 一个 timeframe + 一个 slot 只能一条
  UNIQUE KEY uk_user_pack_timeframe_slot (user_id, pack_id, timeframe, slot_index),
  INDEX idx_user_status (user_id, status),
  CONSTRAINT fk_ua_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ua_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE RESTRICT
);
```

**Cascade 决策**：
- `user_id ON DELETE CASCADE` — 用户注销 = 桥接一起走
- `pack_id ON DELETE RESTRICT` — pack 不允许物理删除（保护用户学习进度）

### jobs / ai_call_logs / push_tokens / usage_events

保持现状（合理）。

### 🆕 client_logs（新增，日志强化核心）

**用途**：客户端异步上传用户操作日志，让 Claude 能通过 grep 后端日志重建用户行为链。

**决策 3**：保留 7 天（当天用完就丢）。MySQL 单表够，不用分区/ClickHouse。

**PII 脱敏（B5 修正）**：event_data JSON 只允许 whitelist 字段。
- 允许：`screen_id`, `event_name`, `target_id`, `duration_ms`, `status_code`, `error_code`, `pack_id`, `card_index`
- **禁止**：email, phone, password, note_content, search_query 明文, apple_user_id, wechat_openid
- 客户端上传前必须过 `sanitize()` 函数
- 服务端 INSERT 前 reject 含黑名单 pattern 的 payload

```sql
CREATE TABLE client_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,          -- 必须（决策 2 无匿名）
  trace_id VARCHAR(64) NOT NULL,             -- 客户端生成，一次冷启动一个
  device_id VARCHAR(64),                     -- expo-application getIosIdForVendor
  device_platform VARCHAR(20),               -- 'ios-iphone','ios-ipad'
  app_version VARCHAR(20),
  ota_version VARCHAR(20),
  event_type VARCHAR(40) NOT NULL,           -- 'nav','tap','api_call','api_result','error','lifecycle'
  event_name VARCHAR(80) NOT NULL,
  event_data JSON,                           -- 仅 whitelist 字段
  screen VARCHAR(60),
  ts_client TIMESTAMP(3) NOT NULL,
  ts_server TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_ts (user_id, ts_client),
  INDEX idx_trace (trace_id),
  INDEX idx_event (event_type, event_name),
  INDEX idx_ts_server_cleanup (ts_server),   -- 供每晚 cron 删 7 天前记录
  CONSTRAINT fk_cl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

**清理策略**：每晚 cron `DELETE FROM client_logs WHERE ts_server < NOW() - INTERVAL 7 DAY`。500 用户 × 1000 log/day × 7 = 350 万行，MySQL 单表能撑。

**API**：`POST /api/logs` 接受 batch（数组），单次最多 100 条，body 上限 1MB。rate limit 60s/100 条/user。

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
7. **不加"逻辑删除"字段**，除非 UX 明确需要"垃圾桶"
8. **CASCADE 规则**：内容表之间 CASCADE（podcasts→episodes→transcripts→packs）；桥接表对 pack_id 用 `ON DELETE RESTRICT`（禁止物理删 pack）；桥接表对 user_id 用 `ON DELETE CASCADE`（用户注销带走桥接）
9. **UNIQUE 不含 status 字段**（避免同一逻辑主键下多状态并存）
10. **时间字段**：`*_expires_at / *_next_at` 用 `DATETIME(6)`（避免 2038）；`created_at / updated_at` 用 `TIMESTAMP`（自动跟随够用）

---

## Non-Goals（明确不做）

- ❌ 不引入 ORM（Prisma / TypeORM）—— 当前 `mysql2/promise` 手写 SQL 够用，ORM 隐藏成本大
- ❌ 不引入 GraphQL —— REST 够用，客户端只有 iOS
- ❌ 不引入 Redis / 缓存中间件 —— MySQL 8 + 索引够快，"服务器权威"哲学要求少缓存
- ❌ 不引入 event sourcing / CQRS —— K0 是 CRUD 应用，事件驱动过度设计
- ❌ 不引入分表分库 —— 用户量级到 10 万再考虑
- ❌ 不引入对象存储（先） —— `user_uploads` LONGBLOB 短期够用，等图片总量 > 5GB 再迁 OSS
