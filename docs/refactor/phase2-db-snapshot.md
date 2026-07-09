# K0 生产库当前结构快照

**日期**: 2026-07-09 Phase 2.1 完成时

**总表数**: 17

## 表清单

- ai_call_logs: 24 rows
- client_logs: 0 rows
- debug_uploads: 0 rows
- episodes: 1 rows
- jobs: 4 rows
- learning_packs: 1 rows
- podcasts: 1 rows
- push_tokens: 0 rows
- schema_migrations: 1 rows
- transcripts: 1 rows
- usage_events: 0 rows
- user_actions: 0 rows
- user_cards: 0 rows
- user_pack_access: 1 rows
- user_step_progress: 0 rows
- user_uploads: 0 rows
- users: 2 rows

## 每张表结构

### ai_call_logs (28 cols)
```
  id                           bigint unsigned NOT NULL
  call_type                    varchar(80) NOT NULL
  provider                     varchar(30) NOT NULL
  model                        varchar(50)
  prompt_version               varchar(20)
  user_id                      bigint unsigned
  job_id                       char(36)
  episode_id                   bigint unsigned
  transcript_id                bigint unsigned
  pack_id                      bigint unsigned
  request_headers              json
  request_body_hash            char(64)
  request_body_snippet         text
  request_full_body            longtext
  response_status              int NOT NULL
  response_body_snippet        text
  response_full_body           longtext
  parse_ok                     tinyint(1)
  input_tokens                 int
  output_tokens                int
  total_tokens                 int
  latency_ms                   int
  error_code                   varchar(50)
  error_message                varchar(500)
  quality_flagged              tinyint(1) DEFAULT 0
  quality_note                 text
  metadata                     json
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  INDEX idx_call_type_created: (call_type, created_at)
  INDEX idx_user_created: (user_id, created_at)
  INDEX idx_job: (job_id)
  INDEX idx_pack: (pack_id)
  INDEX idx_episode: (episode_id)
  INDEX idx_quality_flagged: (quality_flagged, created_at)
  INDEX idx_error: (error_code, created_at)
  INDEX idx_hash: (request_body_hash)
```

### client_logs (13 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned NOT NULL
  trace_id                     varchar(64) NOT NULL
  device_id                    varchar(64)
  device_platform              varchar(20)
  app_version                  varchar(20)
  ota_version                  varchar(20)
  event_type                   varchar(40) NOT NULL
  event_name                   varchar(80) NOT NULL
  event_data                   json
  screen                       varchar(60)
  ts_client                    timestamp(3) NOT NULL
  ts_server                    timestamp(3) DEFAULT CURRENT_TIMESTAMP(3)

  PRIMARY KEY PRIMARY: (id)
  INDEX idx_user_ts: (user_id, ts_client)
  INDEX idx_trace: (trace_id)
  INDEX idx_event: (event_type, event_name)
  INDEX idx_ts_server_cleanup: (ts_server)
```

### debug_uploads (11 cols)
```
  id                           int NOT NULL
  upload_id                    varchar(64) NOT NULL
  batch_id                     varchar(64) NOT NULL
  image_blob                   longblob NOT NULL
  image_bytes                  int NOT NULL
  image_format                 varchar(8) DEFAULT jpeg
  meta                         json
  app_version                  varchar(16)
  user_id                      bigint unsigned
  uploaded_ip                  varchar(45)
  uploaded_at                  timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE upload_id: (upload_id)
  INDEX idx_uploaded_at: (uploaded_at)
  INDEX idx_batch_id: (batch_id)
```

### episodes (21 cols)
```
  id                           bigint unsigned NOT NULL
  podcast_id                   bigint unsigned NOT NULL
  platform                     varchar(20) NOT NULL
  platform_episode_id          varchar(64) NOT NULL
  source_url                   varchar(500) NOT NULL
  title                        varchar(500) NOT NULL
  description                  text
  duration_seconds             int
  cover_image_url              varchar(500)
  language                     varchar(20)
  published_at                 timestamp
  audio_url                    varchar(1000)
  audio_format                 varchar(20)
  audio_type                   varchar(80)
  audio_size_bytes             bigint
  audio_url_expires_at         datetime(6)
  audio_last_refreshed_at      timestamp
  transcript_url_from_rss      varchar(500)
  metadata                     json
  first_imported_at            timestamp DEFAULT CURRENT_TIMESTAMP
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_platform_episode: (platform, platform_episode_id)
  INDEX idx_podcast_id: (podcast_id)
  INDEX idx_language: (language)
  INDEX idx_published_at: (published_at)
