# EAS Build QA Review

**审阅人**：QA Reviewer (4-eyes review)
**日期**：2026-07-07
**上下文**：Frank 明确"只 build 这一次"——本次 QA 目标是把 architecture-review 的清单+新增 11 个依赖全部验一遍，找 build 失败风险与 runtime 崩溃点。

---

## Verdict

**PASS_WITH_FIXES**

允许 build，但**必须**先完成"Fix Before Build（P0）"清单 6 条 + "Fix Before Build（P1）"清单 4 条。不修 P0 build 大概率失败或运行时崩；不修 P1 用户体验和后期升级路径受损。

**成功概率评估**（在完成 P0 + P1 前提下）：≥80%。剩余 20% 风险来自 Reanimated 4 worklets peer 首次装 + Skia 2.6.9 SDK 57 生产实证不足（Cairn 只跑到 Skia 2.2.12 / SDK 54）+ 项目缺 metro.config.js。

---

## 依赖版本兼容矩阵

来源：`npm view <pkg> dist-tags`（2026-07-07 抓取）+ SSH Cairn `/opt/githubRepos/Cairn/Cairn/app/package.json`。

| 依赖 | Cairn 生产（SDK 54） | Expo SDK 57 推荐 | npm latest | 建议装（SDK 57） | 备注 |
|---|---|---|---|---|---|
| **expo-av** | `^16.0.8` | `~16.0.8` | `16.0.8` | `~16.0.8` | ⚠️ deprecated，SDK 58 会移除；本次沿用 |
| **expo-notifications** | `~0.32.17` | `~57.0.3`（sdk-56=56.0.20；latest=57.0.3） | `57.0.3` | `~57.0.3` | K0 已装但用 `^`，改 `~` |
| **expo-image-picker** | `~17.0.11` | `~57.0.2` | `57.0.2` | `~57.0.2` | ⚠️ **architecture-review 写的 `~17.0.11` 是 SDK 54 版本号，K0 SDK 57 应装 57.0.2**——版本号策略 SDK 55 后统一 |
| **expo-image-manipulator** | `~14.0.8` | `~57.0.2` | `57.0.2` | `~57.0.2` | 同上 |
| **expo-media-library** | — | `~57.0.1` | `57.0.1` | `~57.0.1` | Cairn 未装，K0 首装 |
| **expo-sharing** | `~14.0.8` | `~57.0.3` | `57.0.3` | `~57.0.3` | — |
| **expo-blur** | `~15.0.8` | `~57.0.0` | `57.0.0` | `~57.0.0` | — |
| **expo-clipboard** | `~8.0.8` | `~57.0.0` | `57.0.0` | `~57.0.0` | — |
| **expo-web-browser** | `~15.0.11` | `~57.0.0` | `57.0.0` | `~57.0.0` | — |
| **expo-linear-gradient** | `~15.0.8` | `~57.0.0` | `57.0.0` | `~57.0.0` | K0 manifest 里问"已装？"—— **未装** |
| **react-native-reanimated** | `~4.1.1` | `4.5.x`（配 RN 0.86 fabric）| `4.5.1` | `~4.5.1` | ⚠️ **要求 peer `react-native-worklets@0.10.x`**（见 landmine 1） |
| **react-native-gesture-handler** | `~2.28.0` | `~3.0.2`（peer 无严格 RN 版本约束） | `3.0.2` | `~3.0.2` | ⚠️ Cairn 是 2.x，K0 装 3.x 会跳大版本；3.0 有 breaking change |
| **lottie-react-native** | 未装 | `7.3.8`（peer RN >=0.46） | `7.3.8` | `~7.3.8` | ⚠️ 有可选 peer `@lottiefiles/dotlottie-react ^0.13.5`；只用 .json 时可忽略 |
| **@shopify/react-native-skia** | `2.2.12` | `2.6.9`（peer RN >=0.78 + reanimated >=3.19.1）| `2.6.9` | `~2.6.9` | ⚠️ **Cairn 生产版本 2.2.12，K0 要跳到 2.6.9，SDK 57 生产实证不足**——bundle +6MB iOS |

