// Library router - E-006 Knowledge Library (Schema v3)
// Refactor Phase 1.5: 拆表版 - 去 JSON_EXTRACT / JSON_TABLE
import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';

const router = Router();

async function resolveUserId(req) {
  return req.user?.id || null;
}

/**
 * GET /api/library/packs
 * 用户已导入的所有学习包
 */
router.get('/packs', async (req, res, next) => {
  if (!db) return res.json({ packs: [] });
  try {
    const userId = await resolveUserId(req);
    const { goal, mode } = req.query;
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));

    const params = [userId, userId, userId, userId, userId];
    let sql = `
      SELECT
        lp.id AS pack_id,
        lp.goal,
        lp.language,
        lp.created_at,
        upa.mode AS user_mode,
        e.id AS episode_id,
        e.title AS episode_title,
        e.duration_seconds,
        e.cover_image_url,
        p.name AS podcast_name,
        p.platform,
        ps.one_sentence,
        (
          (SELECT COUNT(*) FROM pack_cards pc WHERE pc.pack_id = lp.id)
          - COALESCE((SELECT COUNT(*) FROM user_cards uc
                      WHERE uc.user_id = ? AND uc.pack_id = lp.id AND uc.archived = 1), 0)
        ) AS cards_count,
        (SELECT COUNT(*) FROM user_step_progress usp WHERE usp.user_id = ? AND usp.pack_id = lp.id) AS steps_done_count,
        (SELECT COUNT(*) FROM user_actions ua WHERE ua.user_id = ? AND ua.pack_id = lp.id AND ua.timeframe = 'today') AS today_total,
        (SELECT COUNT(*) FROM user_actions ua WHERE ua.user_id = ? AND ua.pack_id = lp.id AND ua.timeframe = 'today' AND ua.status = 'done') AS today_done
      FROM user_pack_access upa
      JOIN learning_packs lp ON upa.pack_id = lp.id
      LEFT JOIN pack_snapshots ps ON ps.pack_id = lp.id
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      WHERE upa.user_id = ?
    `;
    if (goal) {
      sql += ' AND lp.goal = ?';
      params.push(goal);
    }
    if (mode) {
      if (mode === 'skip') {
        sql += " AND (upa.mode = 'skip' OR upa.mode IS NULL)";
      } else {
        sql += ' AND upa.mode = ?';
        params.push(mode);
      }
    }
    sql += ' ORDER BY lp.created_at DESC LIMIT ' + limit;

    const [rows] = await db.execute(sql, params);
    return res.json({
      packs: rows.map(r => ({
        packId: r.pack_id,
        goal: r.goal,
        language: r.language,
        createdAt: r.created_at,
        mode: r.user_mode,
        episodeId: r.episode_id,
        episodeTitle: r.episode_title,
        durationSeconds: r.duration_seconds,
        coverImageUrl: r.cover_image_url,
        podcastName: r.podcast_name,
        platform: r.platform,
        oneSentence: r.one_sentence,
        cardsCount: Number(r.cards_count) || 0,
        stepsDoneCount: Number(r.steps_done_count) || 0,
        todayTotal: Number(r.today_total) || 0,
        todayDone: Number(r.today_done) || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/library/cards - 用户所有卡片扁平列表
 */
router.get('/cards', async (req, res, next) => {
  if (!db) return res.json({ cards: [] });
  try {
    const userId = await resolveUserId(req);
    const { starred } = req.query;
    const limit = Math.min(200, parseInt(req.query.limit || '100', 10));

    // 从 pack_cards 直接查,LEFT JOIN user_cards 合并个人状态
    const params = [userId];
    let sql = `
      SELECT
        lp.id AS pack_id,
        lp.goal,
        lp.created_at AS pack_created_at,
        e.title AS episode_title,
        e.cover_image_url,
        p.name AS podcast_name,
        pc.id AS pack_card_id,
        pc.position AS card_index,
        pc.quote AS card_quote,
        pc.insight AS card_insight,
        pc.context AS card_context,
        pc.timestamp_sec AS source_timestamp,
        COALESCE(uc.starred, 1) AS starred,
        COALESCE(uc.archived, 0) AS archived
      FROM user_pack_access upa
      JOIN learning_packs lp ON upa.pack_id = lp.id
      JOIN pack_cards pc ON pc.pack_id = lp.id
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      LEFT JOIN user_cards uc ON uc.user_id = upa.user_id AND uc.pack_card_id = pc.id
      WHERE upa.user_id = ?
        AND COALESCE(uc.archived, 0) = 0
    `;
    if (starred === 'true') {
      sql += ' AND COALESCE(uc.starred, 1) = 1';
    } else if (starred === 'false') {
      sql += ' AND COALESCE(uc.starred, 1) = 0';
    }
    sql += ' ORDER BY lp.created_at DESC, pc.position ASC LIMIT ' + limit;

    const [rows] = await db.execute(sql, params);
    return res.json({
      cards: rows.map(r => ({
        packId: r.pack_id,
        cardIndex: r.card_index,          // 0-based position
        packCardId: r.pack_card_id,       // 未来 override / comment 用
        quote: r.card_quote,
        insight: r.card_insight,
        context: r.card_context,
        sourceTimestamp: r.source_timestamp ? Number(r.source_timestamp) : null,
        starred: !!r.starred,
        episodeTitle: r.episode_title,
        coverImageUrl: r.cover_image_url,
        podcastName: r.podcast_name,
        goal: r.goal,
        packCreatedAt: r.pack_created_at,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/library/stats - packs / cards / starred / steps 汇总数字
 */
router.get('/stats', async (req, res, next) => {
  if (!db) return res.json({ packsCount: 0, cardsCount: 0, starredCount: 0, stepsDoneCount: 0 });
  try {
    const userId = await resolveUserId(req);
    const [[packRow]] = await db.execute(
      `SELECT COUNT(*) AS c FROM user_pack_access WHERE user_id = ?`,
      [userId]
    );
    // cards_count = 总 pack_cards - 用户 archived 的
    const [[cardsRow]] = await db.execute(
      `SELECT
         (SELECT COALESCE(SUM(cnt), 0) FROM (
           SELECT COUNT(*) AS cnt FROM pack_cards pc
           WHERE pc.pack_id IN (SELECT pack_id FROM user_pack_access WHERE user_id = ?)
           GROUP BY pc.pack_id
         ) t)
         - COALESCE((SELECT COUNT(*) FROM user_cards uc
                     WHERE uc.user_id = ? AND uc.archived = 1
                       AND uc.pack_id IN (SELECT pack_id FROM user_pack_access WHERE user_id = ?)), 0)
         AS c`,
      [userId, userId, userId]
    );
    const [[starredRow]] = await db.execute(
      `SELECT COUNT(*) AS c FROM user_cards WHERE user_id = ? AND starred = 1 AND COALESCE(archived, 0) = 0`,
      [userId]
    );
    const [[stepsRow]] = await db.execute(
      `SELECT COUNT(*) AS c FROM user_step_progress WHERE user_id = ?`,
      [userId]
    );
    return res.json({
      packsCount: Number(packRow.c) || 0,
      cardsCount: Number(cardsRow.c) || 0,
      starredCount: Number(starredRow.c) || 0,
      stepsDoneCount: Number(stepsRow.c) || 0,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/library/packs/:packId - 删除用户对 pack 的访问
router.delete('/packs/:packId', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const packId = parseInt(req.params.packId, 10);
    if (!Number.isInteger(packId) || packId <= 0) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'invalid packId' },
      }));
    }
    // 应用层 cascade (无 FK)
    await db.execute(`DELETE FROM user_cards WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    await db.execute(`DELETE FROM user_step_progress WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    await db.execute(`DELETE FROM user_actions WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    await db.execute(`DELETE FROM user_pack_access WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
