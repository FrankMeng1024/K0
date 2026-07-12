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

## CR-013 ~ CR-019: Sprint 12 卡片重构 + UI 一致性（2026-07-07）
**状态**: Approved
**批准者**: PO / Frank 手机实测反馈 22 问题 + 3 subagent 调研
**批准日期**: 2026-07-07
**关联 Story**: STORY-01201 ~ STORY-01210

背景：Frank Sprint 11 手机实测发现 22 个问题，涉及 UI 一致性、卡片结构本质、后台恢复、GLM 产出质量。3 subagent (竞品实操 / 学习科学 / UX) 调研共识 = 现有 8 字段卡片过重，应改为 quote+insight+timestamp+context+myNote。

### CR-013: 知识卡片字段 8 → 5（v3）
**变更**：CR-007 定义的 8 字段（title/type/core/context/usage/challenge/source/myApplication）→ **5 字段**：
- `quote`：原文金句摘录（30-80 字，一等公民，中文认知优势 + Snipd 招牌）
- `insight`：AI 生成一句话洞见（≤ 25 字，替代原 title+core）
- `timestamp`：原文秒数（未来带 ▶ 回放，Sprint 13 实装）
- `context`：原文上下文 3-5 句（展开态才见）
- `myNote`：用户可编辑的一句话笔记（默认空）
**理由**：三份独立 subagent 调研共识——8 字段是"AI 觉得应该有"的伪需求，实际用户扫读被压垮，Wozniak 最小信息原则明确 1 卡 1 概念，Snipd/得到/微信读书都是 3-4 字段模式。type 5 类标签用户不 care 且 AI 分类不稳定，usage/challenge 是"AI 编造重灾区"。

### CR-014: 快照页"一屏内展示"再迭代 → 支持滚动
CR-009 已把"一屏内"改为"首屏核心信息可见"，本次实测确认：**8 区块无法一屏**，需要可滚动，但底部 3 决策按钮必须固定在视口内。

### CR-015: 快照页左滑禁回退
**变更**：iOS 默认 swipeBack 手势启用，用户左滑会返回上一页。快照页禁用（`gestureEnabled: false`），只能通过顶部返回按钮。
**理由**：Frank 反馈"快照页左滑不要回退，回退只有按钮"——防止用户误触失去 30s+ 生成的快照。

### CR-016: 学习包页原文改摘要+全文切换
**变更**：CR-016 原意 Tab 1 精简版 / Tab 2 全文。实测反馈"应该是摘要转录 + 小 icon 切完整转录"（默认摘要，一键切）。摘要内容 = GLM Step 2 输出（复用 concept 摘要 or 简介），全文 = transcripts 表原始段落。**都以段落为单位**，不再按时间戳每 2s 一条（Frank #8,#20）。
**理由**：BCUT ASR 出的段落是 2-3s 一段太细碎，读起来"分裂"。改为按语义段落（AI 或规则合并到 30-60s 一段）。

### CR-017: 行动清单允许缺档
**变更**：CR 保留 M4-D 3 条（今天/本周/长期）但**允许 GLM 缺档**（若嘉宾没提可执行方法就返回 null）。前端遇 null 展示"此集没提供 XX 类行动建议"优雅提示，不留空白也不硬凑。
**理由**：Frank 反馈"猫山王榴莲测评"这种美食内容只出得了 today（吃），week/longterm 硬凑就是编造。

### CR-018: 音频 ▶ 回放 Sprint 12 占位 / Sprint 13 实装
**变更**：Frank 明确认可 Snipd 招牌功能"tap quote → 播 30 秒"是必做，但 Sprint 12 时间紧，只做占位 ▶ 图标（不点或点提示"下版本上线"）。Sprint 13 专项 SPIKE-011 验证 expo-av + 小宇宙/Apple audioUrl 可用性 + iOS 后台播放权限。
**理由**：不影响本 Sprint 卡片重构主线；audio_url 过期问题在 PRD Won't Have 之外，Sprint 13 独立规划。

### CR-019: Step 2 job pattern 已 Sprint 11 v16 实现，Sprint 12 实测验证
**变更**：无新代码，仅走 Playwright + 真机复现"精学切后台"验证 v16 hotfix 生效。若仍有问题按修补 hotfix。
**理由**：Frank 说 v16 后仍有问题，需查是没拉到 v16 还是逻辑真挂了。

