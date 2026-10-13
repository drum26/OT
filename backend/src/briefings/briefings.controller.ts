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
import { BriefingsService } from './briefings.service';
import { CancelDto, ConductDto, ConfirmDto, EventExportQuery, EventQuery, PlanBriefingDto, RegisterBriefingDto, UpdatePlanDto } from './briefings.dto';

@ApiTags('briefings')
@ApiBearerAuth()
@Controller('briefings')
export class BriefingsController {
  constructor(private svc: BriefingsService, private compliance: ComplianceService, private exporter: ExportService) {}

  @Get() @RequirePermissions('briefings.read')
  list(@CurrentUser() u: AuthUser, @Query() q: EventQuery) { return this.svc.list(u, q); }

  @Get('export') @RequirePermissions('briefings.read', 'reports.export')
  async export(@CurrentUser() u: AuthUser, @Query() q: EventExportQuery, @Res({ passthrough: true }) res: Response) {
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(await this.svc.exportTable(u, q), f), 'Журнал инструктажей', f);
  }

  /** Сотрудники, которым требуется инструктаж (по правилам периодичности) */
  @Get('compliance') @RequirePermissions('briefings.read')
  complianceList(@CurrentUser() u: AuthUser, @Query() q: ComplianceQuery) {
    return this.compliance.compute(u, 'briefing', q);
  }

  @Get('compliance/export') @RequirePermissions('briefings.read', 'reports.export')
  async complianceExport(@CurrentUser() u: AuthUser, @Query() q: ComplianceQuery, @Res({ passthrough: true }) res: Response) {
    const rows = await this.compliance.compute(u, 'briefing', q);
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(complianceTable('Сотрудники, которым необходимо пройти инструктаж', rows, 'Вид инструктажа'), f), 'Потребность в инструктажах', f);
  }

  @Get('employee/:employeeId') @RequirePermissions('briefings.read')
  employeeHistory(@CurrentUser() u: AuthUser, @Param('employeeId', ParseUUIDPipe) id: string) { return this.svc.employeeHistory(u, id); }

  @Get(':id') @RequirePermissions('briefings.read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Post('plan') @RequirePermissions('briefings.plan')
  plan(@CurrentUser() u: AuthUser, @Body() dto: PlanBriefingDto) { return this.svc.plan(u, dto); }

  @Post('register') @RequirePermissions('briefings.conduct')
  register(@CurrentUser() u: AuthUser, @Body() dto: RegisterBriefingDto) { return this.svc.register(u, dto); }

  @Patch(':id') @RequirePermissions('briefings.plan')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) { return this.svc.updatePlan(u, id, dto); }

  @Post(':id/conduct') @RequirePermissions('briefings.conduct')
  conduct(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConductDto) { return this.svc.conduct(u, id, dto); }

  @Post(':id/confirm') @RequirePermissions('briefings.conduct')
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmDto) { return this.svc.confirm(u, id, dto); }

  @Post(':id/cancel') @RequirePermissions('briefings.plan')
  cancel(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelDto) { return this.svc.cancel(u, id, dto); }
}
