import { Injectable } from '@nestjs/common';
import { EmployeeChangeType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { assertInScope, narrowUnits } from '../common/scope';
import { badRequest, notFound } from '../common/errors';
import { orderByFrom, pageArgs } from '../common/pagination';
import { formatDateOnly, parseDateOnly, todayInTz } from '../common/dates';
import { UnitTreeService } from '../core/unit-tree.service';
import { TableData } from '../core/export.service';
import { CreateEmployeeDto, DismissDto, EmployeeQuery, RehireDto, StatusDto, TransferDto, UpdateEmployeeDto } from './employees.dto';

export const STATUS_RU: Record<string, string> = { ACTIVE: 'Работает', ABSENT: 'Временно отсутствует', DISMISSED: 'Уволен' };

export const fullName = (e: { lastName: string; firstName: string; middleName?: string | null }) =>
  [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ');

export const employeeListInclude = {
  unit: { select: { id: true, name: true } },
  position: { select: { id: true, name: true, workCategory: true } },
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService, private tree: UnitTreeService) {}

  /** Построение условия поиска (ФИО по словам + табельный номер) с учётом зоны доступа */
  async buildWhere(user: AuthUser, q: EmployeeQuery): Promise<Prisma.EmployeeWhereInput> {
    let requested = q.unitIds;
    if (requested?.length && q.includeChildren !== false) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(user, requested);
    const and: Prisma.EmployeeWhereInput[] = [];
    if (q.search) {
      for (const term of q.search.trim().split(/\s+/).slice(0, 4)) {
        and.push({ OR: [
          { lastName: { contains: term, mode: 'insensitive' } },
          { firstName: { contains: term, mode: 'insensitive' } },
          { middleName: { contains: term, mode: 'insensitive' } },
          { personnelNumber: { startsWith: term, mode: 'insensitive' } },
        ] });
      }
    }
    const status = q.status ?? 'CURRENT';
    return {
      AND: and,
      unitId: units ? { in: units } : undefined,
      positionId: q.positionId,
      managerId: q.managerId,
      status: status === 'ALL' ? undefined : status === 'CURRENT' ? { not: 'DISMISSED' } : (status as any),
    };
  }

  async list(user: AuthUser, q: EmployeeQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = await this.buildWhere(user, q);
    const orderBy = orderByFrom(q, {
      personnelNumber: 'personnelNumber', lastName: (d: string) => [{ lastName: d }, { firstName: d }], hireDate: 'hireDate', status: 'status',
      unit: (d: string) => ({ unit: { name: d } }), position: (d: string) => ({ position: { name: d } }),
    }, [{ lastName: 'asc' }, { firstName: 'asc' }]);
    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({ where, include: employeeListInclude, orderBy, skip, take }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: items.map((e) => ({ ...e, fullName: fullName(e) })), total, page, pageSize };
  }

  async exportTable(user: AuthUser, q: EmployeeQuery): Promise<TableData> {
    const where = await this.buildWhere(user, q);
    const items = await this.prisma.employee.findMany({
      where, include: { ...employeeListInclude, manager: { select: { personnelNumber: true, lastName: true, firstName: true, middleName: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: 20000,
    });
    return {
      title: 'Список сотрудников',
      subtitle: `Записей: ${items.length}`,
      columns: [
        { key: 'personnelNumber', title: 'Табельный номер', width: 14 },
        { key: 'lastName', title: 'Фамилия', width: 18 },
        { key: 'firstName', title: 'Имя', width: 14 },
        { key: 'middleName', title: 'Отчество', width: 18 },
        { key: 'unit', title: 'Подразделение', width: 30 },
        { key: 'position', title: 'Должность', width: 30 },
        { key: 'hireDate', title: 'Дата приёма', type: 'date', width: 12 },
        { key: 'status', title: 'Статус', width: 18 },
        { key: 'dismissalDate', title: 'Дата увольнения', type: 'date', width: 12 },
        { key: 'manager', title: 'Табельный номер руководителя', width: 14 },
      ],
      rows: items.map((e) => ({
        personnelNumber: e.personnelNumber, lastName: e.lastName, firstName: e.firstName, middleName: e.middleName,
        unit: e.unit.name, position: e.position.name, hireDate: e.hireDate, status: STATUS_RU[e.status], dismissalDate: e.dismissalDate,
        manager: e.manager?.personnelNumber ?? '',
      })),
    };
  }

  async get(user: AuthUser, id: string) {
    const e = await this.prisma.employee.findUnique({
      where: { id },
      include: { ...employeeListInclude, manager: { select: { id: true, lastName: true, firstName: true, middleName: true, personnelNumber: true } } },
    });
    if (!e) throw notFound('Сотрудник');
    assertInScope(user, e.unitId, 'сотруднику другого подразделения');
    return { ...e, fullName: fullName(e) };
  }

  async history(user: AuthUser, id: string) {
    await this.get(user, id);
    const rows = await this.prisma.employeeHistory.findMany({ where: { employeeId: id }, orderBy: [{ effectiveDate: 'desc' }, { createdAt: 'desc' }] });
    const [units, positions, authors] = await Promise.all([
      this.tree.names(),
      this.prisma.position.findMany({ select: { id: true, name: true } }).then((p) => new Map(p.map((x) => [x.id, x.name]))),
      this.prisma.user.findMany({ where: { id: { in: rows.map((r) => r.authorId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } }).then((u) => new Map(u.map((x) => [x.id, x.fullName]))),
    ]);
    return rows.map((r) => ({
      ...r,
      fromUnit: r.fromUnitId ? units.get(r.fromUnitId) : null, toUnit: r.toUnitId ? units.get(r.toUnitId) : null,
      fromPosition: r.fromPositionId ? positions.get(r.fromPositionId) : null, toPosition: r.toPositionId ? positions.get(r.toPositionId) : null,
      author: r.authorId ? authors.get(r.authorId) : null,
    }));
  }

  private async checkRefs(unitId?: string | null, positionId?: string | null, managerId?: string | null, selfId?: string) {
    if (unitId) {
      const u = await this.prisma.organizationalUnit.findUnique({ where: { id: unitId } });
      if (!u) throw badRequest('Подразделение не найдено');
      if (!u.isActive) throw badRequest('Подразделение в архиве');
    }
    if (positionId) {
      const p = await this.prisma.position.findUnique({ where: { id: positionId } });
      if (!p) throw badRequest('Должность не найдена');
      if (!p.isActive) throw badRequest('Должность в архиве');
    }
    if (managerId) {
      if (managerId === selfId) throw badRequest('Сотрудник не может быть руководителем самому себе');
      if (!(await this.prisma.employee.findUnique({ where: { id: managerId } }))) throw badRequest('Руководитель не найден');
    }
  }

  async create(user: AuthUser, dto: CreateEmployeeDto) {
    assertInScope(user, dto.unitId);
    await this.checkRefs(dto.unitId, dto.positionId, dto.managerId);
    const hireDate = parseDateOnly(dto.hireDate)!;
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.create({
        data: {
          personnelNumber: dto.personnelNumber, lastName: dto.lastName, firstName: dto.firstName, middleName: dto.middleName ?? null,
          unitId: dto.unitId, positionId: dto.positionId, hireDate, managerId: dto.managerId ?? null,
          phone: dto.phone ?? null, email: dto.email ?? null, note: dto.note ?? null,
          createdById: user.id, updatedById: user.id,
        },
      });
      await tx.employeeHistory.create({
        data: { employeeId: e.id, changeType: 'HIRE', effectiveDate: hireDate, toUnitId: dto.unitId, toPositionId: dto.positionId, orderNumber: dto.orderNumber, authorId: user.id },
      });
      return e;
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateEmployeeDto) {
    const cur = await this.get(user, id);
    await this.checkRefs(null, null, dto.managerId, id);
    const data: Prisma.EmployeeUncheckedUpdateInput = {
      personnelNumber: dto.personnelNumber, lastName: dto.lastName, firstName: dto.firstName, middleName: dto.middleName,
      hireDate: dto.hireDate ? parseDateOnly(dto.hireDate)! : undefined, managerId: dto.managerId, phone: dto.phone, email: dto.email, note: dto.note,
      updatedById: user.id,
    };
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined || k === 'updatedById') continue;
      const before = (cur as any)[k];
      const a = before instanceof Date ? formatDateOnly(before) : before ?? null;
      const b = v instanceof Date ? formatDateOnly(v) : v ?? null;
      if (a !== b) changes[k] = { from: a, to: b };
    }
    if (!Object.keys(changes).length) return cur;
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({ where: { id }, data });
      await tx.employeeHistory.create({
        data: { employeeId: id, changeType: 'UPDATE', effectiveDate: todayInTz(), changes: changes as Prisma.InputJsonValue, reason: dto.reason, authorId: user.id },
      });
      return e;
    });
  }

  async transfer(user: AuthUser, id: string, dto: TransferDto) {
    const cur = await this.get(user, id);
    if (cur.status === 'DISMISSED') throw badRequest('Нельзя перевести уволенного сотрудника');
    if (!dto.unitId && !dto.positionId) throw badRequest('Укажите новое подразделение и/или должность');
    const unitId = dto.unitId ?? cur.unitId;
    const positionId = dto.positionId ?? cur.positionId;
    if (unitId === cur.unitId && positionId === cur.positionId) throw badRequest('Подразделение и должность не изменились');
    assertInScope(user, unitId, 'целевому подразделению');
    await this.checkRefs(unitId, positionId);
    const eff = parseDateOnly(dto.effectiveDate)!;
    if (eff < cur.hireDate) throw badRequest('Дата перевода раньше даты приёма');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({ where: { id }, data: { unitId, positionId, updatedById: user.id } });
      await tx.employeeHistory.create({
        data: {
          employeeId: id, changeType: 'TRANSFER', effectiveDate: eff, fromUnitId: cur.unitId, toUnitId: unitId,
          fromPositionId: cur.positionId, toPositionId: positionId, reason: dto.reason, orderNumber: dto.orderNumber, authorId: user.id,
        },
      });
      return e;
    });
  }

  /** Увольнение: история инструктажей, проверок и выдачи СИЗ сохраняется */
  async dismiss(user: AuthUser, id: string, dto: DismissDto) {
    const cur = await this.get(user, id);
    if (cur.status === 'DISMISSED') throw badRequest('Сотрудник уже уволен');
    const d = parseDateOnly(dto.dismissalDate)!;
    if (d < cur.hireDate) throw badRequest('Дата увольнения раньше даты приёма');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({ where: { id }, data: { status: 'DISMISSED', dismissalDate: d, updatedById: user.id } });
      await tx.employeeHistory.create({
        data: { employeeId: id, changeType: 'DISMISSAL', effectiveDate: d, fromUnitId: cur.unitId, fromPositionId: cur.positionId, reason: dto.reason, orderNumber: dto.orderNumber, authorId: user.id, changes: { status: { from: cur.status, to: 'DISMISSED' } } },
      });
      // Открытые автоматические задачи по уволенному сотруднику закрываются как неактуальные
      await tx.task.updateMany({ where: { entityType: 'employee', entityId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED', result: 'Сотрудник уволен' } });
      return e;
    });
  }

  async setStatus(user: AuthUser, id: string, dto: StatusDto) {
    const cur = await this.get(user, id);
    if (cur.status === 'DISMISSED') throw badRequest('Для уволенного сотрудника используйте повторный приём');
    if (cur.status === dto.status) throw badRequest('Статус не изменился');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({ where: { id }, data: { status: dto.status, updatedById: user.id } });
      await tx.employeeHistory.create({
        data: { employeeId: id, changeType: 'STATUS_CHANGE', effectiveDate: parseDateOnly(dto.effectiveDate)!, reason: dto.reason, authorId: user.id, changes: { status: { from: cur.status, to: dto.status } } },
      });
      return e;
    });
  }

  async rehire(user: AuthUser, id: string, dto: RehireDto) {
    const cur = await this.get(user, id);
    if (cur.status !== 'DISMISSED') throw badRequest('Повторный приём возможен только для уволенного сотрудника');
    assertInScope(user, dto.unitId);
    await this.checkRefs(dto.unitId, dto.positionId);
    const hire = parseDateOnly(dto.hireDate)!;
    if (cur.dismissalDate && hire < cur.dismissalDate) throw badRequest('Дата повторного приёма раньше даты увольнения');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({ where: { id }, data: { status: 'ACTIVE', dismissalDate: null, hireDate: hire, unitId: dto.unitId, positionId: dto.positionId, updatedById: user.id } });
      await tx.employeeHistory.create({
        data: {
          employeeId: id, changeType: 'REHIRE', effectiveDate: hire, fromUnitId: cur.unitId, toUnitId: dto.unitId, fromPositionId: cur.positionId, toPositionId: dto.positionId,
          reason: dto.reason, orderNumber: dto.orderNumber, authorId: user.id,
          changes: { hireDate: { from: formatDateOnly(cur.hireDate), to: dto.hireDate }, dismissalDate: { from: formatDateOnly(cur.dismissalDate), to: null } },
        },
      });
      return e;
    });
  }
}

export type { EmployeeChangeType };
