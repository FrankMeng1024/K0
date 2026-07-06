// K0 backend - GLM 学习包生成 v2 (Sprint 6)
// - 用 glm-5.2 + Coding Plan Lite endpoint
// - 三语言分支 (zh/en/mixed)
// - 方案 B: 章节标记 + 分布约束 + runtime 兜底
// - AI 调用审计

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loggedFetch } from './aiLogger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GLM_BASE_URL = process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2';
const GLM_MAX_TOKENS = parseInt(process.env.GLM_MAX_TOKENS || '8192', 10);
const PROMPT_VERSION = 'v2';

const PROMPT_MD = readFileSync(join(__dirname, '../../prompts/generate-pack-v2.md'), 'utf8');

/**
 * 从 prompt markdown 提取指定语言的 System Prompt
 * Markdown 结构：
 *   ## 中文播客 (zh)
 *   ## System Prompt
 *   ```
 *   ...prompt content...
 *   ```
 *   ## 英文播客 (en)
 *   ...
 */
function loadSystemPrompt(lang) {
  const headings = {
    zh: '## 中文播客 (zh)',
    en: '## 英文播客 (en)',
    mixed: '## 中英混合播客 (mixed)',
  };
  const marker = headings[lang] || headings.zh;
  const idx = PROMPT_MD.indexOf(marker);
  if (idx === -1) throw new Error(`Prompt heading not found: ${marker}`);
  // 从 marker 开始截取到下一个语言 heading 或文件末尾
  let nextMarker = -1;
  for (const otherMarker of Object.values(headings)) {
    if (otherMarker === marker) continue;
    const p = PROMPT_MD.indexOf(otherMarker, idx + marker.length);
    if (p !== -1 && (nextMarker === -1 || p < nextMarker)) nextMarker = p;
  }
  const section = nextMarker === -1 ? PROMPT_MD.slice(idx) : PROMPT_MD.slice(idx, nextMarker);
  // 在 section 里找第一个 ```...``` 代码块
  const codeBlockMatch = section.match(/```\s*\n([\s\S]*?)\n```/);
  if (!codeBlockMatch) throw new Error(`No code block in prompt section: ${lang}`);
  return codeBlockMatch[1].trim();
}

/**
 * 把 transcript segments 拼接为带章节标记的文本（方案 B）
 * 每 15 分钟一个章节标记
 */
function segmentsWithChapters(segments) {
  if (!segments.length) return '';

  const CHAPTER_SECS = 15 * 60;
  const totalDur = segments[segments.length - 1].end;
  const totalChapters = Math.ceil(totalDur / CHAPTER_SECS);

  const lines = [];
  let currentChapter = -1;
  for (const s of segments) {
    const chapterIdx = Math.floor(s.start / CHAPTER_SECS);
    if (chapterIdx !== currentChapter) {
      currentChapter = chapterIdx;
      const startMin = chapterIdx * 15;
      const endMin = Math.min((chapterIdx + 1) * 15, Math.ceil(totalDur / 60));
      lines.push('');
      lines.push(`=== [章节 ${chapterIdx + 1}/${totalChapters}: ${startMin}-${endMin}min] ===`);
    }
    lines.push(`[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`);
  }
  return lines.join('\n');
}

/**
 * 检查 pack 的 6 个 steps 是否分布在至少 4 个不同 15min 章节
 */
function checkChapterCoverage(pack, totalDur) {
  const CHAPTER_SECS = 15 * 60;
  const chapters = new Set();
  for (const step of (pack.steps || [])) {
    if (typeof step.sourceTimestamp === 'number') {
      chapters.add(Math.floor(step.sourceTimestamp / CHAPTER_SECS));
    }
  }
  const totalChapters = Math.ceil(totalDur / CHAPTER_SECS);
  const requiredChapters = Math.min(4, totalChapters);
  return chapters.size >= requiredChapters;
}

