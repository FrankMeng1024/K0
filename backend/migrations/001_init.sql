-- K0 DB Schema v3 — 拆表版
-- 2026-07-09 Phase 1.5
-- 决策依据: Frank 零业务 JSON 原则 + 5 大未来产品方向支持
-- 参考: docs/refactor/SCHEMA_V3_DRAFT.md + SCHEMA_V3_SECOND_AUDIT.md
--
-- 【核心原则】
-- 1. 零业务 JSON: 所有业务字段是独立列。JSON 只用于 extra (临时容器) 和 client_logs/ai_call_logs (审计天然半结构化)
-- 2. 每段可编辑内容 = DB 一等公民: 未来 comment/edit/脑图/导出全部依赖
-- 3. 原始不动+override: 用户改动走 user_*_overrides 表,原始 pack_* 表永不 UPDATE
-- 4. 前端拿数字: 后端 SQL COUNT/SUM 决定, 前端不解析结构
-- 5. 无 FK (k0_user 权限限制): 应用层保证一致性
--
-- 【JSON 允许范围】(其他地方禁止用 JSON 存业务字段)
-- - jobs.input_extra, jobs.output_extra: 不同 job_type 参数天然多态
-- - client_logs.event_data: 不同 event_type 参数天然多态
-- - ai_call_logs.request_full_body, response_full_body: 审计 raw payload
-- - 各表 extra: 临时容器,读了就要拆成列

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ==========================================================================
-- 【用户域】
-- ==========================================================================

CREATE TABLE users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(64) UNIQUE,
  password_hash VARCHAR(255),
  apple_user_id VARCHAR(255) UNIQUE,
  apple_email VARCHAR(255),
  wechat_openid VARCHAR(64) UNIQUE,
  phone VARCHAR(20) UNIQUE,
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  locale VARCHAR(10) DEFAULT 'zh-Hans',
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  subscription_tier VARCHAR(20) DEFAULT 'free',
  subscription_expires_at DATETIME(6),
  extra JSON,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- 【内容域】
-- ==========================================================================

