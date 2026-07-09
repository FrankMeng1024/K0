# K0 数据库 JSON 字段审计

**判定原则** (Frank 2026-07-09):
> "在表里用 JSON 来做设计是很愚蠢的决定。哪怕一对一的表，都不应该用 JSON 存信息，应该拆开到表里。"

**每个 JSON 字段的处置**:

---

## 🔴 必须拆 (信息核心，用户会读会改)

### 1. `learning_packs.pack_json` — **最重要**
现装：oneSentence / corePoints / audience / valueScore / worthListening / skippable / snapshot / steps / cards / concepts / actions / mode
**拆成 7 张子表**：
- `pack_snapshots` (1:1) — oneSentence, valueDensity, valueNovelty, valueActionability, estimatedCostMinutes
- `pack_audience` (1:N) — 每个受众一行
- `pack_core_points` (1:N) — point, timestamp, position
- `pack_worth_ranges` (1:N) — start_sec, end_sec, reason, position
- `pack_skippable_ranges` (1:N) — 同上
- `pack_steps` (1:N) — step_number, title, content, citations(拆下面)
- `pack_cards` (1:N) — quote, context, insight, timestamp_sec, position
- `pack_concepts` (1:N) — term, simple, contextual, extended, position
- `pack_actions` (1:N) — timeframe, slot_index, action_text

### 2. `transcripts.segments` — 转录段落
现装：`[{start, end, text}, ...]` 数组，每集 500-2000 段
**判定**：**拆**
**理由**：
- 未来"点击某段直接播放" → 需要按 segment_id 查
- 未来"高亮某段" → 需要 comment 到 segment_id
- 全文搜索 → 用 FULLTEXT INDEX on segment.text
- 卡片的 timestamp 应该 FK 到 segment_id，而不是漂浮的秒数

**拆成**：`transcript_segments` (transcript_id, position, start_sec, end_sec, text)

### 3. `pack_steps.citations` — 引用段
每个 step 引用一些转录段（timestamp + text）
**判定**：**拆**（本身就是"引用了哪些 segment"）
**改为**：`pack_step_citations` (step_id, segment_id FK, position) — 直接 FK 到 transcript_segments

### 4. `pack_snapshots.audience` — 受众数组
`["程序员", "产品经理", "AI 工具极客"]`
**判定**：**拆**（未来可能加"我是产品经理，给我推产品经理相关的 pack"）
**改为**：`pack_audience` (pack_id, position, audience_label)

---

## 🟡 可拆可不拆 (纯审计，不参与业务，未来可能查)

### 5. `ai_call_logs.request_headers` — GLM 请求头
**判定**：**留 JSON**（Debug 用，无字段级查询需求）
**理由**：header 结构不固定，key 数量多，全部拆表反而糟

### 6. `episodes.metadata` / `podcasts.metadata` / `transcripts.metadata` / `learning_packs.metadata`
**判定**：**保留 JSON 但改名 `extra`**
**理由**：这是"我们暂时不知道要存什么，先塞进去"的容器。**任何塞进这里的字段，一旦被业务读了，就应该立即拆出来变成正经列**。改名 `extra` 强化"这不是业务字段"的意图。

### 7. `users.metadata` / `user_pack_access.metadata` / `user_cards.metadata`
**判定**：**同上，改名 `extra`**

### 8. `debug_uploads.meta` / `user_uploads.meta`
现装：客户端信息、EXIF、上下文
**判定**：**拆 EXIF 和上下文，剩下 meta 改名 extra**
- 新增列：`captured_at`, `device_model`, `os_version`（从 EXIF/客户端提取）
- 剩下真元数据 → `extra`

### 9. `usage_events.metadata`
**判定**：**拆 event 上下文成列**（entity_type + entity_id 已经在了，metadata 其实没啥剩）
**改为**：直接删 metadata 列，若需要加参数就加列

### 10. `client_logs.event_data`
现装：每个事件的参数（screen_id / target_id / duration_ms 等）
**判定**：**留 JSON**
**理由**：不同 event_type 参数不同（tap 事件有 target_id，nav 事件有 to_screen）。用 JSON 存 event schemaless，客户端 log 表天然是"半结构化"的。**但**：加 `event_data_schema_version` 列，让 Claude grep 时知道 event_data 版本。

---

## 🟢 已经很好 (无需处理)

### 11. `jobs.metadata`
现装：pipeline 中间态 (goal, url_type 等)
**判定**：**改名 `extra`**

---

## 📋 判定汇总

