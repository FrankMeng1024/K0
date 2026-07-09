// K0 backend - GLM 学习包生成 v3 (Sprint 11)
// 方案 v2: 拆两步
//   - generateSnapshot(): 全转录 → 快照 (Step 1)
//   - generatePackFromSnapshot(): 快照 worthListening → 6步+概念+卡片+行动 (Step 2)
//
// 保留 generateLearningPack() 作为兼容 API：内部串行调 Step 1 + Step 2 (deep mode)
// SPIKE-010 验证 3 轮 0 次 429
//
// 保留 Sprint 10 v16 的 fallback 链 + 冷却窗口作为最后防线（正常路径不触发）

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loggedFetch } from './aiLogger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2';
const GLM_MAX_TOKENS = parseInt(process.env.GLM_MAX_TOKENS || '8192', 10);
const PROMPT_VERSION = 'v5';

// Sprint 11 v3: 拆两个 prompt (Phase 后端重构: prompts 随 ai/ 模块一起移到 ./prompts/)
const SNAPSHOT_PROMPT = readFileSync(join(__dirname, './prompts/snapshot-v2.zh.md'), 'utf8');
const PACK_PROMPT = readFileSync(join(__dirname, './prompts/pack.zh.md'), 'utf8');

// ── Model fallback (Sprint 10 v16 保留) ──────────────
const MODEL_FALLBACK_CHAIN = ['glm-4.5-air', 'glm-4-flash'];
const COOLDOWN_MS = 5 * 60 * 1000;
const modelCooldown = new Map();

function isCoolingDown(model) {
  const until = modelCooldown.get(model);
  return typeof until === 'number' && Date.now() < until;
}

function markCooldown(model) {
  modelCooldown.set(model, Date.now() + COOLDOWN_MS);
  console.warn(`[packGenerator] Model ${model} entered cooldown for ${COOLDOWN_MS / 60000}min`);
}

// ── 转录拼章节 ──────────────────────────────
function segmentsWithChapters(segments) {
  if (!segments.length) return '';
  const CHAPTER_SECS = 15 * 60;
  const totalDur = segments[segments.length - 1].end;
  const totalChapters = Math.ceil(totalDur / CHAPTER_SECS);
  const lines = [];
  let cur = -1;
  for (const s of segments) {
    const idx = Math.floor(s.start / CHAPTER_SECS);
    if (idx !== cur) {
      cur = idx;
      const startMin = idx * 15;
      const endMin = Math.min((idx + 1) * 15, Math.ceil(totalDur / 60));
      lines.push('');
      lines.push(`=== [章节 ${idx + 1}/${totalChapters}: ${startMin}-${endMin}min] ===`);
    }
    // Sprint 16 R17: 时间精度提升 —— 传 2 位小数给 GLM（不再 Math.floor 丢 100ms）
    lines.push(`[${s.start.toFixed(2)}-${s.end.toFixed(2)}s] ${s.text}`);
  }
  return lines.join('\n');
}

