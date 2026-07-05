// Episode detail screen — Sprint 3 STORY-00021 + STORY-00032
// Shows snapshot card + job polling + learning path + cards
// Receives: id (episodeId), goal (GoalKey), jobId (from GoalSelect) as route params
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { TornScore } from '@/components/TornScore';
import { PathRibbon } from '@/components/PathRibbon';
import { apiGet, apiFetch } from '@/lib/api';

const GOAL_LABELS: Record<string, string> = {
  quick_understand: '⚡ 快速了解',
  deep_learn: '🎯 深度学习',
  find_actions: '⚙ 找可执行方法',
  critical_thinking: '🔍 批判性思考',
  for_work: '📎 为工作/研究',
};

type JobStatus = 'processing' | 'ready' | 'failed';

interface JobResponse {
  status: JobStatus;
  progress: number;
  packId?: number;
  error?: string;
}

type ValueScore = { density: number; novelty: number; actionability: number };
type CorePoint = { point: string; timestamp: number };
type WorthListening = { start: number; end: number; reason: string };

interface SnapshotObject {
  oneSentence: string;
  corePoints: CorePoint[];
  audience: string[];
  valueScore: ValueScore;
  estimatedCostMinutes: number;
  worthListening: WorthListening[];
  skippable: unknown[];
}

interface LearningStep {
  id: number;
  stepNumber: number;
  title: string;
  content: string;
  citations: { timestamp: number; text: string }[];
  completed: boolean;
}

interface Card {
  id: number;
  type: string;
  title: string;
  explanation: string;
  sourceTimestamp: number;
  starred: boolean;
}

interface Actions {
  today: string;
  thisWeek: string;
  longTerm: string;
}

