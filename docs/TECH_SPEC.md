# TECH_SPEC.md — K0

**版本**: v2.0（CR-001 应用后大改：Web → iOS RN+Expo）
**日期**: 2026-07-04
**负责人**: Arch
**变更**: 中期变更需 CR，不可直接编辑

---

## §type

**iOS Native App（React Native + Expo）**

K0 是 iOS App，通过 App Store 发布，TestFlight 内测。App 调用 `api.k0.yiiling.cn` 拿数据。

**为什么不是 Web**（CR-001 变更）：用户明确要做 iOS App，发布 App Store。
**为什么不是纯原生 SwiftUI**：Windows 无 Xcode，且团队已有 Cairn Expo 项目经验。
**为什么 Expo 而不是 bare RN**：Expo 提供 EAS Build 云构建（Windows 也能出 iOS 包）、OTA 更新、开箱即用的原生模块。

---

## §acceptance

`acceptance_mode: auto`

Mode 2 — 自主迭代。Virtual User 在项目完成时做最终验收（评分 ≥ 9.5/10 才算 ACCEPTED）。

---

## §stack

### 移动端 App（前端）
- **React Native 0.76.x**（New Architecture 已启用）
- **Expo SDK 54**（与 Cairn 同版本，便于共用经验）
- **TypeScript 5.x**（严格模式）
- **Expo Router**（file-based routing，替代 react-navigation 手写）
- **NativeWind v4**（Tailwind for RN，与 Cairn 同）
- **Zustand**（state 管理，与 Cairn 同）
- **React Query (TanStack Query)**（服务端状态 + 缓存）
- **expo-font**（加载 Bagel Fat One / Rubik Bubbles / Sniglet / Fraunces Google Fonts）
- **react-native-svg**（用于风格 F 撕纸 SVG 插画 —— 关键，因为 feTurbulence filter 需要 SVG 原生支持）
- **@react-native-async-storage/async-storage**（本地持久化）

### QA / Testing
- **react-native-web**（RN 组件在浏览器渲染，供 QA Playwright 测试）
- **`expo start --web`** 起 web 版
- **Playwright**（QA 主测试工具）
- **Jest + @testing-library/react-native**（单元测试）

### 后端（沿用 Cairn 架构）
- **Node.js 20 LTS**
- **Express 5.x**（与 Cairn 同版本）
- **mysql2**（原生 SQL 驱动，与 Cairn 同 —— 不用 ORM）
- **jsonwebtoken**（JWT auth）
- **zod**（请求参数校验）
- **helmet + cors + express-rate-limit**（安全中间件三件套，同 Cairn）
- **pino**（结构化日志）
- **node-cron**（定时任务：复习提醒队列）

### 数据库
- **MySQL 8**，跑在 `122.51.174.118` 服务器上的 Docker 容器里（与 Cairn 同一主机，不同库）
- 库名：`k0`（生产）、`k0_dev`（开发）
- 用户：新建 `k0_user`（不复用 Cairn 的 `cairn` 用户，隔离权限）
- 内部访问：容器网络 `k0-db:3306`
- 外部访问：SSH 隧道到 `122.51.174.118:3306`（开发本地连）

### 外部服务
- **GLM-4-plus**（智谱 AI）
- **YouTube Transcript**（`youtube-transcript` npm 包）
- **rss-parser**（Apple / Spotify RSS）
- **APNs（Apple Push Notification）**：MVP 后期加，用于复习提醒（可选）

### 关键选择理由

**为什么 Expo + RN 而不是 SwiftUI 原生？**
- 团队现有 Cairn Expo 经验完全可复用
- Windows 也能开发（EAS Build 云出 iOS 包）
- 保留 90% TS/JS 技术资产
- react-native-web 让 QA 可以用 Playwright 测

**为什么 Express + mysql2 而不是 NestJS / Prisma？**
- 沿用 Cairn 完全一样的技术栈，减少心智负担
- K0 数据模型简单（无复杂关联查询、无 ORM 优势场景）
- 手写 SQL + mysql2 更轻量

**为什么部署到 122.51.174.118？**
- 用户已有服务器 + Docker + nginx/caddy 反代已就位
- Cairn 已在同机器跑 `api.yiiling.cn`，加 `api.k0.yiiling.cn` 只需新起一个 docker service
- 零新增运维成本

---

## §viewports

**iOS 设备（App 主目标）**：
- **primary**: iPhone 15 Pro (393 × 852 pt @3x)
- **secondary**: iPhone SE 3rd gen (375 × 667 pt @2x)  ← 最小支持屏幕
- **tertiary**: iPhone 15 Pro Max (430 × 932 pt @3x)
- iPad **不支持**（MVP 不做，Info.plist 声明只支持 iPhone）

**QA Playwright Web 测试视口**：
- **primary**: 393 × 852（iPhone 15 Pro 尺寸模拟）
- **secondary**: 375 × 667（iPhone SE 尺寸模拟）
- 所有 UI 元素在 375 × 667 上不能被截断

**深色模式**：MVP 不做（PRD 明确），但 App 遵循 iOS 系统颜色变量做未来预留。

