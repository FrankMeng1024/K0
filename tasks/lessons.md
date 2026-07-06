# Lessons Learned — K0

**Status legend**: `[pending]` 未决 · `[archived: CLAUDE.md §xxx]` 已上升为规则 · `[dropped: reason]` 已弃

---

## Sprint 0 — 2026-07-04

- `[pending]` **风格选定流程超规范**：`style-demos/` 起初产生了 7 个 HTML 候选（应产出 3 个）。→ 根本原因：Arch 探索期没有硬限制。→ 意义：Sprint 0 CP1 前 Arch 必须收敛到 ≤3 个方向再展示给用户。
- `[pending]` **Lightbox stage 尺寸问题耗费多轮**：`aspect-ratio + max-height` 组合在实际浏览器中不严格生效，用 `width: min(...)` 才稳定。→ 根本原因：CSS spec 与实现的间隙。→ 意义：任何"根据视口自适应保持比例"的容器，优先用 `min()` 表达式而非 aspect-ratio+max-height。
- `[pending]` **过度归零 padding 导致 print-look**：我曾把 lightbox-scale padding 完全归零导致内容顶死边缘。用户批评"视觉太 low"。→ 根本原因：解决"右侧空白" bug 时矫枉过正。→ 意义：任何 web 页面容器都应保留 ≥ 40px 上下 / 50px 左右的呼吸空间。归零 padding 是设计禁忌。
- `[pending]` **网络工具全禁用（企业+GLM 余额）**：内置 WebSearch/WebFetch 都被企业策略阻断，GLM search-pro 余额耗尽。→ 意义：本项目所有"需要网络查询"的动作要预先声明成本或用内部知识。Sprint 期间不再依赖实时查询。

## Sprint 0 CR-001（2026-07-04）
- `[pending]` **CR-001 平台变更（Web → iOS RN+Expo）**：用户在 Sprint 0 CP2 之前紧急变更目标平台为 iOS App，用 Expo，QA 仍用 Playwright 测 react-native-web，Backend 沿用 Cairn 架构。→ 意义：**Sprint 0 未过 CP2 前的重大变更是合理的**，此时改动成本最低；一旦进 Sprint 1+ 代码级开发，平台变更就极其昂贵。**教训**：Sprint 0 CP2 前给用户展示"确认清单"必须包含 project type 这条，让用户能提前否决。
- `[pending]` **Cairn 是关键参考架构**：K0 沿用 Cairn 的 Backend Express+mysql2、Docker 部署到 122.51.174.118、api.yiiling.cn 域名模式。→ 意义：多项目共享基础设施降低了 K0 的运维负担 50% 以上。**教训**：Sprint 0 §type 决策时应先搜"团队现有项目"再决定 stack，而不是空想。

## Sprint 0 CP1（2026-07-04）
- `[pending]` **CP1 用户明确选择 F 风格 + 附加"更细致 抽象一些"要求**。已锁定到 UI_SPEC.md `§chosen-style`。所有后续 Frontend 决策必须遵循此风格锁定。

---

## Sprint 2 — 2026-07-05

