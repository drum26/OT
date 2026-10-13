import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { fileResponse } from '../common/send-file';
import { assertValidUpload, uploadOptions } from '../common/upload';
import { ExportService } from '../core/export.service';
import { PpeService } from './ppe.service';
import { PpeImportService } from './ppe-import.service';
import {
  ConfirmReceiptDto, ImportModeDto, IssueDto, IssueExportQuery, IssueQuery, NeedsQuery, PpeItemDto, PpeStandardDto, ReplacementDateDto, ReturnDto,
  StandardQuery, StockOperationDto, UpdatePpeItemDto, UpdatePpeStandardDto,
} from './ppe.dto';

class ItemsQuery { @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() activeOnly?: boolean; }
class MovementsQuery { @IsOptional() @IsUUID() ppeItemId?: string; }
class TemplateQuery { @IsIn(['items', 'standards']) kind: 'items' | 'standards'; }

@ApiTags('ppe')
@ApiBearerAuth()
@Controller('ppe')
export class PpeController {
  constructor(private svc: PpeService, private imp: PpeImportService, private exporter: ExportService) {}

  @Get('items') @RequirePermissions('ppe.read')
  items(@Query() q: ItemsQuery) { return this.svc.items(q); }
  @Post('items') @RequirePermissions('ppe.norms.manage')
  createItem(@Body() dto: PpeItemDto) { return this.svc.createItem(dto); }
  @Patch('items/:id') @RequirePermissions('ppe.norms.manage')
  updateItem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePpeItemDto) { return this.svc.updateItem(id, dto); }

  @Get('standards') @RequirePermissions('ppe.read')
  standards(@Query() q: StandardQuery) { return this.svc.standards(q); }
  @Post('standards') @RequirePermissions('ppe.norms.manage')
  createStandard(@Body() dto: PpeStandardDto) { return this.svc.createStandard(dto); }
  @Patch('standards/:id') @RequirePermissions('ppe.norms.manage')
  updateStandard(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePpeStandardDto) { return this.svc.updateStandard(id, dto); }

  @Get('import/template') @RequirePermissions('ppe.norms.manage')
  async template(@Query() q: TemplateQuery, @Res({ passthrough: true }) res: Response) {
    return fileResponse(res, await this.imp.template(q.kind), q.kind === 'items' ? 'Шаблон справочника СИЗ' : 'Шаблон норм СИЗ', 'xlsx');
  }
  @Post('items/import') @RequirePermissions('ppe.norms.manage') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions(['xlsx', 'csv'])))
  importItems(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() m: ImportModeDto) {
    assertValidUpload(file);
    return this.imp.importItems(u, file, m.dryRun !== false);
  }
  @Post('standards/import') @RequirePermissions('ppe.norms.manage') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions(['xlsx', 'csv'])))
  importStandards(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() m: ImportModeDto) {
    assertValidUpload(file);
    return this.imp.importStandards(u, file, m.dryRun !== false);
  }

  @Get('needs') @RequirePermissions('ppe.read')
  needs(@CurrentUser() u: AuthUser, @Query() q: NeedsQuery) { return this.svc.needs(u, q); }
  @Get('needs/export') @RequirePermissions('ppe.read', 'reports.export')
  async needsExport(@CurrentUser() u: AuthUser, @Query() q: NeedsQuery, @Res({ passthrough: true }) res: Response) {
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(this.svc.needsTable(await this.svc.needs(u, q)), f), 'Потребность в СИЗ', f);
  }
  @Get('needs/purchase') @RequirePermissions('ppe.read')
  purchase(@CurrentUser() u: AuthUser, @Query() q: NeedsQuery) { return this.svc.purchaseNeeds(u, q); }
  @Get('needs/employee/:employeeId') @RequirePermissions('ppe.read')
  employeeNeeds(@CurrentUser() u: AuthUser, @Param('employeeId', ParseUUIDPipe) id: string) { return this.svc.employeeNeeds(u, id); }

  @Get('issues') @RequirePermissions('ppe.read')
  issues(@CurrentUser() u: AuthUser, @Query() q: IssueQuery) { return this.svc.issues(u, q); }
  @Get('issues/export') @RequirePermissions('ppe.read', 'reports.export')
  async issuesExport(@CurrentUser() u: AuthUser, @Query() q: IssueExportQuery, @Res({ passthrough: true }) res: Response) {
    const f = q.format ?? 'xlsx';
    return fileResponse(res, await this.exporter.export(await this.svc.issuesTable(u, q), f), 'Выдача СИЗ', f);
  }
  @Get('issues/employee/:employeeId') @RequirePermissions('ppe.read')
  employeeIssues(@CurrentUser() u: AuthUser, @Param('employeeId', ParseUUIDPipe) id: string) { return this.svc.employeeIssues(u, id); }
  @Get('issues/:id') @RequirePermissions('ppe.read')
  issue(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getIssue(u, id); }
  @Post('issues') @RequirePermissions('ppe.issue')
  createIssue(@CurrentUser() u: AuthUser, @Body() dto: IssueDto) { return this.svc.createIssue(u, dto); }
  @Post('issues/:id/confirm') @RequirePermissions('ppe.issue')
  confirm(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmReceiptDto) { return this.svc.confirmReceipt(u, id, dto); }
  @Post('issues/:id/replacement-date') @RequirePermissions('ppe.issue')
  replacementDate(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReplacementDateDto) { return this.svc.setReplacementDate(u, id, dto); }
  @Post('issues/:id/return') @RequirePermissions('ppe.issue')
  ret(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnDto) { return this.svc.registerReturn(u, id, dto); }

  @Get('stock') @RequirePermissions('ppe.read')
  stock() { return this.svc.stock(); }
  @Get('stock/movements') @RequirePermissions('ppe.read')
  movements(@Query() q: MovementsQuery) { return this.svc.movements(q); }
  @Post('stock') @RequirePermissions('ppe.stock')
  stockOp(@CurrentUser() u: AuthUser, @Body() dto: StockOperationDto) { return this.svc.stockOperation(u, dto); }
}
