// SPIKE-014: BCUT (B 站必剪) 云端 ASR - Node.js 移植版
// 参考：Hatari130/podcast-bridge transcribe.py:877-983
//
// BCUT 是 B 站必剪剪辑工具的云端 ASR，免登录、免 API key、免费无限量。
// 逆向接口（非官方），随时可能封禁，但目前（2026-07）活跃可用。
//
// Pipeline:
//   1. POST /resource/create        申请上传，拿 upload_urls[]（分片 PUT 目标）
//   2. PUT upload_urls[i]           分片上传音频 (拿到 ETag)
//   3. POST /resource/create/complete  提交上传，拿 download_url
//   4. POST /task                   建 ASR 任务，拿 task_id
//   5. GET /task/result             轮询直到 state=4（完成）→ segments
//
// segments 返回结构（parse 后）:
//   [{ start: 秒(number), end: 秒(number), text: "..." }, ...]
//
// 用法：
//   node spike/asr/bcut.js <audioFilePath>
//   node spike/asr/bcut.js url <audioUrl>   # 直接从 CDN 拉 audio 再转

import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const BCUT_BASE = 'https://member.bilibili.com/x/bcut/rubick-interface';
const BCUT_MODEL_ID = '8';

const BILI_HEADERS = {
  'User-Agent': 'Bilibili/1.0.0 (https://www.bilibili.com)',
  'Content-Type': 'application/json',
};

