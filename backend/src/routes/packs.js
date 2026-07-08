// Packs router — E-002/E-003/E-004
// GET /api/packs/:id
// PATCH /api/steps/:id
import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';
import { getOrCreateUserByAnonymousId } from '../services/userStore.js';

const router = Router();

// Sprint 14 R1 #18: 从 anonymousId 解析 userId（与 library/review 保持一致）
async function resolveUserId(req) {
  const anonymousId = req.query.anonymousId || req.body?.anonymousId;
  if (anonymousId && db) {
    try {
      const user = await getOrCreateUserByAnonymousId(anonymousId);
      if (user) return user.id;
    } catch {}
  }
  return req.user?.id || 1;
}

// ── In-memory store for no-DB mode ────────────────────────────────────────────
// Keyed by pack id (integer). Populated by the generate route.
// Exported so generate.js can insert into it.
export const mockPackStore = new Map();

/** Build a deterministic mock PackObject for dev/test */
export function buildMockPack(id, episodeId = 1, goal = 'deep_learn', language = 'zh') {
  const isZh = language === 'zh';
  return {
    id,
    episodeId,
    goal,
    language,
    snapshot: {
      oneSentence: isZh
        ? 'AI 产品的壁垒不在模型能力，而在场景闭环与数据飞轮。'
        : 'The moat for AI products is not model capability but closed-loop scenarios and data flywheels.',
      corePoints: [
        { point: isZh ? '技术平权正在发生，算法不再是壁垒' : 'Technology democratization is underway; algorithms are no longer a moat', timestamp: 312 },
        { point: isZh ? '场景定义产品，而非反过来' : 'Scenarios define products, not the reverse', timestamp: 845 },
        { point: isZh ? '数据飞轮是真正的护城河' : 'The data flywheel is the true competitive moat', timestamp: 1423 },
      ],
      audience: isZh ? ['产品经理', '创业者', '技术负责人'] : ['Product managers', 'Founders', 'Tech leads'],
      valueScore: { density: 8, novelty: 7, actionability: 6 },
      estimatedCostMinutes: 10,
      worthListening: [
        { start: 300, end: 420, reason: isZh ? '核心论点阐述' : 'Core argument explained' },
        { start: 840, end: 960, reason: isZh ? '场景案例深挖' : 'Deep-dive on scenario examples' },
        { start: 1410, end: 1530, reason: isZh ? '数据飞轮实战经验' : 'Data flywheel real-world experience' },
      ],
      skippable: [
        { start: 0, end: 90, reason: isZh ? '广告与介绍' : 'Ads and intro' },
      ],
    },
    steps: [
      { id: id * 10 + 1, packId: id, stepNumber: 1, title: isZh ? '背景理解' : 'Context', content: isZh ? '本集讨论AI产品竞争格局，背景是大模型商品化浪潮下独立应用层的生存策略。' : 'This episode examines competitive dynamics in AI products in the context of LLM commoditization.', citations: [{ timestamp: 45, text: isZh ? '主持人引入话题' : 'Host introduces topic' }], completed: false },
      { id: id * 10 + 2, packId: id, stepNumber: 2, title: isZh ? '核心观点' : 'Core Arguments', content: isZh ? '嘉宾提出三个核心判断：算法不再是护城河、场景是真正壁垒、数据飞轮决定生死。' : 'Guest presents three key theses: algorithms are not moats, scenarios are true barriers, data flywheels decide survival.', citations: [{ timestamp: 312, text: isZh ? '算法平权观点' : 'Algorithm democratization point' }], completed: false },
      { id: id * 10 + 3, packId: id, stepNumber: 3, title: isZh ? '案例与证据' : 'Cases & Evidence', content: isZh ? '以Notion AI和GitHub Copilot为例，说明场景深度如何产生防御力。' : 'Using Notion AI and GitHub Copilot as examples to show how scenario depth creates defensibility.', citations: [{ timestamp: 654, text: isZh ? 'Notion AI案例' : 'Notion AI case' }], completed: false },
      { id: id * 10 + 4, packId: id, stepNumber: 4, title: isZh ? '方法论提炼' : 'Methodology', content: isZh ? '可复用框架：场景选择 → 数据积累 → 模型微调 → 场景锁定（飞轮循环）。' : 'Reusable framework: scenario selection → data accumulation → model fine-tuning → scenario lock-in (flywheel loop).', citations: [], completed: false },
      { id: id * 10 + 5, packId: id, stepNumber: 5, title: isZh ? '批判性思考' : 'Critical Analysis', content: isZh ? '反驳视角：数据飞轮前提是有流量，冷启动问题被忽视。开放基础模型能力对先行者是威胁。' : 'Counter-perspective: data flywheels require traffic first; cold-start problem is glossed over. Open foundational models threaten incumbents.', citations: [], completed: false },
      { id: id * 10 + 6, packId: id, stepNumber: 6, title: isZh ? '我的应用' : 'My Application', content: isZh ? '结合自身工作思考：我所在的产品/行业如何建立场景护城河？现有数据资产是否可变现？' : 'Connecting to your own work: how does your product build scenario moats? Are existing data assets monetizable?', citations: [], completed: false },
    ],
    cards: [
      { id: id * 100 + 1, type: 'opinion', title: isZh ? 'AI 壁垒在场景，不在模型' : 'AI moats are in scenarios, not models', explanation: isZh ? '随着基础模型能力商品化，单纯依赖模型精度的优势将快速消失。真正的护城河是深度场景整合。' : 'As foundational model capabilities commoditize, advantages from model accuracy alone will quickly disappear. True moats come from deep scenario integration.', sourceTimestamp: 312, myApplication: null, starred: true },
      { id: id * 100 + 2, type: 'method', title: isZh ? '数据飞轮四步法' : 'Four-step data flywheel', explanation: isZh ? '场景选择 → 数据积累 → 模型微调 → 场景锁定。每一圈都让竞争对手更难追赶。' : 'Scenario selection → data accumulation → model fine-tuning → scenario lock-in. Each loop makes it harder for competitors to catch up.', sourceTimestamp: 845, myApplication: null, starred: true },
      { id: id * 100 + 3, type: 'reflection', title: isZh ? '你的产品护城河在哪里？' : 'Where is your product moat?', explanation: isZh ? '如果今天一个大模型厂商推出和你相同功能的产品，你还有什么留住用户的理由？' : 'If a major LLM vendor released a product with identical features today, what reason would you have to retain users?', sourceTimestamp: 1423, myApplication: null, starred: true },
    ],
    actions: {
      today: isZh ? '列出你的产品目前积累的专属数据资产（用户行为数据、标注数据等）' : 'List your product\'s current proprietary data assets (user behavior, annotated data, etc.)',
      thisWeek: isZh ? '找一个竞品，分析其场景深度：它在哪些环节有你替代不了的数据积累？' : 'Find a competitor and analyze their scenario depth: where do they have data accumulation you can\'t replace?',
      longTerm: isZh ? '设计你产品的数据飞轮：用户完成什么动作 → 产生什么数据 → 改善什么体验 → 吸引更多用户？' : 'Design your product\'s data flywheel: what user action → what data → what improvement → more users?',
    },
    createdAt: new Date().toISOString(),
  };
}

