# EAS Build Risk Review

**审阅角色**：Risk Reviewer（4-eyes review 环节 4/4，最后一只眼）
**日期**：2026-07-07
**上下文**：Frank 明确"只 build 这一次"—— 失败零容忍。前 3 眼（Product / Architecture / QA）已过。本审阅从"能让 build 失败 / AppStore 拒审 / 用户升级后崩溃 / 老 build 无法回滚"的角度独立挑刺。
**历史事故基线**（git log 已核）：
- `a537e04 chore(v24)`：回退 expo-image-picker plugin —— "未装依赖会崩 OTA，保留 permission 声明供下次 EAS build"。**这条 hotfix 就是最近的一次事故**，说明 K0 已经踩过一次"plugin 声明了但依赖没装"的坑。
- `7df8f2d fix(sprint9)`：OTA v6 崩溃 → v7 回退 push init。**expo-notifications 曾经把 app 干崩过一次**，Sprint 9 才回退。本次 build 是它的第二次复活尝试，风险叠加。
- Frank OTA 已推到 v24，全部 targeting runtimeVersion=0.1.0。

---

## Verdict

**PASS_WITH_MITIGATIONS**

允许 build，但**必须** Frank 先决策 6 个必答问题（见文末），并落实 12 项 mitigations（见 Risk Matrix）。任何 1 项未落实 = **不允许 build**。

---

## Risk Matrix

