-- K0 Migration 004 — Learning Pack tables (E-002, E-003, E-004)
-- Sprint 3: learning_packs, snapshots (full), learning_steps, cards, quizzes

CREATE TABLE IF NOT EXISTS learning_packs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  episode_id BIGINT UNSIGNED NOT NULL,
  goal ENUM('quick_understand','deep_learn','find_actions','critical_thinking','for_work') NOT NULL,
  language VARCHAR(10) NOT NULL DEFAULT 'zh',
  status ENUM('processing','ready','failed') NOT NULL DEFAULT 'processing',
  progress TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT,
  job_id VARCHAR(36),
  actions JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_episode (user_id, episode_id),
  INDEX idx_job (job_id),
  CONSTRAINT fk_packs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_packs_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pack_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pack_id BIGINT UNSIGNED NOT NULL,
  one_sentence VARCHAR(500) NOT NULL,
  core_points JSON NOT NULL,
  audience JSON,
  value_density TINYINT UNSIGNED,
  value_novelty TINYINT UNSIGNED,
  value_actionability TINYINT UNSIGNED,
  estimated_cost_minutes SMALLINT UNSIGNED,
  worth_listening JSON,
  skippable JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pack (pack_id),
  CONSTRAINT fk_pack_snapshots_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_steps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pack_id BIGINT UNSIGNED NOT NULL,
  step_number TINYINT UNSIGNED NOT NULL,
  title VARCHAR(100) NOT NULL,
  content MEDIUMTEXT NOT NULL,
  citations JSON,
  completed TINYINT(1) NOT NULL DEFAULT 0,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pack_step (pack_id, step_number),
  CONSTRAINT fk_steps_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cards (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  episode_id BIGINT UNSIGNED NOT NULL,
  type ENUM('opinion','method','case','reflection','action') NOT NULL,
  title VARCHAR(300) NOT NULL,
  explanation TEXT NOT NULL,
  source_timestamp FLOAT,
  my_application TEXT,
  starred TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_starred_created (user_id, starred, created_at DESC),
  INDEX idx_user_type (user_id, type),
  INDEX idx_episode (episode_id),
  FULLTEXT KEY ft_cards (title, explanation),
  CONSTRAINT fk_cards_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_cards_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE,
  CONSTRAINT fk_cards_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quizzes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  pack_id BIGINT UNSIGNED NOT NULL,
  type ENUM('multiple_choice','short_answer') NOT NULL,
  question TEXT NOT NULL,
  options JSON,
  correct_answer VARCHAR(500) NOT NULL,
  explanation TEXT,
  source_timestamp FLOAT,
  user_answer VARCHAR(500),
  user_answered_at DATETIME,
  is_correct TINYINT(1),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pack (pack_id),
  CONSTRAINT fk_quizzes_pack FOREIGN KEY (pack_id) REFERENCES learning_packs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('004_learning_packs')
ON DUPLICATE KEY UPDATE version = version;
