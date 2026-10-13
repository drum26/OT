import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { inScope, narrowUnits } from '../common/scope';
import { badRequest, forbidden, notFound } from '../common/errors';
import { pageArgs } from '../common/pagination';
import { parseDateOnly, todayInTz } from '../common/dates';
import { toDate } from '../common/validation';
import { SettingsService } from '../core/settings.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { TableData } from '../core/export.service';
import { ComplianceService } from '../compliance/compliance.service';
import { selectRule } from '../compliance/rules';
import { fullName } from '../employees/employees.service';
import { EVENT_STATUS_RU } from '../briefings/briefings.service';
import { computeNextCheck, validateCheckConduct } from './check.logic';
import { CheckQuery, ConductCheckDto, PlanCheckDto, RegisterCheckDto, UpdateCheckPlanDto } from './checks.dto';
import { CancelDto } from '../briefings/briefings.dto';

export const OUTCOME_RU: Record<string, string> = { PASSED: 'Удовлетворительно', FAILED: 'Неудовлетворительно', ABSENT: 'Отсутствовал', PENDING: 'Нет результата' };
const empSel = { select: { id: true, personnelNumber: true, lastName: true, firstName: true, middleName: true } } as const;

@Injectable()
export class ChecksService {
  constructor(private prisma: PrismaService, private settings: SettingsService, private tree: UnitTreeService, private compliance: ComplianceService) {}

  async buildWhere(user: AuthUser, q: CheckQuery): Promise<Prisma.KnowledgeCheckWhereInput> {
    const today = todayInTz();
    let requested = q.unitIds;
    if (requested?.length) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(user, requested);
    const from = parseDateOnly(q.dateFrom), to = parseDateOnly(q.dateTo);
    const dateCond = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;
    const part: Prisma.KnowledgeCheckParticipantWhereInput = { unitId: units ? { in: units } : undefined, employeeId: q.employeeId };
    if (q.outcome === 'PENDING') part.result = { is: null };
    else if (q.outcome) part.result = { is: { outcome: q.outcome as any } };
    const and: Prisma.KnowledgeCheckWhereInput[] = [];
    if (units || q.employeeId || q.outcome) and.push({ participants: { some: part } });
    if (dateCond) and.push({ OR: [{ plannedDate: dateCond }, { conductedDate: dateCond }] });
    if (q.search) and.push({ OR: [{ protocolNumber: { contains: q.search, mode: 'insensitive' } }, { reason: { contains: q.search, mode: 'insensitive' } }] });
    let status: Prisma.KnowledgeCheckWhereInput = {};
    if (q.status === 'OVERDUE') status = { status: 'PLANNED', plannedDate: { lt: today } };
    else if (q.status) status = { status: q.status as any };
    return { AND: and, ...status, checkTypeId: q.typeId, responsibleEmployeeId: q.responsibleId, commissionId: q.commissionId };
  }

  async list(user: AuthUser, q: CheckQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = await this.buildWhere(user, q);
    const today = todayInTz();
    const [items, total] = await Promise.all([
      this.prisma.knowledgeCheck.findMany({
        where, skip, take,
        orderBy: [{ conductedDate: { sort: 'desc', nulls: 'first' } }, { plannedDate: 'desc' }],
        include: {
          checkType: { select: { id: true, name: true } }, commission: { select: { id: true, name: true } }, responsible: empSel,
          participants: { select: { employee: empSel, result: { select: { outcome: true } } } },
        },
      }),
      this.prisma.knowledgeCheck.count({ where }),
    ]);
    return {
      items: items.map(({ participants, ...c }) => ({
        ...c,
        displayStatus: c.status === 'PLANNED' && c.plannedDate && c.plannedDate < today ? 'OVERDUE' : c.status,
        responsibleName: c.responsible ? fullName(c.responsible) : null,
        participantsCount: participants.length,
        passedCount: participants.filter((p) => p.result?.outcome === 'PASSED').length,
        failedCount: participants.filter((p) => p.result?.outcome === 'FAILED').length,
        participantsPreview: participants.slice(0, 3).map((p) => fullName(p.employee)).join(', ') + (participants.length > 3 ? ` и ещё ${participants.length - 3}` : ''),
      })),
      total, page, pageSize,
    };
  }

