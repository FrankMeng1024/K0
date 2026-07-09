// pack 归一化 — 原定义在 app/episode/[id].tsx (Phase D 抽出)
// backend 返回扁平 pack shape, UI 期望 nested。此适配保证两种 shape 都能渲染。
// 注: 含 episode 专属假设 (合成 card id / cardIndex 保留, 供删除定位)。
import type { PackObject, SuspectedTypo } from '@/types/pack';

export function reshapePack(raw: any, fallbackPackId: number, fallbackGoal?: string): PackObject {
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
      valueScoreRationale: raw?.valueScoreRationale ?? undefined,
      estimatedCostMinutes: raw?.estimatedCostMinutes ?? 0,
      worthListening: raw?.worthListening ?? [],
      skippable: raw?.skippable ?? [],
    },
    steps: raw?.steps ?? [],
    cards: (raw?.cards ?? []).map((c: any, i: number) => ({
      id: c.id ?? packIdNum * 1000 + i,
      // 保留 backend 传来的原始 cardIndex — 删除定位用 (findIndex 会落到过滤后下标, 删错行)
      cardIndex: typeof c.cardIndex === 'number' ? c.cardIndex : i,
      type: c.type ?? 'concept',
      // v4 卡片新字段
      quote: c.quote ?? '',
      insight: c.insight ?? c.title ?? '',
      context: c.context ?? '',
      // 老字段兼容
      title: c.insight ?? c.title ?? '',
      explanation: c.context ?? c.core ?? c.explanation ?? '',
      sourceTimestamp: c.timestamp ?? c.sourceTimestamp ?? 0,
      starred: c.starred ?? false,
      myApplication: c.myApplication ?? c.my_application ?? '',
      personalNote: c.personalNote ?? c.personal_note ?? c.myNote ?? '',
      archived: c.archived ?? false,
    })),
    actions: raw?.actions ?? { today: '', thisWeek: '', longTerm: '' },
    concepts: Array.isArray(raw?.concepts) ? raw.concepts : [],
    quizQuestions: Array.isArray(raw?.quizQuestions) ? raw.quizQuestions : (Array.isArray(raw?.quiz) ? raw.quiz : []),
    committedActions: Array.isArray(raw?.committedActions) ? raw.committedActions : [],
    createdAt: raw?.createdAt ?? new Date().toISOString(),
    ...(raw?.suspectedTypos ? { suspectedTypos: raw.suspectedTypos as SuspectedTypo[] } : {}),
  };
}
