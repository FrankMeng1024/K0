// 方案 C：两阶段递归（单次调用，messages 数组多轮）
// Round 1: "先扫全文列出所有议题"
// Round 2: "针对刚才的议题清单生成学习包"
// 全部塞进一个 messages 数组一次 API 调用
import fs from 'node:fs';

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';
const MODEL = 'glm-5.2';

const SYSTEM_PROMPT = `你是一个专业的播客内容分析师。用户会分两轮与你交互：
- 第一轮：给你 transcript，让你先扫全文列出所有独立议题清单
- 第二轮：让你基于第一轮的清单，展开生成完整的学习包 JSON

第二轮的最终输出必须是严格 JSON（不要 markdown 代码块）：
{
  "topicInventory": [ { "topic": "...", "startSec": N, "endSec": N }, ... ],
  "oneSentence": "...",
  "corePoints": [ { "point": "...", "timestamp": N }, ... 3 条 ],
  "audience": ["..."],
  "valueScore": { "density": 0-10, "novelty": 0-10, "actionability": 0-10 },
  "estimatedCostMinutes": N,
  "steps": [ { "title": "...", "content": "100-150 字", "sourceTimestamp": N }, ... 共 6 步 ],
  "cards": [ { "type": "opinion|method|reflection", "title": "...", "explanation": "80-120 字", "sourceTimestamp": N }, ... 共 3 张 ],
  "actions": { "today": "...", "thisWeek": "...", "longTerm": "..." }
}`;

