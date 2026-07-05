// GLM Coding Plan Lite - 探测可用模型
// 用套餐专属 API Key + endpoint: https://open.bigmodel.cn/api/coding/paas/v4

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

const MODELS = [
  'glm-4.7',
  'glm-5.2',
  'glm-5-turbo',
  'GLM-4.7',
  'GLM-5.2',
  'GLM-5-Turbo',
  'glm-5.2-air',
  // 也顺便试试通用 endpoint 用套餐 key
  'glm-4-flash',
  'glm-4.5',
  'glm-4.6',
];

for (const m of MODELS) {
  const t0 = Date.now();
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: m,
        messages: [{ role: 'user', content: 'ping, respond with just OK' }],
        max_tokens: 10,
      }),
    });
    const ms = Date.now() - t0;
    if (r.ok) {
      const j = await r.json();
      console.log(`✅ ${m.padEnd(20)} ${ms}ms  in=${j.usage?.prompt_tokens} out=${j.usage?.completion_tokens}  "${(j.choices?.[0]?.message?.content || '').slice(0, 30)}"`);
    } else {
      const err = (await r.text()).slice(0, 120);
      console.log(`❌ ${m.padEnd(20)} ${r.status}  ${err}`);
    }
  } catch (e) {
    console.log(`❌ ${m.padEnd(20)} err ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 400));
}
