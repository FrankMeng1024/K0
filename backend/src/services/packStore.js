// K0 backend - Episode/Transcript/Pack DB store
// 集中数据库读写逻辑，其他 service 通过此模块访问 DB

import { db } from '../config/db.js';

// ============================================================
// PODCASTS
// ============================================================
export async function upsertPodcast({ platform, platformPodcastId, name, author, description, coverImageUrl, rssUrl, language, primaryGenre, metadata }) {
  const [existing] = await db.execute(
    'SELECT id FROM podcasts WHERE platform = ? AND platform_podcast_id = ? LIMIT 1',
    [platform, platformPodcastId]
  );
  if (existing.length) {
    // Update name/rss/language if changed（RSS 可能变）
    await db.execute(
      `UPDATE podcasts SET name = ?, author = ?, description = ?, cover_image_url = ?, rss_url = ?, language = ?, primary_genre = ?, metadata = ?, updated_at = NOW() WHERE id = ?`,
      [name, author || null, description || null, coverImageUrl || null, rssUrl || null, language || null, primaryGenre || null,
       metadata ? JSON.stringify(metadata) : null, existing[0].id]
    );
    return existing[0].id;
  }
  const [result] = await db.execute(
    `INSERT INTO podcasts (platform, platform_podcast_id, name, author, description, cover_image_url, rss_url, language, primary_genre, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [platform, platformPodcastId, name, author || null, description || null, coverImageUrl || null, rssUrl || null,
     language || null, primaryGenre || null, metadata ? JSON.stringify(metadata) : null]
  );
  return result.insertId;
}

// ============================================================
// EPISODES
// ============================================================
export async function upsertEpisode(data) {
  const {
    podcastId, platform, platformEpisodeId, sourceUrl,
    title, description, durationSeconds, coverImageUrl, language, publishedAt,
    audioUrl, audioFormat, audioType, audioSizeBytes, audioUrlExpiresAt,
    transcriptUrlFromRss, metadata,
  } = data;

  const [existing] = await db.execute(
    'SELECT id FROM episodes WHERE platform = ? AND platform_episode_id = ? LIMIT 1',
    [platform, platformEpisodeId]
  );
  if (existing.length) {
    // 刷新 audio_url + audio_last_refreshed_at
    await db.execute(
      `UPDATE episodes SET
         title = ?, description = ?, duration_seconds = COALESCE(?, duration_seconds),
         cover_image_url = ?, language = COALESCE(?, language), published_at = COALESCE(?, published_at),
         audio_url = ?, audio_format = ?, audio_type = ?, audio_size_bytes = ?,
         audio_url_expires_at = ?, audio_last_refreshed_at = NOW(),
         transcript_url_from_rss = ?, metadata = ?, updated_at = NOW()
       WHERE id = ?`,
      [title, description || null, durationSeconds || null, coverImageUrl || null, language || null,
       publishedAt || null, audioUrl || null, audioFormat || null, audioType || null,
       audioSizeBytes || null, audioUrlExpiresAt || null, transcriptUrlFromRss || null,
       metadata ? JSON.stringify(metadata) : null, existing[0].id]
    );
    return existing[0].id;
  }

  const [result] = await db.execute(
    `INSERT INTO episodes (podcast_id, platform, platform_episode_id, source_url,
        title, description, duration_seconds, cover_image_url, language, published_at,
        audio_url, audio_format, audio_type, audio_size_bytes,
        audio_url_expires_at, audio_last_refreshed_at, transcript_url_from_rss, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
    [podcastId, platform, platformEpisodeId, sourceUrl,
     title, description || null, durationSeconds || null, coverImageUrl || null, language || null,
     publishedAt || null, audioUrl || null, audioFormat || null, audioType || null,
     audioSizeBytes || null, audioUrlExpiresAt || null, transcriptUrlFromRss || null,
     metadata ? JSON.stringify(metadata) : null]
  );
  return result.insertId;
}

export async function getEpisodeById(id) {
  const [rows] = await db.execute('SELECT * FROM episodes WHERE id = ? LIMIT 1', [id]);
  return rows[0] || null;
}

// ============================================================
// TRANSCRIPTS
// ============================================================
export async function upsertTranscript({ episodeId, provider, providerVersion, segments, durationSeconds, language, transcriptMs, metadata }) {
  const totalChars = segments.reduce((sum, s) => sum + (s.text?.length || 0), 0);
  const segmentCount = segments.length;

  const [existing] = await db.execute(
    'SELECT id FROM transcripts WHERE episode_id = ? AND provider = ? LIMIT 1',
    [episodeId, provider]
  );
  if (existing.length) {
    // 已有 transcript，不覆盖（保护旧数据）
    return existing[0].id;
  }

  const [result] = await db.execute(
    `INSERT INTO transcripts (episode_id, provider, provider_version, segments, segment_count, total_chars, duration_seconds, language, transcript_ms, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [episodeId, provider, providerVersion || null, JSON.stringify(segments), segmentCount, totalChars,
     durationSeconds || null, language || null, transcriptMs || null, metadata ? JSON.stringify(metadata) : null]
  );
  return result.insertId;
}

export async function getTranscriptByEpisodeAndProvider(episodeId, provider) {
  const [rows] = await db.execute(
    'SELECT * FROM transcripts WHERE episode_id = ? AND provider = ? AND status = "ready" LIMIT 1',
    [episodeId, provider]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    episodeId: r.episode_id,
    provider: r.provider,
    segments: typeof r.segments === 'string' ? JSON.parse(r.segments) : r.segments,
    segmentCount: r.segment_count,
    totalChars: r.total_chars,
    durationSeconds: r.duration_seconds,
    language: r.language,
    createdAt: r.created_at,
  };
}

// ============================================================
// LEARNING PACKS
// ============================================================
export async function findExistingPack(transcriptId, goal, glmModel, promptVersion) {
  const [rows] = await db.execute(
    `SELECT id, pack_json, created_at FROM learning_packs
     WHERE transcript_id = ? AND goal = ? AND glm_model = ? AND prompt_version = ? AND status = 'ready' LIMIT 1`,
    [transcriptId, goal, glmModel, promptVersion]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    pack: typeof r.pack_json === 'string' ? JSON.parse(r.pack_json) : r.pack_json,
    createdAt: r.created_at,
  };
}

// Sprint 14 R1 #19: 基于 transcript_id 找最新 snapshot pack（不区分 goal）
// 用户同一 URL 再次解析时，直接返回已存在的 pack，避免 Library 出现重复条目
export async function findLatestSnapshotPack(transcriptId) {
  const [rows] = await db.execute(
    `SELECT id, pack_json, goal, created_at FROM learning_packs
     WHERE transcript_id = ? AND status = 'ready'
     ORDER BY created_at DESC LIMIT 1`,
    [transcriptId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    goal: r.goal,
    pack: typeof r.pack_json === 'string' ? JSON.parse(r.pack_json) : r.pack_json,
    createdAt: r.created_at,
  };
}

export async function insertPack({ transcriptId, goal, glmModel, promptVersion, generationStrategy, language, packJson, generationMs, inputTokens, outputTokens, metadata }) {
  const [result] = await db.execute(
    `INSERT INTO learning_packs (transcript_id, goal, glm_model, prompt_version, generation_strategy, language, pack_json, status, generation_ms, input_tokens, output_tokens, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`,
    [transcriptId, goal, glmModel, promptVersion, generationStrategy || 'plan-b', language || null,
     JSON.stringify(packJson), generationMs || null, inputTokens || null, outputTokens || null,
     metadata ? JSON.stringify(metadata) : null]
  );
  return result.insertId;
}

export async function getPackById(id) {
  const [rows] = await db.execute(
    'SELECT id, transcript_id, goal, glm_model, prompt_version, language, pack_json, created_at FROM learning_packs WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    transcriptId: r.transcript_id,
    goal: r.goal,
    glmModel: r.glm_model,
    promptVersion: r.prompt_version,
    language: r.language,
    pack: typeof r.pack_json === 'string' ? JSON.parse(r.pack_json) : r.pack_json,
    createdAt: r.created_at,
  };
}

// ============================================================
// USER PACK ACCESS (桥接表)
// ============================================================
export async function upsertUserPackAccess(userId, packId) {
  await db.execute(
    `INSERT INTO user_pack_access (user_id, pack_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE last_accessed_at = NOW(), access_count = access_count + 1`,
    [userId, packId]
  );
}
