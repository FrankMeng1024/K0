// 方案 A：议题清单先行
// 单次调用，system prompt 要求先输出"议题清单"（10-15 条），再基于清单展开学习包
import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const MODEL = 'glm-5.2';

const SYSTEM_PROMPT = `你是一个专业的播客内容分析师。用户会给你一段播客文字转录（可能长达 90-120 分钟），你要生成一份"学习包"。

**关键工作流（必须严格按顺序执行）**：
第一步：通读全文，先在 JSON 的 topicInventory 字段列出这集播客里出现过的所有独立议题（10-15 条），每条 8-20 字，标注大致起止时间戳（秒）。**必须遍历全文，包括中段、次要但独立的议题、听起来"顺带一提"的议题——只要它是一个可独立成话题的讨论就必须列入清单**。
第二步：基于第一步的议题清单，选出最有信息密度的 3-6 个核心议题展开为学习包主体。

严格按以下 JSON 格式输出（不要 markdown 代码块）：

{
  "topicInventory": [
    { "topic": "议题名（8-20 字）", "startSec": 秒数, "endSec": 秒数 },
    ... 共 10-15 条，覆盖整集
  ],
  "oneSentence": "一句话总结这集播客核心（20-30 字）",
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
    ... 共 6 步
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
2. topicInventory 必须覆盖整集所有独立议题，不得只列前半段
3. sourceTimestamp 必须是 transcript 里真实的时间戳
4. 中文自然表达`;

async function run() {
  const t0 = Date.now();
  const file = 'spike/data/spike-014-bcut-1783245086147.json';
  const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const transcript = d.segments
    .map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`)
    .join('\n');
  console.log(`Transcript: ${d.segments.length} segs, ${transcript.length} chars`);

  const userMsg = `以下是一集播客的文字转录（含时间戳）。请生成学习包：\n\n${transcript}`;

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
    scheme: 'A-topic-list',
    ms,
    inTok: j.usage?.prompt_tokens,
    outTok: j.usage?.completion_tokens,
    parseOK: !!pack,
    raw: content,
    pack,
  };
  const outPath = `spike/data/attention-A-topic-list-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`💾 → ${outPath}`);

  if (pack) {
    console.log(`\n📋 topicInventory (${pack.topicInventory?.length || 0} 条):`);
    (pack.topicInventory || []).forEach((t, i) => {
      console.log(`  ${(i+1).toString().padStart(2)}. [${t.startSec}-${t.endSec}s] ${t.topic}`);
    });
    console.log(`\noneSentence: ${pack.oneSentence}`);
    console.log(`corePoints:`);
    (pack.corePoints || []).forEach(p => console.log(`  - ${p.point}`));
  }

  // 检查加州选举
  const allText = JSON.stringify(pack || content);
  const hits = ['加州', '选举', '加州选举', '投票'].filter(k => allText.includes(k));
  console.log(`\n🎯 加州选举关键词命中: ${hits.length > 0 ? '✅ ' + hits.join(',') : '❌ 未命中'}`);
}

run().catch(e => console.error(e));
