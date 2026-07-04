// Apple Podcasts metadata import service
// SPIKE-002 validated pattern: iTunes Search API (2 calls) for podcast+episode metadata
// Timeout: 10 seconds. Falls back to RSS first-item if episode lookup fails.

const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup';
const TIMEOUT_MS = 10_000;

/**
 * Parse an Apple Podcasts URL and extract podcastId + episodeId.
 * Handles:
 *   https://podcasts.apple.com/us/podcast/name/id<podcastId>?i=<episodeId>
 *   https://podcasts.apple.com/podcast/id<podcastId>?i=<episodeId>
 *
 * @param {string} url
 * @returns {{ podcastId: string, episodeId: string|null }}
 * @throws if URL doesn't contain a podcast ID
 */
export function parseAppleUrl(url) {
  if (!url || typeof url !== 'string') {
    throw Object.assign(new Error('INVALID_URL'), { code: 'INVALID_URL' });
  }

  const podcastIdMatch = url.match(/\/id(\d+)/);
  if (!podcastIdMatch) {
    throw Object.assign(new Error('INVALID_URL'), { code: 'INVALID_URL' });
  }

  const episodeIdMatch = url.match(/[?&]i=(\d+)/);

  return {
    podcastId: podcastIdMatch[1],
    episodeId: episodeIdMatch ? episodeIdMatch[1] : null,
  };
}

/**
 * Fetch Apple Podcasts metadata using iTunes Search API.
 * Returns normalized EpisodeMetadata.
 *
 * @param {{ podcastId: string, episodeId: string|null }} ids
 * @returns {Promise<{
 *   title: string,
 *   channel: string,
 *   duration: number,  // seconds
 *   coverUrl: string,
 *   publishedAt: string|null,
 *   sourceUrl: string,
 *   sourceId: string,
 *   audioUrl: string|null,
 *   description: string|null,
 * }>}
 */
export async function fetchAppleMetadata({ podcastId, episodeId, sourceUrl }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Step 1: Fetch podcast info (to get feedUrl, artwork, channel name)
    const podcastRes = await fetch(
      `${ITUNES_LOOKUP}?id=${podcastId}&country=US`,
      { signal: controller.signal }
    );
    if (!podcastRes.ok) {
      throw Object.assign(new Error('SOURCE_UNREACHABLE'), { code: 'SOURCE_UNREACHABLE' });
    }
    const podcastData = await podcastRes.json();
    const podcastMeta = podcastData?.results?.[0];

    if (!podcastMeta) {
      throw Object.assign(new Error('SOURCE_UNREACHABLE'), { code: 'SOURCE_UNREACHABLE' });
    }

    const channel = podcastMeta.collectionName || podcastMeta.artistName || 'Unknown Podcast';
    const coverUrl = podcastMeta.artworkUrl600 || podcastMeta.artworkUrl100 || null;

    // Step 2: If we have an episodeId, try iTunes episode lookup
    if (episodeId) {
      try {
        const epRes = await fetch(
          `${ITUNES_LOOKUP}?id=${episodeId}&entity=podcastEpisode&country=US`,
          { signal: controller.signal }
        );
        if (epRes.ok) {
          const epData = await epRes.json();
          const ep = epData?.results?.find(r => r.kind === 'podcast-episode');
          if (ep) {
            return {
              title: ep.trackName || 'Unknown Episode',
              channel,
              duration: ep.trackTimeMillis ? Math.round(ep.trackTimeMillis / 1000) : 0,
              coverUrl: ep.artworkUrl600 || coverUrl,
              publishedAt: ep.releaseDate || null,
              sourceUrl: sourceUrl || ep.trackViewUrl || '',
              sourceId: String(episodeId),
              audioUrl: ep.episodeUrl || null,
              description: ep.description ? ep.description.slice(0, 2000) : null,
            };
          }
        }
      } catch {
        // Fall through to RSS fallback
      }
    }

    // Step 3: RSS fallback — fetch feed and find the most recent episode
    // (or if we have episodeId, try to match by itunes episode number)
    const feedUrl = podcastMeta.feedUrl;
    if (!feedUrl) {
      throw Object.assign(new Error('SOURCE_UNREACHABLE'), { code: 'SOURCE_UNREACHABLE' });
    }

    const feedRes = await fetch(feedUrl, { signal: controller.signal });
    if (!feedRes.ok) {
      throw Object.assign(new Error('SOURCE_UNREACHABLE'), { code: 'SOURCE_UNREACHABLE' });
    }
    const feedXml = await feedRes.text();

    // Parse RSS XML minimally — avoid rss-parser dep in backend
    const episodes = parseRssItems(feedXml);
    if (!episodes.length) {
      throw Object.assign(new Error('SOURCE_UNREACHABLE'), { code: 'SOURCE_UNREACHABLE' });
    }

    // Use the first (most recent) episode as fallback
    const ep = episodes[0];
    return {
      title: ep.title || 'Unknown Episode',
      channel,
      duration: ep.duration || 0,
      coverUrl,
      publishedAt: ep.pubDate || null,
      sourceUrl: sourceUrl || '',
      sourceId: episodeId || `podcast-${podcastId}-latest`,
      audioUrl: ep.audioUrl || null,
      description: ep.description ? ep.description.slice(0, 2000) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Minimal RSS item parser — no external deps.
 * Extracts title, pubDate, duration, enclosure (audioUrl), and description.
 *
 * @param {string} xml
 * @returns {Array<{title:string, pubDate:string|null, duration:number, audioUrl:string|null, description:string|null}>}
 */
function parseRssItems(xml) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];

    const title = extractTag(block, 'title');
    const pubDate = extractTag(block, 'pubDate');
    const description = extractTag(block, 'description') || extractTag(block, 'itunes:summary');

    // Duration: try itunes:duration (can be HH:MM:SS or seconds)
    const rawDuration = extractTag(block, 'itunes:duration');
    const duration = parseDuration(rawDuration);

    // Audio URL from enclosure
    const enclosureMatch = block.match(/<enclosure[^>]+url="([^"]+)"/);
    const audioUrl = enclosureMatch ? enclosureMatch[1] : null;

    items.push({
      title: title ? stripCdata(title) : 'Unknown',
      pubDate: pubDate || null,
      duration,
      audioUrl,
      description: description ? stripCdata(description).slice(0, 2000) : null,
    });
  }

  return items;
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = re.exec(xml);
  return m ? m[1].trim() : null;
}

function stripCdata(str) {
  return str.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

function parseDuration(raw) {
  if (!raw) return 0;
  // HH:MM:SS or MM:SS
  const parts = raw.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  // Might be raw seconds
  const secs = parseInt(raw, 10);
  return isNaN(secs) ? 0 : secs;
}
