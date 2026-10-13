import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { notFound } from '../common/errors';
import { NotificationsService } from './notifications.service';

class ListQuery {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() unreadOnly?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize?: number;
}

class RuleUpdateDto {
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsInt({ each: true }) @Min(1, { each: true }) @Max(365, { each: true }) daysBefore?: number[];
  @IsOptional() @IsBoolean() notifyOnDueDate?: boolean;
  @IsOptional() @IsBoolean() notifyOverdue?: boolean;
  @IsOptional() @IsBoolean() notifyResponsible?: boolean;
  @IsOptional() @IsBoolean() notifyUnitHeads?: boolean;
  @IsOptional() @IsBoolean() notifySafetySpecialists?: boolean;
  @IsOptional() @IsBoolean() createTaskOnOverdue?: boolean;
  @IsOptional() @IsArray() @IsIn(['IN_APP', 'EMAIL'], { each: true }) channels?: string[];
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(private svc: NotificationsService, private prisma: PrismaService) {}

  @Get('notifications')
  list(@CurrentUser() u: AuthUser, @Query() q: ListQuery) {
    return this.svc.list(u.id, !!q.unreadOnly, q.page ?? 1, q.pageSize ?? 20);
  }

  @Get('notifications/unread-count')
  async unread(@CurrentUser() u: AuthUser) {
    return { count: await this.prisma.notification.count({ where: { userId: u.id, readAt: null } }) };
  }

  @Post('notifications/:id/read') @HttpCode(200)
  async read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const r = await this.prisma.notification.updateMany({ where: { id, userId: u.id, readAt: null }, data: { readAt: new Date() } });
    if (!r.count && !(await this.prisma.notification.findFirst({ where: { id, userId: u.id } }))) throw notFound('Уведомление');
    return { ok: true };
  }

  @Post('notifications/read-all') @HttpCode(200)
  async readAll(@CurrentUser() u: AuthUser) {
    const r = await this.prisma.notification.updateMany({ where: { userId: u.id, readAt: null }, data: { readAt: new Date() } });
    return { updated: r.count };
  }

  @Get('notification-rules') @RequirePermissions('settings.manage')
  rules() { return this.prisma.notificationRule.findMany({ orderBy: { eventType: 'asc' } }); }

  @Put('notification-rules/:id') @RequirePermissions('settings.manage')
  updateRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RuleUpdateDto) {
    return this.prisma.notificationRule.update({ where: { id }, data: dto });
  }

  @Post('notifications/run') @RequirePermissions('settings.manage') @HttpCode(200)
  run() { return this.svc.generate(); }

  @Get('notifications/deliveries') @RequirePermissions('settings.manage')
  deliveries() {
    return this.prisma.notificationDelivery.findMany({
      where: { status: { in: ['FAILED', 'SKIPPED'] } }, orderBy: { createdAt: 'desc' }, take: 200,
      include: { notification: { select: { title: true, user: { select: { login: true } } } } },
    });
  }
}
