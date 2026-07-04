// K0 Backend Entry — Express 5
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { db, closeDb } from './config/db.js';
import { attachUser } from './middleware/auth.js';
import healthRouter from './routes/health.js';
import whoamiRouter from './routes/whoami.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();

// Trust proxy count from env (0 for local, 1 for nginx-fronted)
app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '0', 10));

// Security middleware
app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:8081,http://localhost:8090').split(','),
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

// Rate limit — 60 requests / minute per IP
app.use(rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
}));

// Attach user_id (default 1 if AUTH_ENABLED=false, else verify JWT)
app.use(attachUser);

// Routes
app.use('/health', healthRouter);
app.use('/api', whoamiRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'not_found', path: req.path });
});

// Error handler (must have 4 args)
app.use((err, req, res, next) => {
  logger.error({ err, path: req.path }, 'unhandled_error');
  res.status(err.status || 500).json({ error: err.code || 'internal_error', message: err.message });
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'K0 backend started');
});

// Graceful shutdown
async function shutdown(sig) {
  logger.info({ sig }, 'shutdown_requested');
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  // hard exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