---

## §performance-targets

覆盖 Performance Standards 默认值（针对移动 App 场景）：

| 指标 | 目标 | 验证方法 |
|------|------|----------|
| App 冷启动到首屏可交互 | < 2500ms（iPhone 15 Pro） | Xcode Instruments |
| API `/health` | < 100ms | curl -w %{time_total} |
| 简单 API（读用户数据、卡片列表） | < 500ms | 功能测试计时 |
| Learn 页面到 Loading 首屏 | < 1500ms | Playwright timing on web |
| AI 学习包生成（GLM-4-plus） | < 60000ms | 后端 timing log |
| 转录抓取（YT 有字幕） | < 45000ms | 后端 timing log |
| feedback_delay（无反馈上限） | 2000ms | QA/UX 交互测试 |
| App 包体积（Expo build） | < 60MB | EAS build log |

---

## §ux-thresholds

- 从任意入口找到目标功能的操作次数上限: **3**
- feedback threshold（无反馈报 UX bug）: **2 秒**
- iOS touch target 最小: **44 × 44 pt**（Apple HIG 硬要求）
- safe area 遵循 iPhone notch/dynamic island

---

## §git

- **strategy**: A（auto，每 Story Done + 每 bug fix Verified 后 commit）
- **branch**: 无 `--branch`，推 `main`（GitHub `https://github.com/FrankMeng1024/K0.git`）
- 每 commit 遵循规范：`<type>(<scope>): <description>`

---

## §deploy

### 移动 App
- **Development**: `expo start` 本地跑 → iOS Simulator（需要 Mac）或 Expo Go（iPhone 上装 Expo Go app 扫码即可，Windows 也能开发）
- **Internal Testing**: **TestFlight**（EAS Build 出 `.ipa` → 上传 App Store Connect → TestFlight 内部/外部测试）
- **Production**: App Store（EAS Submit 提审）
- **Bundle ID**: `com.yiiling.k0`
- **EAS 项目名**: `k0-app`
- **OTA 更新**: Expo Updates（JS 层小改可绕过 App Store 直接推）

### Backend
- **Docker Compose** 起 backend + mysql，跑在 `122.51.174.118`
- **域名**: `api.k0.yiiling.cn`（子域名，与 `api.yiiling.cn` 独立 nginx 站点）
- **反代**: 沿用 Cairn 的 nginx/caddy 配置模式
- **SSL**: Let's Encrypt 自动续期

### QA Web Version（不发布，仅 QA 使用）
- 本地跑 `npm run web`（即 `expo start --web`）
- 端口默认 8081，可用 `--port` 修改
- Playwright 连 `http://localhost:8081` 做测试
- **不部署**到公网

---

## §start-script

**文件名**:
- `scripts/start-app.sh`（启动 RN App 开发模式）
- `scripts/start-web.sh`（启动 react-native-web 模式，QA 用）
- `scripts/start-backend.sh`（启动本地 backend）
- `scripts/start.ps1`（Windows PowerShell 组合入口）

**要求**：
1. 检查 Node ≥ 20（Cairn 用 20，我们对齐）
2. 检查 pnpm 或 npm 已安装
3. 检查 `.env` 存在（无则报错并显示 `.env.example`）
4. `pnpm install` 或 `npm install`
5. 按脚本目标启动服务
6. `start-web.sh` 需额外做 health check（Playwright fit 目标）

**任何检查失败**：打印修复命令并 exit 1。

---

## §test-runner

**文件名**: `scripts/run_tests.mjs`
**读取配置**: `scripts/test.config.json`

**Layer 1（通用，跑在 react-native-web 上）**:
- iPhone SE / iPhone 15 Pro 两个 viewport 首屏截图（0s / 3s / 8s）
- 控制台 error 抓取
- `/health` 响应时间（后端）
- Bundle 大小检查（EAS build report）

**Layer 2（项目专属）**:
读 `test.config.json` 中的 screens / api_checks / data_quality。

---

## §test-config

**文件名**: `scripts/test.config.json`

初始结构：

```json
{
  "web_url": "http://localhost:8081",
  "api_url": "http://localhost:3001",
  "start_web_command": "npm run web",
  "start_backend_command": "cd backend && npm run dev",
  "health_endpoint": "/health",
  "auth_endpoint": "/api/auth/login",
  "auth_token_path": "token",
  "screens": [
    { "name": "home", "path": "/", "selectors": { "learn_btn": "[data-testid=learn-btn]" } },
    { "name": "learn", "path": "/learn", "selectors": { "url_input": "[data-testid=url-input]" } },
    { "name": "review", "path": "/review", "selectors": {} },
    { "name": "library", "path": "/library", "selectors": {} }
  ],
  "api_checks": [
    { "name": "health", "endpoint": "/health", "auth": false }
  ],
  "data_quality": {
    "title_field": "title",
    "check_duplicates": true
  },
  "performance_thresholds": {
    "health": 0.1,
    "api_default": 0.5,
    "web_first_paint": 2.5,
    "feedback_delay": 2.0
  }
}
```

---

## §spike-decision