interface PackObject {
  id: number;
  episodeId: number;
  goal: string;
  language: string;
  snapshot: SnapshotObject;
  steps: LearningStep[];
  cards: Card[];
  actions: Actions;
  createdAt: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // 60 seconds max

// Sprint 6 v2 backend 返回扁平 pack shape，前端 UI 期望 nested。此适配保证两种 shape 都能渲染。
function reshapePack(raw: any, fallbackPackId: number, fallbackGoal?: string): PackObject {
  const packIdNum = raw?.id ?? fallbackPackId;
  return {
    id: packIdNum,
    episodeId: raw?.episodeId ?? packIdNum,
    goal: raw?.goal ?? String(fallbackGoal || 'quick_understand'),
    language: raw?.language ?? 'zh',
    snapshot: raw?.snapshot ?? {
      oneSentence: raw?.oneSentence ?? '',
      corePoints: raw?.corePoints ?? [],
      audience: raw?.audience ?? [],
      valueScore: raw?.valueScore ?? { density: 0, novelty: 0, actionability: 0 },
      estimatedCostMinutes: raw?.estimatedCostMinutes ?? 0,
      worthListening: raw?.worthListening ?? [],
      skippable: raw?.skippable ?? [],
    },
    steps: raw?.steps ?? [],
    cards: (raw?.cards ?? []).map((c: any, i: number) => ({
      id: c.id ?? packIdNum * 1000 + i,
      type: c.type ?? 'concept',
      title: c.title ?? '',
      explanation: c.explanation ?? '',
      sourceTimestamp: c.sourceTimestamp ?? 0,
      starred: c.starred ?? false,
    })),
    actions: raw?.actions ?? { today: '', thisWeek: '', longTerm: '' },
    createdAt: raw?.createdAt ?? new Date().toISOString(),
  };
}

const CARD_TYPE_COLORS: Record<string, string> = {
  opinion: colors.brick,
  method: colors.sapphire,
  case: colors.brown,
  reflection: colors.rose,
  action: colors.olive,
};

// Sprint 8: 卡片类型显示中文
const CARD_TYPE_LABELS: Record<string, string> = {
  opinion: '观点',
  method: '方法',
  case: '案例',
  reflection: '洞察',
  action: '行动',
};

// Sprint 4 STORY-00105: 撕纸浮起动效 — pack 从下方 spring 浮入
function PackContent({ children }: { children: React.ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      damping: 14,
      stiffness: 90,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }, [anim]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function ScoreDot({ value, seed }: { value: number; seed: number }) {
  // Sprint 4 STORY-00103: 换成撕纸风 TornScore（原 App Store 红点条被替换）
  return <TornScore value={value} seed={seed} />;
}

function SnapshotCard({ snapshot }: { snapshot: SnapshotObject }) {
  return (
    <View style={styles.snapshotCard} testID="snapshot-card">
      <Text style={styles.snapshotOneSentence} testID="snapshot-one-sentence">
        {snapshot.oneSentence}
      </Text>

      <View style={styles.snapshotDivider} />

      {/* Core points */}
      <View style={styles.corePointsBlock}>
        {snapshot.corePoints.map((cp, i) => (
          <View key={i} style={styles.corePointRow}>
            <Text style={styles.corePointBullet}>{i + 1}</Text>
            <Text style={styles.corePointText}>{cp.point}</Text>
          </View>
        ))}
      </View>

      {/* Value scores — Sprint 4 STORY-00103: 撕纸风替代红点条 */}
      <View style={styles.scoresBlock}>
        {(['density', 'novelty', 'actionability'] as const).map((k, idx) => (
          <View key={k} style={styles.scoreRow}>
            <Text style={styles.scoreLabel}>
              {k === 'density' ? '信息密度' : k === 'novelty' ? '新鲜程度' : '可行动性'}
            </Text>
            <ScoreDot value={snapshot.valueScore[k]} seed={idx + 1} />
            <Text style={styles.scoreNum}>{snapshot.valueScore[k]}</Text>
          </View>
        ))}
      </View>

      {/* Audience + cost */}
      <View style={styles.audienceRow}>
        <BubbleTag>{snapshot.estimatedCostMinutes + ' 分钟'}</BubbleTag>
        {snapshot.audience.slice(0, 2).map((a, i) => (
          <BubbleTag key={i}>{a}</BubbleTag>
        ))}
      </View>
    </View>
  );
}

function StepRow({ step, onToggle }: { step: LearningStep; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.stepCard, step.completed && styles.stepCardDone]} testID={`step-${step.stepNumber}`}>
      <Pressable
        style={styles.stepHeader}
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={`步骤 ${step.stepNumber}：${step.title}`}
      >
        <Pressable
          style={[styles.stepCheckbox, step.completed && styles.stepCheckboxDone]}
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityLabel={step.completed ? '标为未完成' : '标为已完成'}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          {step.completed ? <Text style={styles.stepCheckmark}>✓</Text> : null}
        </Pressable>
        <Text style={styles.stepNum}>{step.stepNumber}</Text>
        <Text style={[styles.stepTitle, step.completed && styles.stepTitleDone]} numberOfLines={expanded ? undefined : 1}>
          {step.title}
        </Text>
        <Text style={styles.stepChevron}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.stepBody}>
          <Text style={styles.stepContent}>{step.content}</Text>
          {step.citations.length > 0 ? (
            step.citations.map((c, i) => {
              // Sprint 8: v2 pack citations 没 text 只有 timestamp。若 text 为空只显示时间戳标签
              if (!c.text && typeof c.timestamp === 'number') {
                const mm = String(Math.floor(c.timestamp / 60)).padStart(2, '0');
                const ss = String(c.timestamp % 60).padStart(2, '0');
                return (
                  <Text key={i} style={styles.stepCitation}>
                    📍 音频 {mm}:{ss} 附近
                  </Text>
                );
              }
              if (!c.text) return null;
              return (
                <Text key={i} style={styles.stepCitation}>「{c.text}」</Text>
              );
            })
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export default function EpisodeScreen() {
  const insets = useSafeAreaInsets();
  const { id, goal, jobId: initialJobId, packId: initialPackId, direct } = useLocalSearchParams<{
    id: string; goal: string; jobId?: string; packId?: string; direct?: string;
  }>();
  const episodeId = Number(id);

  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('processing');
  const [progress, setProgress] = useState(0);
  const [pack, setPack] = useState<PackObject | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null);
  const [podcastName, setPodcastName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<LearningStep[]>([]);
  // Sprint 8: 完整转录懒加载展开
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptData, setTranscriptData] = useState<{ segments: Array<{ start: number; end: number; text: string }>; segmentCount: number; totalChars: number } | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Sprint 7: 直接 packId 模式 — Sprint 6 v2 pack shape 是扁平的（oneSentence/corePoints/valueScore 顶层）
  // 前端 UI 期望 nested snapshot 结构，此处通过 reshapePack 适配
  useEffect(() => {
    if (!initialJobId && id && !isNaN(Number(id))) {
      apiGet<{ pack: PackObject } | any>(`/api/packs/${id}`)
        .then((res) => {
          const raw = res.pack || res;
          if (!raw) return;
          const packIdNum = Number(id);
          const reshaped = reshapePack(raw, packIdNum, String(goal || ''));
          setPack(reshaped);
          // Sprint 8: 保存 episode 元数据
          if (res.episodeTitle) setEpisodeTitle(res.episodeTitle);
          if (res.podcastName) setPodcastName(res.podcastName);
          const mappedSteps = (raw.steps || []).map((s: any, idx: number) => ({
            id: packIdNum * 100 + idx,
            stepNumber: idx + 1,
            title: s.title,
            content: s.content,
            citations: s.sourceTimestamp ? [{ timestamp: s.sourceTimestamp, text: '' }] : [],
            completed: !!s.completed,
          }));
          setSteps(mappedSteps);
          setJobStatus('ready');
          setProgress(100);
        })
        .catch((err) => {
          if (!goal) {
            setError(err?.message || '找不到学习包');
            setJobStatus('failed');
          }
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If jobId not passed (direct navigation), kick off generation
  // Sprint 7 fix: 如果是直接 packId 模式（URL 里带了数字 id 且没 jobId），走 /api/packs/:id 路径，不再触发 legacy /generate
  useEffect(() => {
    if (initialJobId || !episodeId || !goal) return;
    // Skip if we've loaded pack directly
    if (pack) return;
    // Sprint 7: 直接 packId 模式 — id 是纯数字且没 jobId 时，跳过 legacy generate（会走上面的 direct-load useEffect）
    if (id && !isNaN(Number(id))) return;

    apiFetch<{ jobId: string; status: string }>(`/api/episodes/${episodeId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ goal }),
    })
      .then((res) => {
        setJobId(res.jobId);
      })
      .catch((err) => {
        setError(err.message || '生成失败，稍后重试');
        setJobStatus('failed');
      });

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [episodeId, goal, initialJobId, pack, id]);

  // Poll job status
  useEffect(() => {
    if (!jobId) return;
    if (jobStatus === 'ready' || jobStatus === 'failed') return;

    function poll() {
      if (pollCount.current >= MAX_POLLS) {
        setError('生成超时，请稍后重试');
        setJobStatus('failed');
        return;
      }
      pollCount.current += 1;

      apiGet<JobResponse>(`/api/jobs/${jobId}`)
        .then((res) => {
          setProgress(res.progress);
          Animated.timing(progressAnim, {
            toValue: res.progress / 100,
            duration: 400,
            useNativeDriver: false,
          }).start();

          if (res.status === 'ready' && res.packId) {
            setJobStatus('ready');
            return apiGet<{ pack: PackObject }>(`/api/packs/${res.packId}`);
          } else if (res.status === 'failed') {
            setError(res.error || '生成失败，稍后重试');
            setJobStatus('failed');
            return null;
          } else {
            pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
            return null;
          }
        })
        .then((packRes: any) => {
          if (packRes) {
            const raw: any = packRes.pack;
            const packIdNum = raw?.id ?? episodeId;
            const reshaped = reshapePack(raw, packIdNum, String(goal || ''));
            setPack(reshaped);
            if (packRes.episodeTitle) setEpisodeTitle(packRes.episodeTitle);
            if (packRes.podcastName) setPodcastName(packRes.podcastName);
            const mappedSteps = (raw?.steps || []).map((s: any, idx: number) => ({
              id: packIdNum * 100 + idx,
              stepNumber: idx + 1,
              title: s.title,
              content: s.content,
              citations: s.sourceTimestamp ? [{ timestamp: s.sourceTimestamp, text: '' }] : [],
              completed: !!s.completed,
            }));
            setSteps(mappedSteps);
          }
        })
        .catch(() => {
          pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
        });
    }

    pollTimer.current = setTimeout(poll, POLL_INTERVAL_MS);
    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [jobId, jobStatus]);

  function toggleStep(stepIndex: number) {
    const step = steps[stepIndex];
    const newCompleted = !step.completed;

    apiFetch<{ step: LearningStep }>(`/api/steps/${step.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ completed: newCompleted }),
    })
      .then((res) => {
        setSteps((prev) =>
          prev.map((s, i) => (i === stepIndex ? { ...s, completed: res.step.completed } : s))
        );
      })
      .catch(() => {
        // Optimistic update on error: toggle locally anyway
        setSteps((prev) =>
          prev.map((s, i) => (i === stepIndex ? { ...s, completed: newCompleted } : s))
        );
      });
  }

  const goalLabel = GOAL_LABELS[goal] || goal;
  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxxl },
      ]}
      testID="episode-scroll"
    >
      {/* Header — Sprint 4 STORY-00103/00106: 返回改 iOS 原生样式，pill 改 status 变体 */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityRole="button"
          accessibilityLabel="返回"
          style={styles.backBtn}
        >
          <Text style={styles.backText}>‹ 返回</Text>
        </Pressable>
        {/* Status pill — 无边框浅色底、无 → 箭头，视觉与导航/action chip 区分 */}
        <View style={styles.goalStatusPill} testID="episode-goal-tag">
          <Text style={styles.goalStatusText}>{goalLabel}</Text>
        </View>
      </View>

      <Text style={styles.heroTitle} accessibilityRole="header">学习包</Text>
      {episodeTitle ? (
        <View style={styles.episodeMeta}>
          {podcastName ? <Text style={styles.podcastName} numberOfLines={1}>{podcastName}</Text> : null}
          <Text style={styles.episodeTitle} numberOfLines={2}>{episodeTitle}</Text>
        </View>
      ) : null}

      <View style={styles.dividerWrap}>
        <WovenDivider width={280} height={10} />
      </View>

      {/* Processing state */}
      {jobStatus === 'processing' ? (
        <View style={styles.processingBlock} testID="processing-block">
          <ActivityIndicator color={colors.brick} size="large" />
          <Text style={styles.processingText}>
            AI 正在生成学习包…{progress > 0 ? ` ${progress}%` : ''}
          </Text>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>
        </View>
      ) : null}

      {/* Error state */}
      {jobStatus === 'failed' && error ? (
        <View style={styles.errorBlock} testID="error-block">
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryBtn}
            onPress={() => router.replace({ pathname: '/episode/[id]', params: { id: String(episodeId), goal } })}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>重试</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Pack content */}
      {pack ? (
        <PackContent>
          <View testID="pack-content">
          {/* Snapshot card */}
          <SnapshotCard snapshot={pack.snapshot} />

          <Text style={styles.sectionTitle}>学习路径</Text>
          {steps.length > 0 ? (
            <View style={styles.progressBanner} testID="steps-progress">
              <Text style={styles.progressFlag}>📎</Text>
              <Text style={styles.progressLabel}>
                <Text style={styles.progressNum}>{completedCount}</Text>
                <Text style={styles.progressSep}> / </Text>
                <Text style={styles.progressTotal}>{steps.length}</Text>
                <Text style={styles.progressText}>  步骤已完成</Text>
              </Text>
            </View>
          ) : null}

          {/* Steps — Sprint 4 STORY-00103: PathRibbon 撕纸进度带穿过所有 step */}
          <View style={styles.stepsWrap}>
            <View style={styles.stepsRibbon}>
              <PathRibbon
                totalSteps={steps.length || 6}
                completedIndices={new Set(steps.map((s, i) => (s.completed ? i : -1)).filter(i => i >= 0))}
                height={Math.max(steps.length, 6) * 72}
              />
            </View>
            <View style={styles.stepsList} testID="steps-list">
              {steps.map((step, i) => (
                <StepRow
                  key={step.id}
                  step={step}
                  onToggle={() => toggleStep(i)}
                />
              ))}
            </View>
          </View>

          {/* Cards */}
          {pack.cards.length > 0 ? (
            <>
              <Text style={styles.sectionTitle}>知识卡片</Text>
              <View style={styles.cardsList} testID="cards-list">
                {pack.cards.map((card) => (
                  <View
                    key={card.id}
                    style={styles.knowledgeCard}
                    testID={`card-${card.type}`}
                  >
                    <View style={[styles.cardTypeBar, { backgroundColor: CARD_TYPE_COLORS[card.type] || colors.olive }]} />
                    <View style={styles.cardInner}>
                      <Text style={styles.cardTitle}>{card.title}</Text>
                      <Text style={styles.cardExplanation}>{card.explanation}</Text>
                      <Text style={styles.cardType}>{CARD_TYPE_LABELS[card.type] || card.type}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Actions */}
          {pack.actions ? (
            <>
              <Text style={styles.sectionTitle}>行动计划</Text>
              <View style={styles.actionsCard} testID="actions-card">
                {(['today', 'thisWeek', 'longTerm'] as const).map((k) => (
                  <View key={k} style={styles.actionRow}>
                    <Text style={styles.actionTimeLabel}>
                      {k === 'today' ? '今天' : k === 'thisWeek' ? '本周' : '长期'}
                    </Text>
                    <Text style={styles.actionText}>{pack.actions[k]}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          {/* Sprint 8: 完整转录（懒加载 + 折叠展开）*/}
          {episodeId ? (
            <View style={styles.transcriptSection} testID="transcript-section">
              <Pressable
                onPress={async () => {
                  if (!transcriptExpanded && !transcriptData) {
                    setTranscriptLoading(true);
                    try {
                      const res = await apiGet<any>(`/api/packs/${episodeId}/transcript`);
                      setTranscriptData({
                        segments: res.segments || [],
                        segmentCount: res.segmentCount || 0,
                        totalChars: res.totalChars || 0,
                      });
                    } catch (err) {
                      // ignore, keep collapsed
                    } finally {
                      setTranscriptLoading(false);
                    }
                  }
                  setTranscriptExpanded(!transcriptExpanded);
                }}
                style={styles.transcriptHeader}
                accessibilityRole="button"
                accessibilityLabel={transcriptExpanded ? '收起完整转录' : '展开完整转录'}
              >
                <Text style={styles.transcriptTitle}>
                  完整转录
                  {transcriptData ? ` · ${transcriptData.segmentCount} 段 · ${transcriptData.totalChars} 字` : ''}
                </Text>
                <Text style={styles.transcriptToggle}>
                  {transcriptLoading ? '…' : transcriptExpanded ? '收起 ▲' : '展开 ▼'}
                </Text>
              </Pressable>
              {transcriptExpanded && transcriptData ? (
                <View style={styles.transcriptBody}>
                  <Text style={styles.transcriptHint}>
                    AI 自动转录，可能有识别错误。用于快速查阅原文。
                  </Text>
                  {transcriptData.segments.map((seg, i) => {
                    const mm = String(Math.floor(seg.start / 60)).padStart(2, '0');
                    const ss = String(Math.floor(seg.start % 60)).padStart(2, '0');
                    return (
                      <View key={i} style={styles.transcriptRow}>
                        <Text style={styles.transcriptTime}>{mm}:{ss}</Text>
                        <Text style={styles.transcriptText}>{seg.text}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
        </PackContent>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.md, minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary },
  heroTitle: { fontFamily: fonts.hero, fontSize: 48, lineHeight: 50, color: colors.inkPrimary, marginTop: spacing.sm, letterSpacing: -1 },
  episodeMeta: { marginTop: spacing.xs, marginBottom: spacing.xs },
  podcastName: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, letterSpacing: 0.3, marginBottom: 2 },
  episodeTitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.inkPrimary },
  dividerWrap: { alignItems: 'center', marginVertical: spacing.sm },

  processingBlock: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
  processingText: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSecondary, textAlign: 'center' },
  progressTrack: { width: '80%', height: 6, backgroundColor: colors.paperDark, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.brick, borderRadius: 3 },

  errorBlock: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  errorText: { fontFamily: fonts.body, fontSize: 15, color: colors.brick, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.brick, borderRadius: radii.card, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  retryText: { fontFamily: fonts.ui, fontSize: 16, color: colors.white },

  snapshotCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: colors.paperDark,
    gap: spacing.md,
    shadowColor: colors.inkPrimary,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 0,
    elevation: 2,
  },
  snapshotOneSentence: { fontFamily: fonts.body, fontSize: 18, lineHeight: 26, color: colors.inkPrimary, fontWeight: '600' },
  snapshotDivider: { height: 1.5, backgroundColor: colors.paperDark },
  corePointsBlock: { gap: spacing.sm },
  corePointRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  corePointBullet: { fontFamily: fonts.ui, fontSize: 13, color: colors.brick, width: 18, textAlign: 'center', marginTop: 2 },
  corePointText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary, flex: 1 },
  scoresBlock: { gap: spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scoreLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, width: 56 },
  scoreDots: { flexDirection: 'row', gap: 3 },
  scoreDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.paperDark },
  scoreDotFilled: { backgroundColor: colors.brick },
  scoreNum: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, width: 18 },
  audienceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },

  sectionTitle: { fontFamily: fonts.hero, fontSize: 24, color: colors.inkPrimary, marginTop: spacing.sm },

  // Sprint 4 STORY-00103: progress banner 放大加粗 + 撕纸小旗子
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.paperDark,
    alignSelf: 'flex-start',
  },
  progressFlag: { fontSize: 18 },
  progressLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.inkPrimary },
  progressNum: { fontFamily: fonts.hero, fontSize: 22, color: colors.brick },
  progressSep: { fontFamily: fonts.body, fontSize: 16, color: colors.inkSecondary },
  progressTotal: { fontFamily: fonts.hero, fontSize: 18, color: colors.inkPrimary },
  progressText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },

  // Sprint 4 STORY-00103: steps wrapper with left ribbon
  stepsWrap: { flexDirection: 'row', gap: spacing.sm, alignItems: 'stretch' },
  stepsRibbon: { width: 20, paddingTop: 8 },

  // Sprint 4 STORY-00103/00107: goal pill status variant (无边框、无箭头，暗示不可点)
  goalStatusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.paperCream,
    borderRadius: radii.bubble,
  },
  goalStatusText: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.brown,
    letterSpacing: 0.3,
  },

  stepsList: { gap: spacing.sm, flex: 1 },
  stepCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.paperDark,
    overflow: 'hidden',
  },
  stepCardDone: { borderColor: colors.olive, opacity: 0.75 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, minHeight: 56 },
  stepCheckbox: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.paperDark,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepCheckboxDone: { backgroundColor: colors.olive, borderColor: colors.olive },
  stepCheckmark: { fontFamily: fonts.ui, fontSize: 13, color: colors.white },
  stepNum: { fontFamily: fonts.ui, fontSize: 14, color: colors.brick, width: 18, textAlign: 'center' },
  stepTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  stepTitleDone: { color: colors.inkSecondary, textDecorationLine: 'line-through' },
  stepChevron: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  stepBody: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  stepContent: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.inkPrimary },
  stepCitation: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 13, lineHeight: 20, color: colors.inkSecondary, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.paperDark },

  cardsList: { gap: spacing.md },
  knowledgeCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.paperDark,
  },
  cardTypeBar: { width: 5 },
  cardInner: { flex: 1, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary },
  cardExplanation: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkSecondary },
  cardType: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.6 },

  actionsCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1.5,
    borderColor: colors.paperDark,
  },
  actionRow: { gap: spacing.xs },
  actionTimeLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.brick },
  actionText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary },

  // Sprint 8: 完整转录折叠
  transcriptSection: {
    marginTop: spacing.lg,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  transcriptTitle: {
    fontFamily: fonts.ui,
    fontSize: 13,
    color: colors.inkPrimary,
    letterSpacing: 0.3,
    flex: 1,
  },
  transcriptToggle: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkSecondary,
    marginLeft: spacing.sm,
  },
  transcriptBody: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.paperDark,
  },
  transcriptHint: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.inkSecondary,
    marginBottom: spacing.md,
  },
  transcriptRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    gap: spacing.sm,
  },
  transcriptTime: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    minWidth: 44,
    paddingTop: 2,
    opacity: 0.7,
  },
  transcriptText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkPrimary,
    flex: 1,
  },
});
