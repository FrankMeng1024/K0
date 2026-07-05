// Episodes route — E-001 Import
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { db } from '../config/db.js';
import { parseAppleUrl, fetchAppleMetadata } from '../services/appleImport.js';
import { detectLanguage } from '../services/langDetect.js';
import { throwApiError, ErrorCode } from '../lib/errors.js';

const router = Router();

// Rate limit: 10 imports per minute per user_id
const importRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  keyGenerator: (req) => String(req.user?.id || req.ip),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: ErrorCode.RATE_LIMITED,
        message: 'Too many import requests. Limit: 10 per minute.',
      },
    });
  },
});

const importSchema = z.union([
  z.object({
    url: z.string().url(),
    source: z.enum(['auto', 'apple', 'youtube', 'spotify']).optional().default('auto'),
  }),
  z.object({
    source: z.literal('text'),
    text: z.string().min(200, 'Text must be at least 200 characters').max(100_000),
  }),
]);

/**
 * Detect source from URL when source='auto'
 */
function detectSource(url) {
  if (!url) return 'text';
  try {
    const { hostname } = new URL(url);
    if (hostname.includes('podcasts.apple.com') || hostname.includes('itunes.apple.com')) return 'apple';
    if (hostname.includes('spotify.com')) return 'spotify';
    if (hostname.includes('youtube.com') || hostname === 'youtu.be') return 'youtube';
  } catch {
    // Not a URL
  }
  return 'unknown';
}

/**
 * POST /api/episodes/import
 */
router.post('/import', importRateLimit, async (req, res, next) => {
  // Validate request body
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Invalid request body',
        details: parsed.error.flatten(),
      },
    }));
  }

  const body = parsed.data;
  const userId = req.user.id;

  // Determine effective source
  let source = body.source;
  if (source === 'auto' && body.url) {
    source = detectSource(body.url);
  }

  // Route by source
  if (source === 'youtube') {
    throwApiError(
      ErrorCode.YOUTUBE_MANUAL_ONLY,
      '请把 YouTube 描述或字幕文本粘贴过来。YouTube 链接目前不支持自动抓取。',
      null,
      400
    );
  }

  if (source === 'spotify' || source === 'unknown') {
    throwApiError(
      ErrorCode.SOURCE_NOT_SUPPORTED,
      '目前不支持这个来源。已支持：Apple Podcasts、直接粘贴文本。',
      { supported: ['apple', 'text'] },
      400
    );
  }

  if (source === 'apple') {
    // Sprint 8: v2 schema 迁移后 apple/text 两个分支尚未适配。给友好错误引导用户走 /api/episodes/import-url
    throwApiError(
      'LEGACY_ENDPOINT',
      '此接口已被替换。请使用小宇宙 / Apple Podcasts 链接从首页粘贴。',
      null,
      400
    );
  }

  if (source === 'text') {
    throwApiError(
      'TEXT_MODE_UNAVAILABLE',
      '纯文本模式暂未开放。请从首页粘贴小宇宙或 Apple Podcasts 链接开始学习。',
      null,
      400
    );
  }

  // Fallback
  throwApiError(ErrorCode.SOURCE_NOT_SUPPORTED, '不支持的来源', null, 400);
});

