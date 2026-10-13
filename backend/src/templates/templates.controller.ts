import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import Handlebars from 'handlebars';
import { CurrentUser, RequireAnyPermission, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { badRequest, notFound } from '../common/errors';
import { formatRu } from '../common/dates';
import { Trim } from '../common/validation';
import { SettingsService } from '../core/settings.service';
import { BriefingsService, CONFIRM_RU, RESULT_RU } from '../briefings/briefings.service';
import { ChecksService, OUTCOME_RU } from '../checks/checks.service';
import { PpeService, RETURN_TYPE_RU } from '../ppe/ppe.service';
import { EmployeesService } from '../employees/employees.service';
import { EventQuery } from '../briefings/briefings.dto';

class TemplateUpdateDto {
  @Trim() @IsOptional() @IsString() @MinLength(3) @MaxLength(300) name?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(200_000) content?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class VerifyDto {
  @Trim() @IsString() @MinLength(3) @MaxLength(300) verifiedBy: string;
  @Trim() @IsString() @MinLength(3) @MaxLength(2000) basis: string;
}

const hb = Handlebars.create();
hb.registerHelper('date', (d: unknown) => (d instanceof Date ? formatRu(d) : typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? formatRu(new Date(d.slice(0, 10))) : ''));
hb.registerHelper('inc', (i: number) => i + 1);
hb.registerHelper('eq', (a: unknown, b: unknown) => a === b);

const ROLE_RU: Record<string, string> = { CHAIR: 'Председатель', DEPUTY: 'Заместитель председателя', MEMBER: 'Член комиссии', SECRETARY: 'Секретарь' };

/** Запрет небезопасных конструкций: неэкранированный вывод и скрипты */
export function assertSafeTemplate(content: string) {
  if (/\{\{\{|\{\{&/.test(content)) throw badRequest('Неэкранированный вывод ({{{ }}}) в шаблонах запрещён');
  if (/<script|javascript:|\son\w+\s*=/i.test(content)) throw badRequest('Скрипты и обработчики событий в шаблонах запрещены');
  try { hb.precompile(content); } catch (e) { throw badRequest(`Ошибка синтаксиса шаблона: ${(e as Error).message.slice(0, 300)}`); }
}

@ApiTags('templates')
@ApiBearerAuth()
@Controller()
export class TemplatesController {
  constructor(
    private prisma: PrismaService, private settings: SettingsService, private briefings: BriefingsService,
    private checks: ChecksService, private ppe: PpeService, private employees: EmployeesService,
  ) {}

  @Get('templates') @RequirePermissions('templates.manage')
  list() { return this.prisma.documentTemplate.findMany({ orderBy: [{ code: 'asc' }, { version: 'desc' }] }); }

  /** Изменение шаблона создаёт новую версию; проверка соответствия сбрасывается */
  @Patch('templates/:id') @RequirePermissions('templates.manage')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TemplateUpdateDto) {
    const t = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!t) throw notFound('Шаблон');
    if (dto.content === undefined) return this.prisma.documentTemplate.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive } });
    assertSafeTemplate(dto.content);
    const last = await this.prisma.documentTemplate.findFirst({ where: { code: t.code }, orderBy: { version: 'desc' } });
    return this.prisma.$transaction(async (tx) => {
      await tx.documentTemplate.updateMany({ where: { code: t.code }, data: { isActive: false } });
      return tx.documentTemplate.create({ data: { code: t.code, name: dto.name ?? t.name, content: dto.content!, version: (last?.version ?? 0) + 1, isActive: true } });
    });
  }

  @Post('templates/:id/verify') @RequirePermissions('templates.manage')
  verify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyDto) {
    return this.prisma.documentTemplate.update({ where: { id }, data: { isVerified: true, verifiedBy: dto.verifiedBy, verifiedAt: new Date(), basis: dto.basis } });
  }

  @Post('templates/:id/activate') @RequirePermissions('templates.manage')
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    const t = await this.prisma.documentTemplate.findUnique({ where: { id } });
    if (!t) throw notFound('Шаблон');
    await this.prisma.$transaction([
      this.prisma.documentTemplate.updateMany({ where: { code: t.code }, data: { isActive: false } }),
      this.prisma.documentTemplate.update({ where: { id }, data: { isActive: true } }),
    ]);
    return { ok: true };
  }

  private async render(code: string, data: Record<string, unknown>) {
    const t = await this.prisma.documentTemplate.findFirst({ where: { code, isActive: true }, orderBy: { version: 'desc' } });
    if (!t) throw notFound(`Активный шаблон ${code}`);
    const org = (await this.settings.get<string>('organization.name')) || '';
    return hb.compile(t.content, { strict: false })({ ...data, organization: org, verified: t.isVerified }, { allowProtoPropertiesByDefault: false });
  }

  @Get('print/briefing-journal') @RequirePermissions('briefings.read') @RequireAnyPermission('reports.export')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async briefingJournal(@CurrentUser() u: AuthUser, @Query() q: EventQuery) {
    const t = await this.briefings.exportTable(u, { ...q, status: q.status ?? 'CONDUCTED' });
    const unitName = q.unitIds?.length === 1 ? (await this.prisma.organizationalUnit.findUnique({ where: { id: q.unitIds[0] } }))?.name : undefined;
    const rows = [...t.rows].reverse().map((r: any) => ({
      date: r.date, fullName: r.employee, personnelNumber: r.personnelNumber, position: r.position, type: r.type,
      topic: [r.topic, r.document].filter(Boolean).join('; '), instructor: r.responsible, result: r.result, confirmation: r.confirmation,
    }));
    const period = q.dateFrom || q.dateTo ? `${q.dateFrom ? formatRu(new Date(q.dateFrom)) : '…'} — ${q.dateTo ? formatRu(new Date(q.dateTo)) : '…'}` : '';
    return this.render('BRIEFING_JOURNAL', { rows, unitName, period });
  }

  @Get('print/check-protocol/:id') @RequirePermissions('checks.read') @RequireAnyPermission('reports.export')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async checkProtocol(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const c = await this.checks.get(u, id);
    if (c.status !== 'CONDUCTED') throw badRequest('Протокол формируется для проведённой проверки');
    return this.render('KNOWLEDGE_CHECK_PROTOCOL', {
      protocolNumber: c.protocolNumber ?? '____', protocolDate: c.protocolDate, conductedDate: c.conductedDate, checkType: c.checkType.name, reason: c.reason,
      responsible: c.responsibleName,
      commission: c.commission ? {
        name: c.commission.name, orderNumber: c.commission.orderNumber, orderDate: c.commission.orderDate,
        members: [...c.commission.members].sort((a, b) => Object.keys(ROLE_RU).indexOf(a.role) - Object.keys(ROLE_RU).indexOf(b.role))
          .map((m) => ({ role: ROLE_RU[m.role], name: [m.employee.lastName, m.employee.firstName, m.employee.middleName].filter(Boolean).join(' ') })),
      } : null,
      participants: c.participants.map((p) => ({
        fullName: p.fullName, position: p.positionName, unit: p.unitName, outcome: OUTCOME_RU[p.result?.outcome ?? 'PENDING'], nextCheckDate: p.result?.nextCheckDate, comment: p.result?.comment,
      })),
    });
  }

  @Get('print/ppe-card/:employeeId') @RequirePermissions('ppe.read') @RequireAnyPermission('reports.export', 'ppe.issue')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async ppeCard(@CurrentUser() u: AuthUser, @Param('employeeId', ParseUUIDPipe) id: string) {
    const e = await this.employees.get(u, id);
    const [needs, issues] = await Promise.all([this.ppe.employeeNeeds(u, id), this.ppe.employeeIssues(u, id)]);
    return this.render('PPE_PERSONAL_CARD', {
      employee: { fullName: e.fullName, personnelNumber: e.personnelNumber, unit: e.unit.name, position: e.position.name, hireDate: e.hireDate },
      norms: needs.rows.filter((r) => r.standardId).map((r) => ({ item: r.itemName, quantity: r.normQty, unit: r.unit, wear: r.wearMonths ? `${r.wearMonths} мес.` : r.wearCondition ?? '', basis: r.basis })),
      issues: [...issues].reverse().map((i) => ({
        item: i.ppeItem.name, size: i.size, issueDate: i.issueDate, quantity: i.quantity, wearMonths: i.wearMonths, replacement: i.plannedReplacementDate,
        confirmed: i.receiptConfirmed ? `${CONFIRM_RU[i.receiptMethod ?? 'OTHER']}${i.receiptConfirmedAt ? ', ' + formatRu(i.receiptConfirmedAt) : ''}` : 'не подтверждено',
        returns: i.returns.map((r) => `${RETURN_TYPE_RU[r.operationType]} ${r.quantity} — ${formatRu(r.operationDate)}`).join('; '),
      })),
    });
  }
}

void RESULT_RU;
