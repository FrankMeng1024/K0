// K0 Snapshot 页 — Sprint 11 v3
// PRD M3 Learning Snapshot: 10 秒判断这集值不值得学、10 分钟决定学多深
// 从上到下：元信息 → 一句话 → 价值分 → 学习成本 → audience → 观点list → skippable → 原文(收起)
// 底部固定 3 决策按钮：跳过 / 速学 / 精学
// 用户点决策 → POST /api/packs/:id/generate {mode} → 跳 episode?mode=xxx (或首页)

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Image, ActivityIndicator, Platform } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiGet, apiFetch } from '@/lib/api';
import { getAnonymousId } from '@/lib/urlDetector';
import { colors, fonts, spacing, radii } from '@/constants/theme';
import { ScreenHeader } from '@/components/ScreenHeader';
// Sprint 15 音频 demo: 点击 timestamp 从该秒开始播放
import { useAudioPlayer } from '@/lib/audioPlayer';

type Snapshot = {
  oneSentence: string;
  audience?: string[];
  valueScore?: { density: number; novelty: number; actionability: number };
  valueScoreRationale?: { density?: string; novelty?: string; actionability?: string };
  estimatedCostMinutes?: number;
  corePoints?: { point: string; timestamp: number }[];
  worthListening?: { startSec: number; endSec: number; reason: string; quoteParagraph?: string }[];
  skippable?: { startSec: number; endSec: number; reason: string }[];
  // Sprint 14 R1 #4: 兼容 backend 返回 pack.snapshot.valueScoreRationale（deep 生成后新架构）
  snapshot?: {
    valueScoreRationale?: { density?: string; novelty?: string; actionability?: string };
    worthListening?: { startSec: number; endSec: number; reason: string; quoteParagraph?: string }[];
    skippable?: { startSec: number; endSec: number; reason: string }[];
  };
};

type PackResponse = {
  packId: number;
  pack: Snapshot & { mode?: 'quick' | 'deep' | 'skip' | null };
  episodeTitle?: string;
  podcastName?: string;
  episodeCover?: string;
  durationSeconds?: number;
  // Sprint 15 音频 demo
  audioUrl?: string | null;
};

