# Sprint 6 Goal — URL 转学习包 · Backend 全链路

**主题**：让 K0 backend 能吃小宇宙/Apple URL，端到端产出学习包 JSON
**Sprint window**：2026-07-05 → next
**类型**：Feature Sprint（backend-only，无 iOS 前端改动）
**Acceptance Mode**：`auto`（Mode 2）
**约束**：**禁止 EAS build，Sprint 6 全部 backend 改动**

---

## 核心目标

用户 curl 一个真实小宇宙 URL 到 K0 backend，backend 端到端产出完整学习包 JSON（含 corePoints / 6 steps / 3 cards / 3 actions），Frank 手动验证质量。

**明确不做**：iOS 前端改动（Sprint 7）、播放器（需 build）、卡片交互 UI

---

## 用户约束（Sprint 5 遗产）

**必须遵守**：
1. ASR 用 BCUT，前端 UI **禁止出现**"实时转录"字样（Apple 审核合规）
2. GLM 用 glm-5.2，套餐 endpoint
3. 注意力稀释用**方案 B**（章节标记 + 分布约束 + runtime 兜底）
4. 中英混语言用三分支 prompt
5. **只允许 OTA，禁止 EAS build**

**详见**：`docs/SPIKE_CONCLUSIONS.md`

---

## Stories

| ID | 类型 | 主题 | Points | Owner |
|---|---|---|---|---|
| STORY-00300 | Backend | 小宇宙 audio 抓取 module（从 spike 迁到 backend/src/services） | 2 | Backend |
| STORY-00301 | Backend | Apple Podcasts audio 抓取 module | 2 | Backend |
| STORY-00302 | Backend | BCUT ASR service + Node.js 版实现 + 磁盘管理 | 3 | Backend |
| STORY-00303 | Backend | GLM 切换到 glm-5.2 + Coding Plan Lite endpoint + max_tokens 8192 | 1 | Backend |
| STORY-00304 | Backend | 注意力稀释方案 B 实现（章节标记 + 分布约束 prompt + runtime 兜底重试） | 3 | Backend |
| STORY-00305 | Backend | 中英混语言分支（扩展 langDetect 到 zh/en/mixed，三套 prompt） | 2 | Backend |
| STORY-00306 | Backend | 新 API `POST /api/episodes/import-url` 端到端 pipeline：URL → audio → transcript → pack | 5 | Backend |
| STORY-00307 | Backend | Job 状态持久化（DB 存 job，支持长任务查询、重启恢复） | 3 | Backend |
| STORY-00308 | Backend | 错误处理 + 降级 fallback（BCUT 失败/GLM 失败/audio 抓不到 各自处理） | 2 | Backend |
| STORY-00309 | QA | 端到端手工验证：5 个真实 URL（3 小宇宙 + 2 Apple）跑通 pipeline，人工检查质量 | 2 | Backend |

**总点数**：25 pts

---

## Definition of Done

- [ ] Frank 手动执行 `curl -X POST 'https://api.k0.yiiling.cn/api/episodes/import-url' -d '{"url": "https://www.xiaoyuzhoufm.com/episode/xxx"}'` 拿到 jobId
- [ ] 轮询 `GET /api/jobs/:jobId` 看到 status 从 downloading → transcribing → generating → ready
- [ ] `GET /api/packs/:packId` 拿到完整学习包 JSON，含 corePoints/steps/cards/actions 全字段
- [ ] 5 个真实 URL（3 小宇宙 + 2 Apple 中英各一）**全部成功**
- [ ] 学习包质量人工审：无遗漏主要议题、无音译错误、章节分布均匀
- [ ] Backend 内存/磁盘无泄漏（200MB 音频转录后正常清理）
- [ ] Job 表持久化（backend 重启后老 job 状态还在）

**不 DoD 的（Sprint 7）**：
- iOS 前端展示新学习包
- Learn 屏 URL 输入 + 等待动画
- Episode 屏卡片交互 UI

---

## 技术要点

### Backend 目录结构（新增）
```
backend/src/
  services/
    audioExtractor/
      xiaoyuzhou.js    # 从 spike 迁移
      apple.js         # 从 spike 迁移
    asr/
      bcut.js          # 从 spike 迁移 + 加错误处理
    glm.js             # 改 endpoint + model + max_tokens
    jobStore.js        # 新增：job 状态持久化
    langDetect.js      # 扩展 zh/en/mixed
  routes/
    generate.js        # 改造：URL → pipeline
  config/
    entity_whitelist.json  # 新增：英文术语保护清单
```

### GLM 配置（.env）
```
GLM_API_KEY=25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd
GLM_BASE_URL=https://open.bigmodel.cn/api/coding/paas/v4
GLM_MODEL=glm-5.2
GLM_MAX_TOKENS=8192
```

### 章节标记（方案 B）
```
=== [章节 N: 15-30min] ===
[900s-902s] 主持人：...
...
```

### Runtime 兜底
- Pack 生成后检查 6 个 sourceTimestamp 覆盖多少个 15min 章节
- < 4 个 → 自动重试一次（加大 temperature 到 0.9）

---

## 后端 API 契约（Sprint 7 iOS 消费）

### 1. 提交 URL
```
POST /api/episodes/import-url
Body: { "url": "https://www.xiaoyuzhoufm.com/episode/xxx" }
Response: { "jobId": "uuid", "status": "downloading" }
```

### 2. 查询进度
```
GET /api/jobs/:jobId
Response: {
  "status": "downloading" | "transcribing" | "generating" | "ready" | "failed",
  "progress": 0-100,
  "stage": "下载音频 / 转录中 / 生成学习包 / 完成",
  "packId": "...",  // ready 时返回
  "error": "..."     // failed 时返回
}
```

### 3. 拿学习包
```
GET /api/packs/:packId
Response: { pack: PackObject }  // 已在 Sprint 3 定义
```

---

## Sprint 6 交付节奏

- Day 1-2：STORY-00300/301/302（audio + BCUT 迁移）
- Day 3：STORY-00303/305（GLM + 语言分支）
- Day 4-5：STORY-00304/306（方案 B + pipeline）
- Day 6：STORY-00307/308（持久化 + fallback）
- Day 7：STORY-00309（端到端验证）+ OTA 推送（如果有前端小改也顺手）

---

## 明确不做

- iOS 前端改动 → Sprint 7
- YouTube 支持 → 暂缓
- App 内播放器 → 需 build，暂缓
- 分片处理长音频 → 方案 B 已够用
- 剪映 ASR fallback → 不比 BCUT 稳定
