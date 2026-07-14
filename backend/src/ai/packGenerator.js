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
const PROMPT_VERSION = 'v11';

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

// ── R61/R62 GLM 全局节流闸门(令牌桶, 非并发数) ──────────────────────────────
// 根因(查智谱官方文档确认): K0 用 coding-plan endpoint(/api/coding), 限流是"高负载动态排队+瞬时限流",
//   限的是**瞬时突发到达率**, 不是稳态额度(Lite 80次/5h 对单篇~26请求够用)。
//   同一秒齐发 6 个 → 撞动态限流 → 429。降并发数没用到根上, 只要还有同秒齐发就触发。
// 正解: 单飞(concurrency=1) + 令牌桶(每 GLM_MIN_INTERVAL_MS 放行一个) → 请求拉成均匀"人类节奏"流,
//   从物理上消除突发 → 永远不 429。不降级(只用 glm-5.2)。
const GLM_MAX_CONCURRENCY = Math.max(1, parseInt(process.env.GLM_MAX_CONCURRENCY || '1', 10));
const GLM_MIN_INTERVAL_MS = Math.max(0, parseInt(process.env.GLM_MIN_INTERVAL_MS || '800', 10));
let glmInFlight = 0;
const glmWaitQueue = [];
let glmLastStart = 0;
async function withGlmSlot(fn) {
  if (glmInFlight >= GLM_MAX_CONCURRENCY) {
    await new Promise(resolve => glmWaitQueue.push(resolve));
  }
  glmInFlight++;
  // 令牌桶: 距上一个请求发起 < 间隔 → 补等, 保证请求均匀放行(消除瞬时突发)。
  const since = Date.now() - glmLastStart;
  if (since < GLM_MIN_INTERVAL_MS) await sleep(GLM_MIN_INTERVAL_MS - since);
  glmLastStart = Date.now();
  try {
    return await fn();
  } finally {
    glmInFlight--;
    const next = glmWaitQueue.shift();
    if (next) next();
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// R61/R62 429 退避: 撞 429 先对 glm-5.2 退避重试(智谱 coding-plan 429 是软限流, 几秒恢复),
//   优先读 Retry-After header。**不降级到 flash**(Frank: 只用 glm-5.2, 降级质量太差)。
const GLM_429_BACKOFFS = [1500, 4000, 9000, 15000];   // 4 次退避(+抖动), 只用主模型不降级

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
  // R62: Frank 要求只用 glm-5.2, 永不降级(flash 质量太差)。tryModels 恒 = [glm-5.2],
  //   靠退避重试(最多 4 次, 读 Retry-After)扛过 429, 不掉低质模型。
  const tryModels = [preferred];

  let response, body, latencyMs, parseOk, usedModel;
  for (let i = 0; i < tryModels.length; i++) {
    const m = tryModels[i];
    usedModel = m;
    // R62: 撞 429 对 glm-5.2 退避重试(读 Retry-After), 不降级。每次请求走全局节流闸门 withGlmSlot。
    for (let attempt = 0; ; attempt++) {
      ({ response, body, latencyMs, parseOk } = await withGlmSlot(() => loggedFetch({
        callType: attempt === 0 ? callType : `${callType}.retry429`,
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
      })));
      if (response.ok || response.status !== 429) break;
      // 429: 退避重试同一模型(不降级)。优先读 Retry-After(秒), 否则用退避阶梯。
      if (attempt < GLM_429_BACKOFFS.length) {
        let wait = GLM_429_BACKOFFS[attempt] + Math.floor(Math.random() * 500);
        try {
          const ra = response.headers?.get?.('retry-after');
          if (ra) { const s = parseInt(ra, 10); if (Number.isFinite(s) && s > 0) wait = Math.max(wait, s * 1000); }
        } catch {}
        console.warn(`[packGenerator] ${m} 429, 退避重试 ${attempt + 1}/${GLM_429_BACKOFFS.length} (${wait}ms)`);
        await sleep(wait);
        continue;
      }
      break;   // 退避用尽仍 429 (罕见): 抛错, 不降级到低质模型
    }

    if (response.ok) break;
    break;   // 只用 glm-5.2, 无降级链
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
      // 重试一次同 model (R61: 也走全局并发闸门)
      const retryResult = await withGlmSlot(() => loggedFetch({
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
      }));
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

  // R60 两路并行:
  //   路径B(全局): oneSentence/价值分/audience/corePoints —— 需全局视角, 一次全文调用(现有 SNAPSHOT_PROMPT)。
  //   路径A(分段): worthListening/skippable —— chunkSegments 分块并行抽取合并, 长博客出 8-12 段不被截断。
  //   合并: 全局字段用 B, worthListening/skippable 用 A(覆盖 B 里可能被截断的少量)。
  const [globalResult, chunkedWorth] = await Promise.all([
    callGlm({
      systemPrompt: SNAPSHOT_PROMPT,
      userPrompt,
      callType: 'glm.snapshot.generate',
      model: GLM_MODEL,
      temperature: 0.3,
      maxTokens: GLM_MAX_TOKENS,
      context,
      thinking: { type: 'disabled' },
      responseFormat: { type: 'json_object' },
    }),
    generateWorthChunked({ segments, context }),
  ]);

  // 全局字段来自 B; 值得听/可跳过来自 A(分段, 更全)。
  const snapshot = { ...(globalResult.json || {}) };
  snapshot.worthListening = chunkedWorth.worthListening;
  snapshot.skippable = chunkedWorth.skippable;

  // Sprint 16 R5: 时间戳后处理 —— 用 quote 第一句在 transcript 里搜真实 start
  // 修 GLM 给的 startSec 落在段落中间的问题，保证音频播放位置=quote 第一个字
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
    inputTokens: globalResult.inputTokens,
    outputTokens: globalResult.outputTokens,
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
  if (cleaned.length < 8) return null;

  // R39 (Frank 真机发现"读空气"锚到 2:00 错位): 根因是旧逻辑「外层 segment、内层 needle 降级」
  //   → 对每段依次试 [长,短] needle, 某段短 needle 命中就返回。当 quote 开头是常见短语
  //   (如"我觉得四川人")时, 长 needle 跨段找不到 → 降级到 6 字 → 命中转录里最早出现该前缀的
  //   段(2:00"我觉得四川人都很神"), 而真身("我觉得四川人不存在读空气")在 37:52 被跳过。
  //   修复: 改为「外层 needle 从长到短、内层扫全部 segment 的所有 tier」。长 needle 扫完所有段
  //   都没命中, 才降级。这样最精确(最长)匹配优先于最早位置。且 needle 下限提到 8 字(6 字太短=泛滥)。
  //
  // needle 阶梯: 尽量长的前缀优先。用完整清洗串 + 逐级缩短, 最短 8 字。
  const needles = [];
  const lens = [cleaned.length, 24, 20, 16, 12, 10, 8];
  const seen = new Set();
  for (const L of lens) {
    if (L < 8 || L > cleaned.length) continue;
    const n = cleaned.slice(0, L);
    if (!seen.has(n)) { seen.add(n); needles.push(n); }
  }

  // 预拼: Tier1 字级字流 (每段) + Tier3 跨段全局串 (一次性, 复用)
  let concat = '';
  const charStart = [];   // charStart[i] = 第 i 个清洗字符所属 segment 的 start
  for (const seg of segments) {
    const c = strip(seg.text);
    for (let k = 0; k < c.length; k++) charStart.push(seg.start);
    concat += c;
  }

  // 外层: needle 从长到短。每个 needle 扫完 Tier1(字级)→Tier2(单段插值)→Tier3(跨段), 命中即返回。
  for (const needle of needles) {
    // ─ Tier 1: 字级 words 精确定位 (有 words 的段) ─
    for (const seg of segments) {
      const words = Array.isArray(seg.words) ? seg.words : null;
      if (!words || words.length === 0) continue;
      const chars = [];
      for (const w of words) {
        const label = String(w.label || '');
        for (const ch of label) {
          if (/[""''""''、，。！？,.\s]/.test(ch)) continue;
          chars.push({ ch, start: typeof w.start === 'number' ? w.start : (w.start_time || 0) / 1000 });
        }
      }
      if (chars.length === 0) continue;
      const charStr = chars.map(c => c.ch).join('');
      const idx = charStr.indexOf(needle);
      if (idx >= 0) return Math.round(chars[idx].start * 100) / 100;
    }
    // ─ Tier 2: 无 words, 单段字符比例插值 ─
    for (const seg of segments) {
      const segClean = strip(seg.text);
      if (segClean.length === 0) continue;
      const pos = segClean.indexOf(needle);
      if (pos >= 0) {
        const ratio = pos / segClean.length;
        const dur = (seg.end || seg.start) - seg.start;
        return Math.round((seg.start + dur * ratio) * 100) / 100;
      }
    }
    // ─ Tier 3: 跨段拼接 (quote 横跨多段) ─
    const idx = concat.indexOf(needle);
    if (idx >= 0 && charStart[idx] != null) return Math.round(charStart[idx] * 100) / 100;
  }

  return null;
}

// #88: 找 quote 逐字出现的 segment id (用于 step citation 溯源)。找不到返回 null。
//   R39: 与 findQuoteRealStart 同修 — needle 外层从长到短、内层扫全段, 避免短前缀先命中错误早段。
function findQuoteSegmentId(quote, segments) {
  if (!quote || !segments || segments.length === 0) return null;
  const strip = (s) => String(s || '').replace(/[""''""''、，。！？,.\s]+/g, '');
  const cleaned = strip(quote);
  if (cleaned.length < 8) return null;
  const needles = [];
  const seen = new Set();
  for (const L of [cleaned.length, 24, 20, 16, 12, 10, 8]) {
    if (L < 8 || L > cleaned.length) continue;
    const n = cleaned.slice(0, L);
    if (!seen.has(n)) { seen.add(n); needles.push(n); }
  }
  // 跨段拼接串 (一次性)
  let concat = '';
  const charSeg = [];
  for (const seg of segments) {
    const c = strip(seg.text);
    for (let k = 0; k < c.length; k++) charSeg.push(seg.id != null ? seg.id : null);
    concat += c;
  }
  for (const needle of needles) {
    // 单段精确
    for (const seg of segments) {
      if (seg.id == null) continue;
      if (strip(seg.text).indexOf(needle) >= 0) return seg.id;
    }
    // 跨段
    const idx = concat.indexOf(needle);
    if (idx >= 0 && charSeg[idx] != null) return charSeg[idx];
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

// R60 快照分段: 把长转录切块并行抽"值得听/可跳过", 各块合并去重 → 长博客自然出 8-12 段,
//   不再被单次调用 8192 token 上限截断(旧: 4.4万字整篇一次调用只出 3 段)。
const CHUNK_WORTH_PROMPT = `你是苛刻的中文播客学习总监。下面是一集播客其中一段转录(带时间戳秒数)。

任务: 从**本段**里挑出最值得听的片段(每段满足以下至少2条): ①信息密度(含2+非常识事实) ②反常识(挑战默认认知) ③可行动(听完能立刻做/试/避) ④可迁移(方法能用到别处) ⑤原创(嘉宾自己想的)。同时标出可跳过的片段(广告/寒暄/重复/跑题)。

**本段最多挑 2 段值得听**(宁缺毋滥, 本段全是水就返回空数组)。可跳过 0-2 段。

严格输出 JSON: {"worthListening":[{"startSec":该片段开始秒数(整数,用转录里的时间),"endSec":结束秒数,"reason":"为什么值得听(15-30字)","quoteParagraph":"从本段转录逐字截取的连续原文 150-400字(保留上下文完整)"}],"skippable":[{"startSec":秒,"endSec":秒,"reason":"为什么可跳(一句话)"}]}

铁律: quoteParagraph 必须能在下面转录里逐字找到, 绝不编造/改写。全部中文。只要 JSON, 不要解释。`;

/**
 * R60 快照分段抽取 worthListening + skippable。
 * chunkSegments 切块 → runLimited 并发3 → 每块抽 → 合并 + 按 startSec 排序 + quoteParagraph 去重。
 * @returns {Promise<{ worthListening: any[], skippable: any[] }>}
 */
async function generateWorthChunked({ segments, context = {} }) {
  const blocks = chunkSegments(segments);
  const genBlock = async (block, idx) => {
    const userPrompt = `转录片段 (${Math.floor(block.start / 60)}分-${Math.floor(block.end / 60)}分):\n\n`
      + block.segs.map(s => `[${Math.floor(s.start)}s] ${s.text}`).join('\n');
    try {
      const result = await callGlm({
        systemPrompt: CHUNK_WORTH_PROMPT,
        userPrompt,
        callType: 'glm.snapshot.worth.chunk',
        model: GLM_MODEL,
        temperature: 0.3,
        maxTokens: 3500,   // 块小(≤2500字), 3500 足够 2 段值得听+引用, 不撞顶
        context: { ...context, chunk: idx },
        thinking: { type: 'disabled' },
        responseFormat: { type: 'json_object' },
      });
      return {
        worth: Array.isArray(result.json?.worthListening) ? result.json.worthListening : [],
        skip: Array.isArray(result.json?.skippable) ? result.json.skippable : [],
      };
    } catch (e) {
      console.warn(`[worthChunked] block ${idx} failed:`, e?.message);
      return { worth: [], skip: [] };
    }
  };
  const perBlock = await runLimited(blocks, 3, genBlock);
  const worthAll = [];
  const skipAll = [];
  for (const b of perBlock) { for (const w of b.worth) worthAll.push(w); for (const s of b.skip) skipAll.push(s); }
  // 去重: quoteParagraph 前40字相同视为重复(相邻块偶有重叠); 按 startSec 排序。skippable 按起点秒去重, 上限4段。
  const worthListening = arrDedupeSort(worthAll, w => String(w.quoteParagraph || w.reason || '').replace(/\s/g, '').slice(0, 40));
  const skippable = arrDedupeSort(skipAll, s => `${Math.round(Number(s.startSec) || 0)}`).slice(0, 4);
  return { worthListening, skippable };
}

// 去重+排序小工具(独立 seen, 避免 worth/skip 互相污染)
function arrDedupeSort(arr, keyFn) {
  const seen = new Set();
  return arr
    .filter(x => { const k = keyFn(x); if (!k || seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (Number(a.startSec) || 0) - (Number(b.startSec) || 0));
}

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
        // 提质(Lite额度充足): 2000→3500, 消除 quote+insight+context 撞顶被截断走 salvage 的顽疾。
        //   块本身小(≤2500字/6min), 提上限几乎不多花 token, 纯质量收益。
        maxTokens: 3500,
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
  // R37 提质: 卡片跨块去重 (逐块独立生成 → 相邻块常出雷同卡, 如"及格就好""成都包容"重复多张)。
  //   付费用户两次评测都点名"注水/重复"为最大短板。这里跑一次廉价合并пасс(thinking-disabled)。
  const deduped = await dedupeCards(all, { context, maxCards });
  return deduped.slice(0, maxCards);
}

// R37 卡片去重合并: 输入原始卡数组, 让模型标出"实质讲同一点"的重复组, 每组只保留信息最全的一张。
//   纯抽取任务, 关思考。失败/超时静默返回原数组 (绝不因去重失败丢卡)。
async function dedupeCards(cards, { context = {}, maxCards = 18 } = {}) {
  if (!Array.isArray(cards) || cards.length <= 6) return cards; // 太少不必去重
  try {
    // 只把 insight+context 给模型判重 (quote 不参与判断, 省 token)
    const brief = cards.map((c, i) => ({
      i,
      insight: String(c.insight || '').slice(0, 40),
      context: String(c.context || '').slice(0, 120),
    }));
    const prompt = `下面是从一集播客逐段抽取的知识卡片(可能有重复——相邻段落常抽出讲同一个点的卡)。
## 任务
找出**实质在讲同一个观点/论据**的重复组, 每组只保留信息最全/最犀利的一张, 其余剔除。
- 判重标准: 两张卡的核心洞见是否同一件事(如都在讲"考试及格就好的教育观", 或都在讲"成都人不管闲事的包容")。措辞不同但内核相同 = 重复。
- 不同侧面/不同论据 = 不重复, 都保留。
- 保守起见, 只合并**明确重复**的; 拿不准就都留。
- 目标保留 ${Math.min(maxCards, 14)} 张以内高质量、无重复的卡。
输出保留下来的卡的原始序号(i)数组, 按原顺序。
严格 JSON: {"keep":[序号数组]}。只要 JSON。

卡片列表:
${JSON.stringify(brief)}`;
    const result = await callGlm({
      systemPrompt: '你是严格的知识编辑, 擅长识别重复内容。',
      userPrompt: prompt,
      callType: 'glm.pack.cards.dedupe',
      model: GLM_MODEL,
      temperature: 0.2,
      maxTokens: 800,
      context,
      thinking: { type: 'disabled' },
      responseFormat: { type: 'json_object' },
    });
    const keep = result?.json?.keep;
    if (Array.isArray(keep) && keep.length > 0) {
      const idxSet = new Set(keep.map(Number).filter(n => Number.isInteger(n) && n >= 0 && n < cards.length));
      // 安全阈: 去重后至少保留一半, 否则视为模型误判, 用原数组 (防过度删卡)
      if (idxSet.size >= Math.ceil(cards.length / 2)) {
        return cards.filter((_, i) => idxSet.has(i));
      }
    }
  } catch (e) {
    // 静默: 去重失败保留原卡
  }
  return cards;
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

    // ── B1: concepts (纯术语抽取, thinking-disabled, 快) ──
    const promptB1 = `${info}

## 任务
只生成 concepts, 不要其他字段。
- concepts: 抽 **6-8 个**本集真正需要解释的概念(term≤12字)。**务必覆盖**这几类, 别只挑最浅的:
  ① 专有名词/学术概念/理论(如"高低语境文化""齐物论")——若嘉宾提到某现象背后有更专业的学术名, 用学术名并点明;
  ② 历史人物/典故(如"卓文君典故")——讲清这个人/事本身, 别默认用户已知;
  ③ 关键哲学/文化概念(如"无为而治""母系社会")。
  **自检**: 若你在核心观点/回忆题里引用了某个概念(如某历史人物、某哲学思想), 它就该在这里立卡, 别自相矛盾漏掉。
  仅排除纯观点句和路人皆知的常识。plain 两句式(通用定义+回扣本集), related 写它与本集其他概念的关联。
严格 JSON: {"concepts":[{"term","plain","context":{"text","timestamp"},"related"}]}。只要 JSON。${segTail}`;

    // ── B2: frameworkCards + recallQuestions (归纳/出题, thinking-ENABLED) ──
    //   提质(Lite额度充足): 框架卡=横跨全集的归纳推理(逐段抓不到的全局结构), 回忆题=要出好问题,
    //   二者本质是推理任务, 关思考等于让模型盲猜 → 单独拆出开 thinking。
    const promptB2 = `${info}

## 任务
只生成 frameworkCards + recallQuestions, 不要其他字段。
- frameworkCards(0-3张): 提炼**横跨全集的大框架/对比/分类**(逐段摘录抓不到的全局结构)。每张: insight(≤25字)+context(3-5句)。**综合归纳, quote 留空("")**, 不冒充原话。无则返回 []。
- recallQuestions(2-4题): **开放式**问题测对本集核心的理解。每题: question(引导回忆/复述)+ modelAnswer(2-4句参考答案)。能让人"合上原文自己讲一遍"。
严格 JSON: {"frameworkCards":[{"insight","context","quote":""}],"recallQuestions":[{"question","modelAnswer"}]}。只要 JSON。${segTail}`;

    // QA must-fix: allSettled 而非 all —— 一路失败(429/超时)不拖垮其余, 与卡片分块降级语义一致。
    //   A→steps/actions; B1→concepts; B2→框架卡/回忆题。任一失败该字段空, 至少出可用包。
    const [setA, setB1, setB2] = await Promise.allSettled([
      callGlm({
        systemPrompt: PACK_PROMPT, userPrompt: promptA, callType: 'glm.pack.generate.deep',
        model: GLM_MODEL, temperature: 0.5, maxTokens: GLM_MAX_TOKENS, context,
        thinking: { type: 'enabled' }, responseFormat: { type: 'json_object' },
      }),
      callGlm({
        systemPrompt: PACK_PROMPT, userPrompt: promptB1, callType: 'glm.pack.generate.deep.extract',
        model: GLM_MODEL, temperature: 0.4, maxTokens: GLM_MAX_TOKENS, context,
        thinking: { type: 'disabled' }, responseFormat: { type: 'json_object' },
      }),
      callGlm({
        systemPrompt: PACK_PROMPT, userPrompt: promptB2, callType: 'glm.pack.generate.deep.synth',
        model: GLM_MODEL, temperature: 0.5, maxTokens: GLM_MAX_TOKENS, context,
        thinking: { type: 'enabled' }, responseFormat: { type: 'json_object' },
      }),
    ]);
    if (setA.status === 'rejected') aiLog.warn({ err: setA.reason?.message }, 'deep_call_A_failed(steps/actions)');
    if (setB1.status === 'rejected') aiLog.warn({ err: setB1.reason?.message }, 'deep_call_B1_failed(concepts)');
    if (setB2.status === 'rejected') aiLog.warn({ err: setB2.reason?.message }, 'deep_call_B2_failed(framework/recall)');
    const jA = (setA.status === 'fulfilled' ? setA.value.json : null) || {};
    const jB1 = (setB1.status === 'fulfilled' ? setB1.value.json : null) || {};
    const jB2 = (setB2.status === 'fulfilled' ? setB2.value.json : null) || {};
    steps = Array.isArray(jA.steps) ? jA.steps : [];
    actions = (jA.actions && typeof jA.actions === 'object') ? jA.actions : {};
    concepts = Array.isArray(jB1.concepts) ? jB1.concepts : [];
    // #77 主动回忆: AI 出的开放式回忆问题 + 参考答案 (2-4 题)
    recallQuestions = Array.isArray(jB2.recallQuestions)
      ? jB2.recallQuestions.slice(0, 4)
          .map(q => ({ question: String(q.question || '').trim(), modelAnswer: String(q.modelAnswer || '').trim() }))
          .filter(q => q.question)
      : [];
    if (onProgress) onProgress({ progress: 92, message: '✨ 整理中' });
    // 若分块没出卡(无segs兜底), 用 A 调用可能带的 cards
    if (!cards.length && Array.isArray(jA.cards)) cards = jA.cards;
    // R27: 全局框架卡(跨段大框架, 逐段摘录抓不到) 放最前 —— quote 空(综合归纳, 前端不打引号)
    if (Array.isArray(jB2.frameworkCards) && jB2.frameworkCards.length) {
      const fw = jB2.frameworkCards.slice(0, 3).map(f => ({
        quote: '', quoteVerified: false,
        insight: f.insight || '', context: f.context || '', timestamp: null,
      }));
      cards = [...fw, ...cards];
    }

    // ── P1 提质: 精学 self-critique 自审一轮 (Lite额度充足, 该花) ──
    //   把"一次生成"升级为"生成→自审→修正": 让模型审自己的 steps —
    //     ① 批判性思考步是否真思辨(有归因/边界/反方), 还是空泛复述?
    //     ② 案例与证据步有无遗漏播客里真实讲过的一手故事/数据? (#76 遗留)
    //     ③ 各步 sourceQuote 诚实性 (综合归纳的别冒充原话)
    //   只审 steps (最吃深度的部分); 失败/超时静默保留原 steps, 绝不拖垮主流程。
    if (steps.length >= 4) {
      try {
        if (onProgress) onProgress({ progress: 94, message: '✨ 自审打磨' });
        const stepsJson = JSON.stringify(steps);
        const critiquePrompt = `${info}

## 已生成的学习步骤 (待自审)
${stepsJson}

## 自审任务
你是严格的知识编辑, 审上面 steps 并**只输出修正后的完整 steps JSON**。检查并改进:
1. "批判性思考"步: 是否真思辨(有归因/边界条件/反方视角)? 若只是复述观点 → 重写成真正的批判(这个论断在什么情况下不成立? 反对者会怎么说?)。
2. "案例与证据"步: 对照下方核心段落, 有无**遗漏播客里明确讲过的具体案例/人名/数据/故事**? 有则补进 content, 并在 sourceQuote 逐字摘一句原话(≤30字)。
3. "方法论提炼"步: **不要轻易写"无方法论"**。即使是叙事类内容, 也常能提炼可迁移的思维工具(如"换参照系降低焦虑""区分内驱力vs恐惧驱动""用边界感减少内耗")。只有当内容纯属信息罗列、确实无任何可迁移方法时才写"无"; 否则必须提炼出 1-3 条听众能用的方法。
4. sourceQuote 诚实性: 若某步内容是综合归纳(原文没直说), sourceQuote 必须留空(""), 不冒充原话。
5. 保持 6 步结构与 title 不变, 只改 content/sourceQuote/timestamp。
严格 JSON: {"steps":[{"title","content","timestamp","sourceQuote":""}]}。只要 JSON。${segTail}`;
        const critique = await callGlm({
          systemPrompt: PACK_PROMPT, userPrompt: critiquePrompt, callType: 'glm.pack.generate.deep.critique',
          model: GLM_MODEL, temperature: 0.4, maxTokens: GLM_MAX_TOKENS, context,
          thinking: { type: 'enabled' }, responseFormat: { type: 'json_object' },
        });
        const revised = critique?.json?.steps;
        if (Array.isArray(revised) && revised.length === steps.length) {
          steps = revised;
          aiLog.info({ event: 'deep_self_critique_applied', ...(context?.jobId ? { jobId: context.jobId } : {}) }, '精学自审已应用');
        }
      } catch (e) {
        aiLog.warn({ err: String(e?.message || e) }, 'deep_self_critique_failed(保留原steps)');
      }
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
