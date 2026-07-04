# Arch Code Review — Sprint 2

**Verdict**: PASS
**Reviewer**: Arch subagent (claude-opus-4-6)
**Date**: 2026-07-05
**Stories reviewed**: STORY-00011, STORY-00013, STORY-00020

---

## Issues

| Severity | Story | Description |
|----------|-------|-------------|
| Medium | STORY-00011 | Rate limit 10/min for import matches API_SPEC contract. SM to confirm alignment going forward. |
| Medium | STORY-00020 | `handleGlmError` only maps `GLM_TIMEOUT` + `GLM_MALFORMED_JSON`; unexpected network errors fall through to generic 500. Contract only specifies these two codes — acceptable for MVP. |
| Medium | STORY-00020 | `glm.js` reads prompt files via `readFileSync` at startup — service crashes with raw stack trace if file missing. Start script should verify prompt files exist. |
| Medium | STORY-00013 | `trim().length < MIN_CHARS` check runs on stripped text — correct behavior. QA: add test case for HTML-wrapped short input if not already covered. |
| Medium | STORY-00020 | Cache is checked inside route handler AFTER rate limit middleware fires. Cached (idempotent) requests still count against the 5/hour budget. Track as backlog item for Sprint 3. |
| Medium | STORY-00011 | `handleAppleImport` lacks transaction wrapper (unlike `handleTextImport`). Acceptable for single-table upsert. Flag for future refactor. |

---

## Spec Drift

All spec drift items confirmed fixed:

- SnapshotObject shape matches `API_SPEC.md §SnapshotObject` exactly — all 7 fields present and validated in `glm.js`
- Error envelope `{ error: { code, message } }` — 502 responses from `handleGlmError` follow contract
- Rate limit 5/hour per `user_id` — matches API_SPEC Rate Limits table
- `?regenerate=true` idempotency — matches contract
- `400 NO_TRANSCRIPT` — confirmed present in route handler
- Auth protection via `attachUser` middleware in `index.js` — inherited by snapshots router mount
- SPIKE-003 English output fix — `snapshot.en.md` includes explicit "MUST be in English" override

---

## Sign-off

No Blockers or Critical issues. All spec drift confirmed addressed. Sprint 2 proceeds to UX + QA verification.