```

### jobs (19 cols)
```
  id                           char(36) NOT NULL
  user_id                      bigint unsigned NOT NULL
  input_url                    varchar(1000) NOT NULL
  input_type                   varchar(20) NOT NULL
  goal                         varchar(40)
  episode_id                   bigint unsigned
  transcript_id                bigint unsigned
  pack_id                      bigint unsigned
  status                       varchar(30) NOT NULL
  progress                     tinyint unsigned DEFAULT 0
  stage_message                varchar(200)
  cache_hit                    tinyint(1) DEFAULT 0
  error_code                   varchar(50)
  error_message                varchar(500)
  metadata                     json
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  started_at                   timestamp
  completed_at                 timestamp

  PRIMARY KEY PRIMARY: (id)
  INDEX idx_user_status: (user_id, status, created_at)
  INDEX idx_status_created: (status, created_at)
  INDEX idx_input_url: (input_url)
```

### learning_packs (15 cols)
```
  id                           bigint unsigned NOT NULL
  transcript_id                bigint unsigned NOT NULL
  goal                         varchar(40) NOT NULL
  glm_model                    varchar(30) NOT NULL
  prompt_version               varchar(20) NOT NULL
  generation_strategy          varchar(20) DEFAULT plan-b
  language                     varchar(20)
  pack_json                    json NOT NULL
  status                       varchar(20) DEFAULT ready
  generation_ms                int
  input_tokens                 int
  output_tokens                int
  metadata                     json
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_pack: (transcript_id, goal, glm_model, prompt_version)
  INDEX idx_transcript_id: (transcript_id)
  INDEX idx_goal: (goal)
  INDEX idx_status: (status)
  INDEX idx_created_at: (created_at)
```

### podcasts (13 cols)
```
  id                           bigint unsigned NOT NULL
  platform                     varchar(20) NOT NULL
  platform_podcast_id          varchar(64) NOT NULL
  name                         varchar(255) NOT NULL
  author                       varchar(255)
  description                  text
  cover_image_url              varchar(500)
  rss_url                      varchar(500)
  language                     varchar(20)
  primary_genre                varchar(80)
  metadata                     json
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_platform_podcast: (platform, platform_podcast_id)
  INDEX idx_language: (language)
  INDEX idx_genre: (primary_genre)
```

### push_tokens (9 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned NOT NULL
  token                        varchar(255) NOT NULL
  platform                     enum('ios','android','web') NOT NULL DEFAULT ios
  app_version                  varchar(20)
  device_id                    varchar(64)
  created_at                   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  updated_at                   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  last_used_at                 datetime

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uniq_token: (token)
  INDEX idx_user: (user_id)
  INDEX idx_user_device: (user_id, device_id)
```

### schema_migrations (2 cols)
```
  version                      varchar(50) NOT NULL
  applied_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (version)
```

### transcripts (15 cols)
```
  id                           bigint unsigned NOT NULL
  episode_id                   bigint unsigned NOT NULL
  provider                     varchar(30) NOT NULL
  provider_version             varchar(30)
  segments                     json NOT NULL
  segment_count                int NOT NULL
  total_chars                  int NOT NULL
  duration_seconds             int
  language                     varchar(20)
  quality_score                tinyint
  transcript_ms                int
  metadata                     json
  status                       varchar(20) DEFAULT ready
  deleted_at                   timestamp
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_episode_provider: (episode_id, provider)
  INDEX idx_episode_id: (episode_id)
  INDEX idx_status: (status)
```

### usage_events (8 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned
  event_type                   varchar(50) NOT NULL
  entity_type                  varchar(30)
  entity_id                    bigint unsigned
  metadata                     json
  ip_hash                      char(64)
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  INDEX idx_user_event: (user_id, event_type, created_at)
  INDEX idx_event_time: (event_type, created_at)
