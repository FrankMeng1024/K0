// K0 backend - Apple Podcasts audio 抓取 module
// 迁移自 spike/audio-extractor/apple.js (Sprint 5 验证 10/10 = 100%)
// 流程: URL → iTunes lookup → RSS feedUrl → parse XML → enclosure.url

import { XMLParser } from 'fast-xml-parser';
import { parseAppleUrl } from '../appleImport.js';

const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FETCH_TIMEOUT_MS = 15_000;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  parseAttributeValue: false,
  processEntities: false,  // 疯投圈类 RSS 有 >1000 entity 会触发 XXE 保护
});

async function fetchWithTimeout(url, opts = {}) {
  // Sprint 8: 网络抖动重试 — 最多 3 次，指数退避 500ms / 1s / 2s
  const MAX_ATTEMPTS = 3;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...opts,
        headers: { 'User-Agent': UA, ...(opts.headers || {}) },
        signal: controller.signal,
      });
    } catch (err) {
      lastErr = err;
      const isNetErr = err.name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(String(err.message || err));
      if (!isNetErr || attempt === MAX_ATTEMPTS) throw err;
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

async function itunesLookup(id, entity /* 'podcast' | 'podcastEpisode' */) {
  const url = `${ITUNES_LOOKUP}?id=${id}&entity=${entity}`;
  const resp = await fetchWithTimeout(url);
  if (!resp.ok) {
    throw Object.assign(new Error(`ITUNES_HTTP_${resp.status}`), { code: 'SOURCE_UNREACHABLE' });
  }
  const j = await resp.json();
  return j.results?.[0] || null;
}

/**
 * 从 Apple Podcasts URL 提取 audio URL + 元数据
 * @param {string} appleUrl
 * @returns {Promise<{
 *   platform: 'apple',
 *   podcastId: string,
 *   episodeId: string|null,
 *   sourceId: string,
 *   sourceUrl: string,
 *   podcast: string,
 *   title: string,
 *   audioUrl: string,
 *   audioFormat: 'mp3'|'m4a'|'aac',
 *   audioType: string,
 *   transcriptUrl: string|null,  // Podcast 2.0 内嵌转录（罕见）
 *   matchSource: 'guid'|'title'|'newest-fallback',
 * }>}
 */
export async function extractAppleAudio(appleUrl) {
  const { podcastId, episodeId } = parseAppleUrl(appleUrl);

  const podcast = await itunesLookup(podcastId, 'podcast');
  if (!podcast?.feedUrl) {
    throw Object.assign(new Error('APPLE_NO_FEED'), {
      code: 'SOURCE_NOT_SUPPORTED',
      message: '该播客未提供 RSS feed',
    });
  }

  const rssResp = await fetchWithTimeout(podcast.feedUrl);
  if (!rssResp.ok) {
    throw Object.assign(new Error(`RSS_HTTP_${rssResp.status}`), {
      code: 'SOURCE_UNREACHABLE',
      message: `RSS 抓取失败 (${rssResp.status})`,
    });
  }
  const xml = await rssResp.text();
  const feed = xmlParser.parse(xml);
  const rawItems = feed?.rss?.channel?.item;
  if (!rawItems) {
    throw Object.assign(new Error('RSS_NO_ITEMS'), {
      code: 'SOURCE_NOT_SUPPORTED',
      message: 'RSS 中没有找到任何节目',
    });
  }
  const items = Array.isArray(rawItems) ? rawItems : [rawItems];

  // 匹配 episode
  let matchedItem = null;
  let matchSource = null;
  if (episodeId) {
    try {
      const ep = await itunesLookup(episodeId, 'podcastEpisode');
      if (ep) {
        const targetGuid = ep.episodeGuid;
        const targetName = ep.trackName;
        matchedItem = items.find((it) => {
          const g = typeof it.guid === 'string' ? it.guid : it.guid?.['#text'];
          return (targetGuid && g === targetGuid) || (targetName && it.title === targetName);
        });
        if (matchedItem) {
          matchSource = targetGuid && matchedItem.guid ? 'guid' : 'title';
        }
      }
    } catch { /* fallback to newest */ }
  }
  if (!matchedItem) {
    matchedItem = items[0];
    matchSource = 'newest-fallback';
  }

  const enclosure = matchedItem.enclosure;
  const audioUrl = enclosure?.['@_url'];
  const audioType = enclosure?.['@_type'] || 'audio/mpeg';

  if (!audioUrl) {
    throw Object.assign(new Error('APPLE_NO_ENCLOSURE'), {
      code: 'EPISODE_NOT_AVAILABLE',
      message: '找不到这集的音频链接',
    });
  }

  // Detect format
  let audioFormat = 'mp3';
  if (/\.m4a(\?|$)/i.test(audioUrl)) audioFormat = 'm4a';
  else if (/\.aac(\?|$)/i.test(audioUrl)) audioFormat = 'aac';

  // Podcast 2.0 transcript (可选)
  let transcriptUrl = null;
  const trans = matchedItem['podcast:transcript'];
  if (trans) {
    const t = Array.isArray(trans) ? trans[0] : trans;
    transcriptUrl = t?.['@_url'] || null;
  }

  // Sprint 8: cover image - iTunes API 返回 artworkUrl600，RSS item 可能有 itunes:image
  let coverImage = podcast.artworkUrl600 || podcast.artworkUrl100 || null;
  const itunesImage = matchedItem['itunes:image'];
  if (itunesImage) {
    const url = itunesImage?.['@_href'] || itunesImage;
    if (typeof url === 'string' && /^https?:/i.test(url)) {
      coverImage = url;
    }
  }

  return {
    platform: 'apple',
    podcastId,
    episodeId,
    sourceId: episodeId || podcastId,
    sourceUrl: appleUrl,
    podcast: podcast.collectionName,
    title: typeof matchedItem.title === 'string' ? matchedItem.title : (matchedItem.title?.['#text'] || 'Untitled'),
    coverImage,
    audioUrl,
    audioFormat,
    audioType,
    transcriptUrl,
    matchSource,
  };
}

const APPLE_URL_RE = /podcasts\.apple\.com\/[^/]+\/podcast\/(?:[^/?]+\/)?id\d+/i;

export function isAppleUrl(url) {
  return APPLE_URL_RE.test(url || '');
}
