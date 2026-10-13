import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Prisma, TaskPriority, TaskStatus, TaskType } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { PageQuery, pageArgs } from '../common/pagination';
import { EmptyToNull, IsOptionalDateOnly, toDate, Trim } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { assertInScope, inScope } from '../common/scope';
import { badRequest, forbidden, notFound } from '../common/errors';
import { todayInTz } from '../common/dates';
import { hasPermission } from '../auth/guards';

class TaskQuery extends PageQuery {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'ACTIVE', 'OVERDUE']) status?: string;
  @IsOptional() @IsIn(['MANUAL', 'CONTROL_EVENT', 'AUTO_BRIEFING', 'AUTO_CHECK', 'AUTO_PPE']) taskType?: TaskType;
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() mine?: boolean;
  @IsOptional() @IsString() @MaxLength(200) search?: string;
}

class TaskDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(500) title: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsIn(['MANUAL', 'CONTROL_EVENT']) taskType?: 'MANUAL' | 'CONTROL_EVENT';
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']) priority?: TaskPriority;
  @IsOptionalDateOnly() dueDate?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() assigneeUserId?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() unitId?: string | null;
}

class UpdateTaskDto {
  @Trim() @IsOptional() @IsString() @MinLength(3) @MaxLength(500) title?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']) priority?: TaskPriority;
  @IsOptionalDateOnly() dueDate?: string | null;
  @EmptyToNull() @IsOptional() @IsUUID() assigneeUserId?: string | null;
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']) status?: TaskStatus;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(5000) result?: string | null;
}

export const TASK_STATUS_RU: Record<string, string> = { OPEN: 'Открыта', IN_PROGRESS: 'В работе', DONE: 'Выполнена', CANCELLED: 'Отменена' };

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private prisma: PrismaService) {}

  private scopeWhere(user: AuthUser): Prisma.TaskWhereInput {
    if (user.unitIds === null) return {};
    return { OR: [{ unitId: { in: user.unitIds } }, { assigneeUserId: user.id }, { createdById: user.id }] };
  }

  @Get() @RequirePermissions('tasks.read')
  async list(@CurrentUser() u: AuthUser, @Query() q: TaskQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const today = todayInTz();
    let status: Prisma.TaskWhereInput = {};
    if (q.status === 'ACTIVE') status = { status: { in: ['OPEN', 'IN_PROGRESS'] } };
    else if (q.status === 'OVERDUE') status = { status: { in: ['OPEN', 'IN_PROGRESS'] }, dueDate: { lt: today } };
    else if (q.status) status = { status: q.status as TaskStatus };
    const where: Prisma.TaskWhereInput = {
      AND: [this.scopeWhere(u), status, q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}],
      taskType: q.taskType, assigneeUserId: q.mine ? u.id : q.assigneeUserId,
    };
    const [items, total] = await Promise.all([
      this.prisma.task.findMany({ where, skip, take, orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }], include: { assignee: { select: { id: true, fullName: true } } } }),
      this.prisma.task.count({ where }),
    ]);
    return { items: items.map((t) => ({ ...t, overdue: ['OPEN', 'IN_PROGRESS'].includes(t.status) && !!t.dueDate && t.dueDate < today })), total, page, pageSize };
  }

  @Get('assignees') @RequirePermissions('tasks.read')
  assignees() {
    return this.prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
  }

  @Get(':id') @RequirePermissions('tasks.read')
  async get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.task.findFirst({ where: { id, ...this.scopeWhere(u) }, include: { assignee: { select: { id: true, fullName: true } } } });
    if (!t) throw notFound('Задача');
    return t;
  }

  @Post() @RequirePermissions('tasks.manage')
  create(@CurrentUser() u: AuthUser, @Body() dto: TaskDto) {
    if (dto.unitId) assertInScope(u, dto.unitId);
    return this.prisma.task.create({
      data: { title: dto.title, description: dto.description, taskType: dto.taskType ?? 'MANUAL', priority: dto.priority ?? 'NORMAL', dueDate: toDate(dto.dueDate), assigneeUserId: dto.assigneeUserId, unitId: dto.unitId, createdById: u.id },
    });
  }

  @Patch(':id') @RequirePermissions('tasks.read')
  async update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) {
    const t = await this.get(u, id);
    const canManage = hasPermission(u, 'tasks.manage');
    const isAssignee = t.assigneeUserId === u.id;
    // Исполнитель без права управления может менять только статус и результат своей задачи
    if (!canManage) {
      if (!isAssignee) throw forbidden();
      if (dto.title || dto.description !== undefined || dto.priority || dto.dueDate !== undefined || dto.assigneeUserId !== undefined) throw forbidden('Можно изменить только статус и результат');
    }
    if (dto.status === 'DONE' && !dto.result && !t.result && t.taskType !== 'MANUAL') throw badRequest('Укажите результат выполнения');
    if (t.unitId && !inScope(u, t.unitId) && !isAssignee) throw forbidden();
    return this.prisma.task.update({
      where: { id },
      data: {
        title: dto.title, description: dto.description, priority: dto.priority, dueDate: toDate(dto.dueDate), assigneeUserId: dto.assigneeUserId,
        status: dto.status, result: dto.result, completedAt: dto.status === 'DONE' ? new Date() : dto.status ? null : undefined,
      },
    });
  }
}
