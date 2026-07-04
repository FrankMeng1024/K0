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
 * Generic POST to the K0 backend API.
 * Throws ApiError for non-2xx responses using the standard error envelope.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const url = `${API_BASE}${path}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    throw new ApiError(
      'NETWORK_ERROR',
      '网络连接失败，请检查网络后重试。',
      networkError
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new ApiError('PARSE_ERROR', '服务器返回了无效数据。');
  }

  if (!response.ok) {
    const errorEnvelope = json as { error?: { code?: string; message?: string; details?: unknown } };
    const err = errorEnvelope?.error;
    throw new ApiError(
      err?.code || 'UNKNOWN_ERROR',
      err?.message || '出了点问题，稍后再试。',
      err?.details
    );
  }

  return json as T;
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
