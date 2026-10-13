import { Injectable } from '@nestjs/common';
import { ConfirmationMethod, ParticipantResult, Prisma } from '@prisma/client';
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
import { nextDateByRule, selectRule } from '../compliance/rules';
import { fullName } from '../employees/employees.service';
import { validateConduct } from './briefing.logic';
import { CancelDto, ConductDto, ConfirmDto, EventQuery, PlanBriefingDto, RegisterBriefingDto, UpdatePlanDto } from './briefings.dto';

export const EVENT_STATUS_RU: Record<string, string> = { PLANNED: 'Запланирован', CONDUCTED: 'Проведён', CANCELLED: 'Отменён', OVERDUE: 'Просрочен' };
export const RESULT_RU: Record<string, string> = { PENDING: 'Ожидается', COMPLETED: 'Прошёл', NOT_COMPLETED: 'Не прошёл', ABSENT: 'Отсутствовал' };
export const CONFIRM_RU: Record<string, string> = { PAPER_JOURNAL_SIGNATURE: 'Подпись в бумажном журнале', SCANNED_DOCUMENT: 'Скан документа', ELECTRONIC: 'Электронное подтверждение', OTHER: 'Иное' };

const empSel = { select: { id: true, personnelNumber: true, lastName: true, firstName: true, middleName: true } } as const;

@Injectable()
export class BriefingsService {
  constructor(
    private prisma: PrismaService,
    private settings: SettingsService,
    private tree: UnitTreeService,
    private compliance: ComplianceService,
  ) {}

  async buildWhere(user: AuthUser, q: EventQuery): Promise<Prisma.BriefingWhereInput> {
    const today = todayInTz();
    let requested = q.unitIds;
    if (requested?.length) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(user, requested);
    const from = parseDateOnly(q.dateFrom), to = parseDateOnly(q.dateTo);
    const dateCond = from || to ? { gte: from ?? undefined, lte: to ?? undefined } : undefined;
    const partCond: Prisma.BriefingParticipantWhereInput = { unitId: units ? { in: units } : undefined, employeeId: q.employeeId };
    const and: Prisma.BriefingWhereInput[] = [];
    if (units || q.employeeId) and.push({ participants: { some: partCond } });
    if (dateCond) and.push({ OR: [{ plannedDate: dateCond }, { conductedDate: dateCond }] });
    if (q.search) and.push({ OR: [{ topic: { contains: q.search, mode: 'insensitive' } }, { reason: { contains: q.search, mode: 'insensitive' } }] });
    let status: Prisma.BriefingWhereInput = {};
    if (q.status === 'OVERDUE') status = { status: 'PLANNED', plannedDate: { lt: today } };
    else if (q.status) status = { status: q.status as any };
    return { AND: and, ...status, briefingTypeId: q.typeId, responsibleEmployeeId: q.responsibleId };
  }

  async list(user: AuthUser, q: EventQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where = await this.buildWhere(user, q);
    const today = todayInTz();
    const [items, total] = await Promise.all([
      this.prisma.briefing.findMany({
        where, skip, take,
        orderBy: q.sortBy === 'date' && q.sortDir === 'asc' ? [{ plannedDate: 'asc' }] : [{ conductedDate: { sort: 'desc', nulls: 'first' } }, { plannedDate: 'desc' }],
        include: {
          briefingType: { select: { id: true, name: true, requiresConfirmation: true } },
          responsible: empSel,
          participants: { select: { result: true, confirmed: true, employee: empSel } },
        },
      }),
      this.prisma.briefing.count({ where }),
    ]);
    return {
      items: items.map(({ participants, ...b }) => ({
        ...b,
        displayStatus: b.status === 'PLANNED' && b.plannedDate && b.plannedDate < today ? 'OVERDUE' : b.status,
        responsibleName: b.responsible ? fullName(b.responsible) : null,
        participantsCount: participants.length,
        completedCount: participants.filter((p) => p.result === 'COMPLETED').length,
        unconfirmedCount: participants.filter((p) => p.result === 'COMPLETED' && !p.confirmed).length,
        participantsPreview: participants.slice(0, 3).map((p) => fullName(p.employee)).join(', ') + (participants.length > 3 ? ` и ещё ${participants.length - 3}` : ''),
      })),
      total, page, pageSize,
    };
  }

