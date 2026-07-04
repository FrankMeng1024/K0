# DB_SCHEMA.md — K0 数据库设计

**数据库**: MySQL 8 @ `122.51.174.118:3306`
**库名**: `k0_dev`（开发）, `k0_prod`（生产）
**ORM**: Prisma 5.x
**编码**: `utf8mb4` (支持 emoji)
**排序**: `utf8mb4_unicode_ci`

---

## 设计原则

1. **所有业务表必须有 `user_id` 外键**（MVP 阶段固定 = 1）
2. **软删除**：MVP 阶段不做（用真 DELETE），后续 CR 引入
3. **时间戳**：所有表都有 `created_at` / `updated_at`
4. **JSON 字段**：大对象（如 snapshot、citations）用 JSON 类型，简化查询与迁移
5. **索引**：按查询模式加，不无脑加
6. **外键约束**：全开，方便早期抓错

---

## Table: users

MVP 阶段仅一行默认记录。

```sql
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  email VARCHAR(255) UNIQUE,           -- MVP 阶段可为 NULL
  password_hash VARCHAR(255),          -- MVP 阶段可为 NULL
  name VARCHAR(100) NOT NULL DEFAULT 'Default User',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
);

-- 种子数据
INSERT INTO users (id, name) VALUES (1, 'Default User');
```

---

## Table: episodes

用户导入的播客集。

```sql
CREATE TABLE episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  source ENUM('youtube', 'apple', 'spotify') NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  source_id VARCHAR(200),              -- YT videoId / Apple episodeId
  title VARCHAR(500) NOT NULL,
  channel VARCHAR(200),
  guest VARCHAR(500),
  duration INT UNSIGNED,               -- 秒
  language VARCHAR(10),                -- ISO 639-1: 'en', 'zh'
  cover_url VARCHAR(500),
  published_at DATETIME,
  import_status ENUM('transcribing', 'ready', 'failed') NOT NULL DEFAULT 'transcribing',
  import_error TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_source_url (source_url(255)),
  UNIQUE KEY uk_user_source (user_id, source, source_id),

  CONSTRAINT fk_episodes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## Table: transcripts

字幕/转录（大文本）。分表避免 episode 查询时加载全文。

```sql
CREATE TABLE transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL UNIQUE,
  language VARCHAR(10) NOT NULL,
  segments JSON NOT NULL,              -- [{ start, end, text }, ...]
  raw_text LONGTEXT,                   -- 全文，用于全文搜索
  source ENUM('official_caption', 'auto_generated', 'stt') NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT fk_transcripts_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
```

---

## Table: learning_packs

一个 episode 可能对应多个 pack（不同学习目标各一个）。

```sql
CREATE TABLE learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  episode_id BIGINT UNSIGNED NOT NULL,
  goal ENUM('quick_understand', 'deep_learn', 'find_actions', 'critical_thinking', 'for_work') NOT NULL,
  language VARCHAR(10) NOT NULL,
  status ENUM('processing', 'ready', 'failed') NOT NULL DEFAULT 'processing',
  progress TINYINT UNSIGNED DEFAULT 0, -- 0-100
  error_message TEXT,
  job_id VARCHAR(36),                  -- UUID 用于查询任务状态
  actions JSON,                        -- { today, thisWeek, longTerm }
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX idx_user_episode (user_id, episode_id),
  INDEX idx_job (job_id),

  CONSTRAINT fk_packs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_packs_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
```

---

## Table: snapshots

每个 pack 对应一份快照。1:1 关系。

```sql
CREATE TABLE snapshots (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL UNIQUE,
  one_sentence VARCHAR(500) NOT NULL,
  core_points JSON NOT NULL,           -- [{ point, timestamp }] 3 个
  audience JSON,                       -- ["产品经理", ...]
  value_density TINYINT UNSIGNED,      -- 1-10
  value_novelty TINYINT UNSIGNED,      -- 1-10
  value_actionability TINYINT UNSIGNED, -- 1-10
  estimated_cost_minutes SMALLINT UNSIGNED,
  worth_listening JSON,                -- [{ start, end, reason }]
  skippable JSON,                      -- [{ start, end, reason }]
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),

  CONSTRAINT fk_snapshots_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

---

## Table: learning_steps

6 步学习路径。

```sql
CREATE TABLE learning_steps (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_number TINYINT UNSIGNED NOT NULL,  -- 1-6
  title VARCHAR(100) NOT NULL,
  content MEDIUMTEXT NOT NULL,             -- markdown
  citations JSON,                          -- [{ timestamp, text }]
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at DATETIME(3),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE KEY uk_pack_step (pack_id, step_number),

  CONSTRAINT fk_steps_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

---

## Table: concepts

概念解释器。

```sql
CREATE TABLE concepts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  term VARCHAR(200) NOT NULL,
  simple_explanation TEXT NOT NULL,
  context_explanation TEXT,
  extended_explanation TEXT,
  first_mention_timestamp FLOAT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),

  INDEX idx_pack (pack_id),

  CONSTRAINT fk_concepts_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

