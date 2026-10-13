import { addDays } from '../common/dates';
import { nextDateByRule, PeriodRule } from '../compliance/rules';

export interface CheckResultInput {
  employeeId: string;
  outcome: 'PASSED' | 'FAILED' | 'ABSENT';
  nextCheckDate?: string | null;
  nextCheckBasis?: string | null;
}

export interface CheckConductInput {
  conductedDate: Date;
  today: Date;
  commissionId?: string | null;
  responsibleEmployeeId?: string | null;
  protocolNumber?: string | null;
  protocolDate?: Date | null;
  requireProtocol: boolean;
  results: CheckResultInput[];
}

export function validateCheckConduct(i: CheckConductInput): string[] {
  const e: string[] = [];
  if (i.conductedDate > i.today) e.push('Дата проведения не может быть позже текущей даты');
  if (!i.commissionId && !i.responsibleEmployeeId) e.push('Укажите комиссию или ответственное лицо');
  if (!i.results.length) e.push('Нет участников');
  const hasResult = i.results.some((r) => r.outcome !== 'ABSENT');
  if (i.requireProtocol && hasResult && (!i.protocolNumber?.trim() || !i.protocolDate)) e.push('Укажите номер и дату протокола');
  if (i.protocolDate && i.protocolDate < i.conductedDate) e.push('Дата протокола раньше даты проверки');
  const seen = new Set<string>();
  for (const r of i.results) {
    if (seen.has(r.employeeId)) e.push('Сотрудник указан дважды');
    seen.add(r.employeeId);
    if (r.nextCheckDate && !r.nextCheckBasis?.trim()) e.push('При ручном указании даты следующей проверки требуется основание');
    if (r.nextCheckDate && r.outcome === 'ABSENT') e.push('Для отсутствовавшего дата следующей проверки не указывается');
  }
  return [...new Set(e)];
}

/**
 * Дата следующей проверки:
 *  - ручная дата (с основанием) имеет приоритет;
 *  - PASSED → период правила, действовавшего на дату проверки;
 *  - FAILED → срок повторной проверки (retestDays), если он задан правилом;
 *  - иначе — не определена (требуется ручное планирование).
 */
export function computeNextCheck(
  outcome: 'PASSED' | 'FAILED' | 'ABSENT',
  conductedDate: Date,
  rule: PeriodRule | null,
  manual?: { date: Date; basis: string } | null,
): { date: Date | null; ruleId: string | null; manual: boolean; basis: string | null } {
  if (outcome === 'ABSENT') return { date: null, ruleId: null, manual: false, basis: null };
  if (manual) return { date: manual.date, ruleId: rule?.id ?? null, manual: true, basis: manual.basis };
  if (outcome === 'PASSED') {
    const d = nextDateByRule(conductedDate, rule);
    return { date: d, ruleId: d ? rule!.id : null, manual: false, basis: d ? rule!.basis : null };
  }
  if (rule?.retestDays) return { date: addDays(conductedDate, rule.retestDays), ruleId: rule.id, manual: false, basis: rule.basis };
  return { date: null, ruleId: null, manual: false, basis: null };
}
