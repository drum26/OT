import axios, { AxiosError, AxiosRequestConfig } from 'axios';

/**
 * HTTP-клиент. Access-токен хранится только в памяти (не в localStorage — защита от XSS-кражи),
 * refresh-токен — в httpOnly cookie. При 401 выполняется одно обновление токена для всех ожидающих запросов.
 */
let accessToken: string | null = null;
let refreshing: Promise<string | null> | null = null;
let onLogout: (() => void) | null = null;

export const setAccessToken = (t: string | null) => { accessToken = t; };
export const setLogoutHandler = (fn: () => void) => { onLogout = fn; };

export const api = axios.create({ baseURL: '/api', withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } });

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

export async function refreshToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = axios
      .post('/api/auth/refresh', null, { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
      .then((r) => { accessToken = r.data.accessToken; return accessToken; })
      .catch(() => { accessToken = null; return null; })
      .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  }
  return refreshing;
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const cfg = error.config as AxiosRequestConfig & { _retry?: boolean };
  if (error.response?.status === 401 && cfg && !cfg._retry && !cfg.url?.startsWith('/auth/')) {
    cfg._retry = true;
    const t = await refreshToken();
    if (t) return api(cfg);
    onLogout?.();
  }
  return Promise.reject(error);
});

/** Текст ошибки для пользователя */
export function errorText(e: unknown): string {
  const ax = e as AxiosError<any>;
  const m = ax?.response?.data?.message;
  if (Array.isArray(m)) return m.join('; ');
  if (typeof m === 'string') return m;
  if (ax?.response?.status === 403) return 'Недостаточно прав';
  if (ax?.code === 'ERR_NETWORK') return 'Сервер недоступен';
  return (e as Error)?.message ?? 'Ошибка';
}

export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

/** Параметры запроса: массивы передаются через запятую, пустые значения отбрасываются */
export function qs(params: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    out[k] = Array.isArray(v) ? v.join(',') : String(v);
  }
  return out;
}
