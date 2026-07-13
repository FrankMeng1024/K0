# K0 iPad 横屏适配 —— 小组件 / 全局机制排查 Checklist

> 调研范围：全局导航容器、共享小组件、Modal、各页面、字号间距、插画、交互、横竖屏切换。
> 只读调研，未改任何代码。断点 hook：`hooks/useResponsive.ts`，`isWide = 宽≥900 且 横屏`。
> 参考实现：`app/index.tsx`（首页已做 `isWide` 分支 + 宽屏专属 `stylesWide`，容器 `maxWidth: 1194 + alignSelf: center`）。
>
> 核心发现：**几乎所有内页(learn/review/card/snapshot/episode/library)都用同一套结构——`ScreenHeader` + `ScrollView`，content 容器只有 `paddingHorizontal: spacing.xl(24)`，没有任何 `maxWidth` 或居中限宽。** 在 iPad 横屏(1194 宽)下正文会拉成一整条超宽行，可读性差。这是最大的共性问题。

---

## 一、必须适配（不做会明显变丑 / 影响可用性）

| 组件 / 文件 | 问题 | 建议做法 |
|---|---|---|
| **`app.json`** | `ios.supportsTablet: false` → iPad 上以手机模拟窗（非原生 iPad 分辨率），`useWindowDimensions` 拿不到真横屏宽度，`isWide` 永不触发。`orientation: portrait` 也锁竖屏。 | 演示前置：`supportsTablet: true` + `orientation: default`（或保留 portrait 靠 `expo-screen-orientation` 运行时解锁）。**改这两项必须 EAS build，不能 OTA**（需 Frank 授权）。 |
| **`components/ScreenHeader.tsx`** | 全站顶栏。`dividerWidth = min(width - 48, 380)`，`paddingHorizontal: spacing.xl` 全宽。iPad 横屏下标题/织带贴左边、右侧大片空白，与首页宽屏居中不一致。 | 加 `isWide` 分支：内容限宽 + 居中（如 `maxWidth: 900, alignSelf: center`），divider 宽度随之。 |
| **`app/episode/[id].tsx`** | 详情页 `innerContent` 只有 `paddingHorizontal: spacing.xl`，无限宽。SnapshotCard/步骤/行动/转录在 1194 宽下全部拉满，长文本一行过宽。主 agent 正在做此页。 | ScrollView content 或 innerContent 加 `maxWidth`(如 720-820) + `alignSelf: center`；或宽屏走两栏（左脑图/卡片，右步骤/转录）。 |
| **`app/library.tsx`** | 列表页同样全宽无限宽，`SwipeablePackCard` 会拉成超宽行；横屏一行只放一个包很浪费。 | 宽屏限宽居中，或列表改 2 列网格；`SwipeablePackCard` 左滑删除阈值(`DELETE_BTN_WIDTH=80`)在宽卡上占比过小需确认手感。 |
| **`components/episode/CardsCarousel.tsx`** | 横向轮播 `cardWidth = containerWidth - PEEK(24)`，即“一屏一张卡”。iPad 横屏 containerWidth≈1100 → 单张卡宽 1000+，卡片被撑到荒诞宽度。 | 宽屏改“一屏多张”（按 containerWidth 算列数，如 2-3 张）或给单卡设 `maxWidth`(如 420) 居中，snapInterval 随之调整。 |
| **`components/AudioPlayerBar.tsx`** | 底部全局播放条 `left:0/right:0` 全宽拉伸。iPad 横屏下进度条/时间横跨整屏，比例失衡。 | 内层 `inner` 加 `maxWidth`(如 720) + `alignSelf: center`，两侧留白。 |

---

## 二、建议适配（不影响功能，但更精致 / 更符合首页宽屏水准）

| 组件 / 文件 | 问题 | 建议做法 |
|---|---|---|
| **`app/login.tsx`** | 纯表单页，`cardWidth = min(width-40, 380)` 已限宽，但整体靠 padding 布局，横屏下垂直空间矮、可能挤。 | 横屏时表单卡居中(已接近)，确认键盘弹出(`KeyboardAvoidingView`)横屏不遮输入框。低优先。 |
| **`app/snapshot/[packId].tsx`** | 快照页全宽 content，长句 oneSentence / worthListening 列表横屏过宽。 | 同详情页，限宽居中。 |
| **`app/card/[key].tsx`** | 单卡详情，K0Card `variant=library` 固定高 440，但外层 content 全宽，卡片会横向拉伸。navRow 上一张/下一张按钮两端分布，横屏跨度大。 | content 限宽居中(如 480)，K0Card 加 `maxWidth`。 |
| **`app/review.tsx`** | Review 用 K0Card 翻面卡 + rating 按钮，content 全宽 → 卡片过宽、rating 按钮跨度大。 | 限宽居中(如 480)。 |
| **`app/learn.tsx`** | 粘贴 URL 表单页，`TextInput` 全宽 → 横屏输入框超长。 | 表单区限宽居中(如 560)。 |
| **`components/K0Card.tsx`** | 卡片本身宽度由父容器决定，`CARD_MIN_HEIGHT=320`。宽屏下若父不限宽会拉很宽，字距/行宽变差。 | 不改组件，靠各调用处父容器限宽即可；或组件内加可选 `maxWidth` prop。 |
| **`components/graph/ForceGraph.tsx` / `MindMap.tsx`** | 脑图全屏已用 `useWindowDimensions` 且做过横屏锁定(R39/R40)，理论上横屏是它的原生场景。但 `fsDetail` 详情面板 `width: 340` 硬编码，超大屏可能偏小。 | 全屏脑图在 iPad 横屏应直接受益，重点验证：内嵌(非全屏)预览在宽屏是否变形；`fsDetail` 面板宽度是否需按屏宽放大。 |

