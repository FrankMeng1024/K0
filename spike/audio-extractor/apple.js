// SPIKE-011: Apple Podcasts audio URL 提取器
// 策略：
//   1. 从 URL 提取 podcastId（/id123）+ episodeId（?i=456）
//   2. iTunes lookup API（境内可直连）：GET /lookup?id=<podcastId>&entity=podcast → feedUrl
//   3. iTunes lookup episode：GET /lookup?id=<episodeId>&entity=podcastEpisode → episodeGuid + trackName
//   4. axios 抓 RSS → 遍历 items → 用 guid/title 匹配到具体 item → enclosure.url
//
// 参考：SPIKE-009 subagent 报告 + Apple 官方 iTunes Search API
//
// 用法：
//   node spike/audio-extractor/apple.js https://podcasts.apple.com/cn/podcast/xxx/id123?i=456
//   node spike/audio-extractor/apple.js batch spike/data/apple-samples.txt
//   node spike/audio-extractor/apple.js podcast 1634356920  # 拿单个节目的最新集
//   node spike/audio-extractor/apple.js seed  # 自动生成 20 集样本

import fs from 'node:fs';
import { XMLParser } from 'fast-xml-parser';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
// 兼容三种格式：
//   /podcast/<slug>/id123?i=456
//   /podcast/id123?i=456
//   /podcast/id123
const APPLE_URL_RE = /podcasts\.apple\.com\/[^/]+\/podcast\/(?:[^/?]+\/)?id(\d+)(?:\?.*?i=(\d+))?/;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  parseAttributeValue: false,
  // 疯投圈这类 RSS entity 数 >1000，放大 limit 防触发 XXE 保护
  processEntities: false,
});

/**
 * iTunes lookup：拿节目/单集元数据
 */
async function itunesLookup(id, entity /* 'podcast' | 'podcastEpisode' */) {
  const url = `https://itunes.apple.com/lookup?id=${id}&entity=${entity}`;
  const resp = await fetch(url, { headers: { 'User-Agent': UA }});
  if (!resp.ok) throw new Error(`iTunes lookup HTTP ${resp.status}`);
  const j = await resp.json();
  return j.results?.[0] || null;
}

/**
 * 从 Apple Podcasts URL 抽 mp3/m4a 直链
 */
export async function extractAppleAudio(appleUrl) {
  const m = appleUrl.match(APPLE_URL_RE);
  if (!m) throw new Error(`非法 Apple Podcasts URL: ${appleUrl}`);
  const [, podcastId, episodeId] = m;

  const t0 = Date.now();

  // 1. 拿 podcast 元数据（feedUrl 是核心）
  const podcast = await itunesLookup(podcastId, 'podcast');
  if (!podcast?.feedUrl) throw new Error(`no feedUrl for podcast ${podcastId}`);

  // 2. 抓 RSS
  const rssResp = await fetch(podcast.feedUrl, { headers: { 'User-Agent': UA }});
  if (!rssResp.ok) throw new Error(`RSS HTTP ${rssResp.status} from ${podcast.feedUrl}`);
  const xml = await rssResp.text();
  const feed = parser.parse(xml);
  const items = feed?.rss?.channel?.item;
  if (!items) throw new Error(`no items in RSS ${podcast.feedUrl}`);
  const itemArr = Array.isArray(items) ? items : [items];

  // 3. 匹配 episode
  let matchedItem = null;
  let matchSource = null;
  if (episodeId) {
    // 用 iTunes lookup episode 拿 episodeGuid / trackName 匹配
    try {
      const ep = await itunesLookup(episodeId, 'podcastEpisode');
      if (ep) {
        const targetGuid = ep.episodeGuid;
        const targetName = ep.trackName;
        matchedItem = itemArr.find(it => {
          const g = typeof it.guid === 'string' ? it.guid : it.guid?.['#text'] || it.guid?.['@_isPermaLink'];
          return (targetGuid && g === targetGuid) || (targetName && it.title === targetName);
        });
        if (matchedItem) matchSource = targetGuid && matchedItem.guid ? 'guid' : 'title';
      }
    } catch (e) {
      // iTunes episode lookup 失败也不阻塞，退到 fallback
    }
  }
  if (!matchedItem) {
    // Fallback: 拿最新一集
    matchedItem = itemArr[0];
    matchSource = 'newest-fallback';
  }

  // 4. 从 item 拿 enclosure.url
  const enclosure = matchedItem.enclosure;
  const audioUrl = enclosure?.['@_url'];
  const audioType = enclosure?.['@_type'];
  const audioSize = enclosure?.['@_length'];

  if (!audioUrl) throw new Error('item has no enclosure.url');

  // 5. 检查 Podcast 2.0 transcript
  let transcriptUrl = null;
  const trans = matchedItem['podcast:transcript'];
  if (trans) {
    const t = Array.isArray(trans) ? trans[0] : trans;
    transcriptUrl = t?.['@_url'] || null;
  }

  const fetchMs = Date.now() - t0;
  return {
    podcastId,
    episodeId: episodeId || null,
    podcast: podcast.collectionName,
    feedUrl: podcast.feedUrl,
    title: matchedItem.title,
    audioUrl,
    audioType,
    audioSize,
    transcriptUrl,
    matchSource,
    fetchMs,
  };
}

