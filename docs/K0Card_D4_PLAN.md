# K0 卡片重做方案：D4 日夜翻面（融入拼布撕纸风）

## Frank 选择
- **方向 D4 星球/月亮日夜切换**（正面白天 / 反面夜晚 + 3D 翻面）
- **要求**：贴合 K0 UI 主题不能突兀
- **执行时机**：EAS build 完成 + 下一个 OTA
- **暂不改代码**，先 plan

## 现在 D4 demo 的问题（会突兀的地方）

| 现状 | K0 契约 | 冲突点 |
|---|---|---|
| 用 emoji 🌙⭐☀️🪐 | 撕纸风零 emoji（Sprint 13 R2 全清） | ❌ 违反 |
| CSS radial-gradient 深色底 | 拼布纸质底（paperMain/paperCream/paperDark） | ❌ 违反 |
| Google Fonts 手写风 | K0 只用 Bagel Fat One / Fraunces / Sniglet | ❌ 违反 |
| 直角矩形卡 | 撕纸卡带 tornEdge 边缘 | ❌ 违反 |

## 微调后 K0 版本（融入拼布撕纸风）

### 正面（白天面）— "读入"
- **底**：paperCream 米色纸底 + 撕纸边缘（复用 WovenDivider 顶部 + tornEdge SVG）
- **视觉主体**：
  - 一个撕纸风 SVG 太阳（olive 军绿放射线 + yolk 中心圆，撕纸 filter），置于卡片右上角
  - 三层撕纸叠加（shadow + main + highlight），跟 HeadphoneListener 同套画法
- **信息层次**（从上到下）：
  - **左上角小色点** + type 标签（"观点" brick 红 dot / "方法" sapphire 蓝 dot / ...）
  - **insight** Bagel Fat One 字号 18-20，inkPrimary，一句话主标题
  - **quote** Fraunces italic 字号 14，斜引用，左侧 brick 红竖条
  - **底部**：timestamp "3:30 ▶"（brick 红小字 + 撕纸 pill 背景）+ 右下角撕纸 SVG "翻到夜晚 ↻"
- **微旋转** transform: rotate(-0.5deg) 手工感

### 反面（夜晚面）— "回忆"
- **底**：paperDark 深米色（不是黑！保持纸质感）+ 撕纸边缘
- **视觉主体**：
  - 一个撕纸风 SVG 月亮（brown 深棕月牙 + rose 粉月晕，撕纸 filter），右上角
  - 撕纸小星星散布（olive/yolk 3-4 颗小点，非 emoji）
- **信息层次**：
  - **上方**：quote 完整原文（Fraunces italic 大字号，主视觉）—— 反面主打"回忆原文"
  - **中间**：context 上下文（AI 解读，Fraunces 12px inkSecondary）
  - **底部**：podcast 源信息（"来自 声动早咖啡" Sniglet 10px）+ ★ 收藏按钮 + "翻回白天 ↻"
- **微旋转** transform: rotate(0.8deg)

### 翻面动画（Reanimated 已装可用）
- 触发：点击整卡（不要 button）
- 动画：600ms 弹性 rotateY 180deg
- **触觉**：翻面时 expo-haptics `impactMedium`（已装可用）
- **撕纸感增强**：翻面中途 200ms 时刻**盖章一样的 tornEdge 撕纸动效**——用 Skia canvas 画一条撕纸线穿过（Skia 已装可用，装完真派上用场）

### 3 个使用位置的差异

| 位置 | 正面主打 | 反面主打 | 交互 |
|---|---|---|---|
| **Review** 页 | quote 大字 + insight 小字 | context + type + ★ | 翻面看答案 + 3 rating 按钮 |
| **学习包 episode 页** | quote + insight（内联，不翻） | 常驻显示（点右上 ↻ 展开 context） | 常规 star/delete 按钮 |
| **Library 卡片 tab（新页）** | quote + insight + type 标签 | context + podcast 源 + 时间戳 | 长按 or 右上 ↻ 翻面 |

## 涉及的组件重构

### 新建
- `components/K0Card.tsx` —— 统一卡片组件（覆盖 Review + 学习包 + Library）
  - Props: `card`, `variant: 'review' | 'library' | 'episode'`, `flippable: boolean`, `onFlip?: (isBack: boolean) => void`, `onStar`, `onDelete`
  - 用 Reanimated `withSpring` 做翻面
  - 用 Skia 画撕纸线（可选，若卡片翻面性能不好回退到 SVG）
- `components/illustrations/TornSun.tsx` —— 撕纸风太阳 SVG
- `components/illustrations/TornMoon.tsx` —— 撕纸风月亮 SVG
- `components/illustrations/TornStar.tsx` —— 撕纸风星星 SVG（小配饰）

### 替换
- `app/review.tsx`：内嵌卡片 → `<K0Card variant="review" flippable onFlip={handleFlip} />`
- `app/episode/[id].tsx` line 813-970 卡片内联渲染 → `pack.cards.map(c => <K0Card variant="episode" card={c} />)`
- `app/library.tsx` line 250-290 libCard 内联 → **新建 `app/card/[packId]-[cardIdx].tsx` 页面**，卡片 tab 点击跳详情页展示 K0Card variant="library" flippable

### 删除
- 现有 `components/KnowledgeCard.tsx`（Review 页用的，被 K0Card 覆盖）
- Library `libCard*` styles
- Episode 页 `cardQuoteBlock` `cardTrashBtn` 等内联卡片 styles（~200 行）

## 依赖利用（已装齐等 build）

| 装了的 | 拿来做什么 |
|---|---|
| react-native-reanimated + worklets | 翻面动画 rotateY spring |
| react-native-gesture-handler | 卡片长按/滑动手势（未来卡组 Tinder 式切换） |
| @shopify/react-native-skia | 撕纸线中途动画 |
| expo-haptics | 翻面触觉反馈 |
| expo-blur | ？ 不需要，卡片本身是撕纸不用 blur |
| expo-linear-gradient | ？ 可选，卡片底可轻微渐变（paperCream→paperMain）加纸感 |

## 执行时机与 OTA 编号

- **v25 OTA**（EAS build 完成后立即发的 baseline）—— 只有当前代码 + 图标 + 依赖，不含 K0Card
- **v26 OTA**（1-2 天后）—— K0Card 组件实现 + 3 处替换

## 开发工作量估算

- 3 个 SVG 撕纸插图：1 小时
- K0Card 组件（不含 Skia 增强，先 SVG + Reanimated）：3 小时
- Review 页替换 + Rating 按钮联动：1 小时
- 学习包页替换 + 常驻显示：1 小时
- Library 卡片详情页（新建 app/card/[id].tsx）：2 小时
- 触觉 + 微调 + Playwright 验证 web：1 小时
- **合计 ~9 小时** —— 可以 1 天做完，v26 OTA 稳发

## 风险

1. **Reanimated + New Arch**：Sprint 13 时 K0 已 newArchEnabled=true，Reanimated 4.5+ 应支持但需 build 后实测
2. **翻面卡组 Tinder 式**：如果 Library 卡片列表想左右滑切换，需要 gesture-handler 完整重构，工作量倍增 —— **v26 先做单卡翻面，Tinder 式留 v27**
3. **Skia 撕纸线中途动画**：如果性能不好会跳帧，**先做 SVG 版本，Skia 增强留 v27**

## Frank 决策等待

- v26 OTA 是**只做单卡翻面**（我建议这样，快出效果）还是**同时做 Tinder 卡组切换**（一次到位但慢）？
- 3 处替换是**一次全上**还是**先 Review 试用户反馈再推**？
