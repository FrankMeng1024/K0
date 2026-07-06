-- K0 Migration 006 — user_actions (Sprint 10 STORY-01004)
-- 用户勾选的行动清单条目 → Review 队列的"承诺"分类

CREATE TABLE IF NOT EXISTS user_actions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  action_index TINYINT UNSIGNED NOT NULL COMMENT '0=today, 1=week, 2=longterm',
  action_text VARCHAR(500) NOT NULL,
  timeframe ENUM('today','week','longterm') NOT NULL,
  status ENUM('pending','done') NOT NULL DEFAULT 'pending',
  done_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_pack_action (user_id, pack_id, action_index),
  KEY idx_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
