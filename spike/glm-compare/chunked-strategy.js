// SPIKE 分片策略验证：把长 transcript 切成多段，各自处理，再合并
// 对比：一次性 vs 分片 3-4 段
//
// 假设：跨国串门 99min transcript 切 3 段（每段 33min），各自生成子学习包，最后 GLM 汇总
// 期望：能捕捉到"加州选举"这类被稀释的次要议题

import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

// 每段的处理 prompt：提取要点
const SEGMENT_PROMPT = `你是播客片段分析师。以下是一集播客的**一个片段**（不是完整内容）。请提取这段里的所有独立议题/要点。

严格 JSON 输出（不要 markdown）：
{
  "segmentSummary": "这段总结 30-50 字",
  "topics": [
    { "topic": "议题标题 10-20 字", "keyPoints": ["要点1 20-30 字", "要点2", ...], "startTimestamp": 秒数, "endTimestamp": 秒数 },
    ... 每个独立议题一个 topic，不限数量
  ]
}

要求：
1. 不要遗漏任何独立议题（即使只讨论了 2-3 分钟）
2. topic 之间要有清晰边界
3. keyPoints 要具体，不要泛泛而谈`;

// 合并 prompt：把多段的要点合并成最终学习包
const MERGE_PROMPT = `你是学习包架构师。以下是一集播客被切分成多段后，每段的要点汇总。请合并成一份完整学习包。

严格 JSON 输出（不要 markdown）：
{
  "oneSentence": "一句话主题 20-30 字",
  "corePoints": [
    { "point": "核心观点 15-30 字", "timestamp": 秒数 },
    ... 3-5 个
  ],
  "audience": ["受众标签 1", "受众标签 2"],
  "valueScore": { "density": 0-10, "novelty": 0-10, "actionability": 0-10 },
  "estimatedCostMinutes": 数字,
  "steps": [
    { "title": "步骤标题", "content": "内容 100-150 字", "sourceTimestamp": 秒数 },
    ... 6 步
  ],
  "cards": [
    { "type": "opinion|method|reflection", "title": "标题", "explanation": "80-120 字", "sourceTimestamp": 秒数 },
    ... 3 张
  ],
  "actions": { "today": "...", "thisWeek": "...", "longTerm": "..." }
}

要求：
1. 覆盖所有段落里出现的独立议题
2. 不要遗漏任何"次要但独立"的议题
3. 中文自然，不要生硬`;

async function callGLM(model, systemPrompt, userContent, maxTokens = 8192) {
  const t0 = Date.now();
  const r = await fetch(URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.5,
      max_tokens: maxTokens,
    }),
  });
  const ms = Date.now() - t0;
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content?.trim() || '';
  let parsed = null;
  try {
    parsed = JSON.parse(content.replace(/^```json\s*/, '').replace(/```\s*$/, ''));
  } catch {}
  return { ms, ok: !!parsed, parsed, raw: content, usage: j.usage };
}

// 切 transcript 成 N 段（按 timestamp 均分）
function splitTranscript(segments, nParts) {
  const totalDur = segments[segments.length - 1].end;
  const partDur = totalDur / nParts;
  const parts = Array.from({ length: nParts }, () => []);
  for (const seg of segments) {
    const idx = Math.min(nParts - 1, Math.floor(seg.start / partDur));
    parts[idx].push(seg);
  }
  return parts;
}

function segmentsToText(segs) {
  return segs.map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`).join('\n');
}

// ── main ──
const targetFile = process.argv[2] || 'spike/data/spike-014-bcut-1783245086147.json'; // 跨国串门 99min
const nParts = parseInt(process.argv[3] || '3', 10);

const d = JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
const segments = d.segments;
const totalDur = segments[segments.length - 1].end;

console.log(`Transcript: ${segments.length} segs, ${totalDur.toFixed(0)}s (${(totalDur/60).toFixed(1)}min)`);
console.log(`Splitting into ${nParts} parts, each ${(totalDur/nParts/60).toFixed(1)}min\n`);

const parts = splitTranscript(segments, nParts);

// Step 1: 每段独立分析，找出议题
console.log('=== Step 1: 分段议题提取 ===');
const partSummaries = [];
let totalStep1Ms = 0;
for (let i = 0; i < parts.length; i++) {
  const partText = segmentsToText(parts[i]);
  process.stdout.write(`  Part ${i+1}/${nParts} (${parts[i].length} segs, ${partText.length} chars) ... `);
  const r = await callGLM('glm-5.2', SEGMENT_PROMPT, partText);
  totalStep1Ms += r.ms;
  if (r.ok) {
    console.log(`✅ ${(r.ms/1000).toFixed(1)}s  ${r.parsed.topics?.length || 0} topics`);
    partSummaries.push(r.parsed);
  } else {
    console.log(`❌ parse fail`);
    partSummaries.push({ segmentSummary: '(fail)', topics: [] });
  }
}

// Step 2: 合并成最终学习包
console.log('\n=== Step 2: 合并 ===');
const mergeInput = 'Podcast 分片要点汇总：\n\n' + partSummaries.map((p, i) =>
  `--- 第 ${i+1} 段 (约 ${(totalDur/nParts*i/60).toFixed(0)}-${(totalDur/nParts*(i+1)/60).toFixed(0)}min) ---\n${JSON.stringify(p, null, 2)}`
).join('\n\n');

console.log(`Merge input: ${mergeInput.length} chars`);
process.stdout.write(`Merging with glm-5.2 ... `);
const merged = await callGLM('glm-5.2', MERGE_PROMPT, mergeInput);
console.log(`${(merged.ms/1000).toFixed(1)}s  ${merged.ok ? '✅' : '❌'}`);
const totalMs = totalStep1Ms + merged.ms;

// 输出结果
const output = {
  file: targetFile,
  nParts,
  totalDur,
  step1Ms: totalStep1Ms,
  step2Ms: merged.ms,
  totalMs,
  partSummaries,
  finalPack: merged.parsed,
};
const outPath = `spike/data/spike-016-chunked-${Date.now()}.json`;
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log('\n═══ 分片方案结果 ═══');
console.log(`总耗时: ${(totalMs/1000).toFixed(1)}s  (step1=${(totalStep1Ms/1000).toFixed(1)}s, step2=${(merged.ms/1000).toFixed(1)}s)`);
console.log(`对比一次性: ~145s (跨国串门 99min 直接跑 5.2)`);
if (merged.parsed) {
  console.log(`\noneSentence: ${merged.parsed.oneSentence}`);
  console.log(`corePoints: ${(merged.parsed.corePoints || []).length}`);
  console.log(`steps: ${(merged.parsed.steps || []).length}`);
  console.log(`cards: ${(merged.parsed.cards || []).length}`);
}
console.log(`\n→ ${outPath}`);
