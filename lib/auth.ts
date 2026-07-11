// K0 auth session
// Refactor Phase 1 (2026-07-09): 匿名账户不存在。JWT 替代 anonymousId 做 session token
//
// 注意：本文件不 import lib/api.ts，避免循环依赖。login/register 用原生 fetch 直调。
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.k0.yiiling.cn';

export type Session = {
  userId: number;
  token: string;
  username: string;
};

export type SavedCreds = {
  username: string;
  password: string;
};

const TOKEN_KEY = 'k0.token';
const CREDS_KEY = 'k0.credentials';

// module-level 内存 session
let memorySession: Session | null = null;

/**
 * 冷启动时从 AsyncStorage 拉 token → 试图恢复 session
 * Bug3 (Sprint16 R23): token 不再落盘 (只存内存), 冷启动必然无 token → index 跳 login。
 *   "记住账号密码" 只预填输入框, 用户仍需手动点登录。故此函数冷启动恒返回 null。
 *   保留函数签名 (getSession 调用它) 但不再从磁盘读 token。
 */
export async function loadSession(): Promise<Session | null> {
  // token 不落盘 → 冷启动无内存态时恒 null (强制每次开 App 回登录页)
  return memorySession;
}

/**
 * 读当前登录状态 —— 只看内存态 (token 不落盘, 见 Bug3)
 */
export async function getSession(): Promise<Session | null> {
  return memorySession;
}

/**
 * 同步读取（不查存储），组件在事件处理里用
 */
export function getSessionSync(): Session | null {
  return memorySession;
}

/**
 * 登录/注册成功后调用：Bug3 (Sprint16 R23) token 只入内存, 不落盘。
 *   → 冷启动/杀 App 后 token 消失, index 跳 login (符合"每次开 App 到登录页")。
 */
export async function setSession(s: Session): Promise<void> {
  memorySession = s;
  // token 不写 AsyncStorage (故意): 保证下次开 App 回登录页, 不自动登录
}

/**
 * 退出登录 —— 清内存态 + 清 token + 清账号密码
 */
export async function clearSession(): Promise<void> {
  memorySession = null;
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  await AsyncStorage.removeItem(CREDS_KEY).catch(() => {});
  // #106 QA-fix: 复位 push 注册标志, 保证换账号后新用户 token 能重新注册绑定
  import('./notifications').then(m => m.resetPushRegistration()).catch(() => {});
}

/**
 * 保存账号密码明文（"记住账号密码" 勾选后调用）
 */
export async function saveCredentials(username: string, password: string): Promise<void> {
  await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ username, password }));
}

export async function clearCredentials(): Promise<void> {
  await AsyncStorage.removeItem(CREDS_KEY).catch(() => {});
}

export async function loadCredentials(): Promise<SavedCreds | null> {
  try {
    const raw = await AsyncStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c && typeof c.username === 'string' && typeof c.password === 'string') return c;
    return null;
  } catch {
    return null;
  }
}

export async function loginApi(username: string, password: string): Promise<Session> {
  const r = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.message || body?.error?.message || '登录失败';
    throw new Error(msg);
  }
  return { userId: body.userId, token: body.token, username: body.username };
}

export async function registerApi(username: string, password: string): Promise<Session> {
  const r = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = body?.message || body?.error?.message || '注册失败';
    throw new Error(msg);
  }
  return { userId: body.userId, token: body.token, username: body.username };
}
