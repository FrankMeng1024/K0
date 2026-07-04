# SPIKE-005: react-native-web + Playwright 集成可行性

**Epic**: QA / Foundation（新增，因 CR-001）
**Sprint**: Sprint 1
**Points**: 3
**Owner**: Frontend + QA
**Status**: Done

## Description
As QA/Arch, I want to verify `expo start --web` 起的 react-native-web 站点能被 Playwright 稳定测试。因为整个 K0 QA 流程都建立在这个假设上。

## Expected Result
- 用 Expo 建 minimal app（一个屏幕，一个按钮）
- 跑 `npm run web` → 打开 http://localhost:8081
- Playwright 脚本能：
  1. 访问 URL 成功
  2. 找到按钮 selector（`data-testid` 或 accessibility role）
  3. 点击按钮
  4. 断言状态变化
- 375×667 和 393×852 两个 viewport 都可截图
- 中文字符渲染正常（若有 Bagel Fat One 字体从 expo-font 加载）
- `docs/spike-results/SPIKE-005.md` 含 minimal repo path、Playwright script、成功截图

## Acceptance Criteria
- [ ] Playwright 可访问 `http://localhost:8081`
- [ ] `data-testid` 属性通过 RN accessibilityLabel 或 Web platform props 生效
- [ ] 4 字体（Bagel Fat One / Rubik Bubbles / Sniglet / Fraunces）在 web 上加载并显示
- [ ] SVG feTurbulence 撕纸滤镜在 react-native-web + Playwright 里可渲染（关键 —— 这是风格 F 核心）
- [ ] 两个 viewport 截图正确
- [ ] `docs/spike-results/SPIKE-005.md` 完整

## Notes
- react-native-web 有 known issue：某些 RN-only API（Alert.alert、Linking）在 web 上需 polyfill
- SVG 撕纸滤镜是关键——如果 react-native-web + react-native-svg 无法渲染 feTurbulence，风格 F 的核心视觉会崩溃，需要 fallback（比如提前 rasterize 撕纸边缘）
