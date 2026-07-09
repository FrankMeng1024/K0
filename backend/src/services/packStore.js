// K0 backend - Episode/Transcript/Pack DB store (Schema v3)
// Refactor Phase 1.5: 拆表版
// 集中数据库读写逻辑，其他 service 通过此模块访问 DB
//
// 【核心变化】(vs v2)
// 1. transcripts.segments 拆到 transcript_segments 表 (逐段 INSERT)
// 2. learning_packs.pack_json 拆到 8 张子表 (persistPackContent 事务)
// 3. episodes.audio_* 拆到 episode_audio_sources 表
// 4. getPackById() 组装多表返回 { pack: {...composed} } (保持 API contract)

import { db } from '../config/db.js';

// ============================================================
// PODCASTS
// ============================================================
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

// ============================================================
// EPISODES + EPISODE_AUDIO_SOURCES (Phase 1.5: 音频源拆表)
// ============================================================
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
      // 先取消其他 primary，再 upsert 当前
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
  // 附加当前 primary audio source
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

// ============================================================
// TRANSCRIPTS + TRANSCRIPT_SEGMENTS (Phase 1.5: segments 拆表)
// ============================================================
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
    const CHUNK = 500;
    for (let i = 0; i < segments.length; i += CHUNK) {
      const chunk = segments.slice(i, i + CHUNK);
      const values = chunk.map((s, idx) => [
        transcriptId, i + idx,
        Number(s.start || 0).toFixed(3),
        Number(s.end || 0).toFixed(3),
        String(s.text || '')
      ]);
      await conn.query(
        `INSERT INTO transcript_segments (transcript_id, position, start_sec, end_sec, text) VALUES ?`,
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

  // 从 transcript_segments 表读段落
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

// ============================================================
// LEARNING PACKS + 8 子表 (Phase 1.5 核心)
// ============================================================

// 找已生成的 pack (元信息 + 组装后的 pack 对象)
export async function findExistingPack(transcriptId, goal, glmModel, promptVersion) {
  const [rows] = await db.execute(
    `SELECT id, created_at FROM learning_packs
     WHERE transcript_id = ? AND goal = ? AND glm_model = ? AND prompt_version = ? AND status = 'ready' LIMIT 1`,
    [transcriptId, goal, glmModel, promptVersion]
  );
  if (!rows.length) return null;
  const packId = rows[0].id;
  const pack = await assemblePackContent(packId);
  return { id: packId, pack, createdAt: rows[0].created_at };
}

// Sprint 14 R1 #19: 基于 transcript_id 找最新 snapshot pack
export async function findLatestSnapshotPack(transcriptId) {
  const [rows] = await db.execute(
    `SELECT id, goal, created_at FROM learning_packs
     WHERE transcript_id = ? AND status = 'ready'
     ORDER BY created_at DESC LIMIT 1`,
    [transcriptId]
  );
  if (!rows.length) return null;
  const pack = await assemblePackContent(rows[0].id);
  return { id: rows[0].id, goal: rows[0].goal, pack, createdAt: rows[0].created_at };
}

/**
 * 事务化插入 pack (元信息 + 8 张子表)
 * @param {object} params - 与旧 insertPack 同签名，但 packJson 现在被拆解
 * @returns {number} 新建 pack.id
 */
export async function insertPack({ transcriptId, goal, glmModel, promptVersion, generationStrategy, language, mode, packJson, generationMs, inputTokens, outputTokens, extra }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. INSERT learning_packs 元信息
    const [pkResult] = await conn.execute(
      `INSERT INTO learning_packs (transcript_id, goal, glm_model, prompt_version, generation_strategy, language, mode, status, generation_ms, input_tokens, output_tokens, extra)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?)`,
      [transcriptId, goal, glmModel, promptVersion, generationStrategy || 'plan-b', language || null, mode || null,
       generationMs || null, inputTokens || null, outputTokens || null,
       extra ? JSON.stringify(extra) : null]
    );
    const packId = pkResult.insertId;

    // 2. 拆解 packJson 到子表
    await persistPackContent(conn, packId, packJson);

    await conn.commit();
    return packId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
}

/**
 * 覆盖已有 pack 的内容 (Step 2 生成时用: pack 已有 snapshot,现在加 steps/cards/concepts/actions)
 * 先删所有子表数据,再重新 INSERT (保证事务原子)
 */
export async function updatePackContent(packId, packJson, { mode, generationMs, inputTokens, outputTokens } = {}) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Update learning_packs 元信息
    const patchFields = [];
    const patchVals = [];
    if (mode !== undefined) { patchFields.push('mode = ?'); patchVals.push(mode); }
    if (generationMs !== undefined) { patchFields.push('generation_ms = ?'); patchVals.push(generationMs); }
    if (inputTokens !== undefined) { patchFields.push('input_tokens = COALESCE(input_tokens, 0) + ?'); patchVals.push(inputTokens); }
    if (outputTokens !== undefined) { patchFields.push('output_tokens = COALESCE(output_tokens, 0) + ?'); patchVals.push(outputTokens); }
    if (patchFields.length) {
      await conn.execute(
        `UPDATE learning_packs SET ${patchFields.join(', ')}, updated_at = NOW() WHERE id = ?`,
        [...patchVals, packId]
      );
    }

    // 清空所有子表 (下面重新填充)
    await conn.execute('DELETE FROM pack_audience WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_core_points WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_worth_ranges WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_skippable_ranges WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_step_citations WHERE step_id IN (SELECT id FROM pack_steps WHERE pack_id = ?)', [packId]);
    await conn.execute('DELETE FROM pack_steps WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_cards WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_concepts WHERE pack_id = ?', [packId]);
    await conn.execute('DELETE FROM pack_actions WHERE pack_id = ?', [packId]);
    // snapshot 是 1:1 用 REPLACE 更方便
    await conn.execute('DELETE FROM pack_snapshots WHERE pack_id = ?', [packId]);

    await persistPackContent(conn, packId, packJson);

    await conn.commit();
    return packId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
}

/**
 * 内部工具: 将 packJson 拆解并 INSERT 到 8 张子表
 * 假设已在 transaction 内被调用
 */
async function persistPackContent(conn, packId, packJson) {
  const p = packJson || {};
  const snapshot = p.snapshot || p;   // 兼容 v2 老结构: snapshot 可能嵌套或直接在顶层

  // 1. pack_snapshots (1:1)
  if (p.oneSentence || snapshot.oneSentence || p.valueScore || snapshot.valueScore) {
    const vs = p.valueScore || snapshot.valueScore || {};
    await conn.execute(
      `INSERT INTO pack_snapshots (pack_id, one_sentence, value_density, value_novelty, value_actionability, estimated_cost_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [packId,
       p.oneSentence || snapshot.oneSentence || '',
       toInt(vs.density) ?? toInt(vs.valueDensity),
       toInt(vs.novelty) ?? toInt(vs.valueNovelty),
       toInt(vs.actionability) ?? toInt(vs.valueActionability),
       toInt(p.estimatedCostMinutes || snapshot.estimatedCostMinutes)]
    );
  }

  // 2. pack_audience (1:N)
  const audience = p.audience || snapshot.audience || [];
  if (Array.isArray(audience) && audience.length) {
    const values = audience.slice(0, 20).map((label, idx) => [packId, idx, String(label).slice(0, 80)]);
    await conn.query(`INSERT INTO pack_audience (pack_id, position, audience_label) VALUES ?`, [values]);
  }

  // 3. pack_core_points (1:N)
  const corePoints = p.corePoints || snapshot.corePoints || [];
  if (Array.isArray(corePoints) && corePoints.length) {
    const values = corePoints.slice(0, 10).map((cp, idx) => {
      const point = typeof cp === 'string' ? cp : (cp.point || '');
      const ts = typeof cp === 'object' ? toDecimal(cp.timestamp) : null;
      return [packId, idx, point, ts, null];
    });
    await conn.query(
      `INSERT INTO pack_core_points (pack_id, position, point, timestamp_sec, segment_id) VALUES ?`,
      [values]
    );
  }

  // 4. pack_worth_ranges (1:N)
  const worth = p.worthListening || snapshot.worthListening || [];
  if (Array.isArray(worth) && worth.length) {
    const values = worth.slice(0, 20).map((w, idx) => [
      packId, idx,
      toDecimal(w.start ?? w.startSec) ?? 0,
      toDecimal(w.end ?? w.endSec) ?? 0,
      String(w.reason || '').slice(0, 500)
    ]);
    await conn.query(
      `INSERT INTO pack_worth_ranges (pack_id, position, start_sec, end_sec, reason) VALUES ?`,
      [values]
    );
  }

  // 5. pack_skippable_ranges (1:N)
  const skip = p.skippable || snapshot.skippable || [];
  if (Array.isArray(skip) && skip.length) {
    const values = skip.slice(0, 20).map((s, idx) => [
      packId, idx,
      toDecimal(s.start ?? s.startSec) ?? 0,
      toDecimal(s.end ?? s.endSec) ?? 0,
      String(s.reason || '').slice(0, 500)
    ]);
    await conn.query(
      `INSERT INTO pack_skippable_ranges (pack_id, position, start_sec, end_sec, reason) VALUES ?`,
      [values]
    );
  }

  // 6. pack_steps (1:N) + citations
  const steps = p.steps || [];
  if (Array.isArray(steps) && steps.length) {
    for (let i = 0; i < Math.min(steps.length, 20); i++) {
      const s = steps[i];
      const [sResult] = await conn.execute(
        `INSERT INTO pack_steps (pack_id, step_number, title, content) VALUES (?, ?, ?, ?)`,
        [packId, s.stepNumber ?? (i + 1), String(s.title || '').slice(0, 200), String(s.content || '')]
      );
      const stepId = sResult.insertId;
      const citations = s.citations || [];
      if (Array.isArray(citations) && citations.length) {
        // citations 里可能是 segment_id 或 timestamp。当前只存 position + 空 segment_id (未来加 FK 绑定)
        const cValues = citations.slice(0, 10).map((c, idx) => [stepId, c.segmentId || 0, idx]);
        if (cValues.length) {
          await conn.query(
            `INSERT INTO pack_step_citations (step_id, segment_id, position) VALUES ?`,
            [cValues]
          );
        }
      }
    }
  }

  // 7. pack_cards (1:N)
  const cards = p.cards || [];
  if (Array.isArray(cards) && cards.length) {
    const values = cards.slice(0, 30).map((c, idx) => [
      packId, idx,
      String(c.quote || '').slice(0, 65535),
      String(c.context || '').slice(0, 65535),
      String(c.insight || '').slice(0, 65535),
      toDecimal(c.timestamp ?? c.sourceTimestamp),
      null   // segment_id (未来关联)
    ]);
    await conn.query(
      `INSERT INTO pack_cards (pack_id, position, quote, context, insight, timestamp_sec, segment_id) VALUES ?`,
      [values]
    );
  }

  // 8. pack_concepts (1:N)
  const concepts = p.concepts || [];
  if (Array.isArray(concepts) && concepts.length) {
    const values = concepts.slice(0, 30).map((c, idx) => [
      packId, idx,
      String(c.term || '').slice(0, 200),
      String(c.simpleExplanation || c.simple || '').slice(0, 65535),
      String(c.contextualExplanation || c.contextual || '').slice(0, 65535),
      String(c.extendedExplanation || c.extended || '').slice(0, 65535),
      toDecimal(c.firstMentionTimestamp ?? c.firstMention),
      null
    ]);
    await conn.query(
      `INSERT INTO pack_concepts (pack_id, position, term, simple_explanation, contextual_explanation, extended_explanation, first_mention_sec, segment_id) VALUES ?`,
      [values]
    );
  }

  // 9. pack_actions (1:N)
  // actions 可能是 { today, week, longterm } 或 数组
  const actions = p.actions || {};
  const flatActions = [];
  if (Array.isArray(actions)) {
    actions.forEach((a, idx) => {
      flatActions.push([packId, a.timeframe || 'today', a.slotIndex ?? idx, String(a.actionText || a.text || '').slice(0, 500)]);
    });
  } else if (typeof actions === 'object' && actions !== null) {
    ['today', 'week', 'longterm'].forEach(tf => {
      const v = actions[tf];
      if (v == null) return;
      const arr = Array.isArray(v) ? v : [v];
      arr.forEach((text, idx) => {
        if (text) flatActions.push([packId, tf, idx, String(text).slice(0, 500)]);
      });
    });
  }
  if (flatActions.length) {
    await conn.query(
      `INSERT INTO pack_actions (pack_id, timeframe, slot_index, action_text) VALUES ?`,
      [flatActions]
    );
  }
}

/**
 * 从 8 张子表组装 pack 对象 (回传给 API 客户端，保持 pack.oneSentence / pack.cards[] 等契约)
 */
async function assemblePackContent(packId) {
  const [snap] = await db.execute(`SELECT * FROM pack_snapshots WHERE pack_id = ? LIMIT 1`, [packId]);
  const [aud] = await db.execute(`SELECT audience_label FROM pack_audience WHERE pack_id = ? ORDER BY position`, [packId]);
  const [cp] = await db.execute(`SELECT point, timestamp_sec FROM pack_core_points WHERE pack_id = ? ORDER BY position`, [packId]);
  const [worth] = await db.execute(`SELECT start_sec, end_sec, reason FROM pack_worth_ranges WHERE pack_id = ? ORDER BY position`, [packId]);
  const [skip] = await db.execute(`SELECT start_sec, end_sec, reason FROM pack_skippable_ranges WHERE pack_id = ? ORDER BY position`, [packId]);
  const [steps] = await db.execute(`SELECT id, step_number, title, content FROM pack_steps WHERE pack_id = ? ORDER BY step_number`, [packId]);
  const [cards] = await db.execute(`SELECT id, position, quote, context, insight, timestamp_sec FROM pack_cards WHERE pack_id = ? ORDER BY position`, [packId]);
  const [concepts] = await db.execute(`SELECT id, position, term, simple_explanation, contextual_explanation, extended_explanation, first_mention_sec FROM pack_concepts WHERE pack_id = ? ORDER BY position`, [packId]);
  const [actions] = await db.execute(`SELECT id, timeframe, slot_index, action_text FROM pack_actions WHERE pack_id = ? ORDER BY FIELD(timeframe,'today','week','longterm'), slot_index`, [packId]);

  const s = snap[0] || {};
  const pack = {
    oneSentence: s.one_sentence || '',
    valueScore: {
      density: s.value_density,
      novelty: s.value_novelty,
      actionability: s.value_actionability,
    },
    estimatedCostMinutes: s.estimated_cost_minutes,
    audience: aud.map(a => a.audience_label),
    corePoints: cp.map(x => ({ point: x.point, timestamp: Number(x.timestamp_sec) })),
    worthListening: worth.map(w => ({ start: Number(w.start_sec), end: Number(w.end_sec), reason: w.reason })),
    skippable: skip.map(k => ({ start: Number(k.start_sec), end: Number(k.end_sec), reason: k.reason })),
    steps: steps.map(st => ({ id: st.id, stepNumber: st.step_number, title: st.title, content: st.content })),
    cards: cards.map(c => ({
      id: c.id,
      cardIndex: c.position,   // 保持 API contract
      quote: c.quote,
      context: c.context,
      insight: c.insight,
      timestamp: Number(c.timestamp_sec),
      sourceTimestamp: Number(c.timestamp_sec),   // legacy alias
    })),
    concepts: concepts.map(c => ({
      id: c.id,
      term: c.term,
      simple: c.simple_explanation,
      simpleExplanation: c.simple_explanation,
      contextual: c.contextual_explanation,
      contextualExplanation: c.contextual_explanation,
      extended: c.extended_explanation,
      extendedExplanation: c.extended_explanation,
      firstMention: c.first_mention_sec ? Number(c.first_mention_sec) : null,
    })),
    actions: actions.reduce((acc, a) => {
      // 前端契约: actions.today / actions.week / actions.longterm 是数组
      if (!acc[a.timeframe]) acc[a.timeframe] = [];
      acc[a.timeframe].push(a.action_text);
      return acc;
    }, {}),
  };
  return pack;
}

// ============================================================
// GET pack (元信息 + 组装内容)
// ============================================================
export async function getPackById(id) {
  const [rows] = await db.execute(
    'SELECT id, transcript_id, goal, glm_model, prompt_version, language, mode, created_at FROM learning_packs WHERE id = ? LIMIT 1',
    [id]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const pack = await assemblePackContent(r.id);
  return {
    id: r.id,
    transcriptId: r.transcript_id,
    goal: r.goal,
    glmModel: r.glm_model,
    promptVersion: r.prompt_version,
    language: r.language,
    mode: r.mode,
    pack,
    createdAt: r.created_at,
  };
}

// ============================================================
// USER PACK ACCESS (桥接表)
// ============================================================
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

// ============================================================
// Utilities
// ============================================================
function toInt(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toDecimal(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(3) : null;
}
