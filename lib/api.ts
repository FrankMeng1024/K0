// K0 API client — Sprint 2
// All requests go to EXPO_PUBLIC_API_URL (defaults to prod URL for OTA safety)
// Sprint 16 R2 v30: prod URL 硬编码 fallback，杜绝 env 加载不到 embed 成 localhost 的问题

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.k0.yiiling.cn';

// Sprint 16 R2 debug: 暴露到全局便于手机上打开 upload modal 时用 console.log(API_BASE_DEBUG) 看
if (typeof globalThis !== 'undefined') {
  (globalThis as any).__K0_API_BASE__ = API_BASE;
}

export class ApiError extends Error {
  code: string;
  details?: unknown;

  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Generic fetch to the K0 backend API (any method).
 * Throws ApiError for non-2xx responses using the standard error envelope.
 * Sprint 8: 30s 超时 + AbortError → 友好错误
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...(init?.headers || {}) };

  const controller = new AbortController();
  const timeoutMs = 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Sprint 16 R2 v30: 详细日志便于查网络失败根因
  console.log('[apiFetch]', init?.method || 'GET', url);

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (networkError: any) {
    clearTimeout(timer);
    const errMsg = networkError?.message || String(networkError);
    console.log('[apiFetch] NETWORK ERROR:', errMsg, 'url:', url);
    if (networkError?.name === 'AbortError') {
      throw new ApiError('NETWORK_TIMEOUT', `请求超时（30 秒）。URL: ${url}`, networkError);
    }
    throw new ApiError('NETWORK_ERROR', `网络失败: ${errMsg}. URL: ${url}`, networkError);
  }
  clearTimeout(timer);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    console.log('[apiFetch] PARSE ERROR status:', response.status);
    throw new ApiError('PARSE_ERROR', `服务器返回无效数据 (status ${response.status})`);
  }

  if (!response.ok) {
    const envelope = json as { error?: string | { code?: string; message?: string; details?: unknown }; message?: string };
    // Sprint 16 R2: auth 路由用 flat error { error: 'CODE', message: '...' }；其他路由用嵌套 { error: { code, message } }
    if (typeof envelope?.error === 'string') {
      console.log('[apiFetch] API ERROR', response.status, envelope.error, envelope.message);
      throw new ApiError(envelope.error, envelope.message || '出了点问题，稍后再试。');
    }
    const err = envelope?.error as { code?: string; message?: string; details?: unknown } | undefined;
    console.log('[apiFetch] API ERROR', response.status, err?.code, err?.message);
    throw new ApiError(err?.code || 'UNKNOWN_ERROR', err?.message || '出了点问题，稍后再试。', err?.details);
  }

  return json as T;
}

/**
 * Generic POST to the K0 backend API.
 * Throws ApiError for non-2xx responses using the standard error envelope.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

/**
 * Generic GET to the K0 backend API.
 */
export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}

/** Import an episode from URL or text */
export type ImportBody =
  | { url: string; source?: 'auto' | 'apple' }
  | { source: 'text'; text: string };

export interface EpisodeObject {
  id: number;
  source: string;
  sourceUrl: string | null;
  sourceId: string | null;
  title: string;
  channel: string | null;
  duration: number | null;
  language: string;
  coverUrl: string | null;
  audioUrl: string | null;
  publishedAt: string | null;
  importStatus: string;
}

export interface ImportResponse {
  episode: EpisodeObject;
}

export function importEpisode(body: ImportBody): Promise<ImportResponse> {
  return apiPost<ImportResponse>('/api/episodes/import', body);
}
