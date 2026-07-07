# EAS Build Product Review

**审阅角色**：Product Reviewer（4-eyes review 环节 1/2）
**日期**：2026-07-07
**上下文**：K0 iOS TestFlight buildNumber = 2（Sprint 4 首发），此后 Sprint 5-14 全部走 OTA（v1-v23）。Sprint 15 音频 demo 出货后必须走 EAS build。Frank 明确"没多少次数不能失败"——单次 build 失败或 AppStore 拒审代价高。
**参考基线**：Cairn（生产同类 Expo 项目，SSH 已核对）已同时装 `expo-image-picker@~17.0.11`、`expo-av@^16.0.8`、`expo-notifications@~0.32.17` 并跑通线上，证明三件套在 Expo 生态里是成熟组合，非新技术风险。

---

## 依赖必要性评分（1-5，5=必须）

| 依赖 | 分 | 理由 |
|---|---|---|
| **expo-av** | **5** | Sprint 15 音频 demo 是本次 build 的**主线交付**——PRD 承诺"播客导入 + 时间戳跳转"，用户点 timestamp 期望能听到那 30 秒；`lib/audioPlayer.tsx` + `AudioPlayerBar` 已经全局挂载在 `_layout.tsx`。不装 = Sprint 15 交付作废。Web 端有 HTMLAudioElement 兜底，但 iOS TestFlight 用户 100% 是 native 环境，走不了兜底。 |
| **expo-notifications** | **4** | Sprint 9 已完整实现（`lib/pushNotifications.ts` + `_layout.tsx` init 已回退等激活），代码资产已投入且被 OTA v6 崩溃事故推迟。PRD Should-Have 层级："复习提醒"是 SRS 记忆功能闭环的关键——没有推送，用户忘记回来复习 = 一周留存指标（PRD 承诺"一周后仍能记得核心内容"）无法达成。**已装 in package.json**，纯 app.json plugin + 后台 APNs 配置即可激活，边际成本几乎为 0。 |
| **expo-image-picker** | **2** | 目前**仅用于 DebugUploadZone**（首页 3-tap version popup 内的调试上传功能）。**这是内部调试功能不是产品功能**。生产用户根本不需要相册权限。装了会：(a) AppStore 审核需要写 `NSPhotoLibraryUsageDescription` + 隐私营养标签更新；(b) 用户看到"K0 想访问相册"弹窗会困惑（学习 App 为什么要相册？）；(c) 增加拒审面积。 |

---

## 用户价值分析

### expo-av（音频播放）
- **用户看到什么**：点击学习包内 timestamp 按钮 → 底部音频条从对应秒开始播放播客片段（30-90s 引用回放）。
- **不装的后果**：native 端 `require('expo-av')` 命中 catch → 用户点 timestamp 得到"缺少 expo-av"错误。整个 Sprint 15 音频体验 = 0。
- **PRD 对齐度**：直接支撑 M1（导入 + 转录）和 M2（片段引用）的验证闭环——用户要能"听到我在读的这段话原本是怎么说的"才建立信任。

### expo-notifications（推送通知）
- **用户看到什么**：完成一次学习 → 24h/72h/7d 三档 SRS 提醒推送（"该复习你昨天听的《XXX》了"）。
- **不装的后果**：Sprint 9 代码已回退，功能沉睡；一周留存靠用户自觉打开 App，Product 层没有主动召回抓手。
- **PRD 对齐度**：M5（Review SRS）已在 Sprint 8 完成，但**没有推送 = SRS 是死的**——用户不回来打开 App，间隔重复算法算得再准也白搭。

### expo-image-picker（相册选图）
- **用户看到什么**：**普通用户看不到**。仅 Frank 3-tap 版本号触发内部 debug 面板才用。
- **不装的后果**：Frank 想上传调试截图给后端排障时用不了这个功能——但目前有很多替代路径（截图直接发微信给 Frank 自己、后端 log、Sentry 已经有的话）。
- **PRD 对齐度**：**PRD 里没有任何用户可见的图片上传功能**。这是纯 dev tooling。

---

## 推荐 build 范围

### 必装（无选择余地）
- **expo-av** — Sprint 15 主线交付。
- **expo-notifications 激活**（依赖已在，只需加 app.json plugin + APNs 后台配置） — Sprint 9 沉没资产回收 + SRS 闭环。

### 可选（Frank 决策，倾向缓装）
- **expo-image-picker** — **建议本次不装**，改用编译期 gate + 下次 build 再考虑。理由见"风险"。

### 建议延后（明确不装）
- 已在 EAS_BUILD_CHECKLIST_v2.md 列出的延后清单（Universal Links / App Clip / Widget / expo-camera / Location）——本次一律不动。
- `expo-av → expo-audio` 迁移：SDK 57 下 expo-av 仍可用，SDK 58 才移除。本次不切，下次 build 前评估。

---

## 风险

### Product 层最大风险（按严重度）

