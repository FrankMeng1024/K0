// K0 auth routes — Refactor Phase 1 (2026-07-09)
// 变化：Frank 决策 2 - 匿名账户不存在。JWT 替代 anonymousId 做 session token
// POST /api/auth/register  { username, password } → { token, userId, username }
// POST /api/auth/login     { username, password } → { token, userId, username }
//
// 客户端存 token，Authorization: Bearer <token> 调所有 API
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../config/db.js';
import { signToken } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: '用户名和密码都要填' } });
  }
  const u = String(username);
  const p = String(password);
  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [u]);
    if (existing.length > 0) {
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: '这个用户名已经被用了' } });
    }
    const hash = await bcrypt.hash(p, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, password_hash, display_name, last_seen_at) VALUES (?, ?, ?, NOW())',
      [u, hash, u]
    );
    const userId = result.insertId;
    const token = signToken(userId);
    return res.json({ token, userId, username: u });
  } catch (e) {
    req.log?.error({ err: e }, 'register failed');
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: '服务器错了，等下再试' } });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: { code: 'MISSING_FIELDS', message: '用户名和密码都要填' } });
  }
  const u = String(username);
  const p = String(password);
  try {
    const [rows] = await db.query(
      'SELECT id, username, password_hash FROM users WHERE username = ? LIMIT 1',
      [u]
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: '用户名或密码不对' } });
    }
    const row = rows[0];
    const ok = await bcrypt.compare(p, row.password_hash || '');
    if (!ok) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: '用户名或密码不对' } });
    }
    await db.query('UPDATE users SET last_seen_at = NOW() WHERE id = ?', [row.id]);
    const token = signToken(row.id);
    return res.json({ token, userId: row.id, username: row.username });
  } catch (e) {
    req.log?.error({ err: e }, 'login failed');
    return res.status(500).json({ error: { code: 'SERVER_ERROR', message: '服务器错了，等下再试' } });
  }
});

export default router;
