// SPIKE-015: 剪映 (jianying) 云端 ASR - Node.js 移植
// 参考: Hatari130/podcast-bridge transcribe.py:1080-1286
//
// 剪映 ASR 比 BCUT 更复杂：
//   - 需要 tdid (device id 生成)
//   - 需要通过第三方公共签名服务拿签名 (asrtools-update.bkfeng.top)
//   - 上传走字节 vod (bytedanceapi.com) 且要 AWS SigV4 签名
//   - 最终提交到 lv-pc-api-sinfonlinec.ulikecam.com
//
// 这些额外依赖增加脆弱性，但 podcast-bridge 已验证工作，先移植。

import fs from 'node:fs';
import crypto from 'node:crypto';

const JIANYING_SIGN_URL = 'https://asrtools-update.bkfeng.top/sign';
const JIANYING_API_BASE = 'https://lv-pc-api-sinfonlinec.ulikecam.com';

// 用参考代码里的 tdid 生成方式
function tdid() {
  const yearDigit = new Date().getFullYear().toString()[3]; // "5" or "6"
  const prefix = 390 + parseInt(yearDigit);
  const isOdd = parseInt(yearDigit) % 2 !== 0;
  const suffix = isOdd ? '3278516897751' : `${crypto.randomBytes(6).readUIntBE(0, 6).toString().padStart(13, '0').slice(0, 13)}`;
  return `${prefix}${suffix}`;
}

async function jianyingSign(path, tdidStr) {
  const currentTime = String(Math.floor(Date.now() / 1000));
  const resp = await fetch(JIANYING_SIGN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'podcast-bridge/1.0',
      'tdid': tdidStr,
      't': currentTime,
    },
    body: JSON.stringify({
      url: path,
      current_time: currentTime,
      pf: '4',
      appvr: '6.6.0',
      tdid: tdidStr,
    }),
  });
  if (!resp.ok) throw new Error(`sign HTTP ${resp.status}: ${await resp.text()}`);
  const j = await resp.json();
  if (!j.sign) throw new Error(`sign missing: ${JSON.stringify(j)}`);
  return { sign: j.sign.toLowerCase(), deviceTime: currentTime };
}

async function jianyingHeaders(path, tdidStr) {
  const { sign, deviceTime } = await jianyingSign(path, tdidStr);
  return {
    'User-Agent': 'Cronet/TTNetVersion:d4572e53 2024-06-12 QuicVersion:4bf243e0 2023-04-17',
    'appvr': '6.6.0',
    'device-time': deviceTime,
    'pf': '4',
    'sign': sign,
    'sign-ver': '1',
    'tdid': tdidStr,
  };
}

function hmacSha256(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}

function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg).digest('hex');
}

function crc32Hex(buf) {
  // 简易 CRC32 - Node 内置没有，用 zlib
  const zlib = require('zlib');
  const crc = zlib.crc32(buf);
  return crc.toString(16).padStart(8, '0');
}

