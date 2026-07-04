// SPIKE-002: Apple Podcasts / Spotify 单集元数据抓取
// Apple: iTunes Search API + episode ID → RSS feed → single episode entry
// Spotify: 因网络受限，此环境无法测。本 spike 只做 Apple。
import Parser from 'rss-parser';
import fs from 'fs';

const parser = new Parser({
  customFields: {
    item: [
      ['itunes:duration', 'itunes_duration'],
      ['itunes:image', 'itunes_image'],
      ['itunes:episode', 'itunes_episode'],
      ['enclosure', 'enclosure'],
    ],
  },
});

// Apple Podcasts 单集 URL 形如:
// https://podcasts.apple.com/us/podcast/lex-fridman-podcast/id1434243584?i=1000697548742
// i= 参数是单集 ID
const appleUrls = [
  { id: 'apple-01', title: 'The Daily NYT sample', url: 'https://podcasts.apple.com/us/podcast/the-daily/id1200361736?i=1000697551831' },
  { id: 'apple-02', title: 'Huberman Lab episode sample', url: 'https://podcasts.apple.com/us/podcast/huberman-lab/id1545953110?i=1000679544144' },
];

function parseAppleUrl(url) {
  // 提取 podcast ID (id...) 和 episode ID (i=...)
  const podcastIdMatch = url.match(/id(\d+)/);
  const episodeIdMatch = url.match(/[?&]i=(\d+)/);
  return {
    podcastId: podcastIdMatch?.[1],
    episodeId: episodeIdMatch?.[1],
  };
}

async function fetchAppleEpisode(item) {
  const t0 = Date.now();
  const { podcastId, episodeId } = parseAppleUrl(item.url);
  if (!podcastId) return { id: item.id, status: 'invalid_url', elapsed_ms: 0 };

  // Step 1: iTunes Search API 查 podcast 得 feedUrl
  const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${podcastId}&country=US`);
  const lookup = await lookupRes.json();
  const feedUrl = lookup?.results?.[0]?.feedUrl;
  const podcastMeta = lookup?.results?.[0];

  if (!feedUrl) {
    return { id: item.id, status: 'no_feed', elapsed_ms: Date.now() - t0 };
  }

  // Step 2: 拉 RSS
  const feed = await parser.parseURL(feedUrl);

  // Step 3: 在 items 里匹配 episode（iTunes API 没直接给 episode meta，需从 RSS 找）
  // 方法：拉所有 items，用 itunes:episode + itunes:duration + title 大致匹配
  // 或用 iTunes lookup 单集接口: /lookup?id=<episodeId>&entity=podcastEpisode
  const epLookupRes = await fetch(`https://itunes.apple.com/lookup?id=${episodeId}&entity=podcastEpisode`);
  const epLookup = await epLookupRes.json();
  const episodeMeta = epLookup?.results?.find(r => r.kind === 'podcast-episode');

  const elapsed = Date.now() - t0;

  return {
    id: item.id,
    url: item.url,
    status: 'ok',
    elapsed_ms: elapsed,
    podcast: {
      name: podcastMeta?.collectionName,
      artist: podcastMeta?.artistName,
      artwork: podcastMeta?.artworkUrl600,
      feed_url: feedUrl,
      episode_count: podcastMeta?.trackCount,
    },
    episode: episodeMeta ? {
      title: episodeMeta.trackName,
      description: episodeMeta.description?.slice(0, 200),
      release_date: episodeMeta.releaseDate,
      duration_ms: episodeMeta.trackTimeMillis,
      audio_url: episodeMeta.episodeUrl,
      has_transcript: false, // Apple Podcast Connect 有 Auto-Transcript 但公开 API 不暴露
    } : null,
    feed_items_sample: feed.items?.slice(0, 2).map(i => ({ title: i.title, pubDate: i.pubDate, duration: i.itunes_duration })),
  };
}

const results = [];

// Apple
console.log('\n=== Apple Podcasts ===');
for (const item of appleUrls) {
  try {
    console.log(`\n--- ${item.id} ---`);
    const r = await fetchAppleEpisode(item);
    console.log(`status=${r.status} elapsed=${r.elapsed_ms}ms`);
    if (r.podcast) {
      console.log(`  podcast: "${r.podcast.name}" by ${r.podcast.artist}`);
      console.log(`  feed: ${r.podcast.feed_url?.slice(0, 60)}...`);
    }
    if (r.episode) {
      console.log(`  episode: "${r.episode.title}"`);
      console.log(`  duration: ${(r.episode.duration_ms/60000).toFixed(1)} min`);
      console.log(`  audio: ${r.episode.audio_url?.slice(0, 60)}...`);
    }
    results.push(r);
  } catch (e) {
    console.log(`  fatal: ${e.message}`);
    results.push({ id: item.id, status: 'fatal', error: e.message });
  }
}

// Spotify 跳过（网络阻断）
console.log('\n=== Spotify: SKIPPED (network blocked; see spike doc) ===');

fs.writeFileSync('results.json', JSON.stringify(results, null, 2));
const ok = results.filter(r => r.status === 'ok').length;
console.log(`\nApple success: ${ok}/${appleUrls.length}`);
