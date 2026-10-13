import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { IsOptionalDateOnly } from '../common/validation';
import { fileResponse } from '../common/send-file';
import { ExportService } from '../core/export.service';
import { REPORTS, ReportsService } from './reports.service';

class ReportQuery {
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Array.isArray(value) ? value : String(value).split(',').filter(Boolean))) @IsArray() @IsUUID('all', { each: true }) unitIds?: string[];
  @IsOptionalDateOnly() dateFrom?: string;
  @IsOptionalDateOnly() dateTo?: string;
  @IsOptional() @IsUUID() typeId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsIn(['PASSED', 'FAILED', 'ABSENT']) outcome?: string;
  @IsOptional() @IsIn(['xlsx', 'csv', 'pdf', 'html']) format?: 'xlsx' | 'csv' | 'pdf' | 'html';
}

@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private svc: ReportsService, private exporter: ExportService) {}

  @Get() @RequirePermissions('reports.read')
  list() { return REPORTS; }

  @Get(':code') @RequirePermissions('reports.read')
  get(@CurrentUser() u: AuthUser, @Param('code') code: string, @Query() q: ReportQuery) { return this.svc.build(u, code, q); }

  @Get(':code/export') @RequirePermissions('reports.read', 'reports.export')
  async export(@CurrentUser() u: AuthUser, @Param('code') code: string, @Query() q: ReportQuery, @Res({ passthrough: true }) res: Response) {
    const t = await this.svc.build(u, code, q);
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(t, f), t.title, f);
  }
}