async function transcribeWithJianying(audioPath) {
  const t0 = Date.now();
  const fileBuf = fs.readFileSync(audioPath);
  const size = fileBuf.length;
  const zlib = await import('node:zlib');
  const crc = zlib.crc32(fileBuf).toString(16).padStart(8, '0');
  const td = tdid();

  console.log(`[jianying] file: ${(size / 1024 / 1024).toFixed(1)}MB  tdid=${td}  crc=${crc}`);

  // 1. upload_sign
  let path = '/lv/v1/upload_sign';
  let h = await jianyingHeaders(path, td);
  const uploadSignResp = await fetch(JIANYING_API_BASE + path, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ biz: 'pc-recognition' }),
  });
  if (!uploadSignResp.ok) throw new Error(`upload_sign HTTP ${uploadSignResp.status}: ${await uploadSignResp.text()}`);
  const uploadSignJson = await uploadSignResp.json();
  const uploadData = uploadSignJson.data || {};
  const { access_key_id: accessKey, secret_access_key: secretKey, session_token: sessionToken } = uploadData;
  if (!accessKey || !secretKey || !sessionToken) throw new Error(`upload_sign missing keys: ${JSON.stringify(uploadSignJson)}`);
  console.log(`[jianying] upload_sign OK`);

  // 2. Apply upload via bytedance vod (AWS SigV4)
  const requestParams = `Action=ApplyUploadInner&FileSize=${size}&FileType=object&IsInner=1&SpaceName=lv-mac-recognition&Version=2020-11-19&s=5y0udbjapi`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const authHeaders = { 'x-amz-date': amzDate, 'x-amz-security-token': sessionToken };

  // Canonical request
  const canonicalHeaders = Object.entries(authHeaders).map(([k, v]) => `${k}:${v}`).join('\n') + '\n';
  const signedHeaders = Object.keys(authHeaders).join(';');
  const payloadHash = sha256Hex('');
  const canonicalRequest = `GET\n/\n${requestParams}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const credentialScope = `${dateStamp}/cn/vod/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${sha256Hex(canonicalRequest)}`;

  const kDate = hmacSha256(Buffer.from('AWS4' + secretKey, 'utf-8'), dateStamp);
  const kRegion = hmacSha256(kDate, 'cn');
  const kService = hmacSha256(kRegion, 'vod');
  const kSigning = hmacSha256(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  authHeaders['authorization'] = `AWS4-HMAC-SHA256 Credential=${accessKey}/${dateStamp}/cn/vod/aws4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const applyResp = await fetch(`https://vod.bytedanceapi.com/?${requestParams}`, { headers: authHeaders });
  if (!applyResp.ok) throw new Error(`vod apply HTTP ${applyResp.status}: ${await applyResp.text()}`);
  const applyJson = await applyResp.json();
  const uploadAddr = (applyJson.Result || {}).UploadAddress || {};
  const storeInfo = (uploadAddr.StoreInfos || [{}])[0];
  const { StoreUri: storeUri, Auth: auth, UploadID: uploadId } = storeInfo;
  const sessionKey = uploadAddr.SessionKey;
  const uploadHost = (uploadAddr.UploadHosts || [''])[0];
  if (!storeUri || !auth || !uploadId || !uploadHost) throw new Error(`vod apply missing: ${JSON.stringify(applyJson)}`);
  console.log(`[jianying] vod apply OK  host=${uploadHost}`);

  const uploadHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Authorization': auth,
    'Content-CRC32': crc,
  };

  // 3. Upload file
  const uploadUrl = `https://${uploadHost}/${storeUri}?partNumber=1&uploadID=${uploadId}`;
  console.log(`[jianying] uploading...`);
  const upT0 = Date.now();
  const upResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: uploadHeaders,
    body: fileBuf,
  });
  if (!upResp.ok) throw new Error(`vod upload HTTP ${upResp.status}: ${await upResp.text()}`);
  const upJson = await upResp.json().catch(() => ({}));
  if (upJson.success !== 0) throw new Error(`vod upload failed: ${JSON.stringify(upJson)}`);
  const uploadMs = Date.now() - upT0;
  console.log(`[jianying] upload OK in ${(uploadMs / 1000).toFixed(1)}s`);

  // 4. Check + commit
  await fetch(`https://${uploadHost}/${storeUri}?uploadID=${uploadId}`, {
    method: 'POST',
    headers: uploadHeaders,
    body: `1:${crc}`,
  });
  await fetch(`https://${uploadHost}/${storeUri}?uploadID=${uploadId}&partNumber=1&x-amz-security-token=${encodeURIComponent(sessionToken)}`, {
    method: 'PUT',
    headers: uploadHeaders,
    body: fileBuf,
  });

  // 5. Submit ASR (需要 duration 参数，音频总秒数，暂用文件大小估算 60s per MB)
  const durationSec = Math.max(60, size / (1024 * 1024) * 60); // rough estimate
  const submitPayload = {
    adjust_endtime: 200,
    audio: storeUri,
    caption_type: 2,
    client_request_id: crypto.randomUUID(),
    max_lines: 1,
    songs_info: [{ end_time: Math.floor(durationSec * 1000), id: '', start_time: 0 }],
    words_per_line: 16,
  };
  path = '/lv/v1/audio_subtitle/submit';
  h = await jianyingHeaders(path, td);
  const submitResp = await fetch(JIANYING_API_BASE + path, {
    method: 'POST',
    headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify(submitPayload),
  });
  if (!submitResp.ok) throw new Error(`submit HTTP ${submitResp.status}: ${await submitResp.text()}`);
  const submitJson = await submitResp.json();
  if (submitJson.ret !== '0') throw new Error(`submit failed: ${JSON.stringify(submitJson)}`);
  const queryId = submitJson.data?.id;
  if (!queryId) throw new Error(`no query id: ${JSON.stringify(submitJson)}`);
  console.log(`[jianying] submit OK  query_id=${queryId}`);

  // 6. Poll
  const asrT0 = Date.now();
  for (let poll = 1; poll <= 180; poll++) {
    path = '/lv/v1/audio_subtitle/query';
    h = await jianyingHeaders(path, td);
    const q = await fetch(JIANYING_API_BASE + path, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: queryId, pack_options: { need_attribute: true } }),
    });
    if (!q.ok) throw new Error(`query HTTP ${q.status}`);
    const qj = await q.json();
    if (qj.ret !== '0') throw new Error(`query failed: ${JSON.stringify(qj)}`);
    const utts = qj.data?.utterances;
    if (utts) {
      const segments = [];
      for (const u of utts) {
        const text = (u.text || '').trim();
        if (!text) continue;
        segments.push({ start: (u.start_time || 0) / 1000, end: (u.end_time || 0) / 1000, text });
      }
      return { segments, totalMs: Date.now() - t0, uploadMs, asrMs: Date.now() - asrT0 };
    }
    if (poll % 10 === 0) console.log(`[jianying] waiting... ${poll * 2}s`);
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('jianying poll timeout (>6 min)');
}

// ── CLI ──
const audioPath = process.argv[2];
if (!audioPath) {
  console.log('Usage: node spike/asr/jianying.js <audioPath>');
  process.exit(1);
}
try {
  const r = await transcribeWithJianying(audioPath);
  console.log(`\n✅ ${r.segments.length} segments in ${(r.totalMs / 1000).toFixed(1)}s`);
  console.log(`Upload: ${(r.uploadMs / 1000).toFixed(1)}s  ASR: ${(r.asrMs / 1000).toFixed(1)}s`);
  console.log(`First 5:`);
  r.segments.slice(0, 5).forEach(s => console.log(`  [${s.start.toFixed(1)}-${s.end.toFixed(1)}s] ${s.text}`));
  const outPath = `spike/data/spike-015-jianying-${Date.now()}.json`;
  fs.writeFileSync(outPath, JSON.stringify(r, null, 2));
  console.log(`\n💾 → ${outPath}`);
} catch (e) {
  console.error(`\n❌ ${e.message}`);
  process.exit(2);
}
