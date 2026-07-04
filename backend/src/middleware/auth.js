// JWT auth middleware — soft mode if AUTH_ENABLED=false, defaults user_id=1
import jwt from 'jsonwebtoken';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-prod';

/**
 * attachUser: sets req.user = { id, ... } based on Authorization header.
 * - AUTH_ENABLED=false (Sprint 1 default): if header missing → user_id=1 (dev default).
 *   If header present, still verify; if invalid → 401 (never silently downgrade).
 * - AUTH_ENABLED=true: header required. Missing/invalid → 401.
 */
export function attachUser(req, res, next) {
  const authHeader = req.header('authorization');

  if (!authHeader) {
    if (AUTH_ENABLED) {
      return res.status(401).json({ error: 'missing_auth' });
    }
    req.user = { id: 1, source: 'dev_default' };
    return next();
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({ error: 'invalid_auth_scheme' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.user_id) {
      return res.status(401).json({ error: 'invalid_token_payload' });
    }
    req.user = { id: payload.user_id, source: 'jwt', payload };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token', reason: e.message });
  }
}

/**
 * Helper for tests: sign a token
 */
export function signToken(user_id, expiresIn = '7d') {
  return jwt.sign({ user_id }, JWT_SECRET, { expiresIn });
}
