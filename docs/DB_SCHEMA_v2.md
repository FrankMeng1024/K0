# K0 DB Schema v2.0 设计

**日期**：2026-07-05（Sprint 6）
**Arch**：main agent
**审批**：待 Frank 拍板

**设计原则**：
1. **URL 复用 + 用户隔离并存**：昂贵的 audio 抓取/转录**全局复用**，学习包**用户隔离但支持 cache 命中复用**
2. **未来可扩展**：预留字段/关联，避免每加一个功能就改 schema
3. **索引先行**：从第一天就加合适的索引，不留性能债
4. **软删除**：所有用户数据用 `deleted_at`，方便回滚
5. **审计字段**：所有表 `created_at` + `updated_at`（触发器自动更新）
6. **JSON 字段留弹性**：`metadata JSON` 字段专门装未来临时属性
7. **schema 版本化**：`db/migrations/` 目录管理迁移

---

## 未来 1 年可能的功能延展（预先考虑）

| 功能 | 可能 Sprint | 对 schema 影响 |
|---|---|---|
| 卡片翻转 / 收藏 / 私人笔记 | Sprint 8-9 | `user_cards` 表 |
| 学习步骤打勾 / 进度记录 | Sprint 8 | `user_step_progress` 表 |
| Review 复习队列 / 间隔重复 | Sprint 10-11 | `review_schedule` 表 |
| Library 全库检索 | Sprint 9 | 需要 pack/card 内容的全文索引 |
| Sign in with Apple 登录 | Sprint 8+（需 build） | `users.apple_id` 字段 |
| 微信登录 / 手机号 | Sprint 12+ | `users.wechat_openid` + `users.phone` |
| 家庭/团队共享 | Sprint 12+ | `groups` + `user_groups` 表 |
| 学习包分享 / 公开链接 | Sprint 14+ | `pack_shares` 表 |
| 用户订阅节目 | Sprint 15+ | `user_subscriptions` 表（订阅 podcast_id） |
| 播客节目主页 | Sprint 15+ | 拆表：`podcasts` 独立表 |
| GLM prompt 多版本 A/B | 内部试验 | `packs.prompt_version` 字段 |
| 多语言 UI（英文用户） | Sprint 20+ | `users.locale` 字段 |
| 用户反馈 / 打分 | Sprint 10+ | `pack_ratings` 表 |
| 卡片错字纠正 | Sprint 10+ | `pack_corrections` 表 |
| 支付订阅 / Pro 会员 | Sprint 18+ | `subscriptions` 表 |
| 用量统计 / 限流 | 内部 | `usage_events` 表 |
| ASR provider 切换（BCUT 挂了） | 应急 | `transcripts.provider` 已预留 |
| 分片处理（如果方案 B 失败） | 应急 | `packs.generation_strategy` 字段 |

---

## 完整 Schema v2.0

### 1. `podcasts` — 节目主表（独立于 episodes）

**理由**：Sprint 15+ 会做"节目主页"，从一开始就把节目单独出来避免大改。同一节目下 N 个 episodes。

```sql
CREATE TABLE podcasts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(20) NOT NULL,                   -- 'xiaoyuzhou'|'apple'|'youtube'|'ximalaya'...
  platform_podcast_id VARCHAR(64) NOT NULL,        -- Apple podcastId 或小宇宙节目 id
  name VARCHAR(255) NOT NULL,
  author VARCHAR(255) NULL,
  description TEXT NULL,
  cover_image_url VARCHAR(500) NULL,
  rss_url VARCHAR(500) NULL,                       -- Apple podcasts 才有
  language VARCHAR(20) NULL,                       -- 'zh'|'en'|'mixed'
  primary_genre VARCHAR(80) NULL,                  -- 'Business'|'Technology'|...
  metadata JSON NULL,                              -- 未来临时属性
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_podcast (platform, platform_podcast_id),
  INDEX idx_language (language),
  INDEX idx_genre (primary_genre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 2. `episodes` — 单集元数据（全局共享）

```sql
CREATE TABLE episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  podcast_id BIGINT UNSIGNED NOT NULL,             -- FK podcasts.id
  platform VARCHAR(20) NOT NULL,                   -- 冗余，方便过滤
  platform_episode_id VARCHAR(64) NOT NULL,        -- xyz 24-hex 或 apple i=xxx
  source_url VARCHAR(500) NOT NULL,                -- 原始用户输入的 URL
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  duration_seconds INT NULL,
  cover_image_url VARCHAR(500) NULL,
  language VARCHAR(20) NULL,                       -- zh/en/mixed（转录后填充，可能覆盖 podcast.language）
  published_at TIMESTAMP NULL,
  audio_url VARCHAR(1000) NULL,                    -- 临时缓存，可能过期
  audio_format VARCHAR(20) NULL,                   -- 'm4a'|'mp3'|'aac'
  audio_type VARCHAR(80) NULL,                     -- 'audio/mp4'|'audio/mpeg'
  audio_size_bytes BIGINT NULL,
  audio_url_expires_at TIMESTAMP NULL,             -- signed token 场景，为 NULL 视为不过期
  audio_last_refreshed_at TIMESTAMP NULL,
  transcript_url_from_rss VARCHAR(500) NULL,       -- Podcast 2.0 内嵌转录（罕见但要保留）
  metadata JSON NULL,
  first_imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_episode (platform, platform_episode_id),
  INDEX idx_podcast_id (podcast_id),
  INDEX idx_language (language),
  INDEX idx_published_at (published_at),
  CONSTRAINT fk_episodes_podcast FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**关键设计**：
