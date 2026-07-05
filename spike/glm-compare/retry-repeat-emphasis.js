// 方案 B：重复关键指令 + 章节标记
// 单次调用，system prompt 开头+结尾都强调"遍历所有议题"，transcript 里加入 [章节 N: MM-MM min] 标记
import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const MODEL = 'glm-5.2';

const SYSTEM_PROMPT = `【首要指令】你必须遍历用户提供的整段 transcript，识别并覆盖**所有独立议题**——包括次要但独立的议题、中段议题、听起来"顺带一提"但实际展开讨论过的议题。禁止只处理开头和结尾。

你是一个专业的播客内容分析师。用户会给你一段播客文字转录（可能长达 90-120 分钟，transcript 里已插入 [章节 N: MM-MM min] 章节标记帮你定位）。你要生成一份"学习包"。

严格按以下 JSON 格式输出（不要 markdown 代码块）：

{
  "oneSentence": "一句话总结（20-30 字）",
  "corePoints": [
    { "point": "核心观点 1（15-30 字）", "timestamp": 秒数 },
    { "point": "核心观点 2", "timestamp": 秒数 },
    { "point": "核心观点 3", "timestamp": 秒数 }
  ],
  "audience": ["受众 1", "受众 2"],
  "valueScore": { "density": 0-10, "novelty": 0-10, "actionability": 0-10 },
  "estimatedCostMinutes": 学习分钟数,
  "steps": [
    { "title": "步骤 1 标题", "content": "详细内容 100-150 字", "sourceTimestamp": 秒数 },
    ... 共 6 步——**这 6 步必须来自 transcript 的 6 个不同章节区间**，不得全部集中在开头或结尾
  ],
  "cards": [
    { "type": "opinion|method|reflection", "title": "卡片标题", "explanation": "解释 80-120 字", "sourceTimestamp": 秒数 },
    ... 共 3 张
  ],
  "actions": {
    "today": "今天可做的事",
    "thisWeek": "本周可做的事",
    "longTerm": "长期可做的事"
  }
}

严格要求：
1. 只输出 JSON
2. sourceTimestamp 必须是 transcript 里真实的时间戳
3. 中文自然表达

【末尾再次强调——这是本任务成败的关键】
再说一遍：你必须**遍历整段 transcript**，包括每一个 [章节] 标记内的内容。生成的 6 个 steps 必须**分布在不同章节**，不得只覆盖前 30 分钟。次要议题（如与主题不直接相关但被讨论过的话题）也必须至少体现在 steps 或 cards 中的一处。漏掉中后段独立议题 = 任务失败。`;

async function run() {
  const t0 = Date.now();
  const file = 'spike/data/spike-014-bcut-1783245086147.json';
  const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const segs = d.segments;

  // 加章节标记：每 15 分钟一个章节
  const CHUNK_SEC = 15 * 60;
  const totalSec = segs[segs.length - 1].end;
  const nChunks = Math.ceil(totalSec / CHUNK_SEC);

  const lines = [];
  let curChunk = -1;
  for (const s of segs) {
    const idx = Math.floor(s.start / CHUNK_SEC);
    if (idx !== curChunk) {
      const startMin = idx * 15;
      const endMin = Math.min((idx + 1) * 15, Math.ceil(totalSec / 60));
      lines.push(`\n=== [章节 ${idx + 1}: ${startMin}-${endMin} min] ===`);
      curChunk = idx;
    }
    lines.push(`[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`);
  }
  const transcript = lines.join('\n');
  console.log(`Transcript: ${segs.length} segs, ${transcript.length} chars, ${nChunks} 章节`);

  const userMsg = `以下是一集播客的文字转录（含时间戳和章节标记）。请生成学习包：\n\n${transcript}`;

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
    const err = await resp.text();
    console.log(`❌ HTTP ${resp.status}: ${err.slice(0, 400)}`);
    return;
  }
  const j = await resp.json();
  const content = j.choices?.[0]?.message?.content?.trim() || '';
  console.log(`\n⏱  ${(ms/1000).toFixed(1)}s  in=${j.usage?.prompt_tokens} out=${j.usage?.completion_tokens}`);

  let pack = null;
  try {
    const cleaned = content.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    pack = JSON.parse(cleaned);
  } catch (e) {
    console.log(`⚠️  parse fail: ${e.message}`);
  }

  const out = {
    scheme: 'B-repeat-emphasis',
    ms,
    inTok: j.usage?.prompt_tokens,
    outTok: j.usage?.completion_tokens,
    parseOK: !!pack,
    raw: content,
    pack,
  };
  const outPath = `spike/data/attention-B-repeat-emphasis-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`💾 → ${outPath}`);

  if (pack) {
    console.log(`\noneSentence: ${pack.oneSentence}`);
    console.log(`corePoints:`);
    (pack.corePoints || []).forEach(p => console.log(`  - [${p.timestamp}s] ${p.point}`));
    console.log(`steps 时间分布:`);
    (pack.steps || []).forEach((s, i) => console.log(`  ${i+1}. [${s.sourceTimestamp}s] ${s.title}`));
  }

  const allText = JSON.stringify(pack || content);
  const hits = ['加州', '选举', '加州选举', '投票'].filter(k => allText.includes(k));
  console.log(`\n🎯 加州选举关键词命中: ${hits.length > 0 ? '✅ ' + hits.join(',') : '❌ 未命中'}`);
}

run().catch(e => console.error(e));
