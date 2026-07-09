// Packs router — E-002/E-003/E-004 (Schema v3)
// Refactor Phase 1.5: pack_json 拆表版
// - GET /api/packs/:id           → 组装多表返回
// - GET /api/packs/:id/transcript → 从 transcript_segments + pack_skippable_ranges 组装
// - PATCH /api/packs/:packId/cards/:cardIndex → lookup pack_card_id 再 upsert user_cards
// - DELETE /api/packs/:packId/cards/:cardIndex → 同上,archived=1
// - POST /api/packs/:packId/generate → Step 2: updatePackContent 替代 UPDATE pack_json
// - PATCH /api/steps/:id         → lookup pack_step_id 再 upsert user_step_progress

import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';
import { getPackById, updatePackContent } from '../services/packStore.js';

const router = Router();

async function resolveUserId(req) {
  return req.user?.id || null;
}

// ── In-memory store for no-DB mode ────────────────────────────────────────────
export const mockPackStore = new Map();

/** Build a deterministic mock PackObject for dev/test */
export function buildMockPack(id, episodeId = 1, goal = 'deep_learn', language = 'zh') {
  const isZh = language === 'zh';
  return {
    id, episodeId, goal, language,
    snapshot: {
      oneSentence: isZh
        ? 'AI 产品的壁垒不在模型能力，而在场景闭环与数据飞轮。'
        : 'The moat for AI products is not model capability but closed-loop scenarios and data flywheels.',
      corePoints: [
        { point: isZh ? '技术平权正在发生，算法不再是壁垒' : 'Technology democratization is underway', timestamp: 312 },
        { point: isZh ? '场景定义产品，而非反过来' : 'Scenarios define products', timestamp: 845 },
        { point: isZh ? '数据飞轮是真正的护城河' : 'The data flywheel is the true moat', timestamp: 1423 },
      ],
      audience: isZh ? ['产品经理', '创业者', '技术负责人'] : ['Product managers', 'Founders', 'Tech leads'],
      valueScore: { density: 8, novelty: 7, actionability: 6 },
      estimatedCostMinutes: 10,
      worthListening: [
        { start: 300, end: 420, reason: isZh ? '核心论点阐述' : 'Core argument' },
      ],
      skippable: [
        { start: 0, end: 90, reason: isZh ? '广告与介绍' : 'Ads and intro' },
      ],
    },
    steps: [], cards: [], concepts: [], actions: {},
  };
}

