# UX Review — Sprint 3

**Date**: 2026-07-05
**Sprint**: 3
**Confidence**: HIGH

## Summary

Sprint 3 主流程功能可用，但**美术执行度与 iOS 原生交互习惯存在显著差距**——与用户直接反馈"图形还是太粗糙了 / 手机大小的 UI UX 要学会思考人类喜欢的模式"高度吻合。整体配色、语气、信息层级方向正确；**Cutout Illustrated 撕纸风的核心执行元素（撕纸边缘、多层叠加、手工错位）几乎完全缺失**，评分条/进度 accordion 等 UI 组件与撕纸温暖手工感严重冲突。

**结论**：Sprint 3 通过了功能验收，但 UX 层面**必须在 Sprint 4 集中修复至少所有 Critical friction 后**才能推进 Virtual User 验收。

## Friction Items

### Critical（Sprint 4 必修）

1. **Home 头像插画像 Figma 3 分钟拼图** — 头部只有蓝帽+红耳机+黄点，脸部纯深棕色无撕纸层次/纸质纹理/描边细节。Style F 要求"纸边毛糙、多层叠加、可见撕痕"，当前接近 emoji-only。（smoke-01）
2. **Learn/Review/Library 三个卡片图标都是 placeholder 级** — 葡萄串/紫色斑点/书柜三风格不统一（葡萄有描边、Review 只是一坨色、Library 像素画），破坏 Cutout Illustrated 一致性。（smoke-01）
3. **彩色条纹分隔线过于机械** — 等宽色块直接拼接无撕纸边缘/纸叠层/手绘错位。撕纸风最该做出手工感的元素反而做成了最平面的元素。（smoke-01, smoke-03）
4. **Home 缺 primary CTA 在拇指可达区** — 用户任务是"粘贴播客链接"，但屏幕下 1/3 是 Library 卡片一角。iOS 原生模式应 Home 底部固定"粘贴链接"输入框或 FAB 一步直达。（smoke-01）
5. **GoalSelect 5 按钮顺序反了** — "快速了解 → 深度学习 → 找可执行方法 → 批判性思考 → 为工作使用"把最短耗时放最上，需要拇指伸最远。iOS HIG 推荐最常用项放底部拇指自然落点。（smoke-02）
6. **Episode 评分用红点条** — 8/7/6 显示为 ●●●●●●●●○○ 像 App Store 评分/游戏血条，与撕纸温暖手工感冲突。应改用手撕小圆点/彩色贴纸/铅笔勾画。（smoke-03）
7. **6 步学习路径全部折叠为空 accordion** — 无"我走到哪"视觉预告。撕纸风应该用手工进度线（彩色纸带穿过所有步骤，走过部分变实心/贴金色贴纸）。当前是最普通冷淡的 accordion。（smoke-03）

### Medium

8. GoalSelect 右上角"选个目标" pill 与主标题"今天怎么学？"冗余。（smoke-02）
9. GoalSelect 输入预览"「文本 · This is a short English test t...」"像开发者调试字符串，应显示原文前两句或"约 XX 字"。（smoke-02）
10. Episode "快速了解" pill 与 GoalSelect "选个目标" pill 视觉一样，区分不出导航/状态/可操作。（smoke-03）
11. "0/6 步骤已完成"字号偏小灰色 — 应放大加粗或用撕纸小旗子/贴纸形式。（smoke-03）
12. iPhone SE (375×667) 上 Home 只见 Learn+半张 Review，Library 完全折下 — 三入口卡片小屏可见性差。（smoke-04）
13. 全应用无微交互暗示（无卡片 tilt、无 haptic 视觉、无过渡动效）— 撕纸风尤其适合"翻面 tactile 动效"，缺失是"粗糙"感的重要来源。（smoke-01）
14. Home 卡片主副文字对比度弱（都白色相近字号）— iOS 原生应两级层级明确。（smoke-01）

### Low

15. iPhone 15 Pro Max 上主标题/插画未随屏放大，大屏感觉字体"缩水"。（smoke-05）
16. "← 返回"箭头+中文字非 iOS 原生返回样式（原生是"‹ 上一屏名"或大标题+侧边 back gesture）。（smoke-02）

## Wins

- **配色**（暖米色底 + 红/黄/蓝三主色 + 深棕字）是整个设计里唯一稳定接近 Cutout Illustrated 情绪的部分，有报纸/杂志手工温度。
- **中文正文字号（15-16pt）与英文标题（Fraunces-like 衬线粗体）搭配大方克制**，没有堆 emoji 或炫技动效，符合"安静的学习工具"定位。
- **"今天怎么学？"这个 GoalSelect 主标题写得极好** —— 口语化、拟人化、把技术选项变成对话，比"Select Learning Mode"高出一档。
- **Episode 页信息组织**：摘要+3 要点+3 tag 集中在顶部一张纸，一眼看到全部核心；6 步学习路径清晰分层。
- **"10 分钟 · 产品经理 · 创业者"chip 组合** 3 秒内让用户知道"这集给谁看、花多久"——内容型产品最难做对的一件事，做对了。

## Untested Paths

- 中文长文本粘贴交互（键盘弹出/粘贴反馈/字符计数）
- GoalSelect → Episode 生成过程 loading 态（AI 生成可能 5-15s，无过渡会感觉卡死）
- 6 步学习路径展开后每步详细内容与交互
- 3 张记忆卡片的正反翻转/收藏/删除
- 空状态（Library 无卡片、Review 无待复习）
- 错误状态（网络中断、AI 失败、无效 URL）
- 深色模式（Cutout Illustrated 在 dark mode 下如何保留纸质感）
- 触觉反馈（haptic）在关键操作点是否触发

## Knowledge Updates (appended to docs/ux/knowledge.md)

- **Cutout Illustrated 执行标准**：所有插画/图标/分隔线必须有 (a) 可见撕纸边缘 (b) 多层叠加阴影 (c) 手工错位/不完美对齐 — 三缺一即为 placeholder 级。
- **iOS 原生 primary action 拇指可达**：Home 首屏底部 1/3 必须有直达主任务入口，不能只是导航卡片。
- **撕纸风与信息可视化冲突时（评分/进度条）必须重新设计视觉隐喻**——不用红点阵/血条等游戏化元素。
- **5 个以内目标列表按"用户最可能选"倒序**：最常用项放底部拇指落点，而非按耗时或难度排序。
- **输入 preview 显示原文开头**而非元数据字符串——让用户确认"AI 拿到了我给的东西"。
- **微交互和过渡动画不是锦上添花**，是撕纸风 tactile 情绪的核心载体，缺失会让整体感觉粗糙。
- **iOS pill/chip 必须视觉区分三种角色**：导航按钮 / 状态标签 / 可操作 chip。

## Evidence

`docs/qa/sprint3-evidence/`（QA 与 UX 共用同一批截图，避免重复截图 —— CLAUDE.md §Evidence efficiency rules）。
