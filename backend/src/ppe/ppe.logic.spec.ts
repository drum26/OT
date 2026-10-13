import { computePpeNeeds, replacementDate, StandardLite, IssueLite } from './ppe.logic';
import { parseDateOnly } from '../common/dates';

const d = (s: string) => parseDateOnly(s)!;
const today = d('2026-06-01');
const std = (p: Partial<StandardLite> = {}): StandardLite => ({ id: 's1', ppeItemId: 'I1', itemName: 'Костюм', quantity: 1, unit: 'шт.', wearMonths: 12, wearCondition: null, basis: 'тест', ...p });
const issue = (p: Partial<IssueLite> = {}): IssueLite => ({
  id: Math.random().toString(), ppeItemId: 'I1', quantity: 1, returnedQty: 0, issueDate: d('2026-01-10'), plannedReplacementDate: d('2027-01-10'), receiptConfirmed: true, ...p,
});

describe('computePpeNeeds', () => {
  it('нет выдачи — не выдано, требуется выдать по норме', () => {
    const [r] = computePpeNeeds([std({ quantity: 2 })], [], today, 14);
    expect(r.status).toBe('NOT_PROVIDED');
    expect(r.toIssueQty).toBe(2);
  });
  it('частичная выдача', () => {
    const [r] = computePpeNeeds([std({ quantity: 3 })], [issue()], today, 14);
    expect(r.status).toBe('PARTIAL');
    expect(r.toIssueQty).toBe(2);
  });
  it('выдача без подтверждения получения не считается обеспечением', () => {
    const [r] = computePpeNeeds([std()], [issue({ receiptConfirmed: false })], today, 14);
    expect(r.status).toBe('AWAITING_CONFIRMATION');
    expect(r.confirmedQty).toBe(0);
  });
  it('просроченная плановая замена увеличивает потребность', () => {
    const [r] = computePpeNeeds([std()], [issue({ plannedReplacementDate: d('2026-05-01') })], today, 14);
    expect(r.status).toBe('REPLACEMENT_OVERDUE');
    expect(r.toIssueQty).toBe(1);
  });
  it('приближающаяся замена', () => {
    const [r] = computePpeNeeds([std()], [issue({ plannedReplacementDate: d('2026-06-10') })], today, 14);
    expect(r.status).toBe('REPLACEMENT_DUE');
  });
  it('возвращённые и списанные единицы не учитываются', () => {
    const [r] = computePpeNeeds([std()], [issue({ returnedQty: 1 })], today, 14);
    expect(r.status).toBe('NOT_PROVIDED');
  });
  it('СИЗ без календарного срока: дата замены не рассчитывается', () => {
    expect(replacementDate(d('2026-01-01'), null)).toBeNull();
    const [r] = computePpeNeeds([std({ wearMonths: null, wearCondition: 'до износа' })], [issue({ plannedReplacementDate: null })], today, 14);
    expect(r.status).toBe('PROVIDED');
    expect(r.nextReplacementDate).toBeNull();
  });
  it('выданное вне норм отображается отдельно', () => {
    const rows = computePpeNeeds([std()], [issue(), issue({ ppeItemId: 'I2', itemName: 'Каска' })], today, 14);
    expect(rows.find((r) => r.ppeItemId === 'I2')!.status).toBe('EXTRA');
  });
});
