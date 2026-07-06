# CR.md — K0 Change Requests

本文件是 PRD 之外所有需求变更的正式记录。PRD 一旦锁定不可直接编辑，所有变更走 CR。

**格式规范**:
```
## CR-NNN: [标题] (Sprint N)
**状态**: Approved | Withdrawn | Done
**批准者**: PO
**批准日期**: YYYY-MM-DD
**关联 Story**: STORY-NNNNN, ...

变更内容一句话说明。若与 PRD 冲突，CR 优先。
```

---

## CR-001: 平台从 Web 变更为 iOS 原生 App (Sprint 0/1 交界，2026-07-04)
**状态**: Approved
**批准者**: PO / 用户直接指令
**批准日期**: 2026-07-04
**关联 Story**: 所有 Sprint 1 Stories 需重写；TECH_SPEC 大幅重写；UI_SPEC 保留视觉风格但适配 RN 组件；PRD 保留业务逻辑不变。

### 变更内容
K0 从 **Full-Stack Web Application** 变更为 **iOS 原生 App（React Native + Expo）**。发布渠道为 App Store，通过 TestFlight 做内部测试。

### 关键决策（用户确认于 2026-07-04）
1. **技术栈**: React Native + Expo（不是 Swift/Flutter/Capacitor）
2. **QA 策略**: QA 仍用 Playwright 测 Web 版 —— 具体测 **`react-native-web`** 渲染的 Web 版（RN 组件在浏览器里跑）。iOS 原生细节由 TestFlight 内测覆盖。
3. **Backend**: 用户提示 —— yiiling.cn 服务器 + 数据库已有，我们有权限，可参考 Cairn 项目的用法。SM 待 Arch 确认后写入 TECH_SPEC。
4. **PRD 业务逻辑不变**：M1-M7 所有 Must-Have 功能保持；只是渲染载体从 Web 页面变成 iOS App 屏幕。

### 影响范围
| 文件 | 影响 |
|------|------|
| `docs/PRD.md` | 业务逻辑不变。§六 非功能性要求需更新（移动 375px 变成 iOS device sizes；深色模式 iOS 系统跟随；性能目标改成 mobile 标准） |
| `docs/TECH_SPEC.md` | **大改**：stack 换 RN+Expo；deploy 改成 TestFlight/App Store；start script 变 Expo CLI；test runner 改 Playwright 测 RN Web；viewports 改 iOS device sizes |
| `docs/UI_SPEC.md` | 保留 §chosen-style（风格 F Cutout Illustrated）；组件从 HTML/CSS 转为 RN styled 组件 |
| `docs/DB_SCHEMA.md` | 保留；数据库位置改为 yiiling.cn（待 Arch 与 Cairn 项目对齐后确认） |
| `docs/API_SPEC.md` | 保留（REST API 契约不变），只是消费者从 Web 前端变成 RN App |
| `tasks/jira/sprint1/` | 全部 Story 重写：SPIKE-004 MySQL 改用 yiiling.cn；STORY-00001 Next.js 改 Expo；STORY-00003 前端骨架改 RN + react-native-web |
| `docs/qa/knowledge.md` | 加 RN Web 测试策略章节 |
| `docs/ux/knowledge.md` | 加 iOS UX 规范（safe area、touch targets、iOS gesture pattern） |

### 明确保留（不受影响）
- PRD 业务目标、成功指标、成功承诺
- Product Soul（专注/可完成/值得信赖）
- 风格 F 视觉基因（撕纸剪贴/胖字母/6 色板/牛皮纸背景）
- GLM-4-plus AI 选型
- Acceptance mode: auto (Mode 2)

### PO 备注
这是**架构级 CR**，会导致 Sprint 1 完全重新计划。所有已建的 Sprint 1 Story 文件需要 SM 逐个重写。

---

## CR-002 ~ CR-012: 方案 v2 重构（Sprint 11，2026-07-06）
**状态**: Approved
**批准者**: PO / Frank 头脑风暴逐条确认
**批准日期**: 2026-07-06
**关联 Story**: STORY-01101 ~ STORY-01108
**关联 Spike**: SPIKE-010 GLM 拆两步方案验证（3 轮实证 0 次 429）

背景：用户回读 PRD 后指出当前实现和需求不一致——PRD 原意是"抓字幕 → 快照 → 用户决策 → 学习包"两步流，我们做成了一次生成全部。头脑风暴逐条讨论后达成 v2 方案，与 PRD 的偏离整理为以下 CR。

### CR-002: 删除 M2 5 目标选择
**变更**：抓字幕后立即选 5 目标（快速了解/深度学习/找方法/批判性/为工作研究）→ **删除**。降级为 Should-Have。
**理由**：快照本应客观，不该被目标扭曲；导入时用户还没看到内容盲选价值边际低；竞品（Snipd/Readwise/得到）无此模式。

### CR-003: 删除 M5 测验题
**变更**：M5 "测验题生成 3-5 道选择/简答题" → **删除**。M5 只保留"闪卡 + SRS + 记得/模糊/不记得"。
**理由**：K0 是陪伴式学习不是知识考核工具；用户主动学习不需要被考试；测验的"用户自评掌握程度"价值已由 Review 闪卡"记得/模糊/不记得"承接。

### CR-005: M3 按钮命名 "跳过 / 速学 / 精学"
**变更**：PRD 原文 "3 分钟速学 / 完整学习 / 跳过这集" → **跳过 / 速学 / 精学**（不带具体分钟数，词面更简洁）。
**理由**：分钟数会误导用户认为是硬性时长承诺，实际是"广度差异"（速学出 3-5 卡，精学出 3-18 卡）。

