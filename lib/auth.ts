// K0 auth session — Sprint 16 R2
// AsyncStorage 存 { anonymousId, username }，登录/注册后调用 setSession()
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch, ApiError } from './api';

export type Session = {
  anonymousId: string;
  username: string;
};

const SESSION_KEY = 'k0.session';

export async function getSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && s.anonymousId && s.username) return s;
    return null;
  } catch {
    return null;
  }
}

export async function setSession(s: Session): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export async function clearSession(): Promise<void> {
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
