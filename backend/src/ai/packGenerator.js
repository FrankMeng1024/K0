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
import pino from 'pino';
import { loggedFetch } from './aiLogger.js';

const aiLog = pino({ level: process.env.LOG_LEVEL || 'info' }).child({ mod: 'ai' });

const __dirname = dirname(fileURLToPath(import.meta.url));

const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2';
const GLM_MAX_TOKENS = parseInt(process.env.GLM_MAX_TOKENS || '8192', 10);
const PROMPT_VERSION = 'v10';

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

// Bug4 (Sprint16 R23): 截断 JSON 抢救 —— GLM 输出撞 max_tokens 上限被切断时,
//   末尾数组/对象/字符串未闭合。从最靠后的完整 `}` 倒序尝试截断+补齐容器闭合,
//   尽量恢复已完整生成的部分 (如已完整的前 N 张卡片), 而非整包硬失败。
function salvageTruncatedJson(input) {
  let s = input.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
  const firstBrace = s.indexOf('{');
  if (firstBrace < 0) return null;
  s = s.slice(firstBrace);

  // 收集所有"字符串外的 }"位置, 作为候选安全截点
  const closes = [];
  let inStr = false, escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '}') closes.push(i);
  }

  // 从最靠后的 } 往前试 (保留尽量多完整元素), 截到该 } 后补齐所有未闭合容器
  for (let k = closes.length - 1; k >= 0; k--) {
    const closed = closeOpen(s.slice(0, closes[k] + 1));
    if (closed) {
      try { return JSON.parse(closed); } catch { /* try earlier close */ }
    }
  }
  const whole = closeOpen(s.replace(/,\s*$/, ''));
  if (whole) { try { return JSON.parse(whole); } catch { /* fall through */ } }
  return null;
}

// 给一段片段补齐未闭合的 [ 和 { (字符串必须已闭合, 否则返回 null)
function closeOpen(fragment) {
  const stack = [];
  let inStr = false, escaped = false;
  for (let i = 0; i < fragment.length; i++) {
    const ch = fragment[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}') { if (stack[stack.length - 1] === '{') stack.pop(); }
    else if (ch === ']') { if (stack[stack.length - 1] === '[') stack.pop(); }
  }
  if (inStr) return null;
  let out = fragment.replace(/,\s*$/, '');
  for (let i = stack.length - 1; i >= 0; i--) {
    out += stack[i] === '{' ? '}' : ']';
  }
  return out;
}

async function callGlm({ systemPrompt, userPrompt, callType, model, temperature, maxTokens, context, thinking, responseFormat }) {
  const buildBody = (m) => {
    const b = {
      model: m,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    };
    // Sprint16 R24 AI 提速: 抽取类关思考(disabled 快 5-10 倍不掉质量), 精学开思考(enabled 深度值回)
    if (thinking) b.thinking = thinking;
    // 强制 JSON 输出 (与 thinking 可叠加), 减少 markdown 包裹/杂字, 降 salvage 概率
    if (responseFormat) b.response_format = responseFormat;
    return b;
  };

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
    aiLog.error({
      event: 'glm_call_fail',
      callType,
      usedModel,
      status: response.status,
      ...(context?.jobId ? { jobId: context.jobId } : {}),
    }, `AI ${callType} failed HTTP ${response.status}`);
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
          // Bug4 (Sprint16 R23): retry 仍坏 → 截断抢救 (retry 内容优先, 再原始内容)
          json = salvageTruncatedJson(retryContent) || salvageTruncatedJson(content);
          if (json) {
            console.warn(`[packGenerator] 截断抢救成功 (${callType}), 恢复部分内容`);
            aiLog.warn({ event: 'glm_json_salvaged', callType, ...(context?.jobId ? { jobId: context.jobId } : {}) }, 'JSON 截断抢救成功');
          } else {
            throw Object.assign(new Error(`GLM_MALFORMED_JSON: ${e.message}`), {
              code: 'GLM_MALFORMED_JSON',
              rawContent: content.slice(0, 500),
            });
          }
        }
      } else {
        // Bug4: retry 请求本身失败 → 对原始内容做截断抢救
        json = salvageTruncatedJson(content);
        if (json) {
          console.warn(`[packGenerator] retry 请求失败, 原始内容截断抢救成功 (${callType})`);
          aiLog.warn({ event: 'glm_json_salvaged', callType, ...(context?.jobId ? { jobId: context.jobId } : {}) }, 'JSON 截断抢救成功');
        } else {
          throw Object.assign(new Error(`GLM_MALFORMED_JSON: ${e.message}`), {
            code: 'GLM_MALFORMED_JSON',
            rawContent: content.slice(0, 500),
          });
        }
      }
    }
  }

  // 结构化 AI 日志 (后续调优信号: callType/model/token/延迟/是否 fallback+salvage)
  aiLog.info({
    event: 'glm_call_ok',
    callType,
    preferredModel: preferred,
    usedModel,
    fallback: usedModel !== preferred,
    promptVersion: PROMPT_VERSION,
    latencyMs,
    inputTokens: body.usage?.prompt_tokens ?? null,
    outputTokens: body.usage?.completion_tokens ?? null,
    ...(context?.jobId ? { jobId: context.jobId } : {}),
    ...(context?.packId ? { packId: context.packId } : {}),
  }, `AI ${callType} ok via ${usedModel}`);

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
    temperature: 0.3,
    maxTokens: GLM_MAX_TOKENS,
    context,
    // Sprint16 R24 提速: 快照=抽取任务, 关思考 (实测快 5-10 倍, 质量不掉) + 强制 JSON
    thinking: { type: 'disabled' },
    responseFormat: { type: 'json_object' },
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

