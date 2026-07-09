// useLibrary — Library 页数据 hook (Phase E)
// React Query drop-in ready: 返回 { data, isLoading, error, refetch }, refetch 稳定 identity。
// 将来换 useQuery 时只改本文件内部, 调用点不动。
import { useState, useCallback, useEffect } from 'react';
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
  const [data, setData] = useState<LibraryData>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const modeQ = modeFilter !== 'all' ? `?mode=${modeFilter}` : '';
      const [stats, packsRes, cardsRes] = await Promise.all([
        apiGet<LibraryStats>(`/api/library/stats`),
        apiGet<{ packs: LibraryPack[] }>(`/api/library/packs${modeQ}`),
        apiGet<{ cards: LibraryCard[] }>(`/api/library/cards`),
      ]);
      setData({ stats, packs: packsRes.packs || [], cards: cardsRes.cards || [] });
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      // 保持已有数据不清空 (与原 load 行为一致: 失败不动)
    } finally {
      setIsLoading(false);
    }
  }, [modeFilter]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const refetch = useCallback(() => { fetchAll(); }, [fetchAll]);

  return { data, isLoading, error, refetch };
}