/**
 * 探测 audio 直链
 */
export async function probeAudio(audioUrl) {
  const t0 = Date.now();
  const resp = await fetch(audioUrl, {
    method: 'HEAD',
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  const headMs = Date.now() - t0;
  return {
    status: resp.status,
    contentLength: parseInt(resp.headers.get('content-length') || '0', 10),
    contentType: resp.headers.get('content-type'),
    acceptRanges: resp.headers.get('accept-ranges') === 'bytes',
    headMs,
    finalUrl: resp.url,
  };
}

// ── 从 iTunes Search 造样本 ──
async function seedSamples() {
  const queries = ['无人知晓', '张小珺', '疯投圈', 'OnBoard', '忽左忽右', '声东击西', '得意忘形', '知行小酒馆', '42章经', '硅谷101'];
  const lines = ['# K0 Sprint 5 Spike — Apple Podcasts 样本（10 个热门中文节目最新集）', '# 生成方式: iTunes Search API', ''];

  for (const q of queries) {
    const url = `https://itunes.apple.com/search?media=podcast&country=cn&term=${encodeURIComponent(q)}&limit=1`;
    try {
      const j = await (await fetch(url, { headers: {'User-Agent': UA }})).json();
      const p = j.results?.[0];
      if (!p) continue;
      // 用 podcastId 直接构造 URL（Apple 允许不带 i= 参数拿节目主页），然后用 SPIKE 代码走 newest-fallback 拿最新集
      const podcastUrl = `https://podcasts.apple.com/cn/podcast/id${p.collectionId}`;
      lines.push(`${podcastUrl}  # 【${p.collectionName}】 (最新集自动匹配)`);
    } catch (e) {
      lines.push(`# FAIL query "${q}": ${e.message}`);
    }
  }

  const outPath = 'spike/data/apple-samples.txt';
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`Seeded ${queries.length} samples → ${outPath}`);
}

// ── CLI ──
const argv = process.argv.slice(2);
async function runOne(url) {
  process.stdout.write(`\n▶ ${url}\n`);
  try {
    const meta = await extractAppleAudio(url);
    const audio = await probeAudio(meta.audioUrl);
    const durMB = (audio.contentLength / 1024 / 1024).toFixed(1);
    console.log(`  ✅ [${meta.matchSource}] ${meta.title?.slice(0, 60)}`);
    console.log(`     podcast: ${meta.podcast}`);
    console.log(`     feed:    ${meta.feedUrl.slice(0, 60)}`);
    console.log(`     audio:   ${meta.audioUrl.slice(0, 80)}`);
    console.log(`     size:    ${durMB} MB · ${audio.contentType} · range=${audio.acceptRanges}`);
    console.log(`     transcript: ${meta.transcriptUrl ? '✓ ' + meta.transcriptUrl.slice(0, 60) : '(无)'}`);
    console.log(`     timing:  extract=${meta.fetchMs}ms  head=${audio.headMs}ms`);
    return { url, ok: true, ...meta, ...audio, sizeMB: durMB };
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    return { url, ok: false, error: e.message };
  }
}

const [arg1, arg2] = argv;
if (arg1 === 'seed') {
  await seedSamples();
} else if (arg1 === 'batch' && arg2) {
  const urls = fs.readFileSync(arg2, 'utf8').split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => l.split(/\s+#/)[0].trim());
  console.log(`Batch: ${urls.length} URLs from ${arg2}\n`);
  const results = [];
  for (const url of urls) results.push(await runOne(url));

  const csv = ['url,ok,matchSource,podcast,title,audioUrl,transcriptUrl,sizeMB,contentType,acceptRanges,fetchMs,headMs,error'];
  for (const r of results) {
    csv.push([
      r.url,
      r.ok,
      r.matchSource || '',
      `"${(r.podcast || '').replace(/"/g, '""')}"`,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      r.audioUrl || '',
      r.transcriptUrl || '',
      r.sizeMB || '',
      r.contentType || '',
      r.acceptRanges || '',
      r.fetchMs || '',
      r.headMs || '',
      `"${(r.error || '').replace(/"/g, '""')}"`,
    ].join(','));
  }
  const outPath = 'spike/data/spike-011-apple-audio.csv';
  fs.writeFileSync(outPath, csv.join('\n'));
  const okCount = results.filter(r => r.ok).length;
  console.log(`\n📊 ${okCount}/${results.length} success. CSV → ${outPath}`);
} else if (arg1) {
  await runOne(arg1);
} else {
  console.log('Usage:');
  console.log('  node spike/audio-extractor/apple.js seed');
  console.log('  node spike/audio-extractor/apple.js <appleUrl>');
  console.log('  node spike/audio-extractor/apple.js batch <urls.txt>');
}
