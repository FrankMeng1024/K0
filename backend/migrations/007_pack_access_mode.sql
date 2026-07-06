-- Sprint 11 v3: user_pack_access 加 mode 字段 (STORY-01101 + STORY-01104)
-- mode: 用户在快照页选的档 (skip / quick / deep)
-- 用于 Library 4 tab 筛选 (全部 / 完整学习 / 速览 / 跳过)

ALTER TABLE user_pack_access
  ADD COLUMN IF NOT EXISTS mode ENUM('skip', 'quick', 'deep') NULL COMMENT '用户在快照页选的学习深度';

CREATE INDEX IF NOT EXISTS idx_user_mode ON user_pack_access (user_id, mode);