// ── GET /api/packs/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  const packId = parseInt(req.params.id, 10);
  if (!Number.isFinite(packId) || packId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid pack id' },
    }));
  }

  if (!db) {
    const pack = mockPackStore.get(packId) || buildMockPack(packId);
    return res.json({ pack });
  }

  try {
    // 1. 从多表组装 pack (元信息 + snapshot/audience/corePoints/worth/skippable/steps/cards/concepts/actions)
    const packRow = await getPackById(packId);
    if (!packRow) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'Learning pack not found' },
      }));
    }
    const packJson = packRow.pack;   // 已组装好的 pack 对象

    // 2. 拿 episode / podcast 元信息 + 主音频源
    const [metaRows] = await db.execute(
      `SELECT e.id AS episode_id, e.title AS episode_title, e.cover_image_url AS episode_cover,
              e.duration_seconds, p.name AS podcast_name,
              (SELECT eas.url FROM episode_audio_sources eas
               WHERE eas.episode_id = e.id AND eas.is_primary = 1 LIMIT 1) AS audio_url
       FROM learning_packs lp
       JOIN transcripts t ON lp.transcript_id = t.id
       JOIN episodes e ON t.episode_id = e.id
       LEFT JOIN podcasts p ON e.podcast_id = p.id
       WHERE lp.id = ? LIMIT 1`,
      [packId]
    );
    const meta = metaRows[0] || {};

    const packUserId = await resolveUserId(req);

    // 3. 拿用户级 mode
    if (packUserId) {
      try {
        const [upaRows] = await db.execute(
          `SELECT mode FROM user_pack_access WHERE user_id = ? AND pack_id = ? LIMIT 1`,
          [packUserId, packId]
        );
        if (upaRows.length > 0 && upaRows[0].mode) {
          packJson.mode = upaRows[0].mode;
        }
      } catch {}
    } else {
      packJson.mode = packRow.mode;   // pack 级 mode
    }

    // 4. 注入 steps[].completed (user_step_progress)
    if (Array.isArray(packJson.steps) && packJson.steps.length && packUserId) {
      try {
        const [progressRows] = await db.execute(
          `SELECT pack_step_id FROM user_step_progress WHERE user_id = ? AND pack_id = ?`,
          [packUserId, packId]
        );
        const completedSet = new Set(progressRows.map(r => r.pack_step_id));
        packJson.steps = packJson.steps.map(s => ({
          ...s,
          completed: completedSet.has(s.id),
          stepIndex: s.stepNumber - 1,   // 兼容前端 stepIndex 语义
        }));
      } catch (e) {
        console.warn('[packs] user_step_progress lookup failed:', e.message);
      }
    }

    // 5. 注入 cards[].starred / archived / personalNote
    if (Array.isArray(packJson.cards) && packJson.cards.length && packUserId) {
      try {
        const [cardRows] = await db.execute(
          `SELECT pack_card_id, starred, archived, personal_note FROM user_cards WHERE user_id = ? AND pack_id = ?`,
          [packUserId, packId]
        );
        const ucMap = new Map(cardRows.map(r => [r.pack_card_id, r]));
        packJson.cards = packJson.cards
          .map(c => {
            const uc = ucMap.get(c.id);
            return {
              ...c,
              starred: uc ? !!uc.starred : true,       // PRD C-006 默认收藏
              archived: uc ? !!uc.archived : false,
              personalNote: uc?.personal_note || '',
            };
          })
          .filter(c => !c.archived);   // Sprint 16 R13 语义: archived 的不返回
      } catch (e) {
        console.warn('[packs] user_cards lookup failed:', e.message);
      }
    }

    // 6. 注入 committedActions (user_actions)
    if (packUserId) {
      try {
        const [actRows] = await db.execute(
          `SELECT timeframe, slot_index FROM user_actions WHERE user_id = ? AND pack_id = ?`,
          [packUserId, packId]
        );
        // 把 today/week/longterm 的 slot_index 转成扁平的 committedActions 数组 (0/1/2 对应 today/week/longterm)
        const TF_INDEX = { today: 0, week: 1, longterm: 2 };
        packJson.committedActions = actRows
          .map(a => TF_INDEX[a.timeframe])
          .filter(v => v !== undefined);
      } catch (e) {
        console.warn('[packs] user_actions lookup failed:', e.message);
      }
    }

    return res.json({
      packId: packRow.id,
      transcriptId: packRow.transcriptId,
      goal: packRow.goal,
      glmModel: packRow.glmModel,
      promptVersion: packRow.promptVersion,
      language: packRow.language,
      pack: packJson,
      episodeTitle: meta.episode_title,
      episodeCover: meta.episode_cover,
      durationSeconds: meta.duration_seconds,
      podcastName: meta.podcast_name,
      audioUrl: meta.audio_url || null,
      createdAt: packRow.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/packs/:id/transcript ─────────────────────────────────────────────
router.get('/:id/transcript', async (req, res, next) => {
  const packId = parseInt(req.params.id, 10);
  if (!Number.isFinite(packId) || packId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid pack id' },
    }));
  }
  if (!db) return res.json({ segments: [] });

  try {
    // 1. 找 transcript_id + 元信息
    const [tRows] = await db.execute(
      `SELECT t.id AS transcript_id, t.duration_seconds, t.language, t.total_chars, t.segment_count
       FROM learning_packs lp JOIN transcripts t ON lp.transcript_id = t.id
       WHERE lp.id = ? LIMIT 1`,
      [packId]
    );
    if (!tRows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'Transcript not found' },
      }));
    }
    const t = tRows[0];

    // 2. 读段落 (拆表)
    const [segRows] = await db.execute(
      `SELECT position, start_sec, end_sec, text FROM transcript_segments WHERE transcript_id = ? ORDER BY position`,
      [t.transcript_id]
    );
    const segments = segRows.map(s => ({
      start: Number(s.start_sec),
      end: Number(s.end_sec),
      text: s.text,
    }));

    // 3. 读 skippable ranges (拆表)
    const [skipRows] = await db.execute(
      `SELECT start_sec, end_sec FROM pack_skippable_ranges WHERE pack_id = ? ORDER BY position`,
      [packId]
    );
    const skippableRanges = skipRows.map(s => ({ start: Number(s.start_sec), end: Number(s.end_sec) }));
    const isInSkippable = (segStart, segEnd) => {
      for (const r of skippableRanges) {
        if (segStart < r.end && segEnd > r.start) return true;
      }
      return false;
    };
    const sanitizedSegments = segments.filter(s => !isInSkippable(s.start, s.end));

    // 4. 聚合成段落 (30-60s / 280 char)
    const PARAGRAPH_MAX_SECS = 60;
    const PARAGRAPH_MAX_CHARS = 280;
    function aggregate(segs) {
      const out = [];
      let cur = null;
      for (const s of segs) {
        if (!cur) { cur = { start: s.start, end: s.end, text: s.text }; continue; }
        const nextText = cur.text + s.text;
        const nextDur = s.end - cur.start;
        if (nextDur > PARAGRAPH_MAX_SECS || nextText.length > PARAGRAPH_MAX_CHARS) {
          out.push(cur);
          cur = { start: s.start, end: s.end, text: s.text };
        } else {
          cur.text = nextText;
          cur.end = s.end;
        }
      }
      if (cur) out.push(cur);
      return out;
    }
    const paragraphs = aggregate(segments);
    const sanitizedParagraphs = aggregate(sanitizedSegments);

    return res.json({
      segments,
      paragraphs,
      sanitizedParagraphs,
      skippableRanges,
      durationSeconds: t.duration_seconds,
      language: t.language,
      totalChars: t.total_chars,
      segmentCount: t.segment_count,
      paragraphCount: paragraphs.length,
      sanitizedParagraphCount: sanitizedParagraphs.length,
    });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/packs/:packId/cards/:cardIndex ────────────────────────────────
