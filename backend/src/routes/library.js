// Library router - E-006 Knowledge Library
// 用户跨集浏览所有学习包 + 卡片 + 收藏筛选
import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';
import { getOrCreateUserByAnonymousId } from '../services/userStore.js';

const router = Router();

// 解析 userId：优先 anonymousId query param（因为 GET 不能带 body），否则 req.user.id
async function resolveUserId(req) {
  const anonymousId = req.query.anonymousId;
  if (anonymousId && db) {
    try {
      const user = await getOrCreateUserByAnonymousId(anonymousId);
      return user.id;
    } catch {
      // fall through
    }
  }
  return req.user.id;
}

/**
 * GET /api/library/packs
 * 用户已导入的所有学习包（含 podcast/episode 元数据）
 * Query params:
 *   goal?: string  过滤 goal
 *   limit?: number 默认 50
 */
router.get('/packs', async (req, res, next) => {
  if (!db) return res.json({ packs: [] });
  try {
    const userId = await resolveUserId(req);
    const { goal, mode } = req.query;
    const limit = Math.min(100, parseInt(req.query.limit || '50', 10));

    // JOIN chain: user_pack_access → learning_packs → transcripts → episodes → podcasts
    const params = [userId];
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
        JSON_UNQUOTE(JSON_EXTRACT(lp.pack_json, '$.oneSentence')) AS one_sentence,
        JSON_LENGTH(JSON_EXTRACT(lp.pack_json, '$.cards')) AS cards_count,
        (SELECT COUNT(*) FROM user_step_progress usp WHERE usp.user_id = ? AND usp.pack_id = lp.id) AS steps_done_count
      FROM user_pack_access upa
      JOIN learning_packs lp ON upa.pack_id = lp.id
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      WHERE upa.user_id = ?
    `;
    params.push(userId, userId);
    if (goal) {
      sql += ' AND lp.goal = ?';
      params.push(goal);
    }
    // Sprint 11 v3: mode 过滤（skip/quick/deep）
    // Sprint 16 R3-4: mode=skip 兼容 NULL（快照生成但用户未决定 = 视作跳过）
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
        cardsCount: r.cards_count,
        stepsDoneCount: r.steps_done_count,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/library/cards
 * 用户所有卡片（按 pack 分组前的扁平列表）
 * Query params:
 *   starred?: 'true'|'false'  只看收藏/未收藏
 *   type?: string  过滤类型 (opinion/method/case/reflection/action)
 *   limit?: number
 */
router.get('/cards', async (req, res, next) => {
  if (!db) return res.json({ cards: [] });
  try {
    const userId = await resolveUserId(req);
    const { starred, type } = req.query;
    const limit = Math.min(200, parseInt(req.query.limit || '100', 10));

    // 每个 pack 的 cards 数组 unrolled 成扁平记录
    // 用 JSON_TABLE 拆分（MySQL 8+）
    const params = [userId];
    let sql = `
      SELECT
        lp.id AS pack_id,
        lp.goal,
        lp.created_at AS pack_created_at,
        e.title AS episode_title,
        e.cover_image_url,
        p.name AS podcast_name,
        j.card_index,
        j.card_type,
        j.card_title,
        j.card_explanation,
        j.source_timestamp,
        COALESCE(uc.starred, 1) AS starred
      FROM user_pack_access upa
      JOIN learning_packs lp ON upa.pack_id = lp.id
      LEFT JOIN transcripts t ON lp.transcript_id = t.id
      LEFT JOIN episodes e ON t.episode_id = e.id
      LEFT JOIN podcasts p ON e.podcast_id = p.id
      JOIN JSON_TABLE(
        lp.pack_json, '$.cards[*]'
        COLUMNS (
          card_index FOR ORDINALITY,
          card_type VARCHAR(30) PATH '$.type',
          card_title VARCHAR(500) PATH '$.title',
          card_explanation TEXT PATH '$.explanation',
          source_timestamp INT PATH '$.sourceTimestamp'
        )
      ) j
      LEFT JOIN user_cards uc
        ON uc.user_id = upa.user_id
        AND uc.pack_id = lp.id
        AND uc.card_index = (j.card_index - 1)
      WHERE upa.user_id = ?
    `;
    if (starred === 'true') {
      sql += ' AND COALESCE(uc.starred, 1) = 1';
    } else if (starred === 'false') {
      sql += ' AND COALESCE(uc.starred, 1) = 0';
    }
    if (type) {
      sql += ' AND j.card_type = ?';
      params.push(type);
    }
    sql += ' ORDER BY lp.created_at DESC, j.card_index ASC LIMIT ' + limit;

    const [rows] = await db.execute(sql, params);
    return res.json({
      cards: rows.map(r => ({
        packId: r.pack_id,
        cardIndex: r.card_index - 1, // JSON_TABLE 从 1 起，我们内部从 0
        type: r.card_type,
        title: r.card_title,
        explanation: r.card_explanation,
        sourceTimestamp: r.source_timestamp,
        starred: !!r.starred,
        // 元数据
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
 * GET /api/library/stats
 * 汇总数字：packs 总数 / cards 总数 / 收藏卡片数 / 完成步骤数
 */
router.get('/stats', async (req, res, next) => {
  if (!db) return res.json({ packsCount: 0, cardsCount: 0, starredCount: 0, stepsDoneCount: 0 });
  try {
    const userId = await resolveUserId(req);
    const [[packRow]] = await db.execute(
      `SELECT COUNT(*) AS c FROM user_pack_access WHERE user_id = ?`,
      [userId]
    );
    const [[cardsRow]] = await db.execute(
      `SELECT COALESCE(SUM(JSON_LENGTH(JSON_EXTRACT(lp.pack_json, '$.cards'))), 0) AS c
       FROM user_pack_access upa JOIN learning_packs lp ON upa.pack_id = lp.id
       WHERE upa.user_id = ?`,
      [userId]
    );
    const [[starredRow]] = await db.execute(
      `SELECT COUNT(*) AS c FROM user_cards WHERE user_id = ? AND starred = 1`,
      [userId]
    );
    const [[stepsRow]] = await db.execute(
      `SELECT COUNT(*) AS c FROM user_step_progress WHERE user_id = ?`,
      [userId]
    );
    return res.json({
      packsCount: packRow.c,
      cardsCount: cardsRow.c,
      starredCount: starredRow.c,
      stepsDoneCount: stepsRow.c,
    });
  } catch (err) {
    next(err);
  }
});

// Sprint 14 R2: 删除用户对 pack 的访问（保留 pack 本身，只删 user_pack_access）
// DELETE /api/library/packs/:packId?anonymousId=xxx
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
    await db.execute(
      `DELETE FROM user_pack_access WHERE user_id = ? AND pack_id = ?`,
      [userId, packId]
    );
    // 也清理该用户在此 pack 上的其他数据
    await db.execute(`DELETE FROM user_step_progress WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    await db.execute(`DELETE FROM user_actions WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    await db.execute(`DELETE FROM user_cards WHERE user_id = ? AND pack_id = ?`, [userId, packId]);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
