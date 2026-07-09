# K0 拆表 Schema v3 · 完整设计草案

**目的**: 给 Frank review 后再动代码
**日期**: 2026-07-09
**决策依据**: Frank 明确"零 JSON"原则 + 5 个未来产品方向

---

## 📐 设计原则（Frank 决策）

1. **零业务 JSON** — 表里不用 JSON 存业务字段（`extra` 除外）
2. **每段可编辑内容 = 一行 DB 数据** — 未来 comment/edit/脑图导出都能挂上
3. **原始不动，用户 override 走独立表** — GLM 输出永久保留可"恢复默认"
4. **前端拿 count/sum 数字** — 后端 SQL 决定，前端不做业务判断
5. **未来 5 方向不改 schema** — 加 column 而不是加 JSON 字段

## 🎯 支持的未来方向（用来反检验 schema）

| 方向 | schema 支持 |
|---|---|
| 英语播客翻译中文 | `transcript_segments.language` + `transcript_translations` |
| Obsidian 脑图导出 | 结构化表遍历生成 mmd/canvas |
| 多篇合并脑图 | 跨 pack JOIN `pack_concepts` + `pack_embeddings`（未来加） |
| notebookllm 对话 | `user_pack_chats` 表（未来加） |
| Comment | `user_comments` 多态表 |
| Edit | `user_*_overrides` 表（原始不动，覆写走另一表） |

---

## 📊 完整表清单（28 张）

### 🟢 内容域 (11 张，全用户共享)

```
podcasts
  └─→ episodes
      ├─→ transcripts
      │   ├─→ transcript_segments  ⭐新
      │   └─→ transcript_translations  ⭐新（英翻中）
      └─→ learning_packs (纯元信息)
          ├─→ pack_snapshots           ⭐新
          ├─→ pack_audience            ⭐新（1:N）
          ├─→ pack_core_points         ⭐新（3 个观点）
          ├─→ pack_worth_ranges        ⭐新（值得听的段）
          ├─→ pack_skippable_ranges    ⭐新（可跳过的段）
          ├─→ pack_steps               ⭐新（6 步引导）
          │    └─→ pack_step_citations ⭐新（step 引用 segment）
          ├─→ pack_cards               ⭐新（4-8 张卡片）
          ├─→ pack_concepts            ⭐新（概念解释）
          └─→ pack_actions             ⭐新（today/week/longterm）
```

### 🔵 用户域 (1 张)

```
users
```

### 🟣 桥接域 (10 张)

```
user_pack_access         (用户对 pack 整体：star/mode/note)
user_cards               (用户对具体卡片：star/archived/review_state)
user_step_progress       (用户对 step：completed_at)
user_actions             (用户承诺的 action)

user_card_overrides      ⭐新（用户改过的卡片版本）
user_concept_overrides   ⭐新
user_core_point_overrides ⭐新
user_step_overrides      ⭐新
user_action_overrides    ⭐新

user_comments            ⭐新（多态 comment，评论任何段落）
```

### ⚙️ 运维域 (8 张，不变)

```
jobs / ai_call_logs / client_logs / push_tokens /
usage_events / debug_uploads / user_uploads / schema_migrations
```

**总计**：内容 11 + 用户 1 + 桥接 10 + 运维 8 = **30 张**（比之前估的 28 多 2，因为算了 override 表）

---

## 🗂 详细表结构

### 内容域

#### `podcasts` — 节目（无变化）
```sql
CREATE TABLE podcasts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(20) NOT NULL,
  platform_podcast_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  description TEXT,
  cover_image_url VARCHAR(500),
  rss_url VARCHAR(500),
  language VARCHAR(20),           -- 节目主要语言 (英/中)
  primary_genre VARCHAR(80),
  extra JSON,                     -- 只放"暂时不知道要存什么"（读了就要拆）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_podcast (platform, platform_podcast_id),
  INDEX idx_language (language)
);
```

