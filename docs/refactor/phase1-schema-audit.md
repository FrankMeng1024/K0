# 生产库 audit

**日期**: 2026-07-09 Phase 1

## 全部表（15）

- ai_call_logs
- debug_uploads
- episodes
- jobs
- learning_packs
- podcasts
- push_tokens
- schema_migrations
- transcripts
- usage_events
- user_actions
- user_cards
- user_pack_access
- user_step_progress
- users

## ai_call_logs (28 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `call_type` varchar(80) NOT NULL [MUL]
  - `provider` varchar(30) NOT NULL
  - `model` varchar(50)
  - `prompt_version` varchar(20)
  - `user_id` bigint unsigned [MUL]
  - `job_id` char(36) [MUL]
  - `episode_id` bigint unsigned [MUL]
  - `transcript_id` bigint unsigned
  - `pack_id` bigint unsigned [MUL]
  - `request_headers` json
  - `request_body_hash` char(64) [MUL]
  - `request_body_snippet` text
  - `request_full_body` longtext
  - `response_status` int NOT NULL
  - `response_body_snippet` text
  - `response_full_body` longtext
  - `parse_ok` tinyint(1)
  - `input_tokens` int
  - `output_tokens` int
  - `total_tokens` int
  - `latency_ms` int
  - `error_code` varchar(50) [MUL]
  - `error_message` varchar(500)
  - `quality_flagged` tinyint(1) DEFAULT 0 [MUL]
  - `quality_note` text
  - `metadata` json
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * INDEX `idx_call_type_created`: (call_type, created_at)
  * INDEX `idx_user_created`: (user_id, created_at)
  * INDEX `idx_job`: (job_id)
  * INDEX `idx_pack`: (pack_id)
  * INDEX `idx_episode`: (episode_id)
  * INDEX `idx_quality_flagged`: (quality_flagged, created_at)
  * INDEX `idx_error`: (error_code, created_at)
  * INDEX `idx_hash`: (request_body_hash)
  → rows: **132**

## debug_uploads (11 cols)
  - `id` int NOT NULL [PRI]
  - `upload_id` varchar(64) NOT NULL [UNI]
  - `batch_id` varchar(64) NOT NULL [MUL]
  - `image_blob` longblob NOT NULL
  - `image_bytes` int NOT NULL
  - `image_format` varchar(8) DEFAULT jpeg
  - `meta` json
  - `app_version` varchar(16)
  - `user_id` bigint unsigned
  - `uploaded_ip` varchar(45)
  - `uploaded_at` timestamp DEFAULT CURRENT_TIMESTAMP [MUL]
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `upload_id`: (upload_id)
  * INDEX `idx_uploaded_at`: (uploaded_at)
  * INDEX `idx_batch_id`: (batch_id)
  → rows: **0**

## episodes (21 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `podcast_id` bigint unsigned NOT NULL [MUL]
  - `platform` varchar(20) NOT NULL [MUL]
  - `platform_episode_id` varchar(64) NOT NULL
  - `source_url` varchar(500) NOT NULL
  - `title` varchar(500) NOT NULL
  - `description` text
  - `duration_seconds` int
  - `cover_image_url` varchar(500)
  - `language` varchar(20) [MUL]
  - `published_at` timestamp [MUL]
  - `audio_url` varchar(1000)
  - `audio_format` varchar(20)
  - `audio_type` varchar(80)
  - `audio_size_bytes` bigint
  - `audio_url_expires_at` timestamp
  - `audio_last_refreshed_at` timestamp
  - `transcript_url_from_rss` varchar(500)
  - `metadata` json
  - `first_imported_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_platform_episode`: (platform, platform_episode_id)
  * INDEX `idx_podcast_id`: (podcast_id)
  * INDEX `idx_language`: (language)
  * INDEX `idx_published_at`: (published_at)
  → rows: **5**

