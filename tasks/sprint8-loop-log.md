# Sprint 8 Loop Log

## Loop 1-13 — 2026-07-06 凌晨 全部完成

### 核心成就
- **12 项 bug 修复**（BLOCKER×2 + Critical×5 + UX×5）
- **3 大新功能**：完整转录展开 + 错别字识别 + 卡片收藏
- **生产 backend v8d 部署**（api.k0.yiiling.cn）
- **所有 Playwright QA 通过**（iPhone SE / 14 / 15 Pro Max 视口）
- **未推 OTA**（Frank 明早决定）

### 主要 Bug 修复
1. **BLOCKER**: reshapePack flat→nested (Sprint 7 v1)
2. **BLOCKER**: PATCH /api/steps/:id 500 (v2 schema 迁移 user_step_progress)
3. **Critical**: Learn 屏 URL 走老路 500 (Sprint 7 v3)
4. **Critical**: legacy /generate route 500 (v2 schema 适配)
5. **Critical**: text mode 500 (友好错误)
6. **Critical**: PasteBar 快速三击创建 3 jobs (useRef 同步防抖)
7. **Critical**: 步骤 stepNumber undefined
8. **Critical**: BCUT 412 → 智能重试
9. **Critical**: fetch 无超时 → 30s AbortController
10. **UX**: 步骤空「」 → 时间戳标签
11. **UX**: 假 Home 数据 → "即将上线"
12. **UX**: 英文卡片类型 → 中文（方法/观点/洞察/案例/行动）

### 新功能
1. **完整转录**: Episode 页 Actions 之后加折叠面板，懒加载展开 [mm:ss] + 分段
2. **错别字识别**: pack.suspectedTypos → 转录顶部黄条 block「原文」→ 可能是「正确」
3. **卡片收藏 (PRD C-006)**: 每张卡片 ★/☆ 按钮，默认收藏，PATCH /api/packs/:id/cards/:idx

### 长播客稳定性增强
- BCUT ASR 412/429/5xx 指数退避重试 3 次
- Apple/Xiaoyuzhou fetch 网络错误重试 3 次
- GLM MALFORMED_JSON 降温到 0.2 重试
- BCUT poll 每 5s 汇报 progress → UI 不再卡 20%
- Audio DL timeout 5min→15min，ASR poll max 15min→30min

### 手机端友好错误映射
BCUT_HTTP_412 → "转录服务被限流，请稍等 1 分钟"
AUDIO_DOWNLOAD_TIMEOUT → "音频下载超时（15 分钟）"
GLM_MALFORMED_JSON → "AI 学习包生成失败"
SOURCE_NOT_SUPPORTED → "无法获取音频（可能仅在 Apple 独播）"
NETWORK_TIMEOUT → "请求超时（30 秒）"

### 生产环境状态
- Backend v8d 已部署到 122.51.174.118
- systemd `k0-api.service` (Restart=always)
- nginx + HTTPS (Let's Encrypt)
- api.k0.yiiling.cn/health → 200 OK
- DB k0 (12 tables + user_step_progress + user_cards 桥接表)

### 未推 OTA
Frank 说明早再推。当前手机上仍是 v3。
下次推 OTA 时：
1. 修改 `components/OtaBadge.tsx` 顶部 `OTA_VERSION = 4`
2. `eas update --branch production --environment production --message "..."`

### 已知已解决 bug 详情（防重复修）
见 memory/k0_sprint8_auto_loop.md 完整列表

### 遗留 (backlog)
- 卡片删除功能 (archived 字段已就绪，UI 未加)
- Review/Library 屏还是 placeholder（PRD 未完全实现）
- goal-select 换 goal 时无缓存需要 re-run GLM
- 卡片点击可跳转到具体步骤（当前只 star 交互）
- BCUT_HTTP_412 长期解决方案（换免费 ASR 或用付费）
