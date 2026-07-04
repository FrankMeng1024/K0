// JWT auth middleware — soft mode if AUTH_ENABLED=false, defaults user_id=1
import jwt from 'jsonwebtoken';

// Production guard runs once at startup: if NODE_ENV=production and AUTH_ENABLED is not 'true',
// force it on and log a loud warning. This must happen before the first request.
if (process.env.NODE_ENV === 'production' && process.env.AUTH_ENABLED !== 'true') {
  console.warn('[SECURITY] AUTH_ENABLED is not set to true in NODE_ENV=production. Forcing AUTH_ENABLED=true. Set AUTH_ENABLED=true in your .env.production to suppress this warning.');
  process.env.AUTH_ENABLED = 'true';
}

/**
 * attachUser: sets req.user = { id, source, ... } based on Authorization header.
 * Reads AUTH_ENABLED from process.env dynamically so tests can override it.
 * - AUTH_ENABLED=false (dev default): if header missing → user_id=1 (dev default).
 *   If header present, still verify; if invalid → 401 (never silently downgrade).
 * - AUTH_ENABLED=true: header required. Missing/invalid → 401.
 *
 * All 401 responses use the contract error envelope:
 *   { error: { code: 'MISSING_AUTH' | 'INVALID_AUTH_SCHEME' | 'INVALID_TOKEN', message, details? } }
 */
export function attachUser(req, res, next) {
  const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-prod';
  const authHeader = req.header('authorization');

  if (!authHeader) {
    if (AUTH_ENABLED) {
      return res.status(401).json({
        error: {
          code: 'MISSING_AUTH',
          message: 'Authorization header is required. Use: Authorization: Bearer <token>',
        },
      });
    }
    req.user = { id: 1, source: 'dev_default' };
    return next();
  }

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({
      error: {
        code: 'INVALID_AUTH_SCHEME',
        message: 'Invalid authorization scheme. Expected: Authorization: Bearer <token>',
      },
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.user_id) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token payload is missing user_id',
          details: { reason: 'missing_user_id_claim' },
        },
      });
    }
    req.user = { id: payload.user_id, source: 'jwt', payload };
    next();
  } catch (e) {
    return res.status(401).json({
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token verification failed',
        details: { reason: e.message },
      },
    });
  }
}

/**
 * Helper for tests: sign a token
 */
export function signToken(user_id, expiresIn = '7d') {
  const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-not-for-prod';
  return jwt.sign({ user_id }, JWT_SECRET, { expiresIn });
}
