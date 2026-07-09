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
 * 若 token 过期或无效，返回 null（用户需重新登录）
 */
export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (s && typeof s.token === 'string' && typeof s.userId === 'number') {
      memorySession = s;
      return s;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 读当前登录状态 —— 优先内存态，未初始化时尝试从存储加载
 */
export async function getSession(): Promise<Session | null> {
  if (memorySession) return memorySession;
  return await loadSession();
}

/**
 * 同步读取（不查存储），组件在事件处理里用
 */
export function getSessionSync(): Session | null {
  return memorySession;
}

/**
 * 登录/注册成功后调用：内存 + AsyncStorage 都存
 */
export async function setSession(s: Session): Promise<void> {
  memorySession = s;
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(s)).catch(() => {});
}

/**
 * 退出登录 —— 清内存态 + 清 token + 清账号密码
 */
export async function clearSession(): Promise<void> {
  memorySession = null;
  await AsyncStorage.removeItem(TOKEN_KEY).catch(() => {});
  await AsyncStorage.removeItem(CREDS_KEY).catch(() => {});
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
