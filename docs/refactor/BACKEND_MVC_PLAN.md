# 后端「按功能重组成 MVC」重构方案

**目标**: 把后端从「按层」(routes/ 一堆 + services/ 一堆) 重组为「按功能垂直切分」,每个功能一套 MVC (controller + service + model)。AI 逻辑单独拎出成独立模块。加足够日志 (AI 块后续调优用)。

**原则** (Frank):
- 按数据库表分域 = 按功能分模块
- 同功能同一套 API/逻辑, 不因页面复制
- 每功能一套 MVC: controller(路由/收发) + service(业务) + model(数据访问)
- **AI 单独一块**: 可无 controller, 但 service 独立 (未来换模型/prompt)
- 只重构这一次, 未来扩展沿用此结构

---

## 数据库表 → 功能域 (9 域)

| 功能域 | 表 |
|---|---|
| **user** | users, push_tokens, usage_events |
| **podcast** | podcasts, episodes, episode_audio_sources |
| **transcript** | transcripts, transcript_segments |
| **pack** | learning_packs, pack_snapshots, pack_cards, pack_concepts, pack_core_points, pack_steps, pack_step_citations, pack_actions, pack_audience, pack_worth_ranges, pack_skippable_ranges |
| **learning** (用户学习态, pack+review 共享) | user_pack_access, user_cards, user_step_progress, user_actions, user_comments, user_*_overrides ×5 |
| **importJob** (导入任务) | jobs |
| **upload** | debug_uploads, user_uploads, upload_blobs |
| **logging** | ai_call_logs, client_logs |
| (基础设施, 非功能) | schema_migrations |

---

## 目标目录结构

```
src/
  features/
    user/         user.controller.js (auth 注册/登录 + whoami + push token)
                  user.service.js
                  user.model.js        (users / push_tokens 访问)
    podcast/      podcast.controller.js (import-url 入口)
                  podcast.service.js    (导入编排: 提取音频→转录→建 pack)
                  podcast.model.js      (podcasts/episodes/episode_audio_sources)
                  extractors/           (xiaoyuzhou.js, apple.js — 平台音频提取)
    transcript/   transcript.service.js
                  transcript.model.js   (transcripts/transcript_segments)
                  asr/bcut.js           (BCUT ASR)
                  langDetect.js
    pack/         pack.controller.js    (GET pack, transcript, Step2 生成)
                  pack.service.js       (组装/生成编排)
                  pack.model.js         (learning_packs + 11 pack_* 子表)
    learning/     learning.controller.js (library + review 端点)
                  learning.service.js
                  learning.model.js     (user_cards/user_step_progress/user_actions/
                                          user_pack_access/user_comments/overrides)
    importJob/    importJob.controller.js (GET job 状态)
                  importJob.model.js    (jobs)
    upload/       upload.controller.js  (uploads + debugUpload)
                  upload.model.js       (user_uploads/debug_uploads/upload_blobs)
    logging/      logging.model.js      (client_logs — 前端日志上传, Phase 3)
  ai/            ★ 独立 AI 模块 (无 controller)
                  packGenerator.js      (Step1 snapshot + Step2 pack, GLM 调用)
                  aiLogger.js           (ai_call_logs 审计)
                  prompts/              (从 backend/prompts 移入, snapshot-v2.zh.md, pack.zh.md)
    (ai.service.js 统一出口: generateSnapshot / generatePackFromSnapshot)
  shared/        (跨功能基础设施)
    db.js         (原 config/db.js)
    errors.js     (原 lib/errors.js)
    auth.middleware.js (原 middleware/auth.js — JWT)
    pushService.js (Expo 推送 — user 功能调, 但是通用基础设施)
  index.js       (入口: 中间件 + 挂载各 feature 的 router)
```

---

## 现有代码 → 新位置映射

### user 模块
- `routes/auth.js` (注册/登录) + `routes/whoami.js` + `routes/push.js` → `user.controller.js`
- `services/userStore.js` (getUserById) + push_tokens 访问 → `user.model.js`
- `services/pushService.js` → `shared/pushService.js` (通用, user 调用)

### podcast 模块
- `routes/importUrl.js` (import-url 全流程编排) → `podcast.controller.js` + `podcast.service.js`
- `services/audioExtractor/{xiaoyuzhou,apple}.js` → `podcast/extractors/`
- `services/appleImport.js` 的 `parseAppleUrl` → 并入 apple extractor (fetchAppleMetadata 疑似死码, 确认后删)
- packStore 的 `upsertPodcast/upsertEpisode/getEpisodeById` → `podcast.model.js`

### transcript 模块
- packStore 的 `upsertTranscript/getTranscriptByEpisodeAndProvider` → `transcript.model.js`
- `services/asr/bcut.js` → `transcript/asr/bcut.js`
- `services/langDetect.js` → `transcript/langDetect.js`

### pack 模块
- `routes/packs.js` (GET pack/transcript, Step2 generate) → `pack.controller.js`
- packStore 的 `findExistingPack/findLatestSnapshotPack/insertPack/updatePackContent/getPackById` + helpers (persistPackContent/assemblePackContent/upsertPositionalRows) → `pack.model.js`
- Step2 编排逻辑 → `pack.service.js` (调 ai.service + pack.model)

