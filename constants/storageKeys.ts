// K0 AsyncStorage key 单一来源
// Frank 决策 5 白名单: 只有 auth(token/creds) + pendingJob 书签允许落盘, 业务数据全走服务器
// 原各文件 local const 重声明 (JOB_STORAGE_KEY ×2, auth.ts ×2) → 收敛到此
export const STORAGE_KEYS = {
  token: 'k0.token',
  credentials: 'k0.credentials',
  pendingJob: 'k0.pendingJob',
} as const;
