# K0 EAS Build v2 — 一次装齐全清单（Frank：只 build 一次）

Frank 明确规则：**只 build 这一次，所有需要 native 的东西必须现在加**。任何后期发现要的 native 依赖都会阻塞产品。

## 装齐依赖清单（**全部装**，不选）

### 音频/视频
- `expo-av` — 音频播放主线（Sprint 15）
- `expo-video` — 未来若加视频课程

### 通知
- `expo-notifications` — SRS 复习推送（Sprint 9 恢复）

### 图片/相册
- `expo-image-picker` — Debug 上传 + 未来用户可能上传头像/笔记图
- `expo-image-manipulator` — 图片压缩/裁剪
- `expo-media-library` — 保存/读取相册（分享卡片截图）
- `expo-sharing` — 分享到微信朋友圈等

### 手势/动画（重构左滑 + 卡片翻转 + 未来所有微交互）
- `react-native-reanimated` — 60fps worklet 动画，卡片 3D 翻转必需
- `react-native-gesture-handler` — 原生手势，替换现有 PanResponder
- `lottie-react-native` — 撕纸动画/庆祝动画/loading

### 视觉
- `expo-blur` — 高斯模糊背景（ConfirmDialog / 音频条 / version popup）
- `@shopify/react-native-skia` — 真实撕纸边缘（比 SVG 好 10x）
- `expo-linear-gradient` — 渐变（已装？确认）

### 触觉
- `expo-haptics` — **已装**，用起来

### 系统集成
- `expo-file-system` — 已装
- `expo-clipboard` — 剪贴板（分享链接、粘贴）
- `expo-web-browser` — 打开外链（Cairn 也用）

### 深链
- `app.json associatedDomains` — Universal Links（iOS podcast app 分享打开 K0）
- URL scheme 已有 `"scheme": "k0"`

### 存储
- `@react-native-async-storage/async-storage` — 已装

## 代码改动（build 前必做）

### 用 gesture-handler + reanimated 重写现有交互
- `components/SwipeablePackCard.tsx` PanResponder → Reanimated + Swipeable
- 学习包页卡片 3D flip
- Review 页翻卡片改 Reanimated 弹性

### 用 Skia 升级撕纸感
- WovenDivider 从 SVG feTurbulence 迁 Skia canvas
- TornCheck 迁 Skia
- 撕纸插图迁 Skia（HeadphoneListener 等）
- **风险**：Skia bundle 大，New Arch 需确认

### 用 Blur 提升 iOS 原生感
- ConfirmDialog backdrop
- AudioPlayerBar 底
- 首页 version popup 背景

### 触觉全站补齐
- 卡片翻转 impactMedium
- 步骤勾选 impactLight
- 删除 confirm impactHeavy
- 页面切换 selectionAsync

### app.json 变更（一次到位）
```json
{
  "expo": {
    "version": "0.2.0",  // 从 0.1.0 bump
    "ios": {
      "buildNumber": "3",  // 从 2 bump
      "infoPlist": {
        "ITSAppUsesNonExemptEncryption": false,
        "NSPhotoLibraryUsageDescription": "K0 需要访问相册以上传调试图片、保存卡片截图",
        "NSPhotoLibraryAddUsageDescription": "K0 保存学习卡片到你的相册",
        "NSMicrophoneUsageDescription": "K0 未来可能支持语音笔记（暂未启用）",
        "UIBackgroundModes": ["audio"]
      },
      "associatedDomains": ["applinks:api.k0.yiiling.cn"]
    },
    "plugins": [
      "expo-router",
      "expo-font",
      "expo-splash-screen",
      "expo-updates",
      "expo-av",
      [
        "expo-image-picker",
        { "photosPermission": "K0 需要访问您的相册以上传调试图片" }
      ],
      "expo-notifications",
      "expo-media-library",
      "@shopify/react-native-skia",
      [
        "react-native-reanimated"
      ]
    ]
  }
}
```

## Build 前 4-eyes review checklist（Frank：build 前必开）

- ✅ Product review — 已完成（`docs/eas-review/product-review.md`）
- ✅ Architecture review — 已完成（`docs/eas-review/architecture-review.md`）
- ⏳ QA review — **待启动**：所有 native 依赖 install 后本地 web + Expo Go 测通
- ⏳ Risk review — **待启动**：AppStore 隐私声明齐、rate limit、debug 门控

## 安装命令（**Frank 或 Claude 待授权后执行**）

```bash
cd C:\ClaudeCodeProjects\K0
npx expo install \
  expo-av \
  expo-notifications \
  expo-image-picker \
  expo-image-manipulator \
  expo-media-library \
  expo-sharing \
  expo-blur \
  expo-clipboard \
  expo-web-browser \
  expo-linear-gradient \
  react-native-reanimated \
  react-native-gesture-handler \
  lottie-react-native \
  @shopify/react-native-skia
```

## Build 命令

```bash
# 已授权 build 一次
npx eas build --platform ios --profile production
# 等 ~30 分钟
# TestFlight 收到新 build 后升级
```

## Rollback 方案

- 老 build（iOS #2, v0.1.0）在 TestFlight 保留
- 若 v0.2.0 崩溃 → TestFlight 回滚到 #2
- OTA v24 已发布，与老 build 兼容