router.patch('/:packId/cards/:cardIndex', async (req, res, next) => {
  const packId = parseInt(req.params.packId, 10);
  const cardIndex = parseInt(req.params.cardIndex, 10);
  if (!Number.isFinite(packId) || packId <= 0 || !Number.isFinite(cardIndex) || cardIndex < 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid packId or cardIndex' },
    }));
  }
  const { starred, archived, personalNote } = req.body || {};
  const hasStarred = typeof starred === 'boolean';
  const hasArchived = typeof archived === 'boolean';
  const hasNote = typeof personalNote === 'string';
  if (!hasStarred && !hasArchived && !hasNote) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'must supply starred | archived | personalNote' },
    }));
  }
  if (!db) return res.json({ card: { packId, cardIndex, starred, archived, personalNote } });

  try {
    const userId = await resolveUserId(req);

    // 1. lookup pack_card_id (前端传 cardIndex = pack_cards.position)
    const [pcRows] = await db.execute(
      `SELECT id FROM pack_cards WHERE pack_id = ? AND position = ? LIMIT 1`,
      [packId, cardIndex]
    );
    if (!pcRows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'card not found' },
      }));
    }
    const packCardId = pcRows[0].id;

    // 2. upsert user_cards
    const insertStarred = hasStarred ? (starred ? 1 : 0) : 1;
    const insertArchived = hasArchived ? (archived ? 1 : 0) : 0;
    const insertNote = hasNote ? personalNote : null;
    const updates = [];
    if (hasStarred) updates.push('starred = VALUES(starred)');
    if (hasArchived) updates.push('archived = VALUES(archived)');
    if (hasNote) updates.push('personal_note = VALUES(personal_note)');
    updates.push('updated_at = CURRENT_TIMESTAMP');

    await db.execute(
      `INSERT INTO user_cards (user_id, pack_id, pack_card_id, starred, archived, ${hasNote ? 'personal_note' : 'personal_note'})
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
      [userId, packId, packCardId, insertStarred, insertArchived, insertNote]
    );
    return res.json({ card: { packId, cardIndex, starred, archived, personalNote } });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/packs/:packId/cards/:cardIndex ───────────────────────────────
router.delete('/:packId/cards/:cardIndex', async (req, res, next) => {
  const packId = parseInt(req.params.packId, 10);
  const cardIndex = parseInt(req.params.cardIndex, 10);
  if (!Number.isFinite(packId) || packId <= 0 || !Number.isFinite(cardIndex) || cardIndex < 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid packId or cardIndex' },
    }));
  }
  if (!db) return res.json({ ok: true, packId, cardIndex });

  try {
    const userId = await resolveUserId(req);
    const [pcRows] = await db.execute(
      `SELECT id FROM pack_cards WHERE pack_id = ? AND position = ? LIMIT 1`,
      [packId, cardIndex]
    );
    if (!pcRows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'card not found' },
      }));
    }
    const packCardId = pcRows[0].id;

    await db.execute(
      `INSERT INTO user_cards (user_id, pack_id, pack_card_id, starred, archived)
       VALUES (?, ?, ?, 1, 1)
       ON DUPLICATE KEY UPDATE archived = 1, updated_at = CURRENT_TIMESTAMP`,
      [userId, packId, packCardId]
    );
    return res.json({ ok: true, packId, cardIndex });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/packs/:packId/generate (Step 2) ────────────────────────────────
router.post('/:packId/generate', async (req, res, next) => {
  const packId = parseInt(req.params.packId, 10);
  const { mode } = req.body || {};
  if (!Number.isFinite(packId) || packId <= 0 || !['quick', 'deep', 'skip'].includes(mode)) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'packId + mode required' },
    }));
  }
  if (!db) {
    return next(Object.assign(new Error('NOT_IMPLEMENTED'), {
      status: 500,
      apiError: { code: ErrorCode.INTERNAL, message: 'No-DB mode does not support Step 2' },
    }));
  }

  try {
    // 1. lookup pack + snapshot
    const packRow = await getPackById(packId);
    if (!packRow) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'pack not found' },
      }));
    }
    const snapshot = packRow.pack;   // 组装后的 pack 对象已含 snapshot 字段

    const userId = (await resolveUserId(req)) || 1;

    // skip mode: 只 UPDATE learning_packs.mode + user_pack_access.mode
    if (mode === 'skip') {
      await db.execute(`UPDATE learning_packs SET mode = 'skip' WHERE id = ?`, [packId]);
      try {
        await db.execute(
          `UPDATE user_pack_access SET mode = ? WHERE user_id = ? AND pack_id = ?`,
          [mode, userId, packId]
        );
      } catch {}
      return res.json({ ok: true, mode: 'skip', pack: { ...snapshot, mode: 'skip' } });
    }

    // quick / deep: 异步 job pattern
    const { createJob, updateJob, completeJob, failJob } = await import('../services/jobStore.js');

    const jobId = await createJob({
      userId,
      inputUrl: `pack:${packId}:${mode}`,
      inputType: 'pack-generate',
      goal: mode,
    });

    (async () => {
      try {
        await updateJob(jobId, { status: 'generating', progress: 30, stageMessage: '✨ AI 在提炼学习包' });
        const { generatePackFromSnapshot } = await import('../services/packGenerator.js');
        const s2 = await generatePackFromSnapshot({
          snapshot,
          mode,
          context: { packId, jobId },
        });

        // 合并 Step 2 输出后重写整个 pack 内容 (updatePackContent 事务化重建)
        const mergedPack = {
          ...snapshot,
          mode,
          steps: s2.pack.steps || snapshot.steps || [],
          concepts: s2.pack.concepts || snapshot.concepts || [],
          cards: s2.pack.cards || snapshot.cards || [],
          actions: s2.pack.actions || snapshot.actions || {},
        };
        await updatePackContent(packId, mergedPack, { mode });

        try {
          await db.execute(
            `UPDATE user_pack_access SET mode = ? WHERE user_id = ? AND pack_id = ?`,
            [mode, userId, packId]
          );
        } catch {}

        await completeJob(jobId, packId);
      } catch (e) {
        console.error(`[packs/generate] job ${jobId} failed:`, e?.message);
        await failJob(jobId, e?.code || 'PACK_GEN_ERROR', e?.message || '学习包生成失败');
      }
    })();

    return res.json({ ok: true, jobId, mode, packId });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/steps/:id ─────────────────────────────────────────────────────
// 前端合成 stepId = packId * 100 + stepIndex (stepIndex = stepNumber - 1)
const stepsRouter = Router();

stepsRouter.patch('/:id', async (req, res, next) => {
  const stepId = parseInt(req.params.id, 10);
  if (!Number.isFinite(stepId) || stepId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid step id' },
    }));
  }
  const { completed } = req.body || {};
  if (typeof completed !== 'boolean') {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'completed must be boolean' },
    }));
  }

  const packId = Math.floor(stepId / 100);
  const stepIndex = stepId % 100;   // 0-based

  if (!db) {
    for (const pack of mockPackStore.values()) {
      const step = pack.steps?.find(s => s.id === stepId);
      if (step) { step.completed = completed; return res.json({ step }); }
    }
    return res.json({ step: { id: stepId, completed, stepNumber: stepIndex + 1, title: 'Step', content: '', citations: [] } });
  }

  try {
    const userId = await resolveUserId(req);

    // lookup pack_step_id (pack_steps.step_number = stepIndex + 1)
    const [psRows] = await db.execute(
      `SELECT id FROM pack_steps WHERE pack_id = ? AND step_number = ? LIMIT 1`,
      [packId, stepIndex + 1]
    );
    if (!psRows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'step not found' },
      }));
    }
    const packStepId = psRows[0].id;

    if (completed) {
      await db.execute(
        `INSERT INTO user_step_progress (user_id, pack_id, pack_step_id, completed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE completed_at = NOW()`,
        [userId, packId, packStepId]
      );
    } else {
      await db.execute(
        `DELETE FROM user_step_progress WHERE user_id = ? AND pack_step_id = ?`,
        [userId, packStepId]
      );
    }
    return res.json({ step: { id: stepId, stepNumber: stepIndex + 1, completed } });
  } catch (err) {
    next(err);
  }
});

export { stepsRouter };
export default router;
