import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { fileResponse } from '../common/send-file';
import { ExportService } from '../core/export.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceQuery } from '../compliance/compliance.dto';
import { complianceTable } from '../compliance/compliance.table';
import { CancelDto } from '../briefings/briefings.dto';
import { ChecksService } from './checks.service';
import { CheckExportQuery, CheckQuery, ConductCheckDto, PlanCheckDto, RegisterCheckDto, UpdateCheckPlanDto } from './checks.dto';

@ApiTags('knowledge-checks')
@ApiBearerAuth()
@Controller('knowledge-checks')
export class ChecksController {
  constructor(private svc: ChecksService, private compliance: ComplianceService, private exporter: ExportService) {}

  @Get() @RequirePermissions('checks.read')
  list(@CurrentUser() u: AuthUser, @Query() q: CheckQuery) { return this.svc.list(u, q); }

  @Get('export') @RequirePermissions('checks.read', 'reports.export')
  async export(@CurrentUser() u: AuthUser, @Query() q: CheckExportQuery, @Res({ passthrough: true }) res: Response) {
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(await this.svc.exportTable(u, q), f), 'Проверки знаний', f);
  }

  @Get('compliance') @RequirePermissions('checks.read')
  complianceList(@CurrentUser() u: AuthUser, @Query() q: ComplianceQuery) { return this.compliance.compute(u, 'check', q); }

  @Get('compliance/export') @RequirePermissions('checks.read', 'reports.export')
  async complianceExport(@CurrentUser() u: AuthUser, @Query() q: ComplianceQuery, @Res({ passthrough: true }) res: Response) {
    const rows = await this.compliance.compute(u, 'check', q);
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(complianceTable('Сотрудники, которым необходимо пройти проверку знаний', rows, 'Вид проверки'), f), 'Потребность в проверках знаний', f);
  }

  @Get('employee/:employeeId') @RequirePermissions('checks.read')
  employeeHistory(@CurrentUser() u: AuthUser, @Param('employeeId', ParseUUIDPipe) id: string) { return this.svc.employeeHistory(u, id); }

  @Get(':id') @RequirePermissions('checks.read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post('plan') @RequirePermissions('checks.plan')
  plan(@CurrentUser() u: AuthUser, @Body() dto: PlanCheckDto) { return this.svc.plan(u, dto); }

  @Post('register') @RequirePermissions('checks.conduct')
  register(@CurrentUser() u: AuthUser, @Body() dto: RegisterCheckDto) { return this.svc.register(u, dto); }

  @Patch(':id') @RequirePermissions('checks.plan')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCheckPlanDto) { return this.svc.updatePlan(u, id, dto); }

  @Post(':id/conduct') @RequirePermissions('checks.conduct')
  conduct(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConductCheckDto) { return this.svc.conduct(u, id, dto); }

  @Post(':id/cancel') @RequirePermissions('checks.plan')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto) { return this.svc.cancel(u, id, dto); }
}