| # | Risk | Severity | Probability | Mitigation | Owner |
|---|------|----------|-------------|-----------|-------|
| R1 | **runtimeVersion 断层 + OTA 灾难**：manifest 说 version 0.1.0→0.2.0，policy=appVersion，则 runtimeVersion 从 "0.1.0" 变 "0.2.0"。已发出的 **OTA v1-v24 全部 targeting 0.1.0**——新 build 3 (v0.2.0) 出厂时 **拉不到任何 OTA**，只跑打包内 JS。同时老 build 2 用户还能继续吃 v1-v24。**这是设计上的意愿**（切干净），但要 Frank 明确接受。 | **H** | **H**（必然发生） | (a) build 前把最新 OTA 内容 merge 进 main branch 打包；(b) build 完成后**立即**发一条 targeting 0.2.0 的 OTA v25 作为 "welcome baseline"；(c) 文档明写"v0.1.0 用户升级到 v0.2.0 后不吃任何老 OTA"。 | Frank / Claude |
| R2 | **plugin 声明 vs 依赖未装再次爆发**：a537e04 已踩过。Manifest 要装 14 个 native 依赖 + 加 5 个 app.json plugin。**任意 1 个 plugin 声明但 npm 装错版本或漏装 = OTA 拉下来直接 white screen**。Skia + Reanimated + Lottie 都属高危。 | **H** | **M** | (a) `npx expo install --check` 必须 0 outdated；(b) `npx tsc --noEmit` 必须 0 error；(c) 每加一个 plugin 前先本地 `npx expo prebuild --clean` 看 iOS/Android podspec 是否生成成功；(d) build 完成后**先跑 preview profile** 不 auto-submit，装到 Frank 手机验证过再 submit production。 | Frank / Claude |
| R3 | **App Privacy Manifest 缺失导致拒审**：iOS 17+ 要求 `PrivacyInfo.xcprivacy` 覆盖所有 API 调用（NSUserDefaults、FileTimestamp、SystemBootTime、DiskSpace）。K0 目前 **未提供**该文件。Expo SDK 54+ 会自动生成基础 manifest，但如果自定义 native 依赖（Skia、Lottie）没有各自的 `PrivacyInfo.xcprivacy` bundle，Apple 从 2024-05-01 起 **审核阶段直接拒**。 | **H** | **M** | (a) 确认 Skia 2.2.x / Lottie / Reanimated / Blur / MediaLibrary 都已带 PrivacyInfo；(b) 在 EAS build log 中 grep "PrivacyInfo" 确认生成；(c) 若被拒，Frank 手动加 `ios.privacyManifests` 到 app.json；(d) **本次不装 expo-media-library**（隐私营养标签需要"App Data Not Linked to User"分类，配置错就拒）。 | Frank |
| R4 | **UIBackgroundModes: audio 触发严格审核**：Apple 对声明"后台播放音频"的 App 要求"合理理由"。K0 目前场景是"点 timestamp 听 30-90s 片段"——**不是长音频播客**，Product review 也建议 `staysActiveInBackground: false` + 不加 UIBackgroundModes。**但 manifest 里明确加了** `"UIBackgroundModes": ["audio"]`。审核员会追问：为什么需要后台音频？回答不好 = 拒审。 | **H** | **M** | **删掉 `UIBackgroundModes: ["audio"]`**。Product review 也同意锁屏即停符合场景。如 Frank 坚持要，需准备"后台音频合理性说明"提交 App Review Notes（"用户在 SRS 复习流程中锁屏也需听完当前 30 秒片段"），有 30% 概率被拒。 | Frank |
| R5 | **DebugUploadZone 在生产可见**：3-tap 版本号 → 上传面板。TestFlight 用户是随机内测者，一旦有人发现调用 `/api/debug/upload` 匿名接口 → **上传任意图片消耗后端存储 + 可能被上传 NSFW 触发 App Store 内容审核**（如果上传功能可被"发现"）。Product review 已经 flag Critical。 | **H** | **L**（发现门槛 = 3 tap on version 需 debug 面板知识） | (a) Frontend gate：`__DEV__ \|\| EXPO_PUBLIC_ENABLE_DEBUG_UPLOAD === 'true'`，production profile 不设该 env；(b) Backend `/api/debug/upload` 加 `EXPO_PUBLIC_ANON_ID` header 校验 + rate limit（10/hour/IP）；(c) 或者更激进——**本次不装 expo-image-picker**（Product review 首推方案）。 | Frank / Claude |
| R6 | **associatedDomains 未上线 apple-app-site-association**：manifest 加 `"applinks:api.k0.yiiling.cn"`。Universal Link 需 `https://api.k0.yiiling.cn/.well-known/apple-app-site-association` 返回正确 JSON（`applinks.details[].appIDs`）。**没上线 = build 装到手机后点外链回 K0 不生效**（不崩，但功能死）；更严重的是 **iOS 会 cache 失败结果**，即使后来上线也需重装 App 才生效。 | **M** | **H** | (a) build 前 Frank 部署 AASA 文件到后端；(b) 用 `curl https://api.k0.yiiling.cn/.well-known/apple-app-site-association` 确认返回 200 + `Content-Type: application/json`；(c) 若时间紧，**本次不加 associatedDomains**，等 AASA 准备好再单独 OTA 加（AASA 是 config plugin 层，OTA 加不了—— 得等下次 build）；**更稳的选择：删掉 associatedDomains，本次不承诺 Universal Link**。 | Frank |
| R7 | **Skia + Reanimated + New Arch podspec 冲突**：SDK 57 + New Arch 下 Skia 2.2.12（Cairn 生产版）应能跑，但 Reanimated 4.x 与 worklets-core 有 peer 依赖，`react-native-worklets` 若未显式装，metro bundle 阶段可能报 "cannot find module 'react-native-worklets'"。Arch review 也 flag 了 Reanimated missing peer 风险。 | **M** | **M** | (a) build 前 `npx expo install react-native-reanimated react-native-worklets`；(b) `babel.config.js` 加 `'react-native-worklets/plugin'`（**必须放数组最后一位**）；(c) 本地跑 `npx expo prebuild --clean && npx expo run:ios` 冒烟 —— 不崩才 EAS build。 | Frank / Claude |
| R8 | **Bundle size 超限**：AppStore iOS 单个 IPA 上限 4GB（cellular download 200MB），但用户下载体验超过 150MB 会有"仅 WiFi"警告。Skia (~15MB) + Lottie (~5MB) + expo-av (~3MB) + Reanimated (~4MB) + Blur + MediaLibrary + 其余 = **native binary 约新增 30-40MB**。**K0 目前 IPA 未测**，若原 build 2 已 60MB，加完新依赖可能超 100MB。 | **M** | **M** | (a) build 完成后先看 EAS artifact size；(b) 若 > 100MB，考虑本次砍掉 lottie-react-native（Lottie 5MB，可用 Skia 或 CSS 替代）；(c) App Store Connect 上传前 check `.ipa` 大小。 | Claude |
| R9 | **iOS Deployment Target 冲突**：Skia 2.2.x 要求 iOS 13+；Reanimated 4.x 要求 iOS 13.4+；expo-av 要求 iOS 13+。K0 目前 app.json **未显式声明 `ios.deploymentTarget`**，Expo SDK 57 默认应该是 15.1+，安全。**但如果某个 native 依赖 pod 内声明了 iOS 12**，pod install 阶段会报警告。 | **L** | **L** | (a) build log 中 grep "deployment target" 确认；(b) 若冲突，app.json 加 `"ios": { "deploymentTarget": "15.1" }`。 | Claude |
| R10 | **iOS buildNumber 冲突**：`buildNumber: "3"` **不能重复**已提交过的 build（build 2 已在 TestFlight）。若之前有 build 3 的失败尝试，App Store Connect 会拒。 | **M** | **L** | (a) `eas.json` 已配 `autoIncrement: "buildNumber"`—— 会自动跳到下一个可用值，OK；(b) build 完成后确认最终 buildNumber。 | Claude |
| R11 | **APNs 证书未配 → 推送 build 装完后 register 失败**：expo-notifications 恢复后需要 iOS APS 证书在 Apple Developer Portal 里 valid + `expo credentials` 已上传 push key。Sprint 9 的 v6 崩溃**根因就是 push init 阶段没兜住**。**如果 APS key 过期，getExpoPushTokenAsync 会 throw**，若 catch 不周 → 白屏。 | **H** | **M** | (a) `eas credentials --platform ios` 检查 Push Key 状态；(b) `lib/pushNotifications.ts` 的 init 必须**全 try/catch**（Sprint 9 已改过，需 QA 再确认）；(c) init 失败**不 block app 启动**，UI 侧留 "推送暂不可用" 兜底提示。 | Frank / Claude |
| R12 | **npm registry / package hash 不锁**：`package-lock.json` 存在（已核），但如果 Frank build 前 `rm -rf node_modules && npm install`，会重新解析 dep tree。**Skia / Reanimated / Lottie 都是大版本活跃维护，可能引入 breaking**。 | **L** | **L** | (a) build 前**不删** `node_modules`，只跑 `npx expo install` 加新的；(b) 若必须清，用 `npm ci`（严格按 lock 装）。 | Claude |

