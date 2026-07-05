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
  if (!Number.isFinite(episodeId) || episodeId < 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid episode id' },
    }));
  }
  // In no-DB mode, episodes always have id=0 — allow it
  if (episodeId === 0 && db) {
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
    // If GLM key is placeholder/empty or GLM call fails, fall back to buildMockPack.
    const stubText = '这是一段用于测试的播客转录内容，讨论AI产品竞争格局与护城河策略。'.repeat(15);
    const stubEpisode = { language: 'zh', title: 'Dev stub episode', source: 'text', duration: 600 };

    // Return job immediately; generation happens async
    res.json({ jobId, status: 'processing' });

    const apiKey = process.env.GLM_API_KEY || '';
    const glmDisabled = !apiKey || apiKey.startsWith('placeholder');

    // Helper: build mock pack + finalize job
    const finalizeWithMock = () => {
      const pack = buildMockPack(packId, episodeId, goal, stubEpisode.language);
      mockPackStore.set(packId, pack);
      const job = jobStore.get(jobId);
      if (job) { job.status = 'ready'; job.progress = 100; job.packId = packId; }
    };

    // Async generation (fire and forget — updates jobStore)
    setImmediate(async () => {
      if (glmDisabled) {
        // Simulate progress for UX
        const job = jobStore.get(jobId);
        if (job) job.progress = 60;
        setTimeout(finalizeWithMock, 800);
        return;
      }
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
        const pack = {
          id: packId,
          episodeId,
          goal,
          language: stubEpisode.language,
          ...packData,
          steps: packData.steps.map((s, i) => ({ id: packId * 10 + i + 1, packId, ...s, completed: false })),
          cards: packData.cards.map((c, i) => ({ id: packId * 100 + i + 1, packId, episodeId, ...c, starred: true })),
          createdAt: new Date().toISOString(),
        };
        mockPackStore.set(packId, pack);
        const job = jobStore.get(jobId);
        if (job) { job.status = 'ready'; job.progress = 100; job.packId = packId; }
      } catch (err) {
        // GLM call failed — in no-DB (dev) mode fall back to mock pack rather than failing.
        console.warn('[generate] GLM failed in no-DB mode, using mock pack:', err.glmError || err.message);
        finalizeWithMock();
      }
    });

    return; // already sent response above
  }

  // ── DB mode (Sprint 8 rewrite for v2 schema) ─────────────────────────────────
  // v2 schema 中：episode 表无 source/user_id 列，learning_packs 用 pack_json 存 pack
  // goal-select 页面通过此路由触发。策略：
  //   1. 若 episode 存在的对应 goal 的 pack 已在 DB → 直接返回该 packId（缓存命中）
  //   2. 若未有对应 goal 的 pack → 需要重跑 pipeline，返回 GOAL_NOT_GENERATED 提示用户
  //      从首页 PasteBar 输入 URL 重新提交（后端可后续实现按 episodeId 重跑）
  try {
    const [epRows] = await db.execute(
      'SELECT id, language, title, source_url FROM episodes WHERE id = ? LIMIT 1',
      [episodeId]
    );
    if (!epRows.length) throwApiError(ErrorCode.EPISODE_NOT_FOUND, '找不到该播客集', null, 404);

    // 查找该 episode 已有的 goal-matching pack via user_pack_access
    // Sprint 8 v2 schema: pack 通过 transcript_id → episode_id 关联；先查 transcript
    const [txRows] = await db.execute(
      'SELECT id FROM transcripts WHERE episode_id = ? LIMIT 1',
      [episodeId]
    );
    if (!txRows.length) {
      throwApiError(
        'GOAL_NOT_GENERATED',
        '该集暂无学习包缓存。请返回首页粘贴链接以生成新目标的学习包。',
        null,
        400
      );
    }

    const [packRows] = await db.execute(
      'SELECT id FROM learning_packs WHERE transcript_id = ? AND goal = ? ORDER BY created_at DESC LIMIT 1',
      [txRows[0].id, goal]
    );
    if (!packRows.length) {
      throwApiError(
        'GOAL_NOT_GENERATED',
        '这个目标的学习包还没有生成过。请从首页粘贴链接重新提交，AI 会根据新目标生成。',
        null,
        400
      );
    }

    // 缓存命中：立即返回一个"已完成"的 job，指向已存 pack
    const cachedPackId = packRows[0].id;
    jobStore.set(jobId, {
      status: 'ready',
      progress: 100,
      packId: cachedPackId,
      createdAt: Date.now(),
    });
    res.json({ jobId, status: 'ready' });
  } catch (err) {
    if (err.apiError) return next(err);
    if (err.glmError) return handleGlmError(err, next);
    next(err);
  }
});

export default router;
