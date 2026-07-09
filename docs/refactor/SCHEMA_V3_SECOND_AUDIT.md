# Schema 二次审计 · 找隐性设计阻塞

**审计原则**（Frank 决策）：
1. 零业务 JSON
2. 每段可编辑内容 = DB 一等公民
3. 前端拿 count/sum 数字，不解析结构
4. 支持 5 大方向不改 schema

**目标**：找 SCHEMA_V3_DRAFT.md 之外的**其他隐性阻塞**——这些没修，未来某个功能又要动 schema。

---

## 🔴 硬阻塞 (未来功能必然踩坑)

### 阻塞 1：`podcasts.language` 单值 → 多语言 podcast 无法表达

**现状**：
```sql
podcasts.language VARCHAR(20)  -- 只能存 'en' 或 'zh'
```

**问题**：
- 未来"英语翻中文"后，同一个 podcast 有英文原音 + 中文翻译版
- 用户偏好："给我推中文播客" — 但一档播客可能中英双语
- 单值 language 无法表达"这档 podcast 支持哪些 target 语言"

**修**：
- `podcasts.original_language` VARCHAR(20)  — 原始语言（一直是英/中）
- 新表 `podcast_available_translations (podcast_id, target_lang)` — 后续加

**影响**：只改字段名，无表结构大改

---

### 阻塞 2：`episodes` 里嵌入 `audio_*` 全部音频字段 → 未来"多音频源"崩

**现状**：
```sql
episodes.audio_url VARCHAR(1000)
episodes.audio_format VARCHAR(20)
episodes.audio_type VARCHAR(80)
episodes.audio_size_bytes BIGINT
episodes.audio_url_expires_at DATETIME(6)
episodes.audio_last_refreshed_at TIMESTAMP
```

**问题**：
- 只能存**一个** audio url
- 未来场景：
  - 原始 mp3 + 用户上传的高清版 + 平台切换 CDN 后新 URL
  - 英文原版 + 中文配音版（假设未来支持中文配音）
  - 不同码率（低速网络给低码率）
- audio_url 会过期 → refresh 逻辑现在在 episode 表里做，未来多源就要 join

**修**：**拆到 `episode_audio_sources` 表**
```sql
CREATE TABLE episode_audio_sources (
  id BIGINT PRIMARY KEY,
  episode_id BIGINT FK,
  source_type ENUM('original', 'dubbed', 'user_upload', 'cdn_backup'),
  language VARCHAR(20),
  url VARCHAR(1000),
  format VARCHAR(20),
  bitrate INT,
  size_bytes BIGINT,
  expires_at DATETIME(6),
  last_refreshed_at TIMESTAMP,
  is_primary BOOLEAN,     -- 当前用这个
  UNIQUE (episode_id, source_type, language)
);
```
episodes 表删掉所有 audio_* 字段

**影响**：中等改动。但**不做的话**未来任何多音频源需求都要动 schema。

---

### 阻塞 3：`users` 表混合"登录方式"和"业务偏好"

**现状**：
```sql
users (
  username, password_hash,   -- 用户名密码登录
  apple_user_id,             -- Apple 登录
  wechat_openid,             -- 微信登录
  phone,                     -- 手机号登录
  display_name, avatar_url,  -- 业务展示
  locale, timezone,          -- 用户偏好
  subscription_tier, ...     -- 订阅
)
```

**问题**：
- 一个用户绑定**多个**登录方式（今天 Apple 登录，明天想加微信绑定）— 当前设计只支持每个方式一个字段
- 未来"同一账号多个 Apple ID"（家庭共享）无法表达
- 用户设置项越加越多（notification_pref, theme_pref, ...） users 会成怪兽

**修**：**登录方式独立成 `user_identities` 表**
```sql
CREATE TABLE user_identities (
  id BIGINT PRIMARY KEY,
  user_id BIGINT FK,
  provider ENUM('username', 'apple', 'wechat', 'phone'),
  external_id VARCHAR(255),
  password_hash VARCHAR(255),   -- 只 username 用
  verified_at TIMESTAMP,
  linked_at TIMESTAMP,
  UNIQUE (provider, external_id)
);
```
users 表只留 id / display_name / avatar_url / locale / timezone / subscription_* / created_at

**同理业务偏好**：未来量大再拆 `user_preferences (user_id, pref_key, pref_value)`。**现在不急**。

**影响**：中等。**如果 K0 长期只 username 登录**，可以先不动，未来加 Apple 登录时再拆。

---

