// Push router — Sprint 9 STORY-00904
// POST /api/push/register  存/更新用户 push token
// POST /api/push/test      测试给自己发一条（开发用）

import { Router } from 'express';
import { db } from '../config/db.js';
import { ErrorCode } from '../lib/errors.js';
import { sendExpoPush } from '../services/pushService.js';

const router = Router();

async function resolveUserId(req) {
  return req.user?.id || null;
}

/**
 * POST /api/push/register
 * Body: { platform?, appVersion? }
 * 前端拿到 Expo Push Token 后 upsert 到 DB
 */
router.post('/register', async (req, res, next) => {
  if (!db) return res.json({ ok: true, note: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const { token, platform = 'ios', appVersion = null } = req.body || {};
    if (!token || typeof token !== 'string' || token.length < 10) {
      return next(Object.assign(new Error('VALIDATION_ERROR'), {
        status: 400,
        apiError: { code: ErrorCode.VALIDATION_ERROR, message: 'token required' },
      }));
    }
    // upsert：同一 token 更新到最新 user_id + last_used_at
    await db.execute(
      `INSERT INTO push_tokens (user_id, token, platform, app_version, last_used_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         platform = VALUES(platform),
         app_version = VALUES(app_version),
         last_used_at = NOW(),
         updated_at = NOW()`,
      [userId, token, platform, appVersion]
    );
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/push/test
 * 给当前 user 所有 token 发一条测试通知
 * Body: { body? }
 */
router.post('/test', async (req, res, next) => {
  if (!db) return res.json({ ok: false, error: 'no db' });
  try {
    const userId = await resolveUserId(req);
    const [rows] = await db.execute(
      `SELECT token FROM push_tokens WHERE user_id = ? LIMIT 10`,
      [userId]
    );
    if (!rows.length) {
      return res.json({ ok: false, error: 'no tokens registered for this user' });
    }
    const { title = 'K0 测试通知', body = '推送通道 OK' } = req.body || {};
    const messages = rows.map((r) => ({
      to: r.token,
      title,
      body,
      sound: 'default',
      data: { kind: 'test' },
    }));
    const result = await sendExpoPush(messages);
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