### 影响范围
| 文件 | 影响 |
|---|---|
| `docs/PRD.md` | M4-C 卡片字段 5-10 → 5 字段（Sprint 11 CR-007 覆盖，本次再更新） |
| `backend/prompts/pack.zh.md` | 完全重写为 v4（新 5 字段 + 行动允许空 + 概念保留） |
| `backend/src/services/packGenerator.js` | PROMPT_VERSION v3 → v4 |
| `backend/src/routes/importUrl.js` | promptVersion 硬编码 v3 → v4（同步） |
| `app/episode/[id].tsx` | 大改：新 5 字段卡片渲染 + 摘要/全文切换 + Sprint 11 分割线/bullet UI 修 |
| `app/snapshot/[packId].tsx` | 大改：滚动 + 分割线修 + audience/timestamp 胖字体 + 评分标准 + bullet 换图案 + 左滑禁 |
| `app/review.tsx` | 卡片背面读 new fields (quote + insight + context) |
| `app/library.tsx` | 卡片预览改新 3 字段 |
| `app/learn.tsx` | 顶部去 "今天可开始一集" chip，分割线样式 |
| `app/import/[jobId].tsx` | 底部"正在处理"条删（#2）+ 进度条上方分割线删（#3）+ 修乱码（#1） |
| `components/ScreenHeader.tsx` | 分割线样式重构（#4） |

### 明确保留
- Product Soul、Cutout Illustrated 撕纸手工风
- 6 步引导路径 M4-A（Sprint 11 CR 保留）
- 概念解释器 M4-B（3 层解释）
- GLM 拆两步、SPIKE-010 结论
- Sprint 11 v16 hotfix (Step 2 job + dedup fix)

---

## CR-020: 全仓库死代码清理 + v1/v2 schema 统一（2026-07-09）
**状态**: Approved
**批准者**: PO / Frank 直接指令
**批准日期**: 2026-07-09
**关联 Story**: 无（技术债清理，非业务需求）

### 变更内容
Sprint 11 v2 重构后 v1 schema (backend/migrations/002-004) 与 v2 (backend/db/migrations/001-init-v2.sql) 并存至今，`docs/DB_SCHEMA.md` 仍是 MVP v1 文档。仓库内累积 spike 目录、临时文件、失效文档。本次一次性清理：