| # | 字段 | 判定 | 说明 |
|---|---|---|---|
| 1 | `learning_packs.pack_json` | 🔴 全拆 | 分成 8 张子表 |
| 2 | `transcripts.segments` | 🔴 拆 | 变 `transcript_segments` 表 |
| 3 | `pack_steps.citations` | 🔴 拆 | FK 到 segments |
| 4 | `pack_snapshots.audience` | 🔴 拆 | 独立表 |
| 5 | `ai_call_logs.request_headers` | 🟡 留 | 改名 `request_headers_extra` |
| 6-11 | 所有 `metadata` / `meta` | 🟡 改名 | 统一 `extra`，强化"临时容器" |
| 12 | `client_logs.event_data` | 🟡 留 | 加版本字段，因为 event schema 天然多态 |

---

## 拆后新增/改造的表清单

**新增 (10 张)**：
1. `pack_snapshots` — 快照区块（1:1 learning_packs）
2. `pack_audience` — 受众 (1:N)
3. `pack_core_points` — 3 个核心观点
4. `pack_worth_ranges` — 值得听的段
5. `pack_skippable_ranges` — 可跳过的段
6. `pack_steps` — 6 步（原来在 pack_json.steps）
7. `pack_step_citations` — step 引用哪些 segments
8. `pack_cards` — 卡片（原 pack_json.cards）
9. `pack_concepts` — 概念解释器
10. `pack_actions` — 行动清单
11. `transcript_segments` — 转录段落（原 transcripts.segments）
12. `user_comments` — 用户可 comment 任何段落/卡片/概念

**改造 (原表)**：
- `learning_packs`: 删 pack_json 字段，只留元信息
- `transcripts`: 删 segments 字段
- 所有 `metadata` / `meta` 改名 `extra`

**改造后总表数**：17 → **28 张表**（+11）

---

## 桥接关系变化

**原**: `user_cards (user_id, pack_id, card_index)` — card_index 是数组下标

**新**: `user_cards (user_id, pack_card_id FK)` — 正经 FK 到 pack_cards.id

同样：
- `user_step_progress` → FK pack_steps.id
- `user_actions` → FK pack_actions.id

**新 `user_comments`**：
```
user_comments (
  id, user_id FK, target_type ENUM('card','concept','step','core_point','action'),
  target_id BIGINT,  -- 指向对应表的 id
  comment_text TEXT,
  created_at, updated_at
)
INDEX (user_id, target_type, target_id)
```
理论上 `target_id` 应该是 5 个不同的 FK，但 MySQL 不支持多态 FK。
折中方案：**每种 target_type 一张 comment 子表**：
- `user_card_comments (user_id, pack_card_id FK, comment_text)`
- `user_concept_comments (user_id, pack_concept_id FK, comment_text)`
- ...
但会膨胀成 5 张表。**建议 stage 1 用多态 target_id 无 FK，应用层保证一致性；未来量大再拆**。

---

## 用户编辑内容如何设计

**方案 A (推荐)**：**在原表加 `edited` 字段 + 用户 override**

比如 `pack_cards`:
- `pack_cards` 存 GLM 原始输出（不可变）
- `user_card_overrides (user_id, pack_card_id, quote_override, insight_override, ...)` 存用户改的版本

读取：`COALESCE(override.quote, original.quote)` — 有覆写用覆写，没有用原始

**优势**：
- 原始不丢（可"恢复默认"）
- 分享时可以选"分享我改过的版本"或"分享原始"
- 别人 star 我的 pack 不受我个人 override 影响

**方案 B**：直接改 `pack_cards`
劣势：原始丢了；别的用户看到我改过的版本；GLM 换 prompt 重新生成会覆盖用户改动

**推荐 A**。

---

## 我建议下一步

1. **Frank 确认本审计的判定**（哪几个 metadata 你觉得就该拆，哪几个真是临时的）
2. **Frank 确认拆后的 28 张表 schema 名字/结构对不对**（我下一步会画完整 001_init 草案）
3. **Frank 确认"用户 override" 方案是否是你要的**（还是你希望直接改原始）
4. **确认后**：我停 Phase 2（React Query）— 先做 Phase 1.5 schema 大重构 —— 大概 2 天
5. **完成后**：跑一遍 Golden Path 验证 → 4-eyes review → 才继续 Phase 2

**这条路走完**，K0 从"pack_json 塞一堆"变成"真正关系型 schema"，你未来做 comment/编辑/脑图/导出/分享 全都不用改 schema，只加代码。
