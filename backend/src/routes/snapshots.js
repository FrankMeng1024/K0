// Snapshots route — E-002 Learning Snapshot
// POST /api/episodes/:id/snapshot
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../config/db.js';
import { generateSnapshot } from '../services/glm.js';
import { throwApiError, ErrorCode } from '../lib/errors.js';

const router = Router();

// Rate limit: 5 snapshot requests per hour per user_id
const snapshotRateLimit = rateLimit({
  windowMs: 60 * 60_000, // 1 hour
  max: 5,
  keyGenerator: (req) => String(req.user?.id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: '快照生成频率过高。限制：每小时 5 次。',
      },
    });
  },
});

/**
 * POST /api/episodes/:id/snapshot
 * Generate (or return cached) learning snapshot for an episode.
 * Query param: ?regenerate=true forces re-generation
 */
router.post('/:id/snapshot', snapshotRateLimit, async (req, res, next) => {
  const episodeId = parseInt(req.params.id, 10);
  if (!Number.isFinite(episodeId) || episodeId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid episode id' },
    }));
  }

  const regenerate = req.query.regenerate === 'true';
  // Sprint 16 R11: 从 anonymousId 解析 userId
  let userId = req.user?.id || 1;
  const anonymousId = req.query.anonymousId || req.body?.anonymousId;
  if (anonymousId && db) {
    try {
      const { getOrCreateUserByAnonymousId } = await import('../services/userStore.js');
      const user = await getOrCreateUserByAnonymousId(anonymousId);
      if (user) userId = user.id;
    } catch {}
  }

  // ── No-DB mode (dev / CI without MySQL) ─────────────────────────────────────
  if (!db) {
    // In no-DB mode call GLM directly with stub text; unit tests mock generateSnapshot
    try {
      const snapshot = await generateSnapshot({
        text: '这是一段用于测试的播客转录内容。' .repeat(20),
        language: 'zh',
        title: 'Dev stub episode',
        source: 'text',
        duration: 600,
      });
      return res.json({ snapshot, cached: false });
    } catch (err) {
      return handleGlmError(err, next);
    }
  }

  // ── DB mode ──────────────────────────────────────────────────────────────────
  try {
    // 1. Verify episode belongs to this user
    const [epRows] = await db.execute(
      'SELECT id, language, title, source, duration FROM episodes WHERE id = ? AND user_id = ?',
      [episodeId, userId]
    );
    if (!epRows.length) {
      throwApiError(ErrorCode.EPISODE_NOT_FOUND, '找不到该播客集', null, 404);
    }
    const episode = epRows[0];

    // 2. Fetch transcript text
    const [txRows] = await db.execute(
      'SELECT text FROM transcripts WHERE episode_id = ? LIMIT 1',
      [episodeId]
    );
    if (!txRows.length) {
      throwApiError(ErrorCode.NO_TRANSCRIPT, '该集暂无转录文字，无法生成快照', null, 400);
    }
    const transcriptText = txRows[0].text;

    // 3. Return cached snapshot unless regenerate=true
    if (!regenerate) {
      const [snapRows] = await db.execute(
        'SELECT snapshot_json FROM snapshots WHERE episode_id = ?',
        [episodeId]
      );
      if (snapRows.length) {
        return res.json({ snapshot: snapRows[0].snapshot_json, cached: true });
      }
    }

    // 4. Call GLM to generate snapshot
    let snapshot;
    try {
      snapshot = await generateSnapshot({
        text: transcriptText,
        language: episode.language,
        title: episode.title,
        source: episode.source,
        duration: episode.duration || 0,
      });
    } catch (err) {
      return handleGlmError(err, next);
    }

    // 5. Upsert snapshot (idempotent)
    await db.execute(
      `INSERT INTO snapshots (episode_id, snapshot_json, language)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         snapshot_json = VALUES(snapshot_json),
         language = VALUES(language),
         updated_at = CURRENT_TIMESTAMP`,
      [episodeId, JSON.stringify(snapshot), episode.language]
    );

    return res.json({ snapshot, cached: false });
  } catch (err) {
    next(err);
  }
});

/**
 * Map GLM service errors to HTTP API errors.
 */
function handleGlmError(err, next) {
  if (err.glmError === 'GLM_TIMEOUT') {
    return next(Object.assign(err, {
      status: 502,
      apiError: { code: ErrorCode.GLM_TIMEOUT, message: 'GLM 请求超时，请稍后重试' },
    }));
  }
  if (err.glmError === 'GLM_MALFORMED_JSON') {
    return next(Object.assign(err, {
      status: 502,
      apiError: { code: ErrorCode.GLM_MALFORMED_JSON, message: 'GLM 返回内容解析失败，请稍后重试' },
    }));
  }
  if (err.glmError === 'GLM_API_ERROR') {
    return next(Object.assign(err, {
      status: 502,
      apiError: { code: 'GLM_API_ERROR', message: 'AI 服务暂时不可用，请稍后重试' },
    }));
  }
  next(err);
}

export default router;
