// K0 auth session — Sprint 16 R2 / R3 v32
// 双层：
//   - 内存态 memorySession: 当前 App 生命周期有效的登录状态
//   - AsyncStorage 存 { username, password } 明文（"记住账号密码"）
//     └ 用户下次开 App 时**预填输入框**，仍需手动点登录；不做自动登录
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, ApiError } from './api';

export type Session = {
  anonymousId: string;
  username: string;
};

export type SavedCreds = {
  username: string;
  password: string;
};

// v31 老 key（存的是 session 对象），v32 起废弃并清理
const SESSION_KEY = 'k0.session';
// v32 新 key：仅存账号密码明文
const CREDS_KEY = 'k0.credentials';

// module-level 内存 session：当前 App 生命周期有效
let memorySession: Session | null = null;

/**
 * 读当前登录状态 —— 只看内存态
 * 每次开 App memorySession=null → 未登录 → 停在登录页
 */
export async function getSession(): Promise<Session | null> {
  return memorySession;
}

/**
 * 登录/注册成功后调用，把 session 存入内存
 * 不再自动写 AsyncStorage —— 持久化由 saveCredentials() 单独控制
 */
export function setSession(s: Session): void {
  memorySession = s;
}

/**
 * 退出登录 —— 清内存态 + 抹掉记住的账号密码
 */
export async function clearSession(): Promise<void> {
  memorySession = null;
  await AsyncStorage.removeItem(CREDS_KEY).catch(() => {});
  await AsyncStorage.removeItem(SESSION_KEY).catch(() => {}); // 清 v31 老 key
}

/**
 * 保存账号密码明文（"记住账号密码" 勾选后调用）
 * 下次开 App 时可读出预填输入框
 */
export async function saveCredentials(username: string, password: string): Promise<void> {
  await AsyncStorage.setItem(CREDS_KEY, JSON.stringify({ username, password }));
}

/**
 * 抹掉记住的账号密码（未勾"记住"或用户主动清理）
 */
export async function clearCredentials(): Promise<void> {
  await AsyncStorage.removeItem(CREDS_KEY).catch(() => {});
}

/**
 * 读取记住的账号密码 —— 开登录页时预填输入框
 * 兼容 v31 老 key：若无新 creds 但有老 session，把用户名迁移过来（密码没法迁移）
 */
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
  try {
    const res = await apiFetch<{ anonymousId: string; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return { anonymousId: res.anonymousId, username: res.username };
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw e;
  }
}

export async function registerApi(username: string, password: string): Promise<Session> {
  try {
    const res = await apiFetch<{ anonymousId: string; username: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    return { anonymousId: res.anonymousId, username: res.username };
  } catch (e) {
    if (e instanceof ApiError) throw new Error(e.message);
    throw e;
  }
}


