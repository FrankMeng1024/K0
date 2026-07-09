// K0 backend - AI 调用审计
// 所有 GLM/BCUT/iTunes/RSS 调用都过此 wrapper，写入 ai_call_logs 表
// 用于 Debug + Prompt 微调 + 成本审计

import crypto from 'node:crypto';
import { db } from '../shared/db.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

/**
 * 记录一次 AI/外部服务调用
 * @param {object} params
 * @param {string} params.callType - 'glm.pack.generate' | 'bcut.transcribe' | 'apple.lookup' | ...
 * @param {string} params.provider - 'zhipu-glm' | 'bcut' | 'itunes' | ...
 * @param {string} [params.model]
 * @param {string} [params.promptVersion]
 * @param {object} [params.context] - { userId, jobId, episodeId, transcriptId, packId }
 * @param {object} [params.requestHeaders] - 已移除 Authorization
 * @param {any} [params.requestBody]
 * @param {number} params.responseStatus
 * @param {any} [params.responseBody]
 * @param {boolean} [params.parseOk]
 * @param {number} [params.inputTokens]
 * @param {number} [params.outputTokens]
 * @param {number} params.latencyMs
 * @param {string} [params.errorCode]
 * @param {string} [params.errorMessage]
 */
export async function logAiCall(params) {
  if (!db) return;

  try {
    const {
      callType,
      provider,
      model = null,
      promptVersion = null,
      context = {},
      requestHeaders = null,
      requestBody = null,
      responseStatus,
      responseBody = null,
      parseOk = null,
      inputTokens = null,
      outputTokens = null,
      latencyMs,
      errorCode = null,
      errorMessage = null,
    } = params;

    // 隐藏敏感 header
    const safeHeaders = requestHeaders ? {
      ...requestHeaders,
      authorization: requestHeaders.authorization ? '[REDACTED]' : undefined,
      Authorization: requestHeaders.Authorization ? '[REDACTED]' : undefined,
    } : null;

    // 请求 body 序列化
    const requestStr = requestBody ? (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)) : null;
    const requestHash = requestStr ? crypto.createHash('sha256').update(requestStr).digest('hex') : null;
    const requestSnippet = requestStr ? (
      requestStr.length > 2000
        ? requestStr.slice(0, 500) + '\n...[truncated]...\n' + requestStr.slice(-500)
        : requestStr
    ) : null;

    // 响应 body
    const responseStr = responseBody ? (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)) : null;
    const responseSnippet = responseStr ? responseStr.slice(0, 2000) : null;

    const totalTokens = (inputTokens || 0) + (outputTokens || 0) || null;

    await db.execute(
      `INSERT INTO ai_call_logs (
        call_type, provider, model, prompt_version,
        user_id, job_id, episode_id, transcript_id, pack_id,
        request_headers, request_body_hash, request_body_snippet, request_full_body,
        response_status, response_body_snippet, response_full_body, parse_ok,
        input_tokens, output_tokens, total_tokens,
        latency_ms, error_code, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        callType, provider, model, promptVersion,
        context.userId || null, context.jobId || null, context.episodeId || null, context.transcriptId || null, context.packId || null,
        safeHeaders ? JSON.stringify(safeHeaders) : null,
        requestHash, requestSnippet, requestStr,
        responseStatus, responseSnippet, responseStr, parseOk,
        inputTokens, outputTokens, totalTokens,
        latencyMs, errorCode, errorMessage,
      ]
    );
  } catch (e) {
    // AI logger 挂了不能阻塞主链路
    logger.error({ err: e.message, callType: params.callType }, 'AI logger failed');
  }
}

/**
 * 包装一个 fetch 调用，自动记录到 ai_call_logs
 * @param {object} params
 * @param {string} params.callType
 * @param {string} params.provider
 * @param {string} [params.model]
 * @param {string} [params.promptVersion]
 * @param {object} [params.context]
 * @param {string} params.url
 * @param {object} params.fetchOptions
 * @returns {Promise<Response>}  raw response，还可继续 .json()/.text() 消费
 */
export async function loggedFetch(params) {
  const { callType, provider, model, promptVersion, context, url, fetchOptions = {} } = params;
  const t0 = Date.now();
  let response, responseBody, parseOk = null, errorCode = null, errorMessage = null;

  try {
    response = await fetch(url, fetchOptions);
    const respText = await response.text();
    try {
      responseBody = JSON.parse(respText);
      parseOk = true;
    } catch {
      responseBody = respText;
      parseOk = false;
    }
    const latencyMs = Date.now() - t0;

    // Token usage (GLM 返回里的 usage 字段)
    const inputTokens = responseBody?.usage?.prompt_tokens || null;
    const outputTokens = responseBody?.usage?.completion_tokens || null;

    if (!response.ok) {
      errorCode = `HTTP_${response.status}`;
      errorMessage = (typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)).slice(0, 500);
    }

    await logAiCall({
      callType, provider, model, promptVersion, context,
      requestHeaders: fetchOptions.headers,
      requestBody: fetchOptions.body,
      responseStatus: response.status,
      responseBody,
      parseOk,
      inputTokens,
      outputTokens,
      latencyMs,
      errorCode,
      errorMessage,
    });

    return { response, body: responseBody, latencyMs, parseOk };
  } catch (e) {
    await logAiCall({
      callType, provider, model, promptVersion, context,
      requestHeaders: fetchOptions.headers,
      requestBody: fetchOptions.body,
      responseStatus: 0,
      latencyMs: Date.now() - t0,
      errorCode: 'FETCH_ERROR',
      errorMessage: e.message,
    });
    throw e;
  }
}

/**
 * 手动标注某个调用为"质量差"（Frank 通过管理 UI 用）
 */
export async function flagQuality(logId, note) {
  if (!db) return;
  await db.execute(
    'UPDATE ai_call_logs SET quality_flagged = TRUE, quality_note = ? WHERE id = ?',
    [note, logId]
  );
}
