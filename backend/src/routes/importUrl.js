// K0 backend - Import URL end-to-end pipeline (Sprint 6 STORY-00306)
// POST /api/episodes/import-url
// Body: { url: "https://...", goal: "quick_understand", anonymousId: "uuid" }
//
// Pipeline (all async in background, return jobId immediately):
//   1. Detect URL type (xiaoyuzhou/apple)
//   2. Extract audio metadata (upsert podcasts + episodes)
//   3. BCUT transcribe (upsert transcripts)
//   4. GLM generate learning pack (upsert learning_packs)
//   5. Link user_pack_access
// All steps update job status in DB.

import { Router } from 'express';
import { extractXiaoyuzhouAudio, isXiaoyuzhouUrl } from '../services/audioExtractor/xiaoyuzhou.js';
import { extractAppleAudio, isAppleUrl } from '../services/audioExtractor/apple.js';
import { transcribeAudio } from '../services/asr/bcut.js';
import { generateLearningPack } from '../services/packGenerator.js';
import { detectLanguage } from '../services/langDetect.js';
import { getOrCreateUserByAnonymousId } from '../services/userStore.js';
import { createJob, updateJob, getJob, failJob, completeJob } from '../services/jobStore.js';
import {
  upsertPodcast, upsertEpisode, upsertTranscript, getTranscriptByEpisodeAndProvider,
  findExistingPack, insertPack, getPackById, upsertUserPackAccess,
} from '../services/packStore.js';
import { throwApiError, ErrorCode } from '../lib/errors.js';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });
const router = Router();

const VALID_GOALS = ['quick_understand', 'deep_learn', 'find_actions', 'critical_thinking', 'for_work'];
const BCUT_PROVIDER = 'bcut';
const BCUT_VERSION = 'model-id-8';

function detectUrlType(url) {
  if (isXiaoyuzhouUrl(url)) return 'xiaoyuzhou';
  if (isAppleUrl(url)) return 'apple';
  return 'unknown';
}

/**
 * 端到端 pipeline (异步在后台跑)
 */
