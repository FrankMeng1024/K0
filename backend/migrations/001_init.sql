-- K0 DB Schema v2.0 initial migration
-- Sprint 6, 2026-07-05
-- 参考: docs/DB_SCHEMA_v2.md + docs/DB_SCHEMA_v2_ai_logs.md

-- ==========================================
-- 1. podcasts (节目主表，独立于 episodes)
-- ==========================================
CREATE TABLE IF NOT EXISTS podcasts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(20) NOT NULL,
  platform_podcast_id VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  author VARCHAR(255) NULL,
  description TEXT NULL,
  cover_image_url VARCHAR(500) NULL,
  rss_url VARCHAR(500) NULL,
  language VARCHAR(20) NULL,
  primary_genre VARCHAR(80) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_podcast (platform, platform_podcast_id),
  INDEX idx_language (language),
  INDEX idx_genre (primary_genre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 2. episodes (单集元数据, 全局共享)
-- ==========================================
CREATE TABLE IF NOT EXISTS episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  podcast_id BIGINT UNSIGNED NOT NULL,
  platform VARCHAR(20) NOT NULL,
  platform_episode_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT NULL,
  duration_seconds INT NULL,
  cover_image_url VARCHAR(500) NULL,
  language VARCHAR(20) NULL,
  published_at TIMESTAMP NULL,
  audio_url VARCHAR(1000) NULL,
  audio_format VARCHAR(20) NULL,
  audio_type VARCHAR(80) NULL,
  audio_size_bytes BIGINT NULL,
  audio_url_expires_at TIMESTAMP NULL,
  audio_last_refreshed_at TIMESTAMP NULL,
  transcript_url_from_rss VARCHAR(500) NULL,
  metadata JSON NULL,
  first_imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_episode (platform, platform_episode_id),
  INDEX idx_podcast_id (podcast_id),
  INDEX idx_language (language),
  INDEX idx_published_at (published_at),
  CONSTRAINT fk_episodes_podcast FOREIGN KEY (podcast_id) REFERENCES podcasts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 3. transcripts (转录内容, 全局共享)
-- ==========================================
CREATE TABLE IF NOT EXISTS transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_version VARCHAR(30) NULL,
  segments JSON NOT NULL,
  segment_count INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT NULL,
  language VARCHAR(20) NULL,
  quality_score TINYINT NULL,
  transcript_ms INT NULL,
  metadata JSON NULL,
  status VARCHAR(20) DEFAULT 'ready',
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_provider (episode_id, provider),
  INDEX idx_episode_id (episode_id),
  INDEX idx_provider (provider),
  INDEX idx_status (status),
  CONSTRAINT fk_transcripts_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 4. users
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  anonymous_id CHAR(36) NULL UNIQUE,
  apple_user_id VARCHAR(255) NULL UNIQUE,
  apple_email VARCHAR(255) NULL,
  wechat_openid VARCHAR(64) NULL UNIQUE,
  phone VARCHAR(20) NULL UNIQUE,
  display_name VARCHAR(100) NULL,
  avatar_url VARCHAR(500) NULL,
  locale VARCHAR(10) DEFAULT 'zh-Hans',
  timezone VARCHAR(50) DEFAULT 'Asia/Shanghai',
  subscription_tier VARCHAR(20) DEFAULT 'free',
  subscription_expires_at TIMESTAMP NULL,
  metadata JSON NULL,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_last_seen (last_seen_at),
  INDEX idx_subscription (subscription_tier, subscription_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 5. learning_packs (学习包, 全局共享)
-- ==========================================
CREATE TABLE IF NOT EXISTS learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,
  glm_model VARCHAR(30) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  generation_strategy VARCHAR(20) DEFAULT 'plan-b',
  language VARCHAR(20) NULL,
  pack_json JSON NOT NULL,
  status VARCHAR(20) DEFAULT 'ready',
  generation_ms INT NULL,
  input_tokens INT NULL,
  output_tokens INT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- 关键 UNIQUE: 同 transcript + 同 goal + 同 model + 同 prompt_version 只有一份 ready
  UNIQUE KEY uk_transcript_goal_model_prompt (transcript_id, goal, glm_model, prompt_version, status),
  INDEX idx_transcript_id (transcript_id),
  INDEX idx_goal (goal),
  INDEX idx_model (glm_model),
  INDEX idx_created_at (created_at),
  CONSTRAINT fk_packs_transcript FOREIGN KEY (transcript_id) REFERENCES transcripts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 6. user_pack_access (桥接表)
-- ==========================================
CREATE TABLE IF NOT EXISTS user_pack_access (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  first_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INT DEFAULT 1,
  starred BOOLEAN DEFAULT FALSE,
  personal_note TEXT NULL,
  metadata JSON NULL,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user_id (user_id),
  INDEX idx_pack_id (pack_id),
  INDEX idx_last_accessed (last_accessed_at),
  INDEX idx_starred (starred),
  CONSTRAINT fk_upa_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_upa_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 7. user_cards (卡片私人操作)
-- ==========================================
CREATE TABLE IF NOT EXISTS user_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  card_index TINYINT UNSIGNED NOT NULL,
  starred BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  personal_note TEXT NULL,
  review_state VARCHAR(20) NULL,
  review_next_at TIMESTAMP NULL,
  review_interval_days INT NULL,
  review_count INT DEFAULT 0,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_card (user_id, pack_id, card_index),
  INDEX idx_user_starred (user_id, starred),
  INDEX idx_user_archived (user_id, archived),
  INDEX idx_review_due (user_id, review_next_at),
  CONSTRAINT fk_uc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_uc_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 8. user_step_progress (学习步骤打勾)
-- ==========================================
CREATE TABLE IF NOT EXISTS user_step_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_index TINYINT UNSIGNED NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_spent_seconds INT NULL,
  UNIQUE KEY uk_user_pack_step (user_id, pack_id, step_index),
  INDEX idx_user_pack (user_id, pack_id),
  CONSTRAINT fk_usp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_usp_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 9. jobs (Job 状态持久化)
-- ==========================================
CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  input_url VARCHAR(1000) NOT NULL,
  input_type VARCHAR(20) NOT NULL,
  goal VARCHAR(40) NULL,
  episode_id BIGINT UNSIGNED NULL,
  transcript_id BIGINT UNSIGNED NULL,
  pack_id BIGINT UNSIGNED NULL,
  status VARCHAR(30) NOT NULL,
  progress TINYINT UNSIGNED DEFAULT 0,
  stage_message VARCHAR(200) NULL,
  cache_hit BOOLEAN DEFAULT FALSE,
  error_code VARCHAR(50) NULL,
  error_message VARCHAR(500) NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX idx_user_status (user_id, status, created_at),
  INDEX idx_status_created (status, created_at),
  INDEX idx_input_url (input_url(255)),
  CONSTRAINT fk_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 10. ai_call_logs (AI 调用审计，Debug + Prompt 微调)
-- ==========================================
CREATE TABLE IF NOT EXISTS ai_call_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  call_type VARCHAR(30) NOT NULL,
  provider VARCHAR(30) NOT NULL,
  model VARCHAR(50) NULL,
  prompt_version VARCHAR(20) NULL,
  user_id BIGINT UNSIGNED NULL,
  job_id CHAR(36) NULL,
  episode_id BIGINT UNSIGNED NULL,
  transcript_id BIGINT UNSIGNED NULL,
  pack_id BIGINT UNSIGNED NULL,
  request_headers JSON NULL,
  request_body_hash CHAR(64) NULL,
  request_body_snippet TEXT NULL,
  request_full_body LONGTEXT NULL,
  response_status INT NOT NULL,
  response_body_snippet TEXT NULL,
  response_full_body LONGTEXT NULL,
  parse_ok BOOLEAN NULL,
  input_tokens INT NULL,
  output_tokens INT NULL,
  total_tokens INT NULL,
  latency_ms INT NULL,
  error_code VARCHAR(50) NULL,
  error_message VARCHAR(500) NULL,
  quality_flagged BOOLEAN DEFAULT FALSE,
  quality_note TEXT NULL,
  metadata JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_call_type_created (call_type, created_at),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_job (job_id),
  INDEX idx_pack (pack_id),
  INDEX idx_episode (episode_id),
  INDEX idx_quality_flagged (quality_flagged, created_at),
  INDEX idx_error (error_code, created_at),
  INDEX idx_hash (request_body_hash),
  CONSTRAINT fk_ai_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ai_logs_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 11. usage_events (未来限流看板)
-- ==========================================
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30) NULL,
  entity_id BIGINT UNSIGNED NULL,
  metadata JSON NULL,
  ip_hash CHAR(64) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_event (user_id, event_type, created_at),
  INDEX idx_event_time (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 12. schema_migrations (迁移记录)
-- ==========================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO schema_migrations (version) VALUES ('001-init-v2');
