// React Query client — Phase 2.3 数据层
// 服务器权威: staleTime 短 (数据很快视为过期→focus/mount 重取), gcTime 保留缓存供快速回显。
// RN focus 由 _layout 的 focusManager + AppState 驱动。
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 服务器权威, 但给 15s staleTime 让快速 focus 切换去重 (Risk review: 避免
      // staleTime:0 在弱网/频繁切前台时的请求放大)。15s 内切回来先显缓存不重取,
      // 超过 15s 或 mutation 主动 invalidate 时才后台刷新。
      staleTime: 15_000,
      // 缓存保留 5 分钟, 期间切回页面先显缓存再后台刷新
      gcTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
  },
});
