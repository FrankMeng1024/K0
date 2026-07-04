// Generate route — E-003 Learning Pack Generation
// POST /api/episodes/:id/generate
import { Router } from 'express';
import { randomUUID } from 'crypto';
import rateLimit from 'express-rate-limit';
import { db } from '../config/db.js';
import { generatePack } from '../services/glm.js';
import { throwApiError, ErrorCode } from '../lib/errors.js';
import { jobStore } from './jobs.js';
import { mockPackStore, buildMockPack } from './packs.js';

const router = Router();

const VALID_GOALS = ['quick_understand', 'deep_learn', 'find_actions', 'critical_thinking', 'for_work'];

// Rate limit: 5 generate requests per hour per user_id (same as snapshot)
const generateRateLimit = rateLimit({
  windowMs: 60 * 60_000,
  max: 5,
  keyGenerator: (req) => String(req.user?.id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: { code: ErrorCode.RATE_LIMITED, message: '学习包生成频率过高。限制：每小时 5 次。' },
    });
  },
});

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

/**
 * POST /api/episodes/:id/generate
 * Trigger full learning pack generation for an episode.
 * Body: { "goal": "quick_understand|deep_learn|find_actions|critical_thinking|for_work" }
 * Returns: { "jobId": "<uuid>", "status": "processing" }
 */
router.post('/:id/generate', generateRateLimit, async (req, res, next) => {
  const episodeId = parseInt(req.params.id, 10);
  if (!Number.isFinite(episodeId) || episodeId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid episode id' },
    }));
  }

  const { goal } = req.body;
  if (!goal || !VALID_GOALS.includes(goal)) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: {
        code: ErrorCode.VALIDATION_ERROR,
        message: `goal must be one of: ${VALID_GOALS.join(', ')}`,
      },
    }));
  }

  const jobId = randomUUID();
  const packId = Date.now(); // simple unique id for in-memory mode

  // Register job as processing immediately
  jobStore.set(jobId, { status: 'processing', progress: 10, createdAt: Date.now() });

  // ── No-DB mode ────────────────────────────────────────────────────────────────
  if (!db) {
    // In no-DB mode we have no transcript — use stub text for GLM call.
    // If GLM key is invalid, job transitions to failed.
    const stubText = '这是一段用于测试的播客转录内容，讨论AI产品竞争格局与护城河策略。'.repeat(15);
    const stubEpisode = { language: 'zh', title: 'Dev stub episode', source: 'text', duration: 600 };

    // Return job immediately; generation happens async
    res.json({ jobId, status: 'processing' });

    // Async generation (fire and forget — updates jobStore)
    setImmediate(async () => {
      try {
        jobStore.get(jobId).progress = 30;
        const packData = await generatePack({
          text: stubText,
          language: stubEpisode.language,
          title: stubEpisode.title,
          source: stubEpisode.source,
          duration: stubEpisode.duration,
          goal,
        });
        // Attach IDs to pack data
        const pack = {
          id: packId,
          episodeId,
          goal,
          language: stubEpisode.language,
          ...packData,
          // Annotate steps and cards with ids
          steps: packData.steps.map((s, i) => ({ id: packId * 10 + i + 1, packId, ...s, completed: false })),
          cards: packData.cards.map((c, i) => ({ id: packId * 100 + i + 1, packId, episodeId, ...c, starred: true })),
          createdAt: new Date().toISOString(),
        };
        mockPackStore.set(packId, pack);
        const job = jobStore.get(jobId);
        if (job) { job.status = 'ready'; job.progress = 100; job.packId = packId; }
      } catch (err) {
        const job = jobStore.get(jobId);
        if (job) {
          job.status = 'failed';
          job.progress = 0;
          job.error = err.glmError || 'INTERNAL_ERROR';
        }
      }
    });

    return; // already sent response above
  }

  // ── DB mode (Sprint 4) ────────────────────────────────────────────────────────
  try {
    const [epRows] = await db.execute(
      'SELECT id, language, title, source, duration FROM episodes WHERE id = ? AND user_id = ?',
      [episodeId, req.user.id]
    );
    if (!epRows.length) throwApiError(ErrorCode.EPISODE_NOT_FOUND, '找不到该播客集', null, 404);
    const episode = epRows[0];

    const [txRows] = await db.execute(
      'SELECT raw_text FROM transcripts WHERE episode_id = ? LIMIT 1',
      [episodeId]
    );
    if (!txRows.length) throwApiError(ErrorCode.NO_TRANSCRIPT, '该集暂无转录文字，无法生成学习包', null, 400);

    // Create pack record
    const [insertResult] = await db.execute(
      'INSERT INTO learning_packs (user_id, episode_id, goal, language, status, job_id) VALUES (?,?,?,?,?,?)',
      [req.user.id, episodeId, goal, episode.language, 'processing', jobId]
    );
    const dbPackId = insertResult.insertId;

    jobStore.get(jobId).packId = dbPackId;

    // Return jobId immediately
    res.json({ jobId, status: 'processing' });

    // Async generation
    setImmediate(async () => {
      try {
        const packData = await generatePack({
          text: txRows[0].raw_text,
          language: episode.language,
          title: episode.title,
          source: episode.source,
          duration: episode.duration || 0,
          goal,
        });

        // Persist to DB (Sprint 4 TODO: full persistence)
        await db.execute('UPDATE learning_packs SET status=?, progress=100 WHERE id=?', ['ready', dbPackId]);

        const job = jobStore.get(jobId);
        if (job) { job.status = 'ready'; job.progress = 100; job.packId = dbPackId; }
      } catch (err) {
        await db.execute('UPDATE learning_packs SET status=?, error_message=? WHERE id=?',
          ['failed', err.message, dbPackId]);
        const job = jobStore.get(jobId);
        if (job) { job.status = 'failed'; job.progress = 0; job.error = err.glmError || 'INTERNAL_ERROR'; }
      }
    });
  } catch (err) {
    if (err.apiError) return next(err);
    if (err.glmError) return handleGlmError(err, next);
    next(err);
  }
});

export default router;
