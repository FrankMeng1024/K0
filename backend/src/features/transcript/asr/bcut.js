// K0 backend - BCUT (B 站必剪) 云端 ASR service
// Sprint 5 spike 验证 10/10 成功率，含 4h 超长音频
// 迁移自 spike/asr/bcut.js + 加错误处理 + 磁盘管理 + AI 审计日志

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { logAiCall } from '../../../ai/aiLogger.js';
import pino from 'pino';

const execFileP = promisify(execFile);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const BCUT_BASE = 'https://member.bilibili.com/x/bcut/rubick-interface';
const BCUT_MODEL_ID = '8';
const BCUT_UA = 'Bilibili/1.0.0 (https://www.bilibili.com)';

const CHUNK_SIZE = 5 * 1024 * 1024;              // 5MB per PUT
const DL_TIMEOUT = 60_000;                        // 60s audio download (short)
const DL_TIMEOUT_LARGE = 900_000;                 // Sprint 8: 15min for large audio download
const UPLOAD_TIMEOUT = 300_000;                   // Sprint 8: 5min per chunk (was 3min)
const ASR_POLL_MAX = 3600;                        // R27: 60min 上限 (原 30min 会误杀长播客; 轮询只在 ASR 未完成时继续, 提高上限不增成本)
const ASR_POLL_INTERVAL = 1000;                   // 1s

// R68 上传前压缩(免费提速 BCUT): 服务器上行仅 ~3.7Mbps, 上传 168MB 原始音频要 8.5min(最大瓶颈)。
//   播客是人声, ASR 只需 <8kHz 人声频段 → ffmpeg 压成 mono 16kHz aac(m4a容器, BCUT 支持列表内)。
//   实测 181min: 168MB→45MB, 上传 355s→130s, 转录质量差 0.27%(4778 vs 4783段, 字级words完整)。
//   **只压转录用的临时副本, 用户播放/时间戳/值得听片段全走 DB 里的原始 CDN 链接, 音质不受影响。**
//   压缩失败自动退回原始文件上传(不阻断)。纯 ffmpeg 工具, 无 AI。
const ASR_COMPRESS = process.env.ASR_COMPRESS !== '0';     // 默认开启, 可 env 关
const ASR_COMPRESS_BITRATE = process.env.ASR_COMPRESS_BITRATE || '32k';  // mono 16kHz aac 码率
const ASR_COMPRESS_MIN_MB = Math.max(0, parseInt(process.env.ASR_COMPRESS_MIN_MB || '10', 10));  // 小于此不压(转码开销不划算)

/**
 * R68: ffmpeg 压缩音频为 mono 16kHz aac(仅用于上传给 BCUT 转录, 不影响播放)。
 *   失败/ffmpeg 不可用 → 返回 null, 调用方退回用原始文件。
 * @returns {Promise<string|null>} 压缩后文件路径, 或 null
 */
async function compressForAsr(srcPath, destDir) {
  try {
    const srcMB = fs.statSync(srcPath).size / 1024 / 1024;
    if (srcMB < ASR_COMPRESS_MIN_MB) return null;   // 太小不值得压
    const out = path.join(destDir, `asr-compressed-${crypto.randomUUID()}.m4a`);
    const t0 = Date.now();
    await execFileP('ffmpeg', [
      '-nostdin', '-y', '-i', srcPath,
      '-ac', '1', '-ar', '16000', '-c:a', 'aac', '-b:a', ASR_COMPRESS_BITRATE,
      out,
    ], { timeout: 300_000 });
    const outMB = fs.statSync(out).size / 1024 / 1024;
    logger.info({ srcMB: srcMB.toFixed(1), outMB: outMB.toFixed(1), ms: Date.now() - t0 }, '[bcut] audio compressed for ASR');
    return out;
  } catch (e) {
    logger.warn({ err: e?.message }, '[bcut] compress failed, will upload original');
    return null;
  }
}

/**
 * BCUT API 调用（含审计日志 + 智能重试）
 * Sprint 8 增强：412/429/5xx 视为可重试错误，指数退避（1s → 2s → 4s），最多 3 次
 */
