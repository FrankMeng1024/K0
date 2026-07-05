// K0 backend - Job 状态持久化到 DB
// Sprint 6 起 job 存 jobs 表（不再 in-memory）

import crypto from 'node:crypto';
import { db } from '../config/db.js';

/**
 * @typedef {Object} JobRecord
 * @property {string} id - UUID
 * @property {number} userId
 * @property {string} inputUrl
 * @property {string} inputType - 'xiaoyuzhou'|'apple'|'text'|'unknown'
 * @property {string|null} goal
 * @property {number|null} episodeId
 * @property {number|null} transcriptId
 * @property {number|null} packId
 * @property {string} status - 'queued'|'downloading'|'transcribing'|'generating'|'ready'|'failed'|'cancelled'
 * @property {number} progress
 * @property {string|null} stageMessage
 * @property {boolean} cacheHit
 * @property {string|null} errorCode
 * @property {string|null} errorMessage
 */

/**
 * 创建 Job 并写入 DB
 * @returns {Promise<string>} jobId (UUID)
 */
export async function createJob({ userId, inputUrl, inputType, goal = null, metadata = null }) {
  const jobId = crypto.randomUUID();
  await db.execute(
    `INSERT INTO jobs (id, user_id, input_url, input_type, goal, status, progress, stage_message, metadata, started_at)
     VALUES (?, ?, ?, ?, ?, 'queued', 0, '排队中', ?, NOW())`,
    [jobId, userId, inputUrl, inputType, goal, metadata ? JSON.stringify(metadata) : null]
  );
  return jobId;
}

/**
 * 更新 Job 状态
 */
export async function updateJob(jobId, updates) {
  const fields = [];
  const values = [];
  const allowed = ['status', 'progress', 'stage_message', 'episode_id', 'transcript_id', 'pack_id',
                   'cache_hit', 'error_code', 'error_message', 'completed_at'];
  const mapping = {
    stageMessage: 'stage_message',
    episodeId: 'episode_id',
    transcriptId: 'transcript_id',
    packId: 'pack_id',
    cacheHit: 'cache_hit',
    errorCode: 'error_code',
    errorMessage: 'error_message',
    completedAt: 'completed_at',
  };
  for (const [key, value] of Object.entries(updates)) {
    const dbField = mapping[key] || key;
    if (allowed.includes(dbField)) {
      fields.push(`${dbField} = ?`);
      values.push(value);
    }
  }
  if (!fields.length) return;
  values.push(jobId);
  await db.execute(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`, values);
}

/**
 * 拿 Job 状态
 */
export async function getJob(jobId) {
  const [rows] = await db.execute(
    `SELECT id, user_id, input_url, input_type, goal, episode_id, transcript_id, pack_id,
            status, progress, stage_message, cache_hit, error_code, error_message,
            created_at, updated_at, started_at, completed_at
     FROM jobs WHERE id = ? LIMIT 1`,
    [jobId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: r.id,
    userId: r.user_id,
    inputUrl: r.input_url,
    inputType: r.input_type,
    goal: r.goal,
    episodeId: r.episode_id,
    transcriptId: r.transcript_id,
    packId: r.pack_id,
    status: r.status,
    progress: r.progress,
    stageMessage: r.stage_message,
    cacheHit: !!r.cache_hit,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

/**
 * 标记 Job 失败
 */
export async function failJob(jobId, code, message) {
  await updateJob(jobId, {
    status: 'failed',
    errorCode: code,
    errorMessage: message,
    completedAt: new Date(),
  });
}

/**
 * 标记 Job 完成
 */
export async function completeJob(jobId, packId) {
  await updateJob(jobId, {
    status: 'ready',
    progress: 100,
    stageMessage: '完成',
    packId,
    completedAt: new Date(),
  });
}