- **audio_url 临时缓存**：过期就 refresh，transcript 已生成就不用 audio_url 了
- **UNIQUE (platform, platform_episode_id)**：同一集只存一行，多用户导入同 URL 命中同一行
- **language 冗余存在 episode 级**：一个节目某集可能特殊（如中文节目里的英文特辑）

### 3. `transcripts` — 转录内容（全局共享，每集×每 provider 一份）

```sql
CREATE TABLE transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,                   -- 'bcut'|'jianying'|'sensevoice'|'whisper'|'user-supplied'
  provider_version VARCHAR(30) NULL,               -- 'bcut-8' 等版本号
  segments JSON NOT NULL,                          -- [{start,end,text}...]
  segment_count INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT NULL,                       -- 音频总长
  language VARCHAR(20) NULL,
  quality_score TINYINT NULL,                      -- 1-10 内部质量评分（未来用）
  transcript_ms INT NULL,                          -- 转录耗时
  metadata JSON NULL,                              -- 未来临时属性（如错字标注、说话人分离）
  status VARCHAR(20) DEFAULT 'ready',              -- 'ready'|'stale' (provider 挂时可标 stale)
  deleted_at TIMESTAMP NULL,                       -- 软删除（provider 挂了标记但不删）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_provider (episode_id, provider),  -- 同 episode + 同 provider 只一份
  INDEX idx_episode_id (episode_id),
  INDEX idx_provider (provider),
  INDEX idx_status (status),
  CONSTRAINT fk_transcripts_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**关键设计**：
- **UNIQUE (episode_id, provider)**：一集用同一 provider 只转一次（省钱）
- **provider 字段**：未来加 SenseVoice 时不用改 schema，加一行数据
- **status='stale'**：BCUT 挂了可标 stale，切 provider 但保留旧数据

### 4. `learning_packs` — 学习包（**核心表**）

```sql
CREATE TABLE learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,                       -- quick_understand|deep_learn|find_actions|critical_thinking|for_work
  glm_model VARCHAR(30) NOT NULL,                  -- 'glm-5.2'|'glm-4.6'|...
  prompt_version VARCHAR(20) NOT NULL DEFAULT 'v1', -- prompt 版本号，改 prompt 就换版本，不覆盖老 pack
  generation_strategy VARCHAR(20) DEFAULT 'plan-b', -- 'plan-b'|'chunked'|'baseline'
  language VARCHAR(20) NULL,                       -- 生成学习包的目标语言（中文 App 默认 zh）
  pack_json JSON NOT NULL,                         -- 完整学习包（一句话+3核心点+6步+3卡片+3行动等）
  status VARCHAR(20) DEFAULT 'ready',              -- 'ready'|'failed'|'regenerating'
  generation_ms INT NULL,
  input_tokens INT NULL,
  output_tokens INT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 关键 UNIQUE：同 transcript + 同 goal + 同 model + 同 prompt_version 只有一个 ready 的 pack
  -- 这样"复用"逻辑很干净：查有没有匹配的 → 有就用，没有就生成
  UNIQUE KEY uk_transcript_goal_model_prompt (transcript_id, goal, glm_model, prompt_version, status),
  INDEX idx_transcript_id (transcript_id),
  INDEX idx_goal (goal),
  INDEX idx_model (glm_model),
  INDEX idx_created_at (created_at),
  CONSTRAINT fk_packs_transcript FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**关键设计（我推荐的复用策略）**：