CREATE TABLE podcasts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(20) NOT NULL,
  platform_podcast_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  description TEXT,
  cover_image_url VARCHAR(500),
  rss_url VARCHAR(500),
  original_language VARCHAR(20),           -- 原始节目语言 (audit B1)
  primary_genre VARCHAR(80),
  extra JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_podcast (platform, platform_podcast_id),
  INDEX idx_original_language (original_language),
  INDEX idx_genre (primary_genre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- episodes: 音频源全部拆到 episode_audio_sources (audit B2)
CREATE TABLE episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  podcast_id BIGINT UNSIGNED NOT NULL,
  platform VARCHAR(20) NOT NULL,
  platform_episode_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(500) NOT NULL,       -- 用户当初粘贴的 URL
  title VARCHAR(500) NOT NULL,
  description TEXT,
  duration_seconds INT,
  cover_image_url VARCHAR(500),
  original_language VARCHAR(20),          -- 音频原始语言
  published_at TIMESTAMP NULL,
  transcript_url_from_rss VARCHAR(500),
  extra JSON,
  first_imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_episode (platform, platform_episode_id),
  INDEX idx_podcast_id (podcast_id),
  INDEX idx_original_language (original_language),
  INDEX idx_published_at (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit B2: 音频源独立表 (支持多源: 原版/配音/CDN 备份/低码率)
CREATE TABLE episode_audio_sources (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  source_type VARCHAR(30) NOT NULL,       -- 'original', 'dubbed', 'user_upload', 'cdn_backup'
  language VARCHAR(20),
  url VARCHAR(1000) NOT NULL,
  format VARCHAR(20),
  audio_type VARCHAR(80),
  bitrate INT,
  size_bytes BIGINT,
  expires_at DATETIME(6),
  last_refreshed_at TIMESTAMP NULL,
  is_primary BOOLEAN DEFAULT FALSE,
  -- audit C4 fix: generated column 保证每 episode 只有 1 个 is_primary=1
  primary_flag_key VARCHAR(40) AS (IF(is_primary=1, CONCAT('P',episode_id), NULL)) STORED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_source_lang (episode_id, source_type, language),
  UNIQUE KEY uk_primary (primary_flag_key),
  INDEX idx_episode (episode_id),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- transcripts: 只留元信息, segments 拆表
CREATE TABLE transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,          -- 'bcut','apple_caption','official'
  provider_version VARCHAR(30),
  segment_count INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT,
  language VARCHAR(20),                   -- 转录出来的语言
  quality_score TINYINT,
  transcript_ms INT,
  extra JSON,
  status VARCHAR(20) DEFAULT 'ready',
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_provider (episode_id, provider),
  INDEX idx_episode (episode_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit B2: transcript_segments 独立表, DECIMAL 保留毫秒精度
CREATE TABLE transcript_segments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL,
  start_sec DECIMAL(10,3) NOT NULL,       -- audit B2: 保留 3 位小数
  end_sec DECIMAL(10,3) NOT NULL,
  text TEXT NOT NULL,
  UNIQUE KEY uk_transcript_position (transcript_id, position),
  INDEX idx_transcript (transcript_id),
  FULLTEXT KEY ft_text (text) WITH PARSER ngram   -- audit C1: 中文分词
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- learning_packs: 只留元信息
CREATE TABLE learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,
  glm_model VARCHAR(30) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
  generation_strategy VARCHAR(20),
  language VARCHAR(20),                    -- 生成语言 (可与 transcript.language 不同 = 已翻译)
  mode VARCHAR(20),                        -- 'skip','quick','deep'
  status VARCHAR(20) DEFAULT 'ready',
  generation_ms INT,
  input_tokens INT,
  output_tokens INT,
  extra JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pack (transcript_id, goal, glm_model, prompt_version),
  INDEX idx_transcript (transcript_id),
  INDEX idx_goal (goal),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- pack 8 子表
CREATE TABLE pack_snapshots (
  pack_id BIGINT UNSIGNED PRIMARY KEY,
  one_sentence VARCHAR(500) NOT NULL,
  value_density TINYINT UNSIGNED,
  value_novelty TINYINT UNSIGNED,
  value_actionability TINYINT UNSIGNED,
  estimated_cost_minutes SMALLINT UNSIGNED,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_audience (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  audience_label VARCHAR(80) NOT NULL,
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id),
  INDEX idx_label (audience_label)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_core_points (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  point MEDIUMTEXT NOT NULL,
  timestamp_sec DECIMAL(10,3),
  segment_id BIGINT UNSIGNED,             -- 可选 FK transcript_segments (应用层保证)
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_worth_ranges (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  start_sec DECIMAL(10,3) NOT NULL,
  end_sec DECIMAL(10,3) NOT NULL,
  reason VARCHAR(500),
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_skippable_ranges (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  start_sec DECIMAL(10,3) NOT NULL,
  end_sec DECIMAL(10,3) NOT NULL,
  reason VARCHAR(500),
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_steps (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_number TINYINT UNSIGNED NOT NULL,   -- 1-6
  title VARCHAR(200) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  UNIQUE KEY uk_pack_step (pack_id, step_number),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_step_citations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  step_id BIGINT UNSIGNED NOT NULL,
  segment_id BIGINT UNSIGNED,              -- 允许 NULL (无 segment 绑定时)
  position TINYINT UNSIGNED NOT NULL,
  UNIQUE KEY uk_step_position (step_id, position),
  INDEX idx_step (step_id),
  INDEX idx_segment (segment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 卡片: 无 card_type (Frank 决策删除)
CREATE TABLE pack_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  quote MEDIUMTEXT NOT NULL,
  context MEDIUMTEXT,
  insight MEDIUMTEXT,
  timestamp_sec DECIMAL(10,3),
  segment_id BIGINT UNSIGNED,
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id),
  INDEX idx_segment (segment_id),
  FULLTEXT KEY ft_content (quote, insight) WITH PARSER ngram   -- audit C1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_concepts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position TINYINT UNSIGNED NOT NULL,
  term VARCHAR(200) NOT NULL,
  simple_explanation MEDIUMTEXT,
  contextual_explanation MEDIUMTEXT,
  extended_explanation MEDIUMTEXT,
  first_mention_sec DECIMAL(10,3),
  segment_id BIGINT UNSIGNED,
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id),
  INDEX idx_term (term)                     -- 未来多篇合并用
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE pack_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  timeframe VARCHAR(20) NOT NULL,           -- audit B10: ENUM → VARCHAR ('today','week','longterm',...)
  slot_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
  action_text VARCHAR(500) NOT NULL,
  UNIQUE KEY uk_pack_tf_slot (pack_id, timeframe, slot_index),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- 【桥接域: 用户 × 内容】
-- ==========================================================================

CREATE TABLE user_pack_access (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  first_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INT DEFAULT 1,
  starred BOOLEAN DEFAULT FALSE,
  mode VARCHAR(20),                         -- audit medium: ENUM → VARCHAR
  personal_note TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user (user_id),
  INDEX idx_pack (pack_id),
  INDEX idx_last_accessed (last_accessed_at),
  INDEX idx_user_starred (user_id, starred)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_cards: audit C3 加冗余 pack_id 便于 pack 级清理
CREATE TABLE user_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,         -- 冗余,便于 DELETE pack 时快速清桥接
  pack_card_id BIGINT UNSIGNED NOT NULL,
  starred BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  personal_note TEXT,                        -- 补充笔记 (不同于 user_card_overrides.quote_override 等)
  review_state VARCHAR(20),
  review_next_at TIMESTAMP NULL,
  review_interval_days INT,
  review_count INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_card (user_id, pack_card_id),
  INDEX idx_user_pack (user_id, pack_id),   -- pack 级清理
  INDEX idx_user_starred (user_id, starred),
  INDEX idx_user_archived (user_id, archived),
  INDEX idx_review_due (user_id, review_next_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_step_progress: Frank 决策删 status, 无行=未完成
CREATE TABLE user_step_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,          -- 冗余,便于 pack 级清理
  pack_step_id BIGINT UNSIGNED NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_spent_seconds INT,
  UNIQUE KEY uk_user_step (user_id, pack_step_id),
  INDEX idx_user_pack (user_id, pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_actions: audit C2 方案 A - pack_action_id 允许 NULL (用户自定义)
CREATE TABLE user_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,          -- 必需 (用户自定义 action 也属于某 pack)
  pack_action_id BIGINT UNSIGNED,            -- NULL = 用户自定义, 非 NULL = 承诺 GLM 建议
  timeframe VARCHAR(20) NOT NULL,
  slot_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
  action_text VARCHAR(500) NOT NULL,         -- 若 pack_action_id 非 NULL 且此列非空 = 用户 override
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_tf_slot (user_id, pack_id, timeframe, slot_index),
  INDEX idx_user_status (user_id, status),
  INDEX idx_pack_action (pack_action_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- override 表 (原始不动+用户覆写)
CREATE TABLE user_card_overrides (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_card_id BIGINT UNSIGNED NOT NULL,
  quote_override TEXT,
  context_override TEXT,
  insight_override TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_card (user_id, pack_card_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_concept_overrides (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_concept_id BIGINT UNSIGNED NOT NULL,
  term_override VARCHAR(200),
  simple_explanation_override TEXT,
  contextual_explanation_override TEXT,
  extended_explanation_override TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_concept (user_id, pack_concept_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_core_point_overrides (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_core_point_id BIGINT UNSIGNED NOT NULL,
  point_override TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_core_point (user_id, pack_core_point_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_step_overrides (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_step_id BIGINT UNSIGNED NOT NULL,
  title_override VARCHAR(200),
  content_override TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_step (user_id, pack_step_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Frank 决策: 只建 snapshot override (worth/skippable 用户不改)
CREATE TABLE user_pack_snapshot_overrides (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  one_sentence_override VARCHAR(500),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- user_comments 多态表 (Frank 决策)
CREATE TABLE user_comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  target_type VARCHAR(20) NOT NULL,          -- 'card','concept','step','core_point','action','segment','pack'
  target_id BIGINT UNSIGNED NOT NULL,
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_user (user_id),
  INDEX idx_target_live (target_type, target_id, deleted_at),   -- audit medium: deleted_at in index
  INDEX idx_user_target (user_id, target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================================================
-- 【运维域】
-- ==========================================================================

-- audit B4: jobs 折中方案 - 关键列独立 + input_extra/output_extra JSON
CREATE TABLE jobs (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  job_type VARCHAR(30) NOT NULL,             -- 'import','pack_generate','export_obsidian','translate','merge','chat'
  -- 关键关联字段 (未来 dashboard/统计要用)
  episode_id BIGINT UNSIGNED,
  transcript_id BIGINT UNSIGNED,
  pack_id BIGINT UNSIGNED,
  target_lang VARCHAR(20),
  -- 状态字段
  status VARCHAR(30) NOT NULL,
  progress TINYINT UNSIGNED DEFAULT 0,
  stage_message VARCHAR(200),
  cache_hit BOOLEAN DEFAULT FALSE,
  error_code VARCHAR(50),
  error_message VARCHAR(500),
  -- JSON 例外范围: 各 job_type 参数天然多态
  input_extra JSON,
  output_extra JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX idx_user_status (user_id, status, created_at),
  INDEX idx_job_type_status (job_type, status),
  INDEX idx_status_created (status, created_at),
  INDEX idx_episode (episode_id),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit B3: PK 改为 (id, created_at) 支持 partition
-- created_at 用 DATETIME (partition 不允许 TIMESTAMP - 时区依赖)
CREATE TABLE ai_call_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  call_type VARCHAR(80) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  model VARCHAR(50),
  prompt_version VARCHAR(20),
  user_id BIGINT UNSIGNED,
  job_id CHAR(36),
  episode_id BIGINT UNSIGNED,
  transcript_id BIGINT UNSIGNED,
  pack_id BIGINT UNSIGNED,
  request_headers JSON,
  request_body_hash CHAR(64),
  request_body_snippet TEXT,
  request_full_body LONGTEXT,
  response_status INT NOT NULL,
  response_body_snippet TEXT,
  response_full_body LONGTEXT,
  parse_ok BOOLEAN,
  input_tokens INT,
  output_tokens INT,
  total_tokens INT,
  latency_ms INT,
  error_code VARCHAR(50),
  error_message VARCHAR(500),
  quality_flagged BOOLEAN DEFAULT FALSE,
  quality_note TEXT,
  extra JSON,
  PRIMARY KEY (id, created_at),                -- audit B3
  INDEX idx_call_type_created (call_type, created_at),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_job (job_id),
  INDEX idx_pack (pack_id),
  INDEX idx_episode (episode_id),
  INDEX idx_quality_flagged (quality_flagged, created_at),
  INDEX idx_error (error_code, created_at),
  INDEX idx_hash (request_body_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(created_at)) (
  PARTITION p_pre_2026 VALUES LESS THAN (739983),  -- 2026-01-01
  PARTITION p_2026_07 VALUES LESS THAN (740195),  -- 2026-08-01
  PARTITION p_2026_08 VALUES LESS THAN (740226),  -- 2026-09-01
  PARTITION p_2026_09 VALUES LESS THAN (740256),  -- 2026-10-01
  PARTITION p_2026_10 VALUES LESS THAN (740287),  -- 2026-11-01
  PARTITION p_2026_11 VALUES LESS THAN (740317),  -- 2026-12-01
  PARTITION p_2026_12 VALUES LESS THAN (740348),  -- 2027-01-01
  PARTITION p_max VALUES LESS THAN MAXVALUE
);

CREATE TABLE client_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  trace_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64),
  device_platform VARCHAR(20),
  app_version VARCHAR(20),
  ota_version VARCHAR(20),
  event_type VARCHAR(40) NOT NULL,
  event_name VARCHAR(80) NOT NULL,
  event_data JSON,                             -- JSON 例外: 半结构化
  screen VARCHAR(60),
  ts_client TIMESTAMP(3) NOT NULL,
  ts_server TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_ts (user_id, ts_client),
  INDEX idx_trace (trace_id),
  INDEX idx_event (event_type, event_name),
  INDEX idx_ts_server_cleanup (ts_server)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE push_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token VARCHAR(255) NOT NULL,
  platform VARCHAR(20) NOT NULL DEFAULT 'ios',
  app_version VARCHAR(20),
  device_id VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  UNIQUE KEY uniq_token (token),
  KEY idx_user (user_id),
  KEY idx_user_device (user_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE usage_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30),
  entity_id BIGINT UNSIGNED,
  extra JSON,
  ip_hash CHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_event (user_id, event_type, created_at),
  INDEX idx_event_time (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit B6: uploads 元信息 + blob 拆表
CREATE TABLE debug_uploads (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  upload_id VARCHAR(64) UNIQUE NOT NULL,
  batch_id VARCHAR(64) NOT NULL,
  storage_backend VARCHAR(20) DEFAULT 'mysql_blob',    -- 'mysql_blob','oss','s3'
  storage_key VARCHAR(500),
  image_bytes INT NOT NULL,
  image_format VARCHAR(8) DEFAULT 'jpeg',
  extra JSON,
  app_version VARCHAR(16),
  user_id BIGINT UNSIGNED,
  uploaded_ip VARCHAR(45),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uploaded_at (uploaded_at),
  INDEX idx_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_uploads (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  upload_id VARCHAR(64) UNIQUE NOT NULL,
  batch_id VARCHAR(64) NOT NULL,
  storage_backend VARCHAR(20) DEFAULT 'mysql_blob',
  storage_key VARCHAR(500),
  image_bytes INT NOT NULL,
  image_format VARCHAR(8) DEFAULT 'jpeg',
  width INT,
  height INT,
  extra JSON,
  app_version VARCHAR(16),
  user_id BIGINT UNSIGNED,
  uploaded_ip VARCHAR(45),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_uploaded_at (uploaded_at),
  INDEX idx_batch_id (batch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Blob 存储 (仅 storage_backend='mysql_blob' 时用)
-- 未来迁 OSS: 该表停用, storage_backend='oss' + storage_key 指向 OSS
CREATE TABLE upload_blobs (
  upload_id VARCHAR(64) PRIMARY KEY,
  blob_data LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO schema_migrations (version) VALUES ('001_init_v3')
ON DUPLICATE KEY UPDATE version = version;
