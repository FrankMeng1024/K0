# K0 API Spec

**Version**: v3 (Refactor Phase 1, 2026-07-09)
**Base URL**: `https://api.k0.yiiling.cn` (production) / `http://localhost:3002` (dev)
**Auth**: JWT Bearer token. All endpoints except `/health`, `/api/auth/*` require `Authorization: Bearer <token>`.

## Auth Model

**Frank 决策 2 (2026-07-09)**：匿名账户不存在。所有 API 必须 JWT 授权。

- Login/Register → 返回 `{ token, userId, username }`
- Client 存 token，后续调用带 `Authorization: Bearer <token>` header
- Server middleware `attachUser` 从 JWT 解析 `req.user.id`
- Token 过期 → 前端引导重新登录（无 refresh token 机制）

## Error Envelope

所有非 2xx 响应格式：

```json
{
  "error": {
    "code": "MISSING_AUTH",
    "message": "人类可读描述",
    "details": {}
  }
}
```

或 auth 路由用的 flat 格式（兼容旧代码）：

```json
{ "error": "USERNAME_TAKEN", "message": "..." }
```

## Common Error Codes

| Code | HTTP | Meaning |
|---|---|---|
| `MISSING_AUTH` | 401 | 缺 Authorization header |
| `INVALID_AUTH_SCHEME` | 401 | Authorization 非 Bearer 格式 |
| `INVALID_TOKEN` | 401 | JWT 验证失败或过期 |
| `VALIDATION_ERROR` | 400 | 参数缺失或非法 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `RATE_LIMITED` | 429 | 超频率 (60 req/min 全局 + 单 endpoint 特殊限流) |
| `SERVER_ERROR` | 500 | 服务器内部错误 |
| `SOURCE_NOT_SUPPORTED` | 400 | 导入源不支持 |
| `GLM_TIMEOUT` | 502 | GLM 上游超时 |
| `GLM_MALFORMED_JSON` | 502 | GLM 返回非法 JSON |
| `USERNAME_TAKEN` | 409 | 注册用户名冲突 |
| `INVALID_CREDENTIALS` | 401 | 登录密码错误 |

---

## Endpoints（28 个，按路径排序）

### Health

#### GET `/health`

**Auth**: 不需要

Response 200:
```json
{
  "status": "ok",
  "ts": 1783570000000,
  "uptime_s": 210,
  "node": "v25.x",
  "db": { "configured": true, "ok": true, "latency_ms": 16 },
  "response_ms": 16
}
```

---

### Auth

#### POST `/api/auth/register`

**Auth**: 不需要

Request body:
```json
{ "username": "frank", "password": "secret123" }
```

Response 200:
```json
{ "token": "eyJhbGc...", "userId": 42, "username": "frank" }
```

Errors: `MISSING_FIELDS` (400), `USERNAME_TAKEN` (409)

#### POST `/api/auth/login`

**Auth**: 不需要

Request body:
```json
{ "username": "frank", "password": "secret123" }
```

Response 200:
```json
{ "token": "eyJhbGc...", "userId": 42, "username": "frank" }
```

Errors: `MISSING_FIELDS` (400), `INVALID_CREDENTIALS` (401)

---

### Whoami

#### GET `/api/whoami`

Response 200: `{ "userId": 42, "username": "frank", ... }` — 返回当前 JWT 对应的 user 信息

---

### Import + Generate

#### POST `/api/episodes/import-url`

导入 URL → 后台 pipeline → 返回 jobId 立即。

Request body:
```json
{ "url": "https://xiaoyuzhoufm.com/episode/xxx", "goal": "quick_understand" }
```

`goal` 枚举: `quick_understand` | `deep_learn` | `find_actions` | `critical_thinking` | `for_work`

Response 200:
```json
{ "jobId": "uuid-v4-string" }
```

Errors: `VALIDATION_ERROR` (400), `SOURCE_NOT_SUPPORTED` (400), `MISSING_AUTH` (401)

#### POST `/api/episodes/:id/generate`

给已导入的 episode 生成学习包（非 job pattern，同步返回）。Rate limit: **5/hour/user**。

Request body:
```json
{ "goal": "quick_understand" }
```

Response 200: `{ "pack": {...pack_json内容} }`

Errors: `RATE_LIMITED` (429), `NOT_FOUND` (404)

---

### Jobs

#### GET `/api/jobs/:jobId`

拉后台任务状态。

Response 200:
```json
{
  "id": "uuid",
  "status": "pending|running|ready|failed",
  "progress": 0-100,
  "stageMessage": "字幕转录中...",
  "episodeId": 123,
  "transcriptId": 456,
  "packId": 789,
  "errorCode": null,
  "errorMessage": null
}
```

Errors: `NOT_FOUND` (404)

---

### Library

#### GET `/api/library/packs`

拉当前用户已解锁的学习包列表。

Query params:
- `goal` (optional): 筛选 goal
- `mode` (optional): `skip` | `quick` | `deep`（用户在快照页选的深度）
- `limit` (default 50, max 100)

