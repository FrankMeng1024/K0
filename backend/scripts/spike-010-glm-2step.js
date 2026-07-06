// SPIKE-010: 验证 GLM Step 1 + Step 2 拆两步方案下的 429 触发情况
//
// 目标：确认拆两步（80K → 20K）能否 100% 不触发 429
// 方法：连续 5 轮完整跑，每轮 Step 1 + Step 2，记录 token 消耗 + 每次响应码

import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const GLM_BASE_URL = 'https://open.bigmodel.cn/api/coding/paas/v4';
const GLM_MODEL = 'glm-5.2';
const GLM_API_KEY = process.env.GLM_API_KEY;

if (!GLM_API_KEY) {
  console.error('GLM_API_KEY missing');
  process.exit(1);
}

// ── 从生产 DB 拿真实转录 ─────────────────────────
async function loadTranscript(transcriptId) {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  });
  const [rows] = await conn.execute(
    'SELECT segments, duration_seconds, language FROM transcripts WHERE id = ?',
    [transcriptId]
  );
  await conn.end();
  if (!rows.length) throw new Error(`transcript ${transcriptId} not found`);
  const r = rows[0];
  return {
    segments: typeof r.segments === 'string' ? JSON.parse(r.segments) : r.segments,
    durationSeconds: r.duration_seconds,
    language: r.language,
  };
}

// ── 拼接带章节的转录文本（复用生产逻辑） ───────
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
    lines.push(`[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`);
  }
  return lines.join('\n');
}

