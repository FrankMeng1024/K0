// Review router — E-005 Review System (SRS 复习系统)
// 简化 SM-2 算法：记得 → +7/14/30d，模糊 → +3d，不记得 → +1d
import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';
import { getOrCreateUserByAnonymousId } from '../services/userStore.js';

const router = Router();

async function resolveUserId(req) {
  const anonymousId = req.query.anonymousId || req.body?.anonymousId;
  if (anonymousId && db) {
    try {
      const user = await getOrCreateUserByAnonymousId(anonymousId);
      return user.id;
    } catch {}
  }
  return req.user.id;
}

/**
 * GET /api/review/queue
 * 用户今天需要复习的卡片。
 * 每张 pack.cards 默认收藏（PRD C-006），因此从 user_pack_access 拉所有 pack 的 cards
 * LEFT JOIN user_cards 得 explicit state; 未 explicit unstar 的都视为 starred + due
 * Query: anonymousId, limit=20
 */
router.get('/queue', async (req, res, next) => {
  if (!db) return res.json({ due: [], upcoming: [] });
  try {
    const userId = await resolveUserId(req);
    const limit = Math.min(50, parseInt(req.query.limit || '20', 10));

    // 用 JSON_TABLE 拆开每 pack 的 cards[] + LEFT JOIN user_cards
    // 每张卡的默认 starred=1，unless user_cards.starred = 0
    const sql = `
      SELECT
        lp.id AS pack_id,
        j.card_index_1based,
        (j.card_index_1based - 1) AS card_index,
        j.card_type,
        j.card_title,
        j.card_explanation,
        j.source_timestamp,
        COALESCE(uc.starred, 1) AS starred,
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
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      JOIN JSON_TABLE(
        lp.pack_json, '$.cards[*]'
        COLUMNS (
          card_index_1based FOR ORDINALITY,
          card_type VARCHAR(30) PATH '$.type',
          card_title VARCHAR(500) PATH '$.title',
          card_explanation TEXT PATH '$.explanation',
          source_timestamp INT PATH '$.sourceTimestamp'
        )
      ) j
      LEFT JOIN user_cards uc ON uc.user_id = upa.user_id
        AND uc.pack_id = lp.id
        AND uc.card_index = (j.card_index_1based - 1)
      WHERE upa.user_id = ?
        AND COALESCE(uc.starred, 1) = 1
      ORDER BY
        CASE
          WHEN uc.review_next_at IS NULL THEN 1
          WHEN uc.review_next_at <= NOW() THEN 0
          ELSE 2
        END,
        upa.first_accessed_at ASC,
        j.card_index_1based ASC
      LIMIT ` + limit;

    const [rows] = await db.execute(sql, [userId]);
    const due = [];
    const upcoming = [];
    const now = Date.now();

    for (const r of rows) {
      const item = {
        userCardId: r.user_card_id, // 可能为 null（首次遇到）
        packId: r.pack_id,
        cardIndex: r.card_index,
        title: r.card_title,
        explanation: r.card_explanation,
        type: r.card_type,
        sourceTimestamp: r.source_timestamp,
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
 * 给一张卡片打 SRS 评分
 * Body: { anonymousId, packId, cardIndex, rating: 'known'|'fuzzy'|'forgot' }
 * 若首次评分，会自动创建 user_cards 行（默认 starred=1）
 */
router.post('/rate', async (req, res, next) => {
  if (!db) return res.json({ ok: true });
  try {
    const userId = await resolveUserId(req);
    const { packId, cardIndex, rating } = req.body || {};
    if (typeof packId !== 'number' || typeof cardIndex !== 'number' || !['known', 'fuzzy', 'forgot'].includes(rating)) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'packId + cardIndex + rating(known|fuzzy|forgot) required' },
      }));
    }

    // Get current state (may not exist)
    const [rows] = await db.execute(
      `SELECT id, review_interval_days, review_count FROM user_cards
       WHERE user_id = ? AND pack_id = ? AND card_index = ? LIMIT 1`,
      [userId, packId, cardIndex]
    );
    const curInterval = rows.length ? (rows[0].review_interval_days || 0) : 0;
    const curCount = rows.length ? (rows[0].review_count || 0) : 0;

    // 简化 SM-2:
    //   known:  interval * 2 (最少 3, 最多 90)
    //   fuzzy:  保持当前 interval（若 0 则 3）
    //   forgot: reset to 1
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

    // Upsert user_cards
    await db.execute(
      `INSERT INTO user_cards (user_id, pack_id, card_index, starred, review_state, review_interval_days, review_next_at, review_count)
       VALUES (?, ?, ?, 1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         review_state = VALUES(review_state),
         review_interval_days = VALUES(review_interval_days),
         review_next_at = VALUES(review_next_at),
         review_count = VALUES(review_count),
         updated_at = NOW()`,
      [userId, packId, cardIndex, rating, nextInterval, nextAt, nextCount]
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
 * GET /api/review/stats
 * 汇总：today due 数, 本周 due 数, 已复习总次数
 */
router.get('/stats', async (req, res, next) => {
  if (!db) return res.json({ dueToday: 0, dueThisWeek: 0, totalReviews: 0 });
  try {
    const userId = await resolveUserId(req);
    // 从 user_pack_access + JSON_TABLE 计算所有 (pack, card_index) 组合
    // 减去 explicit unstarred，加上 review_next_at 过滤
    const [[dueRow]] = await db.execute(
      `SELECT COUNT(*) c FROM (
        SELECT lp.id AS pack_id, j.i AS card_index,
               COALESCE(uc.starred, 1) AS starred,
               uc.review_next_at
        FROM user_pack_access upa
        JOIN learning_packs lp ON upa.pack_id = lp.id
        JOIN JSON_TABLE(lp.pack_json, '$.cards[*]' COLUMNS (i FOR ORDINALITY)) j
        LEFT JOIN user_cards uc ON uc.user_id = upa.user_id
          AND uc.pack_id = lp.id AND uc.card_index = (j.i - 1)
        WHERE upa.user_id = ?
      ) sub
      WHERE starred = 1 AND (review_next_at IS NULL OR review_next_at <= NOW())`,
      [userId]
    );
    const [[weekRow]] = await db.execute(
      `SELECT COUNT(*) c FROM (
        SELECT lp.id AS pack_id, j.i AS card_index,
               COALESCE(uc.starred, 1) AS starred,
               uc.review_next_at
        FROM user_pack_access upa
        JOIN learning_packs lp ON upa.pack_id = lp.id
        JOIN JSON_TABLE(lp.pack_json, '$.cards[*]' COLUMNS (i FOR ORDINALITY)) j
        LEFT JOIN user_cards uc ON uc.user_id = upa.user_id
          AND uc.pack_id = lp.id AND uc.card_index = (j.i - 1)
        WHERE upa.user_id = ?
      ) sub
      WHERE starred = 1 AND (review_next_at IS NULL OR review_next_at <= DATE_ADD(NOW(), INTERVAL 7 DAY))`,
      [userId]
    );
    const [[totalRow]] = await db.execute(
      `SELECT COALESCE(SUM(review_count), 0) c FROM user_cards WHERE user_id = ?`,
      [userId]
    );
    return res.json({
      dueToday: dueRow.c,
      dueThisWeek: weekRow.c,
      totalReviews: totalRow.c,
    });
  } catch (err) {
    next(err);
  }
});

// ────────────────────────────────────────────────────────────────
// Sprint 10 STORY-01004: 行动清单 → Review 承诺
// ────────────────────────────────────────────────────────────────

router.post('/actions/commit', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const { packId, actionIndex, actionText, timeframe } = req.body || {};
    if (
      !Number.isInteger(packId) || packId <= 0 ||
      !Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 2 ||
      typeof actionText !== 'string' || !actionText.trim() ||
      !['today', 'week', 'longterm'].includes(timeframe)
    ) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid action payload' },
      }));
    }
    await db.execute(
      `INSERT INTO user_actions (user_id, pack_id, action_index, action_text, timeframe, status)
       VALUES (?, ?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE
         action_text = VALUES(action_text),
         timeframe = VALUES(timeframe),
         status = 'pending',
         done_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, packId, actionIndex, actionText.trim().slice(0, 500), timeframe]
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
      `SELECT ua.id, ua.pack_id, ua.action_index, ua.action_text, ua.timeframe, ua.created_at
       FROM user_actions ua
       WHERE ua.user_id = ? AND ua.status = 'pending'
       ORDER BY FIELD(ua.timeframe, 'today', 'week', 'longterm'), ua.created_at DESC
       LIMIT 50`,
      [userId]
    );
    const [done] = await db.execute(
      `SELECT id, pack_id, action_index, action_text, timeframe, done_at
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
