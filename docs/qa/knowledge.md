# QA Knowledge — K0

**Maintained by**: QA subagent (append-only via main agent)
**Purpose**: 累积 QA 对产品的理解、bug 模式、测试策略、回归清单。

---

## Sprint 0（2026-07-04）— Initial Understanding

### 产品性质
- K0 是 Full-Stack Web 应用（Next.js 14 单进程）
- 核心用户流：Home → Learn（粘贴链接）→ Episode（学习包）→ Cards → Review 队列
- 数据链：YouTube/Apple/Spotify URL → 转录 → GLM-4-plus 生成学习包 → MySQL 持久化

### 测试策略基线
- **Layer 1 存在性**：所有页面可访问 + 无 console error
- **Layer 2 正确性**：GLM 输出结构化 JSON 完整（快照 5 字段 + 6 步路径 + 5-10 卡片 + 3 行动 + 3-5 测验）
- **Layer 3 完成度**：完整用户流可跑通（导入 → 学习完成 → 卡片入库 → 复习）

### 关键性能门（来自 TECH_SPEC §performance-targets）
| 步骤 | 阈值 | 检查方式 |
|------|------|----------|
| 健康检查 | < 100ms | curl -w %{time_total} |
| 页面首屏 | < 2000ms | Playwright timing |
| AI 学习包生成 | < 60000ms | 后端 timing log |
| 转录抓取（YT 有字幕） | < 45000ms | 后端 timing log |
| feedback threshold | 2000ms | UX 交互测试 |

### 视觉验证要点（风格 F）
- 撕纸边缘应有明显 feTurbulence 位移感（非光滑边）
- 胖字母（Bagel Fat One）加载失败会回退到 system-ui，需在测试中验证字体真实加载
- 纯色平涂 + 无渐变
- 每页都应有主视觉插画（不能全文字）

### Viewport 覆盖（TECH_SPEC §viewports）
- Primary: 375px（iPhone SE）
- Secondary: 1280px（桌面）

### 测试数据（从 Sprint 0 收集）
- 中文播客示例：`https://www.youtube.com/watch?v=[张小珺访谈某集]`（待 Backend 提供有效链接）
- 英文播客示例：`https://www.youtube.com/watch?v=[Lex Fridman某集]`
- Apple RSS 示例：待 Sprint 1 SPIKE-002 验证
- Spotify 单集示例：待 Sprint 1 SPIKE-002 验证

---

---

## Sprint 1（2026-07-05）— Updates

### 平台更新（CR-001）
- K0 现为 iOS App（React Native + Expo）。QA 用 react-native-web 在 http://localhost:8081 跑 Playwright。
- Start: `bash scripts/start-web.sh`（后台：`BACKGROUND=1 bash scripts/start-web.sh`）
- 路由：`/`（Home）、`/learn`、`/review`、`/library`

### 字体验证技巧
- 用 `getComputedStyle().fontFamily` 探针确认字体（非视觉猜测）
- BagelFatOne_400Regular @ 64px = Hero title "Listen.\nLearn."
- 三个 stub 页面标题各用彩色版字体（/learn=红，/review=黄，/library=蓝）

### 选择器规范
- 入口卡片：`data-testid="entry-learn/review/library"` → Playwright 可用 `page.getByTestId()`
- 气泡标签：testID="hello-tag"
- Hero title：role="header"

### 性能基线（Sprint 1）
- FCP = 304ms（expo web dev server，cached）
- 阈值 <1500ms。任何 Sprint 后超过 2× 基线（>600ms）需标记。

### 控制台错误基线
- Sprint 1 全程 0 错误（4 路由 × 完整 nav regression）
- 任何 Sprint 引入 console error = Blocker bug

### Touch Targets
- Home 卡片：312×126px（44pt 最低要求远超）
- Selector: `[role="button"]` 找到所有 3 张卡片

