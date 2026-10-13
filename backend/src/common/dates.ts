/**
 * Работа с календарными датами (без времени). Все даты мероприятий представляются как Date в полночь UTC,
 * что соответствует типу DATE в PostgreSQL. «Сегодня» определяется в часовом поясе предприятия (APP_TIMEZONE).
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const s = String(value).trim().slice(0, 10);
  if (!DATE_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

export function formatDateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

/** Русский формат ДД.ММ.ГГГГ */
export function formatRu(d: Date | null | undefined): string {
  if (!d) return '';
  const s = d.toISOString();
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

export function todayInTz(tz = process.env.APP_TIMEZONE || 'Europe/Minsk', now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return parseDateOnly(parts)!;
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}

/** Прибавление месяцев с ограничением последним днём месяца (31.01 + 1 мес. = 28/29.02) */
export function addMonths(d: Date, months: number): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + months;
  const target = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return target;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function maxDate(...ds: (Date | null | undefined)[]): Date | null {
  let r: Date | null = null;
  for (const d of ds) if (d && (!r || d > r)) r = d;
  return r;
}
