# K0 下次 EAS Build 补漏清单 (v2)

生成日期：2026-07-07
上次 build：iOS buildNumber = 2（TestFlight 首发, ac45db0 `chore(deploy)`）
上次 build 后所有 Sprint 全部走 OTA（Sprint 5-14 累计 v1-v23）。

## Overview

| 项 | 值 |
|---|---|
| 当前 app version | 0.1.0 |
| 当前 iOS buildNumber | 2 |
| 建议下次 iOS buildNumber | 3（eas.json 已配 `autoIncrement: buildNumber`，会自动 +1） |
| Android versionCode | 未在 app.json 显式设置（EAS 自动分配，首次 build 时确认） |
| runtimeVersion 策略 | `{"policy": "appVersion"}` = 0.1.0（**不建议本次改 app version**，否则老 build 失去 OTA 兼容） |
| newArchEnabled | true（已开，需验证所有新增 native 库兼容） |
| Expo SDK | 57.0.2 |

**核心影响 native binary 的改动数**：3 项强制 + 2 项建议 + 3 项延后。

---

## 强制加进本次 build（Build 前必装 / 必配）

| 功能 | 依赖变化 | app.json / Info.plist 变化 | 说明 |
|---|---|---|---|
| **图片上传（Debug）** | `npx expo install expo-image-picker` | +plugin `["expo-image-picker", { photosPermission: "K0 需要访问相册以上传调试截图" }]`；iOS 自动生成 `NSPhotoLibraryUsageDescription` | `components/DebugUploadZone.tsx` 已 import `expo-image-picker` 但 package.json 未列，运行时会崩。Sprint 14 R3 已规划。 |
| **音频回放（expo-av）** | `npx expo install expo-av` | 若需 iOS 后台音频 → +`ios.infoPlist.UIBackgroundModes = ["audio"]` + plugin `["expo-av", { microphonePermission: false }]` | `lib/audioPlayer.tsx` 已 require `expo-av`（try/catch），native 端未装会静默降级。Sprint 15 音频 demo 强依赖。**当前代码 `staysActiveInBackground: false`，暂不需要 UIBackgroundModes**——先不加 background mode，AppStore 审核更简单。 |
| **推送通知（expo-notifications）** | 依赖已在 package.json（`^57.0.3`）**但 Sprint 9 事故后 `app.json.plugins` 里没配** | +plugin `["expo-notifications", { icon: "./assets/notification-icon.png", color: "#ffffff" }]`；iOS 自动申请 APNs entitlement | `lib/pushNotifications.ts` + `_layout.tsx` 已回退，等 build 激活。**Frank 需在 Apple Developer 后台确认 APNs Key + Push Notifications capability 已开**（eas.json 中 appleTeamId=X72DH2T8QR）。 |

---

## 建议加进本次 build（顺便优化，不加也能过）

| 功能 | 依赖变化 | 收益 | 风险 |
|---|---|---|---|
| **Expo SDK 依赖对齐** | 跑 `npx expo install --check`，把版本漂移的 `expo-*` 库统一到 SDK 57 精确匹配 | 消除 native 编译警告，避免运行期奇怪崩溃 | 低。只更新 minor/patch。 |
| **`expo-av` → `expo-audio` 迁移评估** | 保留 expo-av（deprecated 但 SDK 57 仍可用），或改用 `expo-audio` + `expo-video` | expo-av 在 SDK 58 会被移除；提前切换省一次 build | 中。API 不完全兼容，`lib/audioPlayer.tsx` 需重写。**建议：本次先装 expo-av 保守出货，下次 build 前再评估**。 |

---

## 可延后（下次 build 再加）

| 功能 | 理由 |
|---|---|
| Universal Links / Apple Podcasts 深链 | Frank 现在的 PasteBar 从系统剪贴板读 URL 已够用，Universal Links 是锦上添花。需 apple-app-site-association 后端文件 + entitlement，工作量大。 |
| App Clip | K0 是"付费一次装 App"模式，App Clip 目前无场景。 |
| Widget / Live Activity | PRD Should-Have 之外。 |
| Camera（`expo-camera`）拍照上传 | DebugUploadZone 只用相册即可覆盖；若未来加"OCR 讲义"再上。 |
| Location / Sensors / HealthKit | K0 与位置/健康无关。 |