  async exportTable(user: AuthUser, q: CheckQuery, title = 'Проверки знаний по охране труда'): Promise<TableData> {
    const where = await this.buildWhere(user, q);
    const scopeUnits = narrowUnits(user, q.unitIds?.length ? await this.tree.withDescendants(q.unitIds) : undefined);
    const rows = await this.prisma.knowledgeCheckParticipant.findMany({
      where: {
        check: where, unitId: scopeUnits ? { in: scopeUnits } : undefined, employeeId: q.employeeId,
        result: q.outcome === 'PENDING' ? { is: null } : q.outcome ? { is: { outcome: q.outcome as any } } : undefined,
      },
      include: { employee: true, result: true, check: { include: { checkType: true, commission: true, responsible: empSel } } },
      orderBy: [{ check: { conductedDate: 'desc' } }, { employee: { lastName: 'asc' } }],
      take: 50000,
    });
    const [units, positions] = await Promise.all([this.tree.names(), this.positionNames()]);
    const today = todayInTz();
    return {
      title,
      columns: [
        { key: 'date', title: 'Дата', type: 'date', width: 12 }, { key: 'type', title: 'Вид проверки', width: 24 },
        { key: 'personnelNumber', title: 'Таб. №', width: 10 }, { key: 'employee', title: 'Сотрудник', width: 30 },
        { key: 'position', title: 'Должность (на дату)', width: 26 }, { key: 'unit', title: 'Подразделение (на дату)', width: 26 },
        { key: 'reason', title: 'Основание', width: 24 }, { key: 'commission', title: 'Комиссия / ответственный', width: 26 },
        { key: 'protocol', title: 'Протокол', width: 18 }, { key: 'status', title: 'Статус', width: 14 },
        { key: 'outcome', title: 'Результат', width: 18 }, { key: 'nextDate', title: 'Следующая проверка', type: 'date', width: 12 },
      ],
      rows: rows.map((p) => {
        const c = p.check;
        const st = c.status === 'PLANNED' && c.plannedDate && c.plannedDate < today ? 'OVERDUE' : c.status;
        return {
          date: c.conductedDate ?? c.plannedDate, type: c.checkType.name, personnelNumber: p.employee.personnelNumber, employee: fullName(p.employee),
          position: positions.get(p.positionId), unit: units.get(p.unitId), reason: c.reason,
          commission: c.commission?.name ?? (c.responsible ? fullName(c.responsible) : ''),
          protocol: c.protocolNumber ? `№ ${c.protocolNumber}${c.protocolDate ? ' от ' + c.protocolDate.toISOString().slice(0, 10).split('-').reverse().join('.') : ''}` : '',
          status: EVENT_STATUS_RU[st], outcome: OUTCOME_RU[p.result?.outcome ?? 'PENDING'], nextDate: p.result?.nextCheckDate,
        };
      }),
    };
  }

  private async positionNames() {
    const ps = await this.prisma.position.findMany({ select: { id: true, name: true } });
    return new Map(ps.map((p) => [p.id, p.name]));
  }

  async get(user: AuthUser, id: string) {
    const c = await this.prisma.knowledgeCheck.findUnique({
      where: { id },
      include: {
        checkType: true, commission: { include: { members: { include: { employee: empSel } } } }, responsible: empSel,
        participants: { include: { employee: empSel, result: true }, orderBy: { employee: { lastName: 'asc' } } },
      },
    });
    if (!c) throw notFound('Проверка знаний');
    const visible = c.participants.filter((p) => inScope(user, p.unitId));
    if (!visible.length && user.unitIds !== null) throw forbidden('Нет доступа к проверке');
    const [units, positions] = await Promise.all([this.tree.names(), this.positionNames()]);
    const today = todayInTz();
    return {
      ...c,
      displayStatus: c.status === 'PLANNED' && c.plannedDate && c.plannedDate < today ? 'OVERDUE' : c.status,
      responsibleName: c.responsible ? fullName(c.responsible) : null,
      participants: visible.map((p) => ({ ...p, fullName: fullName(p.employee), unitName: units.get(p.unitId), positionName: positions.get(p.positionId) })),
      hiddenParticipants: c.participants.length - visible.length,
    };
  }

  private async loadEmployees(user: AuthUser, ids: string[]) {
    const emps = await this.prisma.employee.findMany({ where: { id: { in: ids } }, include: { position: { select: { workCategory: true } } } });
    if (emps.length !== ids.length) throw badRequest('Часть сотрудников не найдена');
    const out = emps.filter((e) => !inScope(user, e.unitId));
    if (out.length) throw forbidden(`Нет доступа к сотрудникам: ${out.slice(0, 5).map(fullName).join(', ')}`);
    return emps;
  }