- **全局共享 pack**：`UNIQUE (transcript_id, goal, glm_model, prompt_version)` 保证同 transcript + 同 goal + 同 model 只一份
- **多用户命中同 pack**：用户 A 和 B 选同一集同一 goal → 命中同一 pack_id
- **用户操作在关联表**（下面 `user_cards` / `user_step_progress`），pack 内容全局
- **prompt 迭代不覆盖旧数据**：改 prompt → prompt_version 从 v1 升 v2，老 pack 保留（用户可能已经看过并做了操作）
- **user_id 不在此表**：pack 是"内容库"，用户关联通过 `user_pack_access` 表

### 5. `user_pack_access` — 用户与学习包的桥接表（**新颖设计**）

```sql
CREATE TABLE user_pack_access (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  first_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- 第一次生成/访问
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,   -- 最后一次浏览
  access_count INT DEFAULT 1,                             -- 用户看了几次这个 pack
  starred BOOLEAN DEFAULT FALSE,                          -- 用户是否收藏整个 pack
  personal_note TEXT NULL,                                -- 用户对整个 pack 的私人笔记
  metadata JSON NULL,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user_id (user_id),
  INDEX idx_pack_id (pack_id),
  INDEX idx_last_accessed (last_accessed_at),
  INDEX idx_starred (starred),
  CONSTRAINT fk_upa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_upa_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**这是核心创新**：**pack 全局共享 + 用户体验隔离**
- 用户 Library 页 = `SELECT ... FROM user_pack_access JOIN learning_packs WHERE user_id=X ORDER BY last_accessed_at DESC`
- 每个用户能看到"自己的 Library"，但内容底层是共享的
- 收藏、笔记是用户私有的

### 6. `user_cards` — 用户对卡片的操作

```sql
CREATE TABLE user_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  card_index TINYINT UNSIGNED NOT NULL,                   -- 0/1/2（cards 数组下标）
  starred BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,                         -- 归档（不显示但保留数据）
  personal_note TEXT NULL,
  review_state VARCHAR(20) NULL,                          -- 'new'|'learning'|'review'|'mastered'（Sprint 10+ 复习队列）
  review_next_at TIMESTAMP NULL,                          -- 下次复习时间（间隔重复算法）
  review_interval_days INT NULL,                          -- 复习间隔（1/3/7/14/30 天）
  review_count INT DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_card (user_id, pack_id, card_index),
  INDEX idx_user_starred (user_id, starred),
  INDEX idx_user_archived (user_id, archived),
  INDEX idx_review_due (user_id, review_next_at),         -- Review 队列关键索引
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7. `user_step_progress` — 学习步骤打勾