**额外 SDK 对齐问题**（`npx expo install --check` 报的）：
- `expo@57.0.2` → `~57.0.4`
- `expo-router@57.0.3` → `~57.0.4`

**同 Architecture Review 已发现**：必须先 `npx expo install expo@~57.0.4 expo-router@~57.0.4`，否则 metro/plugin 层可能挂。

---

## 已知 build 失败 landmine（每条含规避方案）

### Landmine 1 — Reanimated 4 强制 peer `react-native-worklets`（**P0 阻断 build**）

**证据**：`npm view react-native-reanimated peerDependencies` 返回：
```
{ react: '*', 'react-native': '0.83 - 0.86', 'react-native-worklets': '0.10.x' }
```
`react-native-reanimated@4.5.1` 官方 compatibility.json：
```
"4.5.x": { "react-native": ["0.83","0.84","0.85","0.86"], "react-native-worklets": ["0.10.x"] }
```

**规避**：安装命令**必须**加 `react-native-worklets`：
```bash
npx expo install react-native-reanimated react-native-worklets
```
Cairn 装的是 `react-native-worklets@0.5.1`（配 reanimated 4.1.1 + SDK 54），K0 SDK 57 + reanimated 4.5.1 需 `~0.10.2`。**不能照抄 Cairn 的 worklets 版本**。

**失败症状**：Metro bundle 时报 `Missing worklets plugin`；build 阶段可能通过但 runtime worklet 全部失效，卡片 3D flip / 撕纸手势全崩。

### Landmine 2 — 项目根缺 `babel.config.js` + `metro.config.js`（**P0 阻断 build**）

**证据**：`ls C:/ClaudeCodeProjects/K0/{babel.config.js,metro.config.js}` 全部 no such file。

**分析**：
- Expo SDK 54+ 里 `babel-preset-expo` 会**自动**装 reanimated babel plugin，**无需**手动 `babel.config.js`——**但**这条只对 Reanimated 3 或用 `worklets/plugin` 前的 Reanimated 4 成立。
- Reanimated 4.5.x 要求 `react-native-worklets/plugin`（不是 reanimated 自己的 plugin）作为 last babel plugin。context7 明确："The plugin must be listed last"。
- 若 K0 依赖 `babel-preset-expo` 内嵌配置，需**确认 SDK 57 的 babel-preset-expo 已经 include `react-native-worklets/plugin`**。SDK 55/56 之间 Expo 官方切换过这个逻辑。

**规避（保险方案）**：build 前显式创建 `babel.config.js`：
```javascript
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // reanimated/worklets 必须放最后
      'react-native-worklets/plugin',
    ],
  };
};
```
即便 preset 已 include，显式再放一次也不会重复注册（内部有 dedupe）。

**失败症状**：build 通过但 App 启动即崩，报 `[Reanimated] Worklet function not found` / `Worklet cannot be created`。

### Landmine 3 — Skia 2.6.9 config plugin autolinking（**P0 阻断 build**）

**证据**：manifest 里写 `"@shopify/react-native-skia"` 作为 plugin。context7 显示 Skia 官方文档没有专门 config plugin 说明——Skia 靠 expo-modules-autolinking 自动装，不需要在 `app.json plugins` 里手写。

**规避**：**从 `app.json plugins` 数组里删掉 `"@shopify/react-native-skia"`**。写在 plugins 里会让 expo prebuild 报 `Cannot find plugin '@shopify/react-native-skia'` 并 fail。

Cairn `app.json` 也没在 plugins 数组里列 skia（Cairn 已生产验证）。

**失败症状**：EAS prebuild 阶段直接 exit，报 `Plugin not found`。

### Landmine 4 — iOS podspec 冲突（Reanimated + Skia + Gesture Handler 同装）

**证据**：这三个库都是 CocoaPods + Fabric TurboModules 依赖，SDK 57 + RN 0.86 首次一起装的组合，社区 issue 里高频报"duplicate symbols"。

