# Arch Code Review — Sprint 3

**Date**: 2026-07-05
**Sprint**: 3
**Verdict**: PASS

## Issues

| Severity | Story | Description |
|---|---|---|
| Medium | STORY-00033 | GET /api/packs/:id no-DB mode falls back to buildMockPack() for IDs not in mockPackStore, returning valid packs for IDs that were never generated. Consider returning 404 or documenting as intentional test behavior. |
| Medium | STORY-00033 | PATCH /api/steps/:id searches all packs for step id. buildMockPack step ids (packId*10+i+1) are globally unique — this is correct as implemented. Confirm by test. |
| Medium | STORY-00031 | Rate limit key uses req.user?.id \|\| req.ip — IP fallback not documented in API_SPEC. Consistent with snapshot endpoint. Add note to API_SPEC. |
| Medium | STORY-00032 | Episode screen fires POST /generate on direct nav (no jobId). Requires `goal` param to be present — if absent, VALID_GOALS validation will reject. Add guard or redirect to /goal-select when goal is absent. |
| Medium | STORY-00032 | Poll timeout 60s. GLM max_tokens=4096 may exceed 60s on complex prompts. Not blocking for Sprint 3 mock mode. Flag for Sprint 4 real GLM integration. |
| Medium | STORY-00032 | worthListening/skippable fields from SnapshotObject not rendered in Episode screen. Intentionally deferred to Sprint 4. |
| Medium | STORY-00031 | validatePack enforces cards[3-5]. API_SPEC defines `cards[]` without count constraint. Add 3-5 constraint to API_SPEC, or relax validation. |

## Spec Drift
None.

## Notes
All issues are Medium priority. No Blockers or Critical issues. Sprint 3 integration may proceed.
Medium issues STORY-00033 and STORY-00032 (goal guard) to be addressed in Sprint 4.
