// SPIKE-016: GLM 多模型横评
// 用同一份 BCUT transcript（硬地骇客 51min）生成 6 版学习包
// 后续 subagent 双盲评分

import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

const MODELS = [
  'glm-4-flash',
  'glm-4.5',
  'glm-4.6',
  'glm-4.7',
  'glm-5-turbo',
  'glm-5.2',
];

// K0 学习包 prompt（简化版，用于 spike 对比）
const SYSTEM_PROMPT = `你是一个专业的播客内容分析师。用户会给你一段播客文字转录，你要生成一份"学习包"，帮助用户在 5-10 分钟内消化 40-60 分钟播客的核心内容。

严格按以下 JSON 格式输出（不要 markdown 代码块，直接输出 JSON）：

{
  "oneSentence": "用一句话总结这集播客的核心观点（20-30 字）",
  "corePoints": [
    { "point": "核心观点 1（15-30 字）", "timestamp": 秒数 },
    { "point": "核心观点 2", "timestamp": 秒数 },
    { "point": "核心观点 3", "timestamp": 秒数 }
  ],
  "audience": ["受众标签 1（如：产品经理）", "受众标签 2"],
  "valueScore": {
    "density": 0-10 (信息密度),
    "novelty": 0-10 (新鲜度),
    "actionability": 0-10 (可行动性)
  },
  "estimatedCostMinutes": 学习该学习包大约需要几分钟,
  "steps": [
    { "title": "步骤1 标题", "content": "详细内容 100-150 字", "sourceTimestamp": 秒数 },
    ... 共 6 步
  ],
  "cards": [
    { "type": "opinion|method|reflection", "title": "卡片标题", "explanation": "解释 80-120 字", "sourceTimestamp": 秒数 },
    ... 共 3 张
  ],
  "actions": {
    "today": "今天可以做的事（30-50 字）",
    "thisWeek": "本周可以做的事",
    "longTerm": "长期可以做的事"
  }
}

严格要求：
1. 只输出 JSON，不要任何解释或前缀
2. sourceTimestamp 必须是 transcript 里真实出现的时间戳
3. 中文表达自然，不要生硬翻译
4. corePoints 必须真正抓住核心，不要泛泛而谈`;

async function generate(model, transcript) {
  const t0 = Date.now();
  const userMsg = `以下是一集播客的文字转录（含时间戳，格式：[start-end] 内容）。请生成学习包：\n\n${transcript}`;

  try {
    const resp = await fetch(URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMsg },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });
    const ms = Date.now() - t0;
    if (!resp.ok) {
      const err = await resp.text();
      return { model, ok: false, ms, err: err.slice(0, 200) };
    }
    const j = await resp.json();
    const content = j.choices?.[0]?.message?.content?.trim() || '';
    let pack = null;
    try {
      // 剥掉可能的 markdown fence
      const cleaned = content.replace(/^```json\s*/, '').replace(/```\s*$/, '');
      pack = JSON.parse(cleaned);
    } catch {}
    return {
      model,
      ok: true,
      ms,
      pack,
      raw: content,
      inTok: j.usage?.prompt_tokens,
      outTok: j.usage?.completion_tokens,
      totalTok: j.usage?.total_tokens,
      parseOK: !!pack,
    };
  } catch (e) {
    return { model, ok: false, err: e.message };
  }
}

// ── main ──
const transcriptFile = 'spike/data/spike-014-bcut-1783248759707.json';  // 硬地骇客 51min
const d = JSON.parse(fs.readFileSync(transcriptFile, 'utf-8'));
const segments = d.segments;

// 拼接完整 transcript with timestamps
const fullTranscript = segments
  .map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`)
  .join('\n');

console.log(`Transcript: ${segments.length} segs, ${fullTranscript.length} chars`);
console.log(`Testing ${MODELS.length} models...\n`);

const results = [];
for (const model of MODELS) {
  process.stdout.write(`▶ ${model.padEnd(15)} ... `);
  const r = await generate(model, fullTranscript);
  if (r.ok) {
    console.log(`✅ ${(r.ms/1000).toFixed(1)}s  in=${r.inTok} out=${r.outTok}  parseOK=${r.parseOK}`);
    if (r.pack) {
      console.log(`   oneSentence: ${r.pack.oneSentence?.slice(0, 60) || '?'}`);
    }
  } else {
    console.log(`❌ ${r.err?.slice(0, 100) || 'err'}`);
  }
  results.push(r);
  await new Promise(r => setTimeout(r, 800));
}

// 保存所有结果
const outPath = `spike/data/spike-016-glm-compare-${Date.now()}.json`;
fs.writeFileSync(outPath, JSON.stringify({
  transcriptSource: transcriptFile,
  segmentCount: segments.length,
  transcriptChars: fullTranscript.length,
  results,
}, null, 2));
console.log(`\n💾 → ${outPath}`);

// 简报
console.log('\n═══ GLM 横评摘要 ═══');
console.log('模型               耗时      Tokens         parseOK');
for (const r of results) {
  if (r.ok) {
    console.log(`${r.model.padEnd(15)}  ${(r.ms/1000).toFixed(1).padStart(5)}s   ${String(r.inTok || '?').padStart(5)}→${String(r.outTok || '?').padStart(4)}   ${r.parseOK ? '✓' : '✗'}`);
  } else {
    console.log(`${r.model.padEnd(15)}  FAIL: ${r.err?.slice(0, 60)}`);
  }
}