#### `episodes` — 单集（`metadata` → `extra`）
```sql
CREATE TABLE episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  podcast_id BIGINT UNSIGNED NOT NULL,
  platform VARCHAR(20) NOT NULL,
  platform_episode_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  duration_seconds INT,
  cover_image_url VARCHAR(500),
  language VARCHAR(20),           -- 音频语言 (英/中)
  published_at TIMESTAMP NULL,
  audio_url VARCHAR(1000),
  audio_format VARCHAR(20),
  audio_type VARCHAR(80),
  audio_size_bytes BIGINT,
  audio_url_expires_at DATETIME(6),
  audio_last_refreshed_at TIMESTAMP,
  transcript_url_from_rss VARCHAR(500),
  extra JSON,
  first_imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_episode (platform, platform_episode_id),
  INDEX idx_podcast_id (podcast_id),
  INDEX idx_language (language)
);
```

#### `transcripts` — 转录元信息（**删掉 segments**！）
```sql
CREATE TABLE transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,      -- 'bcut' / 'apple_caption'
  provider_version VARCHAR(30),
  segment_count INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT,
  language VARCHAR(20),               -- 原文语言
  quality_score TINYINT,
  transcript_ms INT,
  extra JSON,
  status VARCHAR(20) DEFAULT 'ready',
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_provider (episode_id, provider),
  INDEX idx_episode_id (episode_id)
);
```

#### 🆕 `transcript_segments` — 转录段落
```sql
CREATE TABLE transcript_segments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL,              -- 段落顺序 (从 0 开始)
  start_sec INT NOT NULL,             -- 开始秒数
  end_sec INT NOT NULL,               -- 结束秒数
  text TEXT NOT NULL,                 -- 段落文字
  UNIQUE KEY uk_transcript_position (transcript_id, position),
  INDEX idx_transcript (transcript_id),
  FULLTEXT KEY ft_text (text)         -- 全文搜索
);
```
**支持**：点段播放 / 全文搜索 / 卡片 FK 到 segment / 未来分段翻译

#### 🆕 `transcript_translations` — 翻译（英翻中）
```sql
CREATE TABLE transcript_translations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  target_lang VARCHAR(20) NOT NULL,   -- 'zh-Hans' / 'en'
  provider VARCHAR(30),               -- 'glm' / 'deepl'
  status VARCHAR(20) DEFAULT 'ready',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_transcript_lang (transcript_id, target_lang)
);

CREATE TABLE transcript_segment_translations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  translation_id BIGINT UNSIGNED NOT NULL,   -- FK transcript_translations
  segment_id BIGINT UNSIGNED NOT NULL,       -- FK transcript_segments
  text TEXT NOT NULL,                        -- 翻译后的文字
  UNIQUE KEY uk_translation_segment (translation_id, segment_id)
);
```
**支持**：英语播客 → 段级中文翻译，与原文对齐

#### `learning_packs` — 学习包元信息（**删 pack_json**！）
```sql
CREATE TABLE learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,
  glm_model VARCHAR(30) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  generation_strategy VARCHAR(20),    -- 'plan-b' / 'v3-step1-only'
  language VARCHAR(20),               -- 生成语言（可与 transcript 不同 = 翻译过）
  mode VARCHAR(20),                   -- 'skip' / 'quick' / 'deep'（生成时确定）
  status VARCHAR(20) DEFAULT 'ready',
  generation_ms INT,
  input_tokens INT,
  output_tokens INT,
  extra JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pack (transcript_id, goal, glm_model, prompt_version),
  INDEX idx_transcript (transcript_id)
);
```

