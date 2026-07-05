# Arch Code Review — Sprint 4

**Date**: 2026-07-05
**Sprint**: 4
**Verdict**: PASS

## Summary

Sprint 4 主题"美术精修 + iOS 原生 UX 校准"。9 个 Story 全部 Done，动了 3 类改动：
1. **新组件**：`components/PasteBar.tsx`, `components/TornScore.tsx`, `components/PathRibbon.tsx`
2. **升级现有组件**：`HeadphoneListener` 加多层撕纸阴影、`EntryIcons` 三统一到"底层阴影+主色块+高光"结构、`WovenDivider` 改不规则宽度+撕纸边、`tearing.strong.scale` 9→18
3. **屏幕结构调整**：Home 加底部固定 PasteBar + 小屏（≤700pt）响应式尺寸、GoalSelect 反转 5 目标顺序 + preview 改进、Episode 换 TornScore/PathRibbon + status pill 变体

## Issues

| Severity | Story | Description |
|---|---|---|
| Low | STORY-00107 | BubbleTag 未真正加 `variant` prop —— Episode 顶部 pill 通过独立 `goalStatusPill` 样式实现，Home/Episode 其他 chip 保持原样。视觉分级达到但 API 不统一，未来若新增 pill 需注意保持一致。建议 Sprint 5 refactor 时补 variant。 |
| Low | STORY-00110 | 中文流程只在 no-DB + placeholder GLM key 下测（走 buildMockPack），mockPack 内容硬编码为 AI 产品数据飞轮英文语境的翻译文本，非真实 GLM 生成的中文内容。真实 GLM 中文回复能力尚未在 Sprint 4 端到端验证。 |
| Medium | STORY-00105 | 页面切换动画 `fade_from_bottom` 在 web 上表现为纯 fade（无 slide），需在真机 iOS 验证。 |
| Medium | Episode 页 | 遗留死代码 `styles.scoreDots/scoreDot/scoreDotFilled`（ScoreDot 已用 TornScore 替代）。不影响运行，Sprint 5 清理。 |

## Spec Drift

None。所有改动符合 UI_SPEC §chosen-style 撕纸风约束，符合 FRONTEND_STANDARDS。

## Notes

Sprint 4 是 Sprint 3 UX Critical 全部翻篇。开发速度快因为 Story 都在 UI 层，无 backend/schema 改动。适合作为 TestFlight 首个内测版本。
