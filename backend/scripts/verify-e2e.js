#!/usr/bin/env node
// Sprint 6 端到端 5 URL 验证
// 3 小宇宙 (含已缓存 + 新集) + 2 Apple

const URLS = [
  { platform: '小宇宙-硬地骇客-已缓存', url: 'https://www.xiaoyuzhoufm.com/episode/6a281b8434bdac55b506eb7b', goal: 'quick_understand' },
  { platform: '小宇宙-无人知晓', url: 'https://www.xiaoyuzhoufm.com/episode/69a64629de29766da93331ec', goal: 'deep_learn' },
  { platform: '小宇宙-42章经', url: 'https://www.xiaoyuzhoufm.com/episode/6a2a808262c3d8534722ac02', goal: 'find_actions' },
  { platform: 'Apple-张小珺', url: 'https://podcasts.apple.com/cn/podcast/id1634356920', goal: 'deep_learn' },
  { platform: 'Apple-疯投圈', url: 'https://podcasts.apple.com/cn/podcast/id1088178402', goal: 'quick_understand' },
];

const BASE = 'http://localhost:3002';
const ANON = 'test-verification-' + Date.now();

async function submitAndPoll(item, idx) {
  console.log(`\n[${idx+1}/${URLS.length}] ${item.platform}`);
  console.log(`  URL: ${item.url.slice(0, 70)}`);
  console.log(`  Goal: ${item.goal}`);

  const t0 = Date.now();
  const submitResp = await fetch(`${BASE}/api/episodes/import-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: item.url, goal: item.goal, anonymousId: ANON }),
  });
  if (!submitResp.ok) {
    const err = await submitResp.text();
    console.log(`  ❌ submit fail: ${err}`);
    return { ...item, ok: false, error: err };
  }
  const { jobId } = await submitResp.json();
  console.log(`  jobId: ${jobId}`);

  let lastStage = '';
  for (let poll = 1; poll <= 30; poll++) {
    await new Promise(r => setTimeout(r, 10000)); // 10s
    const r = await fetch(`${BASE}/api/jobs/${jobId}`);
    const s = await r.json();
    if (s.stageMessage !== lastStage) {
      console.log(`  [${poll * 10}s] ${s.status} ${s.progress}% ${s.stageMessage}`);
      lastStage = s.stageMessage;
    }
    if (s.status === 'ready') {
      const packR = await fetch(`${BASE}/api/packs/${s.packId}`);
      const packData = await packR.json();
      const totalMs = Date.now() - t0;
      const pack = packData.pack;
      console.log(`  ✅ ready in ${(totalMs/1000).toFixed(1)}s  packId=${s.packId}  cache=${s.cacheHit}`);
      console.log(`     oneSentence: ${(pack.oneSentence || '').slice(0, 60)}`);
      console.log(`     corePoints: ${pack.corePoints?.length}, steps: ${pack.steps?.length}, cards: ${pack.cards?.length}`);
      return { ...item, ok: true, jobId, packId: s.packId, totalMs, cacheHit: s.cacheHit, pack };
    }
    if (s.status === 'failed') {
      console.log(`  ❌ failed: ${s.errorCode} — ${s.errorMessage}`);
      return { ...item, ok: false, error: `${s.errorCode}: ${s.errorMessage}` };
    }
  }
  return { ...item, ok: false, error: 'poll timeout (>5min)' };
}

async function main() {
  const results = [];
  for (let i = 0; i < URLS.length; i++) {
    results.push(await submitAndPoll(URLS[i], i));
  }

  console.log('\n═══════════════════════════════════════');
  console.log('Sprint 6 端到端验证结果');
  console.log('═══════════════════════════════════════');
  const ok = results.filter(r => r.ok).length;
  console.log(`成功率: ${ok}/${results.length}`);
  console.log();
  for (const r of results) {
    const status = r.ok ? '✅' : '❌';
    console.log(`${status} ${r.platform.padEnd(30)} ${r.ok ? `${(r.totalMs/1000).toFixed(1)}s pack=${r.packId} cache=${r.cacheHit}` : r.error}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
