import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { badRequest } from '../common/errors';
import { addDays, formatRu, parseDateOnly, todayInTz } from '../common/dates';
import { narrowUnits } from '../common/scope';
import { UnitTreeService } from '../core/unit-tree.service';
import { SettingsService } from '../core/settings.service';
import { TableData } from '../core/export.service';
import { ComplianceService } from '../compliance/compliance.service';
import { COMPLIANCE_STATUS_RU } from '../compliance/compliance.dto';
import { BriefingsService } from '../briefings/briefings.service';
import { ChecksService } from '../checks/checks.service';
import { PpeService } from '../ppe/ppe.service';
import { NEEDS_ACTION } from '../ppe/ppe.logic';
import { fullName } from '../employees/employees.service';

export interface ReportParams {
  unitIds?: string[];
  dateFrom?: string;
  dateTo?: string;
  typeId?: string;
  employeeId?: string;
  positionId?: string;
  outcome?: string;
}

type Filter = 'unitIds' | 'period' | 'briefingType' | 'checkType' | 'employee' | 'position' | 'outcome';

export const REPORTS: { code: string; title: string; filters: Filter[]; required?: Filter[]; group: string }[] = [
  { code: 'overdue-briefings', title: 'Сотрудники с просроченными инструктажами', filters: ['unitIds', 'briefingType', 'position'], group: 'Инструктажи' },
  { code: 'briefing-plan', title: 'План инструктажей на период', filters: ['unitIds', 'period', 'briefingType'], required: ['period'], group: 'Инструктажи' },
  { code: 'briefing-history', title: 'История инструктажей сотрудника', filters: ['employee'], required: ['employee'], group: 'Инструктажи' },
  { code: 'check-plan', title: 'План проверок знаний', filters: ['unitIds', 'period', 'checkType'], required: ['period'], group: 'Проверки знаний' },
  { code: 'overdue-checks', title: 'Сотрудники с просроченными проверками знаний', filters: ['unitIds', 'checkType', 'position'], group: 'Проверки знаний' },
  { code: 'check-results', title: 'Результаты проверок знаний', filters: ['unitIds', 'period', 'checkType', 'outcome'], group: 'Проверки знаний' },
  { code: 'failed-checks', title: 'Сотрудники с неудовлетворительными результатами', filters: ['unitIds', 'period', 'checkType'], group: 'Проверки знаний' },
  { code: 'ppe-needs-by-unit', title: 'Потребность в СИЗ по подразделениям', filters: ['unitIds', 'position'], group: 'СИЗ' },
  { code: 'ppe-history', title: 'История выдачи СИЗ', filters: ['unitIds', 'period', 'employee'], group: 'СИЗ' },
  { code: 'ppe-replacement', title: 'СИЗ, требующие плановой замены', filters: ['unitIds', 'period'], group: 'СИЗ' },
  { code: 'summary', title: 'Сводный отчёт по состоянию охраны труда', filters: ['unitIds'], group: 'Сводные' },
  { code: 'plan-execution', title: 'Выполнение плана мероприятий', filters: ['unitIds', 'period'], required: ['period'], group: 'Сводные' },
];

