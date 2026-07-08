// K0 auth session — Sprint 16 R2
// 双层 session:
//   - 内存态 memorySession: module-level 变量，App 运行时有效，杀 App 就没了
//   - 持久态 AsyncStorage: 只有勾"记得我"才写；下次冷启动能读回
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, ApiError } from './api';

export type Session = {
  anonymousId: string;
  username: string;
};

const SESSION_KEY = 'k0.session';

// Sprint 16 R2 v31: module-level 内存 session
// 只在当前 App 运行期存活；杀 App 就没了（未勾"记得我"时的行为）
let memorySession: Session | null = null;

/**
 * 读 session —— 优先内存态，其次 AsyncStorage 持久态
 */
export async function getSession(): Promise<Session | null> {
  if (memorySession) return memorySession;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.anonymousId && s.username) {
      memorySession = s; // 缓存到内存
      return s;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 保存 session
 * @param persist true = 同时写 AsyncStorage（"记得我"）；false = 仅内存态
 */
export async function setSession(s: Session, persist = false): Promise<void> {
  memorySession = s;
  if (persist) {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } else {
    // 未勾记得我 —— 确保 AsyncStorage 里没残留旧持久态
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => {});
  }
}

export async function clearSession(): Promise<void> {
  memorySession = null;
  await AsyncStorage.removeItem(SESSION_KEY);
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

