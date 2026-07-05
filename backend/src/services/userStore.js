// K0 backend - User service (anonymous_id)
// Sprint 6: 用 anonymous_id UUID 标识用户，未来加 Apple/微信登录时扩展

import { db } from '../config/db.js';

/**
 * Upsert 用户（用 anonymous_id）
 * @param {string} anonymousId - UUID
 * @returns {Promise<{id: number, anonymousId: string, createdAt: Date}>}
 */
export async function getOrCreateUserByAnonymousId(anonymousId) {
  const [existing] = await db.execute(
    'SELECT id, anonymous_id, created_at FROM users WHERE anonymous_id = ? LIMIT 1',
    [anonymousId]
  );
  if (existing.length) {
    // Update last_seen
    await db.execute('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [existing[0].id]);
    return {
      id: existing[0].id,
      anonymousId: existing[0].anonymous_id,
      createdAt: existing[0].created_at,
    };
  }

  const [result] = await db.execute(
    'INSERT INTO users (anonymous_id, last_seen_at) VALUES (?, NOW())',
    [anonymousId]
  );
  return { id: result.insertId, anonymousId, createdAt: new Date() };
}

/**
 * 拿用户 by internal id
 */
export async function getUserById(userId) {
  const [rows] = await db.execute(
    'SELECT id, anonymous_id, apple_user_id, display_name, locale, subscription_tier, created_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}