---

## 需要 Frank 决策

1. **Push notification icon**：需要一张 96×96 白色透明 PNG（Android 通知 status bar 图标）。若不提供，Android 会显示默认 Expo 图标。
2. **NSPhotoLibraryUsageDescription 文案**：AppStore 审核会读，建议短句直白："K0 需要访问相册以上传调试截图"。中文用户也 OK，Apple 审核不强制英文。
3. **是否升 app version 0.1.0 → 0.2.0**：
   - **不升**（推荐）：runtimeVersion 仍为 0.1.0，所有已发 OTA（v1-v23）继续对老 build 生效，新 build 也能收到——**平滑过渡**。
   - **升到 0.2.0**：老 build 无法收到新 OTA（runtimeVersion 不匹配），必须通过 TestFlight 强制升级。**除非要断掉老 build，否则不建议**。
4. **iOS/Android 同步 build，还是仅 iOS**：Frank 之前只发 iOS TestFlight，Android 迄今没走过。若要同步 build，需先 `android.versionCode`（首次 EAS 会自动分配）+ 打包体积翻倍时间。
5. **是否顺便打 preview simulator build**：方便本地 Xcode Simulator 装，`eas build --profile preview --platform ios`。

---

## SDK 与依赖健康检查

- [ ] **必跑**：`cd C:\ClaudeCodeProjects\K0 && npx expo install --check`
  - 输出会列出所有版本漂移的 expo-* 库，一次性 `npx expo install --fix` 修正
- [ ] **必跑**：`npx expo-doctor` 看是否有 metro/react-native 配置问题
- [ ] **确认 New Architecture 兼容**：`newArchEnabled: true` 已开。SDK 57 下所有官方 `expo-*` 库都兼容（含 expo-image-picker / expo-av / expo-notifications）。
- [ ] **expo-av deprecation warning**：SDK 57 里 `expo-av` 仍完整可用，只在 console 打警告，不影响审核和运行。
- [ ] **react-native-svg 15.15.4**：已在 package.json，无需重新安装，无 native 变化。
- [ ] **react-native-screens 4.25.2 / safe-area-context 5.7.0**：已链接，无需 build。
- [ ] **expo-updates 57.0.6**：runtimeVersion 策略保持 `appVersion`，本次 build 后 v24+ OTA 才对新 build 生效。**旧 build 的 OTA 通道自动止步于 v23**（因新 build 用同 appVersion 0.1.0 会覆盖）——若不希望覆盖，本次 build 前先把 app version 改成 0.1.1（决策 3）。

---

## iOS Info.plist 权限清单

| Key | 是否需要 | 值 | 触发场景 |
|---|---|---|---|
| `NSPhotoLibraryUsageDescription` | **必需** | K0 需要访问相册以上传调试截图 | expo-image-picker 自动注入（配 plugin 后） |
| `NSMicrophoneUsageDescription` | 不需要 | — | 未启用录音；expo-av plugin 加 `microphonePermission: false` 显式关闭 |
| `NSCameraUsageDescription` | 不需要 | — | 未启用相机 |
| `NSUserNotificationsUsageDescription` | 不需要（iOS 自动） | — | expo-notifications 走系统 APNs 权限弹窗，不用手写 |
| `UIBackgroundModes` (audio) | 不加 | — | 当前 `staysActiveInBackground: false`，锁屏即停，符合"轻量播客片段试听"场景，也避开 Apple 审核对后台音频的额外考察 |
| `ITSAppUsesNonExemptEncryption` | 已设 = false | ✅ | 无变化 |

---

## Android Manifest permission 清单

| Permission | 是否需要 | 说明 |
|---|---|---|
| `READ_MEDIA_IMAGES` | **必需** | expo-image-picker plugin 自动加 |
| `POST_NOTIFICATIONS` | **必需**（Android 13+） | expo-notifications plugin 自动加 |
| `RECORD_AUDIO` | 不需要 | 无录音场景 |
| `INTERNET` | 已默认 | Expo default |