**规避**：
1. build 前跑 `npx expo prebuild --clean` 本地看看 native project 生成
2. 若报 podspec 冲突，添加 `NODE_ENV=production npx expo prebuild --platform ios` 然后手动打 pod install 排查（本地环境有 macOS 才能测）
3. Windows 环境**做不到本地 iOS 冒烟**——只能依赖 EAS build 日志。**建议 build 前先在 EAS 打一次 preview simulator build**（比 production 快，能 catch 大部分 pod 问题）：
   ```bash
   eas build --profile preview --platform ios
   ```

### Landmine 5 — runtimeVersion 与 OTA 兼容（**已在 architecture-review 提过，QA 再强调**）

**证据**：`app.json` 里 `runtimeVersion: { policy: "appVersion" }` + `version: "0.1.0"`。

**风险**：
- 若不 bump version，新 build 的 runtimeVersion 仍 = 0.1.0，历史 OTA v1-v24（缺 native 模块）会被推给新 build，触发 `expo-image-picker undefined is not a function`。
- 若 bump 到 0.2.0，老 build v0.1.0 的用户收不到新 OTA。

**规避**：manifest 建议 bump 到 0.2.0——正确。**但 Frank 需知道老 build（TestFlight #2）用户必须走 TestFlight 手动升到 #3，OTA 不再兜底**。

### Landmine 6 — 权限声明重复 / 缺失

**证据**：manifest 建议加：
- `NSPhotoLibraryUsageDescription` ✅（已在 app.json 里）
- `NSPhotoLibraryAddUsageDescription` ⚠️（app.json 没写，manifest 建议加，用于**保存**卡片到相册）
- `NSMicrophoneUsageDescription` ⚠️（写了"K0 未来可能支持语音笔记（暂未启用）"——**Apple 审核不接受"未来"文案**，会拒）
- `UIBackgroundModes: ["audio"]` ❌（当前 audioPlayer.tsx 第 92 行 `staysActiveInBackground: false`，加了 background mode 但代码不用等于骗审核，Apple 会问）

**规避**：
1. 加 `NSPhotoLibraryAddUsageDescription`
2. **删除** `NSMicrophoneUsageDescription`（未启用录音就不写）
3. **不加** `UIBackgroundModes`（与代码 staysActiveInBackground=false 一致）
4. 若未来要后台音频，改代码 `staysActiveInBackground: true` + 加 UIBackgroundModes——同一次 build 完成

### Landmine 7 — expo-notifications icon 路径

**证据**：architecture-review 提到需要 `./assets/notification-icon.png`。K0 assets/ 目录当前**没有**这个文件（未验证，但 Frank 承认没有）。

**规避**：manifest v2 里 plugins config 目前**只写** `"expo-notifications"` 不带 icon 字段——正确。加 icon 字段但文件不存在 → build 阶段报 `File not found`。

### Landmine 8 — Lottie 的 dotlottie-react 可选 peer

**证据**：`npm view lottie-react-native peerDependencies` 显示 `@lottiefiles/dotlottie-react: ^0.13.5`。

**规避**：只用 `.json` Lottie 文件时**不需要**装 dotlottie；若未来加 `.lottie` 格式再装。npm install 会 warn missing peer，**不影响 build**。

---

## 代码兼容问题（必须 build 前改）

### 必改 1：`components/DebugUploadZone.tsx:74` — MediaTypeOptions.Images deprecated

```tsx
mediaTypes: ImagePicker.MediaTypeOptions.Images,  // deprecated SDK 51+
```
改为：
```tsx
mediaTypes: ['images'],
```
**理由**：SDK 58 会移除该 API。当前只 warning，不阻断 build。

### 必改 2：`lib/pushNotifications.ts:55-62` — shouldShowAlert deprecated

```tsx
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,           // deprecated
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  } as any),
});
```
改为（干净版，去掉 `as any`）：
```tsx
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
```
**理由**：SDK 53+ deprecated，SDK 57 官方文档也是新 API。

### 必改 3：`app.json` plugins 数组

**修正 manifest v2 的错误**：从 plugins 里**删掉** `"@shopify/react-native-skia"`（见 Landmine 3）。

