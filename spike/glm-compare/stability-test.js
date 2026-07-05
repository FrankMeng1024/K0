// SPIKE-016 稳定性验证：4.6 vs 5.2 多集对比
// 用另外 2 集 transcript (声东击西 + 硬地骇客 batch10 其他集) 各跑一次 4.6 和 5.2
// 看质量是否稳定接近

import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

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

async function generate(model, transcript, maxTokens = 8192) {
  const t0 = Date.now();
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
          { role: 'user', content: '以下是播客转录：\n\n' + transcript }
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });
    const ms = Date.now() - t0;
    if (!resp.ok) return { model, ok: false, ms, err: (await resp.text()).slice(0, 200) };
    const j = await resp.json();
    const content = j.choices?.[0]?.message?.content?.trim() || '';
    let pack = null;
    try {
      pack = JSON.parse(content.replace(/^```json\s*/, '').replace(/```\s*$/, ''));
    } catch {}
    return {
      model,
      ok: true,
      ms,
      pack,
      raw: content,
      inTok: j.usage?.prompt_tokens,
      outTok: j.usage?.completion_tokens,
      parseOK: !!pack,
    };
  } catch (e) {
    return { model, ok: false, err: e.message };
  }
}

// 用 2 集: 硬地骇客 (已有) + 声东击西 + 跨国串门
const sources = [
  { label: '硬地骇客 EP127 (51min)', file: 'spike/data/spike-014-bcut-1783248759707.json' },
  { label: '声东击西 #395 (62min)', file: 'spike/data/spike-014-bcut-1783245226755.json' },
  { label: '跨国串门 #586 (99min)', file: 'spike/data/spike-014-bcut-1783245086147.json' },
];

const allResults = [];

for (const src of sources) {
  const d = JSON.parse(fs.readFileSync(src.file, 'utf-8'));
  const transcript = d.segments.map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`).join('\n');

  console.log(`\n═══════════════════════════════════════`);
  console.log(`播客: ${src.label}`);
  console.log(`Transcript: ${d.segments.length} segs, ${transcript.length} chars`);
  console.log(`═══════════════════════════════════════\n`);

  for (const model of ['glm-4.6', 'glm-5.2']) {
    process.stdout.write(`▶ ${model} ... `);
    const r = await generate(model, transcript);
    if (r.ok) {
      console.log(`✅ ${(r.ms/1000).toFixed(1)}s  in=${r.inTok} out=${r.outTok}  parseOK=${r.parseOK}`);
      if (r.pack) console.log(`   oneSentence: ${r.pack.oneSentence}`);
    } else {
      console.log(`❌ ${r.err?.slice(0, 100)}`);
    }
    allResults.push({ source: src.label, ...r });
    await new Promise(r => setTimeout(r, 1000));
  }
}

fs.writeFileSync('spike/data/spike-016-stability-test.json',
  JSON.stringify(allResults, null, 2));
console.log(`\n💾 → spike/data/spike-016-stability-test.json`);
