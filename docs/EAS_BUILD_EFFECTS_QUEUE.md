# K0 EAS Build 特效/native 功能补漏清单

Frank 明确：**下次 build 前把所有需要 native 才能实现的特效/功能加进来**。

## 已在 build 队列
| 功能 | 依赖 | 说明 |
|---|---|---|
| 图片上传 debug | expo-image-picker + permission | Product review 建议延后（可选） |
| 音频播放 | expo-av | Sprint 15 主线 |
| 推送通知 | expo-notifications 激活 | Sprint 9 沉没资产回收 |

## 新加入 build（Frank 追加：绚丽特效需求）

### A. 卡片翻转 3D 效果
- **依赖**：`react-native-reanimated`（K0 未装）+ 可能 `react-native-gesture-handler`
- **native 必须**：Reanimated worklet 需要 native 支持，OTA 装不进
- **实现**：Review 页 KnowledgeCard 3D flip (rotateY 180°)，翻面显示 quote/answer
- **收益**：Frank 反馈"Review 卡片生硬" —— 3D 翻转 + 弹性动画能大幅提升

### B. Skia 撕纸真实感
- **依赖**：`@shopify/react-native-skia`（K0 未装）
- **native 必须**：Skia canvas 是 native
- **实现**：真实撕纸边缘（可像素级模拟纸纤维），比 SVG feTurbulence 效果好 10x
- **收益**：全站撕纸风视觉升级
- **风险**：文件大 + New Arch 兼容需确认

### C. 触觉反馈增强
- **依赖**：expo-haptics（已装）——**无需 build**
- **实现**：卡片翻转触发 impactMedium，勾选步骤 impactLight，删除 confirm impactHeavy
- **无需 build 但要写代码**

### D. Blur 视觉
- **依赖**：`expo-blur`（K0 未装）
- **native 必须**：iOS UIVisualEffectView
- **实现**：ConfirmDialog backdrop 加 blur，音频播放条底加 blur，version popup 加 blur
- **收益**：iOS 原生感提升

### E. 手势库（如果还想更炫）
- **依赖**：`react-native-gesture-handler`（K0 未装，当前左滑用纯 JS PanResponder）
- **native 必须**：主线程手势
- **实现**：卡片左右滑切换（Tinder 式）、pinch-to-zoom 快照图片
- **收益**：手感升级
- **代价**：现有 SwipeablePackCard 需要重写

### F. Lottie 动画（可选）
- **依赖**：`lottie-react-native`
- **native 必须**：native animation player
- **实现**：Loading 状态用 Lottie 撕纸动画代替 ActivityIndicator，Review 完成动画
- **风险**：文件大 + 需设计师提供 .json

### G. 分享 (Share Sheet)
- **依赖**：`expo-sharing`（K0 未装）
- **native 必须**：iOS UIActivityViewController
- **实现**：卡片、快照可分享到微信/朋友圈/图库
- **必要**：产品化后需要

### H. Screenshot 保护/截图分享
- **依赖**：expo-file-system + expo-media-library
- **实现**：截图保存到相册

### I. 深链 Universal Links
- **依赖**：app.json associatedDomains
- **native 必须**：iOS entitlements
- **实现**：从 iOS Podcast app 分享链接直接打开 K0

## 建议本次 build 打包

**MUST**（Product/Arch review 一致同意）：
1. expo-av（音频）
2. expo-notifications 激活（推送 SRS 提醒）
3. **expo-blur**（成本低，视觉升级明显）
4. **react-native-reanimated**（后续卡片翻转 + Review 视觉升级刚需）

**Frank 决策**：
5. expo-image-picker（debug 图片上传，可延后但既然 build 了就一起）
6. react-native-gesture-handler（若走 Reanimated + gesture 组合，一起装）
7. @shopify/react-native-skia（视觉大跃迁但风险）
8. lottie-react-native（后续动画素材投入前不必先装）
9. expo-sharing（产品化后需要）

## 版本管理硬约束（Architecture Review 已列）

- ✅ app.json version: 0.1.0 → **0.2.0**（否则老 OTA 会污染新 build）
- ✅ ios.buildNumber: 2 → **3**
- ✅ 跑 `npx expo install --check` 修正 expo/expo-router 到 ~57.0.4

## Build 前必改代码（Architecture Review）

- `components/DebugUploadZone.tsx:74` MediaTypeOptions.Images → `['images']`
- `app.json plugins` 补 expo-notifications 配置
- `lib/pushNotifications.ts:55-62` 清理 as any