  async exportTable(user: AuthUser, q: EventQuery): Promise<TableData> {
    const where = await this.buildWhere(user, q);
    const units = narrowUnits(user, q.unitIds?.length ? await this.tree.withDescendants(q.unitIds) : undefined);
    // Строки — участники: фильтр по сотруднику и подразделению (на момент мероприятия) применяется к каждой строке
    const rows = await this.prisma.briefingParticipant.findMany({
      where: { briefing: where, unitId: units ? { in: units } : undefined, employeeId: q.employeeId },
      include: { employee: { include: { unit: true, position: true } }, briefing: { include: { briefingType: true, responsible: empSel, document: true } } },
      orderBy: [{ briefing: { conductedDate: 'desc' } }, { employee: { lastName: 'asc' } }],
      take: 50000,
    });
    const today = todayInTz();
    return {
      title: 'Журнал инструктажей',
      columns: [
        { key: 'date', title: 'Дата', type: 'date', width: 12 }, { key: 'type', title: 'Вид инструктажа', width: 24 },
        { key: 'personnelNumber', title: 'Таб. №', width: 10 }, { key: 'employee', title: 'Сотрудник', width: 30 },
        { key: 'position', title: 'Должность', width: 26 }, { key: 'unit', title: 'Подразделение', width: 26 },
        { key: 'topic', title: 'Тема / основание', width: 30 }, { key: 'document', title: 'Инструкция', width: 26 },
        { key: 'responsible', title: 'Проводил', width: 26 }, { key: 'status', title: 'Статус', width: 14 },
        { key: 'result', title: 'Результат', width: 14 }, { key: 'confirmation', title: 'Подтверждение', width: 22 }, { key: 'nextDue', title: 'Следующий', type: 'date', width: 12 },
      ],
      rows: rows.map((p) => {
        const b = p.briefing;
        const st = b.status === 'PLANNED' && b.plannedDate && b.plannedDate < today ? 'OVERDUE' : b.status;
        return {
          date: b.conductedDate ?? b.plannedDate, type: b.briefingType.name, personnelNumber: p.employee.personnelNumber, employee: fullName(p.employee),
          position: p.employee.position.name, unit: p.employee.unit.name, topic: [b.topic, b.reason].filter(Boolean).join('; '),
          document: b.document ? [b.document.number, b.document.title].filter(Boolean).join(' ') : '', responsible: b.responsible ? fullName(b.responsible) : '',
          status: EVENT_STATUS_RU[st], result: RESULT_RU[p.result], confirmation: p.confirmed ? CONFIRM_RU[p.confirmationMethod ?? 'OTHER'] : '', nextDue: p.nextDueDate,
        };
      }),
    };
  }

  async get(user: AuthUser, id: string) {
    const b = await this.prisma.briefing.findUnique({
      where: { id },
      include: {
        briefingType: true, document: true, responsible: empSel,
        participants: {
          include: { employee: { include: { unit: { select: { name: true } }, position: { select: { name: true } } } } },
          orderBy: { employee: { lastName: 'asc' } },
        },
      },
    });
    if (!b) throw notFound('Инструктаж');
    const visible = b.participants.filter((p) => inScope(user, p.unitId));
    if (!visible.length && user.unitIds !== null) throw forbidden('Нет доступа к инструктажу');
    const today = todayInTz();
    return {
      ...b,
      displayStatus: b.status === 'PLANNED' && b.plannedDate && b.plannedDate < today ? 'OVERDUE' : b.status,
      responsibleName: b.responsible ? fullName(b.responsible) : null,
      participants: visible.map((p) => ({ ...p, fullName: fullName(p.employee) })),
      hiddenParticipants: b.participants.length - visible.length,
    };
  }