```sql
CREATE TABLE user_step_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_index TINYINT UNSIGNED NOT NULL,                   -- 0-5
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_spent_seconds INT NULL,
  UNIQUE KEY uk_user_pack_step (user_id, pack_id, step_index),
  INDEX idx_user_pack (user_id, pack_id),
  CONSTRAINT fk_usp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_usp_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 8. `users` — 用户表

```sql
CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  anonymous_id CHAR(36) NULL UNIQUE,                      -- UUID，手机端 secure-store 存
  apple_user_id VARCHAR(255) NULL UNIQUE,                 -- Sign in with Apple（未来）
  apple_email VARCHAR(255) NULL,
  wechat_openid VARCHAR(64) NULL UNIQUE,                  -- 微信登录（未来）
  phone VARCHAR(20) NULL UNIQUE,                          -- 手机号（未来）
  display_name VARCHAR(100) NULL,
  avatar_url VARCHAR(500) NULL,
  locale VARCHAR(10) DEFAULT 'zh-Hans',                   -- UI 语言
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  subscription_tier VARCHAR(20) DEFAULT 'free',           -- free|pro|team（未来）
  subscription_expires_at TIMESTAMP NULL,
  metadata JSON NULL,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_last_seen (last_seen_at),
  INDEX idx_subscription (subscription_tier, subscription_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**关键设计**：
- anonymous_id + apple/wechat/phone **多身份并存**：一个 user 可以先 anonymous，后来登录 Apple 时更新绑定
- **未来延展全部预留字段**：subscription、locale、timezone

### 9. `jobs` — Job 状态持久化

```sql
CREATE TABLE jobs (
  id CHAR(36) PRIMARY KEY,                                -- UUID
  user_id BIGINT UNSIGNED NOT NULL,
  input_url VARCHAR(1000) NOT NULL,                       -- 用户原始输入的 URL
  input_type VARCHAR(20) NOT NULL,                        -- 'xiaoyuzhou'|'apple'|'text'|'unknown'
  goal VARCHAR(40) NULL,                                  -- 用户选择的学习目标
  episode_id BIGINT UNSIGNED NULL,                        -- 抓取后填充
  transcript_id BIGINT UNSIGNED NULL,                     -- 转录后填充
  pack_id BIGINT UNSIGNED NULL,                           -- 生成后填充
  status VARCHAR(30) NOT NULL,                            -- queued|downloading|transcribing|generating|ready|failed|cancelled
  progress TINYINT UNSIGNED DEFAULT 0,                    -- 0-100
  stage_message VARCHAR(200) NULL,                        -- 展示给用户的中文文案
  cache_hit BOOLEAN DEFAULT FALSE,                        -- 是否命中了已有 pack
  error_code VARCHAR(50) NULL,
  error_message VARCHAR(500) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX idx_user_status (user_id, status, created_at),
  INDEX idx_status_created (status, created_at),          -- 用于清理旧 job
  INDEX idx_input_url (input_url(255)),                   -- 未来做 "URL 分析历史"
  CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 10. `usage_events` — 用量统计（未来限流、看板）

```sql
CREATE TABLE usage_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,                            -- NULL 可为匿名事件
  event_type VARCHAR(50) NOT NULL,                         -- 'url_submitted'|'pack_generated'|'card_starred'...
  entity_type VARCHAR(30) NULL,                            -- 'episode'|'pack'|'card'
  entity_id BIGINT UNSIGNED NULL,
  metadata JSON NULL,                                      -- 具体 event 上下文
  ip_hash CHAR(64) NULL,                                   -- SHA256(ip)，隐私保护
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_event (user_id, event_type, created_at),
  INDEX idx_event_time (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 关键决策我做的（等 Frank 拍板）

### 决策 1：学习包全局共享
**理由**：
- 你 1-2 人用，同 URL + 同 goal 极可能被两个人都选到
- GLM 生成一次 90 秒 + 消耗 Lite 额度，能省则省
- 用户操作（收藏/笔记/进度）在关联表，隔离清晰

### 决策 2：`user_id` 用 anonymous_id UUID
**理由**：
- 你禁 EAS build，Sign in with Apple 需 entitlement + build
- 手机端 expo-secure-store 存 UUID（K0 已装了 async-storage）
- 未来加 Sign in with Apple 时，users 表已有 apple_user_id 字段可关联

### 决策 3：audio_url 临时缓存 + expires_at
**理由**：
- 小宇宙 CDN 部分带 signed token 24h 过期
- transcripts/packs 生成完就跟 audio 解耦，只有 iOS 播放器需要 audio
- Sprint 7 iOS 请求 pack 时 backend 检查 audio_url_expires_at，过期就重抓（<1s 开销）

### 决策 4：prompt_version 字段
**理由**：
- 你会迭代 prompt（如果发现质量还能提升）
- 老 pack 保留（用户可能已经操作过），新 prompt 产出新 pack
- 用户可选"重新生成"

### 决策 5：全部软删除 + JSON metadata 字段
**理由**：
- 用户 100% 会误删卡片/笔记，软删除方便恢复
- metadata JSON 装未来临时属性，避免每加个字段就改 schema

---

## 迁移策略（Sprint 6）

```
db/migrations/
  001-init.sql            # 建全部 10 张表
  README.md               # 迁移步骤说明
```

**部署**：K0 backend 启动时检查 migrations 表，未跑的自动跑（走标准 migration tooling，比如 `db-migrate` 或原生 SQL 脚本）

---

## 请 Frank 拍板 3 件事

1. **学习包全局共享**是否 OK？（我推荐，省额度、用户隔离通过关联表实现）
2. **anonymous_id UUID** 作为 Sprint 6 用户标识是否 OK？（未来加 Apple 登录可关联）
3. **DB 部署方案**：
   - A. 现在就 SSH 到 122.51.174.118 部署 K0 backend + MySQL（生产环境）
   - B. 先在 Windows 本地跑 MySQL Docker（`docker run mysql:8`）验证 schema，Sprint 7 或以后再部署到 VPS
   - **我推荐 B**：本地跑通再上生产，避免 Sprint 6 卡在 SSH 部署上
