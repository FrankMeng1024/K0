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

const ANON_ID_KEY = 'k0.anonymous_id';

/**
 * 拿或生成 anonymous_id UUID
 */
export async function getAnonymousId(): Promise<string> {
  let id = await AsyncStorage.getItem(ANON_ID_KEY);
  if (!id) {
    // 简易 UUID v4（不依赖 crypto 库）
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    await AsyncStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}
