// useLibrary — Library 页数据 hook (Phase 2.3: React Query useQuery)
// 返回 { data, isLoading, error, refetch }, 调用点不变。
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export type LibraryPack = {
  packId: number;
  goal: string;
  language: string;
  createdAt: string;
  episodeId: number;
  episodeTitle: string;
  durationSeconds: number | null;
  coverImageUrl: string | null;
  podcastName: string;
  platform: string;
  oneSentence: string;
  cardsCount: number;
  stepsDoneCount: number;
  mode?: 'deep' | 'quick' | 'skip' | null;
  todayTotal?: number;
  todayDone?: number;
};

export type LibraryCard = {
  packId: number;
  cardIndex: number;
  type: string;
  title: string;
  explanation: string;
  sourceTimestamp: number;
  starred: boolean;
  episodeTitle: string;
  coverImageUrl: string | null;
  podcastName: string;
  goal: string;
  packCreatedAt: string;
};

export type LibraryStats = {
  packsCount: number;
  cardsCount: number;
  starredCount: number;
  stepsDoneCount: number;
};

export type LibraryData = {
  stats: LibraryStats | null;
  packs: LibraryPack[];
  cards: LibraryCard[];
};

export type UseLibraryResult = {
  data: LibraryData;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
};

const EMPTY: LibraryData = { stats: null, packs: [], cards: [] };

export function useLibrary(modeFilter: string): UseLibraryResult {
  const query = useQuery({
    queryKey: ['library', modeFilter],
    queryFn: async (): Promise<LibraryData> => {
      const modeQ = modeFilter !== 'all' ? `?mode=${modeFilter}` : '';
      const [stats, packsRes, cardsRes] = await Promise.all([
        apiGet<LibraryStats>(`/api/library/stats`),
        apiGet<{ packs: LibraryPack[] }>(`/api/library/packs${modeQ}`),
        apiGet<{ cards: LibraryCard[] }>(`/api/library/cards`),
      ]);
      return { stats, packs: packsRes.packs || [], cards: cardsRes.cards || [] };
    },
    // 失败保留上次数据 (与原 load 行为一致: 失败不清空)
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
