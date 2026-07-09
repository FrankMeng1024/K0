// learning.model.js — 用户学习态数据访问 (Phase 后端重构)
// 表(自有): user_pack_access / user_cards / user_step_progress / user_actions / user_comments / user_*_overrides
// READ-MODEL: 跨域只读聚合 (library/review 的 JOIN podcasts/episodes/transcripts/learning_packs/pack_cards)
//             拥有这些 JOIN, 只读不写外域表。当前聚合查询仍在 library/review controller 内,
//             后续可下沉到此。此文件先承载 user_pack_access 桥接访问 (原 packStore 拆出)。
import { db } from '../../shared/db.js';

export async function upsertUserPackAccess(userId, packId, mode) {
  if (mode) {
    await db.execute(
      `INSERT INTO user_pack_access (user_id, pack_id, mode) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE last_accessed_at = NOW(), access_count = access_count + 1, mode = VALUES(mode)`,
      [userId, packId, mode]
    );
  } else {
    await db.execute(
      `INSERT INTO user_pack_access (user_id, pack_id) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_accessed_at = NOW(), access_count = access_count + 1`,
      [userId, packId]
    );
  }
}

// READ-MODEL: JOIN learning_packs + transcripts (跨域只读)
export async function findUserPackByEpisode(userId, episodeId) {
  const [rows] = await db.execute(
    `SELECT lp.id AS pack_id, upa.mode
     FROM user_pack_access upa
     JOIN learning_packs lp ON upa.pack_id = lp.id
     JOIN transcripts t ON lp.transcript_id = t.id
     WHERE upa.user_id = ? AND t.episode_id = ?
     ORDER BY lp.created_at DESC LIMIT 1`,
    [userId, episodeId]
  );
  if (rows.length === 0) return null;
  return { packId: rows[0].pack_id, mode: rows[0].mode };
}