// ── GET /api/packs/:id ─────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  const packId = parseInt(req.params.id, 10);
  if (!Number.isFinite(packId) || packId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid pack id' },
    }));
  }

  // No-DB mode
  if (!db) {
    const pack = mockPackStore.get(packId) || buildMockPack(packId);
    return res.json({ pack });
  }

  // Sprint 6 起：从 DB 读 pack_json（一 JSON 全 pack）
  try {
    const [rows] = await db.execute(
      `SELECT lp.id, lp.transcript_id, lp.goal, lp.glm_model, lp.prompt_version, lp.language,
              lp.pack_json, lp.created_at,
              e.title AS episode_title, e.cover_image_url AS episode_cover, e.duration_seconds,
              e.audio_url AS audio_url,
              p.name AS podcast_name
       FROM learning_packs lp
       LEFT JOIN transcripts t ON lp.transcript_id = t.id
       LEFT JOIN episodes e ON t.episode_id = e.id
       LEFT JOIN podcasts p ON e.podcast_id = p.id
       WHERE lp.id = ? LIMIT 1`,
      [packId]
    );
    if (!rows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'Learning pack not found' },
      }));
    }
    const r = rows[0];
    const packJson = typeof r.pack_json === 'string' ? JSON.parse(r.pack_json) : r.pack_json;

    // Sprint 16 R4: userId 从 anonymousId 解析（不是 req.user）
    const packUserId = await resolveUserId(req);

    // Sprint 16 R4: 从 user_pack_access 读该用户的 mode（覆盖 packJson.mode）
    // 因为 packJson.mode 是全局的（同 pack 多用户共享），实际每用户 mode 存在 user_pack_access
    if (packUserId) {
      try {
        const [upaRows] = await db.execute(
          `SELECT mode FROM user_pack_access WHERE user_id = ? AND pack_id = ? LIMIT 1`,
          [packUserId, r.id]
        );
        if (upaRows.length > 0) {
          packJson.mode = upaRows[0].mode; // 覆盖成用户级 mode
        }
      } catch {}
    }

    // Sprint 8: 读取用户步骤完成进度，注入 pack.steps[].completed
    if (packJson && Array.isArray(packJson.steps) && packUserId) {
      try {
        const [progressRows] = await db.execute(
          `SELECT step_index FROM user_step_progress WHERE user_id = ? AND pack_id = ?`,
          [packUserId, r.id]
        );
        const completedSet = new Set(progressRows.map(row => row.step_index));
        packJson.steps = packJson.steps.map((s, idx) => ({
          ...s,
          completed: completedSet.has(idx),
        }));
      } catch (progressErr) {
        // 进度查询失败不阻断 pack 返回，只是完成状态默认 false
        console.warn('[packs] user_step_progress lookup failed:', progressErr.message);
      }
    }

    // Sprint 8: 读取用户卡片收藏，注入 pack.cards[].starred
    // Sprint 10: 追加 archived + personal_note
    if (packJson && Array.isArray(packJson.cards) && packUserId) {
      try {
        const [cardRows] = await db.execute(
          `SELECT card_index, starred, archived, personal_note FROM user_cards WHERE user_id = ? AND pack_id = ?`,
          [packUserId, r.id]
        );
        const userCardMap = new Map(cardRows.map(row => [row.card_index, row]));
        // Sprint 16 R4: archived 卡片过滤掉不返回（删除即永久删）
        packJson.cards = packJson.cards
          .map((c, idx) => {
            const uc = userCardMap.get(idx);
            return {
              ...c,
              _idx: idx,
              starred: uc ? !!uc.starred : true, // Sprint 8: 默认收藏 (PRD C-006)
              archived: uc ? !!uc.archived : false,
              personalNote: uc?.personal_note || '',
            };
          })
          .filter(c => !c.archived) // 永久删除：archived 的直接不返回
          .map(c => { const { _idx, ...rest } = c; return rest; });
      } catch (cardsErr) {
        console.warn('[packs] user_cards lookup failed:', cardsErr.message);
      }
    }

    return res.json({
      packId: r.id,
      transcriptId: r.transcript_id,
      goal: r.goal,
      glmModel: r.glm_model,
      promptVersion: r.prompt_version,
      language: r.language,
      pack: packJson,
      episodeTitle: r.episode_title,
      episodeCover: r.episode_cover,
      durationSeconds: r.duration_seconds,
      podcastName: r.podcast_name,
      // Sprint 15 音频 demo: 返回原始播客音频 URL，供前端 timestamp 播放条使用
      audioUrl: r.audio_url || null,
      createdAt: r.created_at,
    });
  } catch (err) {
    next(err);
  }
});

