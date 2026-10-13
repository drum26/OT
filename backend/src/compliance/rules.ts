import { addDays, addMonths, diffDays, maxDate } from '../common/dates';

/**
 * Общая модель правила периодичности (инструктажи и проверки знаний).
 * Значения периодов НЕ заданы в коде — они вносятся в справочник правил с указанием основания и периода действия.
 */
export interface PeriodRule {
  id: string;
  typeId: string;
  positionId: string | null;
  workCategory: string | null;
  unitId: string | null;
  periodMonths: number | null;
  periodDays: number | null;
  initialDueDays: number | null;
  resetOnTransfer: boolean;
  retestDays?: number | null;
  basis: string;
  validFrom: Date;
  validTo: Date | null;
  isActive: boolean;
}

export interface RuleContext {
  positionId: string;
  workCategory: string | null;
  /** Подразделение сотрудника и все родительские */
  unitChain: string[];
}

/** Специфичность: должность (4) > категория работ (2) > подразделение (1) > общее правило (0) */
export function ruleSpecificity(r: Pick<PeriodRule, 'positionId' | 'workCategory' | 'unitId'>): number {
  return (r.positionId ? 4 : 0) + (r.workCategory ? 2 : 0) + (r.unitId ? 1 : 0);
}

export function ruleValidOn(r: PeriodRule, date: Date): boolean {
  return r.isActive && r.validFrom <= date && (!r.validTo || r.validTo >= date);
}

export function ruleMatches(r: PeriodRule, ctx: RuleContext): boolean {
  if (r.positionId && r.positionId !== ctx.positionId) return false;
  if (r.workCategory && r.workCategory !== ctx.workCategory) return false;
  if (r.unitId && !ctx.unitChain.includes(r.unitId)) return false;
  return true;
}

/** Выбор применимого правила вида мероприятия на дату: самое специфичное, при равенстве — с более поздней датой начала */
export function selectRule<T extends PeriodRule>(rules: T[], typeId: string, ctx: RuleContext, date: Date): T | null {
  let best: T | null = null;
  for (const r of rules) {
    if (r.typeId !== typeId || !ruleValidOn(r, date) || !ruleMatches(r, ctx)) continue;
    if (!best) { best = r; continue; }
    const a = ruleSpecificity(r), b = ruleSpecificity(best);
    if (a > b || (a === b && r.validFrom > best.validFrom)) best = r;
  }
  return best;
}

/** Дата следующего мероприятия по правилу; null — правило не устанавливает периодичность */
export function nextDateByRule(from: Date, rule: Pick<PeriodRule, 'periodMonths' | 'periodDays'> | null): Date | null {
  if (!rule || (!rule.periodMonths && !rule.periodDays)) return null;
  let d = from;
  if (rule.periodMonths) d = addMonths(d, rule.periodMonths);
  if (rule.periodDays) d = addDays(d, rule.periodDays);
  return d;
}

export type ComplianceStatus = 'OK' | 'UPCOMING' | 'OVERDUE' | 'MISSING' | 'FAILED';

export interface ComplianceInput {
  rule: PeriodRule;
  today: Date;
  upcomingDays: number;
  hireDate: Date;
  /** Дата последнего перевода (для правил с resetOnTransfer) */
  lastTransferDate: Date | null;
  /** Последнее засчитанное прохождение (подтверждённое / с положительным результатом) */
  lastDone: { date: Date; nextDueDate: Date | null } | null;
  /** Последний неудовлетворительный результат после lastDone (для проверок знаний) */
  lastFailed?: { date: Date; nextDueDate: Date | null } | null;
  /** Ближайшее запланированное мероприятие этого вида */
  planned?: { date: Date | null; id: string } | null;
}

export interface ComplianceResult {
  status: ComplianceStatus;
  dueDate: Date | null;
  daysLeft: number | null;
  reason: string;
}

/**
 * Определение состояния требования для сотрудника.
 *  - прохождение до приёма (или до перевода при resetOnTransfer) не засчитывается;
 *  - при отсутствии прохождения срок = дата приёма/перевода + initialDueDays;
 *  - при наличии — срок = сохранённая дата следующего (рассчитанная по правилу, действовавшему на дату прохождения);
 *  - отрицательный результат проверки после последнего успешного — статус FAILED.
 */
export function evaluateCompliance(i: ComplianceInput): ComplianceResult {
  const base = i.rule.resetOnTransfer ? maxDate(i.hireDate, i.lastTransferDate)! : i.hireDate;
  const done = i.lastDone && i.lastDone.date >= base ? i.lastDone : null;
  const failed = i.lastFailed && i.lastFailed.date >= base && (!done || i.lastFailed.date >= done.date) ? i.lastFailed : null;
  const mk = (status: ComplianceStatus, due: Date | null, reason: string): ComplianceResult => ({
    status, dueDate: due, daysLeft: due ? diffDays(due, i.today) : null, reason,
  });

  if (failed) {
    const due = failed.nextDueDate ?? i.today;
    return mk('FAILED', due, 'Неудовлетворительный результат последней проверки');
  }
  if (!done) {
    const due = addDays(base, i.rule.initialDueDays ?? 0);
    if (due < i.today) return mk('MISSING', due, base === i.hireDate ? 'Нет сведений о прохождении после приёма' : 'Нет сведений о прохождении после перевода');
    return mk('UPCOMING', due, 'Требуется первичное прохождение');
  }
  const due = done.nextDueDate ?? nextDateByRule(done.date, i.rule);
  if (!due) return mk('OK', null, 'Пройдено (периодичность не установлена правилом)');
  if (due < i.today) return mk('OVERDUE', due, 'Срок истёк');
  if (diffDays(due, i.today) <= i.upcomingDays) return mk('UPCOMING', due, 'Приближается срок');
  return mk('OK', due, 'В норме');
}
