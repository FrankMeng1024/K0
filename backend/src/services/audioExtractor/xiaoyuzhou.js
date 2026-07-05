// K0 backend - 小宇宙 audio 抓取 module
// 迁移自 spike/audio-extractor/xiaoyuzhou.js (Sprint 5 验证 48/48 = 100%)
// 三重 fallback: xyzcdn 正则 → og:audio → JSON-LD

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const XYZ_URL_RE = /xiaoyuzhoufm\.com\/episode\/([a-f0-9]{24})/i;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * 从小宇宙 episode URL 提取 audio URL + 元数据
 * @param {string} episodeUrl
 * @returns {Promise<{
 *   platform: 'xiaoyuzhou',
 *   sourceId: string,           // 24-hex episode id
 *   title: string,
 *   podcast: string|null,        // og:site_name 一般为 null
 *   coverImage: string|null,     // og:image
 *   audioUrl: string,
 *   audioFormat: 'm4a'|'mp3'|'aac',
 *   audioSource: 'xyzcdn-regex'|'og:audio'|'json-ld',
 * }>}
 */
export async function extractXiaoyuzhouAudio(episodeUrl) {
  const m = episodeUrl.match(XYZ_URL_RE);
  if (!m) {
    throw Object.assign(new Error('INVALID_XIAOYUZHOU_URL'), { code: 'INVALID_URL' });
  }
  const sourceId = m[1];

  // Sprint 8: 网络抖动重试 — 3 次指数退避
  const MAX_ATTEMPTS = 3;
  let html;
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(episodeUrl, {
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'zh-CN,zh;q=0.9',
          'Referer': 'https://www.xiaoyuzhoufm.com/',
        },
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw Object.assign(new Error(`XYZ_HTTP_${resp.status}`), { code: 'SOURCE_UNREACHABLE' });
      }
      html = await resp.text();
      break; // 成功，跳出重试
    } catch (e) {
      lastErr = e;
      if (e.code === 'INVALID_URL') throw e;
      const isNetErr = e.name === 'AbortError' || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|network/i.test(String(e.message || e));
      if (attempt === MAX_ATTEMPTS || !isNetErr) {
        if (e.code) throw e;
        throw Object.assign(new Error(`XYZ_FETCH_FAILED: ${e.message}`), { code: 'SOURCE_UNREACHABLE' });
      }
      await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  if (!html) throw lastErr;

  // Method 1: xyzcdn 正则（子域名通配，匹配 media./assets./rio. 等）
  let audioUrl = null;
  let audioSource = null;
  const audioMatch = html.match(/https:\/\/[\w.-]*xyzcdn\.net\/[^"'\s]+\.(?:m4a|mp3|aac)/i);
  if (audioMatch) {
    audioUrl = audioMatch[0];
    audioSource = 'xyzcdn-regex';
  }

  // Method 2: og:audio meta
  if (!audioUrl) {
    const og = html.match(/<meta\s+property=["']og:audio["']\s+content=["']([^"']+)["']/i);
    if (og) {
      audioUrl = og[1];
      audioSource = 'og:audio';
    }
  }

  // Method 3: JSON-LD schema.org PodcastEpisode
  if (!audioUrl) {
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const ld of ldMatches) {
      try {
        const j = JSON.parse(ld[1].trim());
        if (j.contentUrl && /\.(m4a|mp3|aac)/i.test(j.contentUrl)) {
          audioUrl = j.contentUrl;
          audioSource = 'json-ld';
          break;
        }
        if (j.associatedMedia?.contentUrl) {
          audioUrl = j.associatedMedia.contentUrl;
          audioSource = 'json-ld-associated';
          break;
        }
      } catch { /* ignore parse errors */ }
    }
  }

  if (!audioUrl) {
    throw Object.assign(new Error('XYZ_NO_AUDIO'), {
      code: 'EPISODE_NOT_AVAILABLE',
      message: '找不到这集的音频（可能是付费或私密内容）',
    });
  }

  // Metadata
  const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
    || html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].split('|')[0].trim() : '未命名';

  const siteMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
  let podcast = siteMatch ? siteMatch[1].trim() : null;

  // Sprint 8: 小宇宙 og:site_name 常返回"小宇宙" 或 null。
  // 优先从 JSON-LD PodcastEpisode.partOfSeries.name 提取
  if (!podcast || podcast === '小宇宙') {
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const ld of ldMatches) {
      try {
        const j = JSON.parse(ld[1].trim());
        const seriesName = j.partOfSeries?.name || j.isPartOf?.name;
        if (seriesName && typeof seriesName === 'string') {
          podcast = seriesName.trim();
          break;
        }
      } catch { /* ignore */ }
    }
  }
  // 兜底：从 title 里"节目名｜集标题"格式取节目名
  if (!podcast && title.includes('｜')) {
    const parts = title.split('｜');
    if (parts.length >= 2) {
      podcast = parts[0].trim();
    }
  }

  const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  const coverImage = imgMatch ? imgMatch[1] : null;

  // Detect format
  let audioFormat = 'm4a';
  if (/\.mp3(\?|$)/i.test(audioUrl)) audioFormat = 'mp3';
  else if (/\.aac(\?|$)/i.test(audioUrl)) audioFormat = 'aac';

  return {
    platform: 'xiaoyuzhou',
    sourceId,
    sourceUrl: episodeUrl,
    title,
    podcast,
    coverImage,
    audioUrl,
    audioFormat,
    audioSource,
  };
}

/**
 * 判断 URL 是否是小宇宙 episode
 */
export function isXiaoyuzhouUrl(url) {
  return XYZ_URL_RE.test(url || '');
}
