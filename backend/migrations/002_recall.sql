-- 002_recall.sql — #77 主动回忆 · 带问题进入 · 费曼复述
-- pack_recall_questions: 精学生成的主动回忆问题(AI 出题, 每 pack 2-4 题) + 参考答案
-- user_recall: 用户对某题的作答/费曼复述 + 自评(记得/模糊/不记得)

CREATE TABLE pack_recall_questions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  pack_id BIGINT UNSIGNED NOT NULL,
  position INT NOT NULL,                         -- 题序 0..N
  question TEXT NOT NULL,                         -- 开放式回忆问题
  model_answer TEXT,                              -- 参考答案(用户作答后展开对照)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pack_position (pack_id, position),
  INDEX idx_pack (pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE user_recall (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  pack_id BIGINT UNSIGNED NOT NULL,
  kind VARCHAR(16) NOT NULL,                      -- 'question' | 'feynman'
  ref_key VARCHAR(32) NOT NULL,                   -- question 用 position; feynman 用 'summary'
  user_answer MEDIUMTEXT,                         -- 用户作答 / 费曼复述原文
  self_rating VARCHAR(12),                        -- 'got' | 'fuzzy' | 'blank' (仅 question)
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_pack_ref (user_id, pack_id, kind, ref_key),
  INDEX idx_user_pack (user_id, pack_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
