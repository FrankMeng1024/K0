// SPIKE-003: GLM-4-plus 端到端结构化 JSON 测试
// 用法: GLM_API_KEY=xxx node test.js
import { z } from 'zod';
import fs from 'fs';

const API_KEY = process.env.GLM_API_KEY;
if (!API_KEY) { console.error('缺 GLM_API_KEY'); process.exit(1); }

const API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL = process.env.GLM_MODEL || 'glm-4-flash';

// ---- zod schema ----
const learningPackSchema = z.object({
  snapshot: z.object({
    one_line: z.string().min(1).max(200),
    three_points: z.array(z.string().min(1)).length(3),
    value_score: z.number().min(1).max(10),
  }),
  learning_path: z.array(z.object({
    step: z.number(),
    title: z.string().min(1),
    description: z.string().min(1),
  })).length(6),
  cards: z.array(z.object({
    type: z.enum(['concept', 'framework', 'example', 'action', 'quote']),
    front: z.string().min(1),
    back: z.string().min(1),
  })).min(5).max(10),
  actions: z.object({
    today: z.array(z.string()).min(1).max(3),
    this_week: z.array(z.string()).min(1).max(3),
    long_term: z.array(z.string()).min(1).max(2),
  }),
  quiz: z.array(z.object({
    question: z.string().min(1),
    options: z.array(z.string()).length(4),
    correct_index: z.number().min(0).max(3),
    explanation: z.string().min(1),
  })).min(3).max(5),
});

// ---- 5 个测试样本（3 英 + 2 中）----
const samples = [
  {
    id: 'en-01-huberman-sleep',
    title: 'Toolkit for Sleep',
    source: 'Huberman Lab Podcast',
    duration: '15 min',
    language: 'en',
    transcript: `The most important thing you can do to fall asleep and stay asleep is to view sunlight within 30 to 60 minutes of waking. This sets your cortisol rhythm which is directly tied to your melatonin release later at night. Second, avoid bright artificial light between 10 PM and 4 AM — even a brief exposure can suppress melatonin for 90 minutes. Third, keep your bedroom cool, around 65-68°F. Your body temperature must drop 1-3 degrees to fall asleep. Fourth, if you can't sleep, do NST — non-sleep deep rest, a form of guided body scan for 10-20 minutes. It restores dopamine and calms the nervous system. Fifth, avoid caffeine after 2 PM. Its half-life is 5 hours; a coffee at 3 PM still has half its effect at 8 PM.`,
  },
  {
    id: 'en-02-lex-agi',
    title: 'What is Intelligence',
    source: 'Lex Fridman Podcast',
    duration: '20 min',
    language: 'en',
    transcript: `Intelligence is not just about solving problems — it's about compression. When you truly understand something, you can describe it more concisely. A physicist who understands gravity uses one equation where a novice needs a thousand words. This is the essence of understanding: finding the minimum description length. Language models today are doing something similar — they compress human knowledge into weights. But there is a difference between compressing patterns and understanding causality. A model can predict that clouds precede rain without understanding evaporation. True intelligence requires causal models — the ability to imagine counterfactuals. What if X had not happened? The next step in AI is not scale, but structured causal reasoning built on top of statistical foundation models.`,
  },
  {
    id: 'en-03-tim-focus',
    title: 'The One Habit That Changed Everything',
    source: 'The Tim Ferriss Show',
    duration: '10 min',
    language: 'en',
    transcript: `The habit that transformed my productivity was writing three "morning pages" every day — three handwritten pages of stream of consciousness before checking my phone. It sounds trivial, but it has three effects. First, it drains anxiety onto paper so your prefrontal cortex is not carrying it during the day. Second, it forces you to slow your thoughts — writing is slower than thinking, so you notice which thoughts loop. Third, patterns emerge over weeks. You see the same worry, the same excuse, three times in a row and you finally act. It also protects the first 30 minutes from other people's priorities — email, Slack, news. Those things will always be there. The version of you that sees them first is not the version of you that gets deep work done.`,
  },
  {
    id: 'zh-01-luoji',
    title: '如何真正读一本书',
    source: '逻辑思维',
    duration: '18 min',
    language: 'zh',
    transcript: `很多人以为读书就是把书从头到尾看完，其实这只是最低层次。第一层是浏览：你知道这本书大概讲了什么，能给别人一句话总结。第二层是理解：你能用自己的话把作者的核心论证复述出来，包括反面观点。第三层是应用：你能把书里的方法或框架用在自己的工作和生活里，一周后回头看有具体行动。第四层才是最难的：批判性阅读——你能看出作者在哪里回避了矛盾、哪里用了修辞技巧、哪些地方数据薄弱。真正的高手读书从来不是"读完"，而是"改变"。读完这本书，你的一个决策改变了吗？你的一个习惯改变了吗？如果没有，这本书对你就等于没读。所以我给自己定了一个规则：每读一本书，必须写下三个"我要改变的行动"，一个月后回来核对。执行了几个？没执行的原因？这才是把书变成能力的方式。`,
  },
  {
    id: 'zh-02-jike',
    title: '为什么大多数创业公司死在产品上',
    source: '疾客晚知道',
    duration: '25 min',
    language: 'zh',
    transcript: `大多数创业公司不是死在缺钱、不是死在缺人、不是死在竞争太激烈——它们死在做了没人真正需要的产品。这不是"愿景不好"，而是"没有验证需求"。硅谷有个概念叫 fake door test：在你写第一行代码之前，做一个假的落地页，描述你要做的产品，投一点点广告，看有没有人点、有没有人留邮箱。如果落地页都没人看，你花半年做出来也不会有人用。第二个坑是 feature creep：产品还没被证明有价值，就已经加了 20 个功能。每加一个功能，就多一份维护成本、多一份 bug、多一份分散注意力。第三个坑是"和用户谈需求"——用户会告诉你他们想要什么，但用户从来不会真的用他们说想要的东西。所以正确的方法不是问用户"你想要什么"，而是观察他们真实的行为。他们花时间在什么上？他们在什么地方抱怨？他们愿意为什么付钱？付钱是最诚实的行为。`,
  },
];

