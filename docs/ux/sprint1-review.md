# UX Review — Sprint 1

**Sprint**: 1
**Date**: 2026-07-05
**Confidence**: MEDIUM (stub screens; real user flow arrives Sprint 2)

---

## Friction Items

### Medium

| # | Description | Screenshot |
|---|-------------|-----------|
| M1 | **Bilingual hero friction**: "Listen. / Learn." in English display type paired with Chinese subtitle. Chinese persona 王凯 gets English as primary headline — costs a beat. Recommend either Chinese hero copy or reframe English as brand mark. | Home 375×667 |
| M2 | **Below-fold discovery at 375×667**: Only Learn card visible on first paint. No scroll affordance. User may think app has only one action. Show 40-60px sliver of Review card above fold, or add scroll hint. | Home 375×667 |
| M3 | **Internal vocabulary leaks**: "Sprint 2 会填这里的功能" on stub screens. First-time user reads as a bug. Replace with "即将上线" / "敬请期待" before any external review. | /learn /review /library stubs |
| M4 | **Ambiguous status bubbles**: "today · empty" unclear without context. "empty of what?" reads as defect. Consider "还没开始" / "未导入" for Learn, "今天没有卡片" for Review, "还没有内容" for Library. | Stub screens |

### Low

| # | Description |
|---|-------------|
| L1 | "Hello, learner." greeting in English while body copy is Chinese. Align language. |
| L2 | Back button "← Home" is English. Chinese user expects "← 首页". |
| L3 | No visible press/hover state on cards confirmed in screenshots. Verify Pressable animation exists before Sprint 2 (long-running action needs clear tap confirmation). |
| L4 | First-person "我把它变成" in subtitle — "who is 我?" not established. Consider neutral voice. |

---

## No Blocker or Critical Issues

Sprint 1 UX **passes** — no blocker friction, no flow breakage. All issues are Medium/Low and expected for a stub sprint.

---

## Untested Paths

- Press/active state on cards (evidence didn't capture pressed frames)
- Landscape orientation
- Dark mode
- Dynamic Type / accessibility text sizes
- Deep-link entry to stub routes without Home first
- Rapid double-tap debounce on Learn card
- VoiceOver screen reader labels

---

## What Works Well

- Style F visual language established clearly: cream background, 64px Bagel Fat One hero, woven stripe divider, white oval bubble tags — consistent across all 4 routes
- Headphone person illustration lands well — abstract geometric style reads as intentional brand character
- 3 entry card titles (Learn/Review/Library) immediately understandable
- Navigation regression clean — Expo Router working reliably
- FCP 304ms — excellent for 4 custom fonts

---

## Knowledge Updates (for docs/ux/knowledge.md)

1. Sprint 1 Style F baseline established — all future Sprints compare against this
2. Bilingual copy strategy undefined — SM to add decision item before Sprint 2
3. Internal vocabulary (Sprint N, TODO) must never appear on user-facing screens
4. 375×667 fold: only 1 of 3 cards visible — preserve sliver of 2nd card as layout invariant
5. Status bubble copy pattern established but tone inconsistent — style guide needed in UI_SPEC.md
6. FCP 304ms with 4 fonts = performance baseline
7. Navigation regression baseline: 0 console errors all routes Sprint 1
