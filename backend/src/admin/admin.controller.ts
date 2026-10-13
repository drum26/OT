import { Body, Controller, Get, Param, Post, Put, Query, Res, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDefined, IsOptional, IsString } from 'class-validator';
import { Prisma } from '@prisma/client';
import { createReadStream } from 'fs';
import { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { PageQuery, pageArgs } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { SETTINGS_DEFAULTS, SettingsService } from '../core/settings.service';
import { badRequest } from '../common/errors';
import { BackupService } from './backup.service';
import { IsOptionalDateOnly } from '../common/validation';
import { addDays, parseDateOnly } from '../common/dates';

class AuditQuery extends PageQuery {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() userLogin?: string;
  @IsOptionalDateOnly() dateFrom?: string;
  @IsOptionalDateOnly() dateTo?: string;
}

class SettingDto {
  @IsDefined() value: unknown;
}

@ApiTags('admin')
@ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private prisma: PrismaService, private settings: SettingsService, private backup: BackupService) {}

  @Get('audit') @RequirePermissions('audit.read')
  async audit(@Query() q: AuditQuery) {
    const { skip, take, page, pageSize } = pageArgs(q);
    const where: Prisma.AuditLogWhereInput = {
      entityType: q.entityType || undefined,
      userLogin: q.userLogin ? { contains: q.userLogin, mode: 'insensitive' } : undefined,
      action: q.search ? { contains: q.search, mode: 'insensitive' } : undefined,
      createdAt: { gte: parseDateOnly(q.dateFrom) ?? undefined, lt: q.dateTo ? addDays(parseDateOnly(q.dateTo)!, 1) : undefined },
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip, take, orderBy: { createdAt: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items: items.map((i) => ({ ...i, id: i.id.toString() })), total, page, pageSize };
  }

  @Get('settings') @RequirePermissions('settings.manage')
  async getSettings() {
    const values = await this.settings.all();
    return Object.entries(SETTINGS_DEFAULTS).map(([key, d]) => ({ key, value: values[key], description: d.description, default: d.value }));
  }

  @Put('settings/:key') @RequirePermissions('settings.manage')
  async setSetting(@Param('key') key: string, @Body() dto: SettingDto, @CurrentUser() user: AuthUser) {
    const def = SETTINGS_DEFAULTS[key];
    if (!def) throw badRequest('Неизвестный параметр');
    if (def.value !== null && dto.value !== null && typeof def.value !== typeof dto.value) throw badRequest('Неверный тип значения');
    if (typeof dto.value === 'number' && (dto.value < 0 || dto.value > 3650)) throw badRequest('Недопустимое значение');
    await this.settings.set(key, dto.value, user.id);
    return { key, value: dto.value };
  }

  @Get('backups') @RequirePermissions('backup.manage')
  backups() { return this.backup.list(); }

  @Post('backups') @RequirePermissions('backup.manage')
  createBackup() { return this.backup.create(); }

  @Get('backups/:name') @RequirePermissions('backup.manage')
  async download(@Param('name') name: string, @Res({ passthrough: true }) res: Response) {
    const file = await this.backup.resolveFile(name);
    res.set({ 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"` });
    return new StreamableFile(createReadStream(file));
  }
}
