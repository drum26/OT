import { evaluateCompliance, nextDateByRule, PeriodRule, selectRule } from './rules';
import { addMonths, parseDateOnly } from '../common/dates';

const d = (s: string) => parseDateOnly(s)!;
const rule = (p: Partial<PeriodRule>): PeriodRule => ({
  id: Math.random().toString(), typeId: 'T', positionId: null, workCategory: null, unitId: null, periodMonths: 12, periodDays: null,
  initialDueDays: null, resetOnTransfer: false, basis: 'тест', validFrom: d('2000-01-01'), validTo: null, isActive: true, ...p,
});
const ctx = { positionId: 'P1', workCategory: 'A', unitChain: ['U2', 'U1'] };

describe('selectRule', () => {
  it('выбирает наиболее специфичное правило: должность > категория > подразделение > общее', () => {
    const general = rule({ id: 'g' });
    const unit = rule({ id: 'u', unitId: 'U1' });
    const cat = rule({ id: 'c', workCategory: 'A' });
    const pos = rule({ id: 'p', positionId: 'P1' });
    expect(selectRule([general, unit], 'T', ctx, d('2026-01-01'))!.id).toBe('u');
    expect(selectRule([general, unit, cat], 'T', ctx, d('2026-01-01'))!.id).toBe('c');
    expect(selectRule([general, unit, cat, pos], 'T', ctx, d('2026-01-01'))!.id).toBe('p');
  });

  it('учитывает период действия правила (версии правил)', () => {
    const old = rule({ id: 'old', periodMonths: 6, validTo: d('2024-12-31') });
    const neu = rule({ id: 'new', periodMonths: 12, validFrom: d('2025-01-01') });
    expect(selectRule([old, neu], 'T', ctx, d('2024-06-01'))!.id).toBe('old');
    expect(selectRule([old, neu], 'T', ctx, d('2025-06-01'))!.id).toBe('new');
  });

  it('не применяет правила другой должности, категории, неактивные и другого вида', () => {
    expect(selectRule([rule({ positionId: 'P2' })], 'T', ctx, d('2026-01-01'))).toBeNull();
    expect(selectRule([rule({ workCategory: 'B' })], 'T', ctx, d('2026-01-01'))).toBeNull();
    expect(selectRule([rule({ isActive: false })], 'T', ctx, d('2026-01-01'))).toBeNull();
    expect(selectRule([rule({ typeId: 'X' })], 'T', ctx, d('2026-01-01'))).toBeNull();
    expect(selectRule([rule({ unitId: 'U9' })], 'T', ctx, d('2026-01-01'))).toBeNull();
  });
});

describe('даты', () => {
  it('прибавление месяцев ограничивается концом месяца', () => {
    expect(addMonths(d('2025-01-31'), 1).toISOString().slice(0, 10)).toBe('2025-02-28');
    expect(addMonths(d('2024-01-31'), 1).toISOString().slice(0, 10)).toBe('2024-02-29');
    expect(addMonths(d('2025-03-15'), 12).toISOString().slice(0, 10)).toBe('2026-03-15');
  });
  it('без периода правило не задаёт дату следующего мероприятия', () => {
    expect(nextDateByRule(d('2025-01-01'), rule({ periodMonths: null }))).toBeNull();
    expect(nextDateByRule(d('2025-01-01'), rule({ periodMonths: 6, periodDays: 10 }))!.toISOString().slice(0, 10)).toBe('2025-07-11');
  });
});

describe('evaluateCompliance', () => {
  const today = d('2026-06-01');
  const base = { today, upcomingDays: 30, hireDate: d('2020-01-01'), lastTransferDate: null };

  it('нет прохождения — просрочено от даты приёма + initialDueDays', () => {
    const r = evaluateCompliance({ ...base, rule: rule({ initialDueDays: 10 }), lastDone: null });
    expect(r.status).toBe('MISSING');
    expect(r.dueDate!.toISOString().slice(0, 10)).toBe('2020-01-11');
  });

  it('недавно принятый сотрудник — первичное прохождение предстоит', () => {
    const r = evaluateCompliance({ ...base, hireDate: d('2026-05-25'), rule: rule({ initialDueDays: 30 }), lastDone: null });
    expect(r.status).toBe('UPCOMING');
  });

  it('используется сохранённая дата следующего прохождения (правило на дату проведения)', () => {
    const r = evaluateCompliance({ ...base, rule: rule({ periodMonths: 1 }), lastDone: { date: d('2026-01-10'), nextDueDate: d('2027-01-10') } });
    expect(r.status).toBe('OK');
    expect(r.dueDate!.toISOString().slice(0, 10)).toBe('2027-01-10');
  });

  it('срок истёк — OVERDUE, приближается — UPCOMING', () => {
    expect(evaluateCompliance({ ...base, rule: rule({}), lastDone: { date: d('2025-05-01'), nextDueDate: null } }).status).toBe('OVERDUE');
    expect(evaluateCompliance({ ...base, rule: rule({}), lastDone: { date: d('2025-06-20'), nextDueDate: null } }).status).toBe('UPCOMING');
  });

  it('прохождение до приёма не засчитывается (повторный приём)', () => {
    const r = evaluateCompliance({ ...base, hireDate: d('2026-01-01'), rule: rule({}), lastDone: { date: d('2025-12-01'), nextDueDate: d('2026-12-01') } });
    expect(r.status).toBe('MISSING');
  });

  it('resetOnTransfer: после перевода требуется повторное прохождение', () => {
    const r = evaluateCompliance({ ...base, lastTransferDate: d('2026-03-01'), rule: rule({ periodMonths: null, resetOnTransfer: true }), lastDone: { date: d('2020-01-01'), nextDueDate: null } });
    expect(r.status).toBe('MISSING');
    const ok = evaluateCompliance({ ...base, lastTransferDate: d('2026-03-01'), rule: rule({ periodMonths: null, resetOnTransfer: true }), lastDone: { date: d('2026-03-02'), nextDueDate: null } });
    expect(ok.status).toBe('OK');
  });

  it('отрицательный результат после последнего успешного — FAILED (сотрудник не считается прошедшим)', () => {
    const r = evaluateCompliance({
      ...base, rule: rule({}), lastDone: { date: d('2025-01-01'), nextDueDate: d('2026-12-01') }, lastFailed: { date: d('2026-02-01'), nextDueDate: d('2026-03-01') },
    });
    expect(r.status).toBe('FAILED');
    // повторная успешная проверка после неудачной снимает статус
    const r2 = evaluateCompliance({
      ...base, rule: rule({}), lastDone: { date: d('2026-03-01'), nextDueDate: d('2027-03-01') }, lastFailed: { date: d('2026-02-01'), nextDueDate: null },
    });
    expect(r2.status).toBe('OK');
  });
});
