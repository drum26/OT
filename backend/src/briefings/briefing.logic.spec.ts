import { validateConduct } from './briefing.logic';
import { computeNextCheck, validateCheckConduct } from '../checks/check.logic';
import { notificationStage } from '../notifications/notification.logic';
import { sanitize } from '../core/audit.service';
import { verifyFileContent } from '../common/upload';
import { assertSafeTemplate } from '../templates/templates.controller';
import { parseDateOnly } from '../common/dates';

const d = (s: string) => parseDateOnly(s)!;
const today = d('2026-06-01');

describe('регистрация инструктажа', () => {
  const ok = { conductedDate: d('2026-05-30'), today, responsibleEmployeeId: 'R', participants: [{ employeeId: 'E', result: 'COMPLETED' }] };
  it('корректные данные', () => expect(validateConduct(ok, { requireTopic: false, requireDocument: false })).toEqual([]));
  it('нельзя отметить проведённым без обязательных полей', () => {
    const e = validateConduct({ ...ok, responsibleEmployeeId: null, conductedDate: d('2026-06-05') }, { requireTopic: true, requireDocument: true });
    expect(e.join(' ')).toMatch(/ответственное/);
    expect(e.join(' ')).toMatch(/позже текущей/);
    expect(e.join(' ')).toMatch(/тема/);
    expect(e.join(' ')).toMatch(/инструкция/);
  });
  it('подтверждение требует способа и только для прошедших', () => {
    expect(validateConduct({ ...ok, participants: [{ employeeId: 'E', result: 'COMPLETED', confirmed: true }] }, { requireTopic: false, requireDocument: false })[0]).toMatch(/способ/);
    expect(validateConduct({ ...ok, participants: [{ employeeId: 'E', result: 'ABSENT', confirmed: true, confirmationMethod: 'OTHER' }] }, { requireTopic: false, requireDocument: false })[0]).toMatch(/только/);
  });
});

describe('проверка знаний', () => {
  const rule = { id: 'r', typeId: 't', positionId: null, workCategory: null, unitId: null, periodMonths: 12, periodDays: null, initialDueDays: null, resetOnTransfer: false, retestDays: 30, basis: 'осн', validFrom: d('2000-01-01'), validTo: null, isActive: true };
  it('дата следующей проверки по правилу, повторная при неудаче, ручная с основанием', () => {
    expect(computeNextCheck('PASSED', d('2026-01-15'), rule).date!.toISOString().slice(0, 10)).toBe('2027-01-15');
    expect(computeNextCheck('FAILED', d('2026-01-15'), rule).date!.toISOString().slice(0, 10)).toBe('2026-02-14');
    expect(computeNextCheck('FAILED', d('2026-01-15'), { ...rule, retestDays: null }).date).toBeNull();
    expect(computeNextCheck('PASSED', d('2026-01-15'), null).date).toBeNull();
    const m = computeNextCheck('PASSED', d('2026-01-15'), rule, { date: d('2026-07-01'), basis: 'приказ' });
    expect(m).toMatchObject({ manual: true, basis: 'приказ' });
    expect(computeNextCheck('ABSENT', d('2026-01-15'), rule).date).toBeNull();
  });
  it('протокол и комиссия обязательны', () => {
    const e = validateCheckConduct({ conductedDate: d('2026-05-01'), today, requireProtocol: true, results: [{ employeeId: 'E', outcome: 'PASSED', nextCheckDate: '2027-01-01' }] });
    expect(e.join(' ')).toMatch(/комиссию/);
    expect(e.join(' ')).toMatch(/протокола/);
    expect(e.join(' ')).toMatch(/основание/);
  });
});

describe('уведомления', () => {
  const r = { daysBefore: [7, 1], notifyOnDueDate: true, notifyOverdue: true };
  it('этапы до срока, в день срока и после', () => {
    expect(notificationStage(d('2026-06-20'), today, r)).toBeNull();
    expect(notificationStage(d('2026-06-08'), today, r)).toBe('before-7');
    expect(notificationStage(d('2026-06-05'), today, r)).toBe('before-7');
    expect(notificationStage(d('2026-06-02'), today, r)).toBe('before-1');
    expect(notificationStage(today, today, r)).toBe('due');
    expect(notificationStage(d('2026-05-01'), today, r)).toBe('overdue');
    expect(notificationStage(d('2026-05-01'), today, { ...r, notifyOverdue: false })).toBeNull();
  });
});

describe('безопасность', () => {
  it('секреты не попадают в журнал', () => {
    expect(sanitize({ login: 'a', password: 'x', nested: { refreshToken: 't' } })).toEqual({ login: 'a', password: '***', nested: { refreshToken: '***' } });
  });
  it('проверка содержимого файлов по сигнатуре', () => {
    expect(verifyFileContent(Buffer.from('%PDF-1.7'), 'pdf')).toBe(true);
    expect(verifyFileContent(Buffer.from('MZ....'), 'pdf')).toBe(false);
    expect(verifyFileContent(Buffer.from('a;b\n1;2'), 'csv')).toBe(true);
    expect(verifyFileContent(Buffer.from([0x41, 0x00, 0x42]), 'csv')).toBe(false);
    expect(verifyFileContent(Buffer.from('x'), 'exe')).toBe(false);
  });
  it('шаблоны: запрещены скрипты и неэкранированный вывод', () => {
    expect(() => assertSafeTemplate('<p>{{{raw}}}</p>')).toThrow();
    expect(() => assertSafeTemplate('<script>alert(1)</script>')).toThrow();
    expect(() => assertSafeTemplate('<img src=x onerror=alert(1)>')).toThrow();
    expect(() => assertSafeTemplate('<p>{{name}}</p>')).not.toThrow();
  });
});
