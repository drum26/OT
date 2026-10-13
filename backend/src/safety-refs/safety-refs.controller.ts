import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { toDate } from '../common/validation';
import { badRequest } from '../common/errors';
import {
  BriefingTypeDto, CommissionDto, DocumentDto, RuleDto, TypeDto, UpdateBriefingTypeDto, UpdateCommissionDto, UpdateDocumentDto, UpdateRuleDto, UpdateTypeDto,
} from './safety-refs.dto';

function ruleData(dto: Partial<RuleDto>) {
  if (dto.validFrom && dto.validTo && dto.validTo < dto.validFrom) throw badRequest('Дата окончания действия раньше даты начала');
  return {
    positionId: dto.positionId, workCategory: dto.workCategory, unitId: dto.unitId,
    periodMonths: dto.periodMonths, periodDays: dto.periodDays, initialDueDays: dto.initialDueDays, resetOnTransfer: dto.resetOnTransfer,
    basis: dto.basis, validFrom: toDate(dto.validFrom) ?? undefined, validTo: toDate(dto.validTo), isActive: dto.isActive, note: dto.note,
  };
}

function docData(dto: Partial<DocumentDto>) {
  return { ...dto, approvedDate: toDate(dto.approvedDate), validFrom: toDate(dto.validFrom), validTo: toDate(dto.validTo) };
}

/** Справочники по охране труда. Записи не удаляются: используется архивирование (isActive / validTo). */
@ApiTags('safety-refs')
@ApiBearerAuth()
@Controller()
export class SafetyRefsController {
  constructor(private prisma: PrismaService) {}

  // ── Виды инструктажей
  @Get('briefing-types')
  briefingTypes() { return this.prisma.briefingType.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }); }

  @Post('briefing-types') @RequirePermissions('safety_refs.manage')
  createBriefingType(@Body() dto: BriefingTypeDto) { return this.prisma.briefingType.create({ data: dto }); }

  @Patch('briefing-types/:id') @RequirePermissions('safety_refs.manage')
  updateBriefingType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBriefingTypeDto) { return this.prisma.briefingType.update({ where: { id }, data: dto }); }

  // ── Правила периодичности инструктажей
  @Get('briefing-rules')
  briefingRules() {
    return this.prisma.briefingRule.findMany({ orderBy: [{ briefingTypeId: 'asc' }, { validFrom: 'desc' }], include: { briefingType: { select: { name: true } } } })
      .then((rs) => rs.map((r) => ({ ...r, typeId: r.briefingTypeId, typeName: r.briefingType.name })));
  }

  @Post('briefing-rules') @RequirePermissions('safety_refs.manage')
  createBriefingRule(@Body() dto: RuleDto) {
    const { retestDays: _r, ...rest } = ruleData(dto) as any;
    return this.prisma.briefingRule.create({ data: { ...rest, briefingTypeId: dto.typeId } });
  }

  @Patch('briefing-rules/:id') @RequirePermissions('safety_refs.manage')
  updateBriefingRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto) {
    return this.prisma.briefingRule.update({ where: { id }, data: { ...ruleData(dto), briefingTypeId: dto.typeId } });
  }

  // ── Виды проверок знаний
  @Get('check-types')
  checkTypes() { return this.prisma.knowledgeCheckType.findMany({ orderBy: { name: 'asc' } }); }

  @Post('check-types') @RequirePermissions('safety_refs.manage')
  createCheckType(@Body() dto: TypeDto) { return this.prisma.knowledgeCheckType.create({ data: dto }); }

  @Patch('check-types/:id') @RequirePermissions('safety_refs.manage')
  updateCheckType(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTypeDto) { return this.prisma.knowledgeCheckType.update({ where: { id }, data: dto }); }

  // ── Правила проверок знаний
  @Get('check-rules')
  checkRules() {
    return this.prisma.knowledgeCheckRule.findMany({ orderBy: [{ checkTypeId: 'asc' }, { validFrom: 'desc' }], include: { checkType: { select: { name: true } } } })
      .then((rs) => rs.map((r) => ({ ...r, typeId: r.checkTypeId, typeName: r.checkType.name })));
  }

  @Post('check-rules') @RequirePermissions('safety_refs.manage')
  createCheckRule(@Body() dto: RuleDto) {
    return this.prisma.knowledgeCheckRule.create({ data: { ...(ruleData(dto) as any), retestDays: dto.retestDays, checkTypeId: dto.typeId } });
  }

  @Patch('check-rules/:id') @RequirePermissions('safety_refs.manage')
  updateCheckRule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRuleDto) {
    return this.prisma.knowledgeCheckRule.update({ where: { id }, data: { ...ruleData(dto), retestDays: dto.retestDays, checkTypeId: dto.typeId } });
  }

  // ── Документы по ОТ (инструкции, программы)
  @Get('safety-documents')
  documents() { return this.prisma.safetyDocument.findMany({ orderBy: [{ isActive: 'desc' }, { title: 'asc' }] }); }

  @Post('safety-documents') @RequirePermissions('safety_refs.manage')
  createDocument(@Body() dto: DocumentDto) { return this.prisma.safetyDocument.create({ data: docData(dto) as any }); }

  @Patch('safety-documents/:id') @RequirePermissions('safety_refs.manage')
  updateDocument(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateDocumentDto) { return this.prisma.safetyDocument.update({ where: { id }, data: docData(dto) as any }); }

  // ── Комиссии по проверке знаний
  @Get('commissions')
  commissions() {
    return this.prisma.commission.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: { members: { include: { employee: { select: { id: true, lastName: true, firstName: true, middleName: true, personnelNumber: true } } } } },
    });
  }

  @Post('commissions') @RequirePermissions('safety_refs.manage')
  createCommission(@Body() dto: CommissionDto) {
    return this.prisma.commission.create({
      data: { name: dto.name, orderNumber: dto.orderNumber, orderDate: toDate(dto.orderDate), isActive: dto.isActive, members: { create: dto.members } },
    });
  }

  @Patch('commissions/:id') @RequirePermissions('safety_refs.manage')
  updateCommission(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCommissionDto) {
    return this.prisma.$transaction(async (tx) => {
      if (dto.members) {
        await tx.commissionMember.deleteMany({ where: { commissionId: id } });
        await tx.commissionMember.createMany({ data: dto.members.map((m) => ({ ...m, commissionId: id })) });
      }
      return tx.commission.update({ where: { id }, data: { name: dto.name, orderNumber: dto.orderNumber, orderDate: toDate(dto.orderDate), isActive: dto.isActive } });
    });
  }
}
