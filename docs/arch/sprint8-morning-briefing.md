# Sprint 8 早晨交付摘要

Frank 早上好 ☀️。夜里我从 Loop 1 干到 Loop 25，全部产出如下。

## 一句话总结
25 轮迭代，修 15 个 bug（Blocker×2 + Critical×7 + UX×6），新增 5 大功能（完整转录展开、错别字识别、卡片收藏、播客封面图、完成庆祝 chip），全链路稳定性大改造，生产 backend v8g 已部署，前端在 main 分支等你决定推 OTA。

## 你早晨可以做的事

### 1. 一键验证一切健康
```bash
cd C:/ClaudeCodeProjects/K0
node backend/scripts/smoke-test.js --prod
```
应该看到 `2/2 passed`。夜里跑过，2.1s 每条，都是 cache hit。

### 2. 决定是否推 OTA
- 当前 OTA v3 在你手机上（Sprint 7 交付）
- Sprint 8 全部改动在 main 分支未推
- 决定推：`git log --oneline | head -20` 看变更，然后：
  1. 打开 `components/OtaBadge.tsx`, 顶部 `OTA_VERSION = 3` 改成 `4`
  2. `eas update --branch production --environment production --message "sprint8: transcript + typos + card star + long-podcast stability"`
- 决定先测：Playwright web 端已全绿，可以直接 web 端 http://localhost:8081 体验

### 3. 主要新功能体验点
- **完整转录**：Episode 页最底部"完整转录 · N 段 · M 字"折叠面板，点开显示逐段 [mm:ss] 全文
- **错别字识别**：转录展开顶部有黄条 block 列出 AI 识别的可能错字（如"他颜社"→"她研社"）
- **卡片收藏**：每张知识卡片右上角 ★/☆ 按钮，默认收藏，点击切换（DB 持久化）
- **步骤进度**：勾选步骤 checkbox 会持久化到 DB，刷新后保留
- **重试友好**：任何失败页有"回首页重试"按钮，会自动预填失败的 URL

## Frank 睡前提出的问题解决状态

### Case 1: 17 分钟播客 2 分钟成功
✅ 保持

### Case 2: 50 分钟播客卡 20% 不动
🔧 已加固定：
- BCUT ASR 加 412/429/5xx 重试（指数退避 3 次）
- Audio DL timeout 5min → 15min
- ASR poll max 15min → 30min
- BCUT poll 每 5s 通过 onProgress 更新 job progress
- UI 现在显示"AI 正在为你精读这集… (已 1m 20s)"，卡感消失

### Case 3: 7 分钟播客 fetch 失败
🔧 已加固定：
- 客户端 apiFetch 加 30s AbortController 超时
- NETWORK_TIMEOUT 友好错误："请求超时（30秒），网络可能不稳定"
- 失败页可"回首页重试"，自动预填 URL

### 新功能：转录 + 错别字修正
🔧 已完成：
- Episode 页展开转录面板，逐段渲染 329 段 4475 字
- pack.suspectedTypos 字段在转录顶部显示
- 手动为 packId=5 (你的黄金 URL 声动早咖啡) 种入 5 条演示错别字：
  「他颜社」→「她研社」/「生动早咖啡」→「声动早咖啡」/「可林」→「可灵」/「梦依」→「梦怡」/「他研设」→「她研社」
- 未来 GLM 生成新 pack 时会自动输出（prompt 已加强）

## 生产环境状态
- Backend v8d 部署在 122.51.174.118 (`k0-api.service`)
- HTTPS: `https://api.k0.yiiling.cn` (Let's Encrypt 自动续)
- MySQL: 12 tables + user_step_progress + user_cards 桥接表
- Logrotate 配置：日 rotate，保留 14 天

## 遗留 backlog（待你决定优先级）
- 卡片删除功能（archived 字段已就绪）
- Review 屏 SRS 复习卡片队列（当前是"即将上线"占位）
- Library 屏卡片浏览筛选（同上）
- goal-select 换目标时无缓存，需要重跑 GLM（当前给友好错误引导用户从 PasteBar 重跑）
- BCUT_HTTP_412 长期解决方案（自建 whisper 或付费 ASR）
- Ask AI 单集问答（PRD 中提及，需 LLM 调用）

## Sprint 8 提交记录
```
git log --oneline main | head -20
```
应该能看到 17 个 Sprint 8 commits，前缀 feat(sprint8) / fix(sprint8)。

## 关键文件
- `tasks/sprint8-loop-log.md` - 详细每 loop 做了什么
- `tasks/lessons.md` - Sprint 8 5 条经验
- `docs/qa/sprint8-evidence/` - 15+ 张 Playwright 截图证据

早安 Frank。任何问题或想验收调整，我在待命。
