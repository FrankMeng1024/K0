# DB Schema v2.0 补充 — AI 调用审计表

**日期**：2026-07-05
**依据**：Frank 明确要求"所有 AI input/output 都要存"

## 新增表：`ai_call_logs`

**目的**：
- **Debug**：出现质量问题时能追溯到具体调用
- **Prompt 微调**：分析 input/output 差异优化 prompt
- **成本审计**：token 消耗统计
- **异常检测**：识别 GLM/BCUT 挂或质量下降

```sql
CREATE TABLE ai_call_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  call_type VARCHAR(30) NOT NULL,                   -- 'glm.pack.generate'|'glm.pack.retry'|'bcut.transcribe'|'apple.lookup'|...
  provider VARCHAR(30) NOT NULL,                    -- 'zhipu-glm'|'bcut'|'jianying'|'itunes'
  model VARCHAR(50) NULL,                            -- 'glm-5.2'|'glm-4.6'|null(非 LLM)
  prompt_version VARCHAR(20) NULL,                   -- 与 learning_packs.prompt_version 对应
  
  -- 关联业务实体（追溯用）
  user_id BIGINT UNSIGNED NULL,
  job_id CHAR(36) NULL,
  episode_id BIGINT UNSIGNED NULL,
  transcript_id BIGINT UNSIGNED NULL,
  pack_id BIGINT UNSIGNED NULL,
  
  -- 请求内容
  request_headers JSON NULL,                        -- 隐去 Authorization
  request_body_hash CHAR(64) NULL,                  -- SHA256(request)，同 hash 说明重放
  request_body_snippet TEXT NULL,                   -- 前 500 字（LLM prompt）+ 后 500 字（transcript 结尾），中间省略
  request_full_body LONGTEXT NULL,                   -- 完整 body（长文本用 LONGTEXT，可选存/关闭）
  
  -- 响应内容
  response_status INT NOT NULL,                      -- HTTP status 或内部 code
  response_body_snippet TEXT NULL,                   -- 前 2000 字
  response_full_body LONGTEXT NULL,                  -- 完整响应
  parse_ok BOOLEAN NULL,                             -- LLM 返回是否 parse 成功
  
  -- 性能指标
  input_tokens INT NULL,
  output_tokens INT NULL,
  total_tokens INT NULL,
  latency_ms INT NULL,                               -- 请求耗时
  
  -- 错误
  error_code VARCHAR(50) NULL,
  error_message VARCHAR(500) NULL,
  
  -- 用于 Prompt 迭代分析
  quality_flagged BOOLEAN DEFAULT FALSE,             -- 人工/自动标注为"这次输出质量差"
  quality_note TEXT NULL,                            -- Frank 手动填的备注
  metadata JSON NULL,                                -- 未来临时属性
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- 索引：debug 查询、成本审计、质量分析都需要
  INDEX idx_call_type_created (call_type, created_at),
  INDEX idx_user_created (user_id, created_at),
  INDEX idx_job (job_id),
  INDEX idx_pack (pack_id),
  INDEX idx_episode (episode_id),
  INDEX idx_quality_flagged (quality_flagged, created_at),
  INDEX idx_error (error_code, created_at),
  INDEX idx_hash (request_body_hash),                -- 检测重复调用
  
  CONSTRAINT fk_ai_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_ai_logs_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

## 存储策略

**默认存两份内容**：
- `*_snippet`：前后各 500-2000 字（快速查看）
- `*_full_body`：完整内容 LONGTEXT

**磁盘估算**：
- GLM 一次调用 input ~30KB + output ~10KB = 40KB
- 假设每天 30 集 × 5 次 GLM 调用（1 主调用 + 潜在重试 + 章节覆盖兜底 + 语言检测 + 潜在 fallback）= 150 次/天
- 每天 150 × 40KB = 6MB/天
- **一年 2.2GB**，可接受

**未来优化**：如果磁盘紧张，可以：
- `full_body` 存 7 天后归档到 S3/OSS，DB 只留 snippet
- 或压缩存储（`COMPRESS()` MySQL 函数）

## 使用场景（Frank Debug 用）

```sql
-- 场景 1: 某个 pack 是怎么生成的？
SELECT * FROM ai_call_logs WHERE pack_id = 123 ORDER BY created_at;

-- 场景 2: 最近一天所有 GLM 调用的 tokens 消耗
SELECT model, COUNT(*), SUM(input_tokens), SUM(output_tokens)
FROM ai_call_logs
WHERE call_type LIKE 'glm.%' AND created_at > NOW() - INTERVAL 1 DAY
GROUP BY model;

-- 场景 3: 哪些调用被标记为质量差？
SELECT id, call_type, quality_note, request_body_snippet, response_body_snippet
FROM ai_call_logs
WHERE quality_flagged = TRUE
ORDER BY created_at DESC LIMIT 20;

-- 场景 4: 同一 transcript_id 多次调用（可能是重试或重生成）
SELECT transcript_id, COUNT(*), GROUP_CONCAT(created_at)
FROM ai_call_logs
WHERE call_type = 'glm.pack.generate'
GROUP BY transcript_id
HAVING COUNT(*) > 1;

-- 场景 5: BCUT 转录失败率
SELECT DATE(created_at) as day, 
       COUNT(*) as total,
       SUM(CASE WHEN error_code IS NOT NULL THEN 1 ELSE 0 END) as failed
FROM ai_call_logs
WHERE call_type = 'bcut.transcribe'
GROUP BY DATE(created_at);

-- 场景 6: prompt 版本迭代对比
SELECT prompt_version, AVG(latency_ms), AVG(output_tokens),
       SUM(CASE WHEN parse_ok THEN 0 ELSE 1 END) as parse_fails
FROM ai_call_logs
WHERE call_type = 'glm.pack.generate'
GROUP BY prompt_version;
```

## 隐私考虑

- `request_headers` 存前**必须**移除 Authorization / API Key
- `user_id` 可空（匿名 job 也存，但 user_id 为 NULL）
- 保留 90 天（可配置），过期自动清理老 logs

## Backend 实现

新增 `backend/src/services/aiLogger.js`：

```javascript
// 每个 AI 调用都调用这个，自动记录
export async function logAiCall({ callType, provider, model, requestBody, ...ctx }) {
  const startTime = Date.now();
  try {
    const response = await fetch(...);
    const responseBody = await response.json();
    await db.execute(
      'INSERT INTO ai_call_logs (...) VALUES (...)',
      [callType, provider, model, JSON.stringify(requestBody), ...]
    );
    return responseBody;
  } catch (e) {
    // 也记录失败
    await db.execute(...);
    throw e;
  }
}
```