1. **DebugUploadZone 出现在生产 build**（**Critical**）
   - 现状：3-tap 版本号触发的内部面板会在 TestFlight 用户手里被误发现。若装 expo-image-picker + 上传后端未鉴权（`/api/debug/upload` 目前匿名可访问），任何 TestFlight 用户都能上传任意图片消耗后端存储。
   - **建议**：DebugUploadZone 用 `__DEV__ || EXPO_PUBLIC_ENABLE_DEBUG_UPLOAD === 'true'` gate 掉；生产 profile 不设该 env var。这样 expo-image-picker 即使装了也是死代码，可以更安全。
   - **更激进方案**：本次直接不装 expo-image-picker，DebugUploadZone 靠现有的 fallback "图片上传需要下次 EAS build 生效" 提示保持沉默——Frank 调试用 TestFlight 内测 build 单独打一个 dev profile。

2. **AppStore 审核拒审面积扩大**（**Medium**）
   - 装 expo-image-picker → 必须写 `NSPhotoLibraryUsageDescription` + 更新 App Privacy 营养标签（图片收集）+ 有可能触发审核员追问"这个学习 App 为什么要相册"。
   - 装 expo-notifications → 必须更新 App Privacy 营养标签（推送 token）+ 隐私政策 URL 需覆盖。
   - **合并风险**：如果两个新权限一起来，审核员会重点看隐私声明。若只装 expo-notifications，风险窗口缩一半。

3. **推送图标缺失导致 Android 通知丑陋**（**Low**）
   - EAS_BUILD_CHECKLIST_v2 已提到：需要 96×96 白色透明 PNG（Android status bar 图标）。若不提供，Android 显示默认 Expo 图标 = 品牌感掉线。iOS 不受影响。
   - **决策点**：Frank 是否需要本次 build 就出 Android？如否，图标可延后。

4. **音频后台播放策略选择**（**Low**）
   - 当前代码 `staysActiveInBackground: false` + 不加 `UIBackgroundModes = ["audio"]`。用户锁屏 = 音频停。
   - **Product 判断**：K0 是"跟着学习包读+听 30s 片段"的场景，不是长音频播客 App。锁屏即停符合场景（用户放下手机 = 结束学习），也避开 Apple 对后台音频类目的额外审核。**保持现状**。

5. **runtimeVersion 保持 0.1.0**（**Low**，程序性风险）
   - EAS_BUILD_CHECKLIST_v2 已论证：不升 app version → 老 build 2 的 OTA v1-v23 依然生效，新 build 3 也吃 runtimeVersion=0.1.0 的 OTA 通道。**这是正确策略**，不需要改。

---

## 决策建议给 Frank

**首推方案（保守，一次成功概率最高）**：

1. **本次 build = expo-av + 激活 expo-notifications**，**不装 expo-image-picker**。
   - 理由：两条明确的用户可见价值（音频 + 推送），一条 dev-only 功能（图片上传）先延后。
   - Sprint 15 音频 demo 出货 ✅
   - Sprint 9 推送激活 ✅（Sprint 9 沉没资产回收）
   - DebugUploadZone 保持"图片上传需要下次 EAS build 生效"提示——Frank 调试改走 Sentry log 或用 dev-client build 单独调试。

2. **理由汇总**：
   - **降低审核拒审面积**：只新增 1 个 native 权限（推送）而非 2 个。
   - **降低误用风险**：即使有一天 DebugUploadZone gate 被误改，因 expo-image-picker 没装，用户端也不会触发上传（现有 fallback 兜住）。
   - **build 复杂度**：只需加 2 个 app.json plugin（expo-av + expo-notifications），少一个 plugin = 少一处 plist 权限声明 = 少一处出错。

3. **如 Frank 强需要 DebugUploadZone 在 build 3 就能用**：
   - **前提**：先把 backend `/api/debug/upload` 加 anonymousId + rate limit 鉴权（防匿名滥用），再加 `__DEV__ || EXPO_PUBLIC_ENABLE_DEBUG_UPLOAD` gate，生产 profile 不开该 env。
   - 上述两步做完再装 expo-image-picker。
   - 若时间紧，**先不装是更稳的选择**——下次 build 再补，反正 build 会有下次。

4. **build 次序**（一次 build 内自动执行，不需要多次 build）：
   - Step 1：`npx expo install expo-av`（package.json 更新）
   - Step 2：`npx expo install --check` + `--fix`（对齐 SDK 57 版本漂移）
   - Step 3：app.json plugins 数组加 `["expo-av", { "microphonePermission": false }]` + `["expo-notifications", { "icon": "./assets/notification-icon.png", "color": "#ffffff" }]`
   - Step 4：`eas build --profile production --platform ios`（不 auto-submit，先看构建是否绿）
   - Step 5：build 绿灯 + TestFlight processing 完成 → 本地 iPhone 装上验证音频播放 + 推送权限弹窗 → 无问题再 submit to review。

5. **失败预案**：本次 build 若因 expo-av 或 expo-notifications 崩溃启动，OTA v25 立即推一版把 `AudioPlayerProvider` 和 `initPushNotifications` 都跳过（保留 `_layout.tsx` Sprint 9 回退注释里的模式）——app 至少能启动，Frank 有充足时间定位。

---

**签字**：Product Reviewer（AI role）
**下一环节**：Technical Reviewer（4-eyes review 2/2）应审：`newArchEnabled: true` 下 expo-av 16.x 与 React Native 0.86 的原生模块兼容性、Cairn 用的是 expo-av 16.0.8 而 K0 SDK 57 会 install 到哪个版本、eas.json / app.json plugin 语法正确性。
