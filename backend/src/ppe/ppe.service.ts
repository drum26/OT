import { Injectable } from '@nestjs/common';
import { ConfirmationMethod, PpeIssueStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { assertInScope, inScope, narrowUnits } from '../common/scope';
import { badRequest, notFound } from '../common/errors';
import { pageArgs } from '../common/pagination';
import { addDays, parseDateOnly, todayInTz } from '../common/dates';
import { toDate } from '../common/validation';
import { SettingsService } from '../core/settings.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { TableData } from '../core/export.service';
import { fullName } from '../employees/employees.service';
import { CONFIRM_RU } from '../briefings/briefings.service';
import { computePpeNeeds, IssueLite, PPE_STATUS_RU, PpeNeedRow, replacementDate, StandardLite } from './ppe.logic';
import {
  ConfirmReceiptDto, IssueDto, IssueQuery, NeedsQuery, PpeItemDto, PpeStandardDto, ReplacementDateDto, ReturnDto, StandardQuery, StockOperationDto,
  UpdatePpeItemDto, UpdatePpeStandardDto,
} from './ppe.dto';

export const ISSUE_STATUS_RU: Record<string, string> = { ACTIVE: 'Числится', PARTIALLY_CLOSED: 'Частично возвращено/списано', RETURNED: 'Возвращено', WRITTEN_OFF: 'Списано', REPLACED: 'Заменено' };
export const RETURN_TYPE_RU: Record<string, string> = { RETURN: 'Возврат', WRITE_OFF: 'Списание', REPLACEMENT: 'Замена' };

export interface EmployeeNeedRow extends PpeNeedRow {
  employeeId: string; personnelNumber: string; fullName: string; unitId: string; unitName: string; positionName: string;
}

const empSel = { select: { id: true, personnelNumber: true, lastName: true, firstName: true, middleName: true, unitId: true } } as const;

@Injectable()
export class PpeService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private tree: UnitTreeService) {}

  // ───── Справочник СИЗ
  items(q: { activeOnly?: boolean }) {
    return this.prisma.ppeItem.findMany({ where: q.activeOnly ? { status: 'ACTIVE' } : {}, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
  }
  createItem(dto: PpeItemDto) { return this.prisma.ppeItem.create({ data: dto }); }
  updateItem(id: string, dto: UpdatePpeItemDto) { return this.prisma.ppeItem.update({ where: { id }, data: dto }); }

  // ───── Нормы
  standards(q: StandardQuery) {
    const today = todayInTz();
    return this.prisma.ppeStandard.findMany({
      where: {
        positionId: q.positionId, ppeItemId: q.ppeItemId,
        ...(q.activeOnly ? { validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }] } : {}),
      },
      include: { position: { select: { id: true, name: true } }, ppeItem: { select: { id: true, name: true, unit: true } } },
      orderBy: [{ position: { name: 'asc' } }, { ppeItem: { name: 'asc' } }, { validFrom: 'desc' }],
    });
  }
  private standardData(dto: Partial<PpeStandardDto>) {
    if (dto.validFrom && dto.validTo && dto.validTo < dto.validFrom) throw badRequest('Дата окончания действия раньше даты начала');
    return { ...dto, validFrom: toDate(dto.validFrom) ?? undefined, validTo: toDate(dto.validTo) };
  }
  createStandard(dto: PpeStandardDto) { return this.prisma.ppeStandard.create({ data: this.standardData(dto) as any }); }
  updateStandard(id: string, dto: UpdatePpeStandardDto) { return this.prisma.ppeStandard.update({ where: { id }, data: this.standardData(dto) as any }); }

  // ───── Потребность
  private async activeStandardsByPosition(today: Date): Promise<Map<string, StandardLite[]>> {
    const list = await this.prisma.ppeStandard.findMany({
      where: { validFrom: { lte: today }, OR: [{ validTo: null }, { validTo: { gte: today } }], ppeItem: { status: 'ACTIVE' } },
      include: { ppeItem: { select: { name: true } } },
    });
    const m = new Map<string, StandardLite[]>();
    for (const s of list) {
      m.set(s.positionId, [...(m.get(s.positionId) ?? []), {
        id: s.id, ppeItemId: s.ppeItemId, itemName: s.ppeItem.name, quantity: s.quantity, unit: s.unit, wearMonths: s.wearMonths, wearCondition: s.wearCondition, basis: s.basis,
      }]);
    }
    return m;
  }

  private async openIssues(employeeIds?: string[]): Promise<Map<string, IssueLite[]>> {
    const list = await this.prisma.ppeIssue.findMany({
      where: { status: { in: ['ACTIVE', 'PARTIALLY_CLOSED'] }, employeeId: employeeIds ? { in: employeeIds } : undefined },
      include: { returns: { select: { quantity: true } }, ppeItem: { select: { name: true } } },
    });
    const m = new Map<string, IssueLite[]>();
    for (const i of list) {
      m.set(i.employeeId, [...(m.get(i.employeeId) ?? []), {
        id: i.id, ppeItemId: i.ppeItemId, itemName: i.ppeItem.name, quantity: i.quantity, returnedQty: i.returns.reduce((a, r) => a + r.quantity, 0),
        issueDate: i.issueDate, plannedReplacementDate: i.plannedReplacementDate, receiptConfirmed: i.receiptConfirmed,
      }]);
    }
    return m;
  }

  async employeeNeeds(user: AuthUser, employeeId: string) {
    const e = await this.prisma.employee.findUnique({ where: { id: employeeId }, include: { position: true } });
    if (!e) throw notFound('Сотрудник');
    assertInScope(user, e.unitId, 'сотруднику');
    const today = todayInTz();
    const warn = Number(await this.settings.get('ppe.replacementWarningDays')) || 14;
    const [stds, issues] = await Promise.all([this.activeStandardsByPosition(today), this.openIssues([employeeId])]);
    return {
      employeeStatus: e.status,
      rows: e.status === 'DISMISSED' ? [] : computePpeNeeds(stds.get(e.positionId) ?? [], issues.get(employeeId) ?? [], today, warn),
    };
  }

  async needs(user: AuthUser, q: NeedsQuery): Promise<EmployeeNeedRow[]> {
    let requested = q.unitIds;
    if (requested?.length) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(user, requested);
    const today = todayInTz();
    const warn = Number(await this.settings.get('ppe.replacementWarningDays')) || 14;
    const [emps, stds, issues] = await Promise.all([
      this.prisma.employee.findMany({
        where: { status: { not: 'DISMISSED' }, unitId: units ? { in: units } : undefined, positionId: q.positionId },
        include: { unit: { select: { name: true } }, position: { select: { name: true } } },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      this.activeStandardsByPosition(today),
      this.openIssues(),
    ]);
    const out: EmployeeNeedRow[] = [];
    for (const e of emps) {
      const rows = computePpeNeeds(stds.get(e.positionId) ?? [], issues.get(e.id) ?? [], today, warn);
      for (const r of rows) {
        if (q.ppeItemId && r.ppeItemId !== q.ppeItemId) continue;
        if (q.statuses?.length && !q.statuses.includes(r.status)) continue;
        out.push({ ...r, employeeId: e.id, personnelNumber: e.personnelNumber, fullName: fullName(e), unitId: e.unitId, unitName: e.unit.name, positionName: e.position.name });
      }
    }
    return out;
  }

  needsTable(rows: EmployeeNeedRow[], title = 'Потребность в СИЗ'): TableData {
    return {
      title, subtitle: `Записей: ${rows.length}`,
      columns: [
        { key: 'personnelNumber', title: 'Таб. №', width: 10 }, { key: 'fullName', title: 'Сотрудник', width: 28 },
        { key: 'unitName', title: 'Подразделение', width: 24 }, { key: 'positionName', title: 'Должность', width: 24 },
        { key: 'itemName', title: 'СИЗ', width: 28 }, { key: 'normQty', title: 'По норме', type: 'number', width: 9 },
        { key: 'issuedQty', title: 'Выдано', type: 'number', width: 9 }, { key: 'confirmedQty', title: 'Подтверждено', type: 'number', width: 11 },
        { key: 'toIssueQty', title: 'Требуется выдать', type: 'number', width: 11 }, { key: 'lastIssueDate', title: 'Последняя выдача', type: 'date', width: 12 },
        { key: 'nextReplacementDate', title: 'Плановая замена', type: 'date', width: 12 }, { key: 'status', title: 'Статус', width: 22 },
      ],
      rows: rows.map((r) => ({ ...r, status: PPE_STATUS_RU[r.status] })),
    };
  }

  /** Сводная потребность в закупке: требуется выдать минус складской остаток */
  async purchaseNeeds(user: AuthUser, q: NeedsQuery): Promise<TableData> {
    const rows = await this.needs(user, q);
    const stock = await this.stock();
    const stockByItem = new Map<string, number>();
    for (const s of stock) stockByItem.set(s.ppeItemId, (stockByItem.get(s.ppeItemId) ?? 0) + s.quantity);
    const agg = new Map<string, { itemName: string; unit: string; toIssue: number; employees: number }>();
    for (const r of rows) {
      if (r.toIssueQty <= 0) continue;
      const a = agg.get(r.ppeItemId) ?? { itemName: r.itemName, unit: r.unit, toIssue: 0, employees: 0 };
      a.toIssue += r.toIssueQty;
      a.employees += 1;
      agg.set(r.ppeItemId, a);
    }
    return {
      title: 'Потребность в закупке СИЗ',
      columns: [
        { key: 'itemName', title: 'СИЗ', width: 36 }, { key: 'unit', title: 'Ед. изм.', width: 8 }, { key: 'employees', title: 'Сотрудников', type: 'number', width: 12 },
        { key: 'toIssue', title: 'Требуется выдать', type: 'number', width: 14 }, { key: 'stock', title: 'Остаток на складе', type: 'number', width: 14 },
        { key: 'purchase', title: 'К закупке', type: 'number', width: 12 },
      ],
      rows: [...agg.entries()].map(([id, a]) => {
        const st = Math.max(0, stockByItem.get(id) ?? 0);
        return { ...a, stock: st, purchase: Math.max(0, a.toIssue - st) };
      }).sort((a, b) => b.purchase - a.purchase),
    };
  }

  // ───── Выдача
  async buildIssueWhere(user: AuthUser, q: IssueQuery): Promise<Prisma.PpeIssueWhereInput> {
    let requested = q.unitIds;
    if (requested?.length) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(user, requested);
    const today = todayInTz();
    const warn = Number(await this.settings.get('ppe.replacementWarningDays')) || 14;
    const from = parseDateOnly(q.dateFrom), to = parseDateOnly(q.dateTo);
    const and: Prisma.PpeIssueWhereInput[] = [];
    if (units) and.push({ employee: { unitId: { in: units } } });
    if (q.search) {
      for (const t of q.search.trim().split(/\s+/).slice(0, 3)) {
        and.push({ OR: [
          { employee: { lastName: { contains: t, mode: 'insensitive' } } }, { employee: { firstName: { contains: t, mode: 'insensitive' } } },
          { employee: { personnelNumber: { startsWith: t } } }, { ppeItem: { name: { contains: t, mode: 'insensitive' } } },
        ] });
      }
    }
    if (q.replacement === 'overdue') and.push({ plannedReplacementDate: { lt: today }, status: { in: ['ACTIVE', 'PARTIALLY_CLOSED'] } });
    if (q.replacement === 'due') and.push({ plannedReplacementDate: { gte: today, lte: addDays(today, warn) }, status: { in: ['ACTIVE', 'PARTIALLY_CLOSED'] } });
    return {
      AND: and,
      employeeId: q.employeeId, ppeItemId: q.ppeItemId,
      status: q.status === 'OPEN' ? { in: ['ACTIVE', 'PARTIALLY_CLOSED'] } : (q.status as PpeIssueStatus | undefined),
      receiptConfirmed: q.confirmed === undefined ? undefined : q.confirmed === 'true',
      issueDate: from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined,
    };
  }

  async issues(user: AuthUser, q: IssueQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = await this.buildIssueWhere(user, q);
    const [items, total] = await Promise.all([
      this.prisma.ppeIssue.findMany({
        where, skip, take, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }],
        include: { employee: empSel, ppeItem: { select: { id: true, name: true, unit: true } }, returns: true },
      }),
      this.prisma.ppeIssue.count({ where }),
    ]);
    return {
      items: items.map((i) => ({ ...i, employeeName: fullName(i.employee), activeQty: i.quantity - i.returns.reduce((a, r) => a + r.quantity, 0) })),
      total, page, pageSize,
    };
  }

  async issuesTable(user: AuthUser, q: IssueQuery, title = 'История выдачи СИЗ'): Promise<TableData> {
    const where = await this.buildIssueWhere(user, q);
    const items = await this.prisma.ppeIssue.findMany({
      where, orderBy: [{ issueDate: 'desc' }], take: 50000,
      include: { employee: { include: { unit: { select: { name: true } } } }, ppeItem: { select: { name: true, unit: true } }, returns: true },
    });
    return {
      title,
      columns: [
        { key: 'issueDate', title: 'Дата выдачи', type: 'date', width: 12 }, { key: 'personnelNumber', title: 'Таб. №', width: 10 },
        { key: 'employee', title: 'Сотрудник', width: 28 }, { key: 'unit', title: 'Подразделение', width: 24 }, { key: 'item', title: 'СИЗ', width: 28 },
        { key: 'size', title: 'Размер', width: 8 }, { key: 'quantity', title: 'Кол-во', type: 'number', width: 8 }, { key: 'active', title: 'Числится', type: 'number', width: 9 },
        { key: 'wearMonths', title: 'Срок носки, мес.', type: 'number', width: 10 }, { key: 'replacement', title: 'Плановая замена', type: 'date', width: 12 },
        { key: 'confirmed', title: 'Получение подтверждено', width: 22 }, { key: 'status', title: 'Статус', width: 18 }, { key: 'basis', title: 'Основание', width: 24 },
      ],
      rows: items.map((i) => ({
        issueDate: i.issueDate, personnelNumber: i.employee.personnelNumber, employee: fullName(i.employee), unit: i.employee.unit.name,
        item: i.ppeItem.name, size: i.size, quantity: i.quantity, active: i.quantity - i.returns.reduce((a, r) => a + r.quantity, 0),
        wearMonths: i.wearMonths, replacement: i.plannedReplacementDate, confirmed: i.receiptConfirmed ? CONFIRM_RU[i.receiptMethod ?? 'OTHER'] : 'нет',
        status: ISSUE_STATUS_RU[i.status], basis: i.basis,
      })),
    };
  }

  async getIssue(user: AuthUser, id: string) {
    const i = await this.prisma.ppeIssue.findUnique({
      where: { id }, include: { employee: empSel, ppeItem: true, standard: true, returns: { orderBy: { operationDate: 'asc' } } },
    });
    if (!i) throw notFound('Выдача СИЗ');
    assertInScope(user, i.employee.unitId, 'сотруднику');
    return { ...i, employeeName: fullName(i.employee), activeQty: i.quantity - i.returns.reduce((a, r) => a + r.quantity, 0) };
  }

  async stockBalance(itemId: string, size: string | null, tx: Prisma.TransactionClient = this.prisma) {
    const r = await tx.ppeStockMovement.aggregate({ where: { ppeItemId: itemId, size }, _sum: { quantity: true } });
    return r._sum.quantity ?? 0;
  }

  async createIssue(user: AuthUser, dto: IssueDto, tx?: Prisma.TransactionClient, replacesIssueId?: string) {
    const run = async (t: Prisma.TransactionClient) => {
      const e = await t.employee.findUnique({ where: { id: dto.employeeId } });
      if (!e) throw badRequest('Сотрудник не найден');
      assertInScope(user, e.unitId, 'сотруднику');
      if (e.status === 'DISMISSED') throw badRequest('Нельзя выдать СИЗ уволенному сотруднику');
      const item = await t.ppeItem.findUnique({ where: { id: dto.ppeItemId } });
      if (!item || item.status !== 'ACTIVE') throw badRequest('СИЗ не найдено или в архиве');
      const issueDate = parseDateOnly(dto.issueDate)!;
      if (issueDate > todayInTz()) throw badRequest('Дата выдачи не может быть в будущем');
      if (issueDate < e.hireDate) throw badRequest('Дата выдачи раньше даты приёма');
      let standard = null;
      if (dto.standardId) {
        standard = await t.ppeStandard.findUnique({ where: { id: dto.standardId } });
        if (!standard || standard.ppeItemId !== dto.ppeItemId) throw badRequest('Норма не соответствует выбранному СИЗ');
      } else {
        standard = await t.ppeStandard.findFirst({
          where: { positionId: e.positionId, ppeItemId: dto.ppeItemId, validFrom: { lte: issueDate }, OR: [{ validTo: null }, { validTo: { gte: issueDate } }] },
          orderBy: { validFrom: 'desc' },
        });
      }
      if (item.sizeType !== 'NONE' && !dto.size) throw badRequest('Для данного СИЗ необходимо указать размер');
      const wearMonths = dto.wearMonths ?? standard?.wearMonths ?? item.defaultWearMonths ?? null;
      const fromStock = dto.fromStock ?? true;
      if (fromStock && (await this.settings.get('ppe.enforceStock'))) {
        const bal = await this.stockBalance(item.id, dto.size ?? null, t);
        if (bal < dto.quantity) throw badRequest(`Недостаточный остаток на складе (${bal})`);
      }
      if (dto.receiptConfirmed && !dto.receiptMethod) throw badRequest('Укажите способ подтверждения получения');
      const issue = await t.ppeIssue.create({
        data: {
          employeeId: e.id, ppeItemId: item.id, standardId: standard?.id ?? null, unitId: e.unitId, positionId: e.positionId,
          quantity: dto.quantity, issueDate, size: dto.size, wearMonths, plannedReplacementDate: replacementDate(issueDate, wearMonths),
          issuedById: user.id, issuerName: dto.issuerName ?? user.fullName, basis: dto.basis ?? standard?.basis ?? null, note: dto.note,
          receiptConfirmed: !!dto.receiptConfirmed, receiptMethod: dto.receiptConfirmed ? (dto.receiptMethod as ConfirmationMethod) : null,
          receiptConfirmedAt: dto.receiptConfirmed ? new Date() : null, receiptConfirmedById: dto.receiptConfirmed ? user.id : null,
          replacesIssueId,
        },
      });
      if (fromStock) {
        await t.ppeStockMovement.create({
          data: { ppeItemId: item.id, size: dto.size ?? null, quantity: -dto.quantity, movementType: 'ISSUE', movementDate: issueDate, issueId: issue.id, createdById: user.id, note: fullName(e) },
        });
      }
      if (replacesIssueId) await t.task.updateMany({ where: { entityType: 'ppe_issue', entityId: replacesIssueId, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DONE', completedAt: new Date(), result: 'Произведена замена' } });
      return issue;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  async confirmReceipt(user: AuthUser, id: string, dto: ConfirmReceiptDto) {
    const i = await this.getIssue(user, id);
    if (i.receiptConfirmed) throw badRequest('Получение уже подтверждено');
    return this.prisma.ppeIssue.update({
      where: { id },
      data: { receiptConfirmed: true, receiptMethod: dto.method as ConfirmationMethod, receiptConfirmedAt: new Date(), receiptConfirmedById: user.id, note: dto.note ? [i.note, dto.note].filter(Boolean).join('\n') : undefined },
    });
  }

  /** Ручная корректировка плановой даты замены (досрочная замена, сезонность, износ) с обязательным основанием */
  async setReplacementDate(user: AuthUser, id: string, dto: ReplacementDateDto) {
    const i = await this.getIssue(user, id);
    const date = parseDateOnly(dto.date);
    if (date && date < i.issueDate) throw badRequest('Дата замены раньше даты выдачи');
    return this.prisma.ppeIssue.update({ where: { id }, data: { plannedReplacementDate: date, replacementManual: true, replacementBasis: dto.basis } });
  }

  async registerReturn(user: AuthUser, id: string, dto: ReturnDto) {
    const i = await this.getIssue(user, id);
    if (!['ACTIVE', 'PARTIALLY_CLOSED'].includes(i.status)) throw badRequest('Операция невозможна: выдача уже закрыта');
    if (dto.quantity > i.activeQty) throw badRequest(`Количество больше числящегося (${i.activeQty})`);
    const opDate = parseDateOnly(dto.operationDate)!;
    if (opDate < i.issueDate) throw badRequest('Дата операции раньше даты выдачи');
    if (opDate > todayInTz()) throw badRequest('Дата операции не может быть в будущем');
    if (dto.operationType !== 'RETURN' && dto.toStock) throw badRequest('На склад возвращаются только СИЗ, принятые по возврату');
    return this.prisma.$transaction(async (tx) => {
      const ret = await tx.ppeReturn.create({
        data: { issueId: id, operationType: dto.operationType, quantity: dto.quantity, operationDate: opDate, reason: dto.reason, toStock: !!dto.toStock, createdById: user.id },
      });
      if (dto.toStock) {
        await tx.ppeStockMovement.create({ data: { ppeItemId: i.ppeItemId, size: i.size, quantity: dto.quantity, movementType: 'RETURN', movementDate: opDate, issueId: id, returnId: ret.id, createdById: user.id } });
      }
      const remaining = i.activeQty - dto.quantity;
      const finalStatus: PpeIssueStatus = remaining > 0 ? 'PARTIALLY_CLOSED' : dto.operationType === 'RETURN' ? 'RETURNED' : dto.operationType === 'WRITE_OFF' ? 'WRITTEN_OFF' : 'REPLACED';
      await tx.ppeIssue.update({ where: { id }, data: { status: finalStatus } });
      let replacement = null;
      if (dto.operationType === 'REPLACEMENT') {
        replacement = await this.createIssue(user, {
          employeeId: i.employeeId, ppeItemId: i.ppeItemId, standardId: i.standardId, quantity: dto.quantity, issueDate: dto.operationDate,
          size: dto.newSize ?? i.size, basis: `Замена: ${dto.reason}`, fromStock: dto.newFromStock ?? true,
          receiptConfirmed: dto.newReceiptConfirmed, receiptMethod: dto.newReceiptMethod,
        }, tx, id);
      }
      return { return: ret, replacement };
    });
  }

  async employeeIssues(user: AuthUser, employeeId: string) {
    const e = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!e) throw notFound('Сотрудник');
    assertInScope(user, e.unitId, 'сотруднику');
    const list = await this.prisma.ppeIssue.findMany({
      where: { employeeId }, orderBy: [{ issueDate: 'desc' }], include: { ppeItem: { select: { name: true, unit: true } }, returns: { orderBy: { operationDate: 'asc' } } },
    });
    return list.map((i) => ({ ...i, activeQty: i.quantity - i.returns.reduce((a, r) => a + r.quantity, 0) }));
  }

  // ───── Склад
  async stock() {
    const rows = await this.prisma.ppeStockMovement.groupBy({ by: ['ppeItemId', 'size'], _sum: { quantity: true } });
    const items = new Map((await this.prisma.ppeItem.findMany({ select: { id: true, name: true, unit: true, category: true } })).map((i) => [i.id, i]));
    return rows.map((r) => ({
      ppeItemId: r.ppeItemId, size: r.size, quantity: r._sum.quantity ?? 0,
      itemName: items.get(r.ppeItemId)?.name ?? '', unit: items.get(r.ppeItemId)?.unit ?? '', category: items.get(r.ppeItemId)?.category ?? '',
    })).sort((a, b) => a.itemName.localeCompare(b.itemName, 'ru') || (a.size ?? '').localeCompare(b.size ?? ''));
  }

  movements(q: { ppeItemId?: string }) {
    return this.prisma.ppeStockMovement.findMany({
      where: { ppeItemId: q.ppeItemId }, orderBy: [{ movementDate: 'desc' }, { createdAt: 'desc' }], take: 500, include: { ppeItem: { select: { name: true } } },
    });
  }

  async stockOperation(user: AuthUser, dto: StockOperationDto) {
    if (dto.quantity === 0) throw badRequest('Количество не может быть нулевым');
    if (dto.movementType === 'RECEIPT' && dto.quantity < 0) throw badRequest('Количество поступления должно быть положительным');
    const qty = dto.movementType === 'WRITE_OFF' ? -Math.abs(dto.quantity) : dto.quantity;
    if (!(await this.prisma.ppeItem.findUnique({ where: { id: dto.ppeItemId } }))) throw badRequest('СИЗ не найдено');
    return this.prisma.ppeStockMovement.create({
      data: { ppeItemId: dto.ppeItemId, size: dto.size ?? null, quantity: qty, movementType: dto.movementType, movementDate: parseDateOnly(dto.movementDate)!, document: dto.document, note: dto.note, createdById: user.id },
    });
  }

  inScope = inScope;
}