- `[pending]` **Windows ESM isMain guard 大小写陷阱**：`new URL(resolve(process.argv[1]), 'file://')` 在 Windows 上产生小写驱动器字母路径（`c:\...`），但 `import.meta.url` 始终是大写（`file:///C:/...`）。URL 字符串比较失败 → server 无法直接运行。→ 根本原因：`path.resolve()` 不保证驱动器字母大小写。→ 修复：改用 `pathToFileURL(resolve(process.argv[1])).href`，Node 内置函数统一规范化大小写。**教训**：Windows ESM 项目的 isMain guard 必须用 `pathToFileURL`，禁止手动拼 `file://` URL。
- `[pending]` **no-DB 模式需明确注释 DB 环境变量**：`.env` 中 DB_HOST 存在时 mysql2 pool 会创建，即使 MySQL 未运行也不会触发 `if (!db)` 守卫，连接在第一次查询时才失败。→ 意义：本地 no-DB 测试必须注释掉 DB_HOST/DB_USER/DB_NAME，不能只依赖服务不运行。记录在 QA knowledge.md Sprint 2 章节。
- `[pending]` **GLM 错误映射缺口（BUG-00002 模式）**：GLM 服务返回新的错误类型时，如果 `handleGlmError()` 没有对应 case，会静默 fallthrough 到通用 500 handler，掩盖真实错误码。→ 根本原因：枚举处理函数未做 exhaustive check。→ 教训：每次新增 `err.glmError` 值时必须同步更新 `handleGlmError()` 并在 Story AC 中包含该错误路径的测试。
- `[pending]` **路由 back() 无历史时崩溃（BUG-00001 模式）**：Expo Router `router.back()` 在空历史栈（直接 URL 入场）时抛出 GO_BACK 错误。→ 根本原因：开发时总从 Home 进入，没有测试直接 URL 场景。→ 教训：每个有 返回 按钮的屏幕，UX AC 必须包含"从直接 URL 进入后点击返回"场景。
- `[pending]` **QA 测试数据编码**：Bash shell 中 Chinese 文本会被 mangled（字节长度与字符长度不一致）。→ 解决：用 `node -e "fs.writeFileSync()"` 写 JSON payload 文件，保证 UTF-8 完整性。下个 Sprint 起 QA 测试数据一律通过 node 脚本生成，不在 shell heredoc 中内嵌 CJK 字符。
- `[pending]` **中文文字导入 EpisodeCard 标题 UX**（Low deferred）：粘贴文本导入后 card title 显示原始内容摘录，用户可能不识别。→ 意义：STORY-00021 快照 UI card 实现时需考虑标题生成逻辑（GLM 快照 one-liner 应成为卡片标题）。

## Sprint 1 — 2026-07-05

- `[pending]` **YouTube/Spotify 境内网络永久阻断**：development machine + 腾讯云上海均无法访问 youtube.com / open.spotify.com。0/5 字幕抓取成功。→ 根本原因：GFW 网络限制。→ 意义：M2 YouTube 自动导入在 MVP 阶段不可行。产品降级为"用户粘贴文本"入口 + Apple Podcasts RSS 自动抓取（SPIKE-002 验证 VIABLE）。Sprint 2 Planning 时 PO 确认最终方案。
- `[pending]` **AUTH_ENABLED=false 无生产守卫**：backend 开发模式下 JWT bypass 有效，但无 `NODE_ENV=production` 强制启用 auth 的守卫。→ 意义：Sprint 2 前修复：production 环境下 AUTH_ENABLED 默认 true，startup 打 warning。
- `[pending]` **API_SPEC /health 响应形状未反映实际实现**：实现返回 `{status:"degraded", db:{ok,latency_ms}}` 但 API_SPEC 只写了 `{status:"ok", db:"ok"}`。→ 意义：Sprint 2 Planning 前 Arch 更新 API_SPEC /health 契约，SM broadcast。
- `[pending]` **Expo 脚本约定 vs Story AC**：Story AC 写"含 dev/build/test 脚本"但 Expo 约定用 start 代替 dev，EAS 代替 build，test runner 未配置。→ 意义：iOS RN 项目 Sprint Planning 时 Story AC 用 Expo 实际命令名，不用通用 web AC 模板。
- `[pending]` **SVG feTurbulence 在 react-native-web 稳定**：SPIKE-005 验证了 24 个 feTurbulence 元素在 web 端正确渲染。这是 Style F 的核心技术风险，已消除。
- `[pending]` **keep-alive 脚本语法**：`.bat` 文件在 Git Bash 里用 `timeout /t` 触发 GNU timeout 报错（`timeout: invalid time interval '/t'`）。→ 解决：改用 bash 脚本 `sleep 540` + Notepad++ 路径硬编码（`C:/tools/Notepad++/notepad++.exe`）。后台运行无弹窗。

---

## Sprint 3 — 2026-07-05

