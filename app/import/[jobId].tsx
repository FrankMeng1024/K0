// Import Progress 屏 - Sprint 7 STORY-00401 + Sprint 9 STORY-00901 修复
// URL → 拿到 jobId 后跳到本屏 → 轮询 → 完成后跳 Episode
//
// Sprint 9 修复的 3 个 Blocker：
//   1. AppState 闭包过期 → useRef 保存最新 state
//   2. 轮询并发竞态 → pollingRef 互斥锁 + timer 单例
//   3. 前台恢复不刷新 → 强制清 timer 立即 poll
//
// Sprint 9 STORY-00902：jobId 持久化到 AsyncStorage，冷启动能恢复
//
// UX 保证：
//   - 三阶段动画（下载/转录/生成）
//   - 后台切换后立即恢复轮询（追平服务器）
//   - 网络错误优雅提示
//   - "你可以最小化 App，好了会提醒你" 文案

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, AppState, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, ApiError } from '@/lib/api';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { WovenDivider } from '@/components/WovenDivider';

// 后端 job status → 前端阶段
type JobStatus = 'queued' | 'downloading' | 'transcribing' | 'generating' | 'ready' | 'failed' | 'cancelled';

interface JobState {
  jobId: string;
  status: JobStatus;
  progress: number;
  stageMessage: string | null;
  packId: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

// STORY-00902: AsyncStorage key for in-flight job recovery
const JOB_STORAGE_KEY = 'k0.pendingJob';

// Sprint 8: 错误码 → 友好中文文案
const ERROR_MESSAGES: Record<string, string> = {
  SOURCE_NOT_SUPPORTED: '这个链接的音频源暂时无法获取（可能是仅在 Apple 独播的节目）。试试小宇宙或其他 Apple Podcasts 链接。',
  INVALID_URL: '这个链接看起来不太对。请复制小宇宙或 Apple Podcasts 的完整链接。',
  SOURCE_UNREACHABLE: '网络暂时不稳定，稍后再试。',
  AUDIO_DOWNLOAD_FAILED: '音频下载失败，可能是版权保护或链接失效。',
  AUDIO_DOWNLOAD_TIMEOUT: '音频下载超时（15 分钟）— 音频可能过大或网络较慢，稍后再试。',
  BCUT_HTTP_ERROR: '转录服务暂时繁忙，稍后再试。',
  BCUT_HTTP_412: '转录服务被限流，请稍等 1 分钟再试。',
  BCUT_TASK_FAILED: '转录任务失败，音频可能有质量问题。',
  BCUT_TIMEOUT: '转录超时（30 分钟）— 音频较长，请稍后再试。',
  GLM_MALFORMED_JSON: 'AI 学习包生成失败，稍后再试或换一个链接。',
  GLM_TIMEOUT: 'AI 响应超时，稍后再试。',
  GLM_API_ERROR: 'AI 服务暂时不可用，稍后再试。',
  PIPELINE_ERROR: '处理出了问题，稍后再试。',
};

function friendlyError(code: string | null, fallback: string): string {
  if (!code) return fallback;
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (code.startsWith('BCUT_HTTP_')) return ERROR_MESSAGES.BCUT_HTTP_ERROR;
  return fallback;
}

const STAGE_LABELS: Record<string, string> = {
  queued: '排队中',
  downloading: '找到播客了',
  transcribing: 'AI 正在为你精读这集',
  generating: 'AI 在提炼学习包',
  ready: '完成',
  failed: '出了点问题',
};

const STAGE_HINTS: Record<string, string> = {
  queued: '马上开始',
  downloading: '正在拿到播客音频',
  transcribing: '这一步最花时间，大约 30 秒到 2 分钟',
  generating: '你可以最小化 App，好了会提醒你',
  ready: '',
  failed: '',
};

export default function ImportProgress() {
  const { jobId, url } = useLocalSearchParams<{ jobId: string; url?: string }>();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<JobState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sprint 9 STORY-00901 修复：
  // - stateRef 让 AppState listener 读到最新值（而不是 mount 时的闭包）
  // - pollingRef 互斥锁：同一时刻只有一个 fetch 在飞
  // - pollTimerRef timer 单例：切换时先清再启
  const stateRef = useRef<JobState | null>(null);
  const pollingRef = useRef(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const anim = useRef(new Animated.Value(0)).current;

  // 阶段动画（"呼吸"效果）
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 1500, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 1500, useNativeDriver: false }),
      ])
    ).start();
  }, [anim]);

  // 同步 state → stateRef，让 poll/AppState 拿到最新值
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Sprint 9 修复：轮询逻辑加互斥锁 + timer 单例
  const scheduleNextPoll = (delayMs: number) => {
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    pollTimerRef.current = setTimeout(() => {
      pollTimerRef.current = null;
      poll();
    }, delayMs);
  };

  const poll = async () => {
    if (!jobId || !mountedRef.current) return;
    // 互斥锁：同一时刻只有一个请求在飞
    if (pollingRef.current) return;
    pollingRef.current = true;

    try {
      const s = await apiFetch<JobState>(`/api/jobs/${jobId}`);
      if (!mountedRef.current) return;
      setState(s);
      setError(null);

      if (s.status === 'ready' && s.packId) {
        // STORY-00902: 完成后清理 pending job
        AsyncStorage.removeItem(JOB_STORAGE_KEY).catch(() => {});
        router.replace({
          pathname: '/episode/[id]',
          params: { id: String(s.packId), goal: 'quick_understand', jobId: s.jobId },
        });
        return;
      }
      if (s.status === 'failed' || s.status === 'cancelled') {
        AsyncStorage.removeItem(JOB_STORAGE_KEY).catch(() => {});
        setError(friendlyError(s.errorCode, s.errorMessage || '任务失败'));
        return;
      }
      // 继续轮询：queued/downloading/transcribing/generating
      // 追平 spike 输出效率：3s 间隔（原 4s），保证 UI 快速追上服务器
      scheduleNextPoll(3000);
    } catch (e: any) {
      if (!mountedRef.current) return;
      // 网络错误：指数退避
      setError(e?.message || '网络有点慢，重试中');
      scheduleNextPoll(6000);
    } finally {
      pollingRef.current = false;
    }
  };

  // 强制刷新：从后台回来 / 首次挂载
  const forceRefresh = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    // 释放锁，确保能立即发出
    pollingRef.current = false;
    poll();
  };

  // STORY-00902: 记录当前 jobId 到 AsyncStorage
  useEffect(() => {
    if (jobId && url) {
      AsyncStorage.setItem(JOB_STORAGE_KEY, JSON.stringify({
        jobId,
        url,
        savedAt: Date.now(),
      })).catch(() => {});
    }
  }, [jobId, url]);

  // 首次挂载 + 后台恢复
  useEffect(() => {
    mountedRef.current = true;
    forceRefresh(); // 立即拉一次

    const subscription = AppState.addEventListener('change', (nextState) => {
      // 用 stateRef 读最新 state（避免闭包过期）
      const cur = stateRef.current;
      const isTerminal = cur?.status === 'ready' || cur?.status === 'failed' || cur?.status === 'cancelled';
      if (nextState === 'active' && !isTerminal) {
        // 从后台回来 → 立即强制刷新（追平服务器）
        forceRefresh();
      }
    });

    return () => {
      mountedRef.current = false;
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const status = state?.status || 'queued';
  const progress = state?.progress || 0;
  const rawStageMsg = state?.stageMessage || '';
  const dynamicStage = rawStageMsg.replace(/^[🎧🎙✨📚]\s*/, '').trim();
  const stageMsg = dynamicStage || STAGE_LABELS[status] || '处理中';
  const hint = STAGE_HINTS[status] || '';

  const isFailed = status === 'failed' || !!error;

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          style={styles.backBtn}
          accessibilityLabel="返回"
        >
          <Text style={styles.backText}>‹ 首页</Text>
        </Pressable>
      </View>

      <View style={styles.main}>
        <Animated.View
          style={[
            styles.iconWrap,
            {
              transform: [
                {
                  scale: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.9, 1.05],
                  }),
                },
              ],
              opacity: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.7, 1],
              }),
            },
          ]}
        >
          <Text style={styles.icon}>
            {isFailed ? '😕' : status === 'downloading' ? '🎧' : status === 'transcribing' ? '🎙' : status === 'generating' ? '✨' : '🎧'}
          </Text>
        </Animated.View>

        <Text style={styles.stageTitle}>{isFailed ? '出了点问题' : stageMsg}</Text>

        {!isFailed && (
          <>
            <Text style={styles.hint}>{hint}</Text>

            <View style={styles.dividerWrap}>
              <WovenDivider width={220} height={8} />
            </View>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(5, progress)}%` }]} />
            </View>
            <Text style={styles.progressText}>{progress}%</Text>
          </>
        )}

        {isFailed && (
          <>
            <Text style={styles.errorText}>{error || state?.errorMessage || '未知错误'}</Text>
            {url && url !== 'test' ? (
              <Pressable
                onPress={async () => {
                  try {
                    await AsyncStorage.setItem('k0.lastUrl', url);
                  } catch {}
                  router.replace('/');
                }}
                style={[styles.retryBtn, { marginBottom: 8 }]}
              >
                <Text style={styles.retryText}>回首页重试</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => router.replace('/')}
              style={[styles.retryBtn, url && url !== 'test' ? styles.retryBtnSecondary : null]}
            >
              <Text style={[styles.retryText, url && url !== 'test' ? styles.retryTextSecondary : null]}>
                {url && url !== 'test' ? '试试别的' : '回首页试试别的'}
              </Text>
            </Pressable>
          </>
        )}
      </View>

      {!isFailed && url && (
        <View style={styles.footerCard}>
          <Text style={styles.footerLabel}>正在处理</Text>
          <Text style={styles.footerUrl} numberOfLines={1}>{url}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paperMain,
    paddingHorizontal: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  backText: {
    fontFamily: fonts.ui,
    fontSize: 17,
    color: colors.inkPrimary,
  },
  main: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paperCream,
    borderRadius: 60,
    borderWidth: 2,
    borderColor: colors.paperDark,
  },
  icon: { fontSize: 60 },
  stageTitle: {
    fontFamily: fonts.hero,
    fontSize: 22,
    lineHeight: 30,
    color: colors.inkPrimary,
    textAlign: 'center',
    maxWidth: 320,
  },
  hint: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    color: colors.inkSecondary,
    textAlign: 'center',
    maxWidth: 300,
    lineHeight: 20,
  },
  dividerWrap: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
  progressTrack: {
    width: '80%',
    height: 8,
    backgroundColor: colors.paperDark,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  progressFill: {
    height: 8,
    backgroundColor: colors.brick,
    borderRadius: 4,
  },
  progressText: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.inkSecondary,
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.brick,
    textAlign: 'center',
    maxWidth: 300,
    marginTop: spacing.md,
  },
  retryBtn: {
    backgroundColor: colors.brick,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.card,
    marginTop: spacing.lg,
  },
  retryBtnSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.paperDark,
    marginTop: spacing.sm,
  },
  retryText: {
    fontFamily: fonts.ui,
    fontSize: 16,
    color: colors.paperCream,
  },
  retryTextSecondary: {
    color: colors.inkSecondary,
  },
  footerCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  footerLabel: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    letterSpacing: 0.3,
  },
  footerUrl: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkPrimary,
    marginTop: 2,
  },
});
