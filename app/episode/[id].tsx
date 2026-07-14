// Episode detail screen — Sprint 3 STORY-00021 + STORY-00032
// Shows snapshot card + job polling + learning path + cards
// Receives: id (episodeId), goal (GoalKey), jobId (from GoalSelect) as route params
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Alert,
  Image,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { savePendingJob } from '@/lib/pendingJob';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScreenHeader } from '@/components/ScreenHeader';
import { ScreenHeaderPad } from '@/components/ScreenHeaderPad';
import { ipad, ipadLayout } from '@/constants/ipadTheme';
import { TornCheck } from '@/components/TornCheck';
import { PlayIconTorn } from '@/components/icons/PlayIconTorn';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { PackContent } from '@/components/episode/PackContent';
import { SnapshotCard } from '@/components/pack/SnapshotCard';
import { ConceptsPanel } from '@/components/episode/ConceptsPanel';
import { StepRow } from '@/components/episode/StepRow';
import { CardsCarousel } from '@/components/episode/CardsCarousel';
import { RecallPanel } from '@/components/episode/RecallPanel';
import { MindMap } from '@/components/episode/MindMap';
import { reshapePack } from '@/lib/reshapePack';
import type { PackObject, LearningStep, Actions } from '@/types/pack';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
// Sprint 14 R1 #10: PathRibbon 已废弃（用 stepAccentBar 替代）
import { apiGet, apiFetch } from '@/lib/api';
import { queryClient } from '@/lib/queryClient';
import { usePack } from '@/hooks/usePack';
// Sprint 15 音频 demo: 点击 timestamp 从该秒开始播放
import { useAudioPlayer } from '@/lib/audioPlayer';
import { useResponsive } from '@/hooks/useResponsive';

type JobStatus = 'loading' | 'processing' | 'ready' | 'failed';

interface JobResponse {
  status: JobStatus;
  progress: number;
  packId?: number;
  error?: string;
}

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // 60 seconds max

// Sprint 13 R2: QuizPanel 已删（PRD M5 测验题已弃，Sprint 11 v3 起不再渲染）