/**
 * 调 GLM 生成学习包（可能带 retry + 模型降级 fallback + 冷却窗口）
 * Sprint 10 v14: 加 429 指数退避重试
 * Sprint 10 v15: 429 时按 fallback 链降级模型（glm-5.2 → glm-4.5-air → glm-4-flash）
 *   智谱账号是 TPM (每分钟 tokens) 限流，同 key 换模型 = 独立配额，能立即绕开
 * Sprint 10 v16: 首选模型 429 后进入冷却窗口 5 分钟，期间直接用 fallback，避免每次都 1 次浪费请求
 */
const MODEL_FALLBACK_CHAIN = ['glm-4.5-air', 'glm-4-flash']; // 首选模型 429 后依次尝试
const COOLDOWN_MS = 5 * 60 * 1000; // 首选模型 429 后冷却 5 分钟

// 每个 model 的冷却结束时间戳（进程内存，重启清零）
const modelCooldown = new Map();

function isCoolingDown(model) {
  const until = modelCooldown.get(model);
  return typeof until === 'number' && Date.now() < until;
}

function markCooldown(model) {
  modelCooldown.set(model, Date.now() + COOLDOWN_MS);
  console.warn(`[packGenerator] Model ${model} entered cooldown for ${COOLDOWN_MS / 60000}min`);
}