- `[pending]` **防息屏脚本致 Claude Code session 被退出**：`keep-alive.bat` / `keep-alive.sh` 用 `taskkill /f /im notepad++.exe` 关闭 Notepad++，且在同一 Bash 上下文运行时，某种前台窗口切换/信号传播使 Claude Code 父 shell 被 kill。→ 解决：新写 `keep-awake-v2.ps1`——不 taskkill、检测未开则最小化启动、通过文件 append + SetCursorPos 微移鼠标 1px 保活，用 `Start-Process -WindowStyle Hidden` 派生独立进程绝不阻塞当前 session。**教训**：任何后台常驻脚本必须"进程隔离"（独立进程组、非阻塞、不干预主 session 的进程列表），Bash 里前台跑循环脚本是绝对禁忌。
- `[pending]` **no-DB 模式 GLM fallback 覆盖不完整（BUG-00003）**：STORY-00031 只在 snapshot 端点做了 mock fallback，generate 端点被遗漏，GLM_API_KEY 是 placeholder 时用户被硬阻塞在 Episode 屏。→ 根本原因：Sprint 2 修复 BUG-00002 (snapshot GLM_API_ERROR 502) 时未把同款 fallback 模式作为规则覆盖所有 GLM 依赖端点。→ 教训：任何新增的 AI 依赖端点必须实现"no-DB + key 无效 → deterministic mock"三态守卫；本条已升级到 Sprint 4 Definition of Ready 硬 checklist。
- `[pending]` **State 未在 goBack 时重置（BUG-00004）**：React Native / Expo Router 屏幕栈保留组件实例，页面 `router.push` 后未清 loading state 的话，goBack 时旧 state 显现导致 UI 假死。→ 教训：任何调用 `router.push` 的屏幕，只要有 loading/error state，必须用 `useFocusEffect` 在 focus 时重置。
- `[pending]` **QA 验收视口从桌面切换到 iPhone 三档**：用户明确反馈"这是 App 项目要按照手机尺寸截图验收"。→ 从 Sprint 3 起 QA/UX 每个 Sprint 用 iPhone SE 375×667 / iPhone 14 390×844 / iPhone 15 Pro Max 430×932 三档截图。桌面视口从此不接受作为验收证据。已进 memory `feedback_qa_viewport_and_art.md`。
- `[pending]` **美术执行度与用户直觉差距**：Sprint 3 UX 发现 7 个 Critical friction 全部围绕"Cutout Illustrated 撕纸风缺乏撕纸边缘/多层叠加/手工错位"以及"iOS 原生模式（拇指区、pill/chip 分级、返回样式）偏差"。→ 教训：Style 锁定后每次 Story 完成前 Frontend 必须做"视觉保真自查"（打开 Sprint 0 style demo 并列对比），已在 CLAUDE.md 中定义但 Sprint 3 未严格执行。Sprint 4 起该自查作为 Frontend Dev Definition of Done 硬 gate。
- `[pending]` **CR-002 撤销 (malware 误报)**：`keep-alive.bat/.sh` 被系统 read-tool 提示标记为需谨慎脚本，实为脚本包含 `taskkill /f` + 循环触发启发式规则。用户确认误报，脚本已删除并替换为 v2。→ 教训：`.bat` 循环 + `taskkill` 组合易触发工具链误报，未来后台脚本优先 PowerShell 且 kill 用 API 而非命令行。

---

## Sprint 8 — 2026-07-06

