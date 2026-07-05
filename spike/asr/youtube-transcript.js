// SPIKE-YOUTUBE: YouTube 字幕抓取（不抓音频）
// 策略：调用 YouTube 官方 timedtext API（免登录、免 API key）
//   GET https://www.youtube.com/api/timedtext?v=<videoId>&lang=<lang>&fmt=json3
//
// 境内直连大概率被 GFW 拦（SNI 阻断 www.youtube.com）
// 如果直连失败，可以：
//   A. Cloudflare Workers 免费转发（10 万请求/日免费）
//   B. 用户手机开 VPN，App 端直调（backend 不参与）
//
// 本 spike 先测直连；直连失败就明确记录、不硬扛。

import fs from 'node:fs';

const SAMPLE_VIDEOS = [
  // 中文
  { id: 'HKjJd12EAK4', label: '张小珺 x SpaceX 中文访谈', lang: 'zh-Hans' },
  { id: 'kCc8FmEb1nY', label: 'Andrej Karpathy - Neural Nets: Zero to Hero', lang: 'en' },
  { id: 'l8pRSuU81PU', label: 'Andrej Karpathy - Let\'s reproduce GPT-2', lang: 'en' },
  { id: '7xTGNNLPyMI', label: 'Lex Fridman - Sam Altman 3', lang: 'en' },
  { id: 'qCbfTN-caFI', label: '3Blue1Brown - Transformers', lang: 'en' },
];

async function fetchTranscript(videoId, lang = 'en') {
  const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
  const t0 = Date.now();
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8',
    },
    // AbortController 15s timeout
    signal: AbortSignal.timeout(15000),
  });
  const ms = Date.now() - t0;
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const text = await resp.text();
  if (!text || text.trim() === '') throw new Error('empty response (no subs?)');
  try {
    const j = JSON.parse(text);
    const events = j.events || [];
    const segs = [];
    for (const ev of events) {
      if (!ev.segs) continue;
      const start = (ev.tStartMs || 0) / 1000;
      const dur = (ev.dDurationMs || 0) / 1000;
      const seg = ev.segs.map(s => s.utf8 || '').join('').trim();
      if (seg) segs.push({ start, end: start + dur, text: seg });
    }
    return { ms, segments: segs, size: text.length };
  } catch (e) {
    return { ms, error: `parse: ${e.message}`, rawLen: text.length };
  }
}

// ── main ──
console.log('=== SPIKE-YOUTUBE: 字幕直连测试 ===\n');
const results = [];
for (const v of SAMPLE_VIDEOS) {
  process.stdout.write(`▶ [${v.lang}] ${v.label} (id=${v.id})\n`);
  try {
    const r = await fetchTranscript(v.id, v.lang);
    if (r.error) {
      console.log(`  ⚠️  ${r.error} (raw ${r.rawLen} bytes)`);
      results.push({ ...v, ok: false, ...r });
    } else {
      console.log(`  ✅ ${r.segments.length} segs, ${r.ms}ms, ${r.size}B`);
      console.log(`     first: ${r.segments[0]?.text.slice(0, 50)}`);
      results.push({ ...v, ok: true, segCount: r.segments.length, ms: r.ms, size: r.size });
    }
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    results.push({ ...v, ok: false, error: e.message });
  }
}

const csv = ['videoId,label,lang,ok,segCount,ms,size,error'];
results.forEach(r => {
  csv.push([r.id, `"${r.label}"`, r.lang, r.ok, r.segCount||'', r.ms||'', r.size||'', `"${r.error||''}"`].join(','));
});
fs.writeFileSync('spike/data/spike-youtube-transcript.csv', csv.join('\n'));

const okCount = results.filter(r => r.ok).length;
console.log(`\n═══ ${okCount}/${results.length} 成功 ═══`);
console.log(okCount === 0 ? '❌ 全部失败 —— 大概率 GFW 阻断，需 CF Workers 代理' : '✅ YouTube 字幕在境内可用');