---

## AppStore 审核前置清单

**Frank 必须逐项确认后才能 build → submit**：

- [ ] **隐私政策 URL**：K0 有没有公开的 privacy policy URL？App Store Connect 里 App Privacy 页面**必填**。当前若未配 → 拒审。
  - 检查方法：登录 App Store Connect → K0 → App Privacy → "Privacy Policy URL"
  - 若无：建议临时用 GitHub Pages 或后端 `https://api.k0.yiiling.cn/privacy` 挂一份 markdown 页面
- [ ] **App Privacy Nutrition Label**：需覆盖：
  - [ ] "Photos or Videos" — 因 expo-image-picker + expo-media-library
  - [ ] "User ID" or "Device ID" — 因 anonymousId + expo push token
  - [ ] "Audio Data" — expo-av 不主动收集 audio 数据（仅播放），但如果被审核员追问要说明
- [ ] **推送 APS 证书**：`eas credentials --platform ios` 查 Push Key 状态 valid
- [ ] **apple-app-site-association**：若保留 `associatedDomains` → 后端 `https://api.k0.yiiling.cn/.well-known/apple-app-site-association` 必须返回 200 + 正确 JSON + Content-Type=application/json
- [ ] **App Review Notes**：build submit 时填写：
  - "K0 是学习类 App，用户上传播客链接后系统生成学习包"
  - "本次新增功能：音频片段回放（expo-av）+ 复习提醒推送（expo-notifications）"
  - "Debug 图片上传功能仅内部测试用，生产用户不可见"
  - 若保留 UIBackgroundModes：补一句后台音频合理性
