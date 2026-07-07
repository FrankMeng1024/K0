-- Sprint 15: 产品级用户图片上传（独立于 debug_uploads）
-- 从 Cairn debug-snapshot 架构照搬：LONGBLOB 存二进制 + JSON meta
-- 独立表以便未来加：user_id 外键、缩略图变体、EXIF 剥除标记、软删除
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
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_uploaded_at (uploaded_at),
  INDEX idx_batch_id (batch_id)
) DEFAULT CHARSET=utf8mb4;
