// Jobs router — Sprint 6 起先查 DB，fallback in-memory（保留兼容 snapshot 流程）
// GET /api/jobs/:jobId
import { Router } from 'express';
import { ErrorCode } from '../../shared/errors.js';
import { getJob } from './importJob.model.js';

const router = Router();

// 老 in-memory job store（保留兼容 snapshot 流程；生产/import-url 走 DB）
export const jobStore = new Map();

const JOB_TTL_MS = 60 * 60 * 1000;

function pruneExpired() {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobStore) {
    if (job.createdAt < cutoff) jobStore.delete(id);
  }
}

router.get('/:jobId', async (req, res, next) => {
  try {
    // 1. DB (Sprint 6 新 pipeline)
    const dbJob = await getJob(req.params.jobId);
    if (dbJob) {
      return res.json({
        jobId: dbJob.id,
        status: dbJob.status,
        progress: dbJob.progress,
        stageMessage: dbJob.stageMessage,
        packId: dbJob.packId,
        cacheHit: dbJob.cacheHit,
        errorCode: dbJob.errorCode,
        errorMessage: dbJob.errorMessage,
      });
    }

    // 2. In-memory fallback (老 snapshot 流程)
    pruneExpired();
    const memJob = jobStore.get(req.params.jobId);
    if (memJob) {
      const response = { status: memJob.status, progress: memJob.progress || 0 };
      if (memJob.packId != null) response.packId = memJob.packId;
      if (memJob.error) response.error = memJob.error;
      return res.json(response);
    }

    next(Object.assign(new Error('NOT_FOUND'), {
      status: 404,
      apiError: { code: ErrorCode.NOT_FOUND, message: 'Job not found or expired' },
    }));
  } catch (e) {
    next(e);
  }
});

export default router;
