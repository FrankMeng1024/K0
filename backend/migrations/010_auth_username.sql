-- Migration 010: Username/password auth for K0 users
-- Sprint 16 R2: 前端登录/注册系统所需字段
-- 添加 username (UNIQUE) + password_hash + 唯一索引

ALTER TABLE users
  ADD COLUMN username VARCHAR(64) NULL AFTER anonymous_id,
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER username;

ALTER TABLE users
  ADD UNIQUE KEY uniq_username (username);
