// Sprint 14 R3 — debug 图片上传路由（首页 3-tap popup 用）
// 参考 Cairn debug-snapshot 设计：raw body + LONGBLOB，无鉴权 + 速率限制
// 挂载点：app.use('/api/debug', debugUploadRouter) → 路由前缀 /api/debug/upload
import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { db } from '../config/db.js';
import { throwApiError, ErrorCode } from '../lib/errors.js';

const router = Router();

// 速率限制：每 IP 5 分钟 30 次上传
const uploadRateLimit = rateLimit({
  windowMs: 5 * 60_000,
  max: 30,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: ErrorCode?.RATE_LIMITED || 'RATE_LIMITED',
        message: '上传过于频繁。每 5 分钟最多 30 次。',
      },
    });
  },
});

// PNG magic: 89 50 4E 47   JPEG magic: FF D8
function detectFormat(buf) {
  if (!buf || buf.length < 4) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  return null;
}

function decodeMeta(b64) {
  if (!b64) return null;
  try {
    const raw = Buffer.from(String(b64), 'base64').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * POST /api/debug/upload?id=<upload_id>&batch=<batch_id>&meta=<base64-json>
 * Body: raw image/png 或 image/jpeg，最大 12MB
 * 返回: { id, batch_id, bytes, ok, view_url }
 */
router.post(
  '/upload',
  uploadRateLimit,
  express.raw({ type: ['image/png', 'image/jpeg'], limit: '12mb' }),
  async (req, res, next) => {
    try {
      const uploadId = String(req.query.id || '').trim() || crypto.randomUUID();
      const batchId = String(req.query.batch || '').trim() || crypto.randomUUID();
      const metaRaw = req.query.meta;
      const meta = decodeMeta(metaRaw);

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Body 必须是 image/png 或 image/jpeg 二进制' },
        });
      }
      if (req.body.length > 12 * 1024 * 1024) {
        return res.status(413).json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: '图片超过 12MB' },
        });
      }

      const fmt = detectFormat(req.body);
      if (!fmt) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '图片 magic bytes 校验失败（仅接受 PNG / JPEG）' },
        });
      }

      const appVersion = String((meta && meta.app_version) || '').slice(0, 16) || null;
      const userId = req.user?.id || null;
      const ip = req.ip || null;

      if (!db) {
        return res.status(503).json({
          error: { code: 'DB_UNAVAILABLE', message: 'DB 未配置，无法接收上传' },
        });
      }

      await db.query(
        `INSERT INTO debug_uploads
          (upload_id, batch_id, image_blob, image_bytes, image_format, meta, app_version, user_id, uploaded_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uploadId,
          batchId,
          req.body,
          req.body.length,
          fmt,
          meta ? JSON.stringify(meta) : null,
          appVersion,
          userId,
          ip,
        ]
      );

      const viewUrl = `/api/debug/upload/${uploadId}`;
      res.json({
        ok: true,
        id: uploadId,
        batch_id: batchId,
        bytes: req.body.length,
        format: fmt,
        view_url: viewUrl,
      });
    } catch (err) {
      // 唯一键冲突（同一 upload_id 重复提交）
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({
          error: { code: 'DUPLICATE', message: 'upload_id 已存在' },
        });
      }
      next(err);
    }
  }
);

/**
 * GET /api/debug/upload/latest
 * 返回最近 20 条上传元数据（不含 blob）
 */
router.get('/upload/latest', async (req, res, next) => {
  try {
    if (!db) {
      return res.json({ items: [] });
    }
    const [rows] = await db.query(
      `SELECT id, upload_id, batch_id, image_bytes, image_format, meta, app_version, uploaded_at
         FROM debug_uploads
        ORDER BY uploaded_at DESC
        LIMIT 20`
    );
    const items = rows.map((r) => ({
      id: r.id,
      upload_id: r.upload_id,
      batch_id: r.batch_id,
      bytes: r.image_bytes,
      format: r.image_format,
      meta: r.meta,
      app_version: r.app_version,
      uploaded_at: r.uploaded_at,
      view_url: `/api/debug/upload/${r.upload_id}`,
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/debug/upload/batch/:batch_id
 * 返回同一批的所有 upload 元数据（不含 blob）
 */
router.get('/upload/batch/:batch_id', async (req, res, next) => {
  try {
    if (!db) return res.json({ items: [] });
    const batchId = String(req.params.batch_id || '').trim();
    if (!batchId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'batch_id 必填' } });
    }
    const [rows] = await db.query(
      `SELECT id, upload_id, batch_id, image_bytes, image_format, meta, app_version, uploaded_at
         FROM debug_uploads
        WHERE batch_id = ?
        ORDER BY uploaded_at ASC`,
      [batchId]
    );
    const items = rows.map((r) => ({
      id: r.id,
      upload_id: r.upload_id,
      batch_id: r.batch_id,
      bytes: r.image_bytes,
      format: r.image_format,
      meta: r.meta,
      app_version: r.app_version,
      uploaded_at: r.uploaded_at,
      view_url: `/api/debug/upload/${r.upload_id}`,
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/debug/upload/:upload_id
 * 直接返回图片二进制（Content-Type: image/png|jpeg）
 * 放在最后避免路由冲突（/latest, /batch/:id 优先匹配）
 */
router.get('/upload/:upload_id', async (req, res, next) => {
  try {
    if (!db) {
      return res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'DB 未配置' } });
    }
    const uploadId = String(req.params.upload_id || '').trim();
    if (!uploadId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'upload_id 必填' } });
    }
    const [rows] = await db.query(
      `SELECT image_blob, image_format, image_bytes
         FROM debug_uploads
        WHERE upload_id = ?
        LIMIT 1`,
      [uploadId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'upload not found' } });
    }
    const row = rows[0];
    const fmt = row.image_format || 'jpeg';
    res.setHeader('Content-Type', `image/${fmt}`);
    res.setHeader('Content-Length', String(row.image_bytes));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(row.image_blob);
  } catch (err) {
    next(err);
  }
});

export default router;