async function handleAppleImport(req, res, next, url, userId) {
  try {
    const ids = parseAppleUrl(url);

    // Fetch metadata from Apple
    let meta;
    try {
      meta = await fetchAppleMetadata({ ...ids, sourceUrl: url });
    } catch (e) {
      if (e.code === 'INVALID_URL') {
        throwApiError(ErrorCode.INVALID_URL, '无效的 Apple Podcasts 链接', null, 400);
      }
      throwApiError(ErrorCode.SOURCE_UNREACHABLE, '无法连接 Apple Podcasts，请稍后再试', { reason: e.message }, 502);
    }

    // Detect language from episode description
    const language = detectLanguage(meta.description || '') || 'unknown';

    // Check DB availability
    if (!db) {
      // Dev mode without DB — return metadata without persisting
      return res.json({
        episode: toEpisodeObject({
          id: 0,
          source: 'apple',
          source_url: meta.sourceUrl,
          source_id: meta.sourceId,
          title: meta.title,
          channel: meta.channel,
          duration: meta.duration,
          language,
          cover_url: meta.coverUrl,
          audio_url: meta.audioUrl,
          published_at: meta.publishedAt,
          import_status: 'ready_meta_only',
        }),
      });
    }

    // Upsert episode — idempotent by (user_id, source, source_id)
    const [result] = await db.execute(
      `INSERT INTO episodes
        (user_id, source, source_url, source_id, title, channel, duration, language, cover_url, audio_url, published_at, import_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready_meta_only')
       ON DUPLICATE KEY UPDATE
         title = VALUES(title),
         channel = VALUES(channel),
         duration = VALUES(duration),
         language = VALUES(language),
         cover_url = VALUES(cover_url),
         audio_url = VALUES(audio_url),
         published_at = VALUES(published_at),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        'apple',
        meta.sourceUrl,
        meta.sourceId,
        meta.title,
        meta.channel,
        meta.duration || null,
        language,
        meta.coverUrl || null,
        meta.audioUrl || null,
        meta.publishedAt ? new Date(meta.publishedAt) : null,
      ]
    );

    const episodeId = result.insertId || (await getEpisodeBySourceId(userId, 'apple', meta.sourceId))?.id;

    const [rows] = await db.execute('SELECT * FROM episodes WHERE id = ?', [episodeId]);
    return res.json({ episode: toEpisodeObject(rows[0]) });
  } catch (err) {
    next(err);
  }
}

async function handleTextImport(req, res, next, text, userId) {
  try {
    const title = `文本 · ${text.slice(0, 30).trim()}…`;
    const duration = Math.round(text.length / 15); // rough estimate: 15 chars/sec
    const language = detectLanguage(text);

    if (!db) {
      return res.json({
        episode: toEpisodeObject({
          id: 0,
          source: 'text',
          source_url: null,
          source_id: null,
          title,
          channel: null,
          duration,
          language,
          cover_url: null,
          audio_url: null,
          published_at: null,
          import_status: 'ready',
        }),
      });
    }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [epResult] = await conn.execute(
        `INSERT INTO episodes
          (user_id, source, source_url, source_id, title, channel, duration, language, cover_url, audio_url, published_at, import_status)
         VALUES (?, 'text', NULL, NULL, ?, NULL, ?, ?, NULL, NULL, NULL, 'ready')`,
        [userId, title, duration, language]
      );
      const episodeId = epResult.insertId;

      await conn.execute(
        'INSERT INTO transcripts (episode_id, text, language) VALUES (?, ?, ?)',
        [episodeId, text, language]
      );

      await conn.commit();

      const [rows] = await conn.execute('SELECT * FROM episodes WHERE id = ?', [episodeId]);
      return res.json({ episode: toEpisodeObject(rows[0]) });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    next(err);
  }
}

async function getEpisodeBySourceId(userId, source, sourceId) {
  if (!db) return null;
  const [rows] = await db.execute(
    'SELECT * FROM episodes WHERE user_id = ? AND source = ? AND source_id = ?',
    [userId, source, sourceId]
  );
  return rows[0] || null;
}

/**
 * Map DB row → EpisodeObject (API contract)
 */
function toEpisodeObject(row) {
  return {
    id: row.id,
    source: row.source,
    sourceUrl: row.source_url || null,
    sourceId: row.source_id || null,
    title: row.title,
    channel: row.channel || null,
    duration: row.duration || null,
    language: row.language || 'unknown',
    coverUrl: row.cover_url || null,
    audioUrl: row.audio_url || null,
    publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
    importStatus: row.import_status,
  };
}

export default router;