## jobs (19 cols)
  - `id` char(36) NOT NULL [PRI]
  - `user_id` bigint unsigned NOT NULL [MUL]
  - `input_url` varchar(1000) NOT NULL [MUL]
  - `input_type` varchar(20) NOT NULL
  - `goal` varchar(40)
  - `episode_id` bigint unsigned
  - `transcript_id` bigint unsigned
  - `pack_id` bigint unsigned
  - `status` varchar(30) NOT NULL [MUL]
  - `progress` tinyint unsigned DEFAULT 0
  - `stage_message` varchar(200)
  - `cache_hit` tinyint(1) DEFAULT 0
  - `error_code` varchar(50)
  - `error_message` varchar(500)
  - `metadata` json
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `started_at` timestamp
  - `completed_at` timestamp
  * UNIQUE `PRIMARY`: (id)
  * INDEX `idx_user_status`: (user_id, status, created_at)
  * INDEX `idx_status_created`: (status, created_at)
  * INDEX `idx_input_url`: (input_url)
  → rows: **12**

## learning_packs (15 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `transcript_id` bigint unsigned NOT NULL [MUL]
  - `goal` varchar(40) NOT NULL [MUL]
  - `glm_model` varchar(30) NOT NULL [MUL]
  - `prompt_version` varchar(20) NOT NULL DEFAULT v1
  - `generation_strategy` varchar(20) DEFAULT plan-b
  - `language` varchar(20)
  - `pack_json` json NOT NULL
  - `status` varchar(20) DEFAULT ready
  - `generation_ms` int
  - `input_tokens` int
  - `output_tokens` int
  - `metadata` json
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP [MUL]
  - `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_transcript_goal_model_prompt`: (transcript_id, goal, glm_model, prompt_version, status)
  * INDEX `idx_transcript_id`: (transcript_id)
  * INDEX `idx_goal`: (goal)
  * INDEX `idx_model`: (glm_model)
  * INDEX `idx_created_at`: (created_at)
  → rows: **4**

## podcasts (13 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `platform` varchar(20) NOT NULL [MUL]
  - `platform_podcast_id` varchar(64) NOT NULL
  - `name` varchar(255) NOT NULL
  - `author` varchar(255)
  - `description` text
  - `cover_image_url` varchar(500)
  - `rss_url` varchar(500)
  - `language` varchar(20) [MUL]
  - `primary_genre` varchar(80) [MUL]
  - `metadata` json
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_platform_podcast`: (platform, platform_podcast_id)
  * INDEX `idx_language`: (language)
  * INDEX `idx_genre`: (primary_genre)
  → rows: **4**

## push_tokens (8 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `user_id` bigint unsigned NOT NULL [MUL]
  - `token` varchar(255) NOT NULL [UNI]
  - `platform` enum('ios','android','web') NOT NULL DEFAULT ios
  - `app_version` varchar(20)
  - `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  - `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  - `last_used_at` datetime
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uniq_token`: (token)
  * INDEX `idx_user`: (user_id)
  → rows: **0**

## schema_migrations (2 cols)
  - `version` varchar(50) NOT NULL [PRI]
  - `applied_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (version)
  → rows: **2**

## transcripts (15 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `episode_id` bigint unsigned NOT NULL [MUL]
  - `provider` varchar(30) NOT NULL [MUL]
  - `provider_version` varchar(30)
  - `segments` json NOT NULL
  - `segment_count` int NOT NULL
  - `total_chars` int NOT NULL
  - `duration_seconds` int
  - `language` varchar(20)
  - `quality_score` tinyint
  - `transcript_ms` int
  - `metadata` json
  - `status` varchar(20) DEFAULT ready [MUL]
  - `deleted_at` timestamp
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_episode_provider`: (episode_id, provider)
  * INDEX `idx_episode_id`: (episode_id)
  * INDEX `idx_provider`: (provider)
  * INDEX `idx_status`: (status)
  → rows: **5**

## usage_events (8 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `user_id` bigint unsigned [MUL]
  - `event_type` varchar(50) NOT NULL [MUL]
  - `entity_type` varchar(30)
  - `entity_id` bigint unsigned
  - `metadata` json
  - `ip_hash` char(64)
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * INDEX `idx_user_event`: (user_id, event_type, created_at)
  * INDEX `idx_event_time`: (event_type, created_at)
  → rows: **0**