- `[pending]` **v2 schema 迁移遗留死路由**：Sprint 6 从 v1 schema (learning_steps, episodes.source, episodes.user_id) 迁到 v2 (user_step_progress 桥接、episodes.source_url) 时，Sprint 2/4 老路由未同步更新，Sprint 8 QA 中 3 个 500 (PATCH /api/steps, POST /api/episodes/:id/generate, POST /api/episodes/import) 都是同类问题。→ 教训：schema 迁移 checklist 必须包含"grep 引用旧列名的所有路由并修复或返回友好错误"，作为 Sprint 6 收尾 gate。
- `[pending]` **UI state debounce 只用 React state 不够**：PasteBar 快速三击创建 3 jobs，因 `setSubmitting(true)` 是异步 batch。→ 教训：任何异步提交按钮除 useState 外必须加 useRef 同步屏蔽，Frontend Definition of Done 加此项。
- `[pending]` **前端 fetch 无客户端 timeout 导致移动端 hang**：Frank 手机端 case 3 "fetch 失败" 未知原因，可能与之前 case 2 卡死的请求未 abort 导致 iOS 网络栈短期堵塞相关。加 30s AbortController 后 → 明确 NETWORK_TIMEOUT 反馈。教训：任何跨网络 fetch 必须有 client-side timeout + AbortController 显式取消。
- `[pending]` **BCUT 免费 ASR 稳定性有 HTTP 412 风险**：Sprint 5 spike 10/10 成功但生产偶发 412（WAF/限流）。当前用 retry x3 缓解，但未来长期方案需自建 whisper 或用付费 ASR。已进 Sprint 8 遗留 backlog。
- `[pending]` **BCUT poll UX 卡 20% 感**：poll 每秒但 progress 不动，用户不知道系统还活着。→ 解决方案：每 5s 通过 onProgress 回调更新 job progress + elapsed time 文案。教训：任何 >30s 的后端操作前端必须有"活性指标"（哪怕假装的），不能只用 spinner。

---

## Sprint 10 — 2026-07-06

- `[pending]` **用户开饭前托管授权（--auto 无监督模式）**：Frank 明确"我去吃饭 我回来看"，要求把 PRD + 分析文档剩余需求"彻底完成全部"。→ 教训：`--auto` 模式下用户离开时，Agent 必须：(1) 严格遵循 CLAUDE.md 流程，不省 Story 元数据、AC 勾选、commit trigger；(2) 遇 native config 触发即中止 OTA 推送并写"需 EAS build"标签，绝不冒险；(3) 每个 Story Done 前必须回填 AC 勾选状态，Sprint 10 Story 全被标 Done 但 AC 全空是 Sprint 9 事故后的第二次流程漏洞。→ 上升规则候选：任何 Story 从 Todo → Done 前，Frontend/Backend 必须逐条把 `- [ ]` 勾成 `- [x]`，SM 在 Sprint Review 时逐 Story 复核 AC 完整性。
- `[pending]` **Story Done 但 ACs 未勾（Sprint 10 全部 7 Story）**：Sprint 10 所有 STORY-01001..01007 都在 status 行标记 Done，但 AC checklist 全为 `- [ ]`，代码 diff 与 Story 说明匹配但无勾选审计痕迹。→ 教训：Definition of Done 硬 gate 必须包括"AC 逐条 checkbox = `- [x]`"，QA verdict 也必须核对该 checkbox 状态而不仅仅是"功能存在"。这是可自动化 hook：commit 中修改的 Story 文件若 status=Done 但存在未勾 AC，pre-commit 拒绝。

---

## Sprint 9 — 2026-07-06 (P1 事故 postmortem)

### 事故摘要
**OTA v6 推送后手机 App 冷启动崩溃**。回滚至 OTA v7 止血成功，但 v6 期间用户不可用。

### 根因链（按重要性）

- `[pending]` **CRITICAL: OTA bundle 不能改 native config**：Sprint 9 OTA v6 引入 `app.json` 变更 —— 添加 `plugins: ["expo-notifications"]` + `ios.infoPlist.UIBackgroundModes: ["remote-notification"]`。这些是**构建时** native config，OTA bundle 加载时 native runtime 找不到对应模块 → 启动阶段崩溃。
  → 意义：OTA 只能改 JS bundle，任何 `app.json` 中 `plugins/ios/android/permissions/infoPlist` 变更**必须重 build**。
  → **规则**：`app.json` diff 只要触及 `plugins/ios/android/permissions/infoPlist/newArchEnabled`，Frontend Dev 必须在 Story Notes 中标注"**NATIVE-CHANGE: 需 EAS build**"，SM 在 Sprint Planning Step 0 检查此标签 —— 有则该 Story 必须等 EAS build，不允许 OTA 单独推送。

