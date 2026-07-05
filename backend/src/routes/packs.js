// Packs router — E-002/E-003/E-004
// GET /api/packs/:id
// PATCH /api/steps/:id
import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';

const router = Router();

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

    // Sprint 8: 读取用户步骤完成进度，注入 pack.steps[].completed
    if (packJson && Array.isArray(packJson.steps) && req.user?.id) {
      try {
        const [progressRows] = await db.execute(
          `SELECT step_index FROM user_step_progress WHERE user_id = ? AND pack_id = ?`,
          [req.user.id, r.id]
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
      createdAt: r.created_at,
    });
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
    if (completed) {
      // 标为完成 → upsert
      await db.execute(
        `INSERT INTO user_step_progress (user_id, pack_id, step_index, completed_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE completed_at = NOW()`,
        [req.user.id, packId, stepIndex]
      );
    } else {
      // 取消完成 → 删除该行
      await db.execute(
        `DELETE FROM user_step_progress WHERE user_id = ? AND pack_id = ? AND step_index = ?`,
        [req.user.id, packId, stepIndex]
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