#### 🆕 `pack_snapshots` — 快照区块（1:1 learning_packs）
```sql
CREATE TABLE pack_snapshots (
  pack_id BIGINT UNSIGNED PRIMARY KEY,   -- 1:1 就用 pack_id 做 PK
  one_sentence VARCHAR(500) NOT NULL,
  value_density TINYINT UNSIGNED,        -- 1-10
  value_novelty TINYINT UNSIGNED,
  value_actionability TINYINT UNSIGNED,
  estimated_cost_minutes SMALLINT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### 🆕 `pack_audience` — 受众标签
```sql
CREATE TABLE pack_audience (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,     -- 顺序
  audience_label VARCHAR(80) NOT NULL,    -- '程序员' / '产品经理' / ...
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id),
  INDEX idx_label (audience_label)        -- 未来"给我推产品经理相关"
);
```

#### 🆕 `pack_core_points` — 核心观点
```sql
CREATE TABLE pack_core_points (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,     -- 0/1/2
  point TEXT NOT NULL,
  timestamp_sec INT,                      -- 对应原文时间戳
  segment_id BIGINT UNSIGNED,             -- 可选 FK transcript_segments
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id)
);
```

#### 🆕 `pack_worth_ranges` — 值得听的段
```sql
CREATE TABLE pack_worth_ranges (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  start_sec INT NOT NULL,
  end_sec INT NOT NULL,
  reason VARCHAR(500),
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id)
);
```

#### 🆕 `pack_skippable_ranges` — 可跳过的段
```sql
CREATE TABLE pack_skippable_ranges (
  -- 与 pack_worth_ranges 结构相同
);
```

#### 🆕 `pack_steps` — 6 步引导
```sql
CREATE TABLE pack_steps (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_number TINYINT UNSIGNED NOT NULL,  -- 1-6
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,                  -- markdown
  UNIQUE KEY uk_pack_step (pack_id, step_number),
  INDEX idx_pack (pack_id)
);
```

#### 🆕 `pack_step_citations` — step 引用哪些 segment
```sql
CREATE TABLE pack_step_citations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  step_id BIGINT UNSIGNED NOT NULL,       -- FK pack_steps.id
  segment_id BIGINT UNSIGNED NOT NULL,    -- FK transcript_segments.id
  position TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uk_step_position (step_id, position),
  INDEX idx_step (step_id),
  INDEX idx_segment (segment_id)
);
```

#### 🆕 `pack_cards` — 卡片 ⭐核心
```sql
CREATE TABLE pack_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,     -- 顺序 (原 card_index)
  quote TEXT NOT NULL,                    -- 金句
  context TEXT,                           -- 上下文
  insight TEXT,                           -- AI 洞见
  timestamp_sec INT,                      -- 原文时间戳
  segment_id BIGINT UNSIGNED,             -- 可选 FK transcript_segments
  card_type VARCHAR(30),                  -- opinion/method/case/reflection/action (可选)
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id),
  INDEX idx_segment (segment_id),
  FULLTEXT KEY ft_content (quote, insight)   -- 全文搜索
);
```

#### 🆕 `pack_concepts` — 概念解释器
```sql
CREATE TABLE pack_concepts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  term VARCHAR(200) NOT NULL,
  simple_explanation TEXT,
  contextual_explanation TEXT,
  extended_explanation TEXT,
  first_mention_sec INT,                  -- 概念第一次出现的时间
  segment_id BIGINT UNSIGNED,             -- 可选 FK
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id),
  INDEX idx_term (term)                   -- 未来"多篇合并"用 term 做关联
);
```

#### 🆕 `pack_actions` — 行动清单
```sql
CREATE TABLE pack_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  timeframe ENUM('today','week','longterm') NOT NULL,
  slot_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
  action_text VARCHAR(500) NOT NULL,
  UNIQUE KEY uk_pack_timeframe_slot (pack_id, timeframe, slot_index),
  INDEX idx_pack (pack_id)
);
```

### 用户域

#### `users` — 无变化（`metadata` → `extra`）

### 桥接域

#### `user_pack_access` — 用户对 pack 整体
```sql
CREATE TABLE user_pack_access (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  first_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INT DEFAULT 1,
  starred BOOLEAN DEFAULT FALSE,
  mode ENUM('skip','quick','deep'),
  personal_note TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user (user_id),
  INDEX idx_pack (pack_id),
  INDEX idx_starred (user_id, starred)
);
```

#### `user_cards` — 用户对卡片操作（**改：FK pack_cards.id**）
```sql
CREATE TABLE user_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_card_id BIGINT UNSIGNED NOT NULL,   -- ⭐ FK pack_cards.id (原 pack_id + card_index)
  starred BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  review_state VARCHAR(20),
  review_next_at TIMESTAMP NULL,
  review_interval_days INT,
  review_count INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_card (user_id, pack_card_id),
  INDEX idx_user_starred (user_id, starred),
  INDEX idx_user_archived (user_id, archived),
  INDEX idx_review_due (user_id, review_next_at)
);
```
**优势**：干净 FK 到 `pack_cards.id`，未来加/删/reorder pack_cards 不影响 user_cards 语义

#### `user_step_progress` — 6 步打勾（**改：FK pack_steps.id**）
```sql
CREATE TABLE user_step_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_step_id BIGINT UNSIGNED NOT NULL,   -- FK pack_steps.id
  status ENUM('done','undone') NOT NULL DEFAULT 'done',  -- 4-eyes A4 修复
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_spent_seconds INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_step (user_id, pack_step_id),
  INDEX idx_user (user_id)
);
```

#### `user_actions` — 用户承诺（**改：FK pack_actions.id**）
```sql
CREATE TABLE user_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_action_id BIGINT UNSIGNED NOT NULL,   -- FK pack_actions.id
  status ENUM('pending','done') NOT NULL DEFAULT 'pending',
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_action (user_id, pack_action_id),
  INDEX idx_user_status (user_id, status)
);
```

#### 🆕 `user_card_overrides` — 用户改过的卡片版本
```sql
CREATE TABLE user_card_overrides (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_card_id BIGINT UNSIGNED NOT NULL,
  quote_override TEXT,                     -- NULL = 用原始
  context_override TEXT,
  insight_override TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_card (user_id, pack_card_id),
  INDEX idx_user (user_id)
);
```
**读取**：`COALESCE(o.quote_override, c.quote) AS quote`

#### 🆕 类似 `user_concept_overrides` / `user_core_point_overrides` / `user_step_overrides` / `user_action_overrides`
结构类似，都是"pack_XXX_id + N 个 _override 字段"

#### 🆕 `user_comments` — 多态 comment
```sql
CREATE TABLE user_comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  target_type ENUM('card','concept','step','core_point','action','segment','pack') NOT NULL,
  target_id BIGINT UNSIGNED NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_user (user_id),
  INDEX idx_target (target_type, target_id),
  INDEX idx_user_target (user_id, target_type, target_id)
);
```
**多态**：`target_type = 'card' + target_id = 42` 指向 `pack_cards.id = 42`
**风险**：MySQL 不支持多态 FK，应用层保证一致性
**未来**：量大再拆成 5-6 张 comment 子表

### 运维域（无变化，`metadata` → `extra`）

无需重写，只改字段名：`jobs.metadata` → `jobs.extra` 等。

---

## 🎯 未来 5 方向验证

### 1. 英语播客翻译中文 ✅
- `transcript_translations` (transcript_id, target_lang='zh-Hans')
- `transcript_segment_translations` (translation_id, segment_id, text)
- `learning_packs.language='zh'` 而 `transcripts.language='en'` — 生成中文 pack
- **不改 schema，加两张表即可**

### 2. Obsidian 脑图导出 ✅
```javascript
// 生成 mmd 只需要 6 个 SELECT
const pack = await db.query('SELECT * FROM learning_packs WHERE id = ?', [id]);
const snapshot = await db.query('SELECT * FROM pack_snapshots WHERE pack_id = ?', [id]);
const cards = await db.query('SELECT * FROM pack_cards WHERE pack_id = ? ORDER BY position', [id]);
const concepts = await db.query('SELECT * FROM pack_concepts WHERE pack_id = ? ORDER BY position', [id]);
// ... 组装成 mmd 字符串
```
**优势**：干净的关系型数据，遍历生成 mmd/canvas 简单

### 3. 多篇合并脑图 ✅
```sql
-- 找 5 个 pack 里的共同概念
SELECT term, COUNT(DISTINCT pack_id) AS pack_count
FROM pack_concepts
WHERE pack_id IN (?, ?, ?, ?, ?)
GROUP BY term
HAVING pack_count >= 2
ORDER BY pack_count DESC;
```
未来可加 `pack_embeddings` 用向量相似度

### 4. notebookllm 式对话 ✅（新增表）
```sql
CREATE TABLE user_pack_chats (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  session_id CHAR(36),
  role ENUM('user','assistant','system'),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_pack_session (user_id, pack_id, session_id, created_at)
);
```

### 5. Comment + Edit ✅（已在 schema 里）
- Comment: `user_comments`
- Edit: `user_*_overrides`

---

## 📊 前端"count 即真理"验证

**Library stats**：
```sql
-- 一句 SQL 出所有数字
SELECT
  (SELECT COUNT(*) FROM user_pack_access WHERE user_id = ?) AS packs_count,
  (SELECT COUNT(*) FROM user_cards uc
    JOIN pack_cards pc ON uc.pack_card_id = pc.id
    WHERE uc.user_id = ? AND NOT uc.archived) AS cards_count,
  (SELECT COUNT(*) FROM user_cards WHERE user_id = ? AND starred) AS starred_count,
  (SELECT COUNT(*) FROM user_step_progress WHERE user_id = ? AND status='done') AS steps_done_count;