## user_actions (10 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `user_id` bigint unsigned NOT NULL [MUL]
  - `pack_id` bigint unsigned NOT NULL
  - `action_index` tinyint unsigned NOT NULL
  - `action_text` varchar(500) NOT NULL
  - `timeframe` enum('today','week','longterm') NOT NULL
  - `status` enum('pending','done') NOT NULL DEFAULT pending
  - `done_at` datetime
  - `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  - `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uniq_user_pack_action`: (user_id, pack_id, action_index)
  * INDEX `idx_user_status`: (user_id, status)
  → rows: **0**

## user_cards (14 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `user_id` bigint unsigned NOT NULL [MUL]
  - `pack_id` bigint unsigned NOT NULL [MUL]
  - `card_index` tinyint unsigned NOT NULL
  - `starred` tinyint(1) DEFAULT 0
  - `archived` tinyint(1) DEFAULT 0
  - `personal_note` text
  - `review_state` varchar(20)
  - `review_next_at` timestamp
  - `review_interval_days` int
  - `review_count` int DEFAULT 0
  - `metadata` json
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_user_pack_card`: (user_id, pack_id, card_index)
  * INDEX `idx_user_starred`: (user_id, starred)
  * INDEX `idx_user_archived`: (user_id, archived)
  * INDEX `idx_review_due`: (user_id, review_next_at)
  * INDEX `fk_uc_pack`: (pack_id)
  → rows: **10**

## user_pack_access (10 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `user_id` bigint unsigned NOT NULL [MUL]
  - `pack_id` bigint unsigned NOT NULL [MUL]
  - `first_accessed_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `last_accessed_at` timestamp DEFAULT CURRENT_TIMESTAMP [MUL]
  - `access_count` int DEFAULT 1
  - `starred` tinyint(1) DEFAULT 0 [MUL]
  - `personal_note` text
  - `metadata` json
  - `mode` enum('skip','quick','deep')
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_user_pack`: (user_id, pack_id)
  * INDEX `idx_user_id`: (user_id)
  * INDEX `idx_pack_id`: (pack_id)
  * INDEX `idx_last_accessed`: (last_accessed_at)
  * INDEX `idx_starred`: (starred)
  → rows: **4**

## user_step_progress (6 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `user_id` bigint unsigned NOT NULL [MUL]
  - `pack_id` bigint unsigned NOT NULL [MUL]
  - `step_index` tinyint unsigned NOT NULL
  - `completed_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `time_spent_seconds` int
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `uk_user_pack_step`: (user_id, pack_id, step_index)
  * INDEX `idx_user_pack`: (user_id, pack_id)
  * INDEX `fk_usp_pack`: (pack_id)
  → rows: **1**

## users (19 cols)
  - `id` bigint unsigned NOT NULL [PRI]
  - `anonymous_id` char(36) [UNI]
  - `username` varchar(64) [UNI]
  - `password_hash` varchar(255)
  - `apple_user_id` varchar(255) [UNI]
  - `apple_email` varchar(255)
  - `wechat_openid` varchar(64) [UNI]
  - `phone` varchar(20) [UNI]
  - `display_name` varchar(100)
  - `avatar_url` varchar(500)
  - `locale` varchar(10) DEFAULT zh-Hans
  - `timezone` varchar(50) DEFAULT Asia/Shanghai
  - `subscription_tier` varchar(20) DEFAULT free [MUL]
  - `subscription_expires_at` timestamp
  - `metadata` json
  - `last_seen_at` timestamp [MUL]
  - `created_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP
  - `deleted_at` timestamp
  * UNIQUE `PRIMARY`: (id)
  * UNIQUE `anonymous_id`: (anonymous_id)
  * UNIQUE `apple_user_id`: (apple_user_id)
  * UNIQUE `wechat_openid`: (wechat_openid)
  * UNIQUE `phone`: (phone)
  * UNIQUE `uniq_username`: (username)
  * INDEX `idx_last_seen`: (last_seen_at)
  * INDEX `idx_subscription`: (subscription_tier, subscription_expires_at)
  → rows: **12**