async function runPipeline(jobId, { url, urlType, goal, userId }) {
  try {
    // Step 1: Audio extraction
    await updateJob(jobId, { status: 'downloading', progress: 5, stageMessage: '🎧 拿到播客了' });

    let meta;
    if (urlType === 'xiaoyuzhou') {
      meta = await extractXiaoyuzhouAudio(url);
    } else if (urlType === 'apple') {
      meta = await extractAppleAudio(url);
    } else {
      throw Object.assign(new Error('URL_TYPE_UNSUPPORTED'), { code: 'INVALID_URL' });
    }

    // Upsert podcast + episode
    // Sprint 8: podcast name 优先用真正的节目名，不再 fallback 到 episode title
    // 若 podcast 依然为空，用平台名占位（比正确 title 更容易 debug）
    const podcastName = meta.podcast || `未知播客 (${meta.platform})`;
    // Sprint 8: platform_podcast_id 应用平台数值 id（不是名字）：Apple → podcastId; Xiaoyuzhou → sourceId 前缀 or 名字
    const platformPodcastId = meta.podcastId || meta.podcast || meta.sourceId;
    const podcastId = await upsertPodcast({
      platform: meta.platform,
      platformPodcastId,
      name: podcastName,
      coverImageUrl: meta.coverImage,
      rssUrl: meta.feedUrl || null,
    });
    const episodeId = await upsertEpisode({
      podcastId,
      platform: meta.platform,
      platformEpisodeId: meta.sourceId,
      sourceUrl: url,
      title: meta.title,
      coverImageUrl: meta.coverImage,
      audioUrl: meta.audioUrl,
      audioFormat: meta.audioFormat,
      audioType: meta.audioType || null,
      transcriptUrlFromRss: meta.transcriptUrl || null,
    });
    await updateJob(jobId, { episodeId, progress: 15, stageMessage: '🎧 找到了这集播客' });

    // Step 2: Check transcript cache
    let transcript = await getTranscriptByEpisodeAndProvider(episodeId, BCUT_PROVIDER);
    let transcriptId;
    if (transcript) {
      transcriptId = transcript.id;
      await updateJob(jobId, { transcriptId, progress: 60, stageMessage: '🎙 内容已备好' });
      logger.info({ jobId, transcriptId, cache: 'hit' }, 'Transcript cache hit');
    } else {
      // 转录
      await updateJob(jobId, { status: 'transcribing', progress: 20, stageMessage: '🎙 AI 正在为你精读这集…' });
      const asrResult = await transcribeAudio(meta.audioUrl, {
        referer: url,
        context: { userId, jobId, episodeId },
        // Sprint 8: BCUT 进度回调 — 每 5s 更新 job progress，UX 不再卡 20%
        //   phase: 'downloading' | 'downloaded' | 'uploading' | undefined (poll phase)
        //   pollCount, elapsedS, audioSizeMB, downloadedMB (varies by phase)
        onProgress: async ({ phase, pollCount, elapsedS, audioSizeMB, downloadedMB }) => {
          const mins = Math.floor((elapsedS || 0) / 60);
          const secs = (elapsedS || 0) % 60;
          const elapsedTxt = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          let progressPct, stageMessage;
          if (phase === 'downloading') {
            progressPct = 22;
            stageMessage = downloadedMB
              ? `🎙 正在下载音频… ${downloadedMB}MB (${elapsedTxt})`
              : '🎙 正在下载音频…';
          } else if (phase === 'downloaded') {
            progressPct = 30;
            stageMessage = `🎙 已下载 ${audioSizeMB}MB，准备转录…`;
          } else if (phase === 'uploading') {
            progressPct = 35;
            stageMessage = '🎙 正在上传给 ASR…';
          } else {
            // poll phase — 40% 起，最多推到 55%
            progressPct = Math.min(55, 40 + Math.floor((elapsedS || 0) / 3));
            stageMessage = `🎙 AI 正在为你精读这集… (已 ${elapsedTxt})`;
          }
          try {
            await updateJob(jobId, { progress: progressPct, stageMessage });
          } catch {}
        },
      });
      transcriptId = await upsertTranscript({
        episodeId,
        provider: BCUT_PROVIDER,
        providerVersion: BCUT_VERSION,
        segments: asrResult.segments,
        durationSeconds: Math.floor(asrResult.segments[asrResult.segments.length - 1]?.end || 0),
        language: null,  // 稍后 detect
        transcriptMs: asrResult.totalMs,
        metadata: {
          downloadMs: asrResult.downloadMs,
          uploadMs: asrResult.uploadMs,
          asrMs: asrResult.asrMs,
          audioSize: asrResult.audioSize,
        },
      });
      transcript = {
        id: transcriptId,
        segments: asrResult.segments,
      };
      await updateJob(jobId, { transcriptId, progress: 60, stageMessage: '🎙 内容已备好' });
      logger.info({ jobId, transcriptId, segCount: asrResult.segments.length }, 'Transcript created');
    }

    // Step 3: Detect language
    const fullText = transcript.segments.map(s => s.text).join(' ');
    const language = detectLanguage(fullText);
    logger.info({ jobId, language }, 'Language detected');

    // Step 4: Check pack cache
    const glmModel = process.env.GLM_MODEL || 'glm-5.2';
    const promptVersion = 'v2';
    const existingPack = await findExistingPack(transcriptId, goal, glmModel, promptVersion);
    let packId;
    if (existingPack) {
      packId = existingPack.id;
      await updateJob(jobId, { cacheHit: true, progress: 95, stageMessage: '✨ 学习包已就绪' });
      logger.info({ jobId, packId, cache: 'hit' }, 'Pack cache hit');
    } else {
      await updateJob(jobId, { status: 'generating', progress: 70, stageMessage: '✨ AI 在提炼学习包' });
      const packResult = await generateLearningPack({
        segments: transcript.segments,
        language: language === 'unknown' ? 'zh' : language,
        goal,
        context: { userId, jobId, episodeId, transcriptId },
      });
      packId = await insertPack({
        transcriptId,
        goal,
        glmModel: packResult.glmModel,
        promptVersion: packResult.promptVersion,
        generationStrategy: packResult.generationStrategy,
        language,
        packJson: packResult.pack,
        generationMs: packResult.latencyMs,
        inputTokens: packResult.inputTokens,
        outputTokens: packResult.outputTokens,
        metadata: { retries: packResult.retries },
      });
      await updateJob(jobId, { packId, progress: 95, stageMessage: '📚 学习包已准备好' });
      logger.info({ jobId, packId, retries: packResult.retries }, 'Pack generated');
    }

    // Step 5: Link user
    await upsertUserPackAccess(userId, packId);

    // Complete
    await completeJob(jobId, packId);
    logger.info({ jobId, packId }, 'Job complete');
  } catch (e) {
    logger.error({ jobId, error: e.message, code: e.code }, 'Pipeline failed');
    await failJob(jobId, e.code || 'PIPELINE_ERROR', e.message || 'unknown error');
  }
}

// ============================================================
// POST /api/episodes/import-url
// ============================================================
router.post('/import-url', async (req, res, next) => {
  try {
    const { url, goal, anonymousId } = req.body;

    if (!url || typeof url !== 'string') {
      return throwApiError(ErrorCode.VALIDATION_ERROR, 'url is required', null, 400);
    }
    if (!goal || !VALID_GOALS.includes(goal)) {
      return throwApiError(ErrorCode.VALIDATION_ERROR, `goal must be one of: ${VALID_GOALS.join(', ')}`, null, 400);
    }
    if (!anonymousId) {
      return throwApiError(ErrorCode.VALIDATION_ERROR, 'anonymousId is required', null, 400);
    }

    const urlType = detectUrlType(url);
    if (urlType === 'unknown') {
      return throwApiError(ErrorCode.SOURCE_NOT_SUPPORTED, '目前只支持小宇宙和 Apple Podcasts 链接', null, 400);
    }

    const user = await getOrCreateUserByAnonymousId(anonymousId);
    const jobId = await createJob({
      userId: user.id,
      inputUrl: url,
      inputType: urlType,
      goal,
    });

    // 异步启动 pipeline，立即返回 jobId
    setImmediate(() => runPipeline(jobId, { url, urlType, goal, userId: user.id }));

    res.json({ jobId, status: 'queued', stageMessage: '排队中' });
  } catch (e) {
    next(e);
  }
});

// ============================================================
// GET /api/episodes/jobs/:jobId - job status polling
// (mounted at /api/episodes/... so path is /api/episodes/jobs/:jobId)
// Frontend can also use existing /api/jobs/:id from jobs.js router
// ============================================================

export default router;
