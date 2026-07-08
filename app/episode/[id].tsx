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
  AppState,
  Platform,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { ScreenHeader } from '@/components/ScreenHeader';
import { TornCheck } from '@/components/TornCheck';
import { TrashIconTorn } from '@/components/icons/TrashIconTorn';
import { PlayIconTorn } from '@/components/icons/PlayIconTorn';
import { K0Card } from '@/components/K0Card';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { TornScore } from '@/components/TornScore';
// Sprint 14 R1 #10: PathRibbon 已废弃（用 stepAccentBar 替代）
import { apiGet, apiFetch } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';
// Sprint 15 音频 demo: 点击 timestamp 从该秒开始播放
import { useAudioPlayer } from '@/lib/audioPlayer';

// Sprint 10 STORY-01004: helper — 安全拿 anonymousId（web 上也 ok）
async function getAnonymousIdSafe(): Promise<string> {
  try { return await getAnonymousId(); } catch { return 'anon'; }
}

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
// Sprint 13 R5: 补契约字段（删除 as any 兜底）
type Skippable = { start: number; end: number; reason: string };
type SuspectedTypo = { text: string; guess: string; context?: string };

interface SnapshotObject {
  oneSentence: string;
  corePoints: CorePoint[];
  audience: string[];
  valueScore: ValueScore;
  // Sprint 14 R1 #4: 价值分扣分理由
  valueScoreRationale?: { density?: string; novelty?: string; actionability?: string };
  estimatedCostMinutes: number;
  worthListening: WorthListening[];
  skippable: Skippable[];
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
  // Sprint 12 CR-013: v4 卡片新字段
  quote?: string;
  insight?: string;
  context?: string;
  // Sprint 10 STORY-01002
  archived?: boolean;
  // Sprint 10 STORY-01003
  myApplication?: string;
  personalNote?: string;
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
  // Sprint 10
  concepts?: Concept[];
  quizQuestions?: QuizQuestion[];
  committedActions?: number[];
  createdAt: string;
  // Sprint 13 R5: suspectedTypos 契约字段（删除 as any 兜底）
  suspectedTypos?: SuspectedTypo[];
}

// Sprint 10 STORY-01001
interface Concept {
  term: string;
  plain: string;
  context?: { text?: string; timestamp?: number };
  related?: string;
}

// Sprint 10 STORY-01005
interface QuizQuestion {
  type: 'mcq' | 'short';
  question: string;
  choices?: string[];
  correctIndex?: number;
  correctText?: string;
  sourceTimestamp?: number;
  explanation?: string;
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
      // Sprint 14 R1 #4: valueScoreRationale 兜底
      valueScoreRationale: raw?.valueScoreRationale ?? undefined,
      estimatedCostMinutes: raw?.estimatedCostMinutes ?? 0,
      worthListening: raw?.worthListening ?? [],
      skippable: raw?.skippable ?? [],
    },
    steps: raw?.steps ?? [],
    cards: (raw?.cards ?? []).map((c: any, i: number) => ({
      id: c.id ?? packIdNum * 1000 + i,
      type: c.type ?? 'concept',
      // Sprint 12 CR-013: v4 卡片新字段
      quote: c.quote ?? '',
      insight: c.insight ?? c.title ?? '',
      context: c.context ?? '',
      // 老字段兼容（Sprint 11 pack 读老 explanation）
      title: c.insight ?? c.title ?? '',
      explanation: c.context ?? c.core ?? c.explanation ?? '',
      sourceTimestamp: c.timestamp ?? c.sourceTimestamp ?? 0,
      starred: c.starred ?? false,
      myApplication: c.myApplication ?? c.my_application ?? '',
      personalNote: c.personalNote ?? c.personal_note ?? c.myNote ?? '',
      archived: c.archived ?? false,
    })),
    actions: raw?.actions ?? { today: '', thisWeek: '', longTerm: '' },
    // Sprint 10 STORY-01001: 概念解释器
    concepts: Array.isArray(raw?.concepts) ? raw.concepts : [],
    // Sprint 10 STORY-01005: 测验题
    quizQuestions: Array.isArray(raw?.quizQuestions) ? raw.quizQuestions : (Array.isArray(raw?.quiz) ? raw.quiz : []),
    // Sprint 10 STORY-01004: 用户已承诺的 action index 列表
    committedActions: Array.isArray(raw?.committedActions) ? raw.committedActions : [],
    createdAt: raw?.createdAt ?? new Date().toISOString(),
    // Sprint 13 R5: suspectedTypos 已进入 PackObject 契约（删 as any）
    ...(raw?.suspectedTypos ? { suspectedTypos: raw.suspectedTypos as SuspectedTypo[] } : {}),
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

