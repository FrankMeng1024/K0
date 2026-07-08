// K0 Backend Entry — Express 5
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { db, closeDb } from './config/db.js';
import { pathToFileURL } from 'url';
import { resolve } from 'path';
import { attachUser } from './middleware/auth.js';
import { apiErrorHandler } from './lib/errors.js';
import healthRouter from './routes/health.js';
import whoamiRouter from './routes/whoami.js';
import episodesRouter from './routes/episodes.js';
import snapshotsRouter from './routes/snapshots.js';
import generateRouter from './routes/generate.js';
import packsRouter, { stepsRouter } from './routes/packs.js';
import jobsRouter from './routes/jobs.js';
import importUrlRouter from './routes/importUrl.js';
import libraryRouter from './routes/library.js';
import reviewRouter from './routes/review.js';
import pushRouter from './routes/push.js';
import debugUploadRouter from './routes/debugUpload.js';
import uploadsRouter from './routes/uploads.js';
import authRouter from './routes/auth.js';

const PORT = parseInt(process.env.PORT || '3002', 10);
const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const app = express();

// Sprint 16 R16: 关闭 Express 自动 etag —
// Frank v42 装机后日志锁死：Library 显示 5 卡（应显示 3），进 pack 卡片不存在。
// Root cause: iOS CFNetwork 缓存 GET /api/library/{stats,cards,packs} 的 etag，
// backend R15 SQL 已扣掉 archived 返回正确新数字，但 Express etag 中间件对
// response body 算 hash，hash 与老响应一致 → 304 Not Modified → 前端用旧缓存 = 老 7。
// 全局禁 etag 后每个 GET 都是 200 完整 body，客户端无法用 if-none-match 命中缓存。
app.set('etag', false);

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
// Sprint 16 R2: auth 路由必须在 attachUser 之前（register/login 本身就是拿 anonymousId 的入口，不能被 JWT gate）
app.use('/api/auth', authRouter);
app.use(attachUser);

// Routes
app.use('/health', healthRouter);
app.use('/api', whoamiRouter);
app.use('/api/episodes', episodesRouter);
app.use('/api/episodes', snapshotsRouter);
app.use('/api/episodes', generateRouter);
// Sprint 6: 端到端 URL → 学习包 pipeline
app.use('/api/episodes', importUrlRouter);   // POST /api/episodes/import-url
app.use('/api/packs', packsRouter);
app.use('/api/steps', stepsRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/library', libraryRouter);
app.use('/api/review', reviewRouter);
app.use('/api/push', pushRouter);
app.use('/api/debug', debugUploadRouter);
app.use('/api/uploads', uploadsRouter);

// 404
app.use((req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route: ${req.method} ${req.path}` } });
});

// Structured API error handler (must be last — 4 args)
app.use(apiErrorHandler);

// Only start listening when this file is run directly (not imported as a module in tests)
const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
const server = isMain
  ? app.listen(PORT, () => {
      logger.info({ port: PORT, env: process.env.NODE_ENV || 'development' }, 'K0 backend started');
    })
  : null;

// Graceful shutdown
async function shutdown(sig) {
  logger.info({ sig }, 'shutdown_requested');
  if (server) {
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  } else {
    await closeDb();
    process.exit(0);
  }
  // hard exit after 10s
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

export default app;
