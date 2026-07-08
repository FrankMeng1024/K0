// K0 lib - URL 检测 + anonymous_id 管理
import AsyncStorage from '@react-native-async-storage/async-storage';

const XIAOYUZHOU_RE = /xiaoyuzhoufm\.com\/episode\/[a-f0-9]{24}/i;
const APPLE_RE = /podcasts\.apple\.com\/[^/]+\/podcast\/(?:[^/?]+\/)?id\d+/i;

export type UrlType = 'xiaoyuzhou' | 'apple' | 'text';

export function detectUrlType(text: string): UrlType {
  const trimmed = (text || '').trim();
  if (XIAOYUZHOU_RE.test(trimmed)) return 'xiaoyuzhou';
  if (APPLE_RE.test(trimmed)) return 'apple';
  return 'text';
}

const SESSION_KEY = 'k0.session';
const ANON_ID_KEY = 'k0.anonymous_id';

/**
 * 拿 anonymous_id
 * Sprint 16 R2: 优先从登录 session 读，未登录则回退到旧 AsyncStorage key（兼容老用户），最后生成新的
 */
export async function getAnonymousId(): Promise<string> {
  // 1) 已登录 session
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.anonymousId) return s.anonymousId;
    }
  } catch {}

  // 2) 老 key 兼容
  let id = await AsyncStorage.getItem(ANON_ID_KEY);
  if (!id) {
    // 3) 生成新 UUID v4
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    await AsyncStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}
