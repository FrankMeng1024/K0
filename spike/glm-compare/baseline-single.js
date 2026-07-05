// Baseline: 原 K0 单次调用 prompt，跨国串门 99min
import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const MODEL = 'glm-5.2';

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

async function run() {
  const t0 = Date.now();
  const file = 'spike/data/spike-014-bcut-1783245086147.json';
  const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const transcript = d.segments
    .map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`)
    .join('\n');
  console.log(`Transcript: ${d.segments.length} segs, ${transcript.length} chars`);

  const userMsg = `以下是一集播客的文字转录（含时间戳，格式：[start-end] 内容）。请生成学习包：\n\n${transcript}`;

  const resp = await fetch(URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });
  const ms = Date.now() - t0;
  if (!resp.ok) {
    console.log(`❌ HTTP ${resp.status}`);
    return;
  }
  const j = await resp.json();
  const content = j.choices?.[0]?.message?.content?.trim() || '';
  console.log(`⏱  ${(ms/1000).toFixed(1)}s  in=${j.usage?.prompt_tokens} out=${j.usage?.completion_tokens}`);

  let pack = null;
  try {
    const cleaned = content.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    pack = JSON.parse(cleaned);
  } catch {}

  const outPath = `spike/data/attention-baseline-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify({ scheme:'baseline', ms, inTok:j.usage?.prompt_tokens, outTok:j.usage?.completion_tokens, parseOK:!!pack, raw:content, pack }, null, 2));
  console.log(`💾 → ${outPath}`);

  if (pack) {
    console.log(`\noneSentence: ${pack.oneSentence}`);
    console.log(`corePoints:`);
    (pack.corePoints || []).forEach(p => console.log(`  - [${p.timestamp}s] ${p.point}`));
    console.log(`steps:`);
    (pack.steps || []).forEach((s, i) => console.log(`  ${i+1}. [${s.sourceTimestamp}s] ${s.title}`));
  }

  const allText = JSON.stringify(pack || content);
  const hits = ['加州', '选举', '加州选举', '投票'].filter(k => allText.includes(k));
  console.log(`\n🎯 加州选举关键词命中: ${hits.length > 0 ? '✅ ' + hits.join(',') : '❌ 未命中'}`);
}

run().catch(e => console.error(e));
