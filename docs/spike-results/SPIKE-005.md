# SPIKE-005: react-native-web + Playwright 集成可行性

**Status**: **VIABLE** ✅
**Date**: 2026-07-04
**Executor**: Frontend + QA
**Location**: `_spike/spike-005/`

---

## 目标（回顾）
验证 Expo Web (react-native-web) + Playwright 能否稳定测试 K0 App，且风格 F 关键视觉（Bagel Fat One 胖字母、SVG feTurbulence 撕纸滤镜）能在 web 上渲染。

## 环境
- Node.js 25.8.2（远超 Node 20 LTS 要求）
- npm 11.11.1
- Windows 11
- Playwright MCP 已就绪
- Expo SDK 57 + React 19.2.3 + RN 0.86.0（默认最新）
- react-native-web + react-native-svg + expo-font + @expo-google-fonts/bagel-fat-one

## 测试内容

### 关键测试点
1. **字体加载**：Bagel Fat One 通过 expo-font + @expo-google-fonts/bagel-fat-one 加载
2. **SVG feTurbulence 撕纸滤镜**：react-native-svg 在 web 端能否渲染
3. **中文渲染**：包括中文标点
4. **testid 定位**：RN `dataSet={{ testid: 'x' }}` → DOM `data-testid="x"`
5. **交互**：Pressable + useState 状态更新
6. **多 viewport**：375×667 (iPhone SE) + 393×852 (iPhone 15 Pro)

### 具体命令
```bash
cd _spike && npx create-expo-app@latest spike-005 --template blank-typescript
cd spike-005
npx expo install react-native-web react-dom @expo/metro-runtime react-native-svg expo-font
npx expo install @expo-google-fonts/bagel-fat-one
npx expo start --web --port 8090
```

### Playwright 测试脚本片段
```js
await page.goto('http://localhost:8090');
await page.getByText('LearnK0').waitFor({ state: 'visible' });
await page.setViewportSize({ width: 375, height: 667 });
await page.screenshot({ path: 'preview/375x667.png' });
await page.getByText('Tap me').click();
// 验证 data-testid
const testids = await page.evaluate(() =>
  Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid'))
);
// = ['app-root', 'headline', 'increment-btn', 'click-count', 'chinese-text']
```

## 结论

**每个测试点全部通过**：

| 测试点 | 结果 | 备注 |
|--------|------|------|
| Bagel Fat One 字体加载 | ✅ | 首次访问需 ~15 秒（含 metro bundle + font download），生产 build 会快很多 |
| SVG feTurbulence 撕纸滤镜 | ✅ | 红方块 + 蓝圆形都有明显撕纸边缘（不是光滑边）—— 风格 F 核心视觉已在 web 端还原 |
| 中文渲染 | ✅ | 系统 fallback 字体渲染中文，标点正常 |
| RN dataSet → data-testid | ✅ | 5 个 testid 全部识别 |
| Playwright 交互 | ✅ | `Tap me` 点击后 `Clicks: 0 → 1` |
| 375×667 布局 | ✅ | 见 `preview/375x667.png` |
| 393×852 布局 | ✅ | 见 `preview/393x852.png` |
| 0 console error | ✅ | `browser_console_messages(level="error")` 返回 0 |

## 视觉证据
- `preview/375x667.png`（iPhone SE）
- `preview/393x852.png`（iPhone 15 Pro）

## 已知限制 / 注意事项

1. **首次 Metro bundle 慢**：约 15-25 秒。QA 脚本需在 `page.goto()` 后先等元素可见再截图，不能立刻截。
2. **RN Web 特殊 prop**：
   - `dataSet={{ testid: 'x' }}` 需加 `// @ts-ignore`（TS 类型不认识，但 runtime OK）
   - 生产版可用 `Platform.select` 或 web-only wrapper 组件包装
3. **react-native-svg 版本**：15.x+ 支持完整 SVG filter API。我们已装最新（默认随 Expo 57）
4. **字体加载失败降级**：`useFonts` 返回 `false` 时显示 loading 屏。生产版需用 SplashScreen 遮盖，避免 FOUT。
5. **一些原生 API 需 mock**：`Alert.alert`、`Haptics`、推送等在 web 上无实体。QA 覆盖 UI 逻辑，iOS 原生行为由 TestFlight 兜底（预期方案，非 bug）。

## 对 K0 Sprint 1 后续 Story 的启示

- **STORY-00001 Expo 骨架**：需要提前把 expo-font + react-native-svg + react-native-web + 4 字体（Bagel Fat One / Rubik Bubbles / Sniglet / Fraunces）一起加进 package.json。
- **STORY-00003 RN 首页**：SVG 撕纸滤镜可放心用（本 spike 已证）。但每次页面首屏需 loading fallback（等字体）。
- **QA 脚本模板**：所有 Playwright 测试用例应遵循 `page.goto() → waitFor → screenshot → interact → assert` 的顺序。
- **testid 命名规范**：Frontend 加 `dataSet={{ testid: 'kebab-case-name' }}`；QA 用 `page.getByTestId('kebab-case-name')` 或 `[data-testid="..."]` 选择。

## 采纳到 knowledge

- `docs/qa/knowledge.md` 追加：SPIKE-005 已证 react-native-web + Playwright 组合稳定
- `docs/ux/knowledge.md` 追加：首屏加载策略（loading → 字体就绪 → 内容）

---
