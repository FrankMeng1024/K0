# K0 数据库结构 · Frank Review 版

**目的**: 让 Frank 30 分钟看懂全部 17 张表
**方式**: 分域 → 图 → 关键字段 → 常见问题

---

## 🏗 一句话：K0 用 4 个域组织数据

```
┌─────────────────────────────────────────────────────────────┐
│  🟢 内容域 (Content)                                        │
│  跟"哪一集播客"有关，全用户共享                              │
│  podcasts → episodes → transcripts → learning_packs         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🔵 用户域 (User)                                            │
│  users                                                       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  🟣 桥接域 (Bridge) — 用户 × 内容                            │
│  user_pack_access / user_cards / user_step_progress /       │
│  user_actions                                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  ⚙️ 运维域 (Ops)                                             │
│  jobs / ai_call_logs / client_logs / push_tokens /          │
│  usage_events / debug_uploads / user_uploads /              │
│  schema_migrations                                           │
└─────────────────────────────────────────────────────────────┘
```

**核心哲学**（Frank 决策 3：多用户/last-write-wins/无匿名）：
- **内容不带 user_id** — Joe Rogan 那集只存一份，5000 用户共用
- **用户对内容的操作走"桥接表"** — 星标/归档/复习进度都在 `user_*` 表
- **未来加"分享给朋友"** — 只加权限字段到桥接表，内容表不动

---

## 🟢 内容域 — 4 张表的关系

**流向**：`用户粘贴 URL → podcasts → episodes → transcripts → learning_packs`

```
podcasts (节目主表)                                    [0 rows]
  │
  │  1 : N (一个节目多集)
  ↓
episodes (单集元数据)                                  [1 row]
  │  ── platform + platform_episode_id 是内容主键
  │  ── audio_url 会过期，有 refresh 机制
  │
  │  1 : N (一集允许多个转录 provider)
  ↓
transcripts (BCUT ASR 结果)                            [1 row]
  │  ── segments JSON = [{start, end, text}, ...]
  │
  │  1 : N (一集转录能生成多种目标的 pack)
  ↓
learning_packs (GLM 生成的学习包)                      [1 row]
     ── pack_json 里存快照/6步/卡片/概念/行动 全部
     ── UNIQUE(transcript_id, goal, glm_model, prompt_version)
     ── 同一集换 goal ("速览" → "精学") 各生成一个 pack
```

### `podcasts` — 节目

| 字段 | 用途 | 说明 |
|---|---|---|
| `id` | PK | 自增 |
| `platform` + `platform_podcast_id` | UNIQUE 主键 | 例如 `xiaoyuzhou` + `hash20位` |
| `name` / `author` / `description` | 节目元信息 | |
| `cover_image_url` | 封面 | |
| `language` / `primary_genre` | 分类 | 有索引，未来筛选用 |

### `episodes` — 单集

| 字段 | 用途 | 说明 |
|---|---|---|
| `id` | PK | |
| `podcast_id` | 属于哪个节目 | 应用层保证一致，DB 无 FK（生产 DB 用户无 REFERENCES 权限） |
| `platform` + `platform_episode_id` | UNIQUE 主键 | |
| `title` / `description` / `duration_seconds` | 元信息 | |
| `audio_url` + `audio_url_expires_at` | 音频直链 | 会过期，`audio_last_refreshed_at` 记录刷新 |
| `transcript_url_from_rss` | 若 RSS 提供官方字幕直接用 | 目前多数为 null |

### `transcripts` — 转录

| 字段 | 用途 | 说明 |
|---|---|---|
| `episode_id` + `provider` | UNIQUE | provider = 'bcut' / 'apple_caption' / 'official' |
| `segments` | JSON 数组 | 每个 `{start, end, text}`，可能 500KB-2MB |
| `segment_count` / `total_chars` / `quality_score` | 元信息 | |

### `learning_packs` — 学习包 ⭐ 最重要

| 字段 | 用途 | 说明 |
|---|---|---|
| `transcript_id` | 属于哪个转录 | |
| `goal` | 学习目标 | quick_understand / deep_learn / find_actions / critical_thinking / for_work |
| `glm_model` + `prompt_version` | 生成参数 | 换 prompt 就多一份 pack |
| **`pack_json`** ⭐ | **所有生成内容都在这里** | 见下方结构 |
| `generation_strategy` | 生成策略 | `v3-step1-only` = 只快照 / `plan-b` = 完整 pack |
| `status` | ready / processing / failed | |

**`pack_json` 结构**（当前生产 pack #1 的真实字段）：
```
{
  "oneSentence": "程序员如何筛选并构建高效 AI 技能库",
  "corePoints": [{ point, timestamp }, ...],
  "audience": ["程序员", "产品经理", ...],
  "valueScore": { density: 8, novelty: 7, actionability: 8 },
  "estimatedCostMinutes": 12,
  "worthListening": [{ start: 240, end: 340, reason }, ...],
  "skippable": [{ start: 0, end: 48, reason }, ...],
  "snapshot": {...},         // 快照区块（有时嵌套）
  "steps": [],               // 6 步引导 — quick 模式为空
  "cards": [                 // 卡片 — quick=4 张 / deep=8 张
    { quote, context, insight, timestamp },
    ...
  ],
  "concepts": [],            // 概念解释器
  "actions": {},             // { today, week, longterm } 或 {}
  "mode": "quick"            // 用户选的深度
}
```