// ── GLM 调用（返回 status + body + usage） ─────
async function callGlm(prompt, maxTokens, label) {
  const t0 = Date.now();
  const res = await fetch(`${GLM_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: GLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: maxTokens,
    }),
  });
  const dt = Date.now() - t0;
  const body = await res.json().catch(() => ({}));
  const usage = body.usage || {};
  const status = res.status;
  const contentLen = body.choices?.[0]?.message?.content?.length || 0;
  console.log(
    `    [${label}] status=${status} time=${dt}ms  in=${usage.prompt_tokens || 0}  out=${usage.completion_tokens || 0}  total=${usage.total_tokens || 0}  content=${contentLen} chars`
  );
  if (status !== 200) {
    console.log(`    [${label}] ERROR body:`, JSON.stringify(body).slice(0, 300));
  }
  return { status, body, usage, dt };
}

// ── Step 1 prompt（简化版，只求 worthListening 段落） ───
function buildStep1Prompt(transcriptText) {
  return `你是一位苛刻的中文播客学习总监。以下是一集中文播客的完整转录（含时间戳和 15 分钟章节标记）。

任务：提取"值得学"的段落，输出 JSON（无 markdown 包裹）：
{
  "oneSentence": "≤25字",
  "audience": ["产品经理","创业者"],
  "valueScore": { "density": 8, "novelty": 7, "actionability": 6 },
  "estimatedCostMinutes": 10,
  "worthListening": [
    { "startSec": 300, "endSec": 420, "reason": "为什么值得听", "quoteParagraph": "从转录截取的原文段落(3-8句)" }
  ],
  "skippable": [
    { "startSec": 0, "endSec": 90, "reason": "广告插入" }
  ]
}

worthListening 数量按内容质量动态定：短播客可 2-3 段，长播客 6-10 段。每段满足至少 2 个入选标准：信息密度高 / 反常识 / 可行动 / 可迁移 / 原创。

**关键**：quoteParagraph 必须从转录中截取真实原文段落（3-8 句、150-400 字），供后续 Step 2 使用。

转录：
${transcriptText}`;
}

// ── Step 2 prompt（只送 Step 1 提取的段落） ────────
function buildStep2Prompt(step1) {
  const passages = step1.worthListening.map((w, i) =>
    `【段 ${i + 1}】(${Math.floor(w.startSec / 60)}分-${Math.floor(w.endSec / 60)}分, ${w.reason})\n${w.quoteParagraph}`
  ).join('\n\n');

  return `你是一位中文播客学习助理。以下是已经过筛选的核心段落（从原播客提炼）。

任务：基于这些段落，输出学习包 JSON：
{
  "steps": [
    { "title": "背景理解", "content": "..." },
    { "title": "核心观点", "content": "..." },
    { "title": "案例与证据", "content": "..." },
    { "title": "方法论提炼", "content": "..." },
    { "title": "批判性思考", "content": "..." },
    { "title": "我的应用", "content": "..." }
  ],
  "concepts": [
    { "term": "...", "plain": "小白解释", "context": {"text":"原文语境","timestamp":123}, "related": "延伸" }
  ],
  "cards": [
    { "title": "观点陈述", "type": "opinion", "core": "3-5句", "context": "原文语境", "usage": "1-2用例",
      "challenge": "反面视角", "source": {"quote":"原话","timestamp":123}, "myApplication": "AI建议" }
  ],
  "actions": {
    "today": "今天可做的1件事",
    "week": "本周可尝试的1件事",
    "longterm": "值得研究的1个问题"
  }
}

cards 数量：动态 3-18 张（本内容量级建议 5-10 张）。
concepts 数量：3-6 个关键概念。
所有输出使用中文。

核心段落：
${passages}`;
}

// ── Main ─────────────────────────────────────────
async function main() {
  console.log('===== SPIKE-010 GLM 429 内联方案验证 =====\n');

  const transcript = await loadTranscript(1);
  const transcriptText = segmentsWithChapters(transcript.segments);
  console.log(`转录：${transcript.durationSeconds}s (${(transcript.durationSeconds / 60).toFixed(1)}min), ${transcriptText.length} chars\n`);

  const results = [];

  const ROUNDS = 3; // 连续 3 轮
  for (let round = 1; round <= ROUNDS; round++) {
    console.log(`\n【Round ${round}/${ROUNDS}】`);

    // Step 1
    console.log('  Step 1 快照生成...');
    const step1Prompt = buildStep1Prompt(transcriptText);
    console.log(`    prompt chars: ${step1Prompt.length}`);
    const s1 = await callGlm(step1Prompt, 8192, 'S1');

    if (s1.status !== 200) {
      results.push({ round, s1: s1.status, s2: 'skip' });
      console.log('    Step 1 failed, skipping Step 2');
      continue;
    }

    // 提取 Step 1 输出
    let step1Data;
    try {
      const content = s1.body.choices[0].message.content;
      const cleaned = content.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      step1Data = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      console.log(`    Step 1 output: ${(step1Data.worthListening || []).length} worthListening segments`);
    } catch (e) {
      console.log(`    Step 1 parse failed:`, e.message);
      results.push({ round, s1: 200, s1Parse: 'failed', s2: 'skip' });
      continue;
    }

    if (!step1Data.worthListening || !step1Data.worthListening.length) {
      console.log('    Step 1 无 worthListening，跳过 Step 2');
      results.push({ round, s1: 200, s2: 'skip-no-passages' });
      continue;
    }

    // Step 2
    console.log('  Step 2 学习包生成...');
    const step2Prompt = buildStep2Prompt(step1Data);
    console.log(`    prompt chars: ${step2Prompt.length}`);
    const s2 = await callGlm(step2Prompt, 8192, 'S2');

    results.push({
      round,
      s1Status: s1.status, s1In: s1.usage.prompt_tokens, s1Out: s1.usage.completion_tokens,
      s2Status: s2.status, s2In: s2.usage.prompt_tokens, s2Out: s2.usage.completion_tokens,
      worthListeningCount: step1Data.worthListening.length,
    });

    // 间隔 3 秒（模拟用户看快照的时间）
    if (round < ROUNDS) {
      console.log('  waiting 3s before next round...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n===== 汇总 =====');
  console.table(results);

  const all200 = results.every(r => r.s1Status === 200 && (r.s2Status === 200 || r.s2Status === 'skip'));
  const any429 = results.some(r => r.s1Status === 429 || r.s2Status === 429);
  console.log('\n最终判断：');
  console.log(`  所有 Step 都 200: ${all200 ? '✓' : '✗'}`);
  console.log(`  有 429 触发: ${any429 ? '✗ 是' : '✓ 否'}`);

  const s1InAvg = results.filter(r => r.s1In).reduce((a, r) => a + r.s1In, 0) / results.filter(r => r.s1In).length;
  const s2InAvg = results.filter(r => r.s2In).reduce((a, r) => a + r.s2In, 0) / (results.filter(r => r.s2In).length || 1);
  console.log(`  Step 1 平均输入 tokens: ${s1InAvg.toFixed(0)}`);
  console.log(`  Step 2 平均输入 tokens: ${s2InAvg.toFixed(0)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
