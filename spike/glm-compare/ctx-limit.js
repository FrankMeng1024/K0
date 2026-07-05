// 探测 GLM-5.2 真实 context 上限
// 策略：从 32K → 64K → 128K → 200K 递增测试

const API_KEY = '25b1986b20e44755a4c8d6a4f2a74cf8.pDZFjxSUjpJhyIrd';
const URL = 'https://open.bigmodel.cn/api/coding/paas/v4/chat/completions';

async function testSize(model, targetTokens) {
  // 中文平均 1.5 字/token，生成一段填充文本
  const chars = Math.floor(targetTokens * 1.5);
  const filler = '这是一段测试文本，用于验证模型的上下文处理能力。'.repeat(Math.ceil(chars / 24));
  const trimmed = filler.slice(0, chars);

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
        messages: [
          { role: 'system', content: '简短回答用户问题。' },
          { role: 'user', content: `${trimmed}\n\n以上文本大概有多少字？只回答数字。` }
        ],
        max_tokens: 20,
        temperature: 0.1,
      }),
    });
    const ms = Date.now() - t0;
    if (!r.ok) {
      const err = await r.text();
      return { targetTokens, ok: false, ms, status: r.status, err: err.slice(0, 200) };
    }
    const j = await r.json();
    return {
      targetTokens,
      ok: true,
      ms,
      inTok: j.usage?.prompt_tokens,
      outTok: j.usage?.completion_tokens,
      response: j.choices?.[0]?.message?.content?.slice(0, 100),
    };
  } catch (e) {
    return { targetTokens, ok: false, err: e.message };
  }
}

const model = process.argv[2] || 'glm-5.2';
const sizes = [16000, 32000, 64000, 100000, 128000, 200000, 500000];

console.log(`=== Context 上限探测: ${model} ===\n`);
for (const size of sizes) {
  process.stdout.write(`▶ ${size.toString().padStart(6)} tokens ... `);
  const r = await testSize(model, size);
  if (r.ok) {
    console.log(`✅ ${(r.ms/1000).toFixed(1)}s  真实 in=${r.inTok}  out=${r.outTok}`);
  } else {
    console.log(`❌ ${r.status || 'err'} ${(r.err || '').slice(0, 80)}`);
    if (r.status === 400 || r.err?.includes('length') || r.err?.includes('token')) {
      console.log(`   → 上限在 ${size} tokens 以下`);
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1500));
}
