// K0 Backend — Expo Push Service 客户端
// Sprint 9 STORY-00904: job 完成时给用户手机推通知
//
// Expo Push API 特点：
//   - 免费无限量（Expo 官方托管）
//   - 单次最多 100 条 token
//   - 无需 APNs Auth Key（Expo 代管）
//   - 需要 iOS build 里有 expo-notifications
//
// 参考：https://docs.expo.dev/push-notifications/sending-notifications/

import pino from 'pino';
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * 单条 push message
 * @typedef {Object} PushMessage
 * @property {string} to - ExponentPushToken[xxxxxxxx]
 * @property {string} title
 * @property {string} body
 * @property {Object} [data] - 客户端点通知后可拿到的 payload
 * @property {string} [sound] - 'default' | null
 * @property {number} [badge]
 * @property {string} [channelId] - Android
 */

/**
 * 发送 push 消息（单条或批量）
 * @param {PushMessage | PushMessage[]} messages
 * @returns {Promise<{ok: boolean, tickets?: any[], error?: string}>}
 */
export async function sendExpoPush(messages) {
  const arr = Array.isArray(messages) ? messages : [messages];
  if (!arr.length) return { ok: true, tickets: [] };

  // 过滤明显无效的 token（不以 ExponentPushToken 开头 / ExpoPushToken 开头）
  const valid = arr.filter((m) => {
    if (!m?.to || typeof m.to !== 'string') return false;
    return m.to.startsWith('ExponentPushToken[') || m.to.startsWith('ExpoPushToken[');
  });

  if (!valid.length) {
    logger.warn({ totalMessages: arr.length }, 'expo_push_no_valid_tokens');
    return { ok: false, error: 'no valid tokens' };
  }

  try {
    // 30s 超时保护
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    const resp = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(valid),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.error({ status: resp.status, body: text }, 'expo_push_http_error');
      return { ok: false, error: `HTTP ${resp.status}` };
    }

    const json = await resp.json();
    logger.info({ tokenCount: valid.length, tickets: json?.data?.length || 0 }, 'expo_push_sent');
    return { ok: true, tickets: json?.data || [] };
  } catch (err) {
    if (err?.name === 'AbortError') {
      logger.error('expo_push_timeout');
      return { ok: false, error: 'timeout' };
    }
    logger.error({ err: err?.message }, 'expo_push_failed');
    return { ok: false, error: err?.message || 'unknown' };
  }
}

/**
 * 拉取用户所有活跃 push tokens
 * @param {import('mysql2/promise').Pool} db
 * @param {number} userId
 * @returns {Promise<string[]>}
 */
export async function getUserPushTokens(db, userId) {
  if (!db) return [];
  try {
    const [rows] = await db.execute(
      `SELECT token FROM push_tokens WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10`,
      [userId]
    );
    return rows.map((r) => r.token);
  } catch (err) {
    logger.error({ err: err?.message, userId }, 'get_user_push_tokens_failed');
    return [];
  }
}

/**
 * job 完成后给用户推"学习包已生成"通知
 * @param {import('mysql2/promise').Pool} db
 * @param {number} userId
 * @param {string} jobId
 * @param {number} packId
 * @param {string} episodeTitle
 */
export async function notifyJobReady(db, userId, jobId, packId, episodeTitle) {
  const tokens = await getUserPushTokens(db, userId);
  if (!tokens.length) {
    logger.info({ userId, jobId }, 'notify_job_ready_no_tokens');
    return { ok: false, error: 'no tokens' };
  }

  const title = '学习包已生成';
  // 标题过长省略处理
  const safeTitle = (episodeTitle || '').length > 40
    ? (episodeTitle || '').slice(0, 40) + '…'
    : (episodeTitle || '你的播客');
  const body = `《${safeTitle}》可以开始学习了`;

  const messages = tokens.map((token) => ({
    to: token,
    title,
    body,
    sound: 'default',
    data: { jobId, packId, kind: 'job_ready' },
  }));

  return sendExpoPush(messages);
}

/**
 * job 失败通知（可选，MVP 阶段可能不发以免打扰）
 */
export async function notifyJobFailed(db, userId, jobId, errorMessage) {
  const tokens = await getUserPushTokens(db, userId);
  if (!tokens.length) return { ok: false, error: 'no tokens' };

  const messages = tokens.map((token) => ({
    to: token,
    title: '这条链接没能处理成功',
    body: errorMessage || '你可以试试别的链接',
    sound: 'default',
    data: { jobId, kind: 'job_failed' },
  }));
  return sendExpoPush(messages);
}