1. **删除 v1 遗留 migration**：`backend/migrations/002_import_fields.sql` / `003_snapshots.sql` / `004_learning_packs.sql`。
2. **保留但审计**：005-010（push_tokens / user_actions / pack_access_mode / debug_uploads / user_uploads / auth_username）——补丁表，仍在使用。
3. **重写 `docs/DB_SCHEMA.md`**：以 v2 (001-init-v2 + 补丁 005-010) 为 single source of truth。
4. **全仓库死代码扫除**：spike/*、临时脚本、失效文档，按 4 subagent 交叉验证清单执行。
5. **不动应用代码运行时行为**：只删无引用的文件；引用了 v1 表结构的代码单独列出，本 CR **不修改**（另开 Story）。

### 影响范围
| 文件 | 影响 |
|---|---|
| `backend/migrations/002-004.sql` | **删除** |
| `docs/DB_SCHEMA.md` | 重写反映 v2 真实结构 |
| 根目录/`_spike/`/`docs/` 未引用文件 | 按清单删除 |
| `tasks/cleanup-plan.md` | 新增：删除/保留清单，本 CR 的执行证据 |

### 明确保留
- 所有 v2 tables (001-init-v2) 及其补丁 005-010
- 所有当前 Sprint 使用的 app/、backend/src/、components/ 代码
- 所有 `docs/PRD.md` / `TECH_SPEC.md` / `UI_SPEC.md` / `API_SPEC.md`（factory doc）
- 所有 `tasks/jira/sprint*/` Story 归档
- 所有 `docs/qa/knowledge.md` / `docs/ux/knowledge.md`

### 执行方式
4 个 Explore subagent 并行侦察（backend / frontend / docs / spike-misc），Arch subagent 复核清单后执行删除，全程走 Agile workflow。**禁止** Claude 单方面拍脑袋删。

---

## CR-021: 知识脑图（单篇 + 多篇跨集语义串联）
**状态**: Approved
**批准者**: PO / Frank 口头需求正式化补记
**关联 Story**: #111-#119（脑图系列）

### 变更内容
新增"知识脑图"功能：
1. **单篇脑图**：学习包内 主旨→核心观点→关键概念→卡片 的放射结构图。点节点高亮关联、折叠展开、纸质手作风。入口在学习包页。
2. **多篇脑图（跨集知识图谱）**：用户所有学习包为节点，**按内容语义**（非标题字面）连接讲同一主题的包。入口在 Library 顶部"知识图谱"卡。

### 与 PRD §七 边界"复杂知识图谱：明确不做"的关系（关键澄清）
本 CR **不违反**该边界。PRD 禁的是"**复杂**"图谱——用户手动建边、可编辑的多层图谱数据库、协作图谱。本功能是**只读、自动生成、单一权威数据源**的轻量可视化：单篇由 pack 已有字段放射布局，多篇由 embedding 自动算语义边，**用户不能编辑图结构**。定位为"帮用户看见已学内容之间的连接"，是学习成果的可视化副产品。PO 确认边界解释成立。

### 技术
- 布局纯前端（react-native-svg + gesture + reanimated，OTA 无需 build）。
- 多篇语义边：后端 `/api/library/knowledge-graph` 用 GLM embedding-3 算余弦相似度（≥0.72 连线）。embedding 走独立按量端点，与 chat 的 Lite 端点**计费物理隔离**；失败/无余额静默回退字面匹配，脑图不崩。

### 明确不做（本 CR 边界）
横屏/全屏/iPad 最大化（需原生模块，留后续 build）；用户手动编辑连线；跨用户共享图谱。

---

## CR-022: Lite 额度充足下的生成提质（该省省该花花）
**状态**: Approved
**批准者**: PO / Frank
**关联 Story**: #120-#122

### 变更内容
GLM Coding Plan Lite token 额度充足（近 30 天 14.63M 远未达上限），在"不浪费"前提下提升生成质量：
1. **卡片 maxTokens 2000→3500**：消除 quote+洞察+语境撞顶被截断走 salvage。
2. **精学框架卡 + 回忆题开 thinking**：二者是归纳推理任务，从纯抽取拆出单独开推理档。
3. **精学 self-critique 自审一轮**：生成 steps 后加一次 AI 自审——批判性思考是否真思辨、案例步有无遗漏真实一手故事/数据、sourceQuote 诚实性。"一次生成"→"生成→自审→修正"。

### 理由
精学要真正区别于速学（"讲透道理"），额度充足下用更多推理 token 换深度划算。纯后端改动，不改前端渲染，无需 OTA。

---




## CR-023: 脑图力导向重构 + 二分概念图谱 + 图片debug修复 + 深读提质 (Sprint 16 R36+)
**状态**: Approved
**批准者**: PO / Frank
**批准日期**: 2026-07-12
**关联 Story**: R36-R40

### 变更内容(Frank 真机反馈一批 6 项)
1. **图片 debug 上传修复**：首页 3-tap DebugUploadZone 上传报错。根因 `fetch(uri).blob()` 在 RN 读本地 URI 返回空/抛错 → POST 空 body → 400。改用 `expo-file-system/legacy` 的 `uploadAsync(BINARY_CONTENT)` 流式发文件，后端 raw 端点不变。
2. **脑图力导向重构**：弃静态放射布局（线条交叉成团），改 force-directed（纯 JS d3-force 语义，charge/link/center/collision 四力），节点动态散开、拖动可移动、其余点重排。参考 Obsidian Graph View。
3. **脑图 UI 美化**：去红黄纯色球，改低饱和暖色纸质风 + 大小编码 + 标签渐进披露 + 贝塞尔语义边。
4. **多篇二分概念图谱**：library 图谱从"文章直连文章"改为 Obsidian 式二分图——每个概念本身成节点，学习包连到它包含的概念，两篇因共享同一概念节点而自然成网。
5. **深读质量提升**：Playwright 真机跑真实学习包 + 2 subagent 模拟付费用户打分定位短板，再针对性改 packGenerator prompt/参数（禁盲目加 token）。

### 技术
- 力导向/二分图/UI 全用已装库（react-native-svg + gesture-handler + reanimated）→ **OTA 无需 build**。
- 图片修复 `expo-file-system@57` 已装（SDK 内置）→ OTA 即可。
- 力导向共享组件 `components/graph/ForceGraph.tsx` + hook `hooks/useMindForce.ts`，单篇/多篇两页统一复用（契合重构原则）。

### 交付
全部 5 项做完**一次性 OTA**（Frank 确认，与重构期禁小步 OTA 原则一致）。

### 明确不做
横屏/全屏/iPad；用户手动编辑连线；跨用户共享图谱（沿用 CR-021 边界）。

---
