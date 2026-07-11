-- 003_recall_reminder.sql — #102(A) 主动回忆定时提醒 + 复习到期跟踪
-- 1) user_recall 加 SM-2-lite 调度字段: 自评后算下次该复习的时间
-- 2) reminder_log: 每用户每天最多一条提醒(去重, 防打扰)

ALTER TABLE user_recall
  ADD COLUMN interval_days INT NULL AFTER self_rating,
  ADD COLUMN next_at DATETIME NULL AFTER interval_days,
  ADD INDEX idx_user_next (user_id, next_at);

CREATE TABLE reminder_log (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  sent_date DATE NOT NULL,               -- 本地日期(YYYY-MM-DD), 每用户每天一条
  kind VARCHAR(20) NOT NULL DEFAULT 'review',
  due_cards INT DEFAULT 0,
  due_recall INT DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_date_kind (user_id, sent_date, kind),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
