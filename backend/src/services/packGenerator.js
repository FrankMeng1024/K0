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
 * 调 GLM 生成学习包（可能带 retry）
 * Sprint 10 v14: 加 429 指数退避重试（智谱短时限流常见）
 */
async function callGlm({ systemPrompt, transcriptText, goal, model, temperature, maxTokens, context }) {
  const userMsg = `以下是播客文字转录（含时间戳和 15 分钟章节标记）。学习目标：${goal}\n\n${transcriptText}`;

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMsg },
    ],
    temperature,
    max_tokens: maxTokens,
  };

  const MAX_429_RETRIES = 3;
  const RETRY_DELAYS_MS = [10_000, 30_000, 60_000]; // 10s → 30s → 60s
  let response, body, latencyMs, parseOk;

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    ({ response, body, latencyMs, parseOk } = await loggedFetch({
      callType: attempt > 0 ? `glm.pack.generate.retry${attempt}` : 'glm.pack.generate',
      provider: 'zhipu-glm',
      model,
      promptVersion: PROMPT_VERSION,
      context,
      url: `${GLM_BASE_URL}/chat/completions`,
      fetchOptions: {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.GLM_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      },
    }));

    // 429 = 智谱短时限流。指数退避后重试
    if (response.status === 429 && attempt < MAX_429_RETRIES) {
      const wait = RETRY_DELAYS_MS[attempt];
      console.warn(`[packGenerator] GLM 429 rate-limited (attempt ${attempt + 1}/${MAX_429_RETRIES + 1}), retrying after ${wait / 1000}s...`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    // 非 429 错误 或 用完 429 重试次数 → break（下面统一处理）
    break;
  }

  if (!response.ok) {
    throw Object.assign(new Error(`GLM_HTTP_${response.status}`), {
      code: 'GLM_API_ERROR',
      status: response.status,
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