### 阻塞 4：`jobs` 表没有"任务类型分层"

**现状**：
```sql
jobs (
  id, user_id,
  input_url, input_type, goal,   -- import job 用
  episode_id, transcript_id, pack_id,  -- pipeline 结果
  status, progress, stage_message,
  error_code, error_message,
  extra JSON
)
```

**问题**：
- 未来 job 类型不只 import：
  - 导出 Obsidian 脑图 (export_obsidian_job)
  - 多篇合并脑图 (merge_mindmap_job)
  - notebookllm 对话生成 (chat_completion_job)
  - 英翻中翻译 (translation_job)
  - EPUB 导出、PDF 导出、...
- 每种 job 需要不同参数（import 要 url，export 要 format，merge 要 pack_ids[]）
- 当前 `input_url` + `goal` 只服务 import job

**修**：**加 `job_type` 字段 + 参数拆表**
```sql
jobs (
  id, user_id,
  job_type ENUM('import', 'pack_generate', 'export_obsidian', 'merge_mindmap', 'chat', 'translate'),
  status, progress, stage_message, error_code, error_message,
  input JSON,   -- ← 这里保留 JSON，因为不同 job_type 参数完全不同
  output JSON,  -- ← 同理
  extra JSON,
  created_at, started_at, completed_at
)
```
删掉 `input_url` / `input_type` / `goal` / `episode_id` / `transcript_id` / `pack_id` 字段（都进 input/output JSON）

**这里破例用 JSON**！理由：
- Job 参数**天然多态**（不同 job 完全不同参数）
- 参数是**一次写多次读**，无字段级更新
- 与 client_logs.event_data 同理

**影响**：中等。**未来非 import job 一多，不改就乱**。

---

### 阻塞 5：`ai_call_logs` 是审计表，但**没有性能保护**

**现状**：
- 每次 GLM 调用存完整 request/response（几十 KB 到几 MB）
- 无 partition，无自动清理
- 生产 3 个月后表大小可能 100GB+

**修**：三选一
- **A**: 加 partition (按月/按天) + 60 天清理任务
- **B**: 大字段（request_full_body / response_full_body）迁独立存储（S3/OSS），表里只留 URL
- **C**: 分冷热表 —— `ai_call_logs`（热，30天）+ `ai_call_logs_archive`（冷，归档）

**建议 A**：最简单，MySQL 原生支持

**影响**：不改 schema 结构，只加 partition 语句。**但拖着不做会慢慢炸**。

---

### 阻塞 6：`debug_uploads` + `user_uploads` LONGBLOB 存图（4-eyes 已提）

**现状**：图片二进制在 MySQL 里

**问题**：多用户 1 万后爆 5GB

**修**：拆 `image_blob` 到 `upload_blobs (upload_id, blob)` 独立表 + 加 `storage_backend` 字段 + `storage_key` VARCHAR
```sql
user_uploads (
  id, upload_id UNIQUE, batch_id,
  storage_backend ENUM('mysql_blob', 'oss', 's3'),
  storage_key VARCHAR(500),         -- OSS 时用
  image_bytes, image_format, width, height,
  extra JSON,
  ...
)

-- 只在 mysql_blob 模式下用
upload_blobs (
  upload_id CHAR(64) PRIMARY KEY,
  blob LONGBLOB NOT NULL
)
```

**影响**：小。**未来迁 OSS 只需加代码路径，不改 schema**。

---

## 🟡 中阻塞 (未来 3-6 个月可能踩)

### 阻塞 7：`user_pack_access.mode` 冗余存放

**现状**：用户在快照页选 "quick/deep/skip" 存在 `user_pack_access.mode`
**问题**：`learning_packs.mode` 也有同一字段（生成时确定）
- 生成时 mode = 生成参数
- 用户 access 的 mode = 用户选择记录

**判断**：**其实不冲突**。留着两个是对的：
- learning_packs.mode = "这个 pack 是按什么模式生成的"（不变）
- user_pack_access.mode = "用户对这个 pack 选择了什么模式"（可以升级：quick → deep 时改）

**结论**：不改，但**加注释**说明两个 mode 的区别。

---

### 阻塞 8：`user_pack_chats`（未来 notebookllm）没预留

**现状**：未加。未来加时新表就是了。

**判断**：**现在不建**（Frank 已明确"transcript_translations 现在不建"，chat 同理）。**未来加只是新表，不动现有 schema**，无阻塞。

---

### 阻塞 9：跨 pack 的"知识图谱"没设计