```

### user_actions (10 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned NOT NULL
  pack_id                      bigint unsigned NOT NULL
  timeframe                    enum('today','week','longterm') NOT NULL
  slot_index                   tinyint unsigned NOT NULL DEFAULT 0
  action_text                  varchar(500) NOT NULL
  status                       enum('pending','done') NOT NULL DEFAULT pending
  done_at                      datetime
  created_at                   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  updated_at                   datetime NOT NULL DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_user_pack_timeframe_slot: (user_id, pack_id, timeframe, slot_index)
  INDEX idx_user_status: (user_id, status)
```

### user_cards (14 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned NOT NULL
  pack_id                      bigint unsigned NOT NULL
  card_index                   tinyint unsigned NOT NULL
  starred                      tinyint(1) DEFAULT 0
  archived                     tinyint(1) DEFAULT 0
  personal_note                text
  review_state                 varchar(20)
  review_next_at               timestamp
  review_interval_days         int
  review_count                 int DEFAULT 0
  metadata                     json
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_user_pack_card: (user_id, pack_id, card_index)
  INDEX idx_user_pack_archived_starred: (user_id, pack_id, archived, starred)
  INDEX idx_user_starred: (user_id, starred)
  INDEX idx_user_archived: (user_id, archived)
  INDEX idx_review_due: (user_id, review_next_at)
  INDEX idx_pack_id: (pack_id)
```

### user_pack_access (11 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned NOT NULL
  pack_id                      bigint unsigned NOT NULL
  first_accessed_at            timestamp DEFAULT CURRENT_TIMESTAMP
  last_accessed_at             timestamp DEFAULT CURRENT_TIMESTAMP
  access_count                 int DEFAULT 1
  starred                      tinyint(1) DEFAULT 0
  mode                         enum('skip','quick','deep')
  personal_note                text
  metadata                     json
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_user_pack: (user_id, pack_id)
  INDEX idx_user_id: (user_id)
  INDEX idx_pack_id: (pack_id)
  INDEX idx_last_accessed: (last_accessed_at)
  INDEX idx_starred: (starred)
  INDEX idx_user_mode: (user_id, mode)
```

### user_step_progress (6 cols)
```
  id                           bigint unsigned NOT NULL
  user_id                      bigint unsigned NOT NULL
  pack_id                      bigint unsigned NOT NULL
  step_index                   tinyint unsigned NOT NULL
  completed_at                 timestamp DEFAULT CURRENT_TIMESTAMP
  time_spent_seconds           int

  PRIMARY KEY PRIMARY: (id)
  UNIQUE uk_user_pack_step: (user_id, pack_id, step_index)
  INDEX idx_user_pack: (user_id, pack_id)
```

### user_uploads (14 cols)
```
  id                           int NOT NULL
  upload_id                    varchar(64) NOT NULL
  batch_id                     varchar(64) NOT NULL
  image_blob                   longblob NOT NULL
  image_bytes                  int NOT NULL
  image_format                 varchar(8) DEFAULT jpeg
  width                        int
  height                       int
  meta                         json
  app_version                  varchar(16)
  user_id                      bigint unsigned
  uploaded_ip                  varchar(45)
  uploaded_at                  timestamp DEFAULT CURRENT_TIMESTAMP
  deleted_at                   timestamp

  PRIMARY KEY PRIMARY: (id)
  UNIQUE upload_id: (upload_id)
  INDEX idx_user_id: (user_id)
  INDEX idx_uploaded_at: (uploaded_at)
  INDEX idx_batch_id: (batch_id)
```

### users (18 cols)
```
  id                           bigint unsigned NOT NULL
  username                     varchar(64)
  password_hash                varchar(255)
  apple_user_id                varchar(255)
  apple_email                  varchar(255)
  wechat_openid                varchar(64)
  phone                        varchar(20)
  display_name                 varchar(100)
  avatar_url                   varchar(500)
  locale                       varchar(10) DEFAULT zh-Hans
  timezone                     varchar(50) DEFAULT Asia/Shanghai
  subscription_tier            varchar(20) DEFAULT free
  subscription_expires_at      datetime(6)
  metadata                     json
  last_seen_at                 timestamp
  created_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  updated_at                   timestamp DEFAULT CURRENT_TIMESTAMP
  deleted_at                   timestamp

  PRIMARY KEY PRIMARY: (id)
  UNIQUE username: (username)
  UNIQUE apple_user_id: (apple_user_id)
  UNIQUE wechat_openid: (wechat_openid)
  UNIQUE phone: (phone)
  INDEX idx_last_seen: (last_seen_at)
```

