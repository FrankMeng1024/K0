# Sprint 4 Goal

**主题**: 美术精修 + iOS 原生 UX 校准
**Sprint window**: 2026-07-05 → next
**Focus**: 把 Sprint 3 的 UX Critical friction 全部消除，达到"人类喜欢的手机原生 App"水准。

## Stories

| ID | 类型 | 主题 | Points | Owner |
|---|---|---|---|---|
| STORY-00100 | Design | Cutout Illustrated 插画精修 — 头像/图标/条纹分隔线全套重做（撕纸边+多层叠+手工错位） | 5 | Frontend + Arch |
| STORY-00101 | UX | Home 底部固定 primary CTA "粘贴链接" 输入框，替换纯导航卡片布局 | 3 | Frontend |
| STORY-00102 | UX | GoalSelect 目标列表按"最常用底部"重排 + 移除冗余右上 pill + 输入 preview 改为原文开头 | 2 | Frontend |
| STORY-00103 | UX | Episode 评分从红点条改为撕纸手撕彩点/铅笔勾画 + "0/6 已完成"放大加粗 + 6 步 accordion 加撕纸进度条穿过 | 5 | Frontend + Design |
| STORY-00104 | UX | iPhone SE 小屏 Home 卡片可见性优化（横向 chip 或折叠） | 2 | Frontend |
| STORY-00105 | UX | 微交互全套：卡片 tilt on press、haptic 触发、页面过渡（撕纸翻面感） | 3 | Frontend |
| STORY-00106 | UX | iOS 原生返回样式："← 首页" 改为"‹ 上一屏名" + 支持侧边 back gesture | 1 | Frontend |
| STORY-00107 | UX | pill/chip 视觉分级（导航/状态/可操作三种视觉语言） | 2 | Design + Frontend |
| STORY-00110 | Feature | 中文长文本粘贴 flow 完整验收（Sprint 3 只测了英文） | 2 | QA + Frontend |

**总点数**: 25

## Definition of Ready 检查
- 所有 Story ACs 具体、可独立验证
- 每个 Story 都有对应的 Sprint 3 UX friction item 或 QA untested_path 作来源
- 已识别技术依赖：无 spike 需求（都是前端 UI 优化）

## 参考文档
- `docs/ux/sprint3-review.md` — 每个 Critical friction 对应本 Sprint 一个 Story
- `docs/UI_SPEC.md §style-F` — Cutout Illustrated 执行标准（撕纸边缘、多层叠加、手工错位三缺一即为 placeholder）
- `FRONTEND_STANDARDS.md §Product Soul Protocol` — 情绪核心与交互故事
