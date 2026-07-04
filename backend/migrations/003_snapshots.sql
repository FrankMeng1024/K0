-- K0 Migration 003 — Snapshots table for E-002
-- Sprint 2: stores GLM-generated learning snapshots per episode

CREATE TABLE IF NOT EXISTS snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  episode_id BIGINT UNSIGNED NOT NULL,
  snapshot_json JSON NOT NULL,
  language ENUM('en','zh','unknown') NOT NULL DEFAULT 'unknown',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_snapshots_episode FOREIGN KEY (episode_id) REFERENCES episodes(id) ON DELETE CASCADE,
  UNIQUE KEY uk_snapshots_episode (episode_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (version) VALUES ('003_snapshots')
ON DUPLICATE KEY UPDATE version = version;
