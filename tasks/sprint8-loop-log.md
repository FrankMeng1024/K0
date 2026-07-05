# Sprint 8 Loop Log

## Loop 1 — 2026-07-06 起始
- 目标：黄金 URL (packId=5, 声动早咖啡) 端到端 Playwright QA
- 视口：iPhone 390x844
- 缓存：已缓存，5s 内返回

### 发现 & 修复
1. **BUG-01 Critical** — 步骤展开显示空 `「」` — v2 pack citation.text 为空导致
   - 修：非空 text 显示引言，否则显示 `📍 音频 mm:ss 附近`
   - 位置: app/episode/[id].tsx SnapshotCard render step body
   - 状态：✅ Fixed (verified via Playwright)

2. **BUG-02 Blocker** — 步骤 checkbox PATCH `/api/steps/500` 500 Error
   - 根因：v2 schema 没有 `learning_steps` 表，改用 `user_step_progress` 桥接表
   - 修：backend/src/routes/packs.js PATCH /api/steps/:id 重写为 upsert user_step_progress；解码 stepId = packId*100 + stepIndex
   - GET /api/packs/:id 联表读 user_step_progress 注入 pack.steps[].completed
   - 前端 reshapePack + mappedSteps 用 s.completed 而非硬编 false
   - 状态：✅ Fixed (verified persistence via reload)

### 已识别但未处理（backlog）
- **UX-01 Medium** — 知识卡片无交互（收藏/删除/保持）— PRD C-006 要求
- **UX-02 Medium** — 步骤citation 显示"音频 mm:ss 附近"但没有跳转到该时间戳
- **UX-03 Low** — 学习路径的 sourceTimestamp 数据不精确（推测式）

### 继续项
- Loop 1 继续：Home Learn 卡片→Learn 屏 URL 输入路径 QA
- Loop 2 起：Home Review 屏、Library 屏、返回 Home 后二次输入
