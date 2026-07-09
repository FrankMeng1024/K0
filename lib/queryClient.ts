// React Query client — Phase 2.3 数据层
// 服务器权威: staleTime 短 (数据很快视为过期→focus/mount 重取), gcTime 保留缓存供快速回显。
// RN focus 由 _layout 的 focusManager + AppState 驱动。
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 服务器权威: 0 = 每次 mount/focus 都视为过期并后台重取 (但先回显缓存, 无闪烁)
      staleTime: 0,
      // 缓存保留 5 分钟, 期间切回页面先显缓存再后台刷新
      gcTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
