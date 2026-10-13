import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { fileResponse } from '../common/send-file';
import { assertValidUpload, uploadOptions } from '../common/upload';
import { ExportService } from '../core/export.service';
import { CreateEmployeeDto, DismissDto, EmployeeExportQuery, EmployeeQuery, ImportOptionsDto, RehireDto, StatusDto, TransferDto, UpdateEmployeeDto } from './employees.dto';
import { EmployeesService } from './employees.service';
import { EmployeeImportService } from './employee-import.service';


@ApiTags('employees')
@ApiBearerAuth()
@Controller('employees')
export class EmployeesController {
  constructor(private svc: EmployeesService, private imp: EmployeeImportService, private exporter: ExportService) {}

  @Get() @RequirePermissions('employees.read')
  list(@CurrentUser() u: AuthUser, @Query() q: EmployeeQuery) { return this.svc.list(u, q); }

  @Get('export') @RequirePermissions('employees.read') @RequireAnyPermission('reports.export', 'employees.import')
  async export(@CurrentUser() u: AuthUser, @Query() q: EmployeeExportQuery, @Res({ passthrough: true }) res: Response) {
    const table = await this.svc.exportTable(u, q);
    return fileResponse(res, await this.exporter.export(table, q.format ?? 'xlsx'), 'Сотрудники', q.format ?? 'xlsx');
  }

  @Get('import/template') @RequirePermissions('employees.import')
  async template(@Res({ passthrough: true }) res: Response) {
    return fileResponse(res, await this.imp.template(), 'Шаблон импорта сотрудников', 'xlsx');
  }

  @Post('import/preview') @RequirePermissions('employees.import')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions(['xlsx', 'csv'])))
  preview(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() o: ImportOptionsDto) {
    assertValidUpload(file);
    return this.imp.preview(u, file, { updateExisting: !!o.updateExisting, createMissingUnits: !!o.createMissingUnits, createMissingPositions: !!o.createMissingPositions });
  }

  @Post('import/:jobId/commit') @RequirePermissions('employees.import')
  commit(@CurrentUser() u: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) { return this.imp.commit(u, jobId); }

  @Post('import/:jobId/cancel') @RequirePermissions('employees.import')
  cancel(@CurrentUser() u: AuthUser, @Param('jobId', ParseUUIDPipe) jobId: string) { return this.imp.cancel(u, jobId); }

  @Get('import/jobs') @RequirePermissions('employees.import')
  jobs() { return this.imp.jobs(); }

  @Get('import/jobs/:jobId/errors') @RequirePermissions('employees.import')
  jobErrors(@Param('jobId', ParseUUIDPipe) jobId: string) { return this.imp.errors(jobId); }

  @Get(':id') @RequirePermissions('employees.read')
  get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }

  @Get(':id/history') @RequirePermissions('employees.read')
  history(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.history(u, id); }

  @Post() @RequirePermissions('employees.write', 'employees.dismiss')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateEmployeeDto) { return this.svc.create(u, dto); }

  @Patch(':id') @RequirePermissions('employees.write')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEmployeeDto) { return this.svc.update(u, id, dto); }

  @Post(':id/transfer') @RequirePermissions('employees.transfer')
  transfer(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto) { return this.svc.transfer(u, id, dto); }

  @Post(':id/dismiss') @RequirePermissions('employees.dismiss')
  dismiss(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DismissDto) { return this.svc.dismiss(u, id, dto); }

  @Post(':id/status') @RequirePermissions('employees.write')
  status(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: StatusDto) { return this.svc.setStatus(u, id, dto); }

  @Post(':id/rehire') @RequirePermissions('employees.dismiss')
  rehire(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RehireDto) { return this.svc.rehire(u, id, dto); }
}

