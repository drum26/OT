import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IsDateOnly } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { narrowUnits } from '../common/scope';
import { diffDays, parseDateOnly, todayInTz } from '../common/dates';
import { badRequest } from '../common/errors';
import { fullName } from '../employees/employees.service';

const csv = () => Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean)));
const TYPES = ['BRIEFING', 'CHECK', 'PPE_REPLACEMENT', 'TASK', 'CONTROL_EVENT'] as const;

class CalendarQuery {
  @IsDateOnly() from: string;
  @IsDateOnly() to: string;
  @IsOptional() @csv() @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptional() @csv() @IsArray() @IsIn(TYPES as unknown as string[], { each: true }) types?: string[];
  @IsOptional() @IsUUID() responsibleId?: string;
}

export interface CalendarEvent {
  id: string;
  type: (typeof TYPES)[number];
  date: string;
  title: string;
  status: string;
  overdue: boolean;
  responsible: string | null;
  units: string[];
  link: string;
  count?: number;
}

@ApiTags('calendar')
@ApiBearerAuth()
@Controller('calendar')
export class CalendarController {
  constructor(private prisma: PrismaService, private tree: UnitTreeService) {}

  @Get() @RequirePermissions('calendar.read')
  async events(@CurrentUser() u: AuthUser, @Query() q: CalendarQuery): Promise<CalendarEvent[]> {
    const from = parseDateOnly(q.from)!, to = parseDateOnly(q.to)!;
    if (to < from || diffDays(to, from) > 400) throw badRequest('Некорректный период (не более 400 дней)');
    let requested = q.unitIds;
    if (requested?.length) requested = await this.tree.withDescendants(requested);
    const units = narrowUnits(u, requested);
    const want = (t: string) => !q.types?.length || q.types.includes(t);
    const today = todayInTz();
    const names = await this.tree.names();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const perms = new Set(u.permissions);
    const out: CalendarEvent[] = [];
    const range = { gte: from, lte: to };

    if (want('BRIEFING') && perms.has('briefings.read')) {
      const list = await this.prisma.briefing.findMany({
        where: {
          OR: [{ status: 'PLANNED', plannedDate: range }, { status: 'CONDUCTED', conductedDate: range }],
          participants: units ? { some: { unitId: { in: units } } } : undefined, responsibleEmployeeId: q.responsibleId,
        },
        include: { briefingType: { select: { name: true } }, responsible: true, participants: { select: { unitId: true } } },
      });
      for (const b of list) {
        const d = b.status === 'CONDUCTED' ? b.conductedDate! : b.plannedDate!;
        out.push({
          id: b.id, type: 'BRIEFING', date: iso(d), title: `Инструктаж: ${b.briefingType.name}${b.topic ? ` — ${b.topic}` : ''}`, status: b.status,
          overdue: b.status === 'PLANNED' && d < today, responsible: b.responsible ? fullName(b.responsible) : null,
          units: [...new Set(b.participants.map((p) => names.get(p.unitId) ?? ''))], link: `/briefings/${b.id}`, count: b.participants.length,
        });
      }
    }
    if (want('CHECK') && perms.has('checks.read')) {
      const list = await this.prisma.knowledgeCheck.findMany({
        where: {
          OR: [{ status: 'PLANNED', plannedDate: range }, { status: 'CONDUCTED', conductedDate: range }],
          participants: units ? { some: { unitId: { in: units } } } : undefined, responsibleEmployeeId: q.responsibleId,
        },
        include: { checkType: { select: { name: true } }, responsible: true, commission: true, participants: { select: { unitId: true } } },
      });
      for (const c of list) {
        const d = c.status === 'CONDUCTED' ? c.conductedDate! : c.plannedDate!;
        out.push({
          id: c.id, type: 'CHECK', date: iso(d), title: `Проверка знаний: ${c.checkType.name}`, status: c.status, overdue: c.status === 'PLANNED' && d < today,
          responsible: c.commission?.name ?? (c.responsible ? fullName(c.responsible) : null),
          units: [...new Set(c.participants.map((p) => names.get(p.unitId) ?? ''))], link: `/checks/${c.id}`, count: c.participants.length,
        });
      }
    }
    if (want('PPE_REPLACEMENT') && perms.has('ppe.read') && !q.responsibleId) {
      const list = await this.prisma.ppeIssue.findMany({
        where: { status: { in: ['ACTIVE', 'PARTIALLY_CLOSED'] }, plannedReplacementDate: range, employee: { status: { not: 'DISMISSED' }, unitId: units ? { in: units } : undefined } },
        include: { employee: true, ppeItem: { select: { name: true } } },
      });
      for (const i of list) {
        out.push({
          id: i.id, type: 'PPE_REPLACEMENT', date: iso(i.plannedReplacementDate!), title: `Замена СИЗ: ${i.ppeItem.name} — ${fullName(i.employee)}`,
          status: 'PLANNED', overdue: i.plannedReplacementDate! < today, responsible: null, units: [names.get(i.employee.unitId) ?? ''], link: `/employees/${i.employeeId}?tab=ppe`,
        });
      }
    }
    if ((want('TASK') || want('CONTROL_EVENT')) && perms.has('tasks.read')) {
      const list = await this.prisma.task.findMany({
        where: {
          dueDate: range, status: { not: 'CANCELLED' },
          ...(units ? { OR: [{ unitId: { in: units } }, { assigneeUserId: u.id }] } : {}),
        },
        include: { assignee: { select: { fullName: true } } },
      });
      for (const t of list) {
        const type = t.taskType === 'CONTROL_EVENT' ? 'CONTROL_EVENT' : 'TASK';
        if (!want(type)) continue;
        out.push({
          id: t.id, type, date: iso(t.dueDate!), title: `${type === 'CONTROL_EVENT' ? 'Контрольное мероприятие' : 'Задача'}: ${t.title}`, status: t.status,
          overdue: ['OPEN', 'IN_PROGRESS'].includes(t.status) && t.dueDate! < today, responsible: t.assignee?.fullName ?? null,
          units: t.unitId ? [names.get(t.unitId) ?? ''] : [], link: `/tasks?id=${t.id}`,
        });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  }
}
