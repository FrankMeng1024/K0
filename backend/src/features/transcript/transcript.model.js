// transcript.model.js — 转录 + 段落 数据访问 (Phase 后端重构, 原 packStore 拆出)
// 表: transcripts / transcript_segments
import { db } from '../../shared/db.js';

export async function upsertTranscript({ episodeId, provider, providerVersion, segments, durationSeconds, language, transcriptMs, extra }) {
  const totalChars = segments.reduce((sum, s) => sum + (s.text?.length || 0), 0);
  const segmentCount = segments.length;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute(
      'SELECT id FROM transcripts WHERE episode_id = ? AND provider = ? LIMIT 1',
      [episodeId, provider]
    );
    if (existing.length) {
      await conn.commit();
      return existing[0].id;   // 已有 transcript 不覆盖
    }

    const [result] = await conn.execute(
      `INSERT INTO transcripts (episode_id, provider, provider_version, segment_count, total_chars, duration_seconds, language, transcript_ms, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [episodeId, provider, providerVersion || null, segmentCount, totalChars,
       durationSeconds || null, language || null, transcriptMs || null,
       extra ? JSON.stringify(extra) : null]
    );
    const transcriptId = result.insertId;

    // 批量 INSERT segments (chunked, 每 500 段一批避免 packet 太大)
    // Sprint16 R55e: 存字级时间戳 words_json (BCUT ASR 返回, 供前端词级高亮)。
    //   压缩键名省空间: [{l:字, s:起秒, e:止秒}]。旧数据/无 words → NULL, 前端 fallback 段落级高亮。
    const CHUNK = 500;
    for (let i = 0; i < segments.length; i += CHUNK) {
      const chunk = segments.slice(i, i + CHUNK);
      const values = chunk.map((s, idx) => [
        transcriptId, i + idx,
        Number(s.start || 0).toFixed(3),
        Number(s.end || 0).toFixed(3),
        String(s.text || ''),
        Array.isArray(s.words) && s.words.length
          ? JSON.stringify(s.words.map(w => ({ l: w.label || '', s: +Number(w.start || 0).toFixed(2), e: +Number(w.end || 0).toFixed(2) })))
          : null,
      ]);
      await conn.query(
        `INSERT INTO transcript_segments (transcript_id, position, start_sec, end_sec, text, words_json) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    return transcriptId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
}

export async function getTranscriptByEpisodeAndProvider(episodeId, provider) {
  const [rows] = await db.execute(
    'SELECT * FROM transcripts WHERE episode_id = ? AND provider = ? AND status = "ready" LIMIT 1',
    [episodeId, provider]
  );
  if (!rows.length) return null;
  const r = rows[0];

  const [segRows] = await db.execute(
    'SELECT position, start_sec, end_sec, text FROM transcript_segments WHERE transcript_id = ? ORDER BY position',
    [r.id]
  );
  const segments = segRows.map(s => ({
    start: Number(s.start_sec),
    end: Number(s.end_sec),
    text: s.text
  }));

  return {
    id: r.id,
    episodeId: r.episode_id,
    provider: r.provider,
    segments,
    segmentCount: r.segment_count,
    totalChars: r.total_chars,
    durationSeconds: r.duration_seconds,
    language: r.language,
    createdAt: r.created_at,
  };
}

// R25 Bug#0: 按 transcript_id 拉 segments, 供 Step2 校验卡片 quote 是否逐字原文 + 锚定真实 timestamp
export async function getSegmentsByTranscriptId(transcriptId) {
  if (!transcriptId) return [];
  const [rows] = await db.execute(
    'SELECT id, start_sec, end_sec, text FROM transcript_segments WHERE transcript_id = ? ORDER BY position',
    [transcriptId]
  );
  return rows.map(s => ({ id: s.id, start: Number(s.start_sec), end: Number(s.end_sec), text: s.text }));
}