export default function EpisodeScreen() {
  const insets = useSafeAreaInsets();
  const { isWide } = useResponsive();   // iPad 横屏 → 方案A 左大纲栏+右滚动
  const { width: winW } = useWindowDimensions();
  const L = ipadLayout(winW);
  // iPad 方案A: 右侧内容 ScrollView ref + 各段 Y 坐标(onLayout 捕获), 点左栏锚点 scrollTo
  const contentScrollRef = useRef<ScrollView>(null);
  const sectionY = useRef<Record<string, number>>({});
  const onSectionLayout = useCallback((key: string) => (e: any) => {
    sectionY.current[key] = e.nativeEvent.layout.y;
  }, []);
  const scrollToSection = useCallback((key: string) => {
    setActiveSection(key);
    const y = sectionY.current[key];
    if (y != null) contentScrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
  }, []);
  // R55f(#3): 左栏点击后高亮当前项
  const [activeSection, setActiveSection] = useState<string | null>(null);
  // Sprint 15 音频 demo
  const audioPlayer = useAudioPlayer();

  // Sprint 16 R8 / Bug1 R23: 音频停止改由 AudioPlayerBar 监听 pathname 变化统一处理 (root 级, 稳定)

  const { id, goal, jobId: initialJobId, packId: initialPackId, direct, mode } = useLocalSearchParams<{
    id: string; goal: string; jobId?: string; packId?: string; direct?: string; mode?: string;
  }>();
  const episodeId = Number(id);
  const urlMode: 'quick' | 'deep' = mode === 'quick' ? 'quick' : 'deep';
  const [upgrading, setUpgrading] = useState(false);
  // Sprint 13 #17: ConfirmDialog state for card delete
  const [deleteConfirmCard, setDeleteConfirmCard] = useState<null | { realIdx: number; doDelete: () => Promise<void> | void }>(null);

  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  // Bug5 (Sprint16 R23-fix): 直接打开已有学习包(Library/卡片进, 无 jobId) 起始不该是 'processing'
  //   ('processing' 会显示"AI 正在生成学习包" 误导用户以为在调 AI)。
  //   无 jobId = 直接加载 → 起始 'loading' (中性 spinner); 有 jobId = 真在生成 → 'processing'。
  const [jobStatus, setJobStatus] = useState<JobStatus>(initialJobId ? 'processing' : 'loading');
  const [progress, setProgress] = useState(0);
  const [pack, setPack] = useState<PackObject | null>(null);
  // Sprint 11 v3: mode 决定学习深度 quick|deep（默认 deep 兼容老链接）
  // Bug6 (Sprint16 R23): 优先用服务端真值 pack.mode, 兜底 URL param。
  //   修 "从卡片跳学习包只显示标题" — quick pack 之前被当 deep 渲染 (步骤/概念空却占位)。
  const learningMode: 'quick' | 'deep' =
    pack?.mode === 'quick' ? 'quick' : pack?.mode === 'deep' ? 'deep' : urlMode;
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null);
  const [podcastName, setPodcastName] = useState<string | null>(null);
  const [episodeCover, setEpisodeCover] = useState<string | null>(null);
  // Sprint 15 音频 demo: 从 /api/packs/:id 拉到的原始播客音频 URL
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<LearningStep[]>([]);
  // #111 脑图: 懒展开 (SVG 较重, 点开才渲染)
  const [mindmapOpen, setMindmapOpen] = useState(false);   // R40: 保留占位, 脑图已改全屏入口不再用此 toggle
  // Sprint 8: 完整转录懒加载展开
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  // Sprint 14 R1 #12: transcriptData 同时存 full/sanitized 两份，切换时使用对应
  const [transcriptData, setTranscriptData] = useState<{
    fullSegments: Array<{ start: number; end: number; text: string }>;
    sanitizedSegments: Array<{ start: number; end: number; text: string }>;
    fullCount: number;
    sanitizedCount: number;
    totalChars: number;
  } | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  // Sprint 13 R1 CR-016: 转录 view mode (summary 默认 / full 完整)
  const [transcriptMode, setTranscriptMode] = useState<'summary' | 'full'>('summary');

  const pollCount = useRef(0);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Bug (Sprint16 R23-fix3): 直接打开已有学习包 = 一个简单的 select, 走 React Query (usePack)
  //   缓存, 与卡片页同一数据源。这样:
  //   - 再次进入命中缓存 → 立即渲染, 无 loading→content 翻转 = 无闪烁 (卡片页本就无闪就是因为用了它)
  //   - 有 error 状态 → 不会永远卡"加载中" (旧 imperative 版 catch 里 goal 存在时啥都不做 → 死在 loading)
  //   仅在"直接打开模式"(无 jobId + 合法 id) 启用; 生成流程(有 jobId) 仍走下方 job 轮询。
  const directPackId = !initialJobId && id && !isNaN(Number(id)) ? Number(id) : 0;
  const { data: directPackResp, isLoading: directLoading, error: directError, refetch: refetchDirectPack } = usePack(directPackId);

  // 把 usePack 拉到的服务端数据同步进本页 state (render 结构不变, 只换数据来源)
  useEffect(() => {
    if (!directPackId || !directPackResp) return;
    const res: any = directPackResp;
    const raw = res.pack || res;
    if (!raw) return;
    const packIdNum = Number(id);
    const reshaped = reshapePack(raw, packIdNum, String(goal || ''));
    setPack(reshaped);
    if (res.episodeTitle) setEpisodeTitle(res.episodeTitle);
    if (res.podcastName) setPodcastName(res.podcastName);
    if (res.episodeCover) setEpisodeCover(res.episodeCover);
    if (res.audioUrl) setAudioUrl(res.audioUrl);
    const mappedSteps = (raw.steps || []).map((s: any, idx: number) => ({
      id: packIdNum * 100 + idx,
      stepNumber: idx + 1,
      title: s.title,
      content: s.content,
      // #88: 用后端真实 citations(有原文出处的 step) + aiSynthesized(无出处=AI归纳)
      citations: Array.isArray(s.citations) ? s.citations : [],
      aiSynthesized: s.aiSynthesized === true,
      completed: !!s.completed,
    }));
    setSteps(mappedSteps);
    setJobStatus('ready');
    setProgress(100);
  }, [directPackId, directPackResp, id, goal]);

  // committedActions 单独拉 (影响行动计划勾选态)
  useEffect(() => {
    if (!directPackId || !directPackResp) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiGet<{ pending: any[]; done: any[] }>(`/api/review/actions`);
        if (cancelled) return;
        const packActions = [...(r.pending || []), ...(r.done || [])].filter(a => a.pack_id === directPackId);
        const committed = packActions.map(a => a.slot_index);
        setPack(prev => prev ? { ...prev, committedActions: committed } : prev);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [directPackId, directPackResp]);

  // 直接模式的 error → 不再永远卡 loading
  useEffect(() => {
    if (directPackId && directError) {
      setError((directError as Error)?.message || '找不到学习包');
      setJobStatus('failed');
    }
  }, [directPackId, directError]);

  // fetchDirectPack 保留为 refetch 别名 (CardsCarousel 删卡后 / 其他地方复用)
  const fetchDirectPack = useCallback(() => {
    if (directPackId) refetchDirectPack();
  }, [directPackId, refetchDirectPack]);

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
        .then(async (res) => {
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
            if (packRes.episodeCover) setEpisodeCover(packRes.episodeCover);
            if (packRes.audioUrl) setAudioUrl(packRes.audioUrl);
            const mappedSteps = (raw?.steps || []).map((s: any, idx: number) => ({
              id: packIdNum * 100 + idx,
              stepNumber: idx + 1,
              title: s.title,
              content: s.content,
              citations: Array.isArray(s.citations) ? s.citations : [],
              aiSynthesized: s.aiSynthesized === true,
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

    // Auth via JWT header (apiFetch attaches Bearer token automatically)
    (async () => {
      apiFetch<{ step: LearningStep }>(`/api/steps/${step.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: newCompleted }),
      })
      .then((res) => {
        setSteps((prev) =>
          prev.map((s, i) => (i === stepIndex ? { ...s, completed: res.step.completed } : s))
        );
        // 跨页缓存失效: 步骤完成影响 Library 的 stepsDoneCount / 今日目标
        queryClient.invalidateQueries({ queryKey: ['library'] });
      })
      .catch(() => {
        // Optimistic update on error: toggle locally anyway
        setSteps((prev) =>
          prev.map((s, i) => (i === stepIndex ? { ...s, completed: newCompleted } : s))
        );
      });
    })();
  }

  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <View style={styles.root}>
      {/* Sprint 16 R14: 顶栏常驻。R55: iPad 用独立 ScreenHeaderPad(返回最左/大标题/宽分割线) */}
      {(() => {
        const onBack = () => {
          try { audioPlayer.stop(); } catch {}
          if (direct === '1' && router.canGoBack()) router.back();
          else router.replace('/');
        };
        return isWide
          ? <ScreenHeaderPad title="学习包" subtitle={episodeTitle || undefined} onBack={onBack} />
          : <ScreenHeader title="学习包" subtitle={episodeTitle || undefined} onBack={onBack} />;
      })()}
      {/* R55d(#4/#7): iPad 走首页基准 — gutter+insets 外留白, bodyRow 限宽居中; 圆角 rail 对齐 library。 */}
      <View style={isWide ? [stylesWide.bodyOuter, { paddingLeft: L.gutter + insets.left, paddingRight: L.gutter + insets.right }] : undefined}>
      <View style={isWide ? [stylesWide.bodyRow, { maxWidth: L.contentWidth }] : undefined}>
        {/* iPad 方案A: 左固定大纲导读栏 — 章节锚点, 点击滚动右侧内容 */}
        {isWide && pack ? (
          <View style={stylesWide.rail}>
            <Text style={stylesWide.railKicker}>目录导读</Text>
            {[
              { key: 'snapshot', label: '核心速览' },
              ...(pack.concepts && pack.concepts.length ? [{ key: 'concepts', label: `关键概念 (${pack.concepts.length})` }] : []),
              ...(learningMode === 'deep' && pack.snapshot?.oneSentence ? [{ key: 'mindmap', label: '知识脑图' }] : []),
              ...(learningMode === 'deep' ? [{ key: 'path', label: '学习路径' }] : []),
              { key: 'cards', label: '知识卡片' },
              ...(learningMode === 'deep' ? [{ key: 'actions', label: '行动计划' }] : []),
              ...(learningMode === 'deep' ? [{ key: 'recall', label: '主动回忆' }] : []),
            ].map(item => (
              <Pressable key={item.key} onPress={() => scrollToSection(item.key)} style={[stylesWide.railItem, activeSection === item.key && stylesWide.railItemActive]}>
                <Text style={[stylesWide.railItemText, activeSection === item.key && stylesWide.railItemTextActive]}>{item.label}</Text>
              </Pressable>
            ))}
            {learningMode === 'deep' ? (
              <Text style={stylesWide.railProgress}>进度 {completedCount} / {steps.length} 步已完成</Text>
            ) : null}
          </View>
        ) : null}
      <ScrollView
        ref={contentScrollRef}
        style={[styles.scroll, isWide && stylesWide.contentScroll]}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxxl },
          isWide && { paddingTop: ipad.rail.padV },
        ]}
        testID="episode-scroll"
      >

      {/* Sprint 14 R2 fix #1: 下方内容独立 padding，避免与 ScreenHeader 内部 padding 双重缩进 */}
      <View style={[styles.innerContent, isWide && { width: '100%', alignSelf: 'stretch' }]}>

      {episodeTitle ? (
        <View style={styles.episodeMetaRow}>
          {episodeCover ? (
            <Image source={{ uri: episodeCover }} style={styles.episodeCover} accessibilityIgnoresInvertColors />
          ) : null}
          <View style={styles.episodeMeta}>
            {podcastName ? <Text style={styles.podcastName} numberOfLines={1}>{podcastName}</Text> : null}
            <Text style={styles.episodeTitle} numberOfLines={3}>{episodeTitle}</Text>
          </View>
        </View>
      ) : null}

      {/* Sprint 13 R2: ScreenHeader 已含 WovenDivider，删除重复分割线 */}

      {/* Loading state — 仅当 React Query 真的在首次加载(无缓存数据)时显示。
          Bug fix: 用 directLoading && !directPackResp 判断, 命中缓存时 directPackResp 立即有值
          → 不显示 spinner → 无 loading→content 翻转 = 无闪烁 (与卡片页一致)。 */}
      {jobStatus === 'loading' && !pack && directLoading && !directPackResp ? (
        <View style={styles.processingBlock} testID="loading-block">
          <ActivityIndicator color={colors.brick} size="large" />
          <Text style={styles.processingText}>加载中…</Text>
        </View>
      ) : null}

      {/* Processing state (真在生成新学习包, 有 jobId 轮询) */}
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
          <View onLayout={onSectionLayout('snapshot')}>
          <SnapshotCard
            snapshot={pack.snapshot}
            audioUrl={audioUrl}
            onPlay={(sec) => { if (audioUrl) audioPlayer.play(audioUrl, sec); }}
          />
          </View>

          {/* Sprint 14 R1 #16: quick 模式只显示卡片+精华，隐藏 concepts/steps/actions */}
          {learningMode === 'deep' && Array.isArray(pack.concepts) && pack.concepts.length > 0 && (
            <View onLayout={onSectionLayout('concepts')}>
            <ConceptsPanel
              concepts={pack.concepts}
              audioUrl={audioUrl}
              onPlay={(sec) => { if (audioUrl) audioPlayer.play(audioUrl, sec); }}
            />
            </View>
          )}

          {/* #111 知识脑图 — deep 模式。R40: 竖屏只给"全屏查看"按钮, 点了进全屏横屏看完整脑图 */}
          {learningMode === 'deep' && pack.snapshot?.oneSentence ? (
            <View style={styles.mindmapBlock} onLayout={onSectionLayout('mindmap')}>
              <Text style={styles.sectionTitle}>知识脑图</Text>
              <MindMap
                pack={pack}
                onPlay={(sec) => { if (audioUrl) audioPlayer.play(audioUrl, sec); }}
                onOpenCard={(cardIndex) => router.push({
                  pathname: '/card/[key]',
                  params: { key: `${pack.id}-${cardIndex}`, packId: String(pack.id), cardIdx: String(cardIndex) },
                })}
              />
            </View>
          ) : null}

          {learningMode === 'deep' && (
            <>
              <Text style={styles.sectionTitle} onLayout={onSectionLayout('path')}>学习路径</Text>
              {steps.length > 0 ? (
                <View style={styles.progressBanner} testID="steps-progress">
                  <Text style={styles.progressLabel}>
                <Text style={styles.progressNum}>{completedCount}</Text>
                <Text style={styles.progressSep}> / </Text>
                <Text style={styles.progressTotal}>{steps.length}</Text>
                <Text style={styles.progressText}>  步骤已完成</Text>
              </Text>
              {/* Sprint 8: 完成庆祝 */}
              {steps.length > 0 && completedCount === steps.length ? (
                <View style={styles.doneChip}>
                  <Text style={styles.doneChipText}>完成一集</Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Sprint 14 R1 #10: 去掉 PathRibbon 竖线和缩进；步骤列表直接铺满，用左侧 4px 彩色条区分（长度=step 卡片自身高度，自动匹配文本） */}
          <View style={styles.stepsList} testID="steps-list">
            {steps.map((step, i) => (
              <StepRow
                key={step.id}
                step={step}
                stepIndex={i}
                onToggle={() => toggleStep(i)}
              />
            ))}
          </View>
            </>
          )}

          {/* Cards — Sprint 16 R1-5: 学习包卡片改为左右滑 carousel（Frank 4B）
              视觉暗示：下张露角 + 底部页码点（Frank 5A+B） */}
          {pack.cards.length > 0 ? (
            <>
              <Text style={styles.sectionTitle} onLayout={onSectionLayout('cards')}>知识卡片</Text>
              <CardsCarousel
                pack={pack}
                setPack={setPack}
                audioUrl={audioUrl}
                audioPlayer={audioPlayer}
                podcastName={podcastName}
                setDeleteConfirmCard={setDeleteConfirmCard}
                refetch={fetchDirectPack}
              />
            </>
          ) : null}

          {/* Actions — Sprint 14 R1 #16: quick 模式隐藏行动计划 */}
          {learningMode === 'deep' && pack.actions ? (
            <>
              <Text style={styles.sectionTitle} onLayout={onSectionLayout('actions')}>行动计划</Text>
              <View style={styles.actionsCard} testID="actions-card">
                {(['today', 'thisWeek', 'longTerm'] as const).map((k, actionIdx) => {
                  const timeframe = k === 'today' ? 'today' : k === 'thisWeek' ? 'week' : 'longterm';
                  const committed = pack.committedActions?.includes(actionIdx) ?? false;
                  return (
                    <View key={k} style={styles.actionRow}>
                      <Pressable
                        onPress={async () => {
                          // Sprint 14 R1 #13: 允许取消已承诺，UI 反馈立即；后端同步
                          const wasCommitted = committed;
                          const actionText = pack.actions[k];
                          if (!actionText) return;
                          // 乐观更新（toggle）
                          setPack(prev => prev ? {
                            ...prev,
                            committedActions: wasCommitted
                              ? (prev.committedActions || []).filter(i => i !== actionIdx)
                              : [...(prev.committedActions || []), actionIdx]
                          } : prev);
                          try {
                            if (wasCommitted) {
                              await apiFetch('/api/review/actions/uncommit', {
                                method: 'POST',
                                body: JSON.stringify({ packId: pack.id, slotIndex: actionIdx, timeframe }),
                              });
                            } else {
                              await apiFetch('/api/review/actions/commit', {
                                method: 'POST',
                                body: JSON.stringify({
                                  packId: pack.id,
                                  slotIndex: actionIdx,
                                  actionText,
                                  timeframe,
                                }),
                              });
                            }
                            // 跨页缓存失效: 承诺影响 Review 承诺列表 + Library 今日目标
                            queryClient.invalidateQueries({ queryKey: ['review'] });
                            queryClient.invalidateQueries({ queryKey: ['library'] });
                          } catch {
                            // 回滚
                            setPack(prev => prev ? {
                              ...prev,
                              committedActions: wasCommitted
                                ? [...(prev.committedActions || []), actionIdx]
                                : (prev.committedActions || []).filter(i => i !== actionIdx)
                            } : prev);
                          }
                        }}
                        accessibilityRole="checkbox"
                        accessibilityLabel={committed ? '取消承诺' : '承诺执行'}
                        hitSlop={6}
                      >
                        <TornCheck size={20} checked={committed} />
                      </Pressable>
                      <Text style={styles.actionTimeLabel}>
                        {k === 'today' ? '今天' : k === 'thisWeek' ? '本周' : '长期'}
                      </Text>
                      {/* Sprint 13 R1 CR-017 落实：空档展示优雅提示 */}
                      {pack.actions[k] ? (
                        <Text style={[styles.actionText, committed && styles.actionTextCommitted]}>{pack.actions[k]}</Text>
                      ) : (
                        <Text style={styles.actionEmpty}>本集没提供这一档行动建议</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Sprint 11 v3: QuizPanel 删除（走 CR-003，PRD M5 测验题已弃） */}

          {/* #77 主动回忆 · 费曼复述 — deep 且有回忆题时显示 */}
          {learningMode === 'deep' && pack.recallQuestions && pack.recallQuestions.length > 0 ? (
            <View onLayout={onSectionLayout('recall')}>
            <RecallPanel
              packId={pack.id}
              questions={pack.recallQuestions}
              feynmanSummary={pack.feynmanSummary}
            />
            </View>
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
                      // Sprint 14 R1 #12: 摘要=sanitizedParagraphs（去掉 skippable），完整=paragraphs（原文）
                      setTranscriptData({
                        fullSegments: res.paragraphs || res.segments || [],
                        sanitizedSegments: res.sanitizedParagraphs || res.paragraphs || res.segments || [],
                        fullCount: res.paragraphCount || (res.segments?.length || 0),
                        sanitizedCount: res.sanitizedParagraphCount || res.paragraphCount || (res.segments?.length || 0),
                        totalChars: res.totalChars || 0,
                      });
                    } catch (err) {
                      setTranscriptData({ fullSegments: [], sanitizedSegments: [], fullCount: 0, sanitizedCount: 0, totalChars: 0 });
                    } finally {
                      setTranscriptLoading(false);
                    }
                  }
                  setTranscriptExpanded(!transcriptExpanded);
                }}
                style={styles.transcriptHeader}
                accessibilityRole="button"
                accessibilityLabel={transcriptExpanded ? '收起原文' : '展开原文'}
              >
                <Text style={styles.transcriptTitle}>
                  {transcriptMode === 'summary' ? '摘要' : '完整转录'}
                  {transcriptData ? ` · ${transcriptMode === 'summary' ? transcriptData.sanitizedCount : transcriptData.fullCount} 段` : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
                  {/* Sprint 13 R1 CR-016: 摘要 ↔ 完整 切换 icon */}
                  {transcriptExpanded ? (
                    <Pressable
                      onPress={(e) => {
                        e.stopPropagation();
                        setTranscriptMode(m => m === 'summary' ? 'full' : 'summary');
                      }}
                      hitSlop={8}
                      style={styles.transcriptModeBtn}
                    >
                      <Text style={styles.transcriptModeBtnText}>
                        {transcriptMode === 'summary' ? '看完整' : '看摘要'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Text style={styles.transcriptToggle}>
                    {transcriptLoading ? '…' : transcriptExpanded ? '收起 ▲' : '展开 ▼'}
                  </Text>
                </View>
              </Pressable>
              {transcriptExpanded && transcriptData ? (
                <View style={styles.transcriptBody}>
                  <Text style={styles.transcriptHint}>
                    {transcriptMode === 'summary'
                      ? 'AI 已剔除广告/寒暄等无用内容。切"看完整"查看原文。'
                      : 'AI 自动转录，可能有识别错误。用于快速查阅原文。'}
                  </Text>
                  {/* Sprint 13 R5: suspectedTypos 走契约字段（删 as any）*/}
                  {pack?.snapshot && pack.suspectedTypos && Array.isArray(pack.suspectedTypos) && pack.suspectedTypos.length > 0 ? (
                    <View style={styles.typoBlock}>
                      <Text style={styles.typoTitle}>已识别的可能错别字：</Text>
                      {pack.suspectedTypos.slice(0, 8).map((t, i) => (
                        <Text key={i} style={styles.typoRow}>
                          「{t.text}」 → 可能是 「{t.guess}」
                          {t.context ? ` · ${t.context}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {/* Sprint 14 R1 #12: 摘要=净化 vs 完整=原文 */}
                  {(() => {
                    const segsToShow = transcriptMode === 'summary'
                      ? transcriptData.sanitizedSegments
                      : transcriptData.fullSegments;
                    if (segsToShow.length === 0) {
                      return (
                        <Text style={styles.transcriptHint}>
                          转录暂不可用（可能这集是从缓存加载的，或加载失败）
                        </Text>
                      );
                    }
                    return segsToShow.map((seg, i) => {
                      const s = Number.isFinite(seg.start) ? seg.start : 0;
                      const mm = String(Math.floor(s / 60)).padStart(2, '0');
                    const ss = String(Math.floor(s % 60)).padStart(2, '0');
                    // R25 Bug#6: 值得听的段落在完整转录里高亮 —— seg 时间与任一 worthListening 区间重叠即高亮
                    const worthRanges = (pack?.snapshot?.worthListening || []) as any[];
                    // R55e: 归一化 worth 区间(秒), 供词级 + 段级共用
                    const wr = worthRanges
                      .map((w: any) => ({ ws: Number(w.startSec ?? w.start ?? -1), we: Number(w.endSec ?? w.end ?? -1) }))
                      .filter(r => r.ws >= 0 && r.we >= 0);
                    const segEnd = Number.isFinite(seg.end) ? seg.end : s;
                    const isWorth = wr.some(r => s < r.we && segEnd > r.ws);   // 区间有交集
                    // R55e 词级高亮: 有 words → 逐词渲染, 只给落在 worth 区间的词上色; 无 words(旧pack) → fallback 段级整行高亮。
                    const words = Array.isArray((seg as any).words) ? (seg as any).words : null;
                    const hasWordLevel = words && words.length > 0 && wr.length > 0;
                    return (
                      <View key={i} style={[styles.transcriptRow, isWorth && !hasWordLevel && styles.transcriptRowWorth]}>
                        {/* Sprint 16 R7: 段落时间戳可点播放 */}
                        <Pressable
                          onPress={() => { if (audioUrl) audioPlayer.play(audioUrl, s); }}
                          disabled={!audioUrl}
                          hitSlop={4}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Text style={styles.transcriptTime}>{mm}:{ss}</Text>
                          {audioUrl ? <PlayIconTorn size={10} color={colors.inkSecondary} /> : null}
                        </Pressable>
                        {hasWordLevel ? (
                          <Text style={styles.transcriptText}>
                            {words.map((w: any, wi: number) => {
                              const wStart = Number(w.s ?? w.start ?? -1);
                              const wEnd = Number(w.e ?? w.end ?? wStart);
                              const label = String(w.l ?? w.label ?? '');
                              const hit = wStart >= 0 && wr.some(r => wStart < r.we && wEnd > r.ws);
                              return hit
                                ? <Text key={wi} style={styles.transcriptWordWorth}>{label}</Text>
                                : <Text key={wi}>{label}</Text>;
                            })}
                          </Text>
                        ) : (
                          <Text style={styles.transcriptText}>{seg.text}</Text>
                        )}
                      </View>
                    );
                    });
                  })()}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Sprint 11 v3: quick 模式底部升级到精学按钮 */}
          {learningMode === 'quick' && pack ? (
            <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}>
              <Pressable
                onPress={async () => {
                  if (upgrading) return;
                  // Sprint 16 R11: 升级前 stop 音频
                  try { audioPlayer.stop(); } catch {}
                  setUpgrading(true);
                  try {
                    // Sprint 11 v16: 走 job pattern，跳等待屏
                    const res = await apiFetch<{ ok: boolean; jobId?: string }>(`/api/packs/${id}/generate`, {
                      method: 'POST',
                      body: JSON.stringify({ mode: 'deep'}),
                    });
                    if (res.jobId) {
                      await savePendingJob({
                        jobId: res.jobId,
                        url: `pack:${id}:deep`,
                        packId: Number(id),
                        mode: 'deep',
                        targetType: 'pack-generate',
                      });
                      router.replace({
                        pathname: '/import/[jobId]',
                        params: { jobId: res.jobId, targetPackId: String(id), targetMode: 'deep' },
                      });
                    }
                  } catch {}
                  finally { setUpgrading(false); }
                }}
                style={{
                  backgroundColor: colors.sapphire,
                  paddingVertical: 14,
                  borderRadius: radii.card,
                  alignItems: 'center',
                }}
                disabled={upgrading}
              >
                <Text style={{ fontFamily: fonts.hero, fontSize: 18, color: colors.paperCream }}>
                  {upgrading ? '生成中...' : '升级到精学'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
        </PackContent>
      ) : null}

      </View>
      {/* /Sprint 14 R2 fix #1: innerContent 结束 */}

      {/* Sprint 13 #17: 撕纸风删除卡片确认弹窗 */}
      <ConfirmDialog
        visible={!!deleteConfirmCard}
        title="删除这张卡片？"
        message="卡片会从学习包中隐藏，Review 队列也不再出现。"
        confirmLabel="删除"
        cancelLabel="取消"
        destructive
        onCancel={() => setDeleteConfirmCard(null)}
        onConfirm={() => {
          const d = deleteConfirmCard;
          setDeleteConfirmCard(null);
          if (d) d.doDelete();
        }}
      />
      </ScrollView>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  // Sprint 16 R14: ScrollView 从 root 提出，root 变外层 View，scroll 独立 flex
  scroll: { flex: 1 },
  // Sprint 14 R2 fix: 移除 ScrollView 全宽 paddingHorizontal（避免与 ScreenHeader 内部 padding 双重缩进）
  // ScreenHeader 全宽，下方内容用 innerContent 加 padding
  content: { flexGrow: 1, gap: spacing.lg },
  innerContent: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backBtn: { paddingVertical: spacing.sm, paddingRight: spacing.md, minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary },
  heroTitle: { fontFamily: fonts.hero, fontSize: 44, lineHeight: 46, color: colors.inkPrimary, marginTop: spacing.sm, letterSpacing: -1 },
  episodeMetaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  episodeCover: {
    width: 56,
    height: 56,
    borderRadius: radii.card,
    // Sprint 13 R4: 去 border（cover 图靠圆角 clip 分层）
  },
  episodeMeta: { flex: 1 },
  podcastName: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, letterSpacing: 0.3, marginBottom: 2 },
  episodeTitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.inkPrimary },
  dividerWrap: { alignItems: 'center', marginVertical: spacing.sm },
  // Sprint 13 #13: 极简分割线（与 ScreenHeader 一致）
  simpleDivider: {
    height: 1,
    backgroundColor: colors.paperDark,
    opacity: 0.4,
    marginVertical: spacing.md,
    marginHorizontal: spacing.xl,
  },

  processingBlock: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl },
  processingText: { fontFamily: fonts.body, fontSize: 15, color: colors.inkSecondary, textAlign: 'center' },
  progressTrack: { width: '80%', height: 6, backgroundColor: colors.paperDark, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: colors.brick, borderRadius: 3 },

  errorBlock: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xl },
  errorText: { fontFamily: fonts.body, fontSize: 15, color: colors.brick, textAlign: 'center' },
  retryBtn: { backgroundColor: colors.brick, borderRadius: radii.card, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  retryText: { fontFamily: fonts.ui, fontSize: 16, color: colors.paperCream },

  snapshotCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.lg,
    // Sprint 13 R2: 去 border 对齐首页零 border 撕纸风
    gap: spacing.md,
  },
  snapshotOneSentence: { fontFamily: fonts.body, fontSize: 18, lineHeight: 26, color: colors.inkPrimary, fontWeight: '600' },
  snapshotDivider: { height: 1.5, backgroundColor: colors.paperDark },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Sprint 14 R1 #4: 扣分理由样式
  scoreLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, width: 56 },
  scoreDots: { flexDirection: 'row', gap: 3 },
  scoreDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.paperDark },
  scoreDotFilled: { backgroundColor: colors.brick },
  scoreNum: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, width: 18 },
  audienceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  worthBlock: { marginTop: spacing.md, gap: spacing.xs },
  worthTitle: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, marginBottom: 2 },
  worthRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  worthTs: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, minWidth: 42, marginTop: 2 },
  worthText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, flex: 1, lineHeight: 19 },
  // Sprint 14 R1 #7: 学习包页与快照页 UI 统一 —— kraft 卡背景 + 彩色 dot 前缀
  snapshotSectionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  snapshotSectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  snapshotSectionDot: { width: 10, height: 10, borderRadius: 5 },
  snapshotSectionLabelText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  // Sprint 16 R1-3: worth 和 skip 用同一样式（Frank 要 UI 一致 + 去竖杠 + 值得学不用灰）
  segItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  segTs: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkPrimary,
    minWidth: 60,
    letterSpacing: 0.3,
  },
  segReasonWorth: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkPrimary,
    flex: 1,
    lineHeight: 19,
  },
  segReasonSkip: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkPrimary,
    flex: 1,
    lineHeight: 19,
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
  // Sprint 12 #14: worthListening / skippable 卡片式（撕纸风）— 保留 worthCard 供 worthListening 复用
  worthCard: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.paperCream,
    borderRadius: 10,
    marginBottom: 6,
    gap: 4,
  },
  skipCard: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.paperDark,
    borderStyle: 'dashed',
    borderRadius: 10,
    marginBottom: 6,
    gap: 4,
    opacity: 0.7,
  },
  worthTsPill: {
    alignSelf: 'flex-start',
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.inkPrimary,
    backgroundColor: colors.paperMain,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
    letterSpacing: 0.3,
  },
  worthTitleDim: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkSecondary,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    opacity: 0.6,
    marginTop: 8,
  },
  skipText: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSecondary, lineHeight: 18 },
  // Sprint 10 STORY-01002: 卡片按钮群
  cardActionsGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTrashBtn: { padding: 4, minWidth: 32, alignItems: 'center' },
  cardTrashIcon: { fontSize: 18 },
  // Sprint 10 STORY-01004: 行动 checkbox — Sprint 13 R4: actionCheckbox/Done/Checkmark 死代码删除（用 TornCheck 组件）
  actionTextCommitted: { color: colors.inkSecondary },
  // Sprint 13 R2: quiz* styles 已删（QuizPanel 已删）— R4: selfRatingBtn 去 border
  selfRatingBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, backgroundColor: colors.paperMain },
  selfRatingKnown: { backgroundColor: colors.brick, borderColor: colors.brick },
  selfRatingText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkPrimary },

  sectionTitle: { fontFamily: fonts.hero, fontSize: 24, color: colors.inkPrimary, marginTop: spacing.sm },
  mindmapBlock: { marginTop: spacing.lg },
  mindmapHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mindmapToggle: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  mindmapHint: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSecondary, lineHeight: 20, marginTop: 4 },

  // Sprint 4 STORY-00103: progress banner — Sprint 13 R4 去 border
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  // Sprint 13 R2: progressFlag emoji 已删
  progressLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.inkPrimary },
  progressNum: { fontFamily: fonts.hero, fontSize: 22, color: colors.brick },
  progressSep: { fontFamily: fonts.body, fontSize: 16, color: colors.inkSecondary },
  progressTotal: { fontFamily: fonts.hero, fontSize: 18, color: colors.inkPrimary },
  progressText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  doneChip: {
    backgroundColor: colors.yolk,
    borderRadius: radii.bubble,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginLeft: spacing.sm,
  },
  doneChipText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.brown,
    fontWeight: '600',
  },

  // Sprint 4 STORY-00103: steps wrapper with left ribbon
  // Sprint 14 R1 #10: stepsWrap/stepsRibbon 死代码删除（去竖线+去缩进）

  // Sprint 13 R2: goalStatusPill/goalStatusText 已删除 (CR-002 真删)

  stepsList: { gap: spacing.sm },

  cardsList: { gap: spacing.md },
  knowledgeCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    flexDirection: 'row',
    overflow: 'hidden',
    // Sprint 13 R1: 去 border 对齐首页零 border 原则
  },
  cardTypeBar: { width: 4 }, // Sprint 13 R1: 5→4 收敛（UI_SPEC 差异化视觉记忆点 #3 定义 4px）
  cardInner: { flex: 1, padding: spacing.md, gap: spacing.xs },
  cardTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: 4,
  },
  cardStarBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardStarIcon: {
    fontSize: 22,
    color: colors.yolk,
  },
  cardExplanation: { fontFamily: fonts.body, fontSize: 13, lineHeight: 20, color: colors.inkSecondary },
  // Sprint 12 CR-013: 新卡片 quote 一等公民
  cardQuoteBlock: {
    backgroundColor: colors.paperMain,
    borderRadius: 8,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.brick,
    position: 'relative',
  },
  cardQuoteMark: {
    fontFamily: fonts.hero,
    fontSize: 32,
    lineHeight: 20,
    color: colors.brick,
    position: 'absolute',
    top: -8,
    left: 8,
    opacity: 0.3,
  },
  cardQuote: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 14,
    lineHeight: 22,
    color: colors.inkPrimary,
    paddingLeft: spacing.md,
  },
  cardTimestamp: {
    fontFamily: fonts.ui,
    fontSize: 11,
    // Sprint 13 #18: 红色改中性灰（未来播放才是 accent 色），加 pill 背景更像"时间标签"
    color: colors.inkSecondary,
    backgroundColor: colors.paperMain,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
    marginTop: 6,
    letterSpacing: 0.4,
    alignSelf: 'flex-end',
  },
  cardType: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, opacity: 0.6 },

  actionsCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
    // Sprint 13 R2: 去 border 对齐首页零 border 撕纸风
  },
  // Sprint 14 R1 #13: actionRow flexDirection:'row'，checkbox + timeLabel + text 同一行
  actionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.xs },
  actionTimeLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.brick, minWidth: 44 },
  actionText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary, flex: 1 },
  // Sprint 13 R1 CR-017: 缺档优雅提示
  actionEmpty: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkSecondary,
    opacity: 0.6,
    flex: 1,
  },

  // Sprint 8: 完整转录折叠
  transcriptSection: {
    marginTop: spacing.lg,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    // Sprint 13 R2: 去 border 对齐首页零 border 撕纸风
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
  // Sprint 13 R1 CR-016: 摘要/完整切换按钮
  transcriptModeBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.paperMain,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  transcriptModeBtnText: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkPrimary,
    letterSpacing: 0.3,
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
  // R25 Bug#6: "值得听"段落在完整转录里高亮 (淡黄底 + 左侧色条) — 旧 pack 无 words 时的 fallback
  transcriptRowWorth: {
    backgroundColor: 'rgba(230, 180, 60, 0.14)',
    borderLeftWidth: 3,
    borderLeftColor: colors.yolk,
    paddingLeft: spacing.sm,
    borderRadius: 4,
  },
  // R55e 词级高亮: 只给命中"值得听"时间区间的字上色(黄底+主色加重), 精确到词。
  transcriptWordWorth: {
    backgroundColor: 'rgba(230, 180, 60, 0.38)',
    color: colors.inkPrimary,
    fontWeight: '600',
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
  typoBlock: {
    backgroundColor: colors.paperMain,
    borderRadius: radii.card,
    padding: spacing.sm,
    marginBottom: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.yolk,
  },
  typoTitle: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  typoRow: {
    fontFamily: fonts.body,
    fontSize: 12,
    lineHeight: 18,
    color: colors.inkPrimary,
    paddingVertical: 2,
  },
});

