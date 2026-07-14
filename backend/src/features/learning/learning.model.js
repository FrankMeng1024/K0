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

// R66 兜底去重: 同 user + 同 podcast + 同标题 的 episode 若已有 pack, 复用它。
//   治 "Apple 同一集节目发了两个不同 platform_episode_id(i=)" 导致的重复学习包
//   (episode 按 platform_episode_id 去重, 不同 i= → 两个 episode → 各生成 pack)。
//   标题精确相等才复用(保守, 不误合并真不同的集)。
export async function findUserPackByPodcastTitle(userId, podcastId, title) {
  if (!podcastId || !title) return null;
  const [rows] = await db.execute(
    `SELECT lp.id AS pack_id, upa.mode
     FROM user_pack_access upa
     JOIN learning_packs lp ON upa.pack_id = lp.id
     JOIN transcripts t ON lp.transcript_id = t.id
     JOIN episodes e ON t.episode_id = e.id
     WHERE upa.user_id = ? AND e.podcast_id = ? AND e.title = ?
     ORDER BY lp.created_at DESC LIMIT 1`,
    [userId, podcastId, title]
  );
  if (rows.length === 0) return null;
  return { packId: rows[0].pack_id, mode: rows[0].mode };
}
