# QA Verdict — Sprint 4

**Date**: 2026-07-05
**Sprint**: 4
**Verdict**: PASS

## Summary

Sprint 4 完整 flow 在 iPhone 14 视口 (390×844) 端到端跑通：Home PasteBar 输入 → Learn 预填 → EpisodeCard 语言识别 → GoalSelect 反转顺序 + 中文/英文两语 preview → Episode 撕纸风 pack 完整渲染。iPhone SE (375×667) 视口 Home 结构响应式收缩验证通过。三档视口 (iPhone SE / 14 / 15 Pro Max) 撕纸美术升级肉眼可辨。0 console error 贯穿全流程，3 个 API 调用（import / generate / jobs）全部 200。

## Per-Story

| Story | Verdict | Confidence | Notes |
|-------|---------|-----------|-------|
| STORY-00100 | PASS | HIGH | tearing.strong.scale 9→18 撕纸边肉眼可辨；HeadphoneListener 加多层阴影+粉红颊高光；EntryIcons 三统一（Learn 从葡萄串重设为书本）；WovenDivider 不规则宽度+撕纸边。见 sprint4-evidence/story-00100-01。 |
| STORY-00101 | PASS | HIGH | Home 底部 PasteBar 固定 + `/learn?text=...` 预填链路 verified。iPhone 14/SE 视口均确认拇指区可达。 |
| STORY-00102 | PASS | HIGH | 5 目标反转（for_work→...→quick_understand）√；冗余 pill 移除 √；preview 改"你粘贴的内容 · 约 120 字" + 原文前 20 字 √。见 sprint4-evidence/story-00102。 |
| STORY-00103 | PASS | HIGH | TornScore 撕纸彩点替代红点血条 √；PathRibbon 左侧虚线+彩色 step 圆点 √；progressBanner "0/6 步骤已完成"从 body-13 提升到 hero-22 + 📎 撕纸旗子 √；goalStatusPill 与 GoalSelect pill 视觉区分（浅色底、无红点、无箭头）√。见 sprint4-evidence/story-00103。 |
| STORY-00104 | PASS | HIGH | iPhone SE (≤700pt) 响应式：HeadphoneListener 130→100、卡片 96→80、gap 24→14。Learn 卡完整 + Review 露出标题 + PasteBar 底部固定。见 sprint4-evidence/story-00104。 |
| STORY-00105 | PASS | MEDIUM | 页面转场 `fade_from_bottom` 全局启用（web 上表现为 fade）；Home/GoalSelect 卡片 press 加 tilt (scale 0.97 + rotate ±0.4°)；Episode pack 加载完成 spring 浮入动画；Haptics 在 iOS 原生生效（web no-op）。动效需真机验证故 confidence MEDIUM。 |
| STORY-00106 | PASS | HIGH | 全 3 屏返回按钮改"‹ 首页" / "‹ 选目标" iOS 原生样式 √。侧边 back gesture 由 Expo Router 默认启用。 |
| STORY-00107 | PASS | MEDIUM | Episode 顶部 pill 用 goalStatusPill status 变体（浅色底、无红点、无箭头）与 Home nav BubbleTag（红点+彩色底）视觉分级达到目的。BubbleTag 未加 formal `variant` prop —— Arch review 已 flag 作为 Sprint 5 refactor。 |
| STORY-00110 | PASS | HIGH | 中文 293 字文本 → 语言识别"中文" √；EpisodeCard 中文预览 √；GoalSelect "约 120 字" + 中文原文 √；Episode 页 pack 全中文渲染 √。见 sprint4-evidence/story-00110。 |

## Bugs

无新 bug 发现。Sprint 3 的 2 bug 修复保持有效（Home → Learn → GoalSelect → Episode → goBack 无回归）。

## Untested Paths

- 真实 GLM 中文生成（本 Sprint 全走 buildMockPack fallback，mockPack 内容为硬编码文本）
- iOS 原生真机测试（web 上无法完整验证 haptic、fade_from_bottom 原生动画、safe-area 灵动岛适配）
- Landscape orientation
- Dark mode（TECH_SPEC 未启用）
- Card 翻转/收藏/删除交互（未实现）
- Empty state（Library 无卡片、Review 无待复习）
- Rapid double-tap goal button race
- Network error / GLM timeout 分支

## Evidence

`docs/qa/sprint4-evidence/`：story-00100-01（Home 撕纸升级）, story-00101-01（Home + PasteBar）, story-00102（GoalSelect 反转+preview）, story-00103（Episode 撕纸进度+撕纸评分）, story-00104（iPhone SE Home 响应式）, story-00110（中文流程 Episode）。

## Knowledge Updates

- 撕纸风 SVG 精修的关键参数是 `feDisplacementMap scale`（不是 baseFrequency 数值大小）。scale ≥ 15 才能让边缘"肉眼可辨"，scale 9 会显得像砂纸边而非撕纸边。
- react-native-web 的 `useWindowDimensions` 在 iPhone SE 视口 (375×667) 下 `height <= 700` 是稳定的响应式断点。
- PathRibbon 用 SVG 绝对定位并作为 flex row 左侧列即可实现"进度条穿过 accordion 列表"效果，无需复杂布局。
- Expo Router 全局 `animation: 'fade_from_bottom'` 在 web 上退化为 CSS fade。真机 iOS 上会真的 slide-from-bottom。
