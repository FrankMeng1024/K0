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

    // 用聚合子查询做 LEFT JOIN, 避免行级 correlated subquery (audit C4)
    const params = [userId, userId, userId, userId];
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
        COALESCE(pcc.c, 0) - COALESCE(uca.c, 0) AS cards_count,
        COALESCE(usp.c, 0) AS steps_done_count,
        COALESCE(uat.c, 0) AS today_total,
        COALESCE(uad.c, 0) AS today_done
      FROM user_pack_access upa
      JOIN learning_packs lp ON upa.pack_id = lp.id
      LEFT JOIN pack_snapshots ps ON ps.pack_id = lp.id
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      LEFT JOIN (SELECT pack_id, COUNT(*) AS c FROM pack_cards GROUP BY pack_id) pcc ON pcc.pack_id = lp.id
      LEFT JOIN (SELECT pack_id, COUNT(*) AS c FROM user_cards WHERE user_id = ? AND archived = 1 GROUP BY pack_id) uca ON uca.pack_id = lp.id
      LEFT JOIN (SELECT pack_id, COUNT(*) AS c FROM user_step_progress WHERE user_id = ? GROUP BY pack_id) usp ON usp.pack_id = lp.id
      LEFT JOIN (SELECT pack_id, COUNT(*) AS c FROM user_actions WHERE user_id = ? AND timeframe = 'today' GROUP BY pack_id) uat ON uat.pack_id = lp.id
      LEFT JOIN (SELECT pack_id, COUNT(*) AS c FROM user_actions WHERE user_id = ? AND timeframe = 'today' AND status = 'done' GROUP BY pack_id) uad ON uad.pack_id = lp.id
      WHERE upa.user_id = ?
    `;
    params.push(userId);
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
    // cards_count = 总 pack_cards - 用户 archived 的 (简化: 直接 COUNT 不用 GROUP BY 再 SUM)
    const [[cardsRow]] = await db.execute(
      `SELECT
         (SELECT COUNT(*) FROM pack_cards pc
          WHERE pc.pack_id IN (SELECT pack_id FROM user_pack_access WHERE user_id = ?))
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

// DELETE /api/library/packs/:packId - 删除用户对 pack 的访问 (事务化清理桥接表)
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
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      // 应用层 cascade (无 FK). 顺序:
      //   user_comments (多态,可能引用 card/concept/step/action) → user_cards → user_step_progress → user_actions → user_pack_access
      // 先清 user_comments 里指向此 pack 下 target 的 (card/concept/step/action/core_point)
      // (性能低但正确; 未来量大再优化)
      await conn.execute(
        `DELETE FROM user_comments WHERE user_id = ? AND
           ((target_type = 'card' AND target_id IN (SELECT id FROM pack_cards WHERE pack_id = ?))
         OR (target_type = 'concept' AND target_id IN (SELECT id FROM pack_concepts WHERE pack_id = ?))
         OR (target_type = 'step' AND target_id IN (SELECT id FROM pack_steps WHERE pack_id = ?))
         OR (target_type = 'action' AND target_id IN (SELECT id FROM pack_actions WHERE pack_id = ?))
         OR (target_type = 'core_point' AND target_id IN (SELECT id FROM pack_core_points WHERE pack_id = ?))
         OR (target_type = 'pack' AND target_id = ?))`,
        [userId, packId, packId, packId, packId, packId, packId]
      );
      await conn.execute(`DELETE FROM user_cards WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
      await conn.execute(`DELETE FROM user_step_progress WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
      await conn.execute(`DELETE FROM user_actions WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
      await conn.execute(`DELETE FROM user_pack_access WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
      await conn.commit();
      return res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
