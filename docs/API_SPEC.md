# API_SPEC.md — K0 接口契约

**版本**: v1.0（Sprint 0）
**Base URL**: `/api`
**Auth**: 所有业务接口接受可选 `Authorization: Bearer <token>` header；MVP 阶段无 token 时默认使用 `user_id = 1`。
**Content-Type**: 请求/响应均 `application/json`
**错误格式**: 统一
```json
{ "error": { "code": "STRING_CODE", "message": "人类可读", "details": {} } }
```
**成功响应**: 直接返回业务对象或 `{ data: ..., meta: ... }`

---

## 认证与用户

### `GET /api/health`
健康检查。
- **响应**: `{ "status": "ok", "timestamp": "ISO8601", "db": "ok" }`
- **性能目标**: < 100ms

### `GET /api/me`
获取当前用户信息（MVP 阶段返回默认用户）。
- **响应**: `{ "id": 1, "name": "Default User", "email": null }`

### `POST /api/auth/login` (预留接口，MVP 不启用)
- 请求: `{ "email": "...", "password": "..." }`
- 响应: `{ "token": "jwt", "user": {...} }`
- 现阶段返回 `{ "error": { "code": "NOT_AVAILABLE", "message": "Login not enabled in MVP" } }`

---

## E-001 Import

### `POST /api/episodes/import`
从 URL 导入播客集。
- 请求:
  ```json
  { "url": "https://youtube.com/watch?v=...", "source": "auto|youtube|apple|spotify" }
  ```
- 响应（同步返回 episode 记录，转录/学习包生成异步）:
  ```json
  {
    "episode": {
      "id": 123,
      "source": "youtube",
      "sourceUrl": "...",
      "title": "...",
      "channel": "...",
      "duration": 3600,
      "language": "en",
      "coverUrl": "...",
      "importStatus": "transcribing"
    }
  }
  ```
- **错误码**: `INVALID_URL`, `SOURCE_NOT_SUPPORTED`, `TRANSCRIPT_NOT_AVAILABLE`

### `GET /api/episodes/:id`
获取单集详情。
- 响应: episode 完整对象，包含 `transcript` 摘要（不含全文）+ `importStatus`
  - `importStatus`: `transcribing | ready | failed`

### `GET /api/episodes/:id/transcript`
获取全量字幕。
- 响应: `{ "language": "en", "segments": [{ "start": 0, "end": 3.2, "text": "..." }, ...] }`

---

## E-002 & E-003 Learning Pack Generation

### `POST /api/episodes/:id/generate`
触发学习包生成（含快照）。
- 请求:
  ```json
  { "goal": "quick_understand|deep_learn|find_actions|critical_thinking|for_work" }
  ```
- 响应（异步 job）:
  ```json
  { "jobId": "uuid", "status": "processing" }
  ```

### `GET /api/jobs/:jobId`
查询生成任务状态。
- 响应:
  ```json
  {
    "status": "processing|ready|failed",
    "progress": 0-100,
    "packId": 456,        // 完成后返回
    "error": null
  }
  ```

### `GET /api/packs/:id`
获取学习包完整内容。
- 响应:
  ```json
  {
    "id": 456,
    "episodeId": 123,
    "goal": "deep_learn",
    "language": "en",
    "snapshot": { ...见下方 SnapshotObject },
    "steps": [ ...6 个 LearningStepObject ],
    "concepts": [ ...ConceptObject ],
    "cards": [ ...CardObject ],
    "quizzes": [ ...QuizObject ],
    "actions": {
      "today": "...",
      "thisWeek": "...",
      "longTerm": "..."
    },
    "createdAt": "ISO8601"
  }
  ```

**SnapshotObject**:
```json
{
  "oneSentence": "≤ 25 字",
  "corePoints": [{ "point": "...", "timestamp": 123.4 }, ...3 个],
  "audience": ["产品经理", "创业者"],
  "valueScore": { "density": 8, "novelty": 7, "actionability": 6 },
  "estimatedCostMinutes": 10,
  "worthListening": [{ "start": 300, "end": 420, "reason": "..." }, ...3 段],
  "skippable": [{ "start": 0, "end": 60, "reason": "广告" }, ...]
}
```