async function callGlm({ systemPrompt, transcriptText, goal, model, temperature, maxTokens, context }) {
  const userMsg = `以下是播客文字转录（含时间戳和 15 分钟章节标记）。学习目标：${goal}\n\n${transcriptText}`;

  const buildBody = (m) => ({
    model: m,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    temperature,
    max_tokens: maxTokens,
  });

  // 尝试链：首选模型 + fallback 链
  // 若首选正在冷却，跳过直接从 fallback 开始
  const preferred = model;
  const preferredCooling = isCoolingDown(preferred);
  const tryModels = preferredCooling
    ? MODEL_FALLBACK_CHAIN.filter(m => m !== preferred)
    : [preferred, ...MODEL_FALLBACK_CHAIN.filter(m => m !== preferred)];

  if (preferredCooling) {
    console.warn(`[packGenerator] ${preferred} in cooldown, skipping to fallback chain`);
  }

  let response, body, latencyMs, parseOk, usedModel;

  for (let i = 0; i < tryModels.length; i++) {
    const m = tryModels[i];
    usedModel = m;

    ({ response, body, latencyMs, parseOk } = await loggedFetch({
      callType: i === 0 && !preferredCooling
        ? 'glm.pack.generate'
        : `glm.pack.generate.fallback.${m}`,
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
      if (m !== preferred) {
        console.warn(`[packGenerator] Used fallback model ${m} (preferred ${preferred} unavailable)`);
      }
      break;
    }

    // 非 429 = 直接抛，不换模型（例如 500/timeout 换模型也没用）
    if (response.status !== 429) {
      break;
    }

    // 429 → 该模型进入冷却，继续下一个 fallback
    markCooldown(m);
    if (i < tryModels.length - 1) {
      console.warn(`[packGenerator] ${m} 429, falling back to ${tryModels[i + 1]}`);
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
  let pack = null;
  try {
    const cleaned = content.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    pack = JSON.parse(cleaned);
  } catch (e) {
    // 尝试 salvage：常见 GLM 错误 (未闭合引号 / 尾随逗号 / 多余文本)
    try {
      let salvaged = content.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      // 去除首尾非 JSON 字符（比如 "Here is..."）
      const firstBrace = salvaged.indexOf('{');
      const lastBrace = salvaged.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        salvaged = salvaged.slice(firstBrace, lastBrace + 1);
      }
      // 去除尾随逗号 (,}  ,])
      salvaged = salvaged.replace(/,(\s*[}\]])/g, '$1');
      pack = JSON.parse(salvaged);
    } catch (e2) {
      throw Object.assign(new Error(`GLM_MALFORMED_JSON: ${e.message}`), {
        code: 'GLM_MALFORMED_JSON',
        rawContent: content.slice(0, 500),
      });
    }
  }

  return {
    pack,
    latencyMs,
    inputTokens: body.usage?.prompt_tokens,
    outputTokens: body.usage?.completion_tokens,
  };
}

/**
 * 主入口：生成学习包
 * @param {object} params
 * @param {Array<{start,end,text}>} params.segments - Transcript segments
 * @param {string} params.language - 'zh'|'en'|'mixed'
 * @param {string} params.goal - quick_understand|deep_learn|find_actions|critical_thinking|for_work
 * @param {object} [params.context] - { userId, jobId, episodeId, transcriptId }
 * @returns {Promise<{
 *   pack: object,
 *   glmModel: string,
 *   promptVersion: string,
 *   generationStrategy: 'plan-b'|'plan-b-retry',
 *   latencyMs: number,
 *   inputTokens: number,
 *   outputTokens: number,
 *   retries: number
 * }>}
 */
export async function generateLearningPack({ segments, language, goal, context = {} }) {
  const totalDur = segments.length ? segments[segments.length - 1].end : 0;
  const systemPrompt = loadSystemPrompt(language);
  const transcriptText = segmentsWithChapters(segments);

  const startedAt = Date.now();

  // Round 1: 正常生成 (温度 0.5)
  // Sprint 8: JSON malformed 时自动降温到 0.3 重试 1 次
  let r1;
  try {
    r1 = await callGlm({
      systemPrompt,
      transcriptText,
      goal,
      model: GLM_MODEL,
      temperature: 0.5,
      maxTokens: GLM_MAX_TOKENS,
      context,
    });
  } catch (err) {
    if (err.code === 'GLM_MALFORMED_JSON') {
      // 降温重试：低 temperature 输出更稳定
      console.warn('[packGenerator] Round 1 MALFORMED_JSON, retrying with lower temperature');
      r1 = await callGlm({
        systemPrompt: systemPrompt + '\n\n**严格要求：只输出合法 JSON，不要有任何解释文字或 markdown 代码块。**',
        transcriptText,
        goal,
        model: GLM_MODEL,
        temperature: 0.2,
        maxTokens: GLM_MAX_TOKENS,
        context,
      });
    } else {
      throw err;
    }
  }

  let strategy = 'plan-b';
  let retries = 0;
  let finalPack = r1.pack;
  let inputTokens = r1.inputTokens;
  let outputTokens = r1.outputTokens;

  // Runtime 兜底：章节覆盖度检查
  const coverageOk = checkChapterCoverage(r1.pack, totalDur);
  if (!coverageOk && totalDur > 45 * 60) { // 只在超过 45 分钟音频才重试
    // Round 2: 加大 temperature 重试
    try {
      const r2 = await callGlm({
        systemPrompt: systemPrompt + '\n\n**上一次输出的 6 个 steps 没有分布在足够多的章节，请重新生成，务必让 6 个 steps 覆盖至少 4 个不同的 15 分钟章节。**',
        transcriptText,
        goal,
        model: GLM_MODEL,
        temperature: 0.9,
        maxTokens: GLM_MAX_TOKENS,
        context,
      });
      if (checkChapterCoverage(r2.pack, totalDur)) {
        finalPack = r2.pack;
        strategy = 'plan-b-retry';
        retries = 1;
        inputTokens += r2.inputTokens;
        outputTokens += r2.outputTokens;
      }
      // 如果 retry 也不 OK，用 r1（至少有内容）
    } catch (e) {
      // Retry 失败也 OK，用 r1
    }
  }

  return {
    pack: finalPack,
    glmModel: GLM_MODEL,
    promptVersion: PROMPT_VERSION,
    generationStrategy: strategy,
    latencyMs: Date.now() - startedAt,
    inputTokens,
    outputTokens,
    retries,
  };
}