---

## Table: cards

知识卡片。用户可跨集浏览所有卡片（在 Library）。

```sql
CREATE TABLE cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  episode_id BIGINT UNSIGNED NOT NULL,     -- 冗余，方便 Library 查询
  type ENUM('opinion', 'method', 'case', 'reflection', 'action') NOT NULL,
  title VARCHAR(300) NOT NULL,
  explanation TEXT NOT NULL,
  source_timestamp FLOAT,
  my_application TEXT,
  starred BOOLEAN NOT NULL DEFAULT TRUE,   -- 默认收藏
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX idx_user_starred_created (user_id, starred, created_at DESC),
  INDEX idx_user_type (user_id, type),
  INDEX idx_episode (episode_id),
  FULLTEXT KEY ft_search (title, explanation, my_application),

  CONSTRAINT fk_cards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cards_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE,
  CONSTRAINT fk_cards_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
);
```

---

## Table: quizzes

测验题。

```sql
CREATE TABLE quizzes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  type ENUM('multiple_choice', 'short_answer') NOT NULL,
  question TEXT NOT NULL,
  options JSON,                            -- ["A", "B", "C", "D"] for MCQ
  correct_answer VARCHAR(500) NOT NULL,
  explanation TEXT,
  source_timestamp FLOAT,
  user_answer VARCHAR(500),
  user_answered_at DATETIME(3),
  is_correct BOOLEAN,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),

  INDEX idx_pack (pack_id),

  CONSTRAINT fk_quizzes_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
);
```

---

## Table: reviews

每张卡片的复习进度。

```sql
CREATE TABLE reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  card_id BIGINT UNSIGNED NOT NULL UNIQUE, -- 一张卡片一条记录
  next_review_at DATETIME(3) NOT NULL,
  last_reviewed_at DATETIME(3),
  interval_days SMALLINT UNSIGNED DEFAULT 1,  -- 当前间隔（天）
  ease_factor DECIMAL(3,2) DEFAULT 2.50,      -- SM-2 简化
  review_count INT UNSIGNED DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

  INDEX idx_user_next_review (user_id, next_review_at),

  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reviews_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);
```

**间隔算法**（MVP 简化版）:
- 明天（+1 天）
- 三天后（+3 天）
- 一周后（+7 天）
- 用户反馈 `remembered` → 下次间隔 × 2
- 用户反馈 `fuzzy` → 保持当前间隔
- 用户反馈 `forgot` → 重置为 +1 天

Post-MVP 可升级为 SM-2 算法（`ease_factor` 字段预留）。

---

## Table: ai_call_logs

AI 调用日志（后续做用量分析）。

```sql
CREATE TABLE ai_call_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED,
  pack_id BIGINT UNSIGNED,
  purpose VARCHAR(50) NOT NULL,           -- 'snapshot', 'steps', 'concepts', 'cards', 'quiz', 'ask'
  model VARCHAR(50) NOT NULL,             -- 'glm-4-plus'
  input_tokens INT UNSIGNED,
  output_tokens INT UNSIGNED,
  duration_ms INT UNSIGNED,
  status ENUM('success', 'error') NOT NULL,
  error_message TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),

  INDEX idx_user_created (user_id, created_at DESC),
  INDEX idx_pack (pack_id)
);
```

---

## Prisma schema.prisma 结构

Backend 使用 Prisma，schema.prisma 文件在 STORY-00001 生成。以下是概览：

```prisma
model User {
  id           BigInt   @id @default(autoincrement())
  email        String?  @unique
  passwordHash String?  @map("password_hash")
  name         String   @default("Default User")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  episodes       Episode[]
  learningPacks  LearningPack[]
  cards          Card[]
  reviews        Review[]

  @@map("users")
}
// ...（其余略，STORY-00001 具体生成）
```

---

## 迁移策略

- **MVP**: Prisma migrations（`prisma migrate dev` 开发, `prisma migrate deploy` 生产）
- **Schema 变更规则**: Backend 提出 → 写 `tasks/schema_change_request.md` → DBA 执行 → 删除请求文件
- **回滚**: MVP 阶段不做自动回滚；每次 migrate 前手动备份 dump

---

## 初始种子数据

Sprint 0 完成后需要执行：
```sql
INSERT INTO users (id, name) VALUES (1, 'Default User');
```

由 STORY-00001 的 seed script 完成。

---

## 索引策略

**已加**（在 CREATE 中）:
- 主键（自增 id）
- 外键索引
- Library 常用查询（user + created_at desc, user + type）
- 全文搜索索引（`ft_search` 在 cards.title + explanation + my_application）
- 复习队列查询（user + next_review_at）

**暂不加**（等真实负载再评估）:
- 复合过滤（type + starred + created_at）
- 时间戳字段单独索引（作为 order by 时使用主索引即可）
