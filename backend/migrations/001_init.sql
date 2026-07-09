-- K0 DB Schema — 001_init.sql
-- 2026-07-09 重构 Phase 1: 唯一初始 schema（无 V 概念）
-- 依据: docs/DB_SCHEMA_TARGET.md v2 (Frank 6 大决策落地)
--
-- 从空库执行本文件可以得到完整目标 schema。
-- 生产库执行前：TRUNCATE 所有业务表 → 手动 UPDATE schema_migrations SET version='001_init' WHERE version='001-init-v2'
--                后续 migrations 011+ 才是"新变化"
--
-- 【FOREIGN KEY 策略】
-- k0_user 无 REFERENCES 权限（生产 DB 现实约束）。
-- 数据完整性通过应用层保证：
--   - DELETE user → 应用层显式 delete 所有桥接表 (user_pack_access / user_cards / user_step_progress / user_actions / push_tokens / client_logs)
--   - DELETE learning_pack → 禁止（应用层 reject）
--   - 索引 idx_<fk_column> 用于查询性能，替代 FK 的索引效果
-- 应用层责任在 backend/src/services/*.js 里显式实现。

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ==========================================
-- 1. users (用户)
-- 决策 2: 无 anonymous_id
-- ==========================================
CREATE TABLE IF NOT EXISTS users (
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
  metadata JSON,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 2. podcasts (节目)
-- ==========================================
CREATE TABLE IF NOT EXISTS podcasts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  platform VARCHAR(20) NOT NULL,
  platform_podcast_id VARCHAR(64) NOT NULL,
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
  INDEX idx_language (language),
  INDEX idx_genre (primary_genre)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 3. episodes (单集，全局共享)
-- ==========================================
CREATE TABLE IF NOT EXISTS episodes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  podcast_id BIGINT UNSIGNED NOT NULL,
  platform VARCHAR(20) NOT NULL,
  platform_episode_id VARCHAR(64) NOT NULL,
  source_url VARCHAR(500) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  duration_seconds INT,
  cover_image_url VARCHAR(500),
  language VARCHAR(20),
  published_at TIMESTAMP NULL,
  audio_url VARCHAR(1000),
  audio_format VARCHAR(20),
  audio_type VARCHAR(80),
  audio_size_bytes BIGINT,
  audio_url_expires_at DATETIME(6),
  audio_last_refreshed_at TIMESTAMP NULL,
  transcript_url_from_rss VARCHAR(500),
  metadata JSON,
  first_imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_platform_episode (platform, platform_episode_id),
  INDEX idx_podcast_id (podcast_id),
  INDEX idx_language (language),
  INDEX idx_published_at (published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 4. transcripts (转录)
-- ==========================================
CREATE TABLE IF NOT EXISTS transcripts (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  episode_id BIGINT UNSIGNED NOT NULL,
  provider VARCHAR(30) NOT NULL,
  provider_version VARCHAR(30),
  segments JSON NOT NULL,
  segment_count INT NOT NULL,
  total_chars INT NOT NULL,
  duration_seconds INT,
  language VARCHAR(20),
  quality_score TINYINT,
  transcript_ms INT,
  metadata JSON,
  status VARCHAR(20) DEFAULT 'ready',
  deleted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_episode_provider (episode_id, provider),
  INDEX idx_episode_id (episode_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 5. learning_packs (学习包)
-- 决策 B2: UNIQUE 不含 status
-- ==========================================
CREATE TABLE IF NOT EXISTS learning_packs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  transcript_id BIGINT UNSIGNED NOT NULL,
  goal VARCHAR(40) NOT NULL,
  glm_model VARCHAR(30) NOT NULL,
  prompt_version VARCHAR(20) NOT NULL,
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
  UNIQUE KEY uk_pack (transcript_id, goal, glm_model, prompt_version),
  INDEX idx_transcript_id (transcript_id),
  INDEX idx_goal (goal),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 6. user_pack_access (桥接: 用户 × pack)
-- 决策 007 mode 字段合入，加 updated_at
-- ==========================================
CREATE TABLE IF NOT EXISTS user_pack_access (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  first_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  access_count INT DEFAULT 1,
  starred BOOLEAN DEFAULT FALSE,
  mode ENUM('skip','quick','deep'),
  personal_note TEXT,
  metadata JSON,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack (user_id, pack_id),
  INDEX idx_user_id (user_id),
  INDEX idx_pack_id (pack_id),
  INDEX idx_last_accessed (last_accessed_at),
  INDEX idx_starred (starred),
  INDEX idx_user_mode (user_id, mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 7. user_cards (桥接: 用户对卡片的私人操作)
-- ==========================================
CREATE TABLE IF NOT EXISTS user_cards (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  card_index TINYINT UNSIGNED NOT NULL,
  starred BOOLEAN DEFAULT FALSE,
  archived BOOLEAN DEFAULT FALSE,
  personal_note TEXT,
  review_state VARCHAR(20),
  review_next_at TIMESTAMP NULL,
  review_interval_days INT,
  review_count INT DEFAULT 0,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_card (user_id, pack_id, card_index),
  INDEX idx_user_pack_archived_starred (user_id, pack_id, archived, starred),
  INDEX idx_user_starred (user_id, starred),
  INDEX idx_user_archived (user_id, archived),
  INDEX idx_review_due (user_id, review_next_at),
  INDEX idx_pack_id (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 8. user_step_progress (桥接: 6 步打勾)
-- ==========================================
CREATE TABLE IF NOT EXISTS user_step_progress (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_index TINYINT UNSIGNED NOT NULL,
  completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  time_spent_seconds INT,
  UNIQUE KEY uk_user_pack_step (user_id, pack_id, step_index),
  INDEX idx_user_pack (user_id, pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 9. user_actions (桥接: 行动清单)
-- 决策 B7: slot_index 支持每 timeframe 多条
-- ==========================================
CREATE TABLE IF NOT EXISTS user_actions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  timeframe ENUM('today','week','longterm') NOT NULL,
  slot_index TINYINT UNSIGNED NOT NULL DEFAULT 0,
  action_text VARCHAR(500) NOT NULL,
  status ENUM('pending','done') NOT NULL DEFAULT 'pending',
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_timeframe_slot (user_id, pack_id, timeframe, slot_index),
  INDEX idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 10. jobs (后台任务)
-- ==========================================
CREATE TABLE IF NOT EXISTS jobs (
  id CHAR(36) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  input_url VARCHAR(1000) NOT NULL,
  input_type VARCHAR(20) NOT NULL,
  goal VARCHAR(40),
  episode_id BIGINT UNSIGNED,
  transcript_id BIGINT UNSIGNED,
  pack_id BIGINT UNSIGNED,
  status VARCHAR(30) NOT NULL,
  progress TINYINT UNSIGNED DEFAULT 0,
  stage_message VARCHAR(200),
  cache_hit BOOLEAN DEFAULT FALSE,
  error_code VARCHAR(50),
  error_message VARCHAR(500),
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  INDEX idx_user_status (user_id, status, created_at),
  INDEX idx_status_created (status, created_at),
  INDEX idx_input_url (input_url(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 11. ai_call_logs (AI 调用审计)
-- ==========================================
CREATE TABLE IF NOT EXISTS ai_call_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
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
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_call_type_created (call_type, created_at),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_job (job_id),
  INDEX idx_pack (pack_id),
  INDEX idx_episode (episode_id),
  INDEX idx_quality_flagged (quality_flagged, created_at),
  INDEX idx_error (error_code, created_at),
  INDEX idx_hash (request_body_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 12. push_tokens (Expo APNs)
-- ==========================================
CREATE TABLE IF NOT EXISTS push_tokens (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token VARCHAR(255) NOT NULL,
  platform ENUM('ios','android','web') NOT NULL DEFAULT 'ios',
  app_version VARCHAR(20),
  device_id VARCHAR(64),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  UNIQUE KEY uniq_token (token),
  KEY idx_user (user_id),
  KEY idx_user_device (user_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 13. usage_events (使用事件)
-- ==========================================
CREATE TABLE IF NOT EXISTS usage_events (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED,
  event_type VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30),
  entity_id BIGINT UNSIGNED,
  metadata JSON,
  ip_hash CHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_event (user_id, event_type, created_at),
  INDEX idx_event_time (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 14. debug_uploads (3-tap version popup debug 上传)
-- ==========================================
CREATE TABLE IF NOT EXISTS debug_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id VARCHAR(64) UNIQUE NOT NULL,
  batch_id VARCHAR(64) NOT NULL,
  image_blob LONGBLOB NOT NULL,
  image_bytes INT NOT NULL,
  image_format VARCHAR(8) DEFAULT 'jpeg',
  meta JSON,
  app_version VARCHAR(16),
  user_id BIGINT UNSIGNED,
  uploaded_ip VARCHAR(45),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_uploaded_at (uploaded_at),
  INDEX idx_batch_id (batch_id)
) DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- 15. user_uploads (产品级用户图片上传)
-- ==========================================
CREATE TABLE IF NOT EXISTS user_uploads (
  id INT PRIMARY KEY AUTO_INCREMENT,
  upload_id VARCHAR(64) UNIQUE NOT NULL,
  batch_id VARCHAR(64) NOT NULL,
  image_blob LONGBLOB NOT NULL,
  image_bytes INT NOT NULL,
  image_format VARCHAR(8) DEFAULT 'jpeg',
  width INT,
  height INT,
  meta JSON,
  app_version VARCHAR(16),
  user_id BIGINT UNSIGNED,
  uploaded_ip VARCHAR(45),
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_uploaded_at (uploaded_at),
  INDEX idx_batch_id (batch_id)
) DEFAULT CHARSET=utf8mb4;

-- ==========================================
-- 16. client_logs (客户端异步日志上传)
-- Frank 决策 3: 保留 7 天让 Claude grep
-- ==========================================
CREATE TABLE IF NOT EXISTS client_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  trace_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(64),
  device_platform VARCHAR(20),
  app_version VARCHAR(20),
  ota_version VARCHAR(20),
  event_type VARCHAR(40) NOT NULL,
  event_name VARCHAR(80) NOT NULL,
  event_data JSON,
  screen VARCHAR(60),
  ts_client TIMESTAMP(3) NOT NULL,
  ts_server TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user_ts (user_id, ts_client),
  INDEX idx_trace (trace_id),
  INDEX idx_event (event_type, event_name),
  INDEX idx_ts_server_cleanup (ts_server)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==========================================
-- 17. schema_migrations (迁移记录)
-- ==========================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;

-- 记录本 migration
INSERT INTO schema_migrations (version) VALUES ('001_init')
ON DUPLICATE KEY UPDATE version = version;
