// Import Progress 屏 - Sprint 7 STORY-00401
// URL → 拿到 jobId 后跳到本屏 → 轮询 → 完成后跳 Episode
//
// UX 保证：
//   - 三阶段动画（下载/转录/生成）
//   - 后台切换后自动恢复轮询
//   - 网络错误优雅提示
//   - "你可以最小化 App，好了会提醒你" 文案

import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, AppState, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  // 轮询逻辑
  const poll = async (immediate = false) => {
    if (!jobId) return;
    try {
      const s = await apiFetch<JobState>(`/api/jobs/${jobId}`);
      setState(s);
      setError(null);

      if (s.status === 'ready' && s.packId) {
        // 跳 Episode 屏
        router.replace({
          pathname: '/episode/[id]',
          params: { id: String(s.packId), goal: 'quick_understand', jobId: s.jobId },
        });
        return;
      }
      if (s.status === 'failed' || s.status === 'cancelled') {
        setError(s.errorMessage || '任务失败');
        return;
      }
      // 继续轮询：queued/downloading/transcribing/generating
      const nextDelay = immediate ? 1500 : 4000;  // 首次快，后续 4s
      pollTimerRef.current = setTimeout(() => poll(), nextDelay);
    } catch (e: any) {
      // 网络错误：指数退避
      setError(e?.message || '网络有点慢，重试中');
      pollTimerRef.current = setTimeout(() => poll(), 8000);
    }
  };

  // 首次挂载 + 后台恢复
  useEffect(() => {
    poll(true);

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && state?.status !== 'ready' && state?.status !== 'failed') {
        // 从后台回来，立即刷新一次
        if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
        poll(true);
      }
    });

    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      subscription.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  const status = state?.status || 'queued';
  const progress = state?.progress || 0;
  const stageMsg = STAGE_LABELS[status] || '处理中';
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
            <Pressable
              onPress={() => router.replace('/')}
              style={styles.retryBtn}
            >
              <Text style={styles.retryText}>回首页试试别的</Text>
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
    fontSize: 28,
    color: colors.inkPrimary,
    textAlign: 'center',
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
  retryText: {
    fontFamily: fonts.ui,
    fontSize: 16,
    color: colors.paperCream,
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