---

## 🔵 用户域 — 1 张表

### `users`

| 字段 | 用途 | 备注 |
|---|---|---|
| `id` | PK | JWT `user_id` 就是这个 |
| `username` (UNIQUE) + `password_hash` | 用户名密码登录 | Sprint 16 加的，Phase 1 后是主入口 |
| `apple_user_id` (UNIQUE) | Sign in with Apple | iOS 上架要求，未激活 |
| `wechat_openid` (UNIQUE) | 微信登录 | 未激活 |
| `phone` (UNIQUE) | 手机号登录 | 未激活 |
| `display_name` / `avatar_url` | 展示 | |
| `locale` / `timezone` | 用户偏好 | |
| `subscription_tier` + `subscription_expires_at` | 订阅 | 未激活（DATETIME(6) 避 2038） |
| `last_seen_at` / `created_at` / `updated_at` / `deleted_at` | 生命周期 | 支持软删除但目前无端点 |

⚠️ **`anonymous_id` 字段已在 Phase 1 移除**（决策 2：匿名不存在）

---

## 🟣 桥接域 — 用户对内容的私人操作

**关键设计**：内容表**不知道**用户有没有 star 这条卡；`user_cards` 表记录"用户 X 对 pack Y 的第 Z 张卡的 star 状态"。

### `user_pack_access` — 用户 × pack 关系

| 字段 | 用途 |
|---|---|
| `user_id` + `pack_id` (UNIQUE) | 一个用户对一个 pack 只有一条 |
| `first_accessed_at` / `last_accessed_at` / `access_count` | 访问历史 |
| `starred` | 用户是否收藏这个 pack |
| **`mode`** | 用户在快照页选的深度：skip / quick / deep |
| `personal_note` | 用户对整个 pack 的备注 |

### `user_cards` — 用户 × 卡片关系

| 字段 | 用途 |
|---|---|
| `user_id` + `pack_id` + `card_index` (UNIQUE) | 定位第几张卡 |
| `starred` | 是否收藏 |
| `archived` | 是否隐藏（Library 不显示） |
| `personal_note` | 用户对这张卡的笔记 |
| `review_state` / `review_next_at` / `review_interval_days` / `review_count` | SRS 复习状态 |

⚠️ 卡片**内容**存在 `learning_packs.pack_json.cards[card_index]`，这里只存**私人操作**

### `user_step_progress` — 6 步引导打勾

| 字段 | 用途 |
|---|---|
| `user_id` + `pack_id` + `step_index` (UNIQUE) | 每 pack 6 步（0-5） |
| `completed_at` | 完成时间戳 |
| `time_spent_seconds` | 花了多久 |

⚠️ **只有 done 状态，没有 undone**（4-eyes 提出的 A4 问题）

### `user_actions` — 行动清单勾选

| 字段 | 用途 |
|---|---|
| `user_id` + `pack_id` + `timeframe` + `slot_index` (UNIQUE) | today/week/longterm × 每档最多 3 条 |
| `action_text` | 行动内容（复制 pack_json.actions 的值） |
| `status` | pending / done |
| `done_at` | 完成时间 |

---

## ⚙️ 运维域 — 8 张表

### `jobs` — 后台任务状态

| 字段 | 用途 |
|---|---|
| `id` (CHAR 36) | UUID |
| `user_id` | 属于谁 |
| `status` | pending / running / ready / failed |
| `progress` (0-100) + `stage_message` | UI 显示 |
| `episode_id` / `transcript_id` / `pack_id` | Pipeline 产出的引用 |
| `error_code` / `error_message` | 失败信息 |

### `ai_call_logs` — AI 调用审计 ⚠️ 表最重

| 字段 | 用途 | 大小 |
|---|---|---|
| `call_type` | snapshot / pack / concepts / etc | |
| `provider` + `model` + `prompt_version` | GLM 参数 | |
| `user_id` / `job_id` / `episode_id` / `pack_id` | 关联 | |
| `request_full_body` | LONGTEXT | ⚠️ 每次几十 KB |
| `response_full_body` | LONGTEXT | ⚠️ 每次几十 KB |
| `input_tokens` / `output_tokens` / `latency_ms` | 度量 | |
| `quality_flagged` + `quality_note` | Prompt 迭代用 | |

⚠️ **没有清理策略，会无限增长**（4-eyes A2 问题）

### `client_logs` — 客户端异步日志

Phase 3 才启用，Phase 1 只建了表。用途：让我 grep 用户操作链。

| 字段 | 用途 |
|---|---|
| `user_id` + `trace_id` | 一次冷启动一个 trace |
| `device_id` + `device_platform` + `app_version` + `ota_version` | 设备信息 |
| `event_type` + `event_name` | nav / tap / api_call / error / lifecycle |
| `event_data` (JSON) | PII 白名单：只 screen_id / target_id / duration_ms 等 |
| `ts_client` / `ts_server` | 毫秒精度 |