**LearningStepObject**:
```json
{
  "stepNumber": 1-6,
  "title": "背景理解",
  "content": "markdown 文本",
  "citations": [{ "timestamp": 45.2, "text": "..." }],
  "completed": false
}
```

**ConceptObject**:
```json
{
  "id": 1,
  "term": "AI Agent",
  "simpleExplanation": "...",
  "contextExplanation": "...",
  "extendedExplanation": "...",
  "firstMentionTimestamp": 123.4
}
```

**CardObject**:
```json
{
  "id": 1,
  "type": "opinion|method|case|reflection|action",
  "title": "一个清晰观点",
  "explanation": "用简单语言讲明白",
  "sourceTimestamp": 234.5,
  "myApplication": "...",
  "starred": true,
  "createdAt": "ISO8601"
}
```

**QuizObject**:
```json
{
  "id": 1,
  "type": "multiple_choice|short_answer",
  "question": "...",
  "options": ["A", "B", "C", "D"],  // multiple_choice only
  "correctAnswer": "B",
  "explanation": "...",
  "sourceTimestamp": 345.6
}
```

---

## E-004 Learning Player

### `PATCH /api/steps/:id`
更新学习步骤状态（打勾）。
- 请求: `{ "completed": true }`
- 响应: 更新后 LearningStepObject

### `PATCH /api/cards/:id`
更新知识卡片（收藏/编辑我的应用）。
- 请求: `{ "starred": true, "myApplication": "..." }`
- 响应: 更新后 CardObject

### `DELETE /api/cards/:id`
删除卡片。
- 响应: `{ "success": true }`

### `POST /api/packs/:id/ask`
Ask AI（默认问题按钮）。
- 请求:
  ```json
  { "presetKey": "critical_analysis|three_min_explain|counter_intuitive|worth_saving|actionable|connections" }
  ```
- 响应: `{ "answer": "markdown 文本", "citations": [{ "timestamp": ..., "text": "..." }] }`

---

## E-005 Review

### `POST /api/quizzes/:id/answer`
提交测验答案。
- 请求: `{ "answer": "B" }`
- 响应: `{ "correct": true, "explanation": "...", "sourceTimestamp": 345.6 }`

### `GET /api/reviews/today`
获取今日复习队列。
- 响应:
  ```json
  {
    "cards": [ ...CardObject ],
    "totalCount": 5
  }
  ```

### `POST /api/reviews/:cardId/feedback`
复习反馈。
- 请求: `{ "recall": "remembered|fuzzy|forgot" }`
- 响应: `{ "nextReviewAt": "ISO8601" }`

---

## E-006 Library

### `GET /api/library/cards`
浏览个人卡片库。
- 查询参数:
  - `type`: `opinion|method|case|reflection|action`（可选）
  - `episodeId`: number（可选）
  - `search`: 关键词（可选）
  - `page`, `pageSize`
- 响应: `{ "data": [CardObject], "meta": { "total": N, "page": 1 } }`

### `GET /api/library/episodes`
浏览已导入的播客集列表。
- 响应: `{ "data": [EpisodeObject], "meta": {...} }`

### `POST /api/library/search`
跨集搜索 + AI 问答。
- 请求: `{ "query": "自然语言问题" }`
- 响应:
  ```json
  {
    "answer": "AI 生成回答",
    "sources": [{ "episodeId": 1, "title": "...", "cardId": 2, "excerpt": "..." }]
  }
  ```

---

## 通用约束

- 所有时间字段：ISO8601 UTC 字符串
- 所有 ID：正整数
- 所有 `timestamp`（秒，float）：从音频/视频起点计算
- 所有 language：ISO 639-1（`en`, `zh`）
- 错误响应必须包含 `error.code` 便于前端区分处理

---

## Rate Limits (Post-MVP)

MVP 不做限流，但预留：
- `POST /api/episodes/import`：单用户 10/分钟
- `POST /api/episodes/:id/generate`：单用户 5/小时
（Post-MVP CR 中实现）