// ── GLM 调用 (含 fallback + JSON salvage) ────────
async function callGlm({ systemPrompt, userPrompt, callType, model, temperature, maxTokens, context }) {
  const buildBody = (m) => ({
    model: m,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  const preferred = model;
  const preferredCooling = isCoolingDown(preferred);
  const tryModels = preferredCooling
    ? MODEL_FALLBACK_CHAIN.filter(m => m !== preferred)
    : [preferred, ...MODEL_FALLBACK_CHAIN.filter(m => m !== preferred)];

  let response, body, latencyMs, parseOk, usedModel;
  for (let i = 0; i < tryModels.length; i++) {
    const m = tryModels[i];
    usedModel = m;
    ({ response, body, latencyMs, parseOk } = await loggedFetch({
      callType: i === 0 && !preferredCooling ? callType : `${callType}.fallback.${m}`,
      provider: 'zhipu-glm',
      model: m,
      promptVersion: PROMPT_VERSION,
      context,
      url: `${GLM_BASE_URL}/chat/completions`,
      fetchOptions: {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildBody(m)),
      },
    }));

    if (response.ok) {
      if (m !== preferred) console.warn(`[packGenerator] Used fallback ${m} for ${callType}`);
      break;
    }
    if (response.status !== 429) break;
    markCooldown(m);
    if (i < tryModels.length - 1) {
      console.warn(`[packGenerator] ${m} 429, fallback → ${tryModels[i + 1]}`);
    }
  }

  if (!response.ok) {
    throw Object.assign(new Error(`GLM_HTTP_${response.status}`), {
      code: 'GLM_API_ERROR',
      status: response.status,
      lastModel: usedModel,
    });
  }

  const content = body?.choices?.[0]?.message?.content?.trim() || '';
  let json = null;
  try {
    const cleaned = content.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    json = JSON.parse(cleaned);
  } catch (e) {
    // JSON salvage attempt 1
    try {
      let salvaged = content.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      const firstBrace = salvaged.indexOf('{');
      const lastBrace = salvaged.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        salvaged = salvaged.slice(firstBrace, lastBrace + 1);
      }
      // Sprint 16 R4: 加强 salvage — 遇 `"key": 中文字` 缺引号自动补
      salvaged = salvaged.replace(/,(\s*[}\]])/g, '$1');
      // 尝试匹配 `"insight": 中文` → `"insight": "中文"`
      salvaged = salvaged.replace(/"(\w+)":\s*([^\s"[{][^,\}\]]*?)([,\}\]])/g, (match, key, val, tail) => {
        const trimmed = val.trim();
        if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(trimmed)) return match;
        return `"${key}": "${trimmed.replace(/"/g, '\\"')}"${tail}`;
      });
      json = JSON.parse(salvaged);
    } catch (e2) {
      // Sprint 16 R4: salvage 也失败 —— retry 一次调 GLM（可能这次输出干净的 JSON）
      console.warn(`[packGenerator] JSON malformed, retrying once: ${e.message.slice(0, 100)}`);
      // 重试一次同 model
      const retryResult = await loggedFetch({
        callType: `${callType}.retry`,
        provider: 'zhipu-glm',
        model: usedModel,
        promptVersion: PROMPT_VERSION,
        context,
        url: `${GLM_BASE_URL}/chat/completions`,
        fetchOptions: {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(buildBody(usedModel)),
        },
      });
      if (retryResult.response.ok) {
        const retryContent = retryResult.body?.choices?.[0]?.message?.content?.trim() || '';
        try {
          json = JSON.parse(retryContent.replace(/^```json\s*/, '').replace(/```\s*$/, ''));
        } catch {
          throw Object.assign(new Error(`GLM_MALFORMED_JSON: ${e.message}`), {
            code: 'GLM_MALFORMED_JSON',
            rawContent: content.slice(0, 500),
          });
        }
      } else {
        throw Object.assign(new Error(`GLM_MALFORMED_JSON: ${e.message}`), {
          code: 'GLM_MALFORMED_JSON',
          rawContent: content.slice(0, 500),
        });
      }
    }
  }

  return {
    json,
    latencyMs,
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
  };
}

// ═══════════════════════════════════════════════════════
// Step 1: 快照生成
// ═══════════════════════════════════════════════════════

/**
 * 从全转录生成快照（Step 1）
 * @param {object} params
 * @param {Array<{start,end,text}>} params.segments
 * @param {string} params.language - 'zh'|'en'|'mixed'（保留但目前都用 zh prompt，输出都中文 per CR-012）
 * @param {object} [params.context] - { userId, jobId, episodeId, transcriptId }
 * @returns {Promise<{ snapshot, glmModel, promptVersion, latencyMs, inputTokens, outputTokens }>}
 */