保留策略：每晚 cron 删 7 天前记录（Frank 决策 3）

### `push_tokens` — Expo APNs

| 字段 | 用途 |
|---|---|
| `user_id` + `token` (UNIQUE) | |
| `platform` (ios/android/web) + `app_version` + `device_id` | |
| `last_used_at` | |

### `usage_events` — 未来限流用

| 字段 | 用途 |
|---|---|
| `user_id` + `event_type` + `entity_type` + `entity_id` | |
| `ip_hash` | 匿名统计 |

⚠️ 目前**没代码写入**

### `debug_uploads` — Debug 图片上传

Frank 3-tap version popup 触发的截图上传。用途：Frank 报 bug 时把截图给我看。

| 字段 | 用途 | 大小 |
|---|---|---|
| `upload_id` (UNIQUE) + `batch_id` | 索引 | |
| `image_blob` (LONGBLOB) | 图片二进制 | ⚠️ 每张 ~500KB - 12MB |

### `user_uploads` — 产品级图片上传

| 字段 | 用途 |
|---|---|
| `upload_id` (UNIQUE) + `batch_id` | |
| `image_blob` (LONGBLOB) + `image_bytes` + `image_format` + `width` + `height` | |
| `user_id` | 谁上传的 |
| `deleted_at` | 软删除 |

⚠️ **和 debug_uploads 一样 LONGBLOB 存 MySQL**（4-eyes A1 问题）

### `schema_migrations` — 版本记录

只有 1 行：`001_init`

---

## 📊 全表关系图（简化版）

```
      podcasts
         │
         │ 1:N
         ↓
      episodes ─────────┐
         │              │
         │ 1:N          │ jobs.episode_id (opt)
         ↓              │
     transcripts ───────┤
         │              │ jobs.transcript_id (opt)
         │ 1:N          │
         ↓              │
   learning_packs ──────┤
      │  │              │ jobs.pack_id (opt)
      │  │              │
      │  │ N:M via      │
      │  │ user_pack_access
      │  │              │
      │  └──> user_cards ─┐
      │  └──> user_step_progress
      │  └──> user_actions
      │                   │
   users ──────────────────┘
     │
     ├──> jobs
     ├──> push_tokens
     ├──> ai_call_logs (opt)
     ├──> client_logs
     └──> usage_events (opt)

孤立表（不参与主链）：
   - debug_uploads (Frank 内部工具)
   - user_uploads (产品图片上传，未实际用)
```

---

## 🎯 常见问题解答（Frank 可能会问）

### Q1: 为什么内容和用户完全分开？

因为**多用户共享内容**：
- 1000 个用户导入同一集 Joe Rogan → 只需要 1 份 `episodes` + 1 份 `transcripts` + 1 份 `learning_packs`
- 每个用户的私人操作各自存 `user_pack_access` / `user_cards`
- 省 GLM 调用（贵）、省存储、省用户等待时间

### Q2: 卡片内容存哪里？

**`learning_packs.pack_json.cards[]`** —— 一个 JSON 数组，第 N 张卡就是 `cards[N-1]`。用户对第 N 张卡的操作（star/archive/复习）用 `card_index = N-1` 存在 `user_cards` 里。

### Q3: 为什么没有 FK？

生产 DB 的 `k0_user` 无 REFERENCES 权限（需要 root）。**当前应用层保证一致性**：删 user 时代码显式清桥接表。**如果你想我加 FK**，需要你用 root 给 `GRANT REFERENCES ON k0.* TO 'k0_user'@'%'`。

### Q4: 现在有多少数据？

- users: 2 (frank_final + 之前测试)
- podcasts / episodes / transcripts / learning_packs / user_pack_access: 各 1 (硬地骇客 EP127)
- user_cards / user_step_progress / user_actions: 0（没做卡片交互）
- jobs: 2 completed（Import + Step 2）
- ai_call_logs / client_logs / push_tokens / usage_events / debug_uploads / user_uploads: 0

Phase 4a 交付前会 TRUNCATE 到 0 行。

### Q5: 未来加"用户间分享" 怎么办？

不需要动内容表。加一张 `pack_shares (from_user, to_user, pack_id, permission)` 就行。这就是当前设计的价值——桥接层灵活。

---

## 📝 一句话结论

**当前 schema 是干净的 v2 版本，没有 v1/v2 混杂**：
- 内容全局共享 ✓
- 用户维度走桥接 ✓
- pack 内容 JSON 化，方便字段演进 ✓
- 无 anonymous_id 脏字段 ✓
- 无 v1/v2 双 migration 目录 ✓

**主要遗留问题**：
- LONGBLOB 存图（未来需迁 OSS）
- ai_call_logs 无保留策略
- 无 FK（k0_user 权限问题）
- 无 user delete endpoint

**你现在要 review 的**：这个结构本身是不是你想要的形状？有没有字段/表想改？
