// Review router — E-005 Review System (Schema v3)
// Refactor Phase 1.5: 拆表版 - 去 JSON_TABLE, 用 pack_cards / pack_actions
import { Router } from 'express';
import { db } from '../../shared/db.js';
import { ErrorCode } from '../../shared/errors.js';

const router = Router();

async function resolveUserId(req) {
  return req.user?.id || null;
}

/**
 * GET /api/review/queue - 复习队列
 * 默认每张 pack_cards 都算 starred (PRD C-006),除非 user_cards.starred=0
 */
router.get('/queue', async (req, res, next) => {
  if (!db) return res.json({ due: [], upcoming: [] });
  try {
    const userId = await resolveUserId(req);
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));

    const sql = `
      SELECT
        lp.id AS pack_id,
        pc.id AS pack_card_id,
        pc.position AS card_index,
        pc.quote AS card_quote,
        pc.insight AS card_insight,
        pc.context AS card_context,
        pc.timestamp_sec AS source_timestamp,
        COALESCE(uc.starred, 1) AS starred,
        COALESCE(uc.archived, 0) AS archived,
        uc.id AS user_card_id,
        uc.review_state,
        uc.review_next_at,
        uc.review_interval_days,
        uc.review_count,
        e.title AS episode_title,
        e.cover_image_url,
        p.name AS podcast_name,
        upa.first_accessed_at
      FROM user_pack_access upa
      JOIN learning_packs lp ON upa.pack_id = lp.id
      JOIN pack_cards pc ON pc.pack_id = lp.id
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      LEFT JOIN user_cards uc ON uc.user_id = upa.user_id AND uc.pack_card_id = pc.id
      WHERE upa.user_id = ?
        AND COALESCE(uc.starred, 1) = 1
        AND COALESCE(uc.archived, 0) = 0
      ORDER BY
        CASE
          WHEN uc.review_next_at IS NULL THEN 1
          WHEN uc.review_next_at <= NOW() THEN 0
          ELSE 2
        END,
        upa.first_accessed_at ASC,
        pc.position ASC
      LIMIT ${limit}
    `;

    const [rows] = await db.execute(sql, [userId]);
    const due = [];
    const upcoming = [];
    const now = Date.now();

    for (const r of rows) {
      const item = {
        userCardId: r.user_card_id,
        packId: r.pack_id,
        cardIndex: r.card_index,
        packCardId: r.pack_card_id,
        // Sprint 12 CR-013 v4 卡片字段
        quote: r.card_quote,
        insight: r.card_insight,
        context: r.card_context,
        title: r.card_insight,          // 兼容旧字段名
        explanation: r.card_context,    // 兼容
        sourceTimestamp: r.source_timestamp ? Number(r.source_timestamp) : null,
        podcastName: r.podcast_name,
        episodeTitle: r.episode_title,
        coverImageUrl: r.cover_image_url,
        reviewState: r.review_state,
        reviewCount: r.review_count || 0,
        reviewNextAt: r.review_next_at,
      };
      if (!r.review_next_at || new Date(r.review_next_at).getTime() <= now) {
        due.push(item);
      } else {
        upcoming.push(item);
      }
    }

    return res.json({ due, upcoming });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/review/rate
 * Body: { packId, cardIndex, rating: 'known'|'fuzzy'|'forgot' }
 */
router.post('/rate', async (req, res, next) => {
  if (!db) return res.json({ ok: true });
  try {
    const userId = await resolveUserId(req);
    const { packId, cardIndex, rating } = req.body || {};
    if (typeof packId !== 'number' || typeof cardIndex !== 'number' || !['known', 'fuzzy', 'forgot'].includes(rating)) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'packId + cardIndex + rating required' },
      }));
    }

    // lookup pack_card_id
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

    // current review state
    const [rows] = await db.execute(
      `SELECT id, review_interval_days, review_count FROM user_cards
       WHERE user_id = ? AND pack_card_id = ? LIMIT 1`,
      [userId, packCardId]
    );
    const curInterval = rows.length ? (rows[0].review_interval_days || 0) : 0;
    const curCount = rows.length ? (rows[0].review_count || 0) : 0;

    let nextInterval;
    if (rating === 'known') {
      nextInterval = Math.min(90, Math.max(3, curInterval * 2 || 3));
    } else if (rating === 'fuzzy') {
      nextInterval = Math.max(3, curInterval || 3);
    } else {
      nextInterval = 1;
    }

    const nextAt = new Date(Date.now() + nextInterval * 86400 * 1000);
    const nextCount = curCount + 1;

    await db.execute(
      `INSERT INTO user_cards (user_id, pack_id, pack_card_id, starred, review_state, review_interval_days, review_next_at, review_count)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         review_state = VALUES(review_state),
         review_interval_days = VALUES(review_interval_days),
         review_next_at = VALUES(review_next_at),
         review_count = VALUES(review_count),
         updated_at = NOW()`,
      [userId, packId, packCardId, rating, nextInterval, nextAt, nextCount]
    );

    return res.json({
      ok: true,
      nextIntervalDays: nextInterval,
      nextAt: nextAt.toISOString(),
      reviewCount: nextCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/review/stats - 汇总数字
 */
router.get('/stats', async (req, res, next) => {
  if (!db) return res.json({ dueToday: 0, dueThisWeek: 0, totalReviews: 0 });
  try {
    const userId = await resolveUserId(req);
    // due 计算: 所有 (pack_cards) starred=1 且 (review_next_at IS NULL OR review_next_at <= threshold)
    const [[dueRow]] = await db.execute(
      `SELECT COUNT(*) c FROM (
        SELECT pc.id AS pack_card_id,
               COALESCE(uc.starred, 1) AS starred,
               COALESCE(uc.archived, 0) AS archived,
               uc.review_next_at
        FROM user_pack_access upa
        JOIN pack_cards pc ON pc.pack_id = upa.pack_id
        LEFT JOIN user_cards uc ON uc.user_id = upa.user_id AND uc.pack_card_id = pc.id
        WHERE upa.user_id = ?
      ) sub
      WHERE starred = 1 AND archived = 0 AND (review_next_at IS NULL OR review_next_at <= NOW())`,
      [userId]
    );
    const [[weekRow]] = await db.execute(
      `SELECT COUNT(*) c FROM (
        SELECT pc.id AS pack_card_id,
               COALESCE(uc.starred, 1) AS starred,
               COALESCE(uc.archived, 0) AS archived,
               uc.review_next_at
        FROM user_pack_access upa
        JOIN pack_cards pc ON pc.pack_id = upa.pack_id
        LEFT JOIN user_cards uc ON uc.user_id = upa.user_id AND uc.pack_card_id = pc.id
        WHERE upa.user_id = ?
      ) sub
      WHERE starred = 1 AND archived = 0 AND (review_next_at IS NULL OR review_next_at <= DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [userId]
    );
    const [[totalRow]] = await db.execute(
      `SELECT COALESCE(SUM(review_count), 0) c FROM user_cards WHERE user_id = ?`,
      [userId]
    );
    return res.json({
      dueToday: Number(dueRow.c) || 0,
      dueThisWeek: Number(weekRow.c) || 0,
      totalReviews: Number(totalRow.c) || 0,
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// 行动清单 → user_actions (schema v3: pack_action_id NULLABLE = 用户自定义)
// ────────────────────────────────────────────────────────────────

router.post('/actions/commit', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const { packId, slotIndex, actionText, timeframe } = req.body || {};
    if (
      !Number.isInteger(packId) || packId <= 0 ||
      !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2 ||
      typeof actionText !== 'string' || !actionText.trim() ||
      !['today', 'week', 'longterm'].includes(timeframe)
    ) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid action payload' },
      }));
    }

    // 尝试 lookup pack_action_id (可能不存在,那是用户自定义 action)
    const [paRows] = await db.execute(
      `SELECT id FROM pack_actions WHERE pack_id = ? AND timeframe = ? AND slot_index = ? LIMIT 1`,
      [packId, timeframe, slotIndex]
    );
    const packActionId = paRows.length ? paRows[0].id : null;

    await db.execute(
      `INSERT INTO user_actions (user_id, pack_id, pack_action_id, slot_index, action_text, timeframe, status, done_at)
       VALUES (?, ?, ?, ?, ?, ?, 'done', NOW())
       ON DUPLICATE KEY UPDATE
         pack_action_id = VALUES(pack_action_id),
         action_text = VALUES(action_text),
         status = 'done',
         done_at = NOW(),
         updated_at = CURRENT_TIMESTAMP`,
      [userId, packId, packActionId, slotIndex, actionText.trim().slice(0, 500), timeframe]
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.post('/actions/uncommit', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const { packId, slotIndex, timeframe } = req.body || {};
    const VALID_TF = ['today', 'week', 'longterm'];
    if (
      !Number.isInteger(packId) || packId <= 0 ||
      !Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2 ||
      !VALID_TF.includes(timeframe)
    ) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid action payload' },
      }));
    }
    await db.execute(
      `DELETE FROM user_actions WHERE user_id = ? AND pack_id = ? AND timeframe = ? AND slot_index = ?`,
      [userId, packId, timeframe, slotIndex]
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/actions', async (req, res, next) => {
  if (!db) return res.json({ pending: [], done: [] });
  try {
    const userId = await resolveUserId(req);
    const [pending] = await db.execute(
      `SELECT ua.id, ua.pack_id, ua.slot_index, ua.action_text, ua.timeframe, ua.created_at
       FROM user_actions ua
       WHERE ua.user_id = ? AND ua.status = 'pending'
       ORDER BY FIELD(ua.timeframe, 'today', 'week', 'longterm'), ua.created_at DESC
       LIMIT 50`,
      [userId]
    );
    const [done] = await db.execute(
      `SELECT id, pack_id, slot_index, action_text, timeframe, done_at
       FROM user_actions
       WHERE user_id = ? AND status = 'done'
       ORDER BY done_at DESC LIMIT 20`,
      [userId]
    );
    return res.json({ pending, done });
  } catch (err) {
    next(err);
  }
});

router.patch('/actions/:id', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid id' },
      }));
    }
    const { status } = req.body || {};
    if (!['done', 'pending'].includes(status)) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid status' },
      }));
    }
    await db.execute(
      `UPDATE user_actions SET status = ?, done_at = ${status === 'done' ? 'NOW()' : 'NULL'}
       WHERE id = ? AND user_id = ?`,
      [status, id, userId]
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/actions/:id', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid id' },
      }));
    }
    await db.execute(`DELETE FROM user_actions WHERE id = ? AND user_id = ?`, [id, userId]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
