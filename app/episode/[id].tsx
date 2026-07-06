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
  Image,
  AppState,
  Platform,
  TextInput,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, spacing, radii } from '@/constants/theme';
import { BubbleTag } from '@/components/BubbleTag';
import { WovenDivider } from '@/components/WovenDivider';
import { TornScore } from '@/components/TornScore';
import { PathRibbon } from '@/components/PathRibbon';
import { apiGet, apiFetch } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';

// Sprint 10 STORY-01004: helper — 安全拿 anonymousId（web 上也 ok）
async function getAnonymousIdSafe(): Promise<string> {
  try { return await getAnonymousId(); } catch { return 'anon'; }
}

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
      // Sprint 10 STORY-01003: AI 生成的"我的应用"建议
      myApplication: c.myApplication ?? c.my_application ?? '',
      // Sprint 10 STORY-01003: 用户覆盖的个人笔记
      personalNote: c.personalNote ?? c.personal_note ?? '',
      // Sprint 10 STORY-01002: archived 标记
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
    // Sprint 8: 保留 suspectedTypos 到 reshape 结果（type union 松散）
    ...(raw?.suspectedTypos ? { suspectedTypos: raw.suspectedTypos } as any : {}),
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

      {/* Sprint 10 STORY-01007: worthListening / skippable */}
      {Array.isArray(snapshot.worthListening) && snapshot.worthListening.length > 0 && (
        <View style={styles.worthBlock}>
          <Text style={styles.worthTitle}>⭐ 最值得学的片段</Text>
          {snapshot.worthListening.slice(0, 3).map((w: any, i) => (
            <View key={i} style={styles.worthRow}>
              {typeof w?.start === 'number' && w.start > 0 ? (
                <Text style={styles.worthTs}>{Math.floor(w.start / 60)}:{String(Math.floor(w.start % 60)).padStart(2, '0')}</Text>
              ) : (
                <Text style={styles.worthTs}>·</Text>
              )}
              <Text style={styles.worthText}>{w?.reason || w?.text || ''}</Text>
            </View>
          ))}
        </View>
      )}

      {Array.isArray(snapshot.skippable) && snapshot.skippable.length > 0 && (
        <View style={styles.worthBlock}>
          <Text style={styles.worthTitle}>⏩ 可以跳过</Text>
          {(snapshot.skippable as any[]).slice(0, 3).map((s: any, i) => (
            <View key={i} style={styles.worthRow}>
              {typeof s?.start === 'number' && s.start > 0 ? (
                <Text style={styles.worthTs}>{Math.floor(s.start / 60)}:{String(Math.floor(s.start % 60)).padStart(2, '0')}</Text>
              ) : (
                <Text style={styles.worthTs}>·</Text>
              )}
              <Text style={styles.worthText}>{s?.reason || s?.text || ''}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Sprint 10 STORY-01005: 测验题面板
function QuizPanel({ questions }: { questions: QuizQuestion[] }) {
  const [expanded, setExpanded] = useState(false);
  const [answers, setAnswers] = useState<Record<number, { selectedIndex?: number; shortText?: string; revealed: boolean; selfRating?: 'known' | 'partial' | 'forgot' }>>({});
  const answered = Object.values(answers).filter(a => a?.revealed).length;
  const correct = Object.entries(answers).filter(([idx, a]) => {
    if (!a?.revealed) return false;
    const q = questions[Number(idx)];
    if (q?.type === 'mcq') return a.selectedIndex === q.correctIndex;
    return a.selfRating === 'known';
  }).length;

  const answerMcq = (qIdx: number, choiceIdx: number) => {
    setAnswers(prev => ({ ...prev, [qIdx]: { selectedIndex: choiceIdx, revealed: true } }));
  };
  const answerShort = (qIdx: number, rating: 'known' | 'partial' | 'forgot') => {
    setAnswers(prev => ({ ...prev, [qIdx]: { ...(prev[qIdx] || { shortText: '' }), revealed: true, selfRating: rating } }));
  };

  return (
    <View style={styles.quizBlock}>
      <Pressable
        style={styles.quizHeader}
        onPress={() => setExpanded(v => !v)}
        accessibilityLabel={expanded ? '收起测验' : '展开测验'}
      >
        <Text style={styles.sectionTitle}>测验一下</Text>
        <Text style={styles.quizChevron}>{expanded ? '▲' : '▼'} {answered}/{questions.length}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.quizList}>
          {questions.map((q, i) => {
            const a = answers[i];
            const revealed = !!a?.revealed;
            const isCorrect = q.type === 'mcq' && a?.selectedIndex === q.correctIndex;
            return (
              <View key={i} style={styles.quizItem}>
                <Text style={styles.quizQ}>Q{i + 1}. {q.question}</Text>
                {q.type === 'mcq' && Array.isArray(q.choices) ? (
                  <View style={styles.quizChoices}>
                    {q.choices.map((c, ci) => {
                      const selected = a?.selectedIndex === ci;
                      const showAsCorrect = revealed && ci === q.correctIndex;
                      const showAsWrong = revealed && selected && ci !== q.correctIndex;
                      return (
                        <Pressable
                          key={ci}
                          onPress={() => !revealed && answerMcq(i, ci)}
                          style={[
                            styles.quizChoice,
                            selected && styles.quizChoiceSelected,
                            showAsCorrect && styles.quizChoiceCorrect,
                            showAsWrong && styles.quizChoiceWrong,
                          ]}
                          accessibilityLabel={`选项 ${String.fromCharCode(65 + ci)}: ${c}`}
                          disabled={revealed}
                        >
                          <Text style={styles.quizChoiceLetter}>{String.fromCharCode(65 + ci)}.</Text>
                          <Text style={styles.quizChoiceText}>{c}</Text>
                          {revealed && ci === q.correctIndex ? <Text style={styles.quizCheck}>✓</Text> : null}
                        </Pressable>
                      );
                    })}
                    {revealed && q.explanation ? (
                      <Text style={[styles.quizExplain, isCorrect ? styles.quizExplainCorrect : styles.quizExplainWrong]}>
                        {isCorrect ? '✓ ' : '✗ '}{q.explanation}
                      </Text>
                    ) : null}
                  </View>
                ) : (
                  <View>
                    <TextInput
                      value={a?.shortText || ''}
                      onChangeText={(t) => setAnswers(prev => ({ ...prev, [i]: { ...(prev[i] || {}), shortText: t, revealed: false } }))}
                      multiline
                      style={styles.quizShortInput}
                      placeholder="写下你的答案…"
                      editable={!revealed}
                    />
                    {revealed ? (
                      <View style={styles.quizAnswerBox}>
                        <Text style={styles.quizAnswerLabel}>参考答案</Text>
                        <Text style={styles.quizAnswerText}>{q.correctText}</Text>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                        <Pressable onPress={() => answerShort(i, 'forgot')} style={styles.selfRatingBtn}>
                          <Text style={styles.selfRatingText}>不记得</Text>
                        </Pressable>
                        <Pressable onPress={() => answerShort(i, 'partial')} style={styles.selfRatingBtn}>
                          <Text style={styles.selfRatingText}>模糊</Text>
                        </Pressable>
                        <Pressable onPress={() => answerShort(i, 'known')} style={[styles.selfRatingBtn, styles.selfRatingKnown]}>
                          <Text style={[styles.selfRatingText, { color: colors.paperCream }]}>记得</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          {answered === questions.length && (
            <View style={styles.quizScoreBox}>
              <Text style={styles.quizScoreText}>本次测验：{correct} / {questions.length} 正确</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

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
  const label = personalNote ? '💡 我的应用（已编辑）' : '💡 我的应用';

  const save = async () => {
    const trimmed = text.trim();
    onSave(trimmed);
    setEditing(false);
    try {
      await apiFetch(`/api/packs/${packId}/cards/${cardIdx}`, {
        method: 'PATCH',
        body: JSON.stringify({ personalNote: trimmed }),
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
function ConceptsPanel({ concepts }: { concepts: Concept[] }) {
  const [expanded, setExpanded] = useState(false);
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  return (
    <View style={styles.conceptsBlock}>
      <Pressable
        style={styles.conceptsHeader}
        onPress={() => setExpanded(v => !v)}
        accessibilityLabel={expanded ? '收起关键概念' : '展开关键概念'}
      >
        <Text style={styles.sectionTitle}>关键概念</Text>
        <Text style={styles.conceptsChevron}>{expanded ? '▲' : '▼'} {concepts.length}</Text>
      </Pressable>
      {expanded && (
        <View style={styles.conceptsList}>
          {concepts.map((c, i) => (
            <View key={i} style={styles.conceptItem}>
              <Pressable
                onPress={() => setOpenIdx(openIdx === i ? null : i)}
                style={styles.conceptRow}
                accessibilityLabel={`概念 ${c.term}`}
              >
                <Text style={styles.conceptTerm}>{c.term}</Text>
                <Text style={styles.conceptToggle}>{openIdx === i ? '−' : '+'}</Text>
              </Pressable>
              {openIdx === i && (
                <View style={styles.conceptDetail}>
                  <Text style={styles.conceptLabel}>· 小白解释</Text>
                  <Text style={styles.conceptText}>{c.plain}</Text>
                  {c.context?.text ? (
                    <>
                      <Text style={styles.conceptLabel}>· 原文语境</Text>
                      <Text style={styles.conceptText}>
                        {c.context.timestamp && c.context.timestamp > 0
                          ? `[${Math.floor(c.context.timestamp / 60)}:${String(Math.floor(c.context.timestamp % 60)).padStart(2, '0')}] `
                          : ''}
                        「{c.context.text}」
                      </Text>
                    </>
                  ) : null}
                  {c.related ? (
                    <>
                      <Text style={styles.conceptLabel}>· 延伸理解</Text>
                      <Text style={styles.conceptText}>{c.related}</Text>
                    </>
                  ) : null}
                </View>
              )}
            </View>
          ))}
        </View>
      )}
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
  const { id, goal, jobId: initialJobId, packId: initialPackId, direct, mode } = useLocalSearchParams<{
    id: string; goal: string; jobId?: string; packId?: string; direct?: string; mode?: string;
  }>();
  const episodeId = Number(id);
  // Sprint 11 v3: mode 决定学习深度 quick|deep（默认 deep 兼容老链接）
  const learningMode: 'quick' | 'deep' = mode === 'quick' ? 'quick' : 'deep';
  const [upgrading, setUpgrading] = useState(false);

  const [jobId, setJobId] = useState<string | null>(initialJobId || null);
  const [jobStatus, setJobStatus] = useState<JobStatus>('processing');
  const [progress, setProgress] = useState(0);
  const [pack, setPack] = useState<PackObject | null>(null);
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null);
  const [podcastName, setPodcastName] = useState<string | null>(null);
  const [episodeCover, setEpisodeCover] = useState<string | null>(null);
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
  // Sprint 9 STORY-00901: 抽成 fetch 函数供首次挂载 + AppState 激活复用
  const fetchDirectPack = useCallback(() => {
    if (initialJobId || !id || isNaN(Number(id))) return;
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
        if (res.episodeCover) setEpisodeCover(res.episodeCover);
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
            if (packRes.episodeCover) setEpisodeCover(packRes.episodeCover);
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

          {/* Sprint 10 STORY-01001: 关键概念（可折叠） */}
          {Array.isArray(pack.concepts) && pack.concepts.length > 0 && (
            <ConceptsPanel concepts={pack.concepts} />
          )}

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
              {/* Sprint 8: 完成庆祝 */}
              {steps.length > 0 && completedCount === steps.length ? (
                <View style={styles.doneChip}>
                  <Text style={styles.doneChipText}>🎉 完成一集</Text>
                </View>
              ) : null}
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
                {pack.cards.filter(c => !c.archived).map((card, cardIdx) => (
                  <View
                    key={card.id ?? cardIdx}
                    style={styles.knowledgeCard}
                    testID={`card-${card.type}`}
                  >
                    <View style={[styles.cardTypeBar, { backgroundColor: CARD_TYPE_COLORS[card.type] || colors.olive }]} />
                    <View style={styles.cardInner}>
                      <View style={styles.cardTitleRow}>
                        <Text style={styles.cardTitle}>{card.title}</Text>
                        <View style={styles.cardActionsGroup}>
                        <Pressable
                          onPress={async () => {
                            const newStarred = !card.starred;
                            // 乐观更新
                            setPack(prev => {
                              if (!prev) return prev;
                              const newCards = [...prev.cards];
                              const realIdx = prev.cards.findIndex(c => c.id === card.id);
                              if (realIdx < 0) return prev;
                              newCards[realIdx] = { ...newCards[realIdx], starred: newStarred };
                              return { ...prev, cards: newCards };
                            });
                            try {
                              const realIdx = pack.cards.findIndex(c => c.id === card.id);
                              await apiFetch(`/api/packs/${pack.id}/cards/${realIdx}`, {
                                method: 'PATCH',
                                body: JSON.stringify({ starred: newStarred }),
                              });
                            } catch (err) {
                              // 回滚
                              setPack(prev => {
                                if (!prev) return prev;
                                const newCards = [...prev.cards];
                                const realIdx = prev.cards.findIndex(c => c.id === card.id);
                                if (realIdx < 0) return prev;
                                newCards[realIdx] = { ...newCards[realIdx], starred: !newStarred };
                                return { ...prev, cards: newCards };
                              });
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={card.starred ? '取消收藏' : '收藏'}
                          hitSlop={8}
                          style={styles.cardStarBtn}
                        >
                          <Text style={styles.cardStarIcon}>{card.starred ? '★' : '☆'}</Text>
                        </Pressable>
                        {/* Sprint 10 STORY-01002: 删除按钮 */}
                        <Pressable
                          onPress={() => {
                            // web 上用 confirm；native 上用 Alert
                            const doDelete = async () => {
                              const realIdx = pack.cards.findIndex(c => c.id === card.id);
                              // 乐观更新
                              setPack(prev => {
                                if (!prev) return prev;
                                const newCards = [...prev.cards];
                                if (realIdx < 0) return prev;
                                newCards[realIdx] = { ...newCards[realIdx], archived: true };
                                return { ...prev, cards: newCards };
                              });
                              try {
                                await apiFetch(`/api/packs/${pack.id}/cards/${realIdx}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ archived: true }),
                                });
                              } catch (err) {
                                // 回滚
                                setPack(prev => {
                                  if (!prev) return prev;
                                  const newCards = [...prev.cards];
                                  if (realIdx < 0) return prev;
                                  newCards[realIdx] = { ...newCards[realIdx], archived: false };
                                  return { ...prev, cards: newCards };
                                });
                              }
                            };
                            if (Platform.OS === 'web') {
                              if (typeof window !== 'undefined' && window.confirm && window.confirm('删除这张卡片？')) {
                                doDelete();
                              }
                            } else {
                              // dynamic import Alert 避免 SSR/RN Web 差异
                              import('react-native').then(({ Alert }) => {
                                Alert.alert('删除卡片', '删除这张卡片？', [
                                  { text: '取消', style: 'cancel' },
                                  { text: '删除', style: 'destructive', onPress: doDelete },
                                ]);
                              });
                            }
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="删除卡片"
                          hitSlop={8}
                          style={styles.cardTrashBtn}
                        >
                          <Text style={styles.cardTrashIcon}>🗑</Text>
                        </Pressable>
                        </View>
                      </View>
                      <Text style={styles.cardExplanation}>{card.explanation}</Text>
                      <Text style={styles.cardType}>{CARD_TYPE_LABELS[card.type] || card.type}</Text>
                      {/* Sprint 10 STORY-01003: 我的应用 */}
                      {(card.myApplication || card.personalNote) ? (
                        <MyApplicationBlock
                          packId={pack.id}
                          cardIdx={pack.cards.findIndex(c => c.id === card.id)}
                          myApplication={card.myApplication || ''}
                          personalNote={card.personalNote || ''}
                          onSave={(newNote) => {
                            setPack(prev => {
                              if (!prev) return prev;
                              const newCards = [...prev.cards];
                              const realIdx = prev.cards.findIndex(c => c.id === card.id);
                              if (realIdx < 0) return prev;
                              newCards[realIdx] = { ...newCards[realIdx], personalNote: newNote };
                              return { ...prev, cards: newCards };
                            });
                          }}
                        />
                      ) : null}
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
                {(['today', 'thisWeek', 'longTerm'] as const).map((k, actionIdx) => {
                  const timeframe = k === 'today' ? 'today' : k === 'thisWeek' ? 'week' : 'longterm';
                  const committed = pack.committedActions?.includes(actionIdx) ?? false;
                  return (
                    <View key={k} style={styles.actionRow}>
                      <Pressable
                        style={[styles.actionCheckbox, committed && styles.actionCheckboxDone]}
                        onPress={async () => {
                          if (committed) return; // 已承诺，不重复
                          const actionText = pack.actions[k];
                          if (!actionText) return;
                          // 乐观更新
                          setPack(prev => prev ? { ...prev, committedActions: [...(prev.committedActions || []), actionIdx] } : prev);
                          try {
                            const anonymousId = await getAnonymousIdSafe();
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
                          } catch {
                            // 回滚
                            setPack(prev => prev ? { ...prev, committedActions: (prev.committedActions || []).filter(i => i !== actionIdx) } : prev);
                          }
                        }}
                        accessibilityRole="checkbox"
                        accessibilityLabel={committed ? '已承诺' : '承诺执行'}
                        hitSlop={6}
                      >
                        {committed ? <Text style={styles.actionCheckmark}>✓</Text> : null}
                      </Pressable>
                      <Text style={styles.actionTimeLabel}>
                        {k === 'today' ? '今天' : k === 'thisWeek' ? '本周' : '长期'}
                      </Text>
                      <Text style={[styles.actionText, committed && styles.actionTextCommitted]}>{pack.actions[k]}</Text>
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
                      setTranscriptData({
                        segments: res.segments || [],
                        segmentCount: res.segmentCount || 0,
                        totalChars: res.totalChars || 0,
                      });
                    } catch (err) {
                      // Sprint 8: 加载失败时给友好占位，允许再次尝试
                      setTranscriptData({ segments: [], segmentCount: 0, totalChars: 0 });
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
                  {/* Sprint 8: 已识别错别字提示 */}
                  {pack?.snapshot && (pack as any).suspectedTypos && Array.isArray((pack as any).suspectedTypos) && (pack as any).suspectedTypos.length > 0 ? (
                    <View style={styles.typoBlock}>
                      <Text style={styles.typoTitle}>已识别的可能错别字：</Text>
                      {(pack as any).suspectedTypos.slice(0, 8).map((t: any, i: number) => (
                        <Text key={i} style={styles.typoRow}>
                          「{t.text}」 → 可能是 「{t.guess}」
                          {t.context ? ` · ${t.context}` : ''}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                  {transcriptData.segments.length === 0 ? (
                    <Text style={styles.transcriptHint}>
                      转录暂不可用（可能这集是从缓存加载的，或加载失败）
                    </Text>
                  ) : null}
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

          {/* Sprint 11 v3: quick 模式底部升级到精学按钮 */}
          {learningMode === 'quick' && pack ? (
            <View style={{ marginTop: spacing.xl, marginBottom: spacing.xl }}>
              <Pressable
                onPress={async () => {
                  if (upgrading) return;
                  setUpgrading(true);
                  try {
                    const aid = await getAnonymousId();
                    const res = await apiFetch<{ pack: any }>(`/api/packs/${id}/generate`, {
                      method: 'POST',
                      body: JSON.stringify({ mode: 'deep', anonymousId: aid }),
                    });
                    if (res.pack) {
                      setPack(reshapePack(res.pack, Number(id), goal));
                      router.setParams({ mode: 'deep' } as any);
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
    borderWidth: 1,
    borderColor: colors.paperDark,
  },
  episodeMeta: { flex: 1 },
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
  worthBlock: { marginTop: spacing.md, gap: spacing.xs },
  worthTitle: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, marginBottom: 2 },
  worthRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  worthTs: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, minWidth: 42, marginTop: 2 },
  worthText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, flex: 1, lineHeight: 19 },
  // Sprint 10 STORY-01001: 概念解释器
  conceptsBlock: { marginTop: spacing.lg, backgroundColor: colors.paperCream, borderRadius: radii.card, borderWidth: 1, borderColor: colors.paperDark, padding: spacing.md },
  conceptsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  conceptsChevron: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  conceptsList: { marginTop: spacing.sm, gap: spacing.xs },
  conceptItem: { borderTopWidth: 1, borderTopColor: colors.paperDark, paddingTop: spacing.sm },
  conceptRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 32 },
  conceptTerm: { fontFamily: fonts.ui, fontSize: 15, color: colors.inkPrimary, flex: 1 },
  conceptToggle: { fontFamily: fonts.ui, fontSize: 20, color: colors.inkSecondary, minWidth: 24, textAlign: 'right' },
  conceptDetail: { marginTop: spacing.xs, gap: 4 },
  conceptLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3, marginTop: 4 },
  conceptText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 20 },
  // Sprint 10 STORY-01002: 卡片按钮群
  cardActionsGroup: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardTrashBtn: { padding: 4, minWidth: 32, alignItems: 'center' },
  cardTrashIcon: { fontSize: 18 },
  // Sprint 10 STORY-01003: 我的应用
  myAppBlock: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.paperMain, borderRadius: 8, borderWidth: 1, borderColor: colors.paperDark },
  myAppLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3, marginBottom: 4 },
  myAppText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19 },
  myAppInput: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19, minHeight: 60, borderWidth: 1, borderColor: colors.paperDark, borderRadius: 6, padding: spacing.xs, backgroundColor: '#fff' },
  myAppBtn: { backgroundColor: colors.brick, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6 },
  myAppBtnText: { color: colors.paperCream, fontFamily: fonts.ui, fontSize: 12 },
  myAppBtnSecondary: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.paperDark },
  myAppBtnSecondaryText: { color: colors.inkSecondary, fontFamily: fonts.ui, fontSize: 12 },
  // Sprint 10 STORY-01004: 行动 checkbox
  actionCheckbox: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: colors.inkSecondary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginTop: 2 },
  actionCheckboxDone: { backgroundColor: colors.olive, borderColor: colors.olive },
  actionCheckmark: { color: colors.paperCream, fontSize: 12, fontWeight: '700' as const },
  actionTextCommitted: { color: colors.inkSecondary },
  // Sprint 10 STORY-01005: 测验
  quizBlock: { marginTop: spacing.lg, backgroundColor: colors.paperCream, borderRadius: radii.card, borderWidth: 1, borderColor: colors.paperDark, padding: spacing.md },
  quizHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  quizChevron: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  quizList: { marginTop: spacing.sm, gap: spacing.md },
  quizItem: { borderTopWidth: 1, borderTopColor: colors.paperDark, paddingTop: spacing.sm, gap: spacing.xs },
  quizQ: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkPrimary, fontWeight: '600' },
  quizChoices: { gap: 6 },
  quizChoice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, backgroundColor: colors.paperMain, borderWidth: 1, borderColor: colors.paperDark, borderRadius: 6 },
  quizChoiceSelected: { borderColor: colors.brick },
  quizChoiceCorrect: { backgroundColor: '#E8F1E4', borderColor: colors.olive },
  quizChoiceWrong: { backgroundColor: '#FBE7E4', borderColor: colors.brick },
  quizChoiceLetter: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary, minWidth: 22 },
  quizChoiceText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, flex: 1 },
  quizCheck: { color: colors.olive, fontSize: 14, fontWeight: '700' as const },
  quizExplain: { fontFamily: fonts.body, fontSize: 12, marginTop: 4, lineHeight: 18 },
  quizExplainCorrect: { color: colors.olive },
  quizExplainWrong: { color: colors.brick },
  quizShortInput: { fontFamily: fonts.body, fontSize: 13, minHeight: 60, backgroundColor: colors.paperMain, borderWidth: 1, borderColor: colors.paperDark, borderRadius: 6, padding: spacing.xs, color: colors.inkPrimary },
  quizAnswerBox: { marginTop: spacing.xs, padding: spacing.sm, backgroundColor: colors.paperMain, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: colors.olive },
  quizAnswerLabel: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, marginBottom: 4 },
  quizAnswerText: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, lineHeight: 19 },
  selfRatingBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: colors.paperDark, backgroundColor: colors.paperMain },
  selfRatingKnown: { backgroundColor: colors.brick, borderColor: colors.brick },
  selfRatingText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkPrimary },
  quizScoreBox: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: colors.paperMain, borderRadius: 6, alignItems: 'center' },
  quizScoreText: { fontFamily: fonts.ui, fontSize: 14, color: colors.inkPrimary, fontWeight: '600' },

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