// #88: 找 quote 逐字出现的 segment id (用于 step citation 溯源)。找不到返回 null。
//   与 findQuoteRealStart 同样的清洗/前缀降级策略, 但返回 segment.id 而非 start。
function findQuoteSegmentId(quote, segments) {
  if (!quote || !segments || segments.length === 0) return null;
  const strip = (s) => String(s || '').replace(/[""''""''、，。！？,.\s]+/g, '');
  const cleaned = strip(quote);
  if (cleaned.length < 6) return null;
  const needleLong = cleaned.slice(0, Math.min(15, cleaned.length));
  const needleShort = cleaned.slice(0, 8);
  const needleTiny = cleaned.slice(0, 6);
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    if (seg.id == null) continue;
    const segClean = strip(seg.text);
    for (const needle of [needleLong, needleShort, needleTiny]) {
      if (segClean.indexOf(needle) >= 0) return seg.id;
    }
  }
  return null;
}
// Step 2: 学习包生成（基于快照的 worthListening 段落）
// ═══════════════════════════════════════════════════════

// R26 分块卡片生成: 把转录切块并行出卡, 每张 quote 从该块真实原文摘。
//   实测: 9块并行 12.7s(vs 单次131-300s), quote 13/16 逐字命中(vs 0/4)。快+真+不崩+长短通用。
const CHUNK_CARD_PROMPT = `你是中文播客学习助理。下面是一段播客转录(带时间戳秒数)。请从中摘 1-3 张最有价值的知识卡片。

严格输出 JSON: {"cards":[{"quote":"从转录逐字摘的嘉宾原话(可删嗯/啊等口水词, 不改写/不概括/不拼接)","insight":"≤25字一句话洞见","timestamp":该quote开始的秒数(整数, 用转录里的时间),"context":"2-3句: 为什么这句重要/它的论证或适用边界"}]}

铁律: quote **必须能在下面转录里逐字找到**。找不到能直接摘的原话就少出一张卡, **绝不编造/改写成书面语**。若这段转录是广告/寒暄/无实质内容, 返回 {"cards":[]}。只要 JSON, 不要解释。`;