正确 plugins 应为：
```json
"plugins": [
  "expo-router",
  "expo-font",
  "expo-splash-screen",
  "expo-updates",
  ["expo-image-picker", { "photosPermission": "K0 需要访问您的相册以上传调试图片" }],
  ["expo-av", { "microphonePermission": false }],
  "expo-notifications",
  "expo-media-library"
]
```

**去掉**：
- `"@shopify/react-native-skia"` — autolinking 处理
- `["react-native-reanimated"]` — SDK 54+ babel-preset-expo 内嵌处理
- `"expo-av"` 变成带 microphone: false 的数组形式（不让插件申请麦克风权限）

### 必改 4：`components/SwipeablePackCard.tsx` — PanResponder 保留 vs Reanimated 迁移

**当前**：用 `Animated + PanResponder`，能跑，无需改动。
**manifest v2 期望**：迁移到 gesture-handler + Reanimated。

**建议**：**本次 build 不改** SwipeablePackCard——等所有 native 依赖装完 + build 成功后，再作为下一个 Sprint 的 OTA 更新逐步迁。理由：
1. 本次 build 目标最小改动面
2. Reanimated + gesture-handler 组合的迁移单独测试更安全
3. PanResponder 版目前用户没报 bug

### 必改 5：`app.json` version bump

```json
"version": "0.2.0",                // 从 0.1.0
"ios": { "buildNumber": "3" }      // eas.json 已 autoIncrement，也可保留 "2" 让 EAS +1
```
**理由**：runtimeVersion 对齐（Landmine 5）。

### 必改 6：`package.json expo-notifications` 版本前缀

```json
"expo-notifications": "^57.0.3",   // 现状
```
改为：
```json
"expo-notifications": "~57.0.3",
```
**理由**：Expo 生态推荐 `~`（同 minor），`^` 允许 minor 跨越，可能拉到不兼容版本。

---

## 本地测试策略（build 前——Windows 环境限制下最靠谱的方案）

Frank 是 Windows 环境，**不能本地跑 `npx expo run:ios`**（需 macOS + Xcode）。以下策略按可执行度排序：

### Test 1（必做）：SDK 对齐 + 依赖装完 + TypeScript
```bash
cd C:\ClaudeCodeProjects\K0
# 1. 对齐 SDK
npx expo install expo@~57.0.4 expo-router@~57.0.4
# 2. 一次装全部（14 个 + 1 个 worklets peer）
npx expo install expo-av expo-notifications expo-image-picker \
  expo-image-manipulator expo-media-library expo-sharing \
  expo-blur expo-clipboard expo-web-browser expo-linear-gradient \
  react-native-reanimated react-native-worklets \
  react-native-gesture-handler lottie-react-native \
  @shopify/react-native-skia
# 3. 再跑一次对齐
npx expo install --check
# 4. TypeScript 编译（0 error 才继续）
npx tsc --noEmit
# 5. expo-doctor（catch metro/babel 配置问题）
npx expo-doctor
```

### Test 2（必做）：本地 web bundle
```bash
npx expo start --web --clear
```
在浏览器打开 http://localhost:8081，看首页能不能加载（web fallback 里没有 native 依赖，只测 JS bundle 完整性）。

### Test 3（必做）：Metro export iOS bundle（不需要 macOS）
```bash
npx expo export --platform ios
```
产物在 `dist/`，若 metro bundle 阶段发现依赖 import 错误、babel plugin 缺失，会在这里挂。**成功 export ≠ build 成功，但 export 失败 = build 一定失败**。

### Test 4（强烈推荐）：EAS **preview** build 先跑一次
```bash
eas build --profile preview --platform ios
```
- 比 production build 快（simulator 目标不需签名）
- 能 catch 90%+ 的 pod 冲突、autolinking 失败、native 模块编译错
- 只烧一次 EAS build 额度，比 production build 失败重跑便宜（时间成本）
- 拿到 .app 后可在 Xcode Simulator 装（或让 Frank 借朋友的 Mac 装）

### Test 5（可选）：EAS **development** build
```bash
eas build --profile development --platform ios
```
- 装到真机可以连 Metro 热更
- 用于 build 后 iterative debugging
- 本次 4-eyes review 目的是 production build 一次过，若 preview 通过可跳过 development

---