async function jsonReq(url, { method = 'GET', body, params, headers = {} } = {}) {
  let u = url;
  if (params) {
    const q = new URLSearchParams(params).toString();
    u += (url.includes('?') ? '&' : '?') + q;
  }
  const resp = await fetch(u, {
    method,
    headers: { ...BILI_HEADERS, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}: ${await resp.text().catch(() => '')}`);
  return resp.json();
}

function parseBcutSegments(resultText) {
  const data = JSON.parse(resultText);
  const segs = [];
  for (const u of (data.utterances || [])) {
    const text = (u.transcript || '').trim();
    if (!text) continue;
    segs.push({
      start: (u.start_time || 0) / 1000,
      end: (u.end_time || 0) / 1000,
      text,
    });
  }
  return segs;
}

/**
 * 用 BCUT 云端 ASR 转录音频文件
 * @param {string} audioPath  本地音频路径 (mp3/m4a/wav/aac)
 * @returns {Promise<{segments: Array<{start,end,text}>, totalMs: number, uploadMs: number, asrMs: number}>}
 */
export async function transcribeWithBcut(audioPath) {
  const t0 = Date.now();

  const stat = fs.statSync(audioPath);
  const fileBuf = fs.readFileSync(audioPath);
  const size = fileBuf.length;

  console.log(`[bcut] file: ${audioPath} (${(size / 1024 / 1024).toFixed(1)} MB)`);

  // 1. Create upload
  const createResp = await jsonReq(`${BCUT_BASE}/resource/create`, {
    method: 'POST',
    body: {
      type: 2,
      name: path.basename(audioPath),
      size,
      ResourceFileType: path.extname(audioPath).slice(1) || 'mp3',
      model_id: BCUT_MODEL_ID,
    },
  });
  const info = createResp.data || {};
  const uploadUrls = info.upload_urls || [];
  const perSize = info.per_size || size;
  if (!uploadUrls.length) throw new Error(`no upload_urls: ${JSON.stringify(createResp)}`);
  console.log(`[bcut] uploads: ${uploadUrls.length} chunks × ${(perSize / 1024 / 1024).toFixed(1)}MB`);

  // 2. Upload chunks
  const uploadT0 = Date.now();
  const etags = [];
  for (let i = 0; i < uploadUrls.length; i++) {
    const start = i * perSize;
    const end = Math.min((i + 1) * perSize, size);
    const chunk = fileBuf.subarray(start, end);
    const resp = await fetch(uploadUrls[i], {
      method: 'PUT',
      headers: BILI_HEADERS,
      body: chunk,
    });
    if (!resp.ok) throw new Error(`upload chunk ${i} HTTP ${resp.status}`);
    const etag = resp.headers.get('etag') || resp.headers.get('ETag');
    if (etag) etags.push(etag);
    process.stdout.write(`  chunk ${i + 1}/${uploadUrls.length} ✓\n`);
  }
  const uploadMs = Date.now() - uploadT0;

  // 3. Complete upload
  const commitResp = await jsonReq(`${BCUT_BASE}/resource/create/complete`, {
    method: 'POST',
    body: {
      InBossKey: info.in_boss_key,
      ResourceId: info.resource_id,
      Etags: etags.join(','),
      UploadId: info.upload_id,
      model_id: BCUT_MODEL_ID,
    },
  });
  const downloadUrl = commitResp.data?.download_url;
  if (!downloadUrl) throw new Error(`no download_url: ${JSON.stringify(commitResp)}`);

  // 4. Create ASR task
  const taskResp = await jsonReq(`${BCUT_BASE}/task`, {
    method: 'POST',
    body: { resource: downloadUrl, model_id: BCUT_MODEL_ID },
  });
  const taskId = taskResp.data?.task_id;
  if (!taskId) throw new Error(`no task_id: ${JSON.stringify(taskResp)}`);
  console.log(`[bcut] task_id: ${taskId}`);

  // 5. Poll
  const asrT0 = Date.now();
  for (let poll = 1; poll <= 900; poll++) {
    const resultResp = await jsonReq(`${BCUT_BASE}/task/result`, {
      params: { model_id: BCUT_MODEL_ID, task_id: taskId },
    });
    const d = resultResp.data || {};
    const state = d.state;
    if (state === 4) {
      // Success
      const segments = parseBcutSegments(d.result || '{}');
      const asrMs = Date.now() - asrT0;
      return {
        segments,
        totalMs: Date.now() - t0,
        uploadMs,
        asrMs,
      };
    }
    if ([5, 6, -1].includes(state)) {
      throw new Error(`BCUT task failed: state=${state} ${JSON.stringify(resultResp)}`);
    }
    if (poll % 15 === 0) console.log(`[bcut] waiting... ${poll}s`);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('BCUT poll timeout (>15min)');
}

/**
 * 从 URL 下载 audio 到临时文件
 */
async function downloadAudio(audioUrl, destPath) {
  const t0 = Date.now();
  const resp = await fetch(audioUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
      'Referer': 'https://www.xiaoyuzhoufm.com/',
    },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
  await pipeline(resp.body, fs.createWriteStream(destPath));
  const ms = Date.now() - t0;
  const size = fs.statSync(destPath).size;
  console.log(`[dl] ${(size / 1024 / 1024).toFixed(1)} MB in ${(ms / 1000).toFixed(1)}s`);
  return { size, ms };
}

// ── CLI ──
const [arg1, arg2] = process.argv.slice(2);
if (!arg1) {
  console.log('Usage:');
  console.log('  node spike/asr/bcut.js <audioFilePath>');
  console.log('  node spike/asr/bcut.js url <audioUrl>');
  process.exit(1);
}

let audioPath;
let dlInfo = null;
if (arg1 === 'url' && arg2) {
  audioPath = 'spike/data/tmp-audio.m4a';
  fs.mkdirSync('spike/data', { recursive: true });
  dlInfo = await downloadAudio(arg2, audioPath);
} else {
  audioPath = arg1;
}

const result = await transcribeWithBcut(audioPath);

console.log('\n=== BCUT 转录完成 ===');
console.log(`Segments: ${result.segments.length}`);
console.log(`Total ms: ${result.totalMs} (upload=${result.uploadMs} asr=${result.asrMs})`);
console.log(`First 5 segments:`);
for (const s of result.segments.slice(0, 5)) {
  console.log(`  [${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`);
}
console.log(`Last 3 segments:`);
for (const s of result.segments.slice(-3)) {
  console.log(`  [${s.start.toFixed(1)}s-${s.end.toFixed(1)}s] ${s.text}`);
}

// 存结果到 JSON
const outPath = `spike/data/spike-014-bcut-${Date.now()}.json`;
fs.writeFileSync(outPath, JSON.stringify({
  audioPath,
  audioSize: fs.statSync(audioPath).size,
  segmentCount: result.segments.length,
  totalMs: result.totalMs,
  uploadMs: result.uploadMs,
  asrMs: result.asrMs,
  downloadMs: dlInfo?.ms || null,
  segments: result.segments,
}, null, 2));
console.log(`\n💾 Full result → ${outPath}`);