```

**前端**：直接拿数字展示。

---

## 🔧 代码迁移影响

### 大改造 (需要重写)

- `backend/migrations/001_init.sql` — 500 → 900 行
- `backend/src/services/packGenerator.js` — 事务批量 INSERT 多表
- `backend/src/routes/library.js` — 去掉 JSON_TABLE，改正常 JOIN
- `backend/src/routes/review.js` — 同上
- `backend/src/routes/packs.js` — 同上
- `backend/src/services/packStore.js` — parseAndPersistPack() 新函数

### API_SPEC 变化

Response 结构变化：`packJson` 字段消失，改为组装好的对象：
```json
{
  "pack": {
    "id": 1,
    "goal": "quick_understand",
    "snapshot": { oneSentence, valueScore, ... },
    "audience": ["程序员", "产品经理"],
    "corePoints": [...],
    "worthListening": [...],
    "skippable": [...],
    "steps": [...],
    "cards": [...],
    "concepts": [...],
    "actions": [...]
  }
}
```
前端消费无变化（原来读 `pack.pack_json.cards`，现在读 `pack.cards`），甚至更简单。

### 前端 API client

`app/episode/[id].tsx` / `app/snapshot/[packId].tsx` / `app/library.tsx` 里所有 `pack.pack_json.xxx` 改成 `pack.xxx`。

---

## ⏱ 工作量估算

| 阶段 | 时间 |
|---|---|
| 1. 写 001_init.sql 新版 | 2h |
| 2. DROP 老表 + apply 新 schema | 30min |
| 3. 重写 packGenerator.js 事务化 | 3h |
| 4. 重写 library.js / review.js / packs.js | 4h |
| 5. 前端消费适配 | 2h |
| 6. Playwright 全流程验证 | 1h |
| 7. 4-eyes review | 1h |
| **总计** | **13-14h ≈ 2 天** |

---

## ❓ 需要 Frank Review 确认的点

1. **28 张表 → 30 张表的规模**（加了 override + comment），能接受吗？
2. **override 表方案**（保留原始，用户改动走独立表） vs **直接改原表**，你倾向哪个？
3. **`user_comments` 多态 target_type/target_id**（灵活但无 FK） vs **拆成 5 张 comment 子表**（工整但膨胀），倾向？
4. **`transcript_translations`** 现在建 vs 等英语播客真做时再加，倾向？（我建议现在建，未来只加数据不改 schema）
5. **card_type 字段**（opinion/method/case/reflection/action）—— GLM v4 prompt 里没用了，还留吗？
6. **schema 里除了这些，还有想改的字段/表命名**？

---

## 我等你反馈

看完这份告诉我上面 6 点的决策 + 你有没有想加的 / 想删的。
你说 OK 我就动手（001_init + 代码重写）。