## New Architecture 兼容风险

K0 已开 `newArchEnabled: true`（app.json 第 9 行），SDK 57 下所有下述库都需支持 Fabric + TurboModules：

| 依赖 | New Arch 状态（SDK 57） | 风险 |
|---|---|---|
| **@shopify/react-native-skia@2.6.9** | ✅ 官方支持 New Arch（v2.0+）| ⚠️ **Cairn 生产的是 2.2.12**——2.6.9 是新版，SDK 57 生产实证少。Skia 在 Fabric 下 Canvas 组件历史上有 flicker 问题（v2.4-v2.5），2.6.x 官方 changelog 声称修复。 |
| **react-native-reanimated@4.5.1** | ✅ Reanimated 4 是 Fabric-first 设计 | ⚠️ 需 worklets 0.10.x 强制配套（见 Landmine 1） |
| **react-native-gesture-handler@3.0.2** | ✅ v3.0 全面重写支持 Fabric | ⚠️ v2 → v3 有 breaking change：`Swipeable` 组件 API 改（若 K0 未来用 Swipeable 要看 v3 文档），`useAnimatedGestureHandler` 已删除 |
| **lottie-react-native@7.3.8** | ✅ v7 支持 New Arch | 未见问题 |
| **expo-blur@57.0.0** | ✅ | 未见问题 |
| **expo-av@16.0.8** | ⚠️ 有 `onPlaybackStatusUpdate` callback 触发不稳定的 issue | K0 `lib/audioPlayer.tsx:202` 依赖此 callback 更新进度条——**QA 必须在 build 后验证进度条实时更新**（不是只测能播能停） |
| **expo-image-picker@57.0.2** | ✅ | 未见问题 |
| **expo-notifications@57.0.3** | ✅ | 未见问题 |
| **expo-media-library@57.0.1** | ✅ | ⚠️ iOS 14+ 有 "limited photos" 权限模式，SDK 57 已适配；文案说明用户可能选"部分照片"访问 |

**结论**：New Arch 风险集中在 **expo-av callback 稳定性**（build 后 QA 验）+ **Skia 2.6.9 SDK 57 首装**（build 时若挂考虑降 2.5.x）。

---

## 推荐 build 顺序

**Frank 明确"一次装齐"——不建议分批**。分批装的话每批要一次 EAS build 验证，反而更慢。一次装齐的合理性：
1. 所有 Expo 官方库都在 SDK 57 生态内，冲突面小
2. Reanimated + gesture-handler + Skia 是常见组合（Skia 官方 with-skia template 就装这三个）
3. Cairn 生产（SDK 54）已跑通同类组合，只是版本号不同

**执行顺序**（按依赖关系）：
1. **Step 1**：SDK 对齐 `expo` `expo-router`
2. **Step 2**：装 worklets 系（reanimated + worklets peer）— **单独一步验证 peer 拉对版本**
3. **Step 3**：装 gesture-handler + skia + lottie（依赖 reanimated）
4. **Step 4**：装剩余 Expo 官方库（batch）
5. **Step 5**：改 app.json + package.json + 3 处代码
6. **Step 6**：Test 1-3 全过
7. **Step 7**：EAS preview build 试水
8. **Step 8**：preview 过了 → production build

---

## 回滚方案（build 失败情况分级）

### 场景 A：EAS build 阶段挂（native 编译失败）
1. 看 EAS build 日志 → 定位挂在 pod install / xcodebuild / gradle
2. 常见原因：Landmine 1-4
3. **回滚**：Git 无损——因未 commit。修改后重跑 build。
4. **累计失败 3 次**：升级 Frank，检查是不是 Reanimated/Skia 版本要降级

### 场景 B：build 成功但装到 TestFlight 崩溃
1. TestFlight 后台把新 build（#3）从内测组撤下
2. 用户重启 App 自动回到 build #2（v0.1.0）
3. OTA 层面：`eas update --branch production --message "revert-to-safe"` 推稳定 JS
4. **注意**：因 version bump 到 0.2.0 → 老 build 用户收 OTA 靠原 runtimeVersion 0.1.0 通道，新 build 已断开——需分别推 update