**未来场景**：
- 用户学了 5 集播客 → 想看"这 5 集里都提到了'RLHF'这个概念"
- 或"给我看所有涉及 AI 训练的 pack"

**现状**：pack_concepts.term 字段能索引查，但**只能字符串匹配**。同一个概念不同表达（"强化学习" vs "Reinforcement Learning"）匹配不到。

**未来加**：
- `concept_canonical (id, canonical_term, description)` — 标准化概念库
- `pack_concept_links (pack_concept_id, canonical_id)` — 每个 pack_concept 指向一个 canonical
- 或加 `concept_embeddings (concept_id, vector)` 用向量相似度

**判断**：**现在不建**。等你真做"多篇合并脑图"时再加。**无阻塞**。

---

### 阻塞 10：`user_actions.timeframe` 是 ENUM

**现状**：`ENUM('today','week','longterm')`
**问题**：未来想加 `'this_month' / 'this_quarter' / 'this_year'` 需要 ALTER TABLE
**修**：改成 VARCHAR(20)（Frank 决策原则 4："ENUM 有第 4 个候选值时立刻扩宽为 VARCHAR"）

**同理**：
- `podcasts.platform` ENUM 也应该扩（未来加 Spotify / YouTube）→ 已经是 VARCHAR ✅
- `push_tokens.platform` ENUM('ios','android','web') → 未来无变化，留 ENUM

**影响**：小改动，改一个 timeframe 字段类型

---

## 🟢 已经好 (无需修)

- `pack_snapshots` 1:1 pack — 干净
- 桥接表 UNIQUE 约束 — 都对
- 时间字段 `DATETIME(6)` 用在 `*_expires_at` — 避 2038
- `deleted_at TIMESTAMP NULL` 软删除模式 — users / user_uploads 已用
- `updated_at ON UPDATE CURRENT_TIMESTAMP` — 各表统一

---

## 📊 二次审计汇总

| # | 阻塞 | 严重度 | 现在改？ | 影响 |
|---|---|---|---|---|
| 1 | `podcasts.language` 单值 | 🟡 中 | 建议改 | 字段名重命名 + 加索引 |
| 2 | `episodes.audio_*` 内嵌 | 🔴 高 | **建议改** | 拆 `episode_audio_sources` 表 |
| 3 | `users` 登录方式内嵌 | 🟡 中 | 可以推迟 | 未加 Apple 登录前不急 |
| 4 | `jobs` 无 job_type 分层 | 🔴 高 | **建议改** | 加 job_type + input/output JSON |
| 5 | `ai_call_logs` 无 partition | 🟡 中 | **建议现在加** | 加 partition 语句，1 分钟改动 |
| 6 | LONGBLOB 存图 | 🟡 中 | **建议改** | 拆 upload_blobs 表 + storage_backend |
| 7 | `user_pack_access.mode` 冗余 | 🟢 低 | 不改 | 加注释 |
| 8 | user_pack_chats | 🟢 低 | 不加 | 未来加 |
| 9 | 概念图谱 | 🟢 低 | 不加 | 未来加 |
| 10 | `user_actions.timeframe` ENUM | 🟢 低 | 建议改 | VARCHAR(20) |

---

## 🎯 建议纳入 Phase 1.5 的改动

**必改（高严重度）**：
- 阻塞 2：拆 `episode_audio_sources`
- 阻塞 4：`jobs` 加 job_type + input/output JSON
- 阻塞 6：拆 `upload_blobs` + `storage_backend` 字段

**建议改（中严重度，改起来小）**：
- 阻塞 1：`podcasts.language` → `original_language`
- 阻塞 5：`ai_call_logs` 加 partition
- 阻塞 10：`user_actions.timeframe` ENUM → VARCHAR

**推迟到未来**（不改现在也无 block）：
- 阻塞 3：users 拆 identities
- 阻塞 8：user_pack_chats
- 阻塞 9：concept canonical

**总工作量**：+2h（在原 Phase 1.5 的 2 天之上）

---

## ❓ 请 Frank 决策

1. **阻塞 2**（episodes 拆音频源表）：改 / 不改
2. **阻塞 4**（jobs 加 job_type + input/output JSON）：改 / 不改
3. **阻塞 6**（upload_blobs 拆表）：改 / 不改
4. **阻塞 1 / 5 / 10**（小改动 3 个）：全改 / 挑几个 / 都不改
5. **阻塞 3 / 8 / 9**（推迟到未来的 3 个）：是否同意推迟
