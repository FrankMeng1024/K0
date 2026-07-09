// K0 API client
// Refactor Phase 1 (2026-07-09): 所有请求带 JWT Authorization header（除 skipAuth）
// 全局禁客户端缓存（Sprint 16 R20 决策保留）
import { getSessionSync } from './auth';

const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://api.k0.yiiling.cn';

// debug 用
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

type ApiInit = RequestInit & { skipAuth?: boolean };

/**
 * Generic fetch to K0 backend
 * - 自动带 Authorization: Bearer <token>（除 skipAuth）
 * - GET 加 _t=timestamp 防中间层缓存
 * - fetch cache:'no-store' 强制走网络
 */
export async function apiFetch<T>(path: string, init?: ApiInit): Promise<T> {
  const method = (init?.method || 'GET').toUpperCase();
  const sep = path.includes('?') ? '&' : '?';
  const cacheBustedPath = method === 'GET' ? `${path}${sep}_t=${Date.now()}` : path;
  const url = `${API_BASE}${cacheBustedPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    ...(init?.headers as Record<string, string> || {}),
  };

  // 注入 Bearer token（除 skipAuth 明确禁用）
  if (!init?.skipAuth) {
    const sess = getSessionSync();
    if (sess?.token) {
      headers['Authorization'] = `Bearer ${sess.token}`;
    }
  }

  const controller = new AbortController();
  const timeoutMs = 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  console.log('[apiFetch]', method, url);

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers, signal: controller.signal, cache: 'no-store' });
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
    // Phase 1 (QA B3): 401 → 清 session + redirect login，避免 app brick
    if (response.status === 401 && !init?.skipAuth) {
      try {
        const { clearSession } = await import('./auth');
        await clearSession();
      } catch {}
      // Web/RN 通用：Expo Router 会在 _layout auth guard 里 redirect；
      // 保底直接改 location（web only）避免用户卡死
      if (typeof window !== 'undefined' && window.location) {
        window.location.href = '/login';
      }
    }
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

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: 'GET' });
}
