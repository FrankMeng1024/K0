// Jobs router — in-memory job store for async pack generation
// GET /api/jobs/:jobId
import { Router } from 'express';
import { ErrorCode } from '../lib/errors.js';

const router = Router();

// Exported Map — generate.js writes into this store
export const jobStore = new Map(); // jobId → { status, progress, packId?, error? }

const JOB_TTL_MS = 60 * 60 * 1000; // 1 hour

// Prune expired jobs on read (lazy GC)
function pruneExpired() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobStore) {
    if (job.createdAt < cutoff) jobStore.delete(id);
  }
}

// GET /api/jobs/:jobId
router.get('/:jobId', (req, res, next) => {
  pruneExpired();
  const job = jobStore.get(req.params.jobId);
  if (!job) {
    return next(Object.assign(new Error('NOT_FOUND'), {
      status: 404,
      apiError: { code: ErrorCode.NOT_FOUND, message: 'Job not found or expired' },
    }));
  }
  const response = { status: job.status, progress: job.progress };
  if (job.packId != null) response.packId = job.packId;
  if (job.error) response.error = job.error;
  return res.json(response);
});

export default router;
