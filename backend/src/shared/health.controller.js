import { Router } from 'express';
import { pingDb } from './db.js';

const router = Router();

router.get('/', async (req, res) => {
  const t0 = Date.now();
  const dbStatus = await pingDb();
  res.json({
    status: dbStatus.configured ? (dbStatus.ok ? 'ok' : 'degraded') : 'ok',
    ts: Date.now(),
    uptime_s: Math.round(process.uptime()),
    node: process.version,
    db: dbStatus,
    response_ms: Date.now() - t0,
  });
});

export default router;