export async function generateSnapshot({ segments, language = 'zh', context = {} }) {
  const transcriptText = segmentsWithChapters(segments);
  const totalDur = segments.length ? segments[segments.length - 1].end : 0;
  const durMin = Math.round(totalDur / 60);

  const userPrompt = `以下是一集${durMin}分钟播客的完整转录（含时间戳和 15 分钟章节标记）：\n\n${transcriptText}\n\n请生成快照 JSON。`;

  const startedAt = Date.now();
  const result = await callGlm({
    systemPrompt: SNAPSHOT_PROMPT,
    userPrompt,
    callType: 'glm.snapshot.generate',
    model: GLM_MODEL,
    temperature: 0.5,
    maxTokens: GLM_MAX_TOKENS,
    context,
  });

  // Sprint 16 R5: 时间戳后处理 —— 用 quote 第一句在 transcript 里搜真实 start
  // 修 GLM 给的 startSec 落在段落中间的问题，保证音频播放位置=quote 第一个字
  const snapshot = result.json;
  if (snapshot?.worthListening && Array.isArray(snapshot.worthListening)) {
    for (const w of snapshot.worthListening) {
      const q = w.quoteParagraph || w.quote || w.reason || '';
      const realStart = findQuoteRealStart(q, segments);
      if (realStart !== null) {
        w.startSec = realStart;
      }
    }
  }
  if (snapshot?.skippable && Array.isArray(snapshot.skippable)) {
    for (const s of snapshot.skippable) {
      const q = s.quote || s.reason || '';
      const realStart = findQuoteRealStart(q, segments);
      if (realStart !== null) {
        s.startSec = realStart;
      }
    }
  }

  return {
    snapshot,
    glmModel: GLM_MODEL,
    promptVersion: PROMPT_VERSION,
    latencyMs: Date.now() - startedAt,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// Sprint 16 R17: 高精度 quote 定位
// 策略优先级：
//   1) 若 segment 带 BCUT words[]（字级 ms 精度），拼字级 char stream 做 needle
//      匹配 → 返回 quote 第一字的 word.start（<200ms 误差）
//   2) 否则降级到"字符位置比例插值"：找到 needle 所在 segment，用 needle 在
//      segment.text 里的字符位置比例估算内部偏移（±2s 误差）
//   3) 都失败 → null，保持 GLM 原值
function findQuoteRealStart(quote, segments) {
  if (!quote || !segments || segments.length === 0) return null;
  const strip = (s) => String(s || '').replace(/[""''""''、，。！？,.\s]+/g, '');
  const cleaned = strip(quote);
  if (cleaned.length < 6) return null;
  const needleLong = cleaned.slice(0, Math.min(15, cleaned.length));
  const needleShort = cleaned.slice(0, 8);
  const needleTiny = cleaned.slice(0, 6);

  // ─── Tier 1: 字级 words 精确定位 ────────────────────
  // 拼 seg-local 字流：每字带 (segIdx, wordIdxInSeg, absStart)
  // 用 needle 在字流上滑窗匹配，命中即返回第一字 start
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const words = Array.isArray(seg.words) ? seg.words : null;
    if (!words || words.length === 0) continue;
    // 拼字流（跳过标点空格，仅保留有意义字符）
    const chars = [];
    for (const w of words) {
      const label = String(w.label || '');
      // BCUT 中文 label 通常是单字；英文可能是完整 token
      for (const ch of label) {
        if (/[""''""''、，。！？,.\s]/.test(ch)) continue;
        chars.push({ ch, start: typeof w.start === 'number' ? w.start : (w.start_time || 0) / 1000 });
      }
    }
    if (chars.length === 0) continue;
    const charStr = chars.map(c => c.ch).join('');
    // 优先 15 字前缀，降级 8/6
    for (const needle of [needleLong, needleShort, needleTiny]) {
      const idx = charStr.indexOf(needle);
      if (idx >= 0) {
        const w = chars[idx];
        // 保留 2 位小数（不 Math.floor，别把 ms 精度砍掉）
        return Math.round(w.start * 100) / 100;
      }
    }
  }

  // ─── Tier 2: 无 words，字符比例插值 ────────────────
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const segClean = strip(seg.text);
    for (const needle of [needleLong.slice(0, 10), needleLong.slice(0, 8), needleTiny]) {
      const pos = segClean.indexOf(needle);
      if (pos >= 0 && segClean.length > 0) {
        const ratio = pos / segClean.length;
        const dur = (seg.end || seg.start) - seg.start;
        const est = seg.start + dur * ratio;
        return Math.round(est * 100) / 100;
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════
// Step 2: 学习包生成（基于快照的 worthListening 段落）
// ═══════════════════════════════════════════════════════

/**
 * 从快照 worthListening 段落生成完整学习包（Step 2）
 * @param {object} params
 * @param {object} params.snapshot - Step 1 输出
 * @param {'quick'|'deep'} params.mode - quick=3-5 张卡；deep=3-18 张卡
 * @param {object} [params.context]
 * @returns {Promise<{ pack, glmModel, promptVersion, latencyMs, inputTokens, outputTokens }>}
 */
export async function generatePackFromSnapshot({ snapshot, mode = 'deep', context = {} }) {
  const worthListening = snapshot?.worthListening || [];
  if (!worthListening.length) {
    throw Object.assign(new Error('SNAPSHOT_NO_PASSAGES'), {
      code: 'GLM_MALFORMED_JSON',
      details: 'snapshot.worthListening is empty',
    });
  }

  // 拼段落文本
  const passages = worthListening.map((w, i) => {
    const startMin = Math.floor((w.startSec || 0) / 60);
    const endMin = Math.floor((w.endSec || 0) / 60);
    return `【段 ${i + 1}】(${startMin}分-${endMin}分, ${w.reason || ''})\n${w.quoteParagraph || ''}`;
  }).join('\n\n');

  const oneSentence = snapshot.oneSentence || '';
  const corePoints = (snapshot.corePoints || []).map(p => p.point).join('; ');

  const userPrompt = `## 播客整体信息
一句话概括：${oneSentence}
核心观点：${corePoints}

## 学习模式：${mode}
${mode === 'quick'
  ? '**quick 模式（精华速览）**：只生成 cards（3-5 张精选卡片）。**steps、concepts、actions 全部返回空数组/空对象**，因为速学的用户只想看核心卡片，不需要 6 步骤/概念/行动。返回：{"steps":[],"concepts":[],"cards":[...3-5 张...],"actions":{}}'
  : '**deep 模式（精读）**：生成完整学习包，cards 按内容量动态密度 3-18 张，steps 6 步，concepts 若干，actions 分今天/本周/长期。'}

## 核心段落（从原播客提炼）

${passages}

请基于以上段落生成完整学习包 JSON。`;

  const startedAt = Date.now();
  const result = await callGlm({
    systemPrompt: PACK_PROMPT,
    userPrompt,
    callType: `glm.pack.generate.${mode}`,
    model: GLM_MODEL,
    temperature: 0.5,
    maxTokens: GLM_MAX_TOKENS,
    context,
  });

  return {
    pack: result.json,
    glmModel: GLM_MODEL,
    promptVersion: PROMPT_VERSION,
    mode,
    latencyMs: Date.now() - startedAt,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  };
}

// ═══════════════════════════════════════════════════════
// 兼容 API: 一次性生成完整学习包（Step 1 + Step 2 串行）
// 保留给 importUrl.js 兼容旧接口；新代码应该分别调 generateSnapshot + generatePackFromSnapshot
// ═══════════════════════════════════════════════════════

/**
 * @deprecated Sprint 11: 用 generateSnapshot + generatePackFromSnapshot 分别调用
 */
export async function generateLearningPack({ segments, language = 'zh', goal, context = {} }) {
  const startedAt = Date.now();
  const s1 = await generateSnapshot({ segments, language, context });
  const s2 = await generatePackFromSnapshot({ snapshot: s1.snapshot, mode: 'deep', context });

  // 合并 snapshot + pack 到旧格式
  // Sprint 16 R22 (Bug4): actions.today/thisWeek/longTerm 若 GLM 漏返回，用兜底文案
  // Frank 反馈"几乎每一篇都没有本周和长期目标"—— prompt 已强化非空要求，
  // 这里再加一层前端展示保护，杜绝 undefined 造成 UI 空白
  const rawActions = s2.pack.actions || {};
  const goalText = String(s1.snapshot.oneSentence || '这一集').slice(0, 20);
  const safeActions = {
    today: (typeof rawActions.today === 'string' && rawActions.today.trim())
      ? rawActions.today.trim()
      : `复述"${goalText}"给一位朋友听，10 分钟内讲清核心观点`,
    thisWeek: (typeof rawActions.thisWeek === 'string' && rawActions.thisWeek.trim())
      ? rawActions.thisWeek.trim()
      : `写一段 200 字复盘：这集哪 1 个观点最能落地到你当前工作`,
    longTerm: (typeof rawActions.longTerm === 'string' && rawActions.longTerm.trim())
      ? rawActions.longTerm.trim()
      : `每季度回看一次这集，标记哪些判断在事后被验证或推翻`,
  };
  const mergedPack = {
    snapshot: s1.snapshot,
    steps: s2.pack.steps || [],
    concepts: s2.pack.concepts || [],
    cards: s2.pack.cards || [],
    actions: safeActions,
    // Sprint 10 遗留字段（保持前端兼容）
    oneSentence: s1.snapshot.oneSentence,
    corePoints: s1.snapshot.corePoints,
    audience: s1.snapshot.audience,
    valueScore: s1.snapshot.valueScore,
    estimatedCostMinutes: s1.snapshot.estimatedCostMinutes,
    worthListening: s1.snapshot.worthListening,
    skippable: s1.snapshot.skippable,
  };

  return {
    pack: mergedPack,
    glmModel: GLM_MODEL,
    promptVersion: PROMPT_VERSION,
    generationStrategy: 'v3-two-step',
    latencyMs: Date.now() - startedAt,
    inputTokens: (s1.inputTokens || 0) + (s2.inputTokens || 0),
    outputTokens: (s1.outputTokens || 0) + (s2.outputTokens || 0),
    retries: 0,
  };
}