const periodText = (p: ReportParams) => (p.dateFrom || p.dateTo ? `Период: ${p.dateFrom ? formatRu(parseDateOnly(p.dateFrom)) : '…'} — ${p.dateTo ? formatRu(parseDateOnly(p.dateTo)) : '…'}` : '');

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService, private tree: UnitTreeService, private settings: SettingsService, private compliance: ComplianceService,
    private briefings: BriefingsService, private checks: ChecksService, private ppe: PpeService,
  ) {}

  async build(user: AuthUser, code: string, p: ReportParams): Promise<TableData> {
    const def = REPORTS.find((r) => r.code === code);
    if (!def) throw badRequest('Неизвестный отчёт');
    if (def.required?.includes('period') && (!p.dateFrom || !p.dateTo)) throw badRequest('Укажите период');
    if (def.required?.includes('employee') && !p.employeeId) throw badRequest('Выберите сотрудника');
    const perms = new Set(user.permissions);
    const need = (perm: string) => { if (!perms.has(perm)) throw badRequest('Недостаточно прав для отчёта'); };
    const t = await this.dispatch(user, code, p, need);
    const sub = [t.subtitle, periodText(p), `Сформировано: ${formatRu(todayInTz())}`].filter(Boolean).join('. ');
    return { ...t, title: def.title, subtitle: sub };
  }

  private async dispatch(user: AuthUser, code: string, p: ReportParams, need: (perm: string) => void): Promise<TableData> {
    switch (code) {
      case 'overdue-briefings': need('briefings.read'); return this.overdue(user, 'briefing', p);
      case 'overdue-checks': need('checks.read'); return this.overdue(user, 'check', p);
      case 'briefing-plan': need('briefings.read'); return this.plan(user, 'briefing', p);
      case 'check-plan': need('checks.read'); return this.plan(user, 'check', p);
      case 'briefing-history': need('briefings.read'); return this.briefings.exportTable(user, { employeeId: p.employeeId });
      case 'check-results': need('checks.read'); return this.checks.exportTable(user, { unitIds: p.unitIds, dateFrom: p.dateFrom, dateTo: p.dateTo, typeId: p.typeId, status: 'CONDUCTED', outcome: p.outcome });
      case 'failed-checks': need('checks.read'); return this.failed(user, p);
      case 'ppe-needs-by-unit': need('ppe.read'); return this.ppeByUnit(user, p);
      case 'ppe-history': need('ppe.read'); return this.ppe.issuesTable(user, { unitIds: p.unitIds, dateFrom: p.dateFrom, dateTo: p.dateTo, employeeId: p.employeeId });
      case 'ppe-replacement': need('ppe.read'); return this.ppeReplacement(user, p);
      case 'summary': return this.summary(user, p);
      case 'plan-execution': return this.planExecution(user, p);
    }
    throw badRequest('Неизвестный отчёт');
  }

  /** Просрочено по правилам периодичности + просроченные запланированные мероприятия */
  private async overdue(user: AuthUser, kind: 'briefing' | 'check', p: ReportParams): Promise<TableData> {
    const rows = await this.compliance.compute(user, kind, { unitIds: p.unitIds, typeId: p.typeId, positionId: p.positionId, statuses: ['OVERDUE', 'MISSING'] });
    const today = todayInTz();
    const units = narrowUnits(user, p.unitIds?.length ? await this.tree.withDescendants(p.unitIds) : undefined);
    const plannedRows: Record<string, unknown>[] = [];
    if (kind === 'briefing') {
      const list = await this.prisma.briefingParticipant.findMany({
        where: { briefing: { status: 'PLANNED', plannedDate: { lt: today }, briefingTypeId: p.typeId }, unitId: units ? { in: units } : undefined, employee: { status: { not: 'DISMISSED' }, positionId: p.positionId } },
        include: { employee: { include: { unit: true, position: true } }, briefing: { include: { briefingType: true } } },
      });
      for (const x of list) plannedRows.push({ personnelNumber: x.employee.personnelNumber, fullName: fullName(x.employee), unitName: x.employee.unit.name, positionName: x.employee.position.name, typeName: x.briefing.briefingType.name, dueDate: x.briefing.plannedDate, lastDate: null, status: 'Запланированный инструктаж не проведён', source: 'План', daysOverdue: Math.round((today.getTime() - x.briefing.plannedDate!.getTime()) / 86400000) });
    } else {
      const list = await this.prisma.knowledgeCheckParticipant.findMany({
        where: { check: { status: 'PLANNED', plannedDate: { lt: today }, checkTypeId: p.typeId }, unitId: units ? { in: units } : undefined, employee: { status: { not: 'DISMISSED' }, positionId: p.positionId } },
        include: { employee: { include: { unit: true, position: true } }, check: { include: { checkType: true } } },
      });
      for (const x of list) plannedRows.push({ personnelNumber: x.employee.personnelNumber, fullName: fullName(x.employee), unitName: x.employee.unit.name, positionName: x.employee.position.name, typeName: x.check.checkType.name, dueDate: x.check.plannedDate, lastDate: null, status: 'Запланированная проверка не проведена', source: 'План', daysOverdue: Math.round((today.getTime() - x.check.plannedDate!.getTime()) / 86400000) });
    }
    const all = [
      ...rows.map((r) => ({ ...r, status: COMPLIANCE_STATUS_RU[r.status], source: 'Правило периодичности', daysOverdue: r.daysLeft !== null ? -r.daysLeft : null })),
      ...plannedRows,
    ].sort((a: any, b: any) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
    return {
      title: '', subtitle: `Сотрудников: ${new Set(all.map((r: any) => r.personnelNumber)).size}, записей: ${all.length}`,
      columns: [
        { key: 'personnelNumber', title: 'Таб. №', width: 10 }, { key: 'fullName', title: 'Сотрудник', width: 30 }, { key: 'unitName', title: 'Подразделение', width: 26 },
        { key: 'positionName', title: 'Должность', width: 26 }, { key: 'typeName', title: kind === 'briefing' ? 'Вид инструктажа' : 'Вид проверки', width: 22 },
        { key: 'lastDate', title: 'Последний раз', type: 'date', width: 12 }, { key: 'dueDate', title: 'Срок', type: 'date', width: 12 },
        { key: 'daysOverdue', title: 'Просрочено, дн.', type: 'number', width: 10 }, { key: 'status', title: 'Состояние', width: 26 }, { key: 'source', title: 'Источник', width: 18 },
      ],
      rows: all as Record<string, unknown>[],
    };
  }

  /** План: запланированные мероприятия + сроки по правилам, наступающие в периоде */
  private async plan(user: AuthUser, kind: 'briefing' | 'check', p: ReportParams): Promise<TableData> {
    const from = parseDateOnly(p.dateFrom)!, to = parseDateOnly(p.dateTo)!;
    const units = narrowUnits(user, p.unitIds?.length ? await this.tree.withDescendants(p.unitIds) : undefined);
    const rows: Record<string, unknown>[] = [];
    const plannedKeys = new Set<string>();
    if (kind === 'briefing') {
      const list = await this.prisma.briefingParticipant.findMany({
        where: { briefing: { status: 'PLANNED', plannedDate: { gte: from, lte: to }, briefingTypeId: p.typeId }, unitId: units ? { in: units } : undefined },
        include: { employee: { include: { unit: true, position: true } }, briefing: { include: { briefingType: true, responsible: true } } },
      });
      for (const x of list) {
        plannedKeys.add(`${x.employeeId}|${x.briefing.briefingTypeId}`);
        rows.push({ date: x.briefing.plannedDate, personnelNumber: x.employee.personnelNumber, fullName: fullName(x.employee), unitName: x.employee.unit.name, positionName: x.employee.position.name, typeName: x.briefing.briefingType.name, responsible: x.briefing.responsible ? fullName(x.briefing.responsible) : '', source: 'Запланировано' });
      }
    } else {
      const list = await this.prisma.knowledgeCheckParticipant.findMany({
        where: { check: { status: 'PLANNED', plannedDate: { gte: from, lte: to }, checkTypeId: p.typeId }, unitId: units ? { in: units } : undefined },
        include: { employee: { include: { unit: true, position: true } }, check: { include: { checkType: true, responsible: true, commission: true } } },
      });
      for (const x of list) {
        plannedKeys.add(`${x.employeeId}|${x.check.checkTypeId}`);
        rows.push({ date: x.check.plannedDate, personnelNumber: x.employee.personnelNumber, fullName: fullName(x.employee), unitName: x.employee.unit.name, positionName: x.employee.position.name, typeName: x.check.checkType.name, responsible: x.check.commission?.name ?? (x.check.responsible ? fullName(x.check.responsible) : ''), source: 'Запланировано' });
      }
    }
    const due = await this.compliance.compute(user, kind, { unitIds: p.unitIds, typeId: p.typeId });
    for (const r of due) {
      if (!r.dueDate || r.dueDate < from || r.dueDate > to || plannedKeys.has(`${r.employeeId}|${r.typeId}`)) continue;
      rows.push({ date: r.dueDate, personnelNumber: r.personnelNumber, fullName: r.fullName, unitName: r.unitName, positionName: r.positionName, typeName: r.typeName, responsible: '', source: 'Срок по правилу (не запланировано)' });
    }
    rows.sort((a: any, b: any) => a.date - b.date || String(a.fullName).localeCompare(String(b.fullName), 'ru'));
    return {
      title: '', subtitle: `Записей: ${rows.length}`,
      columns: [
        { key: 'date', title: 'Дата', type: 'date', width: 12 }, { key: 'personnelNumber', title: 'Таб. №', width: 10 }, { key: 'fullName', title: 'Сотрудник', width: 30 },
        { key: 'unitName', title: 'Подразделение', width: 26 }, { key: 'positionName', title: 'Должность', width: 26 },
        { key: 'typeName', title: kind === 'briefing' ? 'Вид инструктажа' : 'Вид проверки', width: 22 }, { key: 'responsible', title: 'Ответственный', width: 24 }, { key: 'source', title: 'Источник', width: 26 },
      ],
      rows,
    };
  }

  private async failed(user: AuthUser, p: ReportParams): Promise<TableData> {
    const t = await this.checks.exportTable(user, { unitIds: p.unitIds, dateFrom: p.dateFrom, dateTo: p.dateTo, typeId: p.typeId, status: 'CONDUCTED', outcome: 'FAILED' });
    // Текущее состояние: прошёл ли сотрудник повторную проверку
    const current = await this.compliance.compute(user, 'check', { unitIds: p.unitIds, typeId: p.typeId, statuses: ['FAILED'] });
    const stillFailed = new Set(current.map((c) => `${c.personnelNumber}|${c.typeName}`));
    return {
      ...t,
      columns: [...t.columns, { key: 'current', title: 'Текущее состояние', width: 24 }],
      rows: t.rows.map((r) => ({ ...r, current: stillFailed.has(`${r.personnelNumber}|${r.type}`) ? 'Повторная проверка не пройдена' : 'Пройдена повторно / не требуется' })),
    };
  }

  private async ppeByUnit(user: AuthUser, p: ReportParams): Promise<TableData> {
    const rows = await this.ppe.needs(user, { unitIds: p.unitIds, positionId: p.positionId });
    const agg = new Map<string, { unitName: string; itemName: string; unit: string; employees: Set<string>; norm: number; issued: number; confirmed: number; toIssue: number }>();
    for (const r of rows) {
      if (!r.standardId) continue;
      const k = `${r.unitId}|${r.ppeItemId}`;
      const a = agg.get(k) ?? { unitName: r.unitName, itemName: r.itemName, unit: r.unit, employees: new Set(), norm: 0, issued: 0, confirmed: 0, toIssue: 0 };
      a.employees.add(r.employeeId); a.norm += r.normQty; a.issued += r.issuedQty; a.confirmed += r.confirmedQty; a.toIssue += r.toIssueQty;
      agg.set(k, a);
    }
    return {
      title: '',
      columns: [
        { key: 'unitName', title: 'Подразделение', width: 28 }, { key: 'itemName', title: 'СИЗ', width: 30 }, { key: 'unit', title: 'Ед.', width: 6 },
        { key: 'employees', title: 'Сотрудников', type: 'number', width: 11 }, { key: 'norm', title: 'По нормам', type: 'number', width: 10 },
        { key: 'issued', title: 'Числится выданным', type: 'number', width: 12 }, { key: 'confirmed', title: 'Подтверждено получение', type: 'number', width: 12 },
        { key: 'toIssue', title: 'Требуется выдать', type: 'number', width: 12 },
      ],
      rows: [...agg.values()].map((a) => ({ ...a, employees: a.employees.size })).sort((a, b) => a.unitName.localeCompare(b.unitName, 'ru') || a.itemName.localeCompare(b.itemName, 'ru')),
    };
  }

  private async ppeReplacement(user: AuthUser, p: ReportParams): Promise<TableData> {
    const today = todayInTz();
    const warn = Number(await this.settings.get('ppe.replacementWarningDays')) || 14;
    const to = parseDateOnly(p.dateTo) ?? addDays(today, warn);
    const units = narrowUnits(user, p.unitIds?.length ? await this.tree.withDescendants(p.unitIds) : undefined);
    const list = await this.prisma.ppeIssue.findMany({
      where: {
        status: { in: ['ACTIVE', 'PARTIALLY_CLOSED'] }, plannedReplacementDate: { lte: to, gte: parseDateOnly(p.dateFrom) ?? undefined },
        employee: { status: { not: 'DISMISSED' }, unitId: units ? { in: units } : undefined },
      },
      include: { employee: { include: { unit: true, position: true } }, ppeItem: true, returns: true },
      orderBy: { plannedReplacementDate: 'asc' },
    });
    return {
      title: '', subtitle: `Позиций: ${list.length}`,
      columns: [
        { key: 'date', title: 'Плановая замена', type: 'date', width: 12 }, { key: 'state', title: 'Состояние', width: 14 }, { key: 'personnelNumber', title: 'Таб. №', width: 10 },
        { key: 'fullName', title: 'Сотрудник', width: 28 }, { key: 'unitName', title: 'Подразделение', width: 24 }, { key: 'item', title: 'СИЗ', width: 28 },
        { key: 'size', title: 'Размер', width: 8 }, { key: 'qty', title: 'Кол-во', type: 'number', width: 8 }, { key: 'issueDate', title: 'Выдано', type: 'date', width: 12 },
        { key: 'manual', title: 'Корректировка срока', width: 24 },
      ],
      rows: list.map((i) => ({
        date: i.plannedReplacementDate, state: i.plannedReplacementDate! < today ? 'Просрочена' : 'Предстоит', personnelNumber: i.employee.personnelNumber,
        fullName: fullName(i.employee), unitName: i.employee.unit.name, item: i.ppeItem.name, size: i.size, qty: i.quantity - i.returns.reduce((a, r) => a + r.quantity, 0),
        issueDate: i.issueDate, manual: i.replacementManual ? i.replacementBasis : '',
      })),
    };
  }

  async summaryRows(user: AuthUser, p: ReportParams) {
    const perms = new Set(user.permissions);
    const units = narrowUnits(user, p.unitIds?.length ? await this.tree.withDescendants(p.unitIds) : undefined);
    const [emps, br, ch, ppe, tasks, names] = await Promise.all([
      this.prisma.employee.groupBy({ by: ['unitId'], where: { status: { not: 'DISMISSED' }, unitId: units ? { in: units } : undefined }, _count: true }),
      perms.has('briefings.read') ? this.compliance.compute(user, 'briefing', { unitIds: p.unitIds }) : Promise.resolve([]),
      perms.has('checks.read') ? this.compliance.compute(user, 'check', { unitIds: p.unitIds }) : Promise.resolve([]),
      perms.has('ppe.read') ? this.ppe.needs(user, { unitIds: p.unitIds }) : Promise.resolve([]),
      this.prisma.task.groupBy({ by: ['unitId'], where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, unitId: units ? { in: units } : { not: null } }, _count: true }),
      this.tree.names(),
    ]);
    const m = new Map<string, any>();
    const row = (unitId: string) => {
      if (!m.has(unitId)) m.set(unitId, { unitId, unitName: names.get(unitId) ?? '', employees: 0, briefingOverdue: new Set(), checkOverdue: new Set(), checkFailed: new Set(), ppeNeed: new Set(), openTasks: 0 });
      return m.get(unitId);
    };
    for (const e of emps) row(e.unitId).employees = e._count;
    for (const r of br) if (r.status === 'OVERDUE' || r.status === 'MISSING') row(r.unitId).briefingOverdue.add(r.employeeId);
    for (const r of ch) {
      if (r.status === 'OVERDUE' || r.status === 'MISSING') row(r.unitId).checkOverdue.add(r.employeeId);
      if (r.status === 'FAILED') row(r.unitId).checkFailed.add(r.employeeId);
    }
    for (const r of ppe) if (NEEDS_ACTION.includes(r.status)) row(r.unitId).ppeNeed.add(r.employeeId);
    for (const t of tasks) if (t.unitId) row(t.unitId).openTasks = t._count;
    return [...m.values()].map((r) => ({
      unitId: r.unitId, unitName: r.unitName, employees: r.employees, briefingOverdue: r.briefingOverdue.size, checkOverdue: r.checkOverdue.size,
      checkFailed: r.checkFailed.size, ppeNeed: r.ppeNeed.size, openTasks: r.openTasks,
    })).sort((a, b) => a.unitName.localeCompare(b.unitName, 'ru'));
  }

  private async summary(user: AuthUser, p: ReportParams): Promise<TableData> {
    const rows = await this.summaryRows(user, p);
    const total = rows.reduce((a, r) => ({
      unitName: 'ИТОГО', employees: a.employees + r.employees, briefingOverdue: a.briefingOverdue + r.briefingOverdue, checkOverdue: a.checkOverdue + r.checkOverdue,
      checkFailed: a.checkFailed + r.checkFailed, ppeNeed: a.ppeNeed + r.ppeNeed, openTasks: a.openTasks + r.openTasks,
    }), { unitName: 'ИТОГО', employees: 0, briefingOverdue: 0, checkOverdue: 0, checkFailed: 0, ppeNeed: 0, openTasks: 0 });
    return {
      title: '',
      columns: [
        { key: 'unitName', title: 'Подразделение', width: 32 }, { key: 'employees', title: 'Работников', type: 'number', width: 11 },
        { key: 'briefingOverdue', title: 'Просрочен инструктаж (чел.)', type: 'number', width: 14 }, { key: 'checkOverdue', title: 'Просрочена проверка знаний (чел.)', type: 'number', width: 14 },
        { key: 'checkFailed', title: 'Неудовл. результат (чел.)', type: 'number', width: 14 }, { key: 'ppeNeed', title: 'Требуется выдача/замена СИЗ (чел.)', type: 'number', width: 14 },
        { key: 'openTasks', title: 'Открытые задачи', type: 'number', width: 11 },
      ],
      rows: [...rows, total],
    };
  }

  private async planExecution(user: AuthUser, p: ReportParams): Promise<TableData> {
    const from = parseDateOnly(p.dateFrom)!, to = parseDateOnly(p.dateTo)!;
    const today = todayInTz();
    const units = narrowUnits(user, p.unitIds?.length ? await this.tree.withDescendants(p.unitIds) : undefined);
    const rows: Record<string, unknown>[] = [];
    const stat = (label: string, items: { status: string; plannedDate: Date | null }[]) => {
      const planned = items.length;
      const done = items.filter((i) => i.status === 'CONDUCTED').length;
      const cancelled = items.filter((i) => i.status === 'CANCELLED').length;
      const overdue = items.filter((i) => i.status === 'PLANNED' && i.plannedDate && i.plannedDate < today).length;
      const pending = items.filter((i) => i.status === 'PLANNED' && i.plannedDate && i.plannedDate >= today).length;
      rows.push({ label, planned, done, cancelled, overdue, pending, percent: planned - cancelled > 0 ? `${Math.round((done / (planned - cancelled)) * 100)}%` : '—' });
    };
    if (user.permissions.includes('briefings.read')) {
      const b = await this.prisma.briefing.findMany({ where: { plannedDate: { gte: from, lte: to }, participants: units ? { some: { unitId: { in: units } } } : undefined }, include: { briefingType: true } });
      for (const name of [...new Set(b.map((x) => x.briefingType.name))].sort()) stat(`Инструктаж: ${name}`, b.filter((x) => x.briefingType.name === name));
    }
    if (user.permissions.includes('checks.read')) {
      const c = await this.prisma.knowledgeCheck.findMany({ where: { plannedDate: { gte: from, lte: to }, participants: units ? { some: { unitId: { in: units } } } : undefined }, include: { checkType: true } });
      for (const name of [...new Set(c.map((x) => x.checkType.name))].sort()) stat(`Проверка знаний: ${name}`, c.filter((x) => x.checkType.name === name));
    }
    if (user.permissions.includes('tasks.read')) {
      const t = await this.prisma.task.findMany({ where: { dueDate: { gte: from, lte: to }, ...(units ? { unitId: { in: units } } : {}) } });
      const map = (s: string) => (s === 'DONE' ? 'CONDUCTED' : s === 'CANCELLED' ? 'CANCELLED' : 'PLANNED');
      stat('Задачи и контрольные мероприятия', t.map((x) => ({ status: map(x.status), plannedDate: x.dueDate })));
    }
    return {
      title: '',
      columns: [
        { key: 'label', title: 'Мероприятие', width: 40 }, { key: 'planned', title: 'Запланировано', type: 'number', width: 12 }, { key: 'done', title: 'Выполнено', type: 'number', width: 12 },
        { key: 'cancelled', title: 'Отменено', type: 'number', width: 10 }, { key: 'overdue', title: 'Просрочено', type: 'number', width: 11 },
        { key: 'pending', title: 'Срок не наступил', type: 'number', width: 12 }, { key: 'percent', title: '% выполнения', width: 12 },
      ],
      rows,
    };
  }
}