// ── iPad 横屏 方案A: 左大纲导读栏 + 右滚动内容 ──
const stylesWide = StyleSheet.create({
  // R55d(#7): 外层 gutter+insets 留白(对齐首页); bodyRow 限宽居中。
  bodyOuter: { flex: 1, alignItems: 'center', paddingTop: spacing.xl },
  bodyRow: { flex: 1, flexDirection: 'row', width: '100%', alignSelf: 'center' },
  rail: {
    width: ipad.rail.width, backgroundColor: colors.paperCream, paddingVertical: ipad.rail.padV, paddingHorizontal: ipad.rail.padH,
    borderRadius: ipad.card.radius, gap: spacing.xs, marginRight: ipad.grid.gap, alignSelf: 'flex-start',
  },
  railKicker: { fontFamily: fonts.ui, fontSize: ipad.rail.kickerSize, letterSpacing: 1, color: colors.inkSecondary, textTransform: 'uppercase', opacity: 0.7, marginBottom: spacing.sm },
  railItem: { paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.card },
  railItemText: { fontFamily: fonts.ui, fontSize: ipad.rail.itemSize, color: colors.inkPrimary },
  // R55f(#3): 左栏当前项高亮(砖红底白字)
  railItemActive: { backgroundColor: colors.brick },
  railItemTextActive: { color: colors.paperCream, fontWeight: '600' },
  railProgress: { marginTop: 'auto', fontFamily: fonts.body, fontSize: 12, color: colors.inkSecondary, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  // 右侧内容: 占满剩余宽, 内部 content 已限宽居中(见下)
  contentScroll: { flex: 1 },
});
