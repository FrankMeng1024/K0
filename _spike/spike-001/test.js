// SPIKE-001: YouTube 官方字幕抓取
// 用法: node test.js
import { YoutubeTranscript } from 'youtube-transcript';
import fs from 'fs';

// 5 个 URL: 3 英 + 2 中
const urls = [
  { id: 'en-01', title: 'Rick Astley - Never Gonna Give You Up (has captions)', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', lang: 'en' },
  { id: 'en-02', title: 'TED talk sample', url: 'https://www.youtube.com/watch?v=ZSt9tm3RoUU', lang: 'en' }, // Ken Robinson: schools kill creativity
  { id: 'en-03', title: 'Steve Jobs 2005 Stanford', url: 'https://www.youtube.com/watch?v=UF8uR6Z6KLc', lang: 'en' },
  { id: 'zh-01', title: 'Chinese podcast sample', url: 'https://www.youtube.com/watch?v=bZkp7q19f0A', lang: 'zh' }, // PSY - Gangnam Style (has multiple lang captions)
  { id: 'zh-02', title: 'Bilingual sample', url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', lang: 'zh' }, // "Me at the zoo" - first YouTube video
];

async function fetchOne(item) {
  const t0 = Date.now();
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(item.url);
    const elapsed = Date.now() - t0;
    const totalChars = transcript.reduce((a, t) => a + (t.text?.length || 0), 0);
    const firstText = transcript[0]?.text || '';
    const lastText = transcript[transcript.length - 1]?.text || '';
    return {
      id: item.id,
      url: item.url,
      expected_lang: item.lang,
      status: 'ok',
      elapsed_ms: elapsed,
      segments: transcript.length,
      total_chars: totalChars,
      first_line: firstText.slice(0, 80),
      last_line: lastText.slice(0, 80),
      duration_estimate_s: transcript[transcript.length - 1]?.offset ? (transcript[transcript.length - 1].offset + transcript[transcript.length - 1].duration) / 1000 : null,
    };
  } catch (e) {
    return {
      id: item.id,
      url: item.url,
      expected_lang: item.lang,
      status: 'error',
      elapsed_ms: Date.now() - t0,
      error: e.message,
    };
  }
}

const results = [];
for (const item of urls) {
  console.log(`\n=== ${item.id}: ${item.title} ===`);
  const r = await fetchOne(item);
  console.log(`status=${r.status} elapsed=${r.elapsed_ms}ms`);
  if (r.status === 'ok') {
    console.log(`  segments=${r.segments}, chars=${r.total_chars}, dur~${r.duration_estimate_s?.toFixed(0)}s`);
    console.log(`  first: "${r.first_line}"`);
    console.log(`  last:  "${r.last_line}"`);
  } else {
    console.log(`  ERROR: ${r.error}`);
  }
  results.push(r);
}

fs.writeFileSync('results.json', JSON.stringify(results, null, 2));

console.log('\n---- SUMMARY ----');
const ok = results.filter(r => r.status === 'ok').length;
const okResults = results.filter(r => r.status === 'ok');
const avgMs = okResults.length ? Math.round(okResults.reduce((a,r) => a + r.elapsed_ms, 0) / okResults.length) : 0;
console.log(`success: ${ok}/${results.length}, avg latency (ok only): ${avgMs}ms`);