function chunkSegments(segments, maxSec = 360, maxChar = 2500) {
  const blocks = [];
  let cur = null;
  for (const s of segments) {
    const st = Number(s.start) || 0, en = Number(s.end) || st, tx = s.text || '';
    if (!cur) { cur = { start: st, end: en, segs: [{ start: st, end: en, text: tx }] }; continue; }
    const nd = en - cur.start, nt = cur.segs.reduce((a, x) => a + x.text.length, 0) + tx.length;
    if (nd > maxSec || nt > maxChar) {
      blocks.push(cur);
      cur = { start: st, end: en, segs: [{ start: st, end: en, text: tx }] };
    } else {
      cur.end = en; cur.segs.push({ start: st, end: en, text: tx });
    }
  }
  if (cur) blocks.push(cur);
  return blocks;
}

// 有限并发跑 (防 429): 每批 concurrency 个。onBatch(done,total) 每批完报进度。
async function runLimited(items, concurrency, fn, onBatch) {
  const out = [];
  const totalBatches = Math.ceil(items.length / concurrency) || 1;
  let batchIdx = 0;
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const r = await Promise.all(batch.map((it, k) => fn(it, i + k)));
    out.push(...r);
    batchIdx++;
    if (onBatch) { try { onBatch(batchIdx, totalBatches); } catch {} }
  }
  return out;
}

async function generateCardsChunked({ segments, context = {}, maxCards = 18, onProgress = null }) {
  const blocks = chunkSegments(segments);
  const genBlock = async (block, idx) => {
    const userPrompt = `转录片段 (${Math.floor(block.start / 60)}分-${Math.floor(block.end / 60)}分):\n\n`
      + block.segs.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    try {
      const result = await callGlm({
        systemPrompt: CHUNK_CARD_PROMPT,
        userPrompt,
        callType: `glm.pack.cards.chunk`,
        model: GLM_MODEL,
        temperature: 0.3,
        maxTokens: 2000,
        context: { ...context, chunk: idx },
        thinking: { type: 'disabled' },   // 抽卡关思考: 快
        responseFormat: { type: 'json_object' },
      });
      return Array.isArray(result.json?.cards) ? result.json.cards : [];
    } catch (e) {
      console.warn(`[cardsChunked] block ${idx} failed:`, e?.message);
      return [];
    }
  };
  // 并发 3 (稳, 防 429); 各块 cards 拼起来。每批完报进度(用于精学进度条)。
  const perBlock = await runLimited(blocks, 3, genBlock, (done, total) => {
    if (onProgress) onProgress({ done, total });
  });
  const all = [];
  for (const cards of perBlock) for (const c of (cards || [])) all.push(c);
  return all.slice(0, maxCards);
}

/**
 * 从快照 worthListening 段落生成完整学习包（Step 2）
 * @param {object} params
 * @param {object} params.snapshot - Step 1 输出
 * @param {'quick'|'deep'} params.mode - quick=3-5 张卡；deep=3-18 张卡
 * @param {object} [params.context]
 * @returns {Promise<{ pack, glmModel, promptVersion, latencyMs, inputTokens, outputTokens }>}
 */