Response 200:
```json
{
  "packs": [
    {
      "id": 123,
      "packJson": {...},
      "oneSentence": "...",
      "cardsCount": 8,
      "podcastName": "得意忘形",
      "episodeTitle": "...",
      "goal": "quick_understand",
      "mode": "quick",
      "starred": true,
      "lastAccessedAt": "2026-07-08T...",
      ...
    }
  ]
}
```

#### GET `/api/library/cards`

拉当前用户所有卡片（跨 pack 扁平化）。

Query params:
- `starred` (optional): `true` | `false`
- `type` (optional): `opinion` | `method` | `case` | `reflection` | `action`
- `limit` (default 100, max 200)

Response 200:
```json
{
  "cards": [
    {
      "packId": 123,
      "cardIndex": 0,
      "cardType": "opinion",
      "cardTitle": "...",
      "cardQuote": "原文金句",
      "cardInsight": "AI 洞见",
      "cardContext": "上下文",
      "sourceTimestamp": 512,
      "starred": true,
      "archived": false,
      "personalNote": null,
      ...
    }
  ]
}
```

#### GET `/api/library/stats`

统计信息。

Response 200:
```json
{ "packsCount": 5, "cardsCount": 40, "starredCount": 32, "stepsDoneCount": 12 }
```

#### DELETE `/api/library/packs/:packId`

删除当前用户对 pack 的访问（保留 pack 本身，只删 `user_pack_access` + 关联桥接行）。

Response 200: `{ "deleted": true }`

Errors: `NOT_FOUND` (404)

---

### Review (复习/行动清单)

#### GET `/api/review/queue`

拉当前用户复习队列（默认收藏 + due）。

Query params: `limit` (default 20)

Response 200:
```json
{
  "cards": [
    { "packId": 123, "cardIndex": 0, "reviewState": "new", "reviewNextAt": null, ... }
  ]
}
```

#### POST `/api/review/rate`

给一张卡片 SRS 评分。

Request body:
```json
{ "packId": 123, "cardIndex": 0, "rating": "known" }
```

`rating` 枚举: `known` | `fuzzy` | `forgot`

Response 200: `{ "ok": true, "nextReviewAt": "..." }`

#### GET `/api/review/stats`

Response 200:
```json
{ "dueCount": 5, "totalCount": 40, "streak": 3 }
```

#### GET `/api/review/actions`

拉当前用户的行动清单（timeframe 分组）。

Query params: `status` (optional): `pending` | `done`

Response 200:
```json
{
  "actions": [
    { "id": 1, "packId": 123, "timeframe": "today", "slotIndex": 0, "actionText": "...", "status": "pending", "doneAt": null }
  ]
}
```

#### PATCH `/api/review/actions/:id`

更新行动状态（勾选完成 / 取消勾选）。

Request body:
```json
{ "status": "done" }
```

Response 200: `{ "ok": true }`

#### DELETE `/api/review/actions/:id`

删除一条行动。

Response 200: `{ "ok": true }`

#### POST `/api/review/actions/commit`

从 pack.actions 承诺进复习队列（转成 user_actions 行）。

Request body:
```json
{ "packId": 123, "timeframe": "today", "slotIndex": 0, "actionText": "..." }
```

Response 200: `{ "id": 42 }`

#### POST `/api/review/actions/uncommit`

取消承诺（删除对应 user_actions 行）。

Request body:
```json
{ "packId": 123, "timeframe": "today", "slotIndex": 0 }
```

Response 200: `{ "ok": true }`

---

### Push Notifications

#### POST `/api/push/register`

注册 Expo Push Token。

Request body:
```json
{ "token": "ExponentPushToken[xxx]", "platform": "ios", "appVersion": "1.0.0" }
```

Response 200: `{ "ok": true }`

#### POST `/api/push/test`

给当前 user 所有 token 发一条测试通知（内部调试用）。

Request body: `{ "title": "?", "body": "?" }` (optional)

Response 200: `{ "sent": 1 }`

---

### Uploads

图片上传（产品级用户图片）。

#### GET `/api/uploads/:upload_id`

拉一张图片 binary（Content-Type: image/jpeg 等）。

#### GET `/api/uploads/batch/:batch_id`

拉某个 batch 里所有 upload_id 列表。

#### GET `/api/uploads/mine`

拉当前用户所有 uploads。

#### DELETE `/api/uploads/:upload_id`

软删除。

---

### Debug Uploads

3-tap version popup 触发的调试图片上传（内部工具，无 auth 限流）。

#### GET `/api/debug/upload/:upload_id`
#### GET `/api/debug/upload/batch/:batch_id`
#### GET `/api/debug/upload/latest`

---

## 全局中间件

- `Cache-Control: no-store, no-cache, must-revalidate, private` — 强制客户端不缓存 (Sprint 16 R20)
- Etag 已禁 (Sprint 16 R16)
- Global rate limit: 60 req/min per IP
- Import URL rate limit: 10/min per user
- Generate rate limit: 5/hour per user

## 数据模型引用

见 `docs/DB_SCHEMA_TARGET.md` 定义的 17 张表。API response 的 JSON 字段（camelCase）与 DB 列（snake_case）通过 route handler 显式映射。

## Non-Endpoints (Phase 3 将加)

- `POST /api/logs` — 客户端日志异步上传（Phase 3.2）
- `GET /api/logs/query` — Claude debug 内部查询（Phase 3.4）
