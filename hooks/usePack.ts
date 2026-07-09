// usePack — 单个学习包数据 hook (Phase 2.3 React Query)
// snapshot / card 页共用 (都是 GET /api/packs/:id)。episode 页因耦合 job 轮询, 暂用自己的逻辑。
// 返回原始 pack 响应 { pack, audioUrl, episodeTitle, podcastName, ... }, 各页自行取所需。
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export type PackResponse = {
  packId?: number;
  pack?: any;
  audioUrl?: string | null;
  episodeTitle?: string;
  podcastName?: string;
  episodeCover?: string;
  durationSeconds?: number;
};

export function usePack(packId: number) {
  const enabled = Number.isFinite(packId) && packId > 0;
  const query = useQuery({
    queryKey: ['pack', packId],
    enabled,
    queryFn: async (): Promise<PackResponse> => {
      return apiGet<PackResponse>(`/api/packs/${packId}`);
    },
    placeholderData: (prev) => prev,
  });

  const rqRefetch = query.refetch;
  const refetch = useCallback(() => { rqRefetch(); }, [rqRefetch]);

  return {
    data: query.data ?? null,
    isLoading: enabled ? query.isLoading : false,
    error: (query.error as Error) ?? null,
    refetch,
  };
}
