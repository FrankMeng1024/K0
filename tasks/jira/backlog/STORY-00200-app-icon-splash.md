# STORY-00200: App 图标 + Splash Screen（Cutout Illustrated 撕纸风）

**Epic**: E-006 Assets & Polish
**Sprint**: Sprint 5
**Points**: 2
**Owner**: Design + Frontend
**Status**: Todo

## Description
当前 K0 使用 Expo 默认图标。TestFlight 首发版已装到用户手机，但图标不符合 Style F Cutout Illustrated 品牌。需要产出撕纸风 icon 与 splash screen，让手机主屏、启动画面、App Store 展示都统一到撕纸温度感。

## Expected Result
- iOS 主屏 K0 图标：撕纸风 HeadphoneListener 简化头像 + K0 字标，符合 iOS 圆角矩形规范
- 启动 Splash Screen：暖米色底 + K0 大字标 + 撕纸装饰元素

## Acceptance Criteria
- [ ] `assets/icon.png` 1024×1024 PNG（无 alpha），撕纸风头像 + 蓝色帽子 + 红耳机为核心视觉
- [ ] `assets/adaptive-icon.png`（Android）+ `assets/adaptive-icon-foreground.png`
- [ ] `assets/splash.png` 1284×2778（iPhone 15 Pro Max 分辨率兼容各机型缩放）
- [ ] `app.json` 加入 `icon` / `splash` 配置，`splash.backgroundColor: "#E8D9B8"`（paperMain）
- [ ] iOS build 后手机主屏图标显示正确（无白框、无变形）
- [ ] Cold start Splash Screen 显示 K0 撕纸标识
- [ ] App Store Connect 上传预览图无被拒（Guideline 2.3.7 尺寸/透明度）

## Dependencies
Blocks: Sprint 5 EAS build（图标/splash 是 native asset，必须打进新 build，OTA 改不了）

## Notes
Sprint 5 主题若包含卡片交互/Library/Review 等真实功能，图标随本次 build 一起交付，避免为图标单独 build 一次。UX Sprint 4 review 已认为 HeadphoneListener v2（多层撕纸阴影版）够精细可作为图标基础。
