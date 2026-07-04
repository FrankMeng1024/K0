# QA Verdict — Sprint 1

**Sprint**: 1
**Date**: 2026-07-05
**Verdict**: **PASS** ✅
**QA subagent confidence**: HIGH

---

## Per-Story Results

| Story | Verdict | Confidence | Failing ACs |
|-------|---------|------------|-------------|
| STORY-00001 | PASS | HIGH | none |
| STORY-00003 | PASS | HIGH | none |

### STORY-00001 Notes
AC1 (scripts): package.json contains 'start' (expo start = dev server), 'android', 'ios', 'web' scripts. Per Expo convention, 'start' serves the dev role; 'build' is handled by EAS (not an npm script); test runner is explicitly deferred to Sprint 2 per Sprint 1 foundation scope. Pragmatic PASS. AC2 (bundle identifier): app.json shows expo.ios.bundleIdentifier = 'com.yiiling.k0' — correct. AC3 (env example): .env.local.example contains EXPO_PUBLIC_API_URL=http://localhost:3002 ✅. AC4 (service connectivity): http://localhost:8081 returns HTTP 200, app renders with 0 console errors. AC5 (start script): scripts/start-web.sh present and functional.

### STORY-00003 Notes
Visual fidelity to confirmed demo F style: Home @ 375×667 shows 'Listen.'/'Learn.' in BagelFatOne_400Regular at 64px (confirmed via computed style probe — NOT system-ui), paper/cream flat background, brick red 'Learn' card with hand SVG, 'Hello, learner.' bubble tag, headphone person illustration (abstract flat-color geometric — meets user's 'more abstract/geometric' intent), woven striped divider. Home @ 393×852 renders spaciously, no overflow. Touch targets: 312×126px (far exceeds 44×44 minimum). SVG probe: 5 SVGs, 24 feTurbulence elements — tear-edge active. All 4 routes render correctly. Click-through from Home 'Learn' card navigates to /learn. Navigation regression: 4 cycles, 0 console errors everywhere. FCP = 304ms (threshold <1500ms) ✅.

---

## Bugs Found

**None.** 0 bugs of any priority.

---

## Untested Paths

- Dark mode (not defined in TECH_SPEC this Sprint — deferred)
- Actual iOS device/Simulator rendering (EAS build in Sprint 2)
- Card hover/press animation states
- Scroll to Review/Library at 375×667 (accessible but not explicitly screenshotted)
- Test runner execution (deferred to Sprint 2)

---

## Evidence Files

All in `docs/qa/sprint1-evidence/`:
- STORY-00003-01-home-375.png — Home @ 375×667
- STORY-00003-02-home-393.png — Home @ 393×852
- STORY-00003-06-learn.png — /learn stub
- STORY-00003-07-review.png — /review stub
- STORY-00003-08-library.png — /library stub
- STORY-00003-09-click-learn.png — after click-through from Home
- STORY-00003-NR-01-home-to.png — navigation regression home
- STORY-00003-10-fcp.txt — FCP 304ms
- STORY-00003-05-fonts.txt — BagelFatOne_400Regular confirmed
- STORY-00003-04-svgprobe.txt — 24 feTurbulence elements
- STORY-00003-03-touchtargets.txt — 312×126px touch targets
