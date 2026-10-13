import { addMonths, diffDays } from '../common/dates';

export interface StandardLite {
  id: string;
  ppeItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
  wearMonths: number | null;
  wearCondition: string | null;
  basis: string;
}

export interface IssueLite {
  id: string;
  ppeItemId: string;
  itemName?: string;
  quantity: number;
  returnedQty: number;
  issueDate: Date;
  plannedReplacementDate: Date | null;
  receiptConfirmed: boolean;
}

export type PpeNeedStatus = 'NOT_PROVIDED' | 'PARTIAL' | 'REPLACEMENT_OVERDUE' | 'AWAITING_CONFIRMATION' | 'REPLACEMENT_DUE' | 'PROVIDED' | 'EXTRA';

export interface PpeNeedRow {
  standardId: string | null;
  ppeItemId: string;
  itemName: string;
  unit: string;
  normQty: number;
  wearMonths: number | null;
  wearCondition: string | null;
  basis: string | null;
  /** Числится выданным (без учёта возвратов/списаний) */
  issuedQty: number;
  /** Из них с подтверждённым получением */
  confirmedQty: number;
  /** Из них с истёкшим сроком плановой замены */
  overdueQty: number;
  /** Остаток потребности: сколько нужно выдать (недостача + просроченная замена) */
  toIssueQty: number;
  lastIssueDate: Date | null;
  nextReplacementDate: Date | null;
  status: PpeNeedStatus;
}

export const activeQty = (i: IssueLite) => Math.max(0, i.quantity - i.returnedQty);

/** Плановая дата замены по календарному сроку носки. Для СИЗ «до износа» и т.п. дата не рассчитывается. */
export function replacementDate(issueDate: Date, wearMonths: number | null | undefined): Date | null {
  return wearMonths && wearMonths > 0 ? addMonths(issueDate, wearMonths) : null;
}

/**
 * Расчёт обеспеченности сотрудника СИЗ по действующим нормам его должности.
 * Запись о выдаче без подтверждения получения не считается фактическим обеспечением (статус AWAITING_CONFIRMATION).
 */
export function computePpeNeeds(standards: StandardLite[], issues: IssueLite[], today: Date, warnDays: number): PpeNeedRow[] {
  const rows: PpeNeedRow[] = [];
  const byItem = new Map<string, IssueLite[]>();
  for (const i of issues) {
    if (activeQty(i) <= 0) continue;
    byItem.set(i.ppeItemId, [...(byItem.get(i.ppeItemId) ?? []), i]);
  }
  const usedItems = new Set<string>();
  // Несколько норм на одну позицию (разные основания) — суммируются
  const stdByItem = new Map<string, StandardLite[]>();
  for (const s of standards) stdByItem.set(s.ppeItemId, [...(stdByItem.get(s.ppeItemId) ?? []), s]);

  for (const [itemId, stds] of stdByItem) {
    usedItems.add(itemId);
    const s0 = stds[0];
    const normQty = stds.reduce((a, s) => a + s.quantity, 0);
    const list = byItem.get(itemId) ?? [];
    const issuedQty = list.reduce((a, i) => a + activeQty(i), 0);
    const confirmedQty = list.filter((i) => i.receiptConfirmed).reduce((a, i) => a + activeQty(i), 0);
    const overdue = list.filter((i) => i.plannedReplacementDate && i.plannedReplacementDate < today);
    const overdueQty = overdue.reduce((a, i) => a + activeQty(i), 0);
    const validQty = issuedQty - overdueQty;
    const toIssueQty = Math.max(0, normQty - validQty);
    const dates = list.map((i) => i.plannedReplacementDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const nextReplacementDate = dates[0] ?? null;
    const lastIssueDate = list.map((i) => i.issueDate).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

    let status: PpeNeedStatus;
    if (issuedQty === 0) status = 'NOT_PROVIDED';
    else if (issuedQty < normQty) status = 'PARTIAL';
    else if (overdueQty > 0) status = 'REPLACEMENT_OVERDUE';
    else if (confirmedQty < normQty) status = 'AWAITING_CONFIRMATION';
    else if (nextReplacementDate && diffDays(nextReplacementDate, today) <= warnDays) status = 'REPLACEMENT_DUE';
    else status = 'PROVIDED';

    rows.push({
      standardId: s0.id, ppeItemId: itemId, itemName: s0.itemName, unit: s0.unit, normQty,
      wearMonths: s0.wearMonths, wearCondition: s0.wearCondition, basis: stds.map((s) => s.basis).join('; '),
      issuedQty, confirmedQty, overdueQty, toIssueQty, lastIssueDate, nextReplacementDate, status,
    });
  }
  // Выданные СИЗ вне действующих норм (например, после перевода) — для информации
  for (const [itemId, list] of byItem) {
    if (usedItems.has(itemId)) continue;
    const issuedQty = list.reduce((a, i) => a + activeQty(i), 0);
    rows.push({
      standardId: null, ppeItemId: itemId, itemName: list[0].itemName ?? '', unit: '', normQty: 0, wearMonths: null, wearCondition: null, basis: null,
      issuedQty, confirmedQty: list.filter((i) => i.receiptConfirmed).reduce((a, i) => a + activeQty(i), 0),
      overdueQty: 0, toIssueQty: 0, lastIssueDate: list.map((i) => i.issueDate).sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
      nextReplacementDate: list.map((i) => i.plannedReplacementDate).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null,
      status: 'EXTRA',
    });
  }
  return rows.sort((a, b) => a.itemName.localeCompare(b.itemName, 'ru'));
}

export const PPE_STATUS_RU: Record<PpeNeedStatus, string> = {
  NOT_PROVIDED: 'Не выдано', PARTIAL: 'Выдано частично', REPLACEMENT_OVERDUE: 'Просрочена замена', AWAITING_CONFIRMATION: 'Ожидает подтверждения получения',
  REPLACEMENT_DUE: 'Приближается замена', PROVIDED: 'Обеспечен', EXTRA: 'Вне норм должности',
};

export const NEEDS_ACTION: PpeNeedStatus[] = ['NOT_PROVIDED', 'PARTIAL', 'REPLACEMENT_OVERDUE'];
