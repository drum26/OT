import { api, qs } from '../api/client';

/** Скачивание файла, сформированного сервером (с авторизацией) */
export async function download(url: string, params: Record<string, unknown> = {}, fallbackName = 'export') {
  const r = await api.get(url, { params: qs(params), responseType: 'blob' });
  const cd: string = r.headers['content-disposition'] ?? '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)/);
  const name = m ? decodeURIComponent(m[1]) : fallbackName;
  const href = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Открытие печатной формы (HTML с сервера) в новом окне через blob: URL */
export async function openPrint(url: string, params: Record<string, unknown> = {}) {
  const w = window.open('', '_blank');
  const r = await api.get(url, { params: qs(params), responseType: 'blob' });
  const blob = new Blob([r.data], { type: 'text/html;charset=utf-8' });
  const href = URL.createObjectURL(blob);
  if (w) w.location.href = href;
  else window.location.href = href;
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
