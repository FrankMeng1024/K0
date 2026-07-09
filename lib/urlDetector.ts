// K0 lib - URL 检测
// Refactor Phase 1 (2026-07-09): anonymousId 移除，用户身份由 JWT 承载

const XIAOYUZHOU_RE = /xiaoyuzhoufm\.com\/episode\/[a-f0-9]{24}/i;
const APPLE_RE = /podcasts\.apple\.com\/[^/]+\/podcast\/(?:[^/?]+\/)?id\d+/i;

export type UrlType = 'xiaoyuzhou' | 'apple' | 'text';

export function detectUrlType(text: string): UrlType {
  const trimmed = (text || '').trim();
  if (XIAOYUZHOU_RE.test(trimmed)) return 'xiaoyuzhou';
  if (APPLE_RE.test(trimmed)) return 'apple';
  return 'text';
}