- `[pending]` **CRITICAL: 静态 import native-only 模块**：`app/_layout.tsx` 顶部 `import { initPushNotifications } from '@/lib/pushNotifications'`，虽然 `initPushNotifications` 内部用 dynamic import 保护 `expo-notifications`，但 top-level import 本身在 iOS runtime 就可能触发模块解析崩溃（`expo-constants` 在极老 build 中的边缘情况）。
  → 意义：任何"下次 build 后才生效"的 native 集成，Frontend 必须**整个模块延后 import**（`await import()` 内部完成），不允许在 root layout 或任何冷启动路径静态 import。
  → **规则**：Frontend Dev 引入新的 native 依赖时，若下 Sprint 或下下 Sprint 才 EAS build，必须封装到 `lib/nativeGuard.ts` 或类似模块，冷启动路径**只**通过 `await import('lib/xxx')` 引用。

- `[pending]` **HIGH: web Playwright QA 对 iOS OTA 安全性无效**：Sprint 9 QA subagent 在 web (localhost:8081) 通过 6/6 ACs PASS，但 web 完全不加载 native module —— crash 路径未覆盖。QA verdict 明确写"true iOS AppState 需 EAS build"，但推 OTA 前未据此判断"是否安全 OTA"。
  → **规则新增（重要）**：OTA-Only Safety Checklist —— 推 OTA 前 SM 必须逐条勾选：
    - [ ] 本次 diff 中 `app.json` 无 `plugins/ios/android/permissions/infoPlist/newArchEnabled` 变更
    - [ ] 本次 diff 中无新增 top-level `import` 依赖 `expo-notifications/expo-camera/expo-av/expo-location/expo-sensors` 等 native module（当前 EAS build 中已链接的除外）
    - [ ] 本次 diff 中无新增 `package.json` native 依赖（devDeps 除外）
    - [ ] 若上述任一勾不上 → **禁止 OTA**，改为等 EAS build
  上述 4 条勾全上 = OTA 安全。任何一条不确定 = 走 EAS build。

- `[pending]` **MEDIUM: 混合推送放大 blast radius**：Sprint 9 一次 OTA 打包 4 个 Story（AppState 修复 + jobId 持久化 + expo-notifications 前端 + backend push）。AppState 修复和 jobId 持久化本身 100% OTA-safe，但和 push 一起推 → push 崩了拖垮全部。
  → **规则**：OTA-safe 修复与需-build 修复**必须分开推**。Frontend 在 Story Planning 时用 `[OTA-safe]` 或 `[需-build]` tag 标注，SM 按 tag 分批打包 OTA。

- `[pending]` **MEDIUM: 未做 canary OTA**：v6 直接推 production 全量。若先推 preview branch 到 SM 手机验证，可避免用户暴露。
  → **建议**（非硬性规则）：所有含 native-adjacent 或新依赖的 OTA 先推 `preview` branch 到内部手机，验证冷启动 OK 后再切 `production`。K0 项目当前只有 Frank 一台测试机 → 优先修 checklist，canary 是补充。

### 结论 — 上升为 CLAUDE.md 规则

**Sprint 10 Retrospective 起 SM 促升以下条目为 CLAUDE.md 硬规则**：

1. `[pending]` **CLAUDE.md §Frontend Dev "Does NOT"** 追加：**Does NOT push OTA including any app.json plugins/ios/android/permissions/infoPlist/newArchEnabled diff — must wait for next EAS build.**
2. `[pending]` **CLAUDE.md §Sprint Review + Demo** 新增 OTA-Only Safety Checklist section（4 条勾选清单，SM 强制在推 OTA 前跑）。
3. `[pending]` **CLAUDE.md §Guardrails No Shortcuts** 追加：**Never push OTA when web QA was the only verification for iOS-specific behavior.**
4. `[pending]` **CLAUDE.md §Verification Enforcement** 追加：iOS 项目 OTA 前 Frontend Dev 必须至少在 web 冒烟 + Story Notes 中显式声明"此 diff 是 OTA-safe（无 native config 变更 + 无新 top-level native import）"。

---

