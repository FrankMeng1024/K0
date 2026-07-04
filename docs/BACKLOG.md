# BACKLOG.md — K0

**排序**: 按用户价值 + 依赖顺序（上面优先做）
**更新责任**: SM (Sprint Planning Step 0)

---

## Must-Have Stories（MVP 承诺范围内）

### Foundation 层（先行）

- **STORY-00001** — 项目骨架：MySQL 建库、后端 Skeleton、健康检查
- **STORY-00002** — 用户体系接口预留（auth middleware + user_id 字段）
- **STORY-00003** — 前端骨架 + 3 入口首页（Learn / Review / Library）

### E-001 Import & Transcribe

- **STORY-00010** — YouTube 链接导入 + 官方字幕抓取
- **STORY-00011** — Apple Podcasts 链接元数据抓取
- **STORY-00012** — Spotify 链接元数据抓取
- **STORY-00013** — 语言自动识别 + 时间戳标准化

### E-002 Learning Snapshot

- **STORY-00020** — GLM 生成学习快照（一句话 + 3 观点 + 价值分）
- **STORY-00021** — 快照 UI 卡片 + 3 个后续动作按钮

### E-003 Learning Pack Generator

- **STORY-00030** — 学习目标 5 选 1 UI + 参数传递
- **STORY-00031** — 6 步学习路径生成（GLM 提示词工程）
- **STORY-00032** — 概念解释器（关键词识别 + 三层解释）
- **STORY-00033** — 5 类知识卡片自动生成
- **STORY-00034** — 行动清单（今天/本周/长期）

### E-004 Learning Player

- **STORY-00040** — 单集页面：状态栏 + 快照区 + 路径打勾
- **STORY-00041** — 卡片浏览器（收藏/删除/编辑我的应用）
- **STORY-00042** — Ask AI（默认 6 个问题按钮，非空白输入）

### E-005 Review System

- **STORY-00050** — 测验题生成 + 答题 UI
- **STORY-00051** — 闪卡模式（正面问题、背面答案）
- **STORY-00052** — 复习队列调度（明天/三天/一周）
- **STORY-00053** — Review 入口 + 每日复习流

### E-006 Knowledge Library

- **STORY-00060** — Library 入口 + 卡片列表（按主题/来源/类型筛选）
- **STORY-00061** — 跨集搜索（关键词 + AI 问答）

### E-007 Foundation 收尾

- **STORY-00070** — 部署脚本（用户自己服务器）
- **STORY-00071** — 数据备份策略

---

## Should-Have（可能在 MVP 后续 Sprint 做，非承诺）

- 已收藏卡片的手动主题标签
- 一键分享学习包 URL（无社交、仅链接）
- 学习进度个人统计

---

## Could-Have（暂不承诺）

- 深色模式
- 更多播客平台（小宇宙、喜马拉雅）
- 音频上传 + STT

---

## Won't Have（同 DISCOVERY §Won't Have）

见 DISCOVERY.md。
