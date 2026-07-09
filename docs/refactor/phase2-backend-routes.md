# K0 API Endpoints Inventory

_自动生成 by `scripts/introspect-routes.cjs` — 从 backend/src/routes 扫出_

**Total endpoints**: 28

| Method | Path | Router | File |
|--------|------|--------|------|
| POST | `/api/auth/login` | authRouter | routes/auth.js |
| POST | `/api/auth/register` | authRouter | routes/auth.js |
| GET | `/api/debug/upload/:upload_id` | debugUploadRouter | routes/debugUpload.js |
| GET | `/api/debug/upload/batch/:batch_id` | debugUploadRouter | routes/debugUpload.js |
| GET | `/api/debug/upload/latest` | debugUploadRouter | routes/debugUpload.js |
| POST | `/api/episodes/:id/generate` | generateRouter | routes/generate.js |
| POST | `/api/episodes/import-url` | importUrlRouter | routes/importUrl.js |
| GET | `/api/jobs/:jobId` | jobsRouter | routes/jobs.js |
| GET | `/api/library/cards` | libraryRouter | routes/library.js |
| GET | `/api/library/packs` | libraryRouter | routes/library.js |
| DELETE | `/api/library/packs/:packId` | libraryRouter | routes/library.js |
| GET | `/api/library/stats` | libraryRouter | routes/library.js |
| POST | `/api/push/register` | pushRouter | routes/push.js |
| POST | `/api/push/test` | pushRouter | routes/push.js |
| GET | `/api/review/actions` | reviewRouter | routes/review.js |
| DELETE | `/api/review/actions/:id` | reviewRouter | routes/review.js |
| PATCH | `/api/review/actions/:id` | reviewRouter | routes/review.js |
| POST | `/api/review/actions/commit` | reviewRouter | routes/review.js |
| POST | `/api/review/actions/uncommit` | reviewRouter | routes/review.js |
| GET | `/api/review/queue` | reviewRouter | routes/review.js |
| POST | `/api/review/rate` | reviewRouter | routes/review.js |
| GET | `/api/review/stats` | reviewRouter | routes/review.js |
| DELETE | `/api/uploads/:upload_id` | uploadsRouter | routes/uploads.js |
| GET | `/api/uploads/:upload_id` | uploadsRouter | routes/uploads.js |
| GET | `/api/uploads/batch/:batch_id` | uploadsRouter | routes/uploads.js |
| GET | `/api/uploads/mine` | uploadsRouter | routes/uploads.js |
| GET | `/api/whoami` | whoamiRouter | routes/whoami.js |
| GET | `/health` | healthRouter | routes/health.js |