  private async checkRefs(typeId?: string, commissionId?: string | null, responsibleId?: string | null) {
    if (typeId) {
      const t = await this.prisma.knowledgeCheckType.findUnique({ where: { id: typeId } });
      if (!t || !t.isActive) throw badRequest('Вид проверки не найден или в архиве');
    }
    if (commissionId && !(await this.prisma.commission.findUnique({ where: { id: commissionId } }))) throw badRequest('Комиссия не найдена');
    if (responsibleId && !(await this.prisma.employee.findUnique({ where: { id: responsibleId } }))) throw badRequest('Ответственное лицо не найдено');
  }

  async plan(user: AuthUser, dto: PlanCheckDto) {
    await this.checkRefs(dto.checkTypeId, dto.commissionId, dto.responsibleEmployeeId);
    const emps = await this.loadEmployees(user, dto.employeeIds);
    const dismissed = emps.filter((e) => e.status === 'DISMISSED');
    if (dismissed.length) throw badRequest(`Нельзя планировать для уволенных: ${dismissed.slice(0, 5).map(fullName).join(', ')}`);
    return this.prisma.knowledgeCheck.create({
      data: {
        checkTypeId: dto.checkTypeId, plannedDate: parseDateOnly(dto.plannedDate)!, reason: dto.reason, commissionId: dto.commissionId,
        responsibleEmployeeId: dto.responsibleEmployeeId, note: dto.note, createdById: user.id, updatedById: user.id,
        participants: { create: emps.map((e) => ({ employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) },
      },
    });
  }

  async updatePlan(user: AuthUser, id: string, dto: UpdateCheckPlanDto) {
    const c = await this.get(user, id);
    if (c.status !== 'PLANNED') throw badRequest('Изменять можно только запланированную проверку');
    await this.checkRefs(undefined, dto.commissionId, dto.responsibleEmployeeId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.employeeIds) {
        if (c.hiddenParticipants) throw forbidden('Проверка включает сотрудников вне вашей зоны доступа');
        const emps = await this.loadEmployees(user, dto.employeeIds);
        await tx.knowledgeCheckParticipant.deleteMany({ where: { checkId: id, employeeId: { notIn: dto.employeeIds } } });
        const ex = new Set(c.participants.map((p) => p.employeeId));
        await tx.knowledgeCheckParticipant.createMany({ data: emps.filter((e) => !ex.has(e.id)).map((e) => ({ checkId: id, employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) });
      }
      return tx.knowledgeCheck.update({
        where: { id },
        data: { plannedDate: toDate(dto.plannedDate) ?? undefined, reason: dto.reason, commissionId: dto.commissionId, responsibleEmployeeId: dto.responsibleEmployeeId, note: dto.note, updatedById: user.id },
      });
    });
  }

  async conduct(user: AuthUser, id: string, dto: ConductCheckDto) {
    const c = await this.get(user, id);
    if (c.status === 'CANCELLED') throw badRequest('Проверка отменена');
    if (c.hiddenParticipants) throw forbidden('Проверка включает сотрудников вне вашей зоны доступа');
    const planned = new Set(c.participants.map((p) => p.employeeId));
    const missing = [...planned].filter((e) => !dto.results.some((r) => r.employeeId === e));
    if (missing.length) throw badRequest('Укажите результат для всех участников (для отсутствовавших — «Отсутствовал»)');
    const extra = dto.results.filter((r) => !planned.has(r.employeeId)).map((r) => r.employeeId);
    if (extra.length) await this.loadEmployees(user, extra);
    return this.applyResults(user, id, c.checkTypeId, dto);
  }

  async register(user: AuthUser, dto: RegisterCheckDto) {
    await this.checkRefs(dto.checkTypeId, dto.commissionId, dto.responsibleEmployeeId);
    await this.loadEmployees(user, dto.results.map((r) => r.employeeId));
    await this.validate(dto);
    const c = await this.prisma.knowledgeCheck.create({ data: { checkTypeId: dto.checkTypeId, createdById: user.id, updatedById: user.id } });
    try {
      return await this.applyResults(user, c.id, dto.checkTypeId, dto);
    } catch (e) {
      await this.prisma.knowledgeCheck.delete({ where: { id: c.id } });
      throw e;
    }
  }

  private async validate(dto: ConductCheckDto) {
    const errors = validateCheckConduct({
      conductedDate: parseDateOnly(dto.conductedDate)!, today: todayInTz(), commissionId: dto.commissionId, responsibleEmployeeId: dto.responsibleEmployeeId,
      protocolNumber: dto.protocolNumber, protocolDate: parseDateOnly(dto.protocolDate), requireProtocol: !!(await this.settings.get('knowledgeChecks.requireProtocol')),
      results: dto.results,
    });
    if (errors.length) throw badRequest(errors.join('; '));
  }

  private async applyResults(user: AuthUser, id: string, typeId: string, dto: ConductCheckDto) {
    await this.checkRefs(undefined, dto.commissionId, dto.responsibleEmployeeId);
    await this.validate(dto);
    const conductedDate = parseDateOnly(dto.conductedDate)!;
    const emps = await this.prisma.employee.findMany({ where: { id: { in: dto.results.map((r) => r.employeeId) } } });
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const rules = (await this.compliance.checkRules()).filter((r) => r.typeId === typeId);
    const chains = await this.tree.ancestorsMap();
    const positions = new Map((await this.prisma.position.findMany({ select: { id: true, workCategory: true } })).map((p) => [p.id, p.workCategory]));
    const existing = new Map((await this.prisma.knowledgeCheckParticipant.findMany({ where: { checkId: id } })).map((p) => [p.employeeId, p]));

    return this.prisma.$transaction(async (tx) => {
      for (const r of dto.results) {
        const e = empMap.get(r.employeeId)!;
        if (conductedDate < e.hireDate) throw badRequest(`Дата проверки раньше даты приёма сотрудника ${fullName(e)}`);
        let part = existing.get(r.employeeId);
        if (!part) part = await tx.knowledgeCheckParticipant.create({ data: { checkId: id, employeeId: e.id, unitId: e.unitId, positionId: e.positionId } });
        const rule = selectRule(rules, typeId, { positionId: part.positionId, workCategory: positions.get(part.positionId) ?? null, unitChain: chains.get(part.unitId) ?? [part.unitId] }, conductedDate);
        const manualDate = parseDateOnly(r.nextCheckDate);
        if (manualDate && manualDate <= conductedDate) throw badRequest('Дата следующей проверки должна быть позже даты проверки');
        const next = computeNextCheck(r.outcome, conductedDate, rule, manualDate ? { date: manualDate, basis: r.nextCheckBasis! } : null);
        const data = {
          outcome: r.outcome, score: r.score, comment: r.comment, nextCheckDate: next.date, nextCheckRuleId: next.ruleId,
          nextCheckManual: next.manual, nextCheckBasis: next.basis, recordedById: user.id,
        };
        await tx.knowledgeCheckResult.upsert({ where: { participantId: part.id }, create: { ...data, participantId: part.id }, update: data });
      }
      const c = await tx.knowledgeCheck.update({
        where: { id },
        data: {
          status: 'CONDUCTED', conductedDate, commissionId: dto.commissionId, responsibleEmployeeId: dto.responsibleEmployeeId,
          protocolNumber: dto.protocolNumber, protocolDate: parseDateOnly(dto.protocolDate), reason: dto.reason, note: dto.note, updatedById: user.id,
        },
      });
      await tx.task.updateMany({ where: { entityType: 'knowledge_check', entityId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DONE', completedAt: new Date(), result: 'Проверка проведена' } });
      return c;
    });
  }

  async cancel(user: AuthUser, id: string, dto: CancelDto) {
    const c = await this.get(user, id);
    if (c.status !== 'PLANNED') throw badRequest('Отменить можно только запланированную проверку');
    if (c.hiddenParticipants) throw forbidden('Проверка включает сотрудников вне вашей зоны доступа');
    await this.prisma.task.updateMany({ where: { entityType: 'knowledge_check', entityId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED', result: 'Проверка отменена' } });
    return this.prisma.knowledgeCheck.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: dto.reason, updatedById: user.id } });
  }

  async employeeHistory(user: AuthUser, employeeId: string) {
    const e = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!e) throw notFound('Сотрудник');
    if (!inScope(user, e.unitId)) throw forbidden();
    const [rows, units, positions] = await Promise.all([
      this.prisma.knowledgeCheckParticipant.findMany({
        where: { employeeId },
        include: { result: true, check: { include: { checkType: { select: { name: true } }, commission: { select: { name: true } }, responsible: empSel } } },
        orderBy: [{ check: { conductedDate: { sort: 'desc', nulls: 'first' } } }, { check: { plannedDate: 'desc' } }],
      }),
      this.tree.names(), this.positionNames(),
    ]);
    const today = todayInTz();
    return rows.map((p) => ({
      ...p, unitName: units.get(p.unitId), positionName: positions.get(p.positionId),
      displayStatus: p.check.status === 'PLANNED' && p.check.plannedDate && p.check.plannedDate < today ? 'OVERDUE' : p.check.status,
      responsibleName: p.check.responsible ? fullName(p.check.responsible) : null,
    }));
  }
}
