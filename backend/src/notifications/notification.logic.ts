import { diffDays } from '../common/dates';

export interface StageRule {
  daysBefore: number[];
  notifyOnDueDate: boolean;
  notifyOverdue: boolean;
}

/**
 * Этап уведомления для срока. Возвращает ключ этапа, используемый для идемпотентности
 * (одно уведомление на этап, даже если задание запускается многократно или пропустило день).
 *  - до срока: ближайший порог из daysBefore, не меньший оставшегося количества дней (`before-7`);
 *  - в день срока: `due`;
 *  - после срока: `overdue`.
 */
export function notificationStage(due: Date, today: Date, r: StageRule): string | null {
  const left = diffDays(due, today);
  if (left < 0) return r.notifyOverdue ? 'overdue' : null;
  if (left === 0) return r.notifyOnDueDate ? 'due' : null;
  const thresholds = [...r.daysBefore].filter((d) => d > 0).sort((a, b) => a - b);
  const t = thresholds.find((d) => d >= left);
  return t === undefined ? null : `before-${t}`;
}

export function stageText(stage: string, due: string): string {
  if (stage === 'overdue') return `Срок ${due} пропущен`;
  if (stage === 'due') return `Срок — сегодня (${due})`;
  return `Срок — ${due}`;
}
