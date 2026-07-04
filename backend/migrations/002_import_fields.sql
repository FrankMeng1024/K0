-- K0 Migration 002 — Import fields for E-001
-- Sprint 2: episodes + transcripts tables for podcast import flow

CREATE TABLE IF NOT EXISTS episodes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  source ENUM('youtube','apple','spotify','text') NOT NULL,
  source_url VARCHAR(1000) NULL,
  source_id VARCHAR(255) NULL,
  title VARCHAR(500) NOT NULL,
  channel VARCHAR(300) NULL,
  duration INT UNSIGNED NULL COMMENT 'Duration in seconds',
  language ENUM('en','zh','unknown') NOT NULL DEFAULT 'unknown',
  cover_url VARCHAR(1000) NULL,
  audio_url VARCHAR(1000) NULL,
  published_at DATETIME NULL,
  import_status ENUM('transcribing','ready','failed','ready_meta_only') NOT NULL DEFAULT 'transcribing',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_episodes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uk_user_source (user_id, source, source_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS transcripts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  episode_id BIGINT UNSIGNED NOT NULL,
  text MEDIUMTEXT NOT NULL,
  language ENUM('en','zh','unknown') NOT NULL DEFAULT 'unknown',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_transcripts_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('002_import_fields')
ON DUPLICATE KEY UPDATE version = version;