### learning 模块 (用户学习态)
- `routes/library.js` + `routes/review.js` → `learning.controller.js`
- 里面的裸 SQL (user_cards/user_step_progress/user_actions/user_pack_access/user_comments) → `learning.model.js`
- packStore 的 `upsertUserPackAccess/findUserPackByEpisode` → `learning.model.js`
- packs.js 里的 card PATCH/DELETE、steps PATCH → `learning.controller.js` (它们改的是用户态, 不是 pack 内容)

### importJob 模块
- `routes/jobs.js` → `importJob.controller.js`
- `services/jobStore.js` → `importJob.model.js`

### upload 模块
- `routes/uploads.js` + `routes/debugUpload.js` → `upload.controller.js`
- 裸 SQL → `upload.model.js`

### ai 模块 ★
- `services/packGenerator.js` → `ai/packGenerator.js` (纯 AI: prompt+GLM+parse, 零 DB)
- `services/aiLogger.js` → `ai/aiLogger.js`
- `backend/prompts/*.md` → `ai/prompts/`
- 新增 `ai/ai.service.js` 统一出口
- **加日志**: 每次 GLM 调用记 model/prompt 版本/token/耗时/成败 (aiLogger 已有基础, 强化字段)

### shared 基础设施
- `config/db.js`, `lib/errors.js`, `middleware/auth.js`

---

## 死码处理 (确认后删)
- **`services/glm.js` (352行)**: 无人 import (只有 dead 的 generate.js 用), 是 packGenerator 的旧版。删。
- **`routes/generate.js` (211行)**: 挂在 `/api/episodes/:id/generate`。

> **⚠️ Arch review 修正 1 — generate.js/glm.js 死码 Step 0 先解决, 不 defer**:
> 已核实**这条路由在 live flow 里是死的**:
> - 主调用方 `goal-select.tsx` 是**孤儿页**(无任何导航路由到它)
> - `episode/[id].tsx:178` 的调用要求 `id` 非数字 + 有 goal + 无 jobId, 但 live flow 全是数字 packId (import-url 返回数字包), `if (id && !isNaN(Number(id))) return;` 永远跳过
> - generate.js 是**唯一** import dead glm.js 的地方, 还 route-to-route 耦合 packs.js 的 mockPackStore/buildMockPack
> **处理**: **Step 0 先删** `routes/generate.js` + `services/glm.js` + index.js 卸载挂载。这样 glm.js 干净死亡, 不把 legacy 耦合拖过整个重构。`goal-select.tsx`(前端孤儿页) 单独标记, 前端清理时删。
> - **`appleImport.fetchAppleMetadata`**: 死码, 确认后删 (只 parseAppleUrl 被用)。

---

## 执行顺序 (分批, 每批后端启动验证 + 阶段 review)

1. **shared/ + ai/**: 先建基础设施 + AI 模块 (AI 是叶子, 无依赖其他 feature)
2. **model 层**: 拆 packStore 813 行 → 5 个 model 文件 (podcast/episode→podcast, transcript, pack, learning)
3. **叶子功能**: user / importJob / upload (依赖少)
4. **核心功能**: podcast(导入编排) / transcript / pack / learning (依赖 model + ai)
5. **index.js**: 重新挂载所有 feature router
6. **死码清理**: glm.js / generate.js / fetchAppleMetadata

每批: 后端 `node` 启动无错 + 关键端点 curl 200。全部完成后 Playwright 三档全流程。

---

## 关键约束
- **纯搬移 + 重组, 不改业务逻辑** (行为零改变, 和前端重构同标准)
- 数据库 schema 不动 (Phase 1.5 已定)
- API 端点路径不变 (前端不用改)
- **每个 model 只碰自己域的表**; 跨域走 service 编排, 不在 model 里跨域 JOIN 硬耦合

> **⚠️ Arch review 修正 2 — 跨域读聚合要明确规则, 不只"标注"**:
> library/review 的大 JOIN (user_pack_access + learning_packs + pack_cards + transcripts + episodes + podcasts + user_cards, 4 域 6 表) 违反"model 只碰自己域表"。
> **明确规则 (不是标注)**: **跨域只读聚合 = READ-MODEL, 放在消费方 feature 的 model 里, 只读不写外域表**。文件头显式标记:
> ```
> // READ-MODEL: 跨域只读聚合 (拥有此 JOIN, 不写任何外域表)
> ```
> 适用: `learning.model.js` 的 library/review 聚合查询, `learning.model.js` 的 `findUserPackByEpisode` (JOIN learning_packs+transcripts)。
> **禁止**: learning.service → pack.service 且 pack.service → learning.service (循环)。learning 依赖 pack 只在 **model 读层** (读 pack_cards), 不在 service 层互调。
> **ai_call_logs 归属**: aiLogger (审计调用方) 放 `ai/`, 但 ai_call_logs 表访问概念上属 logging 域 — 保持 aiLogger 自己写 (它是 AI 审计的一部分), logging.model 只管 client_logs。

- AI service 是唯一碰 GLM/prompt 的地方
