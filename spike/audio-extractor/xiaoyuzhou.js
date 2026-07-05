// SPIKE-010: 小宇宙 audio URL 提取器
// 参考：Hatari130/podcast-bridge/transcribe.py parse_episode()
//       + LZN2026/xiaoyuzhou-...-skill 的 og:audio + JSON-LD schema fallback
//
// 策略（三重 fallback）：
//   1. 正则匹配 media.xyzcdn.net/*.m4a|*.mp3  (最快，podcast-bridge 用的方法)
//   2. <meta property="og:audio" content="..."> (LZN2026 方法 A)
//   3. <script type="application/ld+json"> 里 PodcastEpisode.contentUrl (LZN2026 方法 B)
//
// 用法：
//   node spike/audio-extractor/xiaoyuzhou.js https://www.xiaoyuzhoufm.com/episode/xxxx
//   node spike/audio-extractor/xiaoyuzhou.js batch spike/data/xyz-samples.txt

import fs from 'node:fs';
// Node 20+ 全局 fetch 可用；无需 undici

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const XYZ_URL_RE = /xiaoyuzhoufm\.com\/episode\/([a-f0-9]{24})/i;

/**
 * 从小宇宙 episode URL 提取 audio URL + 元数据
 * @param {string} episodeUrl
 * @returns {Promise<{
 *   episodeId: string, title: string, podcast: string|null,
 *   coverImage: string|null, audioUrl: string, source: string
 * }>}
 */
export async function extractXiaoyuzhouAudio(episodeUrl) {
  const m = episodeUrl.match(XYZ_URL_RE);
  if (!m) throw new Error(`非法小宇宙 URL: ${episodeUrl}`);
  const episodeId = m[1];

  const t0 = Date.now();
  const resp = await fetch(episodeUrl, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://www.xiaoyuzhoufm.com/',
    },
    // undici 默认 timeout 系统默认，spike 期加 15s cap
  });
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  const html = await resp.text();
  const fetchMs = Date.now() - t0;

  // ── Method 1: xyzcdn 正则（匹配所有 xyzcdn 子域名，非只 media.） ──
  let audioUrl = null, source = null;
  const audioMatch = html.match(/https:\/\/[\w.-]*xyzcdn\.net\/[^"'\s]+\.(?:m4a|mp3|aac)/i);
  if (audioMatch) {
    audioUrl = audioMatch[0];
    source = 'xyzcdn-regex';
  }

  // ── Method 2: og:audio meta 兜底 ──
  if (!audioUrl) {
    const og = html.match(/<meta\s+property=["']og:audio["']\s+content=["']([^"']+)["']/i);
    if (og) {
      audioUrl = og[1];
      source = 'og:audio';
    }
  }

  // ── Method 3: JSON-LD schema.org PodcastEpisode 兜底 ──
  if (!audioUrl) {
    const ldMatches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const ld of ldMatches) {
      try {
        const j = JSON.parse(ld[1].trim());
        if (j.contentUrl && /\.(m4a|mp3|aac)/i.test(j.contentUrl)) {
          audioUrl = j.contentUrl;
          source = 'json-ld';
          break;
        }
        if (j.associatedMedia?.contentUrl) {
          audioUrl = j.associatedMedia.contentUrl;
          source = 'json-ld-associated';
          break;
        }
      } catch {}
    }
  }

  if (!audioUrl) {
    throw new Error(`未找到 audio URL（可能付费/私密节目）`);
  }

  // ── 元数据 ──
  const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i)
    || html.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].split('|')[0].trim() : '未命名';

  const siteMatch = html.match(/<meta\s+property=["']og:site_name["']\s+content=["']([^"']+)["']/i);
  const podcast = siteMatch ? siteMatch[1].trim() : null;

  const imgMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  const coverImage = imgMatch ? imgMatch[1] : null;

  return { episodeId, title, podcast, coverImage, audioUrl, source, fetchMs };
}

/**
 * 探测 audio 直链是否可用 + 拿元数据（大小、支持 Range）
 */
export async function probeAudio(audioUrl) {
  const t0 = Date.now();
  const resp = await fetch(audioUrl, {
    method: 'HEAD',
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.xiaoyuzhoufm.com/',
    },
  });
  const headMs = Date.now() - t0;
  return {
    status: resp.status,
    contentLength: parseInt(resp.headers.get('content-length') || '0', 10),
    contentType: resp.headers.get('content-type'),
    acceptRanges: resp.headers.get('accept-ranges') === 'bytes',
    headMs,
  };
}

// ── CLI entry ──
const argv = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('xiaoyuzhou.js')) {
  const [arg1, arg2] = argv;

  async function runOne(url) {
    process.stdout.write(`\n▶ ${url}\n`);
    try {
      const meta = await extractXiaoyuzhouAudio(url);
      const audio = await probeAudio(meta.audioUrl);
      const durMB = (audio.contentLength / 1024 / 1024).toFixed(1);
      console.log(`  ✅ [${meta.source}] ${meta.title}`);
      console.log(`     podcast: ${meta.podcast || '(无)'}`);
      console.log(`     audio:   ${meta.audioUrl}`);
      console.log(`     size:    ${durMB} MB · ${audio.contentType} · range=${audio.acceptRanges}`);
      console.log(`     timing:  html=${meta.fetchMs}ms  head=${audio.headMs}ms`);
      return { url, ok: true, ...meta, ...audio, sizeMB: durMB };
    } catch (e) {
      console.log(`  ❌ ${e.message}`);
      return { url, ok: false, error: e.message };
    }
  }

  if (arg1 === 'batch' && arg2) {
    const urls = fs.readFileSync(arg2, 'utf8').split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(l => l.split(/\s+#/)[0].trim()); // 去掉行内 "  # 注释" 尾巴
    console.log(`Batch: ${urls.length} URLs from ${arg2}\n`);
    const results = [];
    for (const url of urls) {
      results.push(await runOne(url));
    }
    // CSV 输出
    const csv = ['url,ok,source,title,podcast,audioUrl,sizeMB,contentType,acceptRanges,fetchMs,headMs,error'];
    for (const r of results) {
      csv.push([
        r.url,
        r.ok,
        r.source || '',
        `"${(r.title || '').replace(/"/g, '""')}"`,
        `"${(r.podcast || '').replace(/"/g, '""')}"`,
        r.audioUrl || '',
        r.sizeMB || '',
        r.contentType || '',
        r.acceptRanges || '',
        r.fetchMs || '',
        r.headMs || '',
        `"${(r.error || '').replace(/"/g, '""')}"`,
      ].join(','));
    }
    const outPath = 'spike/data/spike-010-xiaoyuzhou-audio.csv';
    fs.writeFileSync(outPath, csv.join('\n'));
    const okCount = results.filter(r => r.ok).length;
    console.log(`\n📊 ${okCount}/${results.length} success. CSV → ${outPath}`);
  } else if (arg1) {
    await runOne(arg1);
  } else {
    console.log('Usage:');
    console.log('  node spike/audio-extractor/xiaoyuzhou.js <episodeUrl>');
    console.log('  node spike/audio-extractor/xiaoyuzhou.js batch <urls.txt>');
  }
}