function fmtTs(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SnapshotScreen() {
  const { packId } = useLocalSearchParams<{ packId: string }>();
  const insets = useSafeAreaInsets();
  // Sprint 15 音频 demo
  const audioPlayer = useAudioPlayer();
  const [pack, setPack] = useState<PackResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptSegments, setTranscriptSegments] = useState<{ start: number; end: number; text: string }[] | null>(null);
  const [decisionLoading, setDecisionLoading] = useState<null | 'skip' | 'quick' | 'deep'>(null);
  useEffect(() => {
    (async () => {
      try {
        const aid = await getAnonymousId();
        const q = `?anonymousId=${encodeURIComponent(aid)}`;
        const p = await apiGet<PackResponse>(`/api/packs/${packId}${q}`);
        setPack(p);
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || '加载快照失败');
        setLoading(false);
      }
    })();
  }, [packId]);

  const loadTranscript = useCallback(async () => {
    if (transcriptSegments) return;
    try {
      // Sprint 12 #8/#20: 后端返回 paragraphs (合并到 30-60s 一段)
      const data = await apiGet<{ paragraphs?: { start: number; end: number; text: string }[]; segments?: { start: number; end: number; text: string }[] }>(`/api/packs/${packId}/transcript`);
      setTranscriptSegments(data.paragraphs && data.paragraphs.length > 0 ? data.paragraphs : (data.segments || []));
    } catch {}
  }, [packId, transcriptSegments]);

  const decide = useCallback(async (mode: 'skip' | 'quick' | 'deep') => {
    if (decisionLoading) return;
    setDecisionLoading(mode);
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    try {
      const aid = await getAnonymousId();
      const res = await apiFetch<{ ok: boolean; jobId?: string; mode: string; packId?: number }>(`/api/packs/${packId}/generate`, {
        method: 'POST',
        body: JSON.stringify({ mode, anonymousId: aid }),
      });
      if (mode === 'skip') {
        router.replace('/');
        return;
      }
      // Sprint 11 v16 hotfix: Step 2 走 job pattern，异步等待
      if (res.jobId) {
        // 持久化 pending job，冷启动能恢复
        try {
          await AsyncStorage.setItem('k0.pendingJob', JSON.stringify({
            jobId: res.jobId,
            url: `pack:${packId}:${mode}`,
            packId: Number(packId),
            mode,
            savedAt: Date.now(),
            targetType: 'pack-generate',
          }));
        } catch {}
        // 跳等待屏，等待屏轮询直到 ready → 跳 episode?mode=xxx
        router.replace({
          pathname: '/import/[jobId]',
          params: { jobId: res.jobId, targetPackId: String(packId), targetMode: mode },
        });
      } else {
        // 兼容：如果 backend 同步返回（老逻辑），直接跳
        router.replace({ pathname: '/episode/[id]', params: { id: String(packId), mode } });
      }
    } catch (e: any) {
      setDecisionLoading(null);
      setError(e?.message || '决策失败，请重试');
    }
  }, [packId, decisionLoading]);

  if (loading) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="快照" subtitle="10 秒判断" />
        <View style={styles.center}><ActivityIndicator color={colors.brick} /></View>
      </View>
    );
  }

  if (error || !pack) {
    return (
      <View style={styles.root}>
        <ScreenHeader title="快照" subtitle="10 秒判断" />
        <View style={styles.center}>
          <Text style={styles.errorText}>{error || '快照数据缺失'}</Text>
          <Pressable style={styles.btnBrick} onPress={() => router.replace('/')}>
            <Text style={styles.btnBrickText}>回首页</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const s = pack.pack;
  const val = s.valueScore || { density: 0, novelty: 0, actionability: 0 };
  const wl = s.worthListening || [];
  const sk = s.skippable || [];
  const audience = s.audience || [];
  // Sprint 15 音频 demo
  const audioUrl = pack.audioUrl || null;
  const playAt = (sec: number) => {
    if (audioUrl) audioPlayer.play(audioUrl, sec);
  };

  return (
    <View style={styles.root}>
      {/* Sprint 12 CR-015: 禁左滑回退，只能按钮返回 */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScreenHeader title="快照" subtitle="10 秒判断，10 分钟决定学多深" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 160 }]}
      >
        {/* 元信息卡 */}
        <View style={styles.metaCard}>
          {pack.episodeCover ? (
            <Image source={{ uri: pack.episodeCover }} style={styles.cover} accessibilityIgnoresInvertColors />
          ) : (
            // Sprint 13 R1: 无封面用撕纸风字母 K 而非 emoji 🎧
            <View style={[styles.cover, styles.coverPlaceholder]}><Text style={styles.coverPlaceholderLetter}>K</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.podcastName} numberOfLines={1}>{pack.podcastName || ''}</Text>
            <Text style={styles.episodeTitle} numberOfLines={2}>{pack.episodeTitle || ''}</Text>
            {pack.durationSeconds ? (
              <Text style={styles.metaSmall}>{Math.round(pack.durationSeconds / 60)} 分钟</Text>
            ) : null}
          </View>
        </View>

        {/* 一句话总结 */}
        {s.oneSentence ? (
          <View style={styles.oneSentenceBlock}>
            <Text style={styles.oneSentence}>{s.oneSentence}</Text>
          </View>
        ) : null}

        {/* 价值分（3 条撕纸风进度条 + 扣分原因）— Sprint 14 R1 #5: kraft 卡背景 + 彩色 dot */}
        {val.density > 0 || val.novelty > 0 || val.actionability > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionLabelRow}>
              <View style={[styles.sectionDot, { backgroundColor: colors.brick }]} />
              <Text style={styles.sectionLabelText}>价值分</Text>
            </View>
            <ScoreBar label="信息密度" score={val.density} color={colors.brick} rationale={s.snapshot?.valueScoreRationale?.density || s.valueScoreRationale?.density} />
            <ScoreBar label="新观点" score={val.novelty} color={colors.sapphire} rationale={s.snapshot?.valueScoreRationale?.novelty || s.valueScoreRationale?.novelty} />
            <ScoreBar label="可行动性" score={val.actionability} color={colors.yolk} rationale={s.snapshot?.valueScoreRationale?.actionability || s.valueScoreRationale?.actionability} />
          </View>
        ) : null}

        {/* 学习成本 —— X 用胖字体 (#7) */}
        {s.estimatedCostMinutes ? (
          <View style={styles.costBlock}>
            <Text style={styles.costTextInline}>
              预估
              <Text style={styles.costNumber}> {s.estimatedCostMinutes} </Text>
              分钟能学完
            </Text>
          </View>
        ) : null}

        {/* audience — Sprint 14 R1 #5: kraft 卡背景 + yolk dot */}
        {audience.length > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionLabelRow}>
              <View style={[styles.sectionDot, { backgroundColor: colors.yolk }]} />
              <Text style={styles.sectionLabelText}>适合谁学</Text>
            </View>
            <View style={styles.chipRow}>
              {audience.map((a, i) => (
                <View key={i} style={styles.audienceChip}>
                  <Text style={styles.audienceChipText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* 值得听的段 — Sprint 14 R1 #5: kraft 卡背景 + olive dot */}
        {wl.length > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionLabelRow}>
              <View style={[styles.sectionDot, { backgroundColor: colors.olive }]} />
              <Text style={styles.sectionLabelText}>值得听的 {wl.length} 段</Text>
            </View>
            {wl.map((w, i) => (
              <Pressable
                key={i}
                style={styles.wlItem}
                onPress={() => setExpandedIdx(expandedIdx === i ? null : i)}
              >
                <View style={styles.wlHead}>
                  <Pressable
                    onPress={(e) => { e.stopPropagation?.(); playAt(w.startSec); }}
                    accessibilityRole="button"
                    accessibilityLabel={`从 ${fmtTs(w.startSec)} 播放`}
                    disabled={!audioUrl}
                    hitSlop={6}
                  >
                    <Text style={styles.wlTs}>{fmtTs(w.startSec)} — {fmtTs(w.endSec)} {audioUrl ? '▶' : ''}</Text>
                  </Pressable>
                  <Text style={styles.wlChev}>{expandedIdx === i ? '▲' : '▼'}</Text>
                </View>
                <Text style={styles.wlReason}>{w.reason}</Text>
                {expandedIdx === i && w.quoteParagraph ? (
                  <Text style={styles.wlQuote}>{w.quoteParagraph}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* skippable — Sprint 14 R1 #6: 单行紧凑 + 划掉 + rose dot（与值得听显著区分）*/}
        {sk.length > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionLabelRow}>
              <View style={[styles.sectionDot, { backgroundColor: colors.rose }]} />
              <Text style={styles.sectionLabelText}>可以跳过 {sk.length} 段</Text>
            </View>
            {sk.map((k, i) => (
              <View key={i} style={styles.skipItemV2}>
                <Text style={styles.skipTsV2}>{fmtTs(k.startSec)}—{fmtTs(k.endSec)}</Text>
                <Text style={styles.skipReasonV2}>{k.reason}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* 原文（顶端收起） */}
        <View style={styles.transcriptBlock}>
          <Pressable
            onPress={() => {
              const next = !transcriptExpanded;
              setTranscriptExpanded(next);
              if (next) loadTranscript();
            }}
            style={styles.transcriptToggle}
          >
            <Text style={styles.transcriptToggleText}>
              {transcriptExpanded ? '折叠原文 ▲' : '展开完整转录 ▼'}
            </Text>
          </Pressable>
          {transcriptExpanded && transcriptSegments ? (
            <View style={styles.transcriptContent}>
              {/* Sprint 13 #8: 段落卡片式展示，每段一张 kraft 卡（BCUT 细碎已 backend paragraphs 合并到 30-60s 一段） */}
              {transcriptSegments.map((seg, i) => (
                <View key={i} style={styles.transcriptParagraph}>
                  <Pressable
                    onPress={() => playAt(seg.start)}
                    accessibilityRole="button"
                    accessibilityLabel={`从 ${fmtTs(seg.start)} 播放`}
                    disabled={!audioUrl}
                    hitSlop={6}
                  >
                    <Text style={styles.transcriptParagraphTs}>{fmtTs(seg.start)}{audioUrl ? ' ▶' : ''}</Text>
                  </Pressable>
                  <Text style={styles.transcriptParagraphText}>{seg.text}</Text>
                </View>
              ))}
              <Pressable
                onPress={() => setTranscriptExpanded(false)}
                style={styles.transcriptFold}
              >
                <Text style={styles.transcriptFoldText}>折叠 ▲</Text>
              </Pressable>
            </View>
          ) : null}
          {transcriptExpanded && !transcriptSegments ? (
            <ActivityIndicator color={colors.inkSecondary} style={{ marginTop: 12 }} />
          ) : null}
        </View>
      </ScrollView>

      {/* Sprint 16 R4: 决策按钮按 pack.mode 动态显示
          - null/skip: 显示 跳过/速学/精学 3 按钮
          - quick: 显示"升级到精学" 1 按钮
          - deep: 不显示（终点） */}
      {(() => {
        const curMode = pack?.pack?.mode;
        if (curMode === 'deep') return null;
        return (
          <View style={[
            styles.decisionBar,
            { paddingBottom: insets.bottom + spacing.sm },
            audioPlayer.state.currentUrl ? { bottom: 72 } : null,
          ]}>
            {(!curMode || curMode === 'skip') ? (
              <>
                <Pressable
                  style={[styles.decisionBtn, styles.btnSkip, decisionLoading && styles.btnDisabled]}
                  onPress={() => decide('skip')}
                  disabled={!!decisionLoading}
                >
                  <Text style={styles.decisionBtnTextDark}>{decisionLoading === 'skip' ? '...' : '跳过'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.decisionBtn, styles.btnQuick, decisionLoading && styles.btnDisabled]}
                  onPress={() => decide('quick')}
                  disabled={!!decisionLoading}
                >
                  <Text style={styles.decisionBtnTextDark}>{decisionLoading === 'quick' ? '生成中...' : '速学'}</Text>
                </Pressable>
                <Pressable
                  style={[styles.decisionBtn, styles.btnDeep, decisionLoading && styles.btnDisabled]}
                  onPress={() => decide('deep')}
                  disabled={!!decisionLoading}
                >
                  <Text style={styles.decisionBtnTextLight}>{decisionLoading === 'deep' ? '生成中...' : '精学'}</Text>
                </Pressable>
              </>
            ) : curMode === 'quick' ? (
              <Pressable
                style={[styles.decisionBtn, styles.btnDeep, decisionLoading && styles.btnDisabled, { flex: 1 }]}
                onPress={() => decide('deep')}
                disabled={!!decisionLoading}
              >
                <Text style={styles.decisionBtnTextLight}>{decisionLoading === 'deep' ? '升级中...' : '升级到精学'}</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })()}
    </View>
  );
}

function ScoreBar({ label, score, color, rationale }: { label: string; score: number; color: string; rationale?: string }) {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  return (
    <View style={sbStyles.container}>
      <View style={sbStyles.row}>
        <Text style={sbStyles.label}>{label}</Text>
        <View style={sbStyles.track}>
          <View style={[sbStyles.fill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        <Text style={sbStyles.score}>{score}</Text>
      </View>
      {rationale ? <Text style={sbStyles.rationale}>{rationale}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.paperMain },
  scroll: { flex: 1 },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.xl },
  errorText: { fontFamily: fonts.body, fontSize: 14, color: colors.brick, textAlign: 'center' },
  metaCard: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    alignItems: 'center',
  },
  cover: { width: 60, height: 60, borderRadius: 8 },
  coverPlaceholder: { backgroundColor: colors.paperDark, alignItems: 'center', justifyContent: 'center' },
  coverPlaceholderLetter: {
    fontFamily: fonts.hero,
    fontSize: 28,
    color: colors.brick,
  },
  podcastName: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, letterSpacing: 0.3 },
  episodeTitle: { fontFamily: fonts.body, fontSize: 15, color: colors.inkPrimary, marginTop: 2 },
  metaSmall: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, marginTop: 4, letterSpacing: 0.3 },
  oneSentenceBlock: {
    padding: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
  },
  oneSentence: {
    fontFamily: fonts.hero,
    fontSize: 22,
    lineHeight: 30,
    color: colors.inkPrimary,
    letterSpacing: -0.3,
  },
  valueBlock: { gap: spacing.sm, marginTop: spacing.xs },
  // Sprint 14 R1 #5: 每栏 kraft 卡背景 + 彩色 dot 前缀替代同色 sectionLabel
  sectionCard: {
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    padding: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDot: { width: 10, height: 10, borderRadius: 5 },
  sectionLabelText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkPrimary, fontWeight: '600' as const, letterSpacing: 0.3 },
  // 保留 sectionLabel/sectionLabelDim 供其他用途（如未来引用），但主要使用 sectionLabelRow
  sectionLabel: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionLabelDim: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, letterSpacing: 0.6, textTransform: 'uppercase', opacity: 0.6 },
  costBlock: { padding: spacing.md, backgroundColor: colors.paperCream, borderRadius: radii.card },
  costText: { fontFamily: fonts.bodyItalic, fontStyle: 'italic', fontSize: 14, color: colors.inkPrimary },
  // Sprint 12 #7: X 数字用 hero 胖字体
  costTextInline: {
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkPrimary,
    textAlign: 'center',
  },
  costNumber: {
    fontFamily: fonts.hero,
    fontSize: 28,
    lineHeight: 30,
    color: colors.brick,
  },
  audienceBlock: { gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  audienceChip: {
    paddingVertical: 5, paddingHorizontal: 12,
    backgroundColor: colors.paperCream,
    borderRadius: 999,
    borderWidth: 1, borderColor: colors.paperDark,
  },
  audienceChipText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkPrimary },
  wlBlock: { gap: spacing.sm },
  wlItem: {
    padding: spacing.md,
    backgroundColor: colors.paperMain,
    borderRadius: radii.card,
    gap: 6,
    marginBottom: spacing.sm,
  },
  // Sprint 16 R3-1: 删 borderLeft 竖杠（Frank 反馈快照页可跳过前有竖杠）
  skipItemV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 2,
  },
  skipTsV2: {
    fontFamily: fonts.ui,
    fontSize: 11,
    color: colors.inkSecondary,
    minWidth: 84,
  },
  skipReasonV2: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkSecondary,
    flex: 1,
    textDecorationLine: 'line-through',
  },
  // 旧 wlItemDim 保留以防某处引用（可未来清理）
  wlItemDim: {
    opacity: 0.7,
    borderWidth: 1,
    borderColor: colors.paperDark,
    borderStyle: 'dashed',
    backgroundColor: 'transparent',
  },
  wlHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wlTs: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary, letterSpacing: 0.3 },
  wlChev: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  wlReason: { fontFamily: fonts.body, fontSize: 14, color: colors.inkPrimary, lineHeight: 20 },
  wlQuote: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 13,
    color: colors.inkSecondary,
    lineHeight: 20,
    marginTop: 4,
  },
  skBlock: { gap: 6, opacity: 0.7 },
  skItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  skTs: { fontFamily: fonts.ui, fontSize: 11, color: colors.inkSecondary },
  skReason: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSecondary, flex: 1 },
  transcriptBlock: { marginTop: spacing.md },
  transcriptToggle: {
    padding: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    alignItems: 'center',
  },
  transcriptToggleText: { fontFamily: fonts.ui, fontSize: 13, color: colors.inkSecondary },
  transcriptContent: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.paperCream,
    borderRadius: radii.card,
    gap: 4,
  },
  transcriptLine: { fontFamily: fonts.body, fontSize: 12, color: colors.inkPrimary, lineHeight: 18 },
  transcriptTs: { color: colors.inkSecondary, fontSize: 10 },
  // Sprint 13 #8: 段落卡片
  transcriptParagraph: {
    backgroundColor: colors.paperMain,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 6,
  },
  transcriptParagraphTs: {
    fontFamily: fonts.ui,
    fontSize: 10,
    color: colors.inkSecondary,
    letterSpacing: 0.4,
    backgroundColor: colors.paperCream,
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.paperDark,
    alignSelf: 'flex-start',
  },
  transcriptParagraphText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 20,
    color: colors.inkPrimary,
  },
  transcriptFold: { alignSelf: 'flex-end', paddingVertical: spacing.sm },
  transcriptFoldText: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary },
  decisionBar: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.paperMain,
    borderTopWidth: 1,
    borderTopColor: colors.paperDark,
  },
  decisionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radii.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSkip: { backgroundColor: colors.paperCream, borderWidth: 1, borderColor: colors.paperDark },
  btnQuick: { backgroundColor: colors.yolk },
  btnDeep: { backgroundColor: colors.sapphire },
  btnBrick: { backgroundColor: colors.brick, paddingVertical: 12, paddingHorizontal: 24, borderRadius: radii.card },
  btnBrickText: { fontFamily: fonts.ui, fontSize: 15, color: colors.paperCream },
  btnDisabled: { opacity: 0.5 },
  decisionBtnTextDark: { fontFamily: fonts.hero, fontSize: 18, color: colors.inkPrimary },
  decisionBtnTextLight: { fontFamily: fonts.hero, fontSize: 18, color: colors.paperCream },
});

const sbStyles = StyleSheet.create({
  container: { marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontFamily: fonts.body, fontSize: 13, color: colors.inkPrimary, width: 72 },
  track: { flex: 1, height: 8, backgroundColor: colors.paperCream, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%' },
  score: { fontFamily: fonts.ui, fontSize: 12, color: colors.inkSecondary, width: 22, textAlign: 'right' },
  // Sprint 12 #6: 扣分原因说明
  rationale: {
    fontFamily: fonts.bodyItalic,
    fontStyle: 'italic',
    fontSize: 11,
    color: colors.inkSecondary,
    marginTop: 4,
    marginLeft: 80,
    opacity: 0.8,
  },
});