  private async loadEmployees(user: AuthUser, ids: string[]) {
    const emps = await this.prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, unitId: true, positionId: true, status: true, lastName: true, firstName: true, middleName: true, hireDate: true } });
    if (emps.length !== ids.length) throw badRequest('Часть сотрудников не найдена');
    const outOfScope = emps.filter((e) => !inScope(user, e.unitId));
    if (outOfScope.length) throw forbidden(`Нет доступа к сотрудникам: ${outOfScope.slice(0, 5).map(fullName).join(', ')}`);
    return emps;
  }

  private async checkRefs(typeId?: string, documentId?: string | null, responsibleId?: string | null) {
    if (typeId) {
      const t = await this.prisma.briefingType.findUnique({ where: { id: typeId } });
      if (!t || !t.isActive) throw badRequest('Вид инструктажа не найден или в архиве');
    }
    if (documentId && !(await this.prisma.safetyDocument.findUnique({ where: { id: documentId } }))) throw badRequest('Документ не найден');
    if (responsibleId && !(await this.prisma.employee.findUnique({ where: { id: responsibleId } }))) throw badRequest('Ответственное лицо не найдено');
  }

  async plan(user: AuthUser, dto: PlanBriefingDto) {
    await this.checkRefs(dto.briefingTypeId, dto.documentId, dto.responsibleEmployeeId);
    const emps = await this.loadEmployees(user, dto.employeeIds);
    const dismissed = emps.filter((e) => e.status === 'DISMISSED');
    if (dismissed.length) throw badRequest(`Нельзя планировать для уволенных: ${dismissed.slice(0, 5).map(fullName).join(', ')}`);
    return this.prisma.briefing.create({
      data: {
        briefingTypeId: dto.briefingTypeId, status: 'PLANNED', plannedDate: parseDateOnly(dto.plannedDate)!, topic: dto.topic, reason: dto.reason,
        documentId: dto.documentId, responsibleEmployeeId: dto.responsibleEmployeeId, note: dto.note, createdById: user.id, updatedById: user.id,
        participants: { create: emps.map((e) => ({ employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) },
      },
    });
  }

  async updatePlan(user: AuthUser, id: string, dto: UpdatePlanDto) {
    const b = await this.get(user, id);
    if (b.status !== 'PLANNED') throw badRequest('Изменять можно только запланированный инструктаж');
    await this.checkRefs(undefined, dto.documentId, dto.responsibleEmployeeId);
    return this.prisma.$transaction(async (tx) => {
      if (dto.employeeIds) {
        if (b.hiddenParticipants) throw forbidden('Инструктаж включает сотрудников вне вашей зоны доступа — изменение состава невозможно');
        const emps = await this.loadEmployees(user, dto.employeeIds);
        await tx.briefingParticipant.deleteMany({ where: { briefingId: id, employeeId: { notIn: dto.employeeIds } } });
        const existing = new Set(b.participants.map((p) => p.employeeId));
        await tx.briefingParticipant.createMany({ data: emps.filter((e) => !existing.has(e.id)).map((e) => ({ briefingId: id, employeeId: e.id, unitId: e.unitId, positionId: e.positionId })) });
      }
      return tx.briefing.update({
        where: { id },
        data: { plannedDate: toDate(dto.plannedDate) ?? undefined, topic: dto.topic, reason: dto.reason, documentId: dto.documentId, responsibleEmployeeId: dto.responsibleEmployeeId, note: dto.note, updatedById: user.id },
      });
    });
  }

  /** Регистрация проведения (для запланированного или ранее проведённого — исправление) */
  async conduct(user: AuthUser, id: string, dto: ConductDto) {
    const b = await this.get(user, id);
    if (b.status === 'CANCELLED') throw badRequest('Инструктаж отменён');
    if (b.hiddenParticipants) throw forbidden('Инструктаж включает сотрудников вне вашей зоны доступа');
    const planned = new Set(b.participants.map((p) => p.employeeId));
    const extra = dto.participants.filter((p) => !planned.has(p.employeeId)).map((p) => p.employeeId);
    if (extra.length) await this.loadEmployees(user, extra);
    const missing = [...planned].filter((eid) => !dto.participants.some((p) => p.employeeId === eid));
    if (missing.length) throw badRequest('Укажите результат для всех участников (для отсутствовавших — «Отсутствовал»)');
    return this.applyConduct(user, id, b.briefingTypeId, dto);
  }

  async register(user: AuthUser, dto: RegisterBriefingDto) {
    await this.checkRefs(dto.briefingTypeId, dto.documentId, dto.responsibleEmployeeId);
    await this.loadEmployees(user, dto.participants.map((p) => p.employeeId));
    const b = await this.prisma.briefing.create({
      data: { briefingTypeId: dto.briefingTypeId, status: 'PLANNED', createdById: user.id, updatedById: user.id },
    });
    try {
      return await this.applyConduct(user, b.id, dto.briefingTypeId, dto);
    } catch (e) {
      await this.prisma.briefing.delete({ where: { id: b.id } });
      throw e;
    }
  }

  private async applyConduct(user: AuthUser, id: string, typeId: string, dto: ConductDto) {
    await this.checkRefs(undefined, dto.documentId, dto.responsibleEmployeeId);
    const today = todayInTz();
    const conductedDate = parseDateOnly(dto.conductedDate)!;
    const errors = validateConduct(
      { conductedDate, today, responsibleEmployeeId: dto.responsibleEmployeeId, topic: dto.topic, documentId: dto.documentId, participants: dto.participants },
      { requireTopic: !!(await this.settings.get('briefings.requireTopic')), requireDocument: !!(await this.settings.get('briefings.requireDocument')) },
    );
    if (errors.length) throw badRequest(errors.join('; '));
    const emps = await this.prisma.employee.findMany({ where: { id: { in: dto.participants.map((p) => p.employeeId) } }, include: { position: { select: { workCategory: true } } } });
    const empMap = new Map(emps.map((e) => [e.id, e]));
    const rules = (await this.compliance.briefingRules()).filter((r) => r.typeId === typeId);
    const chains = await this.tree.ancestorsMap();
    const existing = await this.prisma.briefingParticipant.findMany({ where: { briefingId: id } });
    const exMap = new Map(existing.map((p) => [p.employeeId, p]));

    return this.prisma.$transaction(async (tx) => {
      for (const p of dto.participants) {
        const e = empMap.get(p.employeeId)!;
        if (conductedDate < e.hireDate) throw badRequest(`Дата проведения раньше даты приёма сотрудника ${fullName(e)}`);
        const ex = exMap.get(p.employeeId);
        const unitId = ex?.unitId ?? e.unitId;
        const positionId = ex?.positionId ?? e.positionId;
        let nextDueDate: Date | null = null;
        let nextDueRuleId: string | null = null;
        if (p.result === 'COMPLETED') {
          // Правило, действовавшее на дату проведения, для должности/подразделения на момент мероприятия
          const rule = selectRule(rules, typeId, { positionId, workCategory: e.position.workCategory, unitChain: chains.get(unitId) ?? [unitId] }, conductedDate);
          nextDueDate = nextDateByRule(conductedDate, rule);
          nextDueRuleId = rule?.id ?? null;
        }
        const confirmed = p.result === 'COMPLETED' && !!p.confirmed;
        const data = {
          result: p.result as ParticipantResult, note: p.note, nextDueDate, nextDueRuleId,
          confirmed: confirmed || (ex?.confirmed && p.result === 'COMPLETED') || false,
          confirmationMethod: confirmed ? (p.confirmationMethod as ConfirmationMethod) : ex?.confirmed && p.result === 'COMPLETED' ? ex.confirmationMethod : null,
          confirmedAt: confirmed ? new Date() : ex?.confirmed && p.result === 'COMPLETED' ? ex.confirmedAt : null,
          confirmedById: confirmed ? user.id : ex?.confirmed && p.result === 'COMPLETED' ? ex.confirmedById : null,
          confirmationNote: p.confirmationNote ?? ex?.confirmationNote,
        };
        if (ex) await tx.briefingParticipant.update({ where: { id: ex.id }, data });
        else await tx.briefingParticipant.create({ data: { ...data, briefingId: id, employeeId: e.id, unitId, positionId } });
      }
      const b = await tx.briefing.update({
        where: { id },
        data: {
          status: 'CONDUCTED', conductedDate, responsibleEmployeeId: dto.responsibleEmployeeId, topic: dto.topic, reason: dto.reason,
          documentId: dto.documentId, note: dto.note, updatedById: user.id,
        },
      });
      // Автоматические задачи по этому мероприятию закрываются
      await tx.task.updateMany({ where: { entityType: 'briefing', entityId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'DONE', completedAt: new Date(), result: 'Инструктаж проведён' } });
      return b;
    });
  }

  /** Фиксация фактического подтверждения проведения (подпись в журнале, скан и т.п.). Подписи не формируются системой. */
  async confirm(user: AuthUser, id: string, dto: ConfirmDto) {
    const b = await this.get(user, id);
    if (b.status !== 'CONDUCTED') throw badRequest('Подтверждение фиксируется только для проведённого инструктажа');
    const ids = new Set(b.participants.filter((p) => p.result === 'COMPLETED').map((p) => p.id));
    const bad = dto.participantIds.filter((pid) => !ids.has(pid));
    if (bad.length) throw badRequest('Подтверждение возможно только для участников с результатом «Прошёл»');
    await this.prisma.briefingParticipant.updateMany({
      where: { id: { in: dto.participantIds }, briefingId: id },
      data: { confirmed: true, confirmationMethod: dto.method as ConfirmationMethod, confirmedAt: new Date(), confirmedById: user.id, confirmationNote: dto.note },
    });
    return { ok: true, confirmed: dto.participantIds.length };
  }

  async cancel(user: AuthUser, id: string, dto: CancelDto) {
    const b = await this.get(user, id);
    if (b.status !== 'PLANNED') throw badRequest('Отменить можно только запланированный инструктаж');
    if (b.hiddenParticipants) throw forbidden('Инструктаж включает сотрудников вне вашей зоны доступа');
    await this.prisma.task.updateMany({ where: { entityType: 'briefing', entityId: id, status: { in: ['OPEN', 'IN_PROGRESS'] } }, data: { status: 'CANCELLED', result: 'Инструктаж отменён' } });
    return this.prisma.briefing.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: dto.reason, updatedById: user.id } });
  }

  async employeeHistory(user: AuthUser, employeeId: string) {
    const e = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!e) throw notFound('Сотрудник');
    if (!inScope(user, e.unitId)) throw forbidden();
    const rows = await this.prisma.briefingParticipant.findMany({
      where: { employeeId },
      include: { briefing: { include: { briefingType: { select: { name: true } }, responsible: empSel, document: { select: { title: true, number: true } } } } },
      orderBy: [{ briefing: { conductedDate: { sort: 'desc', nulls: 'first' } } }, { briefing: { plannedDate: 'desc' } }],
    });
    const today = todayInTz();
    return rows.map((p) => ({
      ...p,
      displayStatus: p.briefing.status === 'PLANNED' && p.briefing.plannedDate && p.briefing.plannedDate < today ? 'OVERDUE' : p.briefing.status,
      responsibleName: p.briefing.responsible ? fullName(p.briefing.responsible) : null,
    }));
  }
}
