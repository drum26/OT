import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsUUID } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IsOptionalDateOnly } from '../common/validation';
import { addDays, parseDateOnly, todayInTz } from '../common/dates';
import { narrowUnits } from '../common/scope';
import { PrismaService } from '../prisma/prisma.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { SettingsService } from '../core/settings.service';
import { ComplianceService } from '../compliance/compliance.service';
import { PpeService } from '../ppe/ppe.service';
import { NEEDS_ACTION } from '../ppe/ppe.logic';
import { ReportsService } from '../reports/reports.service';
import { fullName } from '../employees/employees.service';

class DashboardQuery {
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean))) @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() responsibleId?: string;
  @IsOptionalDateOnly() dateFrom?: string;
  @IsOptionalDateOnly() dateTo?: string;
}

/** Главная панель: все показатели рассчитываются по данным БД с учётом зоны доступа пользователя */
@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(
    private prisma: PrismaService, private tree: UnitTreeService, private settings: SettingsService,
    private compliance: ComplianceService, private ppe: PpeService, private reports: ReportsService,
  ) {}

  @Get() @RequirePermissions('dashboard.read')
  async get(@CurrentUser() u: AuthUser, @Query() q: DashboardQuery) {
    const perms = new Set(u.permissions);
    const today = todayInTz();
    const upcomingDays = Number(await this.settings.get('deadlines.upcomingDays')) || 30;
    const from = parseDateOnly(q.dateFrom) ?? today;
    const to = parseDateOnly(q.dateTo) ?? addDays(today, upcomingDays);
    const units = narrowUnits(u, q.unitIds?.length ? await this.tree.withDescendants(q.unitIds) : undefined);
    const empWhere: Prisma.EmployeeWhereInput = { status: { not: 'DISMISSED' }, unitId: units ? { in: units } : undefined, positionId: q.positionId };
    const partUnit = units ? { in: units } : undefined;
    const cf = { unitIds: q.unitIds, positionId: q.positionId };

    const [activeEmployees, br, ch, ppeRows] = await Promise.all([
      this.prisma.employee.count({ where: empWhere }),
      perms.has('briefings.read') ? this.compliance.compute(u, 'briefing', cf) : Promise.resolve(null),
      perms.has('checks.read') ? this.compliance.compute(u, 'check', cf) : Promise.resolve(null),
      perms.has('ppe.read') ? this.ppe.needs(u, { unitIds: q.unitIds, positionId: q.positionId }) : Promise.resolve(null),
    ]);

    const res: Record<string, unknown> = { today, period: { from, to }, activeEmployees };

    if (br) {
      const overduePlanned = await this.prisma.briefingParticipant.findMany({
        where: { briefing: { status: 'PLANNED', plannedDate: { lt: today }, responsibleEmployeeId: q.responsibleId }, unitId: partUnit, employee: { status: { not: 'DISMISSED' }, positionId: q.positionId } },
        select: { employeeId: true },
      });
      const overdueEmp = new Set([...br.filter((r) => r.status === 'OVERDUE' || r.status === 'MISSING').map((r) => r.employeeId), ...overduePlanned.map((p) => p.employeeId)]);
      res.briefings = {
        overdueEmployees: overdueEmp.size,
        upcomingEvents: await this.prisma.briefing.count({ where: { status: 'PLANNED', plannedDate: { gte: from, lte: to }, responsibleEmployeeId: q.responsibleId, participants: { some: { unitId: partUnit } } } }),
        upcomingByRules: new Set(br.filter((r) => r.status === 'UPCOMING').map((r) => r.employeeId)).size,
        overduePlannedEvents: await this.prisma.briefing.count({ where: { status: 'PLANNED', plannedDate: { lt: today }, responsibleEmployeeId: q.responsibleId, participants: { some: { unitId: partUnit } } } }),
      };
    }
    if (ch) {
      const overduePlanned = await this.prisma.knowledgeCheckParticipant.findMany({
        where: { check: { status: 'PLANNED', plannedDate: { lt: today }, responsibleEmployeeId: q.responsibleId }, unitId: partUnit, employee: { status: { not: 'DISMISSED' }, positionId: q.positionId } },
        select: { employeeId: true },
      });
      res.checks = {
        overdueEmployees: new Set([...ch.filter((r) => r.status === 'OVERDUE' || r.status === 'MISSING').map((r) => r.employeeId), ...overduePlanned.map((p) => p.employeeId)]).size,
        failedEmployees: new Set(ch.filter((r) => r.status === 'FAILED').map((r) => r.employeeId)).size,
        upcomingEvents: await this.prisma.knowledgeCheck.count({ where: { status: 'PLANNED', plannedDate: { gte: from, lte: to }, responsibleEmployeeId: q.responsibleId, participants: { some: { unitId: partUnit } } } }),
        upcomingByRules: new Set(ch.filter((r) => r.status === 'UPCOMING').map((r) => r.employeeId)).size,
      };
    }
    if (ppeRows) {
      res.ppe = {
        needEmployees: new Set(ppeRows.filter((r) => NEEDS_ACTION.includes(r.status)).map((r) => r.employeeId)).size,
        replacementOverdue: ppeRows.filter((r) => r.status === 'REPLACEMENT_OVERDUE').length,
        awaitingConfirmation: ppeRows.filter((r) => r.status === 'AWAITING_CONFIRMATION').length,
      };
    }
    if (perms.has('tasks.read')) {
      const tw: Prisma.TaskWhereInput = { status: { in: ['OPEN', 'IN_PROGRESS'] }, ...(units ? { OR: [{ unitId: { in: units } }, { assigneeUserId: u.id }] } : {}) };
      res.tasks = { open: await this.prisma.task.count({ where: tw }), overdue: await this.prisma.task.count({ where: { ...tw, dueDate: { lt: today } } }) };
    }

    // Ближайшие мероприятия
    const nearest: Record<string, unknown>[] = [];
    if (perms.has('briefings.read')) {
      for (const b of await this.prisma.briefing.findMany({
        where: { status: 'PLANNED', plannedDate: { gte: today, lte: to }, responsibleEmployeeId: q.responsibleId, participants: { some: { unitId: partUnit } } },
        include: { briefingType: true, responsible: true, _count: { select: { participants: true } } }, orderBy: { plannedDate: 'asc' }, take: 10,
      })) nearest.push({ id: b.id, kind: 'briefing', date: b.plannedDate, title: `Инструктаж: ${b.briefingType.name}`, count: b._count.participants, responsible: b.responsible ? fullName(b.responsible) : null, link: `/briefings/${b.id}` });
    }
    if (perms.has('checks.read')) {
      for (const c of await this.prisma.knowledgeCheck.findMany({
        where: { status: 'PLANNED', plannedDate: { gte: today, lte: to }, responsibleEmployeeId: q.responsibleId, participants: { some: { unitId: partUnit } } },
        include: { checkType: true, commission: true, responsible: true, _count: { select: { participants: true } } }, orderBy: { plannedDate: 'asc' }, take: 10,
      })) nearest.push({ id: c.id, kind: 'check', date: c.plannedDate, title: `Проверка знаний: ${c.checkType.name}`, count: c._count.participants, responsible: c.commission?.name ?? (c.responsible ? fullName(c.responsible) : null), link: `/checks/${c.id}` });
    }
    res.nearestEvents = nearest.sort((a: any, b: any) => a.date - b.date).slice(0, 10);

    // Критические нарушения сроков: наибольшая просрочка и неудовлетворительные результаты
    const critical = [...(br ?? []), ...(ch ?? [])]
      .filter((r) => ['OVERDUE', 'MISSING', 'FAILED'].includes(r.status))
      .sort((a, b) => (a.status === 'FAILED' ? -1 : 0) - (b.status === 'FAILED' ? -1 : 0) || (a.daysLeft ?? 0) - (b.daysLeft ?? 0))
      .slice(0, 15)
      .map((r) => ({ employeeId: r.employeeId, fullName: r.fullName, personnelNumber: r.personnelNumber, unitName: r.unitName, kind: r.kind, typeName: r.typeName, dueDate: r.dueDate, daysOverdue: r.daysLeft !== null ? -r.daysLeft : null, status: r.status }));
    res.critical = critical;

    if (perms.has('reports.read') || perms.has('dashboard.read')) res.units = await this.reports.summaryRows(u, { unitIds: q.unitIds });
    return res;
  }
}