export async function generatePackFromSnapshot({ snapshot, mode = 'deep', context = {}, segments = null, onProgress = null }) {
  const worthListening = snapshot?.worthListening || [];
  if (!worthListening.length) {
    throw Object.assign(new Error('SNAPSHOT_NO_PASSAGES'), {
      code: 'GLM_MALFORMED_JSON',
      details: 'snapshot.worthListening is empty',
    });
  }

  // 拼段落文本
  const oneSentence = snapshot.oneSentence || '';
  const corePoints = (snapshot.corePoints || []).map(p => p.point).join('; ');

  const startedAt = Date.now();
  const hasSegs = segments && Array.isArray(segments) && segments.length > 0;

  // ─── R26 卡片: 分块并行从真实原文摘 (快+真quote+不崩+长短通用) ───
  let cards = [];
  if (hasSegs) {
    const maxCards = mode === 'quick' ? 5 : 18;
    // #79 进度: 卡片分块占 30→70%, 每批完更新
    cards = await generateCardsChunked({
      segments, context, maxCards,
      onProgress: onProgress ? ({ done, total }) => {
        const pct = 30 + Math.round((done / total) * 40);
        onProgress({ progress: pct, message: `✨ 提炼知识卡片 ${done}/${total}` });
      } : null,
    });
  }

  // ─── steps/concepts/actions: 仅 deep ───
  // R28 提速(研究建议#2): 拆成两次并行调用, 取 max 而非 sum ——
  //   A(thinking-enabled): steps(需思辨) + actions
  //   B(thinking-disabled): concepts(术语抽取) + frameworkCards + recallQuestions(抽取/归纳类, 关思考快)
  //   实测思辨调用是 97s 主因; 拆开后两半并行, 各自 output 减半 → wall time ≈ 慢的那半。
  let steps = [], concepts = [], actions = {}, recallQuestions = [];
  if (mode === 'deep') {
    if (onProgress) onProgress({ progress: 72, message: '✨ 梳理学习路径与概念' });
    const passages = worthListening.map((w, i) => {
      const startMin = Math.floor((w.startSec || 0) / 60);
      const endMin = Math.floor((w.endSec || 0) / 60);
      return `【段 ${i + 1}】(${startMin}分-${endMin}分, ${w.reason || ''})\n${w.quoteParagraph || ''}`;
    }).join('\n\n');
    const info = `## 播客整体信息\n一句话概括：${oneSentence}\n核心观点：${corePoints}`;
    const segTail = `\n\n## 核心段落\n${passages}`;

    // ── A: steps + actions (thinking-enabled, 需思辨深度) ──
    const promptA = `${info}

## 任务
只生成 steps(6步) + actions(三档), 不要其他字段。
- steps 6 步固定: 背景理解/核心观点/案例与证据/方法论提炼/批判性思考/我的应用。批判性思考要真思辨(归因/边界/反方)。
  **来源诚实(关键)**: 若某步(尤其"案例与证据")引用了播客里**明确说过的具体案例/事实/数据**, 在该步加 sourceQuote(逐字摘一句原话, ≤30字); 若该步内容是你**综合归纳/推断**的(原文没直说), sourceQuote 留空("")——后端据此标"AI 归纳", 不冒充权威事实。宁缺毋编。
- actions: today/week/longterm 三档必填, 主题分散, 具体可执行。
严格 JSON: {"steps":[{"title","content","timestamp","sourceQuote":""}],"actions":{"today","week","longterm"}}。只要 JSON。${segTail}`;

    // ── B: concepts + frameworkCards + recallQuestions (thinking-disabled, 抽取/归纳类) ──
    const promptB = `${info}

## 任务
只生成 concepts + frameworkCards + recallQuestions, 不要其他字段。
- concepts: 只选真正需解释的专有名词/框架(≤6个, term≤12字), 禁把观点/常识当概念。plain 两句式(通用定义+回扣本集)。
- frameworkCards(0-3张): 提炼**横跨全集的大框架/对比/分类**(逐段摘录抓不到的全局结构)。每张: insight(≤25字)+context(3-5句)。**综合归纳, quote 留空("")**, 不冒充原话。无则返回 []。
- recallQuestions(2-4题): **开放式**问题测对本集核心的理解。每题: question(引导回忆/复述)+ modelAnswer(2-4句参考答案)。能让人"合上原文自己讲一遍"。
严格 JSON: {"concepts":[{"term","plain","context":{"text","timestamp"},"related"}],"frameworkCards":[{"insight","context","quote":""}],"recallQuestions":[{"question","modelAnswer"}]}。只要 JSON。${segTail}`;

    const [resA, resB] = await Promise.all([
      callGlm({
        systemPrompt: PACK_PROMPT, userPrompt: promptA, callType: 'glm.pack.generate.deep',
        model: GLM_MODEL, temperature: 0.5, maxTokens: GLM_MAX_TOKENS, context,
        thinking: { type: 'enabled' }, responseFormat: { type: 'json_object' },
      }),
      callGlm({
        systemPrompt: PACK_PROMPT, userPrompt: promptB, callType: 'glm.pack.generate.deep.extract',
        model: GLM_MODEL, temperature: 0.4, maxTokens: GLM_MAX_TOKENS, context,
        thinking: { type: 'disabled' }, responseFormat: { type: 'json_object' },
      }),
    ]);
    const jA = resA.json || {}, jB = resB.json || {};
    steps = Array.isArray(jA.steps) ? jA.steps : [];
    actions = (jA.actions && typeof jA.actions === 'object') ? jA.actions : {};
    concepts = Array.isArray(jB.concepts) ? jB.concepts : [];
    // #77 主动回忆: AI 出的开放式回忆问题 + 参考答案 (2-4 题)
    recallQuestions = Array.isArray(jB.recallQuestions)
      ? jB.recallQuestions.slice(0, 4)
          .map(q => ({ question: String(q.question || '').trim(), modelAnswer: String(q.modelAnswer || '').trim() }))
          .filter(q => q.question)
      : [];
    if (onProgress) onProgress({ progress: 92, message: '✨ 整理中' });
    // 若分块没出卡(无segs兜底), 用 A 调用可能带的 cards
    if (!cards.length && Array.isArray(jA.cards)) cards = jA.cards;
    // R27: 全局框架卡(跨段大框架, 逐段摘录抓不到) 放最前 —— quote 空(综合归纳, 前端不打引号)
    if (Array.isArray(jB.frameworkCards) && jB.frameworkCards.length) {
      const fw = jB.frameworkCards.slice(0, 3).map(f => ({
        quote: '', quoteVerified: false,
        insight: f.insight || '', context: f.context || '', timestamp: null,
      }));
      cards = [...fw, ...cards];
    }
  }

  const pack = { steps, concepts, cards, actions, recallQuestions };

  // R25 Bug#0 (致命): 卡片 quote 校验 + timestamp 锚定。分块已从真实原文摘, 这里再兜底校验:
  //   - quote 在转录找得到 → 真实定位改 timestamp + quoteVerified=true (可打引号)
  //   - 找不到(改写过头) → quoteVerified=false, 前端不打引号不冒充原话
  if (hasSegs && Array.isArray(pack.cards)) {
    for (const c of pack.cards) {
      const q = c.quote || '';
      const realStart = findQuoteRealStart(q, segments);
      if (realStart !== null) {
        c.timestamp = realStart;
        c.quoteVerified = true;
      } else {
        c.quoteVerified = false;
      }
    }
  }
  // concept context.timestamp 锚定到真实转录位置
  if (hasSegs && Array.isArray(pack.concepts)) {
    for (const cc of pack.concepts) {
      const ctxText = (cc.context && typeof cc.context === 'object') ? cc.context.text : '';
      const realStart = findQuoteRealStart(ctxText, segments);
      if (realStart !== null && cc.context && typeof cc.context === 'object') {
        cc.context.timestamp = realStart;
      }
    }
  }
  // #88: step 来源溯源。GLM 给的 sourceQuote 在转录里逐字找得到 → 绑真实 segment(可溯源);
  //   找不到(AI 归纳/推断) → 无 citation → 前端标"AI 归纳", 不冒充权威事实。
  if (hasSegs && Array.isArray(pack.steps)) {
    for (const st of pack.steps) {
      const sq = st.sourceQuote || '';
      const segId = sq ? findQuoteSegmentId(sq, segments) : null;
      st.citations = segId != null ? [{ segmentId: segId }] : [];
    }
  }

  // R26: 卡片按 timestamp 升序排 (分块并行合并后顺序可能倒挂, 真实用户发现 1979 排在 1867 前)
  if (Array.isArray(pack.cards)) {
    pack.cards.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
  }

  return {
    pack,
    glmModel: GLM_MODEL,
    promptVersion: PROMPT_VERSION,
    mode,
    latencyMs: Date.now() - startedAt,
    inputTokens: null,
    outputTokens: null,
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