### SVG 验证
- 5 SVGs 在 Home 页：耳机插画 + 3 入口卡图标 + WovenDivider
- 24 feTurbulence/feDisplacementMap 元素（撕纸滤镜）
- 验证命令：`document.querySelectorAll('feTurbulence, feDisplacementMap').length`

### Expo/npm 脚本约定
- "dev" = "start"（expo start 即 dev server）
- "build" = EAS Cloud Build（无本地 npm script）
- "test" = 待 Sprint 2 配置 jest/vitest

---

## Sprint 2（2026-07-05）— Updates

### 后端测试模式
- no-DB 模式：`.env` 中注释掉 `DB_HOST/DB_USER/DB_NAME`，backend 启动后 `db=null`，所有 DB 路径返回 mock 数据
- 带 DB env 但 MySQL 未运行 → `db` pool 存在但连接失败 → import 路径会尝试实际连接并报错。本地 QA/UX 测试应使用 no-DB 模式。

### 已验证 API 行为
| 端点 | 输入 | 结果 |
|---|---|---|
| POST /api/episodes/import | source=text, text≥200 | 200, EpisodeObject (lang 自动检测) |
| POST /api/episodes/import | source=text, text<200 | 400 VALIDATION_ERROR |
| POST /api/episodes/import | source=auto, Apple URL | 200, 真实元数据, ~1.7s |
| POST /api/episodes/import | source=auto, YouTube URL | 400 YOUTUBE_MANUAL_ONLY |
| POST /api/episodes/import | source=auto, unknown URL | 400 SOURCE_NOT_SUPPORTED |
| POST /api/episodes/:id/snapshot | invalid GLM key | 502 GLM_API_ERROR |
| POST /api/episodes/abc/snapshot | 非整数 ID | 400 VALIDATION_ERROR |
| POST /api/episodes/-1/snapshot | 负数 ID | 400 VALIDATION_ERROR |

### EpisodeObject 已验证字段
`id, source, sourceUrl, sourceId, title, channel, duration, language, coverUrl, audioUrl, publishedAt, importStatus`

### 语言检测规则（实现已验证）
- CJK 占比 > 30% → 'zh'
- ASCII letter 占比 > 60% → 'en'
- 其他（含混合文本）→ 'unknown'
- 输入 < 20 字 → 'unknown'
- 注意：纯混合（CJK+ASCII 均不达阈值）→ 'unknown'；ASCII 多数 → 'en'（非 'unknown'）

### 前端 Learn 屏幕验证通过
- 1 tap 可达，placeholder 可见，disabled/active 按钮状态与 200 字阈值绑定
- 内联 hint 格式："再多贴一些内容，至少 200 字（当前 N 字）"
- 提交成功 → EpisodeCard（title + duration pill + language pill + × dismiss + 下一步占位）
- 提交失败 → 中文友好错误信息，无崩溃
- 返回按钮：正常流和直接 URL 入场均工作正确（canGoBack() 降级修复）

### Sprint 2 nav regression 基线
- Home ↔ Learn 全路径 0 console error
- 直接 URL /learn → 返回 → Home: 0 error
- 注意：B7 YouTube 错误测试产生 1 个 fetch 400 console error，不计入 nav regression 失败计数（预期网络错误，非运行时崩溃）

### 回归清单（Sprint 3+ 必查）
- [ ] /learn 返回按钮（直接 URL 和正常导航两种情况）
- [ ] EpisodeCard dismiss 后 textarea 状态保留
- [ ] 语言 chip 显示：zh→"中文"，en→"English"，unknown→"未识别"
- [ ] Apple URL 导入时间 < 2000ms（当前 1694ms，接近上限）
- [ ] Snapshot 端点：非整数/负数 ID → 400；GLM 不可用 → 502

### Sprint 2 bug 模式
- GLM 错误码映射不完整（GLM_API_ERROR 未被 handleGlmError 处理）→ 已修复
- router.back() 在无历史时未降级 → 已修复为 canGoBack()