async function bcutRequest({ url, method = 'GET', params, body, headers = {}, context }) {
  const MAX_ATTEMPTS = 3;
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await bcutRequestOnce({ url, method, params, body, headers, context });
    } catch (err) {
      lastError = err;
      const isRetryable =
        err.code === 'BCUT_HTTP_ERROR' &&
        (err.status === 412 || err.status === 429 || (err.status >= 500 && err.status < 600));
      if (!isRetryable || attempt === MAX_ATTEMPTS) throw err;
      const delay = 1000 * Math.pow(2, attempt - 1);
      logger.warn({ attempt, status: err.status, delay }, '[bcut] retryable error, backing off');
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastError;
}

async function bcutRequestOnce({ url, method = 'GET', params, body, headers = {}, context }) {
  let u = url;
  if (params) {
    const q = new URLSearchParams(params).toString();
    u += (url.includes('?') ? '&' : '?') + q;
  }
  const finalHeaders = {
    'User-Agent': BCUT_UA,
    'Content-Type': 'application/json',
    ...headers,
  };
  const t0 = Date.now();
  const resp = await fetch(u, {
    method,
    headers: finalHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
  const latencyMs = Date.now() - t0;
  const text = await resp.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  await logAiCall({
    callType: 'bcut.' + (url.split('/').pop() || 'unknown'),
    provider: 'bcut',
    context,
    requestHeaders: finalHeaders,
    requestBody: body,
    responseStatus: resp.status,
    responseBody: json || text,
    parseOk: !!json,
    latencyMs,
    errorCode: resp.ok ? null : `HTTP_${resp.status}`,
    errorMessage: resp.ok ? null : text.slice(0, 500),
  });

  if (!resp.ok) {
    throw Object.assign(new Error(`BCUT_HTTP_${resp.status}: ${text.slice(0, 200)}`), {
      code: 'BCUT_HTTP_ERROR',
      status: resp.status,
    });
  }
  return json;
}

/**
 * 从 CDN 下载 audio 到本地临时文件
 */
async function downloadAudio(audioUrl, destPath, referer, onDlProgress) {
  const t0 = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DL_TIMEOUT_LARGE); // Sprint 8: 15min for large audio

  try {
    const resp = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
        'Referer': referer || 'https://www.xiaoyuzhoufm.com/',
      },
      redirect: 'follow',
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw Object.assign(new Error(`AUDIO_DL_HTTP_${resp.status}`), {
        code: 'AUDIO_DOWNLOAD_FAILED',
        message: `音频下载失败 (${resp.status})`,
      });
    }

    // Sprint 8: 每 5s 报告一次已下载大小，让上游更新 job progress
    let progressTimer = null;
    if (onDlProgress) {
      progressTimer = setInterval(() => {
        try {
          const sz = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
          onDlProgress({ downloadedMB: (sz / 1024 / 1024).toFixed(1), elapsedS: Math.floor((Date.now() - t0) / 1000) });
        } catch {}
      }, 5000);
    }

    try {
      await pipeline(resp.body, fs.createWriteStream(destPath));
    } finally {
      if (progressTimer) clearInterval(progressTimer);
    }
    const ms = Date.now() - t0;
    const size = fs.statSync(destPath).size;
    return { size, ms };
  } catch (err) {
    // Sprint 8: abort → 更友好的错误
    if (err.name === 'AbortError') {
      throw Object.assign(new Error('AUDIO_DL_TIMEOUT'), {
        code: 'AUDIO_DOWNLOAD_TIMEOUT',
        message: '音频下载超时（15 分钟）— 音频可能过大或网络较慢',
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 主入口：转录一个 audio URL，返回带 timestamp segments
 *
 * @param {string} audioUrl
 * @param {object} [options]
 * @param {string} [options.referer='https://www.xiaoyuzhoufm.com/']
 * @param {object} [options.context] - { userId, jobId, episodeId } 传给 aiLogger
 * @returns {Promise<{
 *   segments: Array<{start:number,end:number,text:string}>,
 *   totalMs: number,
 *   downloadMs: number,
 *   uploadMs: number,
 *   asrMs: number,
 *   audioSize: number,
 * }>}
 */
export async function transcribeAudio(audioUrl, options = {}) {
  const { referer = 'https://www.xiaoyuzhoufm.com/', context = {}, onProgress } = options;
  const t0 = Date.now();

  // Temp file
  const tmpPath = path.join(os.tmpdir(), `k0-bcut-${crypto.randomUUID()}.audio`);
  let compressedPath = null;   // R68 压缩临时副本(finally 需清理, 故提到 try 外)
  logger.info({ audioUrl: audioUrl.slice(0, 80), tmpPath }, 'BCUT transcribe start');

  try {
    // Step 1: Download audio
    if (onProgress) {
      try { onProgress({ phase: 'downloading', elapsedS: 0 }); } catch {}
    }
    const dl = await downloadAudio(audioUrl, tmpPath, referer, onProgress ? ({ downloadedMB, elapsedS }) => {
      try { onProgress({ phase: 'downloading', elapsedS, downloadedMB }); } catch {}
    } : null);
    logger.info({ audioSizeMB: (dl.size / 1024 / 1024).toFixed(1), dlMs: dl.ms }, 'Audio downloaded');
    if (onProgress) {
      try { onProgress({ phase: 'downloaded', elapsedS: Math.floor(dl.ms / 1000), audioSizeMB: (dl.size / 1024 / 1024).toFixed(1) }); } catch {}
    }

    // R68: 上传前压缩(免费提速): 下载的原始音频压成 mono 16kHz aac 临时副本, 只用于上传给 BCUT。
    //   uploadPath = 压缩成功→压缩版; 失败/太小/关闭→原始 tmpPath(退回现状, 不阻断)。
    //   注意: 这只影响"喂给BCUT的文件", 播放走 DB 原始 CDN 链接, 不受影响。
    let uploadPath = tmpPath;
    if (ASR_COMPRESS) {
      compressedPath = await compressForAsr(tmpPath, os.tmpdir());
      if (compressedPath) uploadPath = compressedPath;
    }

    // Step 2: BCUT upload_urls
    if (onProgress) {
      try { onProgress({ phase: 'uploading', elapsedS: Math.floor((Date.now() - t0) / 1000) }); } catch {}
    }
    // R27: 不再 fs.readFileSync 整文件进内存 (226min≈200MB 会撑爆 1.9G 服务器 OOM)。
    //   改为 statSync 拿大小 + 按 chunk 用 fd 惰性 read, 内存占用与音频时长解耦。
    const fileSize = fs.statSync(uploadPath).size;
    const create = await bcutRequest({
      url: `${BCUT_BASE}/resource/create`,
      method: 'POST',
      body: {
        type: 2,
        name: 'audio.m4a',
        size: fileSize,
        ResourceFileType: 'm4a',
        model_id: BCUT_MODEL_ID,
      },
      context,
    });
    const info = create.data || {};
    const uploadUrls = info.upload_urls || [];
    const perSize = info.per_size || fileSize;
    if (!uploadUrls.length) {
      throw Object.assign(new Error('BCUT_NO_UPLOAD_URLS'), { code: 'BCUT_ERROR' });
    }

    // Step 3: Upload chunks (惰性读每块, 不整文件进内存)
    const uploadT0 = Date.now();
    const etags = [];
    const fd = fs.openSync(uploadPath, 'r');
    try {
      for (let i = 0; i < uploadUrls.length; i++) {
        const start = i * perSize;
        const end = Math.min((i + 1) * perSize, fileSize);
        const len = end - start;
        const chunk = Buffer.allocUnsafe(len);
        fs.readSync(fd, chunk, 0, len, start);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), UPLOAD_TIMEOUT);
        try {
          const resp = await fetch(uploadUrls[i], {
            method: 'PUT',
            headers: { 'User-Agent': BCUT_UA },
            body: chunk,
            signal: ctrl.signal,
          });
          if (!resp.ok) {
            throw Object.assign(new Error(`BCUT_UPLOAD_CHUNK_${i}_HTTP_${resp.status}`), { code: 'BCUT_UPLOAD_ERROR' });
          }
          const etag = resp.headers.get('etag') || resp.headers.get('ETag') || '';
          etags.push(etag);
        } finally {
          clearTimeout(t);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    const uploadMs = Date.now() - uploadT0;

    // Step 4: Commit
    const commit = await bcutRequest({
      url: `${BCUT_BASE}/resource/create/complete`,
      method: 'POST',
      body: {
        InBossKey: info.in_boss_key,
        ResourceId: info.resource_id,
        Etags: etags.join(','),
        UploadId: info.upload_id,
        model_id: BCUT_MODEL_ID,
      },
      context,
    });
    const downloadUrlBcut = commit.data?.download_url;
    if (!downloadUrlBcut) {
      throw Object.assign(new Error('BCUT_NO_DOWNLOAD_URL'), { code: 'BCUT_ERROR' });
    }

    // Step 5: Create ASR task
    const task = await bcutRequest({
      url: `${BCUT_BASE}/task`,
      method: 'POST',
      body: { resource: downloadUrlBcut, model_id: BCUT_MODEL_ID },
      context,
    });
    const taskId = task.data?.task_id;
    if (!taskId) {
      throw Object.assign(new Error('BCUT_NO_TASK_ID'), { code: 'BCUT_ERROR' });
    }
    logger.info({ taskId }, 'BCUT task created');

    // Step 6: Poll
    const asrT0 = Date.now();
    for (let poll = 1; poll <= ASR_POLL_MAX; poll++) {
      const result = await bcutRequest({
        url: `${BCUT_BASE}/task/result`,
        params: { model_id: BCUT_MODEL_ID, task_id: taskId },
        context,
      });
      const d = result.data || {};
      const state = d.state;
      if (state === 4) {
        // Success
        const resultData = JSON.parse(d.result || '{}');
        const segments = [];
        for (const u of (resultData.utterances || [])) {
          const text = (u.transcript || '').trim();
          if (!text) continue;
          // Sprint 16 R17: 保留 BCUT 返回的字级 timestamp（words[]），供
          // packGenerator.findQuoteRealStart 高精度定位 quote 第一字的秒数。
          // BCUT words 每项: { label: "字", start_time: ms, end_time: ms }
          const words = Array.isArray(u.words) ? u.words.map(w => ({
            label: w.label || '',
            start: (w.start_time || 0) / 1000,
            end: (w.end_time || 0) / 1000,
          })) : [];
          segments.push({
            start: (u.start_time || 0) / 1000,
            end: (u.end_time || 0) / 1000,
            text,
            words,
          });
        }
        const asrMs = Date.now() - asrT0;
        return {
          segments,
          totalMs: Date.now() - t0,
          downloadMs: dl.ms,
          uploadMs,
          asrMs,
          audioSize: dl.size,
        };
      }
      if ([5, 6, -1].includes(state)) {
        throw Object.assign(new Error(`BCUT_TASK_FAILED_STATE_${state}`), { code: 'BCUT_TASK_FAILED' });
      }
      // Sprint 8: 每 5s 报告一次进度给上游（避免用户界面卡在 20% 不动）
      if (onProgress && poll % 5 === 0) {
        try {
          onProgress({ pollCount: poll, elapsedS: Math.floor((Date.now() - asrT0) / 1000) });
        } catch {}
      }
      await new Promise((r) => setTimeout(r, ASR_POLL_INTERVAL));
    }
    throw Object.assign(new Error('BCUT_POLL_TIMEOUT'), { code: 'BCUT_TIMEOUT' });
  } finally {
    // Cleanup temp file
    fs.rmSync(tmpPath, { force: true });
    if (compressedPath) fs.rmSync(compressedPath, { force: true });   // R68 清压缩副本
    logger.info({ tmpPath }, 'BCUT temp file cleaned');
  }
}