- [ ] **Bundle size**：build artifact < 150MB
- [ ] **Debug 功能 gate**：TestFlight 用户不能通过任何路径触发 `/api/debug/upload`
- [ ] **中国大陆合规**：K0 backend 在国内 122.51.174.118 → 数据不出境 ✅ 但 App Store Connect 需勾选"数据主要在中国境内处理"

---

## Build 失败预防

**顺序执行、任何一步失败停 → 不 build**：

1. `git status` 干净 或 stash 掉未提交更改
2. `git clean -fdx ios/ android/`（清残留 native 目录，虽然 `ls` 已确认无，但保险起见）
3. `npx expo install expo@~57.0.4 expo-router@~57.0.4`（SDK 对齐，Arch review 强制项）
4. `npx expo install expo-av expo-notifications expo-image-picker expo-image-manipulator expo-media-library expo-sharing expo-blur expo-clipboard expo-web-browser expo-linear-gradient react-native-reanimated react-native-gesture-handler react-native-worklets lottie-react-native @shopify/react-native-skia`
   - **注意加了 `react-native-worklets`**（Arch review Risk 7 遗漏）
5. `npx expo install --check` → **必须 0 outdated**
6. app.json 变更（严格按 manifest）**但**：
   - **删掉** `"UIBackgroundModes": ["audio"]`（R4）
   - **考虑删掉** `associatedDomains`（R6，如 AASA 未准备好）
   - 若 Frank 决定不装 expo-image-picker（R5 首推方案）：从 plugins 数组去掉 `expo-image-picker`，`infoPlist` 保留 `NSPhotoLibraryUsageDescription` 供下次 build
7. app.json bump：`version: "0.2.0"` + `ios.buildNumber` 由 EAS autoIncrement 处理（当前 "2" → 会跳 "3"）
8. `npx tsc --noEmit` → 0 error
9. `babel.config.js` 加 reanimated + worklets plugin（Reanimated 4.x 必需）
10. 本地 `npx expo prebuild --clean` → 看 iOS/Android 生成的 podspec 无 conflict
11. **本地 iPhone / Simulator 冒烟** `npx expo run:ios`（不是 web 也不是 Expo Go）
   - 加载首页 → 点音频 → 请求推送权限 → 若都不崩 → 允许 EAS build
12. **先 build preview profile**（`eas.json` 已配 `distribution: internal`），不 auto-submit：
   - `npx eas build --platform ios --profile preview`
   - 装到 Frank 手机 → 完整跑一遍
13. **preview 通过后**才 `npx eas build --platform ios --profile production`
14. Production build 完成 → **不立即 submit** → TestFlight 内测 build → 再验一次 → 最后 submit

---

## 用户体验风险

### 权限对话框顺序建议

首次启动 App 会连续弹多个权限对话框，用户体验灾难。K0 需**按需**弹：

| 权限 | 何时弹 | 现状 |
|---|---|---|
| 推送 | 用户首次到达"复习提醒设置"页面时 | Sprint 9 代码是启动时弹 → **必须改成 opt-in** |
| 相册 | 用户点"3-tap version → 上传图片"时 | ✅ 现在就是按需 |
| 后台音频 | 若保留 UIBackgroundModes → 系统自动，不弹 | 建议删掉 |
| 分享（expo-sharing） | 用户点"分享"按钮时 | ✅ 系统 sheet 自动 |