---

## AppStore 审核风险清单

| 风险 | 严重度 | 处置 |
|---|---|---|
| **DebugUploadZone 在生产 build 里可见**（3-tap version 触发） | Medium | 建议 `__DEV__` 或 `EXPO_PUBLIC_ENABLE_DEBUG_UPLOAD` 门控。**Frank 决策：保留还是隐藏？** 若不隐藏，需在 App Review Notes 里明确"隐藏调试功能，通过在首页 3-tap 版本号触发，仅内部使用"。 |
| **图片上传后端 `/api/debug/upload` 未鉴权** | Medium | 生产 backend 若允许匿名任意上传 = 潜在滥用风险。审核方可能不测，但迟早出事。**建议加 anonymousId + rate limit**。 |
| **隐私政策 URL** | Low | 若引入 push notifications + image upload，隐私政策需覆盖"我们会收集图片、推送 token"。Apple 审核会检查隐私"营养标签"（App Privacy）。**Frank 需在 App Store Connect 更新 App Privacy 声明**。 |
| **expo-notifications iOS 权限弹窗时机** | Low | 当前代码：只在用户触发"开始学习"后 `requestPermission: true` 才弹（避免冷启动骚扰）。审核友好。 |
| **NSPhotoLibraryUsageDescription 文案** | Low | 太笼统会被拒。写清晰用途（见上）。 |
| **audio_url 播放外链** | Low | 播小宇宙/Apple Podcasts CDN 音频，无本地下载，非用户上传内容——审核安全。 |

---

## 具体 EAS build 命令

```bash
# 1. 装依赖（必需）
cd C:\ClaudeCodeProjects\K0
npx expo install expo-image-picker expo-av
# expo-notifications 已在 package.json，不用重装

# 2. 检查版本漂移（必需）
npx expo install --check
# 若有 warning，跑：
npx expo install --fix

# 3. 编辑 app.json，加 plugins（Frank 确认后手动改）
# plugins: [
#   "expo-router",
#   "expo-font",
#   "expo-splash-screen",
#   "expo-updates",
#   ["expo-image-picker", { "photosPermission": "K0 需要访问相册以上传调试截图" }],
#   ["expo-av", { "microphonePermission": false }],
#   ["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#ffffff" }]
# ]

# 4. iOS build + 自动上传 TestFlight（Frank 授权后运行）
eas build --profile production --platform ios --auto-submit

# 或不自动 submit：
eas build --profile production --platform ios

# 5. 若同步做 Android
eas build --profile production --platform android
```

**预计 build 时间**：iOS m-medium ~15-25 分钟。

**buildNumber 递增**：`eas.json` 已配 `autoIncrement: buildNumber`，本次会自动变成 3。**无需手动改 app.json**。

---

## Rollback 方案

1. **TestFlight 层面**：新 build 出问题，App Store Connect 后台把 build 3 从 TestFlight 内测组撤下，用户重启 App 会自动回到 build 2。
2. **OTA 层面**：若 build 3 装上后有 JS 崩溃，`eas update --branch production --message "revert"` 推一版 fixed JS（老 build 2 也能收到，因 runtimeVersion 保持 0.1.0 不变）。
3. **紧急回退**：`app/_layout.tsx` 已保留 expo-notifications 静态 import 的回退注释，若新 build 又崩，OTA 推一版把 initPushNotifications 调用注释掉即可，无需再 build。
4. **本地检查点**：build 前打 tag `git tag pre-build-v3-2026-07-07`，出问题 `git checkout` 回退代码 + 重推 OTA。

---

## 本次 build 建议范围（一句话总结）

**本次 build = expo-image-picker + expo-av + 激活 expo-notifications 三件套 + 顺手 `npx expo install --check` 对齐 SDK 57 依赖；iOS buildNumber 自动升到 3，app version 保持 0.1.0 不变以维持所有已发 OTA 对老 build 的兼容。**