function SnapshotCard({ snapshot, audioUrl, onPlay }: { snapshot: SnapshotObject; audioUrl?: string | null; onPlay?: (sec: number) => void }) {
  // Sprint 16 R7: 完全对齐快照页 UI（Frank: 学习包共有部分 = 快照页）
  const [expandedIdx, setExpandedIdx] = React.useState<number | null>(null);
  const fmtTs = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  return (
    <View testID="snapshot-card">
      {/* one-sentence 独立 paperCream 卡（快照页 line 205 style） */}
      <View style={styles.oneSentenceBlock}>
        <Text style={styles.oneSentenceText} testID="snapshot-one-sentence">
          {snapshot.oneSentence}
        </Text>
      </View>

      {/* Core points */}
      <View style={styles.corePointsBlock}>
        {snapshot.corePoints.map((cp, i) => (
          <View key={i} style={styles.corePointRow}>
            <Text style={styles.corePointBullet}>{i + 1}</Text>
            <Text style={styles.corePointText}>{cp.point}</Text>
          </View>
        ))}
      </View>

      {/* Value scores — R7: 横向进度条（不是撕纸红点），三色区分 brick/olive/yolk */}
      <View style={styles.scoresBlock}>
        {(['density', 'novelty', 'actionability'] as const).map((k) => {
          const val = snapshot.valueScore[k];
          const label = k === 'density' ? '信息密度' : k === 'novelty' ? '新鲜程度' : '可行动性';
          const barColor = k === 'density' ? colors.brick : k === 'novelty' ? colors.olive : colors.yolk;
          return (
            <View key={k}>
              <View style={styles.scoreBarRow}>
                <Text style={styles.scoreBarLabel}>{label}</Text>
                <View style={styles.scoreBarTrack}>
                  <View style={[styles.scoreBarFill, { width: `${Math.max(0, Math.min(10, val)) * 10}%`, backgroundColor: barColor }]} />
                </View>
                <Text style={styles.scoreBarNum}>{val}</Text>
              </View>
              {snapshot.valueScoreRationale?.[k] ? (
                <Text style={styles.scoreRationale}>{snapshot.valueScoreRationale[k]}</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* 学习成本独立块（快照页 costBlock）*/}
      <View style={styles.costBlock}>
        <Text style={styles.costLabel}>预估</Text>
        <Text style={styles.costMinutes}>{snapshot.estimatedCostMinutes}</Text>
        <Text style={styles.costLabel}>分钟能学完</Text>
      </View>

      {/* 适合谁学 独立卡（快照页 audienceCard）*/}
      {snapshot.audience && snapshot.audience.length > 0 ? (
        <View style={styles.audSectionCard}>
          <View style={styles.audSectionLabelRow}>
            <View style={[styles.audSectionDot, { backgroundColor: colors.yolk }]} />
            <Text style={styles.audSectionLabelText}>适合谁学</Text>
          </View>
          <View style={styles.audChipRow}>
            {snapshot.audience.slice(0, 4).map((a, i) => (
              <View key={i} style={styles.audChip}>
                <Text style={styles.audChipText}>{a}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* Sprint 16 R6: 完全复制快照页 worth/skip UI（sectionCard + wlItem 大卡可展开） */}
      {Array.isArray(snapshot.worthListening) && snapshot.worthListening.length > 0 && (
        <View style={styles.wlSectionCard}>
          <View style={styles.wlSectionLabelRow}>
            <View style={[styles.wlSectionDot, { backgroundColor: colors.olive }]} />
            <Text style={styles.wlSectionLabelText}>值得听的 {snapshot.worthListening.length} 段</Text>
          </View>
          {snapshot.worthListening.map((w: any, i: number) => {
            // 兼容 startSec / start 两种字段名（后端可能有历史遗留）
            const startSec = typeof w.startSec === 'number' ? w.startSec : (typeof w.start === 'number' ? w.start : 0);
            const endSec = typeof w.endSec === 'number' ? w.endSec : (typeof w.end === 'number' ? w.end : 0);
            return (
              <Pressable
                key={i}
                style={styles.wlItemBox}
                onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}
              >
                <View style={styles.wlHeadBox}>
                  <Pressable
                    onPress={(e) => {
                      (e as any).stopPropagation?.();
                      if (audioUrl && onPlay) onPlay(startSec);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`从 ${fmtTs(startSec)} 播放`}
                    disabled={!audioUrl}
                    hitSlop={6}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    <Text style={styles.wlTsText}>{fmtTs(startSec)} — {fmtTs(endSec)}</Text>
                    {audioUrl ? <PlayIconTorn size={12} color={colors.inkPrimary} /> : null}
                  </Pressable>
                  <Text style={styles.wlChevText}>{expandedIdx === i ? '▲' : '▼'}</Text>
                </View>
                <Text style={styles.wlReasonText}>{w?.reason || ''}</Text>
                {expandedIdx === i && (w.quoteParagraph || w.quote) ? (
                  <Text style={styles.wlQuoteText}>{w.quoteParagraph || w.quote}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {Array.isArray(snapshot.skippable) && snapshot.skippable.length > 0 && (
        <View style={styles.wlSectionCard}>
          <View style={styles.wlSectionLabelRow}>
            <View style={[styles.wlSectionDot, { backgroundColor: colors.rose }]} />
            <Text style={styles.wlSectionLabelText}>可以跳过 {snapshot.skippable.length} 段</Text>
          </View>
          {snapshot.skippable.map((s: any, i: number) => {
            const startSec = typeof s.startSec === 'number' ? s.startSec : (typeof s.start === 'number' ? s.start : 0);
            const endSec = typeof s.endSec === 'number' ? s.endSec : (typeof s.end === 'number' ? s.end : 0);
            return (
              <View key={i} style={styles.skipItemBox}>
                <Pressable
                  onPress={() => { if (audioUrl && onPlay) onPlay(startSec); }}
                  disabled={!audioUrl}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 84 }}
                >
                  <Text style={styles.skipTsText}>{fmtTs(startSec)}—{fmtTs(endSec)}</Text>
                  {audioUrl ? <PlayIconTorn size={11} color={colors.inkSecondary} /> : null}
                </Pressable>
                <Text style={styles.skipReasonText}>{s?.reason || ''}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Sprint 13 R2: QuizPanel 已删（PRD M5 测验题已弃，Sprint 11 v3 起不再渲染）

// Sprint 10 STORY-01003: 我的应用块（AI 建议 + 用户编辑）
function MyApplicationBlock({
  packId, cardIdx, myApplication, personalNote, onSave,
}: {
  packId: number; cardIdx: number; myApplication: string; personalNote: string;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(personalNote || '');
  const displayText = personalNote || myApplication;
  const label = personalNote ? '我的应用（已编辑）' : '我的应用';

  const save = async () => {
    const trimmed = text.trim();
    onSave(trimmed);
    setEditing(false);
    try {
      const aid = await getAnonymousIdSafe();
      await apiFetch(`/api/packs/${packId}/cards/${cardIdx}?anonymousId=${encodeURIComponent(aid)}`, {
        method: 'PATCH',
        body: JSON.stringify({ personalNote: trimmed, anonymousId: aid }),
      });
    } catch {
      // silent fail; UI 已乐观更新
    }
  };

  if (editing) {
    return (
      <View style={styles.myAppBlock}>
        <Text style={styles.myAppLabel}>{label}</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          style={styles.myAppInput}
          placeholder="写下这张卡片对你的意义…"
          onBlur={save}
          autoFocus
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <Pressable onPress={save} style={styles.myAppBtn}>
            <Text style={styles.myAppBtnText}>保存</Text>
          </Pressable>
          <Pressable onPress={() => { setText(personalNote || ''); setEditing(false); }} style={styles.myAppBtnSecondary}>
            <Text style={styles.myAppBtnSecondaryText}>取消</Text>
          </Pressable>
        </View>
      </View>
    );
  }
  return (
    <Pressable onPress={() => setEditing(true)} style={styles.myAppBlock} accessibilityLabel="编辑我的应用">
      <Text style={styles.myAppLabel}>{label}</Text>
      <Text style={styles.myAppText}>{displayText || '点击写下这张卡片对你的意义…'}</Text>
    </Pressable>
  );
}

// Sprint 10 STORY-01001: 概念解释器面板
// Sprint 14 R1 #8/#9: 移除折叠展开，plain/context/related 全部默认显示（第一层无箭头，第二层无 +/-）
function ConceptsPanel({ concepts, audioUrl, onPlay }: { concepts: Concept[]; audioUrl?: string | null; onPlay?: (sec: number) => void }) {
  const fmtTs = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
  return (
    <View style={styles.conceptsBlock}>
      <Text style={styles.sectionTitle}>关键概念 · {concepts.length}</Text>
      <View style={styles.conceptsList}>
        {concepts.map((c, i) => (
          <View key={i} style={styles.conceptItem}>
            <Text style={styles.conceptTerm}>{c.term}</Text>
            <View style={styles.conceptDetail}>
              <Text style={styles.conceptLabel}>小白解释</Text>
              <Text style={styles.conceptText}>{c.plain}</Text>
              {c.context?.text ? (
                <>
                  <Text style={styles.conceptLabel}>原文语境</Text>
                  {/* Sprint 16 R7: 原文语境时间戳可点播放 */}
                  {c.context.timestamp && c.context.timestamp > 0 ? (
                    <Pressable
                      onPress={() => { if (audioUrl && onPlay) onPlay(c.context!.timestamp!); }}
                      disabled={!audioUrl}
                      hitSlop={4}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
                    >
                      <Text style={[styles.conceptText, audioUrl ? { color: colors.inkPrimary, fontWeight: '600' as const } : null]}>
                        [{fmtTs(c.context.timestamp)}]
                      </Text>
                      {audioUrl ? <PlayIconTorn size={11} color={colors.inkPrimary} /> : null}
                      <Text style={styles.conceptText}> 「{c.context.text}」</Text>
                    </Pressable>
                  ) : (
                    <Text style={styles.conceptText}>「{c.context.text}」</Text>
                  )}
                </>
              ) : null}
              {c.related ? (
                <>
                  <Text style={styles.conceptLabel}>延伸理解</Text>
                  <Text style={styles.conceptText}>{c.related}</Text>
                </>
              ) : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// Sprint 14 R1 #10: 加 stepIndex 用于左侧彩色条（brick/yolk/olive/rose/brown/inkSecondary 6 色轮换）
const STEP_ACCENT_COLORS = [colors.brick, colors.yolk, colors.olive, colors.rose, colors.brown, colors.inkSecondary];
function StepRow({ step, stepIndex, onToggle }: { step: LearningStep; stepIndex: number; onToggle: () => void }) {
  const accent = STEP_ACCENT_COLORS[stepIndex % STEP_ACCENT_COLORS.length];
  // Sprint 14 R1 #10: 左侧 4px 彩色条,长度=卡片自身高度自动匹配文本
  return (
    <Pressable
      style={[styles.stepCard, step.completed && styles.stepCardDone]}
      testID={`step-${step.stepNumber}`}
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={step.completed ? '标为未完成' : '标为已完成'}
    >
      <View style={[styles.stepAccentBar, { backgroundColor: accent }]} />
      <View style={styles.stepInner}>
        <View style={styles.stepHeader}>
          <TornCheck size={20} checked={step.completed} />
          <Text style={styles.stepNum}>{step.stepNumber}</Text>
          <Text style={[styles.stepTitle, step.completed && styles.stepTitleDone]}>
            {step.title}
          </Text>
        </View>
        <View style={styles.stepBody}>
          <Text style={styles.stepContent}>{step.content}</Text>
          {step.citations.length > 0 ? (
            step.citations.map((c, i) => {
              if (!c.text && typeof c.timestamp === 'number') {
                const mm = String(Math.floor(c.timestamp / 60)).padStart(2, '0');
                const ss = String(c.timestamp % 60).padStart(2, '0');
                return (
                  <Text key={i} style={styles.stepCitation}>
                    音频 {mm}:{ss} 附近
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
      </View>
    </Pressable>
  );
}

function _StepRowOldExpanded({ step, onToggle }: { step: LearningStep; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={[styles.stepCard, step.completed && styles.stepCardDone]} testID={`step-old-${step.stepNumber}`}>
      <Pressable
        style={styles.stepHeader}
        onPress={() => setExpanded(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={`步骤 ${step.stepNumber}：${step.title}`}
      >
        <Pressable
          onPress={onToggle}
          accessibilityRole="checkbox"
          accessibilityLabel={step.completed ? '标为未完成' : '标为已完成'}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <TornCheck size={20} checked={step.completed} />
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
              if (!c.text && typeof c.timestamp === 'number') {
                const mm = String(Math.floor(c.timestamp / 60)).padStart(2, '0');
                const ss = String(c.timestamp % 60).padStart(2, '0');
                return (
                  <Text key={i} style={styles.stepCitation}>
                    音频 {mm}:{ss} 附近
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
  // Sprint 15 音频 demo
  const audioPlayer = useAudioPlayer();

  // Sprint 16 R18: 离开页面（任何跳转 button / back / 系统手势）自动停音频
  useFocusEffect(
    useCallback(() => {
      return () => { try { audioPlayer.stop(); } catch {} };
    }, [audioPlayer])
  );

  // Sprint 16 R8: 音频停止改由 AudioPlayerBar 监听 pathname 变化统一处理

  const { id, goal, jobId: initialJobId, packId: initialPackId, direct, mode } = useLocalSearchParams<{
    id: string; goal: string; jobId?: string; packId?: string; direct?: string; mode?: string;
  }>();
  const episodeId = Number(id);
  // Sprint 11 v3: mode 决定学习深度 quick|deep（默认 deep 兼容老链接）
  const learningMode: 'quick' | 'deep' = mode === 'quick' ? 'quick' : 'deep';
  const [upgrading, setUpgrading] = useState(false);
  // Sprint 13 #17: ConfirmDialog state for card delete
  const [deleteConfirmCard, setDeleteConfirmCard] = useState<null | { realIdx: number; doDelete: () => Promise<void> | void }>(null);

  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('processing');
  const [progress, setProgress] = useState(0);
  const [pack, setPack] = useState<PackObject | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null);
  const [podcastName, setPodcastName] = useState<string | null>(null);
  const [episodeCover, setEpisodeCover] = useState<string | null>(null);
  // Sprint 15 音频 demo: 从 /api/packs/:id 拉到的原始播客音频 URL
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<LearningStep[]>([]);
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

  // Sprint 7: 直接 packId 模式 — Sprint 6 v2 pack shape 是扁平的（oneSentence/corePoints/valueScore 顶层）
  // 前端 UI 期望 nested snapshot 结构，此处通过 reshapePack 适配
  // Sprint 9 STORY-00901: 抽成 fetch 函数供首次挂载 + AppState 激活复用
  const fetchDirectPack = useCallback(() => {
    if (initialJobId || !id || isNaN(Number(id))) return;
    // Sprint 16 R7: 必须带 anonymousId 让 backend 关联到正确用户（读 completed / archived / mode）
    (async () => {
      let aid = '';
      try { aid = await getAnonymousIdSafe(); } catch {}
      const q = aid ? `?anonymousId=${encodeURIComponent(aid)}` : '';
      apiGet<{ pack: PackObject } | any>(`/api/packs/${id}${q}`)
      .then((res) => {
        const raw = res.pack || res;
        if (!raw) return;
        const packIdNum = Number(id);
        const reshaped = reshapePack(raw, packIdNum, String(goal || ''));
        setPack(reshaped);
        // Sprint 8: 保存 episode 元数据
        if (res.episodeTitle) setEpisodeTitle(res.episodeTitle);
        if (res.podcastName) setPodcastName(res.podcastName);
        if (res.episodeCover) setEpisodeCover(res.episodeCover);
        // Sprint 15 音频 demo: 抓 audioUrl
        if (res.audioUrl) setAudioUrl(res.audioUrl);
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
        // Sprint 10 STORY-01004: 拉本 pack 已承诺的 actions
        (async () => {
          try {
            const anonymousId = await getAnonymousIdSafe();
            const r = await apiGet<{ pending: any[]; done: any[] }>(`/api/review/actions?anonymousId=${encodeURIComponent(anonymousId)}`);
            const packActions = [...(r.pending || []), ...(r.done || [])].filter(a => a.pack_id === packIdNum);
            const committed = packActions.map(a => a.action_index);
            setPack(prev => prev ? { ...prev, committedActions: committed } : prev);
          } catch {}
        })();
      })
      .catch((err) => {
        if (!goal) {
          setError(err?.message || '找不到学习包');
          setJobStatus('failed');
        }
      });
    })();
  }, [id, initialJobId, goal]);

  useEffect(() => {
    fetchDirectPack();
    // Sprint 9 STORY-00901: 从后台回来时刷新 pack（例如刚完成 step、切走再回来，state 可能过期）
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        fetchDirectPack();
      }
    });
    return () => subscription.remove();
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

    (async () => {
      const aid = await getAnonymousIdSafe();
      apiFetch<{ jobId: string; status: string }>(`/api/episodes/${episodeId}/generate?anonymousId=${encodeURIComponent(aid)}`, {
        method: 'POST',
        body: JSON.stringify({ goal, anonymousId: aid }),
      })
        .then((res) => {
          setJobId(res.jobId);
        })
        .catch((err) => {
          setError(err.message || '生成失败，稍后重试');
          setJobStatus('failed');
        });
    })();

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
        .then(async (res) => {
          setProgress(res.progress);
          Animated.timing(progressAnim, {
            toValue: res.progress / 100,
            duration: 400,
            useNativeDriver: false,
          }).start();

          if (res.status === 'ready' && res.packId) {
            setJobStatus('ready');
            const aid = await getAnonymousIdSafe();
            return apiGet<{ pack: PackObject }>(`/api/packs/${res.packId}?anonymousId=${encodeURIComponent(aid)}`);
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

    // Sprint 14 R1 #18: 传 anonymousId 让 backend 关联到正确用户（此前 backend 用 req.user.id 匿名用户丢失）
    (async () => {
      const anonymousId = await getAnonymousIdSafe();
      apiFetch<{ step: LearningStep }>(`/api/steps/${step.id}?anonymousId=${encodeURIComponent(anonymousId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed: newCompleted, anonymousId }),
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
    })();
  }

  const completedCount = steps.filter((s) => s.completed).length;

  return (
    <View style={styles.root}>
      {/* Sprint 16 R14: ScreenHeader 从 ScrollView 内提出到常驻顶栏 —
          修 Frank 反馈"往下拉没返回按钮 + 两个返回叠顶部"（滚动 sticky 视觉重叠） */}
      <ScreenHeader
        title="学习包"
        subtitle={episodeTitle || undefined}
        onBack={() => {
          try { audioPlayer.stop(); } catch {}
          if (router.canGoBack()) router.back(); else router.replace('/');
        }}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        testID="episode-scroll"
      >

      {/* Sprint 14 R2 fix #1: 下方内容独立 padding，避免与 ScreenHeader 内部 padding 双重缩进 */}
      <View style={styles.innerContent}>

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
          <SnapshotCard
            snapshot={pack.snapshot}
            audioUrl={audioUrl}
            onPlay={(sec) => { if (audioUrl) audioPlayer.play(audioUrl, sec); }}
          />

          {/* Sprint 14 R1 #16: quick 模式只显示卡片+精华，隐藏 concepts/steps/actions */}
          {learningMode === 'deep' && Array.isArray(pack.concepts) && pack.concepts.length > 0 && (
            <ConceptsPanel
              concepts={pack.concepts}
              audioUrl={audioUrl}
              onPlay={(sec) => { if (audioUrl) audioPlayer.play(audioUrl, sec); }}
            />
          )}

          {learningMode === 'deep' && (
            <>
              <Text style={styles.sectionTitle}>学习路径</Text>
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
              <Text style={styles.sectionTitle}>知识卡片</Text>
              <CardsCarousel
                pack={pack}
                setPack={setPack}
                audioUrl={audioUrl}
                audioPlayer={audioPlayer}
                podcastName={podcastName}
                setDeleteConfirmCard={setDeleteConfirmCard}
              />
            </>
          ) : null}

          {/* Actions — Sprint 14 R1 #16: quick 模式隐藏行动计划 */}
          {learningMode === 'deep' && pack.actions ? (
            <>
              <Text style={styles.sectionTitle}>行动计划</Text>
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
                            const anonymousId = await getAnonymousIdSafe();
                            if (wasCommitted) {
                              await apiFetch('/api/review/actions/uncommit', {
                                method: 'POST',
                                body: JSON.stringify({ anonymousId, packId: pack.id, actionIndex: actionIdx }),
                              });
                            } else {
                              await apiFetch('/api/review/actions/commit', {
                                method: 'POST',
                                body: JSON.stringify({
                                  anonymousId,
                                  packId: pack.id,
                                  actionIndex: actionIdx,
                                  actionText,
                                  timeframe,
                                }),
                              });
                            }
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
                      const mm = String(Math.floor(seg.start / 60)).padStart(2, '0');
                    const ss = String(Math.floor(seg.start % 60)).padStart(2, '0');
                    return (
                      <View key={i} style={styles.transcriptRow}>
                        {/* Sprint 16 R7: 段落时间戳可点播放 */}
                        <Pressable
                          onPress={() => { if (audioUrl) audioPlayer.play(audioUrl, seg.start); }}
                          disabled={!audioUrl}
                          hitSlop={4}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                        >
                          <Text style={styles.transcriptTime}>{mm}:{ss}</Text>
                          {audioUrl ? <PlayIconTorn size={10} color={colors.inkSecondary} /> : null}
                        </Pressable>
                        <Text style={styles.transcriptText}>{seg.text}</Text>
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
                    const aid = await getAnonymousId();
                    // Sprint 11 v16: 走 job pattern，跳等待屏
                    const res = await apiFetch<{ ok: boolean; jobId?: string }>(`/api/packs/${id}/generate`, {
                      method: 'POST',
                      body: JSON.stringify({ mode: 'deep', anonymousId: aid }),
                    });
                    if (res.jobId) {
                      try {
                        await AsyncStorage.setItem('k0.pendingJob', JSON.stringify({
                          jobId: res.jobId,
                          url: `pack:${id}:deep`,
                          packId: Number(id),
                          mode: 'deep',
                          savedAt: Date.now(),
                          targetType: 'pack-generate',
                        }));
                      } catch {}
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
  );
}

// Sprint 16 R1-5: 学习包卡片 Carousel — 左右滑（4B）+ 下张露角（5A）+ 页码点（5B）
// 用 RN 内置 ScrollView pagingEnabled + snapToInterval，纯 JS/OTA 可上，不新加依赖
function CardsCarousel({
  pack,
  setPack,
  audioUrl,
  audioPlayer,
  podcastName,
  setDeleteConfirmCard,
}: {
  pack: any;
  setPack: React.Dispatch<React.SetStateAction<any>>;
  audioUrl: string | null;
  audioPlayer: any;
  podcastName: string | null;
  setDeleteConfirmCard: React.Dispatch<React.SetStateAction<any>>;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const visibleCards = pack.cards.filter((c: any) => !c.archived);

  // 卡片宽度 = 容器 - 右边露出 24px 的下张卡片角
  const PEEK = 24;
  const CARD_GAP = 12;
  const cardWidth = containerWidth > 0 ? containerWidth - PEEK : 0;
  const snapInterval = cardWidth + CARD_GAP;

  const onScroll = useCallback((e: any) => {
    if (snapInterval <= 0) return;
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / snapInterval);
    if (idx !== activeIdx && idx >= 0 && idx < visibleCards.length) {
      setActiveIdx(idx);
    }
  }, [snapInterval, activeIdx, visibleCards.length]);

  const onLayout = useCallback((e: any) => {
    setContainerWidth(e.nativeEvent.layout.width);
  }, []);

  return (
    <View onLayout={onLayout} testID="cards-list">
      {containerWidth > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={snapInterval}
          snapToAlignment="start"
          decelerationRate="fast"
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingRight: PEEK }}
        >
          {visibleCards.map((card: any, i: number) => {
            // Sprint 16 R16: 用 backend 返回的稳定 cardIndex（原始 pack_json 下标），
            // 而不是 findIndex（那是过滤后数组下标，会导致 DELETE 打错行）
            const realIdx = typeof card.cardIndex === 'number'
              ? card.cardIndex
              : pack.cards.findIndex((c: any) => c.id === card.id); // fallback: 老 backend
            const toggleStar = async () => {
              const newStarred = !card.starred;
              setPack((prev: any) => {
                if (!prev) return prev;
                const newCards = [...prev.cards];
                // Sprint 16 R18: 用 cardIndex 匹配原始下标（realIdx），
                // 避免 newCards[realIdx] 越界写（realIdx 可能大于数组长度）
                const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                if (targetIdx < 0) return prev;
                newCards[targetIdx] = { ...newCards[targetIdx], starred: newStarred };
                return { ...prev, cards: newCards };
              });
              try {
                const aid = await getAnonymousIdSafe();
                await apiFetch(`/api/packs/${pack.id}/cards/${realIdx}?anonymousId=${encodeURIComponent(aid)}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ starred: newStarred, anonymousId: aid }),
                });
              } catch {
                setPack((prev: any) => {
                  if (!prev) return prev;
                  const newCards = [...prev.cards];
                  const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                  if (targetIdx < 0) return prev;
                  newCards[targetIdx] = { ...newCards[targetIdx], starred: !newStarred };
                  return { ...prev, cards: newCards };
                });
              }
            };
            const askDelete = () => {
              const doDelete = async () => {
                // Sprint 16 R18: 乐观更新用过滤后的数组下标 i（visibleCards 位置），
                // backend DELETE 用 realIdx（原始 pack_json 下标）。
                // 之前把 realIdx 直接当数组下标写入 newCards[realIdx] 会越界，
                // 用户看到"删了倒数第二张但退出再进变成另一张"就是这个错位。
                setPack((prev: any) => {
                  if (!prev) return prev;
                  const newCards = [...prev.cards];
                  // 用 cardIndex 精确匹配原始下标（backend 已把 archived 排除，
                  // 这里再打 archived 标记，让下次 visibleCards filter 立刻生效）
                  const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                  if (targetIdx < 0) return prev;
                  newCards[targetIdx] = { ...newCards[targetIdx], archived: true };
                  return { ...prev, cards: newCards };
                });
                try {
                  const aid = await getAnonymousIdSafe();
                  // Sprint 16 R13: 用 DELETE 端点（archived + 语义明确）
                  await apiFetch(`/api/packs/${pack.id}/cards/${realIdx}?anonymousId=${encodeURIComponent(aid)}`, {
                    method: 'DELETE',
                    body: JSON.stringify({ anonymousId: aid }),
                  });
                } catch {
                  setPack((prev: any) => {
                    if (!prev) return prev;
                    const newCards = [...prev.cards];
                    const targetIdx = newCards.findIndex((c: any) => c.cardIndex === realIdx);
                    if (targetIdx < 0) return prev;
                    newCards[targetIdx] = { ...newCards[targetIdx], archived: false };
                    return { ...prev, cards: newCards };
                  });
                }
              };
              if (Platform.OS === 'web') {
                if (typeof window !== 'undefined' && window.confirm && window.confirm('删除这张卡片？')) {
                  doDelete();
                }
              } else {
                setDeleteConfirmCard({ realIdx, doDelete });
              }
            };
            return (
              <View
                key={card.id ?? i}
                style={{ width: cardWidth, marginRight: CARD_GAP }}
                testID={`card-${card.type}`}
              >
                <K0Card
                  card={{
                    quote: card.quote,
                    insight: card.insight || card.title,
                    context: card.context || card.explanation,
                    timestamp: card.sourceTimestamp,
                    type: card.type,
                    starred: card.starred,
                    podcastName: podcastName || undefined,
                  }}
                  variant="episode"
                  flippable
                  onStar={toggleStar}
                  onDelete={askDelete}
                  onTimestampPress={() => {
                    if (audioUrl && card.sourceTimestamp > 0) {
                      audioPlayer.play(audioUrl, card.sourceTimestamp);
                    }
                  }}
                />
                {(card.myApplication || card.personalNote) ? (
                  <MyApplicationBlock
                    packId={pack.id}
                    cardIdx={realIdx}
                    myApplication={card.myApplication || ''}
                    personalNote={card.personalNote || ''}
                    onSave={(newNote) => {
                      setPack((prev: any) => {
                        if (!prev) return prev;
                        const newCards = [...prev.cards];
                        if (realIdx < 0) return prev;
                        newCards[realIdx] = { ...newCards[realIdx], personalNote: newNote };
                        return { ...prev, cards: newCards };
                      });
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {/* 底部页码点（Frank 5B） */}
      {visibleCards.length > 1 ? (
        <View style={carouselStyles.dotsRow}>
          {visibleCards.map((_: any, i: number) => (
            <View
              key={i}
              style={[
                carouselStyles.dot,
                i === activeIdx && carouselStyles.dotActive,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const carouselStyles = StyleSheet.create({
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.paperDark,
    opacity: 0.5,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.brick,
    opacity: 1,
  },
});

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
  corePointsBlock: { gap: spacing.sm },
  corePointRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  corePointBullet: { fontFamily: fonts.ui, fontSize: 13, color: colors.brick, width: 18, textAlign: 'center', marginTop: 2 },
  corePointText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.inkPrimary, flex: 1 },
  scoresBlock: { gap: spacing.sm },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Sprint 14 R1 #4: 扣分理由样式
  scoreRationale: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 11, color: colors.inkSecondary, opacity: 0.85, marginTop: 4, marginLeft: 8, lineHeight: 15 },
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
  // Sprint 10 STORY-01001: 概念解释器
  conceptsBlock: { marginTop: spacing.lg, backgroundColor: colors.paperCream, borderRadius: radii.card, padding: spacing.md },
  conceptsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conceptsChevron: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  conceptsList: { marginTop: spacing.sm, gap: spacing.xs },
  conceptItem: { borderTopWidth: 1, borderTopColor: colors.paperDark, paddingTop: spacing.sm },
  conceptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  conceptTerm: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  conceptToggle: { fontFamily: fonts.ui, fontSize: 20, color: colors.inkSecondary, minWidth: 24, textAlign: 'right' },
  conceptDetail: { marginTop: spacing.xs, gap: 4 },
  conceptLabel: { fontFamily: fonts.ui, fontSize: 10, color: colors.inkSecondary, letterSpacing: 0.6, marginTop: 6, textTransform: 'uppercase', opacity: 0.7 },
  // Sprint 16 R7: 对齐快照页样式
  oneSentenceBlock: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  oneSentenceText: {
    fontFamily: fonts.hero,
    fontSize: 22,
    lineHeight: 30,
    color: colors.inkPrimary,
    letterSpacing: -0.3,
  },
  scoreBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  scoreBarLabel: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkPrimary,
    width: 72,
  },
  scoreBarTrack: {
    flex: 1,
    height: 6,
    backgroundColor: colors.paperDark,
    borderRadius: 3,
    overflow: 'hidden',
    opacity: 0.4,
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  scoreBarNum: {
    fontFamily: fonts.hero,
    fontSize: 15,
    color: colors.inkPrimary,
    minWidth: 20,
    textAlign: 'right',
  },
  costBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  costLabel: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkSecondary,
  },
  costMinutes: {
    fontFamily: fonts.hero,
    fontSize: 28,
    color: colors.brick,
    letterSpacing: -0.3,
  },
  audSectionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  audSectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  audSectionDot: { width: 10, height: 10, borderRadius: 5 },
  audSectionLabelText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  audChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  audChip: {
    backgroundColor: colors.paperMain,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  audChipText: {
    fontFamily: fonts.ui,
    fontSize: 12,
    color: colors.inkPrimary,
  },
  // Sprint 16 R6 (R7 保留): worth/skip 完全复制快照页 UI
  wlSectionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  wlSectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  wlSectionDot: { width: 10, height: 10, borderRadius: 5 },
  wlSectionLabelText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  wlItemBox: {
    backgroundColor: colors.paperMain,
    borderRadius: 10,
    padding: spacing.sm,
    marginBottom: 4,
    gap: 4,
  },
  wlHeadBox: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wlTsText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  wlChevText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  wlReasonText: { fontFamily: fonts.body, fontSize: 14, color: colors.inkPrimary, lineHeight: 20 },
  wlQuoteText: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  skipItemBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  skipTsText: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, minWidth: 84, letterSpacing: 0.3 },
  skipReasonText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkPrimary,
    flex: 1,
    lineHeight: 19,
    textDecorationLine: 'line-through',
    opacity: 0.55,
  },
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
  conceptText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 20 },
  // Sprint 10 STORY-01002: 卡片按钮群
  cardActionsGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTrashBtn: { padding: 4, minWidth: 32, alignItems: 'center' },
  cardTrashIcon: { fontSize: 18 },
  // Sprint 10 STORY-01003: 我的应用 — Sprint 13 R4: 全部去 border 用 backgroundColor 分层
  myAppBlock: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.paperMain, borderRadius: 8 },
  myAppLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3, marginBottom: 4 },
  myAppText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19 },
  myAppInput: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19, minHeight: 60, borderRadius: 6, padding: spacing.xs, backgroundColor: colors.paperCream },
  myAppBtn: { backgroundColor: colors.brick, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6 },
  myAppBtnText: { color: colors.paperCream, fontFamily: fonts.ui, fontSize: 12 },
  myAppBtnSecondary: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6, backgroundColor: colors.paperCream },
  myAppBtnSecondaryText: { color: colors.inkSecondary, fontFamily: fonts.ui, fontSize: 12 },
  // Sprint 10 STORY-01004: 行动 checkbox — Sprint 13 R4: actionCheckbox/Done/Checkmark 死代码删除（用 TornCheck 组件）
  actionTextCommitted: { color: colors.inkSecondary },
  // Sprint 13 R2: quiz* styles 已删（QuizPanel 已删）— R4: selfRatingBtn 去 border
  selfRatingBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, backgroundColor: colors.paperMain },
  selfRatingKnown: { backgroundColor: colors.brick, borderColor: colors.brick },
  selfRatingText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkPrimary },

  sectionTitle: { fontFamily: fonts.hero, fontSize: 24, color: colors.inkPrimary, marginTop: spacing.sm },

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
  stepCard: {
    flexDirection: 'row',
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    overflow: 'hidden',
    // Sprint 14 R1 #10: alignItems:'stretch' 让左侧 stepAccentBar 高度自动匹配卡片文本长度
    alignItems: 'stretch',
  },
  // Sprint 14 R1 #10: 4px 左侧彩色条替代 PathRibbon 竖线
  stepAccentBar: { width: 4 },
  stepInner: { flex: 1 },
  stepCardDone: { opacity: 0.75 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, gap: spacing.sm, minHeight: 56 },
  // Sprint 13 R4: stepCheckbox/Done/Checkmark 死代码删除（用 TornCheck 组件）
  stepNum: { fontFamily: fonts.ui, fontSize: 14, color: colors.brick, width: 18, textAlign: 'center' },
  stepTitle: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  stepTitleDone: { color: colors.inkSecondary, textDecorationLine: 'line-through' },
  stepChevron: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  // Sprint 12 #15: stepBody padding 对齐 stepHeader，避免右缩进和知识卡片视觉不一致
  stepBody: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  stepContent: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.inkPrimary },
  stepCitation: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 13, lineHeight: 20, color: colors.inkSecondary, paddingLeft: spacing.sm, borderLeftWidth: 2, borderLeftColor: colors.paperDark },

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
