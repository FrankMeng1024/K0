-- Sprint 14 R3: debug 图片上传（首页 3-tap version popup 触发）
-- 用途：Frank 收集用户端截图/照片辅助调试。无鉴权，仅速率限制。
-- LONGBLOB (max 4GB) 存图片二进制；实际由 backend 校验 12MB 上限。
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
