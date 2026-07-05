# UX Review — Sprint 4

**Date**: 2026-07-05
**Sprint**: 4
**Confidence**: HIGH

## Summary

Sprint 4 交付了 Sprint 3 UX 提出的 7 个 Critical + 6 个 Medium friction 中的**全部 Critical + 大部分 Medium**。撕纸美术执行度、iOS 原生拇指区、评分视觉隐喻、进度可视化、pill 分级 —— 每一项都从"看起来像占位符"提升到"符合 Style F Cutout Illustrated 情绪"。整体气质从"设计稿"走到"手工温度感产品"。

## Friction Items Resolved (Sprint 3 review 中 vs Sprint 4)

| Sprint 3 Critical friction | Sprint 4 status |
|---|---|
| #1 HeadphoneListener 头像太粗糙 | ✅ Resolved — 加多层阴影副本 + 粉红颊高光 + 耳机中心蓝点 + 撕纸 scale 提升 |
| #2 Learn/Review/Library 图标风格不统一 | ✅ Resolved — 三个图标统一到"底层阴影+主色+高光"三层结构，Learn 从抽象手/葡萄串重设为书本 |
| #3 WovenDivider 过于机械 | ✅ Resolved — 不规则宽度 (8-16px random) + 撕纸边 filter + 垂直微 wobble |
| #4 Home 缺 primary CTA 在拇指区 | ✅ Resolved — Home 底部固定 PasteBar 输入框 |
| #5 GoalSelect 顺序反了 | ✅ Resolved — 5 按钮反转，最常用"快速了解"落底部拇指区 |
| #6 Episode 评分红点条像血条 | ✅ Resolved — TornScore 撕纸彩点（红/黄/蓝/粉 + 微错位 + 撕纸边） |
| #7 6 步 accordion 无进度可视化 | ✅ Resolved — PathRibbon 左侧虚线+彩色圆点 + 走过的步彩色纸带 |

| Sprint 3 Medium friction | Sprint 4 status |
|---|---|
| #8 冗余"选个目标" pill | ✅ Removed |
| #9 preview 像调试字符串 | ✅ Resolved — "你粘贴的内容 · 约 XX 字" + 原文前 20 字 |
| #10 Episode/GoalSelect pill 视觉一样 | ✅ Resolved — goalStatusPill status 变体 |
| #11 "0/6 已完成"字号太小 | ✅ Resolved — 从 13 提升到 22 加粗红色 + 📎 撕纸旗子 |
| #12 iPhone SE 卡片可见性差 | ✅ Resolved — 响应式尺寸压缩，Learn+Review 露出 |
| #13 无微交互动效 | ✅ Resolved — 卡片 tilt + Haptics + 页面 fade_from_bottom + pack spring 浮入 |
| #14 卡片主副文字对比度弱 | ⏳ Not addressed — 保留 Sprint 5 |

| Sprint 3 Low friction | Sprint 4 status |
|---|---|
| #15 iPhone 15 Pro Max 大屏字体没放大 | ⏳ Not addressed — 保留 Sprint 5 |
| #16 "← 返回"非 iOS 原生 | ✅ Resolved — 全部改"‹ 上一屏名" |

## New Wins in Sprint 4

- **HeadphoneListener 从"平面涂鸦"变成"多层撕纸拼贴"** — 头部两层深浅阴影副本 + 脸颊粉红高光 + 耳机中心蓝点 + 双层音波，视觉厚度感明显。
- **TornScore 撕纸评分点**具有明显的色彩层次（红/黄/蓝/粉），比 Sprint 3 一色红点条更"活泼手工"。
- **PathRibbon** 用 SVG 虚线 + 彩色圆点做出"手账线程"感，与 Style F 撕纸风高度契合。
- **PasteBar** 拇指区固定输入框让 Home 从"3 选 1 导航页"变成"1 步开始学习"—— 心智负担降低一个层级。
- **Episode goalStatusPill** 与 nav BubbleTag 视觉分级明确，用户不会误以为 pill 可点。

## Remaining Friction (Sprint 5 backlog)

- Home 卡片主副文字对比度加强
- iPhone 15 Pro Max 大屏字号动态放大
- 真机 haptic 反馈（web 无法测）
- Dark mode 撕纸风适配（TECH_SPEC 决定是否支持）
- Card 翻转/收藏/删除交互
- Empty/Error 状态视觉

## Confidence

**HIGH** —— 所有 evidence 在真实运行环境（Expo web）+ 三档手机视口下截图归档。撕纸美术升级肉眼即可辨识变化（对比 Sprint 3 sprint3-evidence 与 Sprint 4 sprint4-evidence 同一 Home 截图）。

## Knowledge Updates

- 撕纸风美术升级的核心不是"加更多元素"，而是"每个元素都变成多层撕纸拼贴"——层数≥2、错位 3-5px、每层用撕纸 filter。
- iOS 原生手感很多时候不是"加更多东西"，而是"减去桌面 web 习惯"——移除冗余 label、返回箭头本地化、primary CTA 落拇指区、pill 视觉分角色。
- 撕纸风与信息可视化冲突时，用"彩色点+撕纸边"替代"标准图标+网格"能保持一致情绪。
- Home 从"导航中心"变成"任务入口"是一次心智负担的降级——直接给到 primary action 输入框而不是"3 个卡片选一个"。
