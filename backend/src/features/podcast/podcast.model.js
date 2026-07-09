// podcast.model.js — 播客源 + 单集 + 音频源 数据访问 (Phase 后端重构, 原 packStore 拆出)
// 表: podcasts / episodes / episode_audio_sources
import { db } from '../../shared/db.js';

// ── PODCASTS ──────────────────────────────────────────────
export async function upsertPodcast({ platform, platformPodcastId, name, author, description, coverImageUrl, rssUrl, originalLanguage, primaryGenre, extra }) {
  const [existing] = await db.execute(
    'SELECT id FROM podcasts WHERE platform = ? AND platform_podcast_id = ? LIMIT 1',
    [platform, platformPodcastId]
  );
  if (existing.length) {
    await db.execute(
      `UPDATE podcasts SET name = ?, author = ?, description = ?, cover_image_url = ?, rss_url = ?, original_language = ?, primary_genre = ?, extra = ?, updated_at = NOW() WHERE id = ?`,
      [name, author || null, description || null, coverImageUrl || null, rssUrl || null, originalLanguage || null, primaryGenre || null,
       extra ? JSON.stringify(extra) : null, existing[0].id]
    );
    return existing[0].id;
  }
  const [result] = await db.execute(
    `INSERT INTO podcasts (platform, platform_podcast_id, name, author, description, cover_image_url, rss_url, original_language, primary_genre, extra)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [platform, platformPodcastId, name, author || null, description || null, coverImageUrl || null, rssUrl || null,
     originalLanguage || null, primaryGenre || null, extra ? JSON.stringify(extra) : null]
  );
  return result.insertId;
}

// ── EPISODES + EPISODE_AUDIO_SOURCES ──────────────────────
export async function upsertEpisode(data) {
  const {
    podcastId, platform, platformEpisodeId, sourceUrl,
    title, description, durationSeconds, coverImageUrl, originalLanguage, publishedAt,
    audioUrl, audioFormat, audioType, audioSizeBytes, audioUrlExpiresAt,
    transcriptUrlFromRss, extra,
  } = data;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.execute(
      'SELECT id FROM episodes WHERE platform = ? AND platform_episode_id = ? LIMIT 1',
      [platform, platformEpisodeId]
    );
    let episodeId;
    if (existing.length) {
      episodeId = existing[0].id;
      await conn.execute(
        `UPDATE episodes SET title = ?, description = ?, duration_seconds = COALESCE(?, duration_seconds),
           cover_image_url = ?, original_language = COALESCE(?, original_language), published_at = COALESCE(?, published_at),
           transcript_url_from_rss = ?, extra = ?, updated_at = NOW()
         WHERE id = ?`,
        [title, description || null, durationSeconds || null, coverImageUrl || null, originalLanguage || null,
         publishedAt || null, transcriptUrlFromRss || null,
         extra ? JSON.stringify(extra) : null, episodeId]
      );
    } else {
      const [result] = await conn.execute(
        `INSERT INTO episodes (podcast_id, platform, platform_episode_id, source_url,
            title, description, duration_seconds, cover_image_url, original_language, published_at,
            transcript_url_from_rss, extra)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [podcastId, platform, platformEpisodeId, sourceUrl,
         title, description || null, durationSeconds || null, coverImageUrl || null, originalLanguage || null,
         publishedAt || null, transcriptUrlFromRss || null,
         extra ? JSON.stringify(extra) : null]
      );
      episodeId = result.insertId;
    }

    // 处理音频源: audioUrl 存在 → upsert to episode_audio_sources (source_type='original', is_primary=true)
    if (audioUrl) {
      await conn.execute(
        `UPDATE episode_audio_sources SET is_primary = FALSE WHERE episode_id = ? AND is_primary = TRUE`,
        [episodeId]
      );
      await conn.execute(
        `INSERT INTO episode_audio_sources (episode_id, source_type, language, url, format, audio_type, size_bytes, expires_at, last_refreshed_at, is_primary)
         VALUES (?, 'original', ?, ?, ?, ?, ?, ?, NOW(), TRUE)
         ON DUPLICATE KEY UPDATE
           url = VALUES(url), format = VALUES(format), audio_type = VALUES(audio_type),
           size_bytes = VALUES(size_bytes), expires_at = VALUES(expires_at),
           last_refreshed_at = NOW(), is_primary = TRUE`,
        [episodeId, originalLanguage || null, audioUrl, audioFormat || null, audioType || null,
         audioSizeBytes || null, audioUrlExpiresAt || null]
      );
    }

    await conn.commit();
    return episodeId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
}

export async function getEpisodeById(id) {
  const [rows] = await db.execute('SELECT * FROM episodes WHERE id = ? LIMIT 1', [id]);
  if (!rows.length) return null;
  const ep = rows[0];
  const [audioRows] = await db.execute(
    `SELECT url AS audio_url, format AS audio_format, audio_type, size_bytes AS audio_size_bytes,
            expires_at AS audio_url_expires_at, last_refreshed_at AS audio_last_refreshed_at
     FROM episode_audio_sources WHERE episode_id = ? AND is_primary = TRUE LIMIT 1`,
    [id]
  );
  if (audioRows.length) {
    Object.assign(ep, audioRows[0]);
  }
  return ep;
}
