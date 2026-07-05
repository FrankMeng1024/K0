# K0 TestFlight 首发 + OTA 部署指南

**目标**：把当前 K0 iOS 版本推到 TestFlight，让 Frank 在真实 iPhone 上试用；之后 Sprint 5+ 的 JS/资产改动可以通过 Expo OTA 直接推送到已装机的 App，无需每次上传 App Store。

**Sprint 4 完成时间**：2026-07-05
**版本**：0.1.0 (buildNumber 1)

---

## 已经就绪的（我已经做完）

- ✅ `expo-updates` npm 依赖已安装（`~57.0.6`）
- ✅ `app.json` 加了 `runtimeVersion.policy: "appVersion"` + `updates.url` 占位 + `plugins: [..., "expo-updates"]`
- ✅ `app.json` iOS `infoPlist.ITSAppUsesNonExemptEncryption: false`（避开 App Store 出口合规单独填写）
- ✅ `eas.json` 建好（development / preview / production 三个 profile，production 自动递增 buildNumber）
- ✅ bundleIdentifier: `com.yiiling.k0`
- ✅ Sprint 4 UX Polish 全部完成，QA/UX verdict PASS，适合作为首个内测版本

---

## 你醒来后要做的（一步步、共 6 步）

**前置条件**：
- 你有 Apple Developer Program 账号（$99/年）— App Store Connect 登录
- 你有 Expo (EAS) 账号 — 免费也够用（每月 30 次 iOS build 额度）
- 电脑上安装了 Node 20+，`npm i -g eas-cli`

### 步骤 1 — 登录 EAS

```bash
cd C:/ClaudeCodeProjects/K0
eas login
```

浏览器打开、Expo 账号密码登录，回到 terminal 应显示 `Logged in as <username>`。

### 步骤 2 — 初始化 EAS 项目

```bash
eas init
```

会提示选择 Expo 账号 → 创建新项目（用现有 slug `k0`）→ 终端会显示新的 `projectId`（形如 `abc12345-def6-7890-...`）。

**把这个 projectId 替换到 `app.json` 两处**：
- `expo.updates.url`: `https://u.expo.dev/{projectId}`
- `expo.extra.eas.projectId`: `{projectId}`

（或直接用 `eas init` 让它自动写入。）

### 步骤 3 — 填 eas.json 的 submit credentials

编辑 `eas.json` 里的 `submit.production.ios`：
- `appleId`: 你的 Apple 开发者 email
- `ascAppId`: App Store Connect 创建 K0 app 后拿到的 App ID（数字串）
- `appleTeamId`: 你的 Apple 开发者 Team ID（App Store Connect → Membership 可看到，形如 `ABC1234567`）

**如果 K0 还未在 App Store Connect 创建 app**：
1. 登录 https://appstoreconnect.apple.com/
2. My Apps → + → New App
3. Platform: iOS，Name: K0，Primary Language: 简体中文
4. Bundle ID: `com.yiiling.k0`（必须与 app.json 一致）
5. SKU: 随意（如 `K0-001`）
6. 创建后记下 ascAppId（URL 里 `/apps/{id}/`）

### 步骤 4 — 首次 iOS Build（云端构建约 15-20 分钟）

```bash
eas build --platform ios --profile production
```

首次会问一系列问题：
- Bundle Identifier 确认 → yes
- Would you like to generate a new Apple Distribution Certificate? → **yes**（EAS 自动帮你管证书）
- Would you like to generate a new provisioning profile? → **yes**
- Login Apple ID: 输入 → 短信/密码验证

Build 提交到 EAS 云。你可以等（terminal 会显示进度），也可以直接去 https://expo.dev/accounts/{username}/projects/k0/builds 看。

构建完成后终端会给你一个 `.ipa` 下载链接。

### 步骤 5 — 上传到 TestFlight

```bash
eas submit --platform ios --profile production --latest
```

会自动把刚 build 的 `.ipa` 上传到 App Store Connect。上传过程约 5-10 分钟，之后 Apple 会自动 processing（15-30 分钟）。

处理完毕后：
1. 打开 App Store Connect → K0 → **TestFlight** tab
2. 应看到 Build 1 出现，标记 "Ready to Test"
3. Internal Testing → 添加你自己（Apple ID）作为 Internal Tester
4. 手机装 TestFlight app（App Store 免费下载）→ 用同一 Apple ID 登录 → K0 会自动出现

### 步骤 6 — 后续 OTA 更新（Sprint 5+ 直接推送）

**任何 JS/图片/资源改动**（TypeScript、样式、SVG 组件、theme 等）都能通过 OTA 推送，用户下次打开 App 就自动更新，不用重新上 App Store：

```bash
# Sprint 5 开发完，一条命令推 OTA：
eas update --branch production --message "Sprint 5 更新描述"
```

**注意 —— 需要 rebuild + 重上 TestFlight 的场景**（不能 OTA）：
- 新增/删除 native 依赖（如加 `react-native-camera`）
- 修改 `app.json` 的 iOS `infoPlist`、`plugins`、bundleIdentifier 等 native 配置
- 修改 Apple entitlements
- 升级 Expo SDK（如 SDK 57 → 58）

其他一切改动 —— UI 优化、bug 修复、文案改动、GLM prompt 调整、backend 改（backend 独立部署不受影响）—— **全部 OTA 就够**。

---

## 常见问题

**Q: eas build 报错 "Missing Apple Distribution Certificate"**
A: 让 EAS 自动生成即可（步骤 4 问的第一个 yes/no 答 yes）

**Q: TestFlight 说 "Missing Compliance"**
A: 我在 app.json 已加 `ITSAppUsesNonExemptEncryption: false`，如果 App Store Connect 仍要求填 export compliance，选 "No, my app does not use encryption"。

**Q: buildNumber 冲突（Version already exists）**
A: `eas.json` production profile 已设 `autoIncrement: "buildNumber"`，会自动递增。如手动想设，编辑 app.json 的 `ios.buildNumber`（每次上传必须+1）。

**Q: OTA 更新用户不见更新**
A: 检查 (1) app 是关闭再重开的（App 打开时 checkAutomatically: 'ON_LOAD' 才触发检查），(2) runtimeVersion 一致（我用 `appVersion` policy —— 只要 `version: 0.1.0` 不变，所有 OTA 都能推到当前用户）。

**Q: 我想让 Frank 本人先内测，别人别看到**
A: TestFlight 默认就是 Internal Testing (最多 100 人，都必须是你 App Store Connect 团队里的用户)。Public link testing 需要单独启用，Sprint 5 之前不用管。

---

## 完成 TestFlight 首发后的下一步

1. Frank 在 iPhone 上打开 K0，验收整体体验（Sprint 3+4 全部功能）
2. Frank 记录任何"手感/美术/交互"层面的观感 → 反馈给我 → Sprint 5 backlog
3. 之后我做 Sprint 5，做完 `eas update --branch production` 一秒推送，Frank 手机上重新打开 App 就是新版本

---

## 附录：现在项目本地状态

- Sprint 4 完成 commit（local，push 因 GFW 阻塞暂未推 GitHub）
- 所有 QA/UX evidence 归档在 `docs/qa/sprint4-evidence/`
- backend 独立跑在 `api.k0.yiiling.cn`（TECH_SPEC 定义）——生产环境 App 打包时会连这里，本地开发时连 localhost:3002
- **App 要连生产 backend 前**，请确认 `lib/api.ts` 里的 base URL 或环境变量已配好（Sprint 5 我会加 build-time env 切换）
