// pack.model.js — 学习包数据访问 (Phase 后端重构, 原 packStore 的 pack 域)
// 表: learning_packs + 11 张 pack_* 子表
// (podcast/episode → podcast.model; transcript → transcript.model; user_pack_access → learning.model)
import { db } from '../../shared/db.js';

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
 * 覆盖已有 pack 的内容 (Step 2 生成时用)
 *
 * 【关键设计: 保留 pack_card_id / pack_step_id / pack_action_id 稳定】
 * 原生 DELETE + INSERT 会重新分配 auto_increment id, 破坏 user_cards.pack_card_id / user_step_progress.pack_step_id / user_actions.pack_action_id 的引用,
 * 导致用户 star / review_state / 打勾 / commit 全部静默丢失 (PRD M5 "一周后仍能记得" 承诺被破坏)。
 * 修法: 按 (pack_id, position/step_number/timeframe+slot) 稳定业务键 UPSERT, id 保持不变。
 * 老 position/step_number 超出新数组范围时才 DELETE。
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

    // UPSERT 而非 DELETE+INSERT: 保留 pack_cards.id / pack_steps.id / pack_actions.id 稳定
    // 这样 user_cards.pack_card_id / user_step_progress.pack_step_id / user_actions.pack_action_id 仍然有效
    // (对于超出新数组范围的老行, 才 DELETE)
    await persistPackContent(conn, packId, packJson, { upsertMode: true });

    await conn.commit();
    return packId;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally { conn.release(); }
}

/**
 * 内部工具: 将 packJson 拆解并 INSERT/UPSERT 到 8 张子表
 * @param {object} conn - mysql2 连接 (已在事务内)
 * @param {number} packId
 * @param {object} packJson
 * @param {object} [opts]
 * @param {boolean} [opts.upsertMode=false] - true 时按 (pack_id, position) UPSERT 保持 id 稳定, false 时 DELETE + INSERT
 */