---

## 三、可不管（横屏下无明显问题 / 自适应已 OK）

| 组件 / 文件 | 原因 |
|---|---|
| **`app/_layout.tsx`** | Stack `contentStyle` 只设背景色，无固定宽度/maxWidth；SafeAreaProvider + 各页 `useSafeAreaInsets` 已处理刘海。横屏左右 inset 由各页 padding 吸收，无需全局改。 |
| **所有 SVG 插画**（`HeadphoneListener` / `EntryIcons` / `WovenDivider` / `TornMoon/Star/Sun` / icons） | 全部 `size` prop 驱动 + viewBox 矢量缩放，父给多大画多大，不会失真。首页宽屏已传更大 size(132/56)，按需传参即可，组件本身无需改。 |
| **`components/BubbleTag.tsx`** | `alignSelf: flex-start` 自适应内容宽度，横屏不拉伸。 |
| **`components/ConfirmDialog.tsx`** | 已有 `maxWidth: 340` + 居中 backdrop，横屏天然居中不拉满。 |
| **首页 version popup / upload debug Modal**（index.tsx + login.tsx `versionCard`） | `minWidth: 260` + backdrop 居中，横屏自动居中不拉满，无需改。 |
| **`components/EpisodeCard.tsx`** | 内部 `cover 72` 固定 + `meta flex:1`，卡片宽由父定；仅在 learn 流程短暂出现，限宽父容器即可覆盖。 |
| **字号 / 间距 token**（`constants/theme.ts`） | 首页宽屏是就地放大字号(hero 56→76)，不改全局 token。建议维持“token 不动、宽屏分支就地放大”策略，避免影响手机竖屏。 |
| **触摸目标 / hover** | RN 无 hover 依赖；按钮多用 `hitSlop`，触控板/外接键盘无特殊代码需求。iPad 无刘海手势不影响（返回用页面内按钮，非边缘手势）。 |

---

## 四、横竖屏切换（运行时旋转）注意事项

1. **当前锁竖屏**：`app.json` `orientation: portrait` + `expo-screen-orientation` `initialOrientation: PORTRAIT_UP`。真机旋转要横屏，必须改 app.json 并 **EAS build**（OTA 无法解锁方向）。
2. **旋转不丢状态**：布局全走 `useWindowDimensions`（响应式，随旋转实时更新），非 `Dimensions.get('window')` 一次性取值 → 旋转会自动重排，React state 不重置。**唯一坑**：`useResponsive` 的 `isWide` 会随旋转在 true/false 间跳变，导致首页在竖/横屏之间切换整套 UI 树（`if (isWide) return ...`），可能触发子组件 remount。需验证旋转时 CardsCarousel 的 `activeIdx`、脑图缩放态是否被重置。
3. **脑图全屏 Modal**：`ForceGraph` 已按横屏设计（R39 真机锁横屏 Modal 独占）。要确认 iPad 上“进全屏”与“系统已横屏”叠加时不会二次旋转/坐标错乱（历史有 TDZ 崩溃坑，见 R43 诊断代码）。
4. **AudioPlayerBar 监听 pathname 停音频**：与方向无关，旋转不影响；但旋转若触发某些页面 remount，注意别误触发 stop。

---

## 演示最小改动建议（不含大重构）

1. `app.json`：`supportsTablet: true` + 解锁横屏 → **需 EAS build + Frank 授权**。
2. 抽一个共享的“宽屏内容容器”思路（`maxWidth ~800 + alignSelf: center`），套到 ScreenHeader 下方各页 content。一处模式、多页复用（符合项目“组件复用 + 数据/布局统一”原则）。
3. CardsCarousel + AudioPlayerBar 两个全宽拉伸组件单独加 `isWide` 限宽分支。
4. 其余页面（learn/review/card/snapshot/login）限宽居中即可，工作量小。
