# UX Review — Sprint 2

**Sprint Goal**: 用户可以粘贴播客文字或链接，完成导入，看到 EpisodeCard 确认。
**Reviewer**: UX subagent (isolated, no implementation knowledge)
**Confidence**: HIGH

## UX Problem List

### Friction Items

| # | Severity | Description | Screenshot |
|---|---|---|---|
| 1 | Critical | Direct URL navigation to /learn → clicking 返回 triggers "GO_BACK not handled by any navigator" toast error. User has no recovery affordance other than manual navigation. Fix: fall back to navigate('Home') when history is empty. | 07-back-nav-error.png |
| 2 | Low | EpisodeCard title for pasted text reads as raw content excerpt ("文本 · 人工智能正在以前所未有的速度改变着我们的工作和生活方式。从自…"). Reduces confirmation value — user may not recognize what was imported. | 06-episode-card-shown.png |
| 3 | Low | "下一步：生成学习包（即将上线）" has no disabled/coming-soon visual affordance. A first-time user may tap expecting a response. | 06-episode-card-shown.png |

### What Worked Well

- Primary import flow (Home → Learn → paste ≥ 200 chars → 开始 → EpisodeCard) completed with 0 console errors
- Inline character count validation ("再多贴一些内容，至少 200 字（当前 N 字）") is clear and timely
- Button disabled/active states correctly reflect the 200-char threshold
- EpisodeCard confirmation pattern: title + duration pill + language pill + × dismiss — all visible and functional
- Card dismiss correctly preserves textarea content and button active state
- Normal back navigation (Home → Learn → 返回 → Home) works with 0 errors

### Untested Paths (deferred)

- Apple Podcasts URL import path
- Import failure states (network error, unsupported URL, 5xx)
- Exact 200-char boundary (199 rejected / 200 accepted)
- Very long transcript (scroll behavior)
- Rapid double-tap on 开始
- Dark mode on Learn screen
- Keyboard behavior on iPhone SE-class viewport

## Verdict

Sprint Goal: **ACHIEVED** for the primary path. One Critical bug filed (GO_BACK error on direct URL) — does not block primary mobile flow but surfaces a raw framework error in web/dev/deep-link scenarios.
