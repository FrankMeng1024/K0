// SPIKE-014-batch: 批量测 BCUT ASR 稳定性
// 从 spike-010 CSV 拿 audio URL, 抽 N 集测:
//   - 转录成功率
//   - 时长分布（每集耗时）
//   - segment 数量
//   - 错误类型分类

import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

const BCUT_BASE = 'https://member.bilibili.com/x/bcut/rubick-interface';
const BCUT_MODEL_ID = '8';
const HEADERS = {
  'User-Agent': 'Bilibili/1.0.0 (https://www.bilibili.com)',
  'Content-Type': 'application/json',
};

async function jsonReq(url, { method='GET', body, params, headers={} } = {}) {
  let u = url;
  if (params) u += (url.includes('?') ? '&' : '?') + new URLSearchParams(params);
  const resp = await fetch(u, {
    method,
    headers: { ...HEADERS, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

async function transcribe(audioPath) {
  const t0 = Date.now();
  const buf = fs.readFileSync(audioPath);
  const size = buf.length;
  const create = await jsonReq(`${BCUT_BASE}/resource/create`, {
    method: 'POST',
    body: { type: 2, name: 'audio.m4a', size, ResourceFileType: 'm4a', model_id: BCUT_MODEL_ID },
  });
  const info = create.data || {};
  const uploadUrls = info.upload_urls || [];
  const perSize = info.per_size || size;
  if (!uploadUrls.length) throw new Error('no upload_urls');

  const etags = [];
  for (let i = 0; i < uploadUrls.length; i++) {
    const start = i * perSize;
    const end = Math.min((i + 1) * perSize, size);
    const resp = await fetch(uploadUrls[i], { method: 'PUT', headers: HEADERS, body: buf.subarray(start, end) });
    if (!resp.ok) throw new Error(`chunk ${i} HTTP ${resp.status}`);
    etags.push(resp.headers.get('etag') || resp.headers.get('ETag') || '');
  }
  const uploadMs = Date.now() - t0;

  const commit = await jsonReq(`${BCUT_BASE}/resource/create/complete`, {
    method: 'POST',
    body: {
      InBossKey: info.in_boss_key, ResourceId: info.resource_id,
      Etags: etags.join(','), UploadId: info.upload_id, model_id: BCUT_MODEL_ID,
    },
  });
  const downloadUrl = commit.data?.download_url;
  if (!downloadUrl) throw new Error('no download_url');

  const task = await jsonReq(`${BCUT_BASE}/task`, {
    method: 'POST',
    body: { resource: downloadUrl, model_id: BCUT_MODEL_ID },
  });
  const taskId = task.data?.task_id;
  if (!taskId) throw new Error('no task_id');

  const asrT0 = Date.now();
  for (let poll = 1; poll <= 900; poll++) {
    const r = await jsonReq(`${BCUT_BASE}/task/result`, {
      params: { model_id: BCUT_MODEL_ID, task_id: taskId },
    });
    const d = r.data || {};
    if (d.state === 4) {
      const data = JSON.parse(d.result || '{}');
      const segs = (data.utterances || []).filter(u => u.transcript?.trim()).length;
      return {
        totalMs: Date.now() - t0,
        uploadMs,
        asrMs: Date.now() - asrT0,
        segments: segs,
        firstText: data.utterances?.[0]?.transcript?.trim() || '',
      };
    }
    if ([5, 6, -1].includes(d.state)) throw new Error(`task failed state=${d.state}`);
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('poll timeout');
}

async function download(url, dest) {
  const resp = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 Chrome/120.0',
      'Referer': 'https://www.xiaoyuzhoufm.com/',
    },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
  await pipeline(resp.body, fs.createWriteStream(dest));
  return fs.statSync(dest).size;
}

// ── main ──
const csvPath = 'spike/data/spike-010-xiaoyuzhou-audio.csv';
const csv = fs.readFileSync(csvPath, 'utf8').split('\n').slice(1).filter(Boolean);

// 抽 10 集：按大小分布
const samples = csv
  .map(l => {
    const cols = l.split(',');
    return { url: cols[0], title: cols[3], audioUrl: cols[5], size: parseFloat(cols[6]) || 0 };
  })
  .filter(x => x.audioUrl && x.size > 0)
  .sort((a, b) => a.size - b.size);

const N = Math.min(10, samples.length);
const step = Math.max(1, Math.floor(samples.length / N));
const picked = [];
for (let i = 0; i < samples.length && picked.length < N; i += step) {
  picked.push(samples[i]);
}
console.log(`Picked ${picked.length} samples (size range ${picked[0].size}-${picked[picked.length-1].size} MB)`);

const results = [];
for (let i = 0; i < picked.length; i++) {
  const s = picked[i];
  console.log(`\n[${i+1}/${picked.length}] ${s.title.slice(0,30)} (${s.size} MB)`);
  const tmpPath = `spike/data/tmp-audio-${i}.m4a`;
  fs.mkdirSync('spike/data', { recursive: true });
  try {
    const dlT0 = Date.now();
    const dlSize = await download(s.audioUrl, tmpPath);
    const dlMs = Date.now() - dlT0;
    console.log(`  dl: ${(dlSize/1024/1024).toFixed(1)}MB in ${(dlMs/1000).toFixed(1)}s`);
    const r = await transcribe(tmpPath);
    console.log(`  ✅ ${r.segments} segs, total=${(r.totalMs/1000).toFixed(1)}s (upload=${(r.uploadMs/1000).toFixed(1)}s asr=${(r.asrMs/1000).toFixed(1)}s)`);
    console.log(`     first: ${r.firstText.slice(0,40)}`);
    results.push({ ok: true, ...s, dlSize, dlMs, ...r });
  } catch (e) {
    console.log(`  ❌ ${e.message}`);
    results.push({ ok: false, ...s, error: e.message });
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

// 汇总 CSV
const outCsv = ['idx,url,title,sizeMB,dlMs,uploadMs,asrMs,totalMs,segments,ok,error,firstText'];
results.forEach((r, i) => {
  outCsv.push([
    i+1, r.url, `"${(r.title||'').replace(/"/g,'""')}"`, r.size,
    r.dlMs||'', r.uploadMs||'', r.asrMs||'', r.totalMs||'', r.segments||'',
    r.ok, `"${(r.error||'').replace(/"/g,'""')}"`, `"${(r.firstText||'').replace(/"/g,'""')}"`
  ].join(','));
});
const outPath = 'spike/data/spike-014-bcut-batch-10.csv';
fs.writeFileSync(outPath, outCsv.join('\n'));

const okCount = results.filter(r => r.ok).length;
const okResults = results.filter(r => r.ok);
const avgTotal = okResults.reduce((a,r) => a+r.totalMs, 0) / okResults.length / 1000;
console.log(`\n═══ SPIKE-014 BCUT 深挖结果 ═══`);
console.log(`成功率: ${okCount}/${results.length}`);
console.log(`平均总耗时: ${avgTotal.toFixed(1)}s`);
console.log(`CSV → ${outPath}`);
