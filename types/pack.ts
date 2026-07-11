// K0 学习包共享类型 — 原定义在 app/episode/[id].tsx (Phase D 抽出)
// episode 为主消费者; card/[key] 也用 Card。snapshot 页有自己的轻量 PackResponse (startSec/endSec 别名),
// 暂不强并 (Arch review: 需渲染 diff 测试 gate, 留后续)。

export type ValueScore = { density: number; novelty: number; actionability: number };
export type CorePoint = { point: string; timestamp: number };
export type WorthListening = { start: number; end: number; reason: string };
export type Skippable = { start: number; end: number; reason: string };
export type SuspectedTypo = { text: string; guess: string; context?: string };

export interface SnapshotObject {
  oneSentence: string;
  corePoints: CorePoint[];
  audience: string[];
  valueScore: ValueScore;
  // 价值分扣分理由
  valueScoreRationale?: { density?: string; novelty?: string; actionability?: string };
  estimatedCostMinutes: number;
  worthListening: WorthListening[];
  skippable: Skippable[];
}

export interface LearningStep {
  id: number;
  stepNumber: number;
  title: string;
  content: string;
  citations: { timestamp: number; text: string }[];
  aiSynthesized?: boolean;  // #88: 无真实原文引用 = AI 综合归纳, 前端标"AI 归纳"
  completed: boolean;
}

export interface Card {
  id: number;
  type: string;
  title: string;
  explanation: string;
  sourceTimestamp: number;
  starred: boolean;
  // v4 卡片新字段
  quote?: string;
  quoteVerified?: boolean;  // R25: quote 是否逐字原文(false=AI改写,不打引号)
  insight?: string;
  context?: string;
  // 稳定原始下标 (backend 传, 删除定位用)
  cardIndex?: number;
  archived?: boolean;
  myApplication?: string;
  personalNote?: string;
}

// 概念解释器
export interface Concept {
  term: string;
  plain: string;
  context?: { text?: string; timestamp?: number };
  related?: string;
}

// 测验题
export interface QuizQuestion {
  type: 'mcq' | 'short';
  question: string;
  choices?: string[];
  correctIndex?: number;
  correctText?: string;
  sourceTimestamp?: number;
  explanation?: string;
}

export interface Actions {
  today: string;
  thisWeek: string;
  longTerm: string;
}

// #77 主动回忆问题 (AI 出题, 用户作答 + 自评)
export interface RecallQuestion {
  id?: number;
  position: number;
  question: string;
  modelAnswer: string;
  userAnswer?: string;
  selfRating?: 'got' | 'fuzzy' | 'blank' | null;
}

export interface PackObject {
  id: number;
  episodeId: number;
  goal: string;
  language: string;
  snapshot: SnapshotObject;
  steps: LearningStep[];
  cards: Card[];
  actions: Actions;
  concepts?: Concept[];
  quizQuestions?: QuizQuestion[];
  committedActions?: number[];
  recallQuestions?: RecallQuestion[];  // #77 主动回忆
  feynmanSummary?: string;             // #77 费曼复述(整集一句话)
  createdAt: string;
  suspectedTypos?: SuspectedTypo[];
  mode?: 'quick' | 'deep' | 'skip' | null;
}