const systemPrompt = fs.readFileSync('../../docs/prompts/glm-learning-pack.md', 'utf-8')
  .match(/## System Prompt\s+```([\s\S]+?)```/)[1].trim();

async function callGlm(sample) {
  const userPrompt = `标题：${sample.title}\n来源：${sample.source}\n时长：${sample.duration}\n语言：${sample.language}\n\n转录内容：\n${sample.transcript}\n\n请生成学习包 JSON。`;
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
    top_p: 0.7,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  };
  const t0 = Date.now();
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const elapsed = Date.now() - t0;
  const data = await res.json();
  if (!res.ok) {
    return { sample_id: sample.id, status: 'http_error', http: res.status, error: JSON.stringify(data), elapsed_ms: elapsed };
  }
  const raw = data.choices?.[0]?.message?.content;
  const usage = data.usage || {};
  try {
    const parsed = JSON.parse(raw);
    const validated = learningPackSchema.parse(parsed);
    return {
      sample_id: sample.id,
      status: 'ok',
      elapsed_ms: elapsed,
      tokens: usage,
      json: validated,
    };
  } catch (e) {
    return {
      sample_id: sample.id,
      status: 'invalid_json_or_schema',
      elapsed_ms: elapsed,
      tokens: usage,
      raw_output: raw?.slice(0, 500),
      validation_error: e.message,
    };
  }
}

const results = [];
for (const s of samples) {
  console.log(`\n=== ${s.id} (${s.language}) ===`);
  try {
    const r = await callGlm(s);
    console.log(`status=${r.status} elapsed=${r.elapsed_ms}ms tokens=in:${r.tokens?.prompt_tokens || '?'}/out:${r.tokens?.completion_tokens || '?'}`);
    if (r.status === 'ok') {
      console.log(`  snapshot: ${r.json.snapshot.one_line}`);
      console.log(`  cards: ${r.json.cards.length}, quiz: ${r.json.quiz.length}`);
    } else {
      console.log(`  ERROR: ${r.validation_error || r.error}`);
    }
    results.push(r);
  } catch (e) {
    console.log(`  fatal: ${e.message}`);
    results.push({ sample_id: s.id, status: 'fatal', error: e.message });
  }
}

fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
console.log('\n---- SUMMARY ----');
const ok = results.filter(r => r.status === 'ok').length;
const avgMs = Math.round(results.filter(r => r.elapsed_ms).reduce((a,r) => a + r.elapsed_ms, 0) / results.length);
const totalIn = results.reduce((a,r) => a + (r.tokens?.prompt_tokens || 0), 0);
const totalOut = results.reduce((a,r) => a + (r.tokens?.completion_tokens || 0), 0);
console.log(`success: ${ok}/${results.length}, avg latency: ${avgMs}ms, total tokens: in=${totalIn} out=${totalOut}`);
// GLM-4-plus 定价: input ~0.05元/千 tokens, output ~0.05元/千 tokens (2025 官方定价，若变动重新核算)
const costPerCallCny = ((totalIn/results.length)*0.05 + (totalOut/results.length)*0.05)/1000;
console.log(`estimated cost per learning pack: ¥${costPerCallCny.toFixed(4)}`);