### CR-006: M4-C 卡片数量 5-10 → 动态 3-18
**变更**：PRD "每集 5-10 张卡片" → 动态密度（quick 模式 3-5 张 / deep 模式 3-18 张，按内容质量自然筛出）。
**理由**：短播客（<30min）3-5 张够；长播客（Lex Fridman 3小时）5-10 张漏；固定上限会硬砍长内容精华。

### CR-007: M4-C 卡片字段 5 → 8
**变更**：PRD "5 字段（标题/类型/解释/来源/我的应用）" → **8 字段**：
- title (观点陈述句)
- type (观点/方法/案例/反思/行动)
- **core** (核心解释 3-5 句) *新增*
- **context** (原文语境+时间戳) *新增*
- **usage** (1-2 用例) *新增*
- **challenge** (反面视角) *新增*
- source (播客名+时间戳+嘉宾原话)
- myApplication (AI 建议+用户可编辑)
**理由**：PRD 5 字段太薄，闪卡背面无内容；用户要的是"一套完整理解"而不只是"答案"。

### CR-009: M3 快照"一屏内展示" → 首屏核心信息可见
**变更**：PRD "快照一屏内展示（不折叠核心信息）" → **"首屏核心信息可见"**（一句话+价值分+3 决策按钮首屏可见；audience/worthListening/skippable 允许滚动查看；原文顶端收起）。
**理由**：iPhone 14 只有 844px 高，塞不下 8 个区块（元信息/一句话/价值分/成本/audience/worthListening/skippable/3 按钮）；用户滚动是自然行为不损体验。

### CR-010: M4-C 删除"保持不变"动作
**变更**：PRD "用户对每张卡片有 3 动作：收藏/删除/保持不变（默认收藏）" → 只保留 **★ 收藏 / 🗑 删除**。
**理由**："保持不变"实际就是"默认收藏"（PRD C-006）—— 用户不点任何按钮就是保持不变；独立展示这个动作反而增加认知负担。

### CR-011: M5 SRS 间隔从固定 1/3/7 → 动态
**变更**：PRD "复习提醒：明天(+1)/三天后(+3)/一周后(+7) 三档" → **动态 SRS**（现有实现：记得 → interval×2 [3-90 天]；模糊 → 保持；不记得 → 1 天）。
**理由**：固定档不适应用户记忆曲线；已在 Sprint 8 Loop 30 实装，用户实测效果良好。

### CR-012: 学习包输出语言 → 都中文
**变更**：PRD "学习包输出语言 = 播客源语言（中文播客中文，英文播客英文）" → **都中文输出**（不再跟随源语言）。
**理由**：主用户是中文母语，中文语境思考/复习/应用；英文原味会被翻译损耗但可以在 quote 字段保留原词；术语可中英混用（"AI moats 护城河"）保留精度。

### 影响范围（合并 CR-002 ~ CR-012）
| 文件 | 影响 |
|---|---|
| `docs/PRD.md` | M2 降级 / M3 按钮改名 + 一屏改为首屏核心 / M4-C 卡片数量+字段+动作改 / M5 删测验+间隔改 / §六 语言改中文 |
| `docs/API_SPEC.md` | 新增 `POST /api/packs/:id/generate` (body: {mode}) Step 2 endpoint；`GET /api/packs/:id` 结构升级；`POST /api/episodes/import-url` pipeline 只跑 Step 1 |
| `docs/DB_SCHEMA_v2.md` | learning_packs.pack_json 结构升级（新 8 字段卡片、加 concepts、audience、worthListening 含 quoteParagraph）；无需 alter table 因为 pack_json 是 JSON 列 |
| `backend/prompts/generate-pack.zh.md` | 拆为 `snapshot.zh.md`（Step 1）+ `pack.zh.md`（Step 2） |
| `backend/src/services/packGenerator.js` | 一分为二：`generateSnapshot()` + `generateLearningPack(mode)` |
| `backend/src/routes/importUrl.js` | pipeline 只跑到 Step 1（快照），不再连带生成学习包 |
| `app/import/[jobId].tsx` | 完成后跳快照页，不跳 episode 页 |
| `app/snapshot/[packId].tsx` | **新建** |
| `app/episode/[id].tsx` | 重构（quick/deep 共用，从 pack_json 加载不同 mode） |
| `app/library.tsx` | 4 外层 tab + 2 内层 tab |
| `app/review.tsx` | 闪卡背面 core+usage+challenge |
| `components/ScreenHeader.tsx` | **新建**（返回+标题+副标题+分割线） |

### 明确保留
- Product Soul、Cutout Illustrated 撕纸手工风、6 色板、Bagel Fat One 字体、Fraunces 正文
- GLM-5.2 主模型 + glm-4.5-air fallback（Sprint 10 v16 实现，Sprint 11 保留）
- 429 冷却窗口 + 模型 fallback 链（Sprint 10 v16 实现，Sprint 11 保留）
- 6 步引导路径 M4-A（用户明确要求保留，独立 UI 展示）
- 概念解释器 M4-B（保留 chip + 三层解释）
- 行动清单 M4-D（保留 3 条 + 勾选进 Review）
- SRS 复习算法（现有动态间隔）

### PO 备注
一次性合并 7 个 CR 是因为它们是**方案 v2 的整体决策**，逐个批准反而丢失系统性。所有 CR 在 2026-07-06 Frank 与主 agent 头脑风暴期间逐条口头确认，SPIKE-010 验证了核心技术方案（拆两步不 429）后统一记录。

---


