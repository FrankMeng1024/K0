// GLM Coding Plan Lite 模型名探测
const API_KEY = '76abfcaf43fe465a8faa15d66b1524ab.uaevFFL3CQiy8vjv';
const URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

// Coding Plan Lite 说的是 GLM-4.5 / GLM-4.6 / GLM-5，但 API name 可能不同
const MODELS = [
  'glm-4.5', 'glm-4.6', 'glm-5',
  'GLM-4.5', 'GLM-4.6', 'GLM-5',        // 大写
  'glm-4.5v', 'glm-4.5-air', 'glm-4.5-x',
  'glm-4.6-air', 'glm-4.6-x',
  'glm-5-plus', 'glm-5-air',
  'glm-zero-preview',                     // 深度思考
  'codegeex-4',                           // 编程模型
  'glm-4-flash',                          // baseline
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
      body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'hi' }], max_tokens: 3 }),
    });
    const ms = Date.now() - t0;
    if (r.ok) {
      const j = await r.json();
      console.log(`✅ ${m.padEnd(20)} ${ms}ms  "${j.choices?.[0]?.message?.content || ''}"`);
    } else {
      const err = (await r.text()).slice(0, 100);
      console.log(`❌ ${m.padEnd(20)} ${r.status}  ${err}`);
    }
  } catch (e) {
    console.log(`❌ ${m.padEnd(20)} err ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 400));
}
