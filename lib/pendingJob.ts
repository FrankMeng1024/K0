// pending job 书签 — 冷启动/杀 App 重开时恢复「你有个 Job 在跑」的状态。
// Frank 决策 5: 这是"未完成任务的书签"(只存 jobId 引用), 不是业务数据缓存 — job 真实状态永远从
// GET /api/jobs/:jobId 拉。原 4 处 setItem 复制 (episode/snapshot/import×2) → 收敛到此。
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/constants/storageKeys';

const KEY = STORAGE_KEYS.pendingJob;

/** 陈旧记录 24h 后视为过期直接清掉 */
export const JOB_STALENESS_MS = 24 * 60 * 60 * 1000;

export type PendingJob = {
  jobId: string;
  url: string;
  savedAt: number;
  // Step 2 (pack-generate) 恢复用
  packId?: number;
  mode?: string;
  targetType?: string;
};

/** 写书签 (savedAt 自动填当前时间) */
export async function savePendingJob(job: Omit<PendingJob, 'savedAt'>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...job, savedAt: Date.now() }));
  } catch {}
}

/** 读书签; 无/损坏/无 jobId 返回 null */
export async function readPendingJob(): Promise<PendingJob | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PendingJob;
    if (!saved?.jobId) return null;
    return saved;
  } catch {
    return null;
  }
}

/** 清书签 */
export async function clearPendingJob(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}

// R65: 会话级"进度屏已见过"标记 — 修"快照生成中第一次返回还弹回"bug。
//   根因: 旧 once-flag 在 index.tsx, 正常导入流程首页首次 mount 时 job 尚未创建, useEffect 读不到 pendingJob
//   → flag 保持 false; 用户从 import 屏返回首页时首页重新 mount → useEffect 才第一次读到在跑的 job → 仍 false → 弹回(第一次)。
//   修法: import 进度屏一 mount 就 markJobProgressSeen(), 表示"这个 job 用户已经看到了"; 之后首页恢复逻辑
//   检查 hasSeenJobProgress(), 已见过就不自动弹回(用户可自由浏览, 完成靠推送)。module 级 = 整个 App 会话内有效。
let _seenJobProgress = false;
export function markJobProgressSeen(): void { _seenJobProgress = true; }
export function hasSeenJobProgress(): boolean { return _seenJobProgress; }
