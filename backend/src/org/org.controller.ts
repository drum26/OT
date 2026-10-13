import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { RequirePermissions } from '../common/decorators';
import { EmptyToNull, Trim } from '../common/validation';
import { PrismaService } from '../prisma/prisma.service';
import { UnitTreeService } from '../core/unit-tree.service';
import { badRequest, notFound } from '../common/errors';

class UnitDto {
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) code?: string | null;
  @Trim() @IsString() @MinLength(1) @MaxLength(300) name: string;
  @EmptyToNull() @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdateUnitDto {
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) code?: string | null;
  @Trim() @IsOptional() @IsString() @MinLength(1) @MaxLength(300) name?: string;
  @EmptyToNull() @IsOptional() @IsUUID() parentId?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class PositionDto {
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) code?: string | null;
  @Trim() @IsString() @MinLength(1) @MaxLength(300) name: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(200) workCategory?: string | null;
  @IsOptional() @IsBoolean() isProfession?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class UpdatePositionDto {
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(50) code?: string | null;
  @Trim() @IsOptional() @IsString() @MinLength(1) @MaxLength(300) name?: string;
  @EmptyToNull() @IsOptional() @IsString() @MaxLength(200) workCategory?: string | null;
  @IsOptional() @IsBoolean() isProfession?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
class ActiveQuery {
  @IsOptional() @Transform(({ value }) => value === 'true' || value === true) @IsBoolean() activeOnly?: boolean;
}

@ApiTags('org')
@ApiBearerAuth()
@Controller()
export class OrgController {
  constructor(private prisma: PrismaService, private tree: UnitTreeService) {}

  /** Справочники доступны всем авторизованным пользователям (используются в фильтрах) */
  @Get('units')
  units(@Query() q: ActiveQuery) {
    return this.prisma.organizationalUnit.findMany({
      where: q.activeOnly ? { isActive: true } : {},
      orderBy: { name: 'asc' },
      include: { _count: { select: { employees: { where: { status: { not: 'DISMISSED' } } } } } },
    });
  }

  @Post('units') @RequirePermissions('org.manage')
  async createUnit(@Body() dto: UnitDto) {
    const u = await this.prisma.organizationalUnit.create({ data: dto });
    this.tree.invalidate();
    return u;
  }

  @Patch('units/:id') @RequirePermissions('org.manage')
  async updateUnit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    if (!(await this.prisma.organizationalUnit.findUnique({ where: { id } }))) throw notFound('Подразделение');
    if (dto.parentId !== undefined && (await this.tree.wouldCreateCycle(id, dto.parentId))) throw badRequest('Нельзя сделать подразделение дочерним по отношению к самому себе');
    if (dto.isActive === false) {
      const n = await this.prisma.employee.count({ where: { unitId: id, status: { not: 'DISMISSED' } } });
      if (n) throw badRequest(`В подразделении ${n} действующих сотрудников — переведите их перед архивированием`);
    }
    const u = await this.prisma.organizationalUnit.update({ where: { id }, data: dto });
    this.tree.invalidate();
    return u;
  }

  @Get('positions')
  positions(@Query() q: ActiveQuery) {
    return this.prisma.position.findMany({ where: q.activeOnly ? { isActive: true } : {}, orderBy: { name: 'asc' } });
  }

  @Post('positions') @RequirePermissions('org.manage')
  createPosition(@Body() dto: PositionDto) {
    return this.prisma.position.create({ data: dto });
  }

  @Patch('positions/:id') @RequirePermissions('org.manage')
  updatePosition(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePositionDto) {
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  @Get('work-categories')
  async workCategories() {
    const rows = await this.prisma.position.findMany({ where: { workCategory: { not: null } }, distinct: ['workCategory'], select: { workCategory: true } });
    return rows.map((r) => r.workCategory).filter(Boolean).sort();
  }
}
