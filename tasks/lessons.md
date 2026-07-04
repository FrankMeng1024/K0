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
