// K0 backend - Job 状态持久化 (Schema v3)
// Refactor Phase 1.5: 用 job_type + input_extra/output_extra JSON
//
// jobs 表结构 (v3):
//   id, user_id, job_type,
//   episode_id, transcript_id, pack_id, target_lang,  -- 关键关联字段
//   status, progress, stage_message, cache_hit, error_code, error_message,
//   input_extra JSON, output_extra JSON,
//   created_at, updated_at, started_at, completed_at

import crypto from 'node:crypto';
import { db } from '../config/db.js';

/**
 * 创建 Job 并写入 DB
 * @param {object} params
 * @param {number} params.userId
 * @param {string} [params.inputUrl] - legacy 兼容 (import job 用)
 * @param {string} [params.inputType] - legacy 兼容 ('xiaoyuzhou'|'apple' etc)
 * @param {string} [params.goal]
 * @param {string} [params.jobType] - v3: 'import'|'pack_generate'|'export_obsidian'|'translate'|'merge'|'chat'
 * @param {number} [params.episodeId]
 * @param {number} [params.transcriptId]
 * @param {number} [params.packId]
 * @param {string} [params.targetLang]
 * @param {object} [params.metadata] - legacy 兼容 (放入 input_extra)
 * @param {object} [params.inputExtra] - v3: 各 job_type 参数
 * @returns {Promise<string>} jobId
 */
export async function createJob({
  userId, inputUrl, inputType, goal,
  jobType, episodeId, transcriptId, packId, targetLang,
  metadata, inputExtra,
}) {
  const jobId = crypto.randomUUID();

  // legacy 兼容: inputUrl + inputType → jobType='import' + input_extra
  const finalJobType = jobType || (inputType === 'pack-generate' ? 'pack_generate' : 'import');
  const finalInputExtra = inputExtra || {
    ...(inputUrl ? { url: inputUrl } : {}),
    ...(inputType ? { input_type: inputType } : {}),
    ...(goal ? { goal } : {}),
    ...(metadata || {}),
  };

  await db.execute(
    `INSERT INTO jobs (id, user_id, job_type, episode_id, transcript_id, pack_id, target_lang,
                       status, progress, stage_message, input_extra, started_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, '排队中', ?, NOW())`,
    [
      jobId, userId, finalJobType,
      episodeId || null, transcriptId || null, packId || null, targetLang || null,
      Object.keys(finalInputExtra).length ? JSON.stringify(finalInputExtra) : null,
    ]
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
                   'target_lang', 'cache_hit', 'error_code', 'error_message', 'completed_at',
                   'output_extra'];
  const mapping = {
    stageMessage: 'stage_message',
    episodeId: 'episode_id',
    transcriptId: 'transcript_id',
    packId: 'pack_id',
    targetLang: 'target_lang',
    cacheHit: 'cache_hit',
    errorCode: 'error_code',
    errorMessage: 'error_message',
    completedAt: 'completed_at',
    outputExtra: 'output_extra',
  };
  for (const [key, value] of Object.entries(updates)) {
    const dbField = mapping[key] || key;
    if (allowed.includes(dbField)) {
      fields.push(`${dbField} = ?`);
      // JSON 字段自动 stringify
      if (dbField === 'output_extra' && value && typeof value === 'object') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
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
    `SELECT id, user_id, job_type, episode_id, transcript_id, pack_id, target_lang,
            status, progress, stage_message, cache_hit, error_code, error_message,
            input_extra, output_extra,
            created_at, updated_at, started_at, completed_at
     FROM jobs WHERE id = ? LIMIT 1`,
    [jobId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  const inputExtra = r.input_extra
    ? (typeof r.input_extra === 'string' ? JSON.parse(r.input_extra) : r.input_extra)
    : null;
  return {
    id: r.id,
    userId: r.user_id,
    jobType: r.job_type,
    // legacy 兼容 (前端可能读这些)
    inputUrl: inputExtra?.url || null,
    inputType: inputExtra?.input_type || null,
    goal: inputExtra?.goal || null,   // goal 现在藏在 input_extra 里
    episodeId: r.episode_id,
    transcriptId: r.transcript_id,
    packId: r.pack_id,
    targetLang: r.target_lang,
    status: r.status,
    progress: r.progress,
    stageMessage: r.stage_message,
    cacheHit: !!r.cache_hit,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    inputExtra,
    outputExtra: r.output_extra
      ? (typeof r.output_extra === 'string' ? JSON.parse(r.output_extra) : r.output_extra)
      : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

export async function failJob(jobId, code, message) {
  await updateJob(jobId, {
    status: 'failed',
    errorCode: code,
    errorMessage: message,
    completedAt: new Date(),
  });
}

export async function completeJob(jobId, packId) {
  await updateJob(jobId, {
    status: 'ready',
    progress: 100,
    stageMessage: '完成',
    packId,
    completedAt: new Date(),
  });
}