// Sprint 8: GET /api/packs/:id/transcript — 供 Episode 页展开完整转录
router.get('/:id/transcript', async (req, res, next) => {
  const packId = parseInt(req.params.id, 10);
  if (!Number.isFinite(packId) || packId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid pack id' },
    }));
  }
  if (!db) {
    return res.json({ segments: [] });
  }
  try {
    const [rows] = await db.execute(
      `SELECT t.segments, t.duration_seconds, t.language, t.total_chars, t.segment_count, lp.pack_json
       FROM learning_packs lp JOIN transcripts t ON lp.transcript_id = t.id
       WHERE lp.id = ? LIMIT 1`,
      [packId]
    );
    if (!rows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'Transcript not found' },
      }));
    }
    const r = rows[0];
    const segments = typeof r.segments === 'string' ? JSON.parse(r.segments) : r.segments;
    // Sprint 14 R1 #12: 拿 pack.snapshot.skippable 的时间段，从 segments 剔除得到"净化文本"
    const packJson = typeof r.pack_json === 'string' ? JSON.parse(r.pack_json) : r.pack_json;
    const skippableRanges = ((packJson?.snapshot?.skippable || packJson?.skippable) || [])
      .filter(sk => typeof sk?.startSec === 'number' && typeof sk?.endSec === 'number')
      .map(sk => ({ start: sk.startSec, end: sk.endSec }));
    const isInSkippable = (segStart, segEnd) => {
      for (const r of skippableRanges) {
        // 段落任意部分落在跳过区间内即视为无用
        if (segStart < r.end && segEnd > r.start) return true;
      }
      return false;
    };
    const sanitizedSegments = (segments || []).filter(s => !isInSkippable(s.start, s.end));

    // Sprint 12 #8/#20: 按段落聚合（BCUT 每 2-3s 一段太细碎），合并到 30-60s 一段
    // 规则：连续段落 duration 累计 <=60s 且总字数 <=280 就合并；遇到 skippable / 说话人切换（暂无）就断
    const PARAGRAPH_MAX_SECS = 60;
    const PARAGRAPH_MAX_CHARS = 280;
    function aggregateParagraphs(segs) {
      const paragraphs = [];
      let cur = null;
      for (const s of segs || []) {
        if (!cur) {
          cur = { start: s.start, end: s.end, text: s.text };
          continue;
        }
        const nextText = cur.text + s.text;
        const nextDur = s.end - cur.start;
        if (nextDur > PARAGRAPH_MAX_SECS || nextText.length > PARAGRAPH_MAX_CHARS) {
          paragraphs.push(cur);
          cur = { start: s.start, end: s.end, text: s.text };
        } else {
          cur.text = nextText;
          cur.end = s.end;
        }
      }
      if (cur) paragraphs.push(cur);
      return paragraphs;
    }
    const paragraphs = aggregateParagraphs(segments);
    const sanitizedParagraphs = aggregateParagraphs(sanitizedSegments);

    return res.json({
      segments,          // 保留原始细碎段落供兼容
      paragraphs,        // Sprint 12 新增：合并后的段落（完整=原文 ABCDEFG）
      sanitizedParagraphs, // Sprint 14 R1 #12: 摘要=去掉 skippable 后的净化段落（BDF）
      skippableRanges,   // 让前端知道被剔除了多少
      durationSeconds: r.duration_seconds,
      language: r.language,
      totalChars: r.total_chars,
      segmentCount: r.segment_count,
      paragraphCount: paragraphs.length,
      sanitizedParagraphCount: sanitizedParagraphs.length,
    });
  } catch (err) {
    next(err);
  }
});

