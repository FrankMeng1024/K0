// useReviewQueue — Review 页数据 hook (Phase 2.3 React Query)
// 返回 { data: {stats,queue,upcoming,actions}, isLoading, error, refetch }。
// UI 态 (currentIdx/flipped) 仍由页面自己管, hook 只负责服务端数据。
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export type ReviewCard = {
  userCardId: number | null;
  packId: number;
  cardIndex: number;
  title: string;
  explanation: string;
  type: string;
  sourceTimestamp: number;
  podcastName: string;
  episodeTitle: string;
  coverImageUrl: string | null;
  reviewState: string | null;
  reviewCount: number;
  reviewNextAt: string | null;
  quote?: string;
  insight?: string;
  context?: string;
};

export type ReviewStats = { dueToday: number; dueThisWeek: number; totalReviews: number };

export type ReviewUserAction = {
  id: number;
  pack_id: number;
  slot_index: number;
  action_text: string;
  timeframe: 'today' | 'week' | 'longterm';
};

export type ReviewData = {
  stats: ReviewStats | null;
  queue: ReviewCard[];
  upcoming: ReviewCard[];
  actions: ReviewUserAction[];
};

const EMPTY: ReviewData = { stats: null, queue: [], upcoming: [], actions: [] };

export function useReviewQueue() {
  const query = useQuery({
    queryKey: ['review'],
    queryFn: async (): Promise<ReviewData> => {
      const [statsRaw, queueRes, actionsRes] = await Promise.all([
        apiGet<any>(`/api/review/stats`),
        apiGet<{ due: ReviewCard[]; upcoming: ReviewCard[] }>(`/api/review/queue`),
        apiGet<{ pending: ReviewUserAction[]; done: ReviewUserAction[] }>(`/api/review/actions`).catch(() => ({ pending: [], done: [] })),
      ]);
      return {
        stats: statsRaw ? {
          dueToday: Number(statsRaw.dueToday) || 0,
          dueThisWeek: Number(statsRaw.dueThisWeek) || 0,
          totalReviews: Number(statsRaw.totalReviews) || 0,
        } : null,
        queue: queueRes.due || [],
        upcoming: queueRes.upcoming || [],
        actions: actionsRes.pending || [],
      };
    },
    placeholderData: (prev) => prev,
  });

  const rqRefetch = query.refetch;
  const refetch = useCallback(() => { rqRefetch(); }, [rqRefetch]);

  return {
    data: query.data ?? EMPTY,
    isLoading: query.isLoading,
    error: (query.error as Error) ?? null,
    refetch,
  };
}
