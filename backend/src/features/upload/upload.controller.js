// Sprint 15: 产品级图片上传路由
// 架构直接照抄 Cairn debug-snapshot：raw body + LONGBLOB + 无 multer 依赖
// 与 /api/debug/upload 独立——本路由未来会加：user_id 强鉴权、图片压缩、缩略图变体
// 挂载点：app.use('/api/uploads', uploadsRouter) → 路由前缀 /api/uploads
import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { db } from '../../shared/db.js';
import { ErrorCode } from '../../shared/errors.js';

const router = Router();

// 每 IP 5 分钟 60 次（比 debug 通道宽松，产品用户会连拍多张）
const uploadRateLimit = rateLimit({
  windowMs: 5 * 60_000,
  max: 60,
  keyGenerator: (req) => req.ip || 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: ErrorCode?.RATE_LIMITED || 'RATE_LIMITED',
        message: '上传过于频繁。每 5 分钟最多 60 次。',
      },
    });
  },
});

// PNG magic: 89 50 4E 47   JPEG magic: FF D8   HEIC/HEIF: ftypheic/ftypheix/ftypmif1
function detectFormat(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  // HEIF/HEIC — box 4-7 = "ftyp"
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const brand = buf.slice(8, 12).toString('ascii');
    if (brand === 'heic' || brand === 'heix' || brand === 'mif1' || brand === 'msf1') return 'heic';
  }
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
 * POST /api/uploads?id=<upload_id>&batch=<batch_id>&meta=<base64-json>
 * Body: raw image/png | image/jpeg | image/heic，最大 15MB
 * 返回: { ok, id, batch_id, bytes, format, view_url }
 */
router.post(
  '/',
  uploadRateLimit,
  express.raw({ type: ['image/png', 'image/jpeg', 'image/heic', 'image/heif'], limit: '15mb' }),
  async (req, res, next) => {
    try {
      const uploadId = String(req.query.id || '').trim() || crypto.randomUUID();
      const batchId = String(req.query.batch || '').trim() || crypto.randomUUID();
      const meta = decodeMeta(req.query.meta);

      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: 'Body 必须是 image/png|jpeg|heic 二进制' },
        });
      }
      if (req.body.length > 15 * 1024 * 1024) {
        return res.status(413).json({
          error: { code: 'PAYLOAD_TOO_LARGE', message: '图片超过 15MB' },
        });
      }

      const fmt = detectFormat(req.body);
      if (!fmt) {
        return res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: '图片 magic bytes 校验失败（仅接受 PNG/JPEG/HEIC）' },
        });
      }

      const appVersion = String((meta && meta.app_version) || '').slice(0, 16) || null;
      const width = meta && Number.isFinite(meta.width) ? Math.round(meta.width) : null;
      const height = meta && Number.isFinite(meta.height) ? Math.round(meta.height) : null;
      const userId = req.user?.id || null;
      const ip = req.ip || null;

      if (!db) {
        return res.status(503).json({
          error: { code: 'DB_UNAVAILABLE', message: 'DB 未配置，无法接收上传' },
        });
      }

      await db.query(
        `INSERT INTO user_uploads
          (upload_id, batch_id, image_blob, image_bytes, image_format, width, height, meta, app_version, user_id, uploaded_ip)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uploadId,
          batchId,
          req.body,
          req.body.length,
          fmt,
          width,
          height,
          meta ? JSON.stringify(meta) : null,
          appVersion,
          userId,
          ip,
        ]
      );

      res.json({
        ok: true,
        id: uploadId,
        batch_id: batchId,
        bytes: req.body.length,
        format: fmt,
        width,
        height,
        view_url: `/api/uploads/${uploadId}`,
      });
    } catch (err) {
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
 * GET /api/uploads/mine
 * 返回当前 user_id 最近 50 条（不含 blob）
 */
router.get('/mine', async (req, res, next) => {
  try {
    if (!db) return res.json({ items: [] });
    const userId = req.user?.id || null;
    const where = userId ? 'WHERE user_id = ? AND deleted_at IS NULL' : 'WHERE deleted_at IS NULL';
    const params = userId ? [userId] : [];
    const [rows] = await db.query(
      `SELECT id, upload_id, batch_id, image_bytes, image_format, width, height, meta, app_version, uploaded_at
         FROM user_uploads
        ${where}
        ORDER BY uploaded_at DESC
        LIMIT 50`,
      params
    );
    const items = rows.map((r) => ({
      id: r.id,
      upload_id: r.upload_id,
      batch_id: r.batch_id,
      bytes: r.image_bytes,
      format: r.image_format,
      width: r.width,
      height: r.height,
      meta: r.meta,
      app_version: r.app_version,
      uploaded_at: r.uploaded_at,
      view_url: `/api/uploads/${r.upload_id}`,
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/uploads/batch/:batch_id
 */
router.get('/batch/:batch_id', async (req, res, next) => {
  try {
    if (!db) return res.json({ items: [] });
    const batchId = String(req.params.batch_id || '').trim();
    if (!batchId) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'batch_id 必填' } });
    }
    const [rows] = await db.query(
      `SELECT id, upload_id, batch_id, image_bytes, image_format, width, height, meta, app_version, uploaded_at
         FROM user_uploads
        WHERE batch_id = ? AND deleted_at IS NULL
        ORDER BY uploaded_at ASC`,
      [batchId]
    );
    const items = rows.map((r) => ({
      id: r.id,
      upload_id: r.upload_id,
      batch_id: r.batch_id,
      bytes: r.image_bytes,
      format: r.image_format,
      width: r.width,
      height: r.height,
      meta: r.meta,
      app_version: r.app_version,
      uploaded_at: r.uploaded_at,
      view_url: `/api/uploads/${r.upload_id}`,
    }));
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/uploads/:upload_id
 * 图片二进制。放在最后避免与 /mine /batch/:id 冲突。
 */
router.get('/:upload_id', async (req, res, next) => {
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
         FROM user_uploads
        WHERE upload_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [uploadId]
    );
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'upload not found' } });
    }
    const row = rows[0];
    const fmt = row.image_format || 'jpeg';
    res.setHeader('Content-Type', `image/${fmt === 'heic' ? 'heic' : fmt}`);
    res.setHeader('Content-Length', String(row.image_bytes));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(row.image_blob);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/uploads/:upload_id
 * 软删除（仅本人）
 */
router.delete('/:upload_id', async (req, res, next) => {
  try {
    if (!db) return res.status(503).json({ error: { code: 'DB_UNAVAILABLE', message: 'DB 未配置' } });
    const uploadId = String(req.params.upload_id || '').trim();
    const userId = req.user?.id || null;
    const [result] = await db.query(
      `UPDATE user_uploads SET deleted_at = CURRENT_TIMESTAMP
        WHERE upload_id = ? AND (user_id = ? OR user_id IS NULL) AND deleted_at IS NULL`,
      [uploadId, userId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'upload not found or not owned' } });
    }
    res.json({ ok: true, id: uploadId });
  } catch (err) {
    next(err);
  }
});

export default router;