// Sprint 8: PATCH /api/packs/:packId/cards/:cardIndex — 卡片收藏/取消收藏
// Sprint 10: 扩展支持 archived + personalNote
// Body: { starred?: boolean, archived?: boolean, personalNote?: string }
router.patch('/:packId/cards/:cardIndex', async (req, res, next) => {
  const packId = parseInt(req.params.packId, 10);
  const cardIndex = parseInt(req.params.cardIndex, 10);
  if (!Number.isFinite(packId) || packId <= 0 || !Number.isFinite(cardIndex) || cardIndex < 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid packId or cardIndex' },
    }));
  }
  const { starred, archived, personalNote } = req.body;
  const hasStarred = typeof starred === 'boolean';
  const hasArchived = typeof archived === 'boolean';
  const hasNote = typeof personalNote === 'string';
  if (!hasStarred && !hasArchived && !hasNote) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'must supply starred | archived | personalNote' },
    }));
  }
  if (!db) {
    return res.json({ card: { packId, cardIndex, starred, archived, personalNote } });
  }
  try {
    // Sprint 10: upsert 各字段。默认 starred=1（PRD C-006），archived=0
    // 用 COALESCE 保留已有值
    // Sprint 16 R9: 用 resolveUserId 从 anonymousId 解析（否则 dev_default 1 → 数据错乱）
    const cardUserId = await resolveUserId(req);
    const insertStarred = hasStarred ? (starred ? 1 : 0) : 1;
    const insertArchived = hasArchived ? (archived ? 1 : 0) : 0;
    const insertNote = hasNote ? personalNote : null;

    // 构造 UPDATE clauses 仅更新提供的字段
    const updates = [];
    const params = [cardUserId, packId, cardIndex, insertStarred, insertArchived, insertNote];
    if (hasStarred) updates.push('starred = VALUES(starred)');
    if (hasArchived) updates.push('archived = VALUES(archived)');
    if (hasNote) updates.push('personal_note = VALUES(personal_note)');
    updates.push('updated_at = CURRENT_TIMESTAMP');

    await db.execute(
      `INSERT INTO user_cards (user_id, pack_id, card_index, starred, archived, personal_note)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
      params
    );
    return res.json({ card: { packId, cardIndex, starred, archived, personalNote } });
  } catch (err) {
    next(err);
  }
});

// ── Sprint 11 v3: POST /api/packs/:packId/generate ────────────────────────
// 用户在快照页决策 (mode: 'quick' | 'deep' | 'skip') 后触发 Step 2 学习包生成
// body: { mode: 'quick' | 'deep' | 'skip', anonymousId?: string }
// Sprint 11 v16 hotfix: 改为异步 job pattern (Sprint 9 教训) —— 立即返回 jobId
// 前端跳等待屏轮询，避免用户切后台丢失 30-100s 长任务
router.post('/:packId/generate', async (req, res, next) => {
  const packId = parseInt(req.params.packId, 10);
  const { mode } = req.body || {};
  if (!Number.isFinite(packId) || packId <= 0 || !['quick', 'deep', 'skip'].includes(mode)) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'packId + mode(quick|deep|skip) required' },
    }));
  }

  if (!db) {
    return next(Object.assign(new Error('NOT_IMPLEMENTED'), {
      status: 500,
      apiError: { code: ErrorCode.INTERNAL, message: 'No-DB mode does not support Step 2' },
    }));
  }

  try {
    // 读 pack_json.snapshot
    const [rows] = await db.execute(
      `SELECT pack_json, transcript_id FROM learning_packs WHERE id = ? LIMIT 1`,
      [packId]
    );
    if (!rows.length) {
      return next(Object.assign(new Error('NOT_FOUND'), {
        status: 404,
        apiError: { code: ErrorCode.NOT_FOUND, message: 'pack not found' },
      }));
    }
    const packJson = typeof rows[0].pack_json === 'string' ? JSON.parse(rows[0].pack_json) : rows[0].pack_json;
    const snapshot = packJson.snapshot || packJson;

    // skip mode: 同步更新，不调 GLM，不需要 job
    if (mode === 'skip') {
      packJson.mode = 'skip';
      await db.execute(
        `UPDATE learning_packs SET pack_json = ? WHERE id = ?`,
        [JSON.stringify(packJson), packId]
      );
      // 更新 user_pack_access.mode —— Sprint 16 R3-4: 用 resolveUserId 从 anonymousId 解析
      const skipUserId = await resolveUserId(req);
      if (skipUserId) {
        try {
          await db.execute(
            `UPDATE user_pack_access SET mode = ? WHERE user_id = ? AND pack_id = ?`,
            [mode, skipUserId, packId]
          );
        } catch {}
      }
      return res.json({ ok: true, mode: 'skip', pack: packJson });
    }

    // quick / deep: 创建 job，异步跑 Step 2 GLM
    const { createJob, updateJob, completeJob, failJob } = await import('../services/jobStore.js');
    // Sprint 16 R3-4: userId 用 resolveUserId 从 anonymousId 解析（不再靠 req.user）
    const userId = (await resolveUserId(req)) || 1;

    const jobId = await createJob({
      userId,
      inputUrl: `pack:${packId}:${mode}`, // 用 pack: 前缀标识 Step 2 job
      inputType: 'pack-generate',
      goal: mode,
      metadata: { packId, mode },
    });

    // 异步跑 Step 2（不 await，立即返回 jobId 给前端）
    (async () => {
      try {
        await updateJob(jobId, { status: 'generating', progress: 30, stageMessage: '✨ AI 在提炼学习包' });
        const { generatePackFromSnapshot } = await import('../services/packGenerator.js');
        const s2 = await generatePackFromSnapshot({
          snapshot,
          mode,
          context: { packId, jobId },
        });

        // 合并 Step 2 输出到 pack_json
        packJson.mode = mode;
        packJson.steps = s2.pack.steps || [];
        packJson.concepts = s2.pack.concepts || [];
        packJson.cards = s2.pack.cards || [];
        packJson.actions = s2.pack.actions || {};

        await db.execute(
          `UPDATE learning_packs SET pack_json = ? WHERE id = ?`,
          [JSON.stringify(packJson), packId]
        );

        try {
          await db.execute(
            `UPDATE user_pack_access SET mode = ? WHERE user_id = ? AND pack_id = ?`,
            [mode, userId, packId]
          );
        } catch {}

        await completeJob(jobId, packId);
      } catch (e) {
        console.error(`[packs/generate] job ${jobId} failed:`, e?.message);
        await failJob(jobId, e?.code || 'PACK_GEN_ERROR', e?.message || '学习包生成失败');
      }
    })();

    // 立即返回 jobId（不等 GLM 完成）
    return res.json({ ok: true, jobId, mode, packId });
  } catch (err) {
    next(err);
  }
});

// ── PATCH /api/steps/:id ───────────────────────────────────────────────────────
// Sprint 8 rewrite: v2 schema 没 learning_steps 表，改用 user_step_progress 桥接表。
// 前端合成 stepId = packId * 100 + stepIndex，此处解码回来。
const stepsRouter = Router();

stepsRouter.patch('/:id', async (req, res, next) => {
  const stepId = parseInt(req.params.id, 10);
  if (!Number.isFinite(stepId) || stepId <= 0) {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'Invalid step id' },
    }));
  }

  const { completed } = req.body;
  if (typeof completed !== 'boolean') {
    return next(Object.assign(new Error('VALIDATION_ERROR'), {
      status: 400,
      apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'completed must be a boolean' },
    }));
  }

  // 解码合成 id → packId + stepIndex
  const packId = Math.floor(stepId / 100);
  const stepIndex = stepId % 100;

  // No-DB fallback（旧 mock 模式）
  if (!db) {
    for (const pack of mockPackStore.values()) {
      const step = pack.steps?.find(s => s.id === stepId);
      if (step) {
        step.completed = completed;
        return res.json({ step });
      }
    }
    return res.json({
      step: { id: stepId, completed, stepNumber: stepIndex + 1, title: 'Step', content: '', citations: [] },
    });
  }

  // DB mode: user_step_progress upsert / delete
  try {
    // Sprint 14 R1 #18: 用 anonymousId 解析 userId（此前用 req.user.id 匿名用户全部落到 user_id=1 或 401）
    const userId = await resolveUserId(req);
    if (completed) {
      // 标为完成 → upsert
      await db.execute(
        `INSERT INTO user_step_progress (user_id, pack_id, step_index, completed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE completed_at = NOW()`,
        [userId, packId, stepIndex]
      );
    } else {
      // 取消完成 → 删除该行
      await db.execute(
        `DELETE FROM user_step_progress WHERE user_id = ? AND pack_id = ? AND step_index = ?`,
        [userId, packId, stepIndex]
      );
    }

    return res.json({
      step: {
        id: stepId,
        stepNumber: stepIndex + 1,
        completed,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { stepsRouter };
export default router;