**Mitigation**：`lib/pushNotifications.ts` init 阶段**不调用** `requestPermissionsAsync`，只 register token。真正的权限请求延迟到用户主动打开复习提醒设置。Sprint 9 代码需 Frontend 修改。

### 首次启动 Loading

14 个 native 依赖 cold start 会拉长启动时间。RN + Fabric 冷启动约 1.5-2.5s，加上 Skia + Reanimated 初始化 native module 可能到 3-4s。**expo-splash-screen 已装**，Mitigation：
- `SplashScreen.preventAutoHideAsync()` 已在 `_layout.tsx`
- `SplashScreen.hideAsync()` 时机延迟到首页首帧渲染后
- 目标：用户看到"K0 logo splash"直到首页出来，中间无白屏

---

## Rollback 应急预案

**场景 A — build 阶段失败**（EAS 构建错误）：
- 后果：无 IPA 产出，TestFlight 不动
- 处理：读 EAS build log → 定位缺失依赖/pod 冲突/plugin 语法 → 修 → 重跑
- 影响：Frank 需再 build 一次（不算真正意义"失败"，因为还没提交 TestFlight）

**场景 B — build 成功但用户升级后崩溃**：
- 后果：v0.2.0 build 3 用户白屏
- 处理：**TestFlight 后台把 build 3 标记"Expired"**（App Store Connect → TestFlight → Build → Expire），用户端 TestFlight app 自动下架
- 用户回滚路径：**只能通过 TestFlight 客户端选老 build 2**（v0.1.0）—— 但 TestFlight 不像 App Store 那样支持自动回滚，用户需手动"重新安装老版本"
- **关键**：TestFlight build 2 在 90 天内可用，超过 90 天会过期 → 若 Frank build 3 出问题的时候 build 2 已过期，**无法回滚**
- **Mitigation**：build 3 上线前先确认 build 2 剩余天数 > 30 天

**场景 C — build 成功、启动 OK、但功能异常**：
- 例：expo-av 播放崩溃、推送 token 拿不到、Skia 撕纸渲染错误
- 处理：**发一版 targeting runtimeVersion=0.2.0 的 OTA v25 hotfix**
  - 关掉出问题的功能（feature flag or try/catch）
  - v25 通道：production channel + runtimeVersion 0.2.0
  - Frank 用 `EXPO_PUBLIC_OTA_VERSION` bump + `eas update --channel production` 发
- **关键**：v25 是 build 3 的第一个 OTA，**手动测过**再发，因为 build 2 用户不吃 v25（他们吃 v1-v24）

**场景 D — AppStore 拒审**：
- 后果：build 3 上不了 App Store，TestFlight 仍可继续内测
- 处理：读 Rejection Reason → 若是隐私声明问题 → 补 App Privacy Nutrition Label → 重 submit（不需要重 build）；若是功能问题 → 修代码 → 重 build
- **Mitigation**：先 submit **仅 TestFlight**（不勾"Submit to App Store"），先验能过 TestFlight 内测再考虑 App Store 上架

---

## 5 项 Frank 必答问题（build 前必须回答）

1. **是否接受 v0.1.0 → v0.2.0 切断老 OTA 兼容？**
   - 接受 = build 3 出厂时不吃任何 v1-v24，需 build 完立即发 v25 baseline
   - 不接受 = 保持 v0.1.0，但**新 native 依赖不生效**（因为老 OTA 都不知道有 Skia），矛盾
   - **建议**：接受，同时准备好 v25 baseline 内容
2. **DebugUploadZone 本次是否 gate 掉？**
   - 首选：`__DEV__ \|\| EXPO_PUBLIC_ENABLE_DEBUG_UPLOAD='true'` gate + 生产 profile 不设 env
   - 次选：**本次不装 expo-image-picker**（Product review 首推）
   - 不 gate = R5 Critical 风险坐实