async function persistPackContent(conn, packId, packJson, opts = {}) {
  const upsertMode = !!opts.upsertMode;
  const p = packJson || {};
  const snapshot = p.snapshot || p;

  // 工具: audience label 可能是 string 或 object, 统一处理 (audit C5)
  const normalizeAudienceLabel = (a) => {
    if (typeof a === 'string') return a.slice(0, 80);
    if (a && typeof a === 'object') return String(a.label || a.name || a.tag || '').slice(0, 80);
    return String(a || '').slice(0, 80);
  };

  // ─── 1. pack_snapshots (1:1) —— 无条件 INSERT/UPDATE, 保证 1:1 契约 (audit B2) ───
  const vs = p.valueScore || snapshot.valueScore || {};
  const snapValues = [
    packId,
    (p.oneSentence || snapshot.oneSentence || '').toString().slice(0, 500),
    toInt(vs.density) ?? toInt(vs.valueDensity),
    toInt(vs.novelty) ?? toInt(vs.valueNovelty),
    toInt(vs.actionability) ?? toInt(vs.valueActionability),
    toInt(p.estimatedCostMinutes || snapshot.estimatedCostMinutes),
  ];
  if (upsertMode) {
    await conn.execute(
      `INSERT INTO pack_snapshots (pack_id, one_sentence, value_density, value_novelty, value_actionability, estimated_cost_minutes)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         one_sentence = VALUES(one_sentence),
         value_density = VALUES(value_density),
         value_novelty = VALUES(value_novelty),
         value_actionability = VALUES(value_actionability),
         estimated_cost_minutes = VALUES(estimated_cost_minutes),
         updated_at = CURRENT_TIMESTAMP`,
      snapValues
    );
  } else {
    await conn.execute(
      `INSERT INTO pack_snapshots (pack_id, one_sentence, value_density, value_novelty, value_actionability, estimated_cost_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      snapValues
    );
  }

  // ─── 2. pack_audience (1:N) ───
  const audience = p.audience || snapshot.audience || [];
  if (upsertMode) {
    // 老行 DELETE (audience 无用户桥接引用, 可安全 delete+insert)
    await conn.execute('DELETE FROM pack_audience WHERE pack_id = ?', [packId]);
  }
  if (Array.isArray(audience) && audience.length) {
    const values = audience.slice(0, 20).map((a, idx) => [packId, idx, normalizeAudienceLabel(a)]);
    await conn.query(`INSERT INTO pack_audience (pack_id, position, audience_label) VALUES ?`, [values]);
  }

  // ─── 3. pack_core_points (1:N) —— 有 user_core_point_overrides 引用, 需 UPSERT 保 id ───
  const corePoints = p.corePoints || snapshot.corePoints || [];
  await upsertPositionalRows(conn, {
    table: 'pack_core_points',
    packId,
    rows: (Array.isArray(corePoints) ? corePoints : []).slice(0, 10).map((cp, idx) => {
      const point = typeof cp === 'string' ? cp : (cp.point || '');
      const ts = typeof cp === 'object' ? toDecimal(cp.timestamp) : null;
      return { position: idx, values: { point, timestamp_sec: ts, segment_id: null } };
    }),
    upsertMode,
  });

  // ─── 4. pack_worth_ranges (1:N) —— 无用户引用, DELETE+INSERT ok ───
  const worth = p.worthListening || snapshot.worthListening || [];
  if (upsertMode) await conn.execute('DELETE FROM pack_worth_ranges WHERE pack_id = ?', [packId]);
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

  // ─── 5. pack_skippable_ranges (1:N) —— 无用户引用 ───
  const skip = p.skippable || snapshot.skippable || [];
  if (upsertMode) await conn.execute('DELETE FROM pack_skippable_ranges WHERE pack_id = ?', [packId]);
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

  // ─── 6. pack_steps (1:N) —— 有 user_step_progress 引用, 需 UPSERT 保 id ───
  const steps = p.steps || [];
  if (upsertMode) {
    // 先删超出新范围的老 step 及其 citations
    const newStepCount = Math.min(steps.length || 0, 20);
    await conn.execute(
      `DELETE FROM pack_step_citations WHERE step_id IN (SELECT id FROM pack_steps WHERE pack_id = ? AND step_number > ?)`,
      [packId, newStepCount]
    );
    await conn.execute('DELETE FROM pack_steps WHERE pack_id = ? AND step_number > ?', [packId, newStepCount]);
  }
  if (Array.isArray(steps) && steps.length) {
    for (let i = 0; i < Math.min(steps.length, 20); i++) {
      const s = steps[i];
      const stepNum = s.stepNumber ?? (i + 1);
      const title = String(s.title || '').slice(0, 200);
      const content = String(s.content || '');
      let stepId;
      if (upsertMode) {
        // UPSERT: 存在则更新, id 保持稳定
        await conn.execute(
          `INSERT INTO pack_steps (pack_id, step_number, title, content) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content)`,
          [packId, stepNum, title, content]
        );
        const [[row]] = await conn.execute(
          `SELECT id FROM pack_steps WHERE pack_id = ? AND step_number = ?`,
          [packId, stepNum]
        );
        stepId = row.id;
        // step_citations 无用户引用, 可安全 DELETE+INSERT
        await conn.execute('DELETE FROM pack_step_citations WHERE step_id = ?', [stepId]);
      } else {
        const [sResult] = await conn.execute(
          `INSERT INTO pack_steps (pack_id, step_number, title, content) VALUES (?, ?, ?, ?)`,
          [packId, stepNum, title, content]
        );
        stepId = sResult.insertId;
      }
      const citations = s.citations || [];
      if (Array.isArray(citations) && citations.length) {
        // segment_id 现在允许 NULL, 无绑定的 citation 存 null
        const cValues = citations
          .slice(0, 10)
          .map((c, idx) => [stepId, c.segmentId || null, idx])
          .filter(v => v[1] !== null || v[2] === 0);   // 至少保留有 segmentId 或 position 0
        if (cValues.length) {
          await conn.query(
            `INSERT INTO pack_step_citations (step_id, segment_id, position) VALUES ?`,
            [cValues]
          );
        }
      }
    }
  }

  // ─── 7. pack_cards (1:N) —— ⭐ 有 user_cards 引用, 必须 UPSERT 保 id 稳定 (Blocker B1) ───
  const cards = p.cards || [];
  await upsertPositionalRows(conn, {
    table: 'pack_cards',
    packId,
    rows: (Array.isArray(cards) ? cards : []).slice(0, 30).map((c, idx) => ({
      position: idx,
      values: {
        quote: safeUtf8Slice(c.quote, 16 * 1024 * 1024 - 100),   // MEDIUMTEXT 上限 16MB, 保守留 100 字节
        context: safeUtf8Slice(c.context, 16 * 1024 * 1024 - 100),
        insight: safeUtf8Slice(c.insight, 16 * 1024 * 1024 - 100),
        timestamp_sec: toDecimal(c.timestamp ?? c.sourceTimestamp),
        segment_id: null,
      }
    })),
    upsertMode,
  });

  // ─── 8. pack_concepts (1:N) —— 有 user_concept_overrides 引用 ───
  const concepts = p.concepts || [];
  await upsertPositionalRows(conn, {
    table: 'pack_concepts',
    packId,
    rows: (Array.isArray(concepts) ? concepts : []).slice(0, 30).map((c, idx) => ({
      position: idx,
      values: {
        term: String(c.term || '').slice(0, 200),
        simple_explanation: safeUtf8Slice(c.simpleExplanation || c.simple, 16 * 1024 * 1024 - 100),
        contextual_explanation: safeUtf8Slice(c.contextualExplanation || c.contextual, 16 * 1024 * 1024 - 100),
        extended_explanation: safeUtf8Slice(c.extendedExplanation || c.extended, 16 * 1024 * 1024 - 100),
        first_mention_sec: toDecimal(c.firstMentionTimestamp ?? c.firstMention),
        segment_id: null,
      }
    })),
    upsertMode,
  });

  // ─── 9. pack_actions (1:N) —— 有 user_actions.pack_action_id 引用, 必须 UPSERT (Blocker B1) ───
  const actions = p.actions || {};
  const flatActions = [];
  if (Array.isArray(actions)) {
    actions.slice(0, 20).forEach((a, idx) => {
      flatActions.push({
        timeframe: a.timeframe || 'today',
        slotIndex: a.slotIndex ?? idx,
        actionText: String(a.actionText || a.text || '').slice(0, 500),
      });
    });
  } else if (typeof actions === 'object' && actions !== null) {
    ['today', 'week', 'longterm'].forEach(tf => {
      const v = actions[tf];
      if (v == null) return;
      const arr = Array.isArray(v) ? v : [v];
      arr.slice(0, 10).forEach((text, idx) => {
        if (text) flatActions.push({ timeframe: tf, slotIndex: idx, actionText: String(text).slice(0, 500) });
      });
    });
  }

  if (upsertMode) {
    // 删除超出新范围的老 action 行
    const keeps = flatActions.map(a => `('${a.timeframe}',${a.slotIndex})`).join(',');
    if (keeps) {
      await conn.query(
        `DELETE FROM pack_actions WHERE pack_id = ? AND (timeframe, slot_index) NOT IN (${keeps})`,
        [packId]
      );
    } else {
      await conn.execute('DELETE FROM pack_actions WHERE pack_id = ?', [packId]);
    }
    // UPSERT 每条
    for (const a of flatActions) {
      await conn.execute(
        `INSERT INTO pack_actions (pack_id, timeframe, slot_index, action_text) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE action_text = VALUES(action_text)`,
        [packId, a.timeframe, a.slotIndex, a.actionText]
      );
    }
  } else {
    if (flatActions.length) {
      const values = flatActions.map(a => [packId, a.timeframe, a.slotIndex, a.actionText]);
      await conn.query(`INSERT INTO pack_actions (pack_id, timeframe, slot_index, action_text) VALUES ?`, [values]);
    }
  }

  // ─── 10. shrink 后清理孤儿 user 桥接行 (Risk review) ───
  // upsertMode 下, 内容缩短会 DELETE 掉超范围的 pack_cards/pack_steps/pack_actions 行。
  // 无 FK cascade, 对应的 user_* 桥接行会悬挂。读路径都是 content-first LEFT JOIN,
  // 悬挂行不会崩但会累积为死数据 + 轻微污染 library.js cards_count。这里主动清理。
  // 注: user_cards/user_step_progress/user_actions 都有冗余 pack_id 列, 可精确 scope 到本 pack。
  // override 表无 pack_id 列 (仅引用 content row id), 内容行删掉后无法反查 pack, 留给全局周期性清扫,
  //     且 override 读路径同为 content-first, 悬挂同样无害。
  if (upsertMode) {
    await conn.execute(
      `DELETE uc FROM user_cards uc
         LEFT JOIN pack_cards pc ON uc.pack_card_id = pc.id
        WHERE uc.pack_id = ? AND pc.id IS NULL`,
      [packId]
    );
    await conn.execute(
      `DELETE usp FROM user_step_progress usp
         LEFT JOIN pack_steps ps ON usp.pack_step_id = ps.id
        WHERE usp.pack_id = ? AND ps.id IS NULL`,
      [packId]
    );
    // user_actions.pack_action_id 可为 NULL (无绑定的自定义 action), 只清有绑定但已失效的
    await conn.execute(
      `DELETE ua FROM user_actions ua
         LEFT JOIN pack_actions pa ON ua.pack_action_id = pa.id
        WHERE ua.pack_id = ? AND ua.pack_action_id IS NOT NULL AND pa.id IS NULL`,
      [packId]
    );
  }
}

/**
 * 工具: 按 (pack_id, position) UPSERT 一批行, 保证已有 id 稳定
 * (Blocker B1: pack_cards / pack_concepts / pack_core_points 都用这个, 因为它们有用户桥接引用)
 */
async function upsertPositionalRows(conn, { table, packId, rows, upsertMode }) {
  if (upsertMode) {
    // 删除超出新范围的老行 (position >= rows.length)
    if (rows.length) {
      await conn.execute(
        `DELETE FROM ${table} WHERE pack_id = ? AND position >= ?`,
        [packId, rows.length]
      );
    } else {
      await conn.execute(`DELETE FROM ${table} WHERE pack_id = ?`, [packId]);
    }
    // UPSERT 每行
    for (const r of rows) {
      const cols = Object.keys(r.values);
      const placeholders = cols.map(() => '?').join(', ');
      const updates = cols.map(c => `${c} = VALUES(${c})`).join(', ');
      const vals = cols.map(c => r.values[c]);
      await conn.execute(
        `INSERT INTO ${table} (pack_id, position, ${cols.join(', ')}) VALUES (?, ?, ${placeholders})
         ON DUPLICATE KEY UPDATE ${updates}`,
        [packId, r.position, ...vals]
      );
    }
  } else {
    // insertPack 场景: 首次插入, 简单批量 INSERT
    if (!rows.length) return;
    const cols = Object.keys(rows[0].values);
    const values = rows.map(r => [packId, r.position, ...cols.map(c => r.values[c])]);
    await conn.query(
      `INSERT INTO ${table} (pack_id, position, ${cols.join(', ')}) VALUES ?`,
      [values]
    );
  }
}

/**
 * 按字节数安全截断 UTF-8 字符串 (audit C2)
 * MySQL TEXT/MEDIUMTEXT 上限是 bytes 不是 chars
 */
function safeUtf8Slice(s, maxBytes) {
  if (s == null) return '';
  const str = String(s);
  const buf = Buffer.from(str, 'utf-8');
  if (buf.length <= maxBytes) return str;
  // 截断到 maxBytes, 但避免切在 UTF-8 多字节中间
  let cut = maxBytes;
  while (cut > 0 && (buf[cut] & 0xc0) === 0x80) cut--;
  return buf.subarray(0, cut).toString('utf-8');
}

/**
 * 从 8 张子表组装 pack 对象 (回传给 API 客户端，保持 pack.oneSentence / pack.cards[] 等契约)
 * audit C3: 并行 SELECT (原串行 8× RTT → 1× RTT)
 */
async function assemblePackContent(packId) {
  const [
    [snap], [aud], [cp], [worth], [skip], [steps], [cards], [concepts], [actions]
  ] = await Promise.all([
    db.execute(`SELECT * FROM pack_snapshots WHERE pack_id = ? LIMIT 1`, [packId]),
    db.execute(`SELECT audience_label FROM pack_audience WHERE pack_id = ? ORDER BY position`, [packId]),
    db.execute(`SELECT point, timestamp_sec FROM pack_core_points WHERE pack_id = ? ORDER BY position`, [packId]),
    db.execute(`SELECT start_sec, end_sec, reason FROM pack_worth_ranges WHERE pack_id = ? ORDER BY position`, [packId]),
    db.execute(`SELECT start_sec, end_sec, reason FROM pack_skippable_ranges WHERE pack_id = ? ORDER BY position`, [packId]),
    db.execute(`SELECT id, step_number, title, content FROM pack_steps WHERE pack_id = ? ORDER BY step_number`, [packId]),
    db.execute(`SELECT id, position, quote, context, insight, timestamp_sec FROM pack_cards WHERE pack_id = ? ORDER BY position`, [packId]),
    db.execute(`SELECT id, position, term, simple_explanation, contextual_explanation, extended_explanation, first_mention_sec FROM pack_concepts WHERE pack_id = ? ORDER BY position`, [packId]),
    db.execute(`SELECT id, timeframe, slot_index, action_text FROM pack_actions WHERE pack_id = ? ORDER BY FIELD(timeframe,'today','week','longterm'), slot_index`, [packId]),
  ]);

  const s = snap[0] || {};
  const audienceList = aud.map(a => a.audience_label);
  const corePointsList = cp.map(x => ({ point: x.point, timestamp: x.timestamp_sec != null ? Number(x.timestamp_sec) : null }));
  const worthList = worth.map(w => ({
    start: Number(w.start_sec),
    end: Number(w.end_sec),
    startSec: Number(w.start_sec),
    endSec: Number(w.end_sec),
    reason: w.reason,
  }));
  const skipList = skip.map(k => ({
    start: Number(k.start_sec),
    end: Number(k.end_sec),
    startSec: Number(k.start_sec),
    endSec: Number(k.end_sec),
    reason: k.reason,
  }));
  const valueScore = {
    density: s.value_density,
    novelty: s.value_novelty,
    actionability: s.value_actionability,
  };
  const estimatedCostMinutes = s.estimated_cost_minutes;
  const oneSentence = s.one_sentence || '';

  const pack = {
    // Flat 字段 (Phase 1.5 新契约)
    oneSentence,
    valueScore,
    estimatedCostMinutes,
    audience: audienceList,
    corePoints: corePointsList,
    worthListening: worthList,
    skippable: skipList,
    // Nested snapshot (v2 legacy 契约兼容, audit B3/C6)
    snapshot: {
      oneSentence,
      valueScore,
      estimatedCostMinutes,
      audience: audienceList,
      corePoints: corePointsList,
      worthListening: worthList,
      skippable: skipList,
    },
    steps: steps.map(st => ({
      id: st.id,
      stepNumber: st.step_number,
      stepIndex: st.step_number - 1,   // 前端 stepIndex 语义
      title: st.title,
      content: st.content,
    })),
    cards: cards.map(c => ({
      id: c.id,
      cardIndex: c.position,
      quote: c.quote,
      context: c.context,
      insight: c.insight,
      timestamp: c.timestamp_sec != null ? Number(c.timestamp_sec) : null,
      sourceTimestamp: c.timestamp_sec != null ? Number(c.timestamp_sec) : null,
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
      firstMention: c.first_mention_sec != null ? Number(c.first_mention_sec) : null,
    })),
    actions: actions.reduce((acc, a) => {
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