**Sprint 1 SPIKES（必须做）**:
1. **SPIKE-001**：YouTube 官方字幕抓取（`youtube-transcript`）
2. **SPIKE-002**：Apple / Spotify RSS 抓取
3. **SPIKE-003**：GLM-4-plus 端到端 JSON 生成
4. **SPIKE-004**：`api.k0.yiiling.cn` 新起 Docker + MySQL 隔离部署可行性（沿 Cairn 架构复制）
5. **SPIKE-005**：`react-native-web` + Playwright 集成，能否稳定测 RN 组件（关键 —— QA 依赖）
6. **SPIKE-006**：Expo EAS Build 从 Windows 出 iOS TestFlight 包（用户 Windows 开发，需 EAS 云构建）

六个 Spike 全部 VIABLE 才进 Sprint 2 Feature。

---

## §verification-tool

`playwright` — 标准 MCP Playwright，测 `expo start --web` 起的 react-native-web 站点。

---

## §secrets

`.env`（App 端）必需字段：
```
EXPO_PUBLIC_API_URL=https://api.k0.yiiling.cn
EXPO_PUBLIC_ENV=production|staging|dev
```

`.env`（Backend）必需字段：
```
DB_HOST=k0-db          # container name in docker network, or 127.0.0.1 in dev
DB_PORT=3306
DB_USER=k0_user
DB_PASSWORD=<32+ char>
DB_NAME=k0
GLM_API_KEY=<key>
JWT_SECRET=<32+ char>
CORS_ORIGINS=https://k0.yiiling.cn,http://localhost:8081
NODE_ENV=production|development
PORT=3001
TRUST_PROXY=1
```

`.env.example` 提供占位符，`.env` 严禁 commit。

---

## §data-model summary

见 `docs/DB_SCHEMA.md`。核心表（沿用原 Sprint 0 schema，位置从 Prisma-managed 改为 mysql2 手写 migration SQL）：
- `users`, `episodes`, `transcripts`, `learning_packs`, `snapshots`, `learning_steps`, `concepts`, `cards`, `quizzes`, `actions`, `reviews`

所有业务表都有 `user_id` 外键（MVP 阶段全部指向 `users.id = 1`）。

Migration 用手写 SQL：`backend/migrations/001_init.sql`, `002_xxx.sql`（沿用 Cairn 模式，见 Cairn `backend/docs/DB_SCHEMA.md`）。

---

## §rollout-plan

- **Sprint 0**: 基础设施 + Sprint 1 就位（**已完成大部分，CR-001 应用后需 CP2**）
- **Sprint 1**: 6 个 Spike + 项目骨架 Stories（App + Backend + Playwright web）
- **Sprint 2**: E-001 导入 + E-002 快照
- **Sprint 3**: E-003 学习包 + E-004 学习播放器
- **Sprint 4**: E-005 复习系统 + E-006 Library
- **Sprint 5**: E-007 收尾 + iOS 打磨 + TestFlight 首次外部测试
- **完成 Sprint**: VU 验收（在 iOS TestFlight 版本上）+ App Store 提审准备

---

## §arch-tradeoffs

Sprint Planning 每次都要重新审视：

1. **Expo Managed vs Bare Workflow**: 选 Managed。缺点：无法自定义原生模块（比如深度 iOS 特性）；收益：EAS Build 云构建 + Windows 可开发。
2. **无用户体系 UI vs 全套 JWT**: 选架构预留、UI 隐藏。同 Sprint 0 原方案。
3. **react-native-web vs Storybook Web**: 选 react-native-web，能测端到端流程；缺点是原生 API（推送/相机）在 web 上 mock 掉了，QA 摸不到。用 Playwright + web 覆盖 80% UI 逻辑，剩下 20% iOS 原生行为靠 TestFlight 内测。
4. **单 API endpoint vs GraphQL**: 选 REST（沿 Cairn）。K0 数据模型简单，无 GraphQL 优势场景。

---

## §logging

- 服务端：`pino`（JSON 结构化日志），与 Cairn 同
- 客户端：`console.error`（RN dev）+ Sentry（Sprint 4 后引入，MVP 不做）
- AI 调用日志：每次 GLM 调用记录 model / input tokens / output tokens / cost / latency

---

## §platform-notes（iOS 专属）

- **Safe Area**: 用 `react-native-safe-area-context` 处理 notch / dynamic island / home indicator
- **Font 加载**: `expo-font` 预加载 4 个 Google Fonts；用 `<AppLoading>` 或 SplashScreen 遮盖直到字体就绪
- **Touch feedback**: 用 `Pressable` 而不是 `TouchableOpacity`（更新 API）
- **Haptics**: `expo-haptics` 在关键动作（学习完成、卡片收藏）加轻震动
- **Keyboard**: `KeyboardAvoidingView` + `keyboardShouldPersistTaps` 处理输入框
- **App Store 审核关键**:
  - 隐私政策 URL（提审前必须有）
  - 数据收集声明（App Privacy 表格）
  - 首次启动权限请求要有明确说明
  - 不能有半成品或"敬请期待"按钮
