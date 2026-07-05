// K0 API client — Sprint 2
// All requests go to EXPO_PUBLIC_API_URL (defaults to localhost:3002)
// Auth: MVP dev_default (AUTH_ENABLED=false → backend uses user_id=1 automatically)

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3002';

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

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: controller.signal });
  } catch (networkError: any) {
    clearTimeout(timer);
    if (networkError?.name === 'AbortError') {
      throw new ApiError('NETWORK_TIMEOUT', '请求超时（30 秒），网络可能不稳定，稍后再试。', networkError);
    }
    throw new ApiError('NETWORK_ERROR', '网络连接失败，请检查网络后重试。', networkError);
  }
  clearTimeout(timer);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('PARSE_ERROR', '服务器返回了无效数据。');
  }

  if (!response.ok) {
    const envelope = json as { error?: { code?: string; message?: string; details?: unknown } };
    const err = envelope?.error;
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
