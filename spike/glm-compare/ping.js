// SPIKE-016 前置：GLM 各型号存活探测
// 用最简单的 hello 请求确认 key 对哪些模型有权限

const API_KEY = '76abfcaf43fe465a8faa15d66b1524ab.uaevFFL3CQiy8vjv';
const URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

const MODELS = [
  'glm-4-flash',
  'glm-4-air',
  'glm-4-plus',
  'glm-4.6',
  'glm-4.5',
  'glm-4-airx',
  'glm-4-flashx',
  'glm-4-long',
  'glm-4-0520',
];

async function ping(model) {
  const t0 = Date.now();
  try {
    const r = await fetch(URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
      }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const errText = await r.text();
      return { model, ok: false, ms, status: r.status, err: errText.slice(0, 200) };
    }
    const j = await r.json();
    return {
      model,
      ok: true,
      ms,
      response: j.choices?.[0]?.message?.content?.slice(0, 30) || '',
      inTok: j.usage?.prompt_tokens,
      outTok: j.usage?.completion_tokens,
    };
  } catch (e) {
    return { model, ok: false, err: e.message };
  }
}

console.log('=== GLM 模型存活探测 ===\n');
for (const m of MODELS) {
  const r = await ping(m);
  if (r.ok) {
    console.log(`✅ ${m}  ${r.ms}ms  in=${r.inTok} out=${r.outTok}  "${r.response}"`);
  } else {
    console.log(`❌ ${m}  ${r.status || '?'}  ${(r.err || '').slice(0, 100)}`);
  }
  await new Promise(r => setTimeout(r, 500));
}
