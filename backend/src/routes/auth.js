// K0 auth routes — Sprint 16 R2
// POST /api/auth/register  { username, password } → { anonymousId, username }
// POST /api/auth/login     { username, password } → { anonymousId, username }
//
// 设计：
//   - 不限 username/password 格式（Frank: 输入啥是啥）
//   - bcrypt 存密码 hash
//   - 登录成功返回 anonymous_id（已存在的 UUID），前端存到 AsyncStorage
//   - 后续所有 /api/library、/api/review 等仍用 anonymousId 参数（无需大改）
//   - 无 JWT/session，简化 —— anonymousId 本身就是 opaque token
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { db } from '../config/db.js';

const router = Router();

// 生成 v4 UUID (36 chars)
function newAnonymousId() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: '用户名和密码都要填' });
  }
  const u = String(username);
  const p = String(password);
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [u]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'USERNAME_TAKEN', message: '这个用户名已经被用了' });
    }
    const hash = await bcrypt.hash(p, 10);
    const anonId = newAnonymousId();
    await db.query(
      'INSERT INTO users (anonymous_id, username, password_hash, display_name, created_at, updated_at) VALUES (?, ?, ?, ?, NOW(), NOW())',
      [anonId, u, hash, u]
    );
    return res.json({ anonymousId: anonId, username: u });
  } catch (e) {
    req.log?.error({ err: e }, 'register failed');
    return res.status(500).json({ error: 'SERVER_ERROR', message: '服务器错了，等下再试' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'MISSING_FIELDS', message: '用户名和密码都要填' });
  }
  const u = String(username);
  const p = String(password);
  try {
    const [rows] = await db.query(
      'SELECT id, anonymous_id, username, password_hash FROM users WHERE username = ? LIMIT 1',
      [u]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码不对' });
    }
    const row = rows[0];
    const ok = await bcrypt.compare(p, row.password_hash || '');
    if (!ok) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '用户名或密码不对' });
    }
    // 更新 last_seen_at
    await db.query('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [row.id]);
    return res.json({ anonymousId: row.anonymous_id, username: row.username });
  } catch (e) {
    req.log?.error({ err: e }, 'login failed');
    return res.status(500).json({ error: 'SERVER_ERROR', message: '服务器错了，等下再试' });
  }
});

export default router;
