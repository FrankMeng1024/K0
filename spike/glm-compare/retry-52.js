// 重跑 glm-5.2, max_tokens 8192
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

const d = JSON.parse(fs.readFileSync('spike/data/spike-014-bcut-1783248759707.json', 'utf-8'));
const transcript = d.segments.map(s => `[${s.start.toFixed(0)}-${s.end.toFixed(0)}s] ${s.text}`).join('\n');

console.log('Retrying glm-5.2 with max_tokens=8192...');
const t0 = Date.now();
const r = await fetch(URL, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'glm-5.2',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: '以下是播客转录：\n\n' + transcript }
    ],
    temperature: 0.7,
    max_tokens: 8192,
  }),
});
const j = await r.json();
const ms = Date.now() - t0;
const content = j.choices?.[0]?.message?.content?.trim() || '';
let pack = null;
try {
  pack = JSON.parse(content.replace(/^```json\s*/, '').replace(/```\s*$/, ''));
} catch (e) {
  console.log('parse fail:', e.message);
}
console.log(`Done: ${(ms/1000).toFixed(1)}s  in=${j.usage?.prompt_tokens}  out=${j.usage?.completion_tokens}  parseOK=${!!pack}`);
if (pack) console.log('oneSentence:', pack.oneSentence);

fs.writeFileSync('spike/data/spike-016-glm52-retry.json',
  JSON.stringify({ ok: !!pack, ms, pack, raw: content, usage: j.usage }, null, 2));
console.log('→ spike/data/spike-016-glm52-retry.json');
