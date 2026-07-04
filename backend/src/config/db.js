// MySQL2 connection pool + graceful init
import mysql from 'mysql2/promise';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const isConfigured = !!(process.env.DB_HOST && process.env.DB_USER && process.env.DB_NAME);

export const db = isConfigured ? mysql.createPool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  timezone: 'Z',
}) : null;

if (!isConfigured) {
  logger.warn('DB not configured (DB_HOST/DB_USER/DB_NAME missing) — running in NO-DB mode. /health will still return ok. Set env to enable DB.');
}

export async function pingDb() {
  if (!db) return { configured: false, ok: false, latency_ms: 0 };
  const t0 = Date.now();
  try {
    const [rows] = await db.query('SELECT 1 AS ok');
    return { configured: true, ok: rows[0].ok === 1, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { configured: true, ok: false, error: e.message, latency_ms: Date.now() - t0 };
  }
}

export async function closeDb() {
  if (db) await db.end();
}
