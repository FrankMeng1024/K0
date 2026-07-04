# Arch Code Review — Sprint 1

**Sprint**: 1
**Date**: 2026-07-05
**Verdict**: **PASS** ✅

---

## Issues

| Severity | Description | Story |
|----------|-------------|-------|
| Medium | Rate-limit thresholds not documented in API_SPEC/TECH_SPEC. Document window/max before Sprint 2 business endpoints are added. | STORY-00002 |
| Medium | Error envelope `{ error: { code, message, details } }` not exercised in Sprint 1 (no failure paths). Sprint 2 must include negative-path test for auth middleware 401/403 paths. | STORY-00002 |
| Medium | `AUTH_ENABLED=false` bypass has no production guard. Fix before deploy: (a) default to `true` when `NODE_ENV=production`, (b) loud startup warning if bypass active, (c) document in TECH_SPEC §security. | STORY-00002 |
| Medium | UX 3 medium issues not confirmed style-compliant (no box-shadow offset, no borders >2px, no gradients). SM to triage into backlog with explicit Style-F check. | STORY-00003 |

No Blocker or Critical issues. Sprint 1 approved to proceed.

---

## Spec Drift

| Drift | Status |
|-------|--------|
| `/health` returns `status:'degraded'` instead of `status:'ok'` — intentional; more honest. API_SPEC must be updated Sprint 2 to formalize `ok\|degraded` + `db:{ok,error,latency_ms}` shape. | Confirmed fixed at code level — doc update pending |
| `/api/whoami` returns extra `source` field — non-breaking additive. API_SPEC to add optional `source` enum Sprint 2. | Confirmed fixed at code level — doc update pending |

SM to broadcast contract update to all roles before Sprint 2 Planning.
