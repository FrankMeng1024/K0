// K0 backend - User service
// Refactor Phase 1 (2026-07-09): 无 anonymousId。用户通过 JWT + user_id 识别
import { db } from '../config/db.js';

/**
 * 拿用户 by internal id
 */
export async function getUserById(userId) {
  const [rows] = await db.execute(
    'SELECT id, username, apple_user_id, display_name, locale, subscription_tier, created_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  return rows[0] || null;
}