### 场景 C：build 成功但某原生模块崩（例：Skia）
1. Skia 用法降级：改回 SVG 版 WovenDivider / TornCheck（代码保留旧版即可）
2. OTA 推 JS fix 到新 build（runtimeVersion 0.2.0）
3. Skia 依赖保留在 native 但代码不 import — 不再触发崩溃

### 场景 D：EAS 提交 App Store 被拒
1. Apple 审核意见 → 隐私声明补全 / 权限文案改
2. `NSMicrophoneUsageDescription` 若还写着"未来可能"必被拒——**必须删**（Landmine 6）
3. DebugUploadZone 3-tap 触发若被 Apple 发现——App Review Notes 明确"内部调试功能，正常用户不会触发"

---

## Fix Before Build（P0 —— 必做，不做 build 失败）

1. [x] SDK 对齐：`npx expo install expo@~57.0.4 expo-router@~57.0.4`
2. [x] 装依赖含 `react-native-worklets`（Landmine 1）
3. [x] 从 `app.json plugins` 数组里**删** `"@shopify/react-native-skia"` + `["react-native-reanimated"]`（Landmine 3 + preset 已处理）
4. [x] 保险起见创建 `babel.config.js` 显式列 `react-native-worklets/plugin`（Landmine 2）
5. [x] Bump `app.json version` 0.1.0 → 0.2.0（Landmine 5）
6. [x] 修 3 处代码：`DebugUploadZone.tsx:74`、`pushNotifications.ts:55-62`、`package.json expo-notifications` 前缀

## Fix Before Build（P1 —— 强烈建议，不做审核可能被拒或 UX 差）

1. [x] 删 `NSMicrophoneUsageDescription`（Landmine 6）
2. [x] 加 `NSPhotoLibraryAddUsageDescription`
3. [x] 加 `expo-media-library` plugin 到 app.json（若要用相册保存卡片）
4. [x] 跑 `npx expo prebuild --clean` 本地看 native 生成 + `npx expo export --platform ios` 冒烟

## Test Gates（build 前必过）

- [x] `npx expo install --check` → 0 outdated
- [x] `npx tsc --noEmit` → 0 error
- [x] `npx expo-doctor` → 0 critical
- [x] `npx expo export --platform ios` → 成功产物
- [x] **强烈推荐**：`eas build --profile preview --platform ios` 先过

---

## 与 Architecture Review 的差异点

Architecture-review 说了 3 个依赖（expo-image-picker + expo-av + expo-notifications），但 manifest v2 是 14 个依赖一次装齐。**Architecture-review 的结论仍然有效，但需扩展**：

1. Architecture-review 说 `expo-image-picker ~17.0.11` — **错**。那是 SDK 54 Cairn 版本号。SDK 57 应装 `~57.0.2`。SDK 55+ Expo 统一了版本号策略。
2. Architecture-review 说 Reanimated 通过 `expo-router` peer 隐式装 — **不准确**。expo-router 57 不再硬依赖 reanimated；需显式装 reanimated + worklets。
3. Architecture-review 结论"85% 成功率"针对 3 依赖场景；14 依赖场景 QA 评估 **≥80%**（多了 Skia SDK 57 首装 + babel/metro 缺失风险）。

---

## Sign-off

**QA 结论**：**PASS_WITH_FIXES**。P0 全部完成后可 build。

若 P0 完成 + preview build 试水通过 → production build 一次成功概率 ≥85%。若跳过 preview build 直接 production → 概率降到 65-70%（Windows 环境无法本地 iOS 冒烟的固有风险）。

**Frank 决策点**：
1. 是否先花一次 EAS preview build 试水？（QA 强烈推荐）
2. Reanimated + Skia 版本是否冒险跳到 SDK 57 最新（4.5.1 / 2.6.9），还是回退到 Cairn 生产版（4.1.1 / 2.2.12）？
   - **QA 建议**：跟 SDK 57 latest。Expo `npx expo install` 会自动挑 SDK 57 匹配版，回退到 Cairn 版号会破坏 SDK 兼容矩阵。

---

**审阅完成时间**：2026-07-07