3. **UIBackgroundModes: audio 是否保留？**
   - **强烈建议删除**（R4，30% 拒审风险）
   - Product review 也同意锁屏即停符合场景
4. **associatedDomains 是否保留？**
   - 若后端 AASA 文件今天/明天上线 → 保留
   - 若一周内搞不定 → **本次删掉**（R6，OTA 加不了，得等下次 build 补，浪费）
5. **是否装全 14 个依赖？**
   - Product review 首推最小集合：`expo-av + expo-notifications`（2 个）
   - Manifest 是 14 个（含 image-picker + media-library + skia + reanimated + lottie 等）
   - 折中：core 6 个 `expo-av + expo-notifications + expo-blur + expo-linear-gradient + expo-clipboard + react-native-reanimated + react-native-gesture-handler + react-native-worklets`（去掉高风险 image-picker + media-library + skia + lottie）
   - **Frank 决策**：如果坚持 14 个装齐 → 承担 R2 / R3 / R8 全部风险
6. **build preview 先跑还是直接 production？**
   - 强烈建议 preview 先跑（`eas.json` 已配好 `preview: { distribution: internal }`）
   - preview build 也算一次 EAS build 次数（Frank "只 build 一次"是否包含 preview？）
   - **如"只 build 一次"是指 production**：preview 是免费的中间验证步骤，必须跑
   - **如是指总次数**：Frank 需接受直上 production 的 R2 风险显著上升

---

## 总体 Verdict

**PASS_WITH_MITIGATIONS**

允许 build，**但**需 Frank 回答 6 个必答问题 + 落实以下**硬性阻断项**：

| # | 阻断项 | 状态 |
|---|-------|------|
| 1 | app.json 删掉 `UIBackgroundModes: ["audio"]` 或提供后台音频合理性说明（R4） | ⏳ 待 Frank |
| 2 | DebugUploadZone gate 掉 或 不装 expo-image-picker（R5） | ⏳ 待 Frank |
| 3 | Push Key `eas credentials` 状态确认 valid（R11） | ⏳ 待 Claude |
| 4 | `react-native-worklets` 显式装 + babel plugin 配好（R7） | ⏳ 待 Claude |
| 5 | AASA 文件确认或删掉 associatedDomains（R6） | ⏳ 待 Frank |
| 6 | 先跑 preview profile 验证再上 production（R2） | ⏳ 待 Frank |
| 7 | build 完成后立即准备 OTA v25 baseline（R1） | ⏳ 待 Claude |
| 8 | Backend `/api/debug/upload` 加 rate limit + anonymousId 校验（R5） | ⏳ 待 Claude |
| 9 | TestFlight build 2 剩余天数确认 > 30 天（回滚保障） | ⏳ 待 Frank |
| 10 | App Store Connect 里 Privacy Policy URL 已配 | ⏳ 待 Frank |
| 11 | `lib/pushNotifications.ts` 权限请求改为 opt-in（不启动时弹） | ⏳ 待 Claude |
| 12 | build log 检查 PrivacyInfo.xcprivacy 生成（R3） | ⏳ 待 Frank build 后 |

**如上 12 项全部落实 + 6 个必答问题回答完成**，本次 build 一次成功 + AppStore 通过审核的联合概率评估：**~75%**（前提是保留 14 依赖全装）。**若砍到 core 6 个依赖 + 删 UIBackgroundModes + 删 associatedDomains + gate DebugUploadZone**，成功率提升至 **~90%**。

Frank 最终决策权在你。Risk Reviewer 的立场：**能砍就砍**，下次 build 还有机会补。

---

**审阅完成时间**：2026-07-07
**签字**：Risk Reviewer（4-eyes review 4/4）
**上一环节**：Product / Architecture / QA review
**下一环节**：Frank 决策 → build 或 stop
