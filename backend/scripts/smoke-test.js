#!/usr/bin/env node
// K0 Sprint 8 smoke test - Frank 早晨快速验收前跑一遍确认生产健康
// Usage: node backend/scripts/smoke-test.js [--prod]
//   --prod  跑生产环境 https://api.k0.yiiling.cn
//   默认    本地 http://localhost:3002

const IS_PROD = process.argv.includes('--prod');
const BASE = IS_PROD ? 'https://api.k0.yiiling.cn' : 'http://localhost:3002';

// 已缓存的黄金 URLs（不烧 GLM）
const CASES = [
  { name: '小宇宙-硬地骇客', url: 'https://www.xiaoyuzhoufm.com/episode/6a281b8434bdac55b506eb7b', goal: 'quick_understand', expectCached: true },
  { name: 'Apple-声动早咖啡', url: 'https://podcasts.apple.com/cn/podcast/%E5%A3%B0%E5%8A%A8%E6%97%A9%E5%92%96%E5%95%A1/id1573189055?i=1000775249395', goal: 'quick_understand', expectCached: true },
];

function fmt(ms) {
  return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
}

async function runCase(c, idx) {
  console.log(`\n[${idx + 1}/${CASES.length}] ${c.name}`);
  console.log(`  URL: ${c.url.slice(0, 70)}`);

  const t0 = Date.now();
  const submitRes = await fetch(`${BASE}/api/episodes/import-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: c.url, goal: c.goal, anonymousId: `smoke-${Date.now()}` }),
  });
  if (!submitRes.ok) {
    console.log(`  ❌ submit failed: HTTP ${submitRes.status}`);
    return { ok: false, name: c.name };
  }
  const { jobId } = await submitRes.json();

  for (let poll = 1; poll <= 90; poll++) {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`${BASE}/api/jobs/${jobId}`);
    if (!r.ok) continue;
    const s = await r.json();
    if (s.status === 'ready') {
      const totalMs = Date.now() - t0;
      // Verify pack API too
      const packRes = await fetch(`${BASE}/api/packs/${s.packId}`);
      if (!packRes.ok) {
        console.log(`  ❌ pack fetch failed: ${packRes.status}`);
        return { ok: false, name: c.name };
      }
      const packData = await packRes.json();
      const pack = packData.pack;
      const stepsOk = Array.isArray(pack?.steps) && pack.steps.length === 6;
      const cardsOk = Array.isArray(pack?.cards) && pack.cards.length >= 3;
      const actionsOk = pack?.actions?.today && pack?.actions?.thisWeek && pack?.actions?.longTerm;
      const titleOk = !!packData.episodeTitle;
      const podcastOk = !!packData.podcastName;
      const cacheHit = !!s.cacheHit;

      console.log(`  ✅ ready in ${fmt(totalMs)}  packId=${s.packId}${cacheHit ? ' (cached)' : ''}`);
      console.log(`     steps:${stepsOk?'✅':'❌'} cards:${cardsOk?'✅':'❌'} actions:${actionsOk?'✅':'❌'} title:${titleOk?'✅':'❌'} podcast:${podcastOk?'✅':'❌'}`);
      if (c.expectCached && !cacheHit) {
        console.log(`  ⚠️  expected cache hit but got fresh generation`);
      }
      return { ok: stepsOk && cardsOk && actionsOk && titleOk && podcastOk, name: c.name, totalMs, cached: cacheHit };
    }
    if (s.status === 'failed') {
      console.log(`  ❌ failed: ${s.errorCode} - ${s.errorMessage}`);
      return { ok: false, name: c.name, error: s.errorCode };
    }
  }
  console.log(`  ❌ timeout (3min)`);
  return { ok: false, name: c.name, error: 'timeout' };
}

async function main() {
  console.log(`═════════════════════════════════════`);
  console.log(`K0 Sprint 8 Smoke Test`);
  console.log(`Target: ${BASE}`);
  console.log(`═════════════════════════════════════`);

  // Health check
  const healthT0 = Date.now();
  const health = await fetch(`${BASE}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.log(`❌ Health check failed at ${BASE}/health`);
    process.exit(1);
  }
  const healthData = await health.json();
  console.log(`✅ /health ${fmt(Date.now() - healthT0)}  db=${healthData.db?.ok ? 'OK' : 'FAIL'} (${healthData.db?.latency_ms}ms)`);

  // 端到端 pipeline cases
  const results = [];
  for (let i = 0; i < CASES.length; i++) {
    results.push(await runCase(CASES[i], i));
  }

  console.log(`\n═════════════════════════════════════`);
  const ok = results.filter(r => r.ok).length;
  console.log(`Summary: ${ok}/${results.length} passed`);
  console.log(`═════════════════════════════════════`);
  results.forEach(r => {
    const status = r.ok ? '✅' : '❌';
    console.log(`  ${status} ${r.name.padEnd(30)} ${r.ok ? fmt(r.totalMs) : (r.error || 'unknown')}`);
  });

  process.exit(ok === results.length ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