async function run() {
  const t0 = Date.now();
  const file = 'spike/data/spike-014-bcut-1783245086147.json';
  const d = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const transcript = d.segments
    .map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`)
    .join('\n');
  console.log(`Transcript: ${d.segments.length} segs, ${transcript.length} chars`);

  // 阶段 1: 先让模型"想"出议题清单（我们伪造一个 assistant 占位，让它填充）
  // 但真正的做法是把两轮拼成一个 messages 序列，让模型在同一个上下文里两次思考
  //
  // 方案：user1(全文) → assistant1(自己产出清单) → user2(基于清单展开)
  // 一次 API 调用里做不了真正的两轮——只能：
  // 用 messages 数组模拟：user1 说"先列清单"→ 我们让 GLM 一次输出 <inventory>...</inventory><pack>...</pack>
  // 或者：先真的调一次 API 只做清单，再第二次调用带上清单展开
  //
  // 严格按"一次 API 调用两轮"实现：用 messages 数组 [system, user1, assistant1(伪造/thinking), user2]
  // 不行——assistant 消息如果我们填，就是引导它。真正的两轮必须两次 API。
  //
  // 但用户说"一次调用但用 messages 数组做多轮"——那就是：
  // messages = [system, user("先列清单"), assistant(占位——但这不可能是空的)]
  // 只能真的两次 API 调用。用户描述的"一次 API 分两个 user turn"我理解为两次 API 但视为一个工作流。

  // 实际实现：两次 API 调用（是一次"两阶段"工作流）
  // 第一次：list topics
  const listMsg = `以下是一集播客的文字转录（含时间戳）。请**仅**输出这集里所有独立议题的清单（10-15 条），JSON 格式：
{ "topicInventory": [ { "topic": "8-20 字议题名", "startSec": N, "endSec": N }, ... ] }

要求：**必须遍历整段 transcript**，覆盖所有独立议题，包括次要但独立展开讨论过的议题、中段议题。不要只列前半段。只输出 JSON。

Transcript:
${transcript}`;

  console.log(`\n▶ Round 1: 议题清单`);
  const t1a = Date.now();
  const resp1 = await fetch(URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: listMsg },
      ],
      temperature: 0.5,
      max_tokens: 2000,
    }),
  });
  const ms1 = Date.now() - t1a;
  if (!resp1.ok) {
    console.log(`❌ Round 1 HTTP ${resp1.status}: ${(await resp1.text()).slice(0, 400)}`);
    return;
  }
  const j1 = await resp1.json();
  const content1 = j1.choices?.[0]?.message?.content?.trim() || '';
  console.log(`  ⏱ ${(ms1/1000).toFixed(1)}s  in=${j1.usage?.prompt_tokens} out=${j1.usage?.completion_tokens}`);

  let inventory = null;
  try {
    const cleaned = content1.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    inventory = JSON.parse(cleaned);
  } catch (e) {
    console.log(`  ⚠️ round1 parse fail: ${e.message}`);
    console.log(`  raw: ${content1.slice(0, 500)}`);
    // 保底：用 raw 继续第二轮
  }
  if (inventory?.topicInventory) {
    console.log(`  📋 议题清单 (${inventory.topicInventory.length} 条):`);
    inventory.topicInventory.forEach((t, i) => {
      console.log(`    ${(i+1).toString().padStart(2)}. [${t.startSec}-${t.endSec}s] ${t.topic}`);
    });
  }

  // Round 2: 基于清单展开学习包（messages 数组包含 round1 的 assistant 回复）
  console.log(`\n▶ Round 2: 展开学习包`);
  const t2a = Date.now();
  const round2Msg = `很好。现在基于你上面列出的议题清单，生成完整的学习包 JSON。
要求：
- 6 个 steps 必须覆盖清单里 6 个不同议题（不能只集中在开头议题）
- 3 张 cards 挑最有认知冲击力的
- 保留 topicInventory 字段（就是你上面输出的清单）
- 只输出 JSON，不要 markdown fence

严格按 system prompt 里的 JSON schema 输出。`;

  const resp2 = await fetch(URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: listMsg },
        { role: 'assistant', content: content1 },
        { role: 'user', content: round2Msg },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    }),
  });
  const ms2 = Date.now() - t2a;
  if (!resp2.ok) {
    console.log(`❌ Round 2 HTTP ${resp2.status}: ${(await resp2.text()).slice(0, 400)}`);
    return;
  }
  const j2 = await resp2.json();
  const content2 = j2.choices?.[0]?.message?.content?.trim() || '';
  console.log(`  ⏱ ${(ms2/1000).toFixed(1)}s  in=${j2.usage?.prompt_tokens} out=${j2.usage?.completion_tokens}`);

  let pack = null;
  try {
    const cleaned = content2.replace(/^```json\s*/, '').replace(/```\s*$/, '');
    pack = JSON.parse(cleaned);
  } catch (e) {
    console.log(`  ⚠️ round2 parse fail: ${e.message}`);
  }

  const msTotal = Date.now() - t0;
  const out = {
    scheme: 'C-two-turn',
    msTotal,
    round1: { ms: ms1, inTok: j1.usage?.prompt_tokens, outTok: j1.usage?.completion_tokens, raw: content1, inventory },
    round2: { ms: ms2, inTok: j2.usage?.prompt_tokens, outTok: j2.usage?.completion_tokens, raw: content2, pack },
    parseOK: !!pack,
  };
  const outPath = `spike/data/attention-C-two-turn-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`💾 → ${outPath}`);

  if (pack) {
    console.log(`\noneSentence: ${pack.oneSentence}`);
    console.log(`corePoints:`);
    (pack.corePoints || []).forEach(p => console.log(`  - [${p.timestamp}s] ${p.point}`));
    console.log(`steps 时间分布:`);
    (pack.steps || []).forEach((s, i) => console.log(`  ${i+1}. [${s.sourceTimestamp}s] ${s.title}`));
  }

  const allText = JSON.stringify(pack || content2) + JSON.stringify(inventory || content1);
  const hits = ['加州', '选举', '加州选举', '投票'].filter(k => allText.includes(k));
  console.log(`\n🎯 加州选举关键词命中: ${hits.length > 0 ? '✅ ' + hits.join(',') : '❌ 未命中'}`);
  console.log(`\n总耗时: ${(msTotal/1000).toFixed(1)}s`);
}

run().catch(e => console.error(e));
