import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res, StreamableFile, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { Response } from 'express';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { AuthUser } from '../common/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOWED_ATTACHMENTS, assertValidUpload, extOf, uploadOptions } from '../common/upload';
import { badRequest, forbidden, notFound } from '../common/errors';
import { inScope } from '../common/scope';
import { hasPermission } from '../auth/guards';

const ENTITY_TYPES = ['employee', 'briefing', 'knowledge_check', 'ppe_issue', 'safety_document', 'task'] as const;
type EntityType = (typeof ENTITY_TYPES)[number];
const READ_PERM: Record<EntityType, string> = {
  employee: 'employees.read', briefing: 'briefings.read', knowledge_check: 'checks.read', ppe_issue: 'ppe.read', safety_document: 'briefings.read', task: 'tasks.read',
};

class EntityQuery {
  @IsIn(ENTITY_TYPES as unknown as string[]) entityType: EntityType;
  @IsUUID() entityId: string;
}
class UploadDto extends EntityQuery {
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

/** Прикреплённые файлы: проверка типа по сигнатуре, ограничение размера, хранение вне веб-корня под случайным именем */
@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

  private get dir() { return path.resolve(this.config.get('UPLOAD_DIR') ?? './storage/uploads'); }

  /** Проверка доступа к сущности, к которой относится файл (права + зона подразделений) */
  private async assertAccess(user: AuthUser, type: EntityType, id: string) {
    if (!hasPermission(user, READ_PERM[type])) throw forbidden();
    let units: string[] = [];
    switch (type) {
      case 'employee': units = [(await this.prisma.employee.findUnique({ where: { id } }))?.unitId ?? '']; break;
      case 'briefing': units = (await this.prisma.briefingParticipant.findMany({ where: { briefingId: id }, select: { unitId: true } })).map((p) => p.unitId); break;
      case 'knowledge_check': units = (await this.prisma.knowledgeCheckParticipant.findMany({ where: { checkId: id }, select: { unitId: true } })).map((p) => p.unitId); break;
      case 'ppe_issue': units = [(await this.prisma.ppeIssue.findUnique({ where: { id }, include: { employee: true } }))?.employee.unitId ?? '']; break;
      default: return;
    }
    if (!units.some((u) => inScope(user, u))) throw forbidden('Нет доступа к записи');
  }

  @Get() @RequirePermissions()
  async list(@CurrentUser() u: AuthUser, @Query() q: EntityQuery) {
    await this.assertAccess(u, q.entityType, q.entityId);
    return this.prisma.attachment.findMany({
      where: { entityType: q.entityType, entityId: q.entityId, archivedAt: null }, orderBy: { createdAt: 'desc' },
      select: { id: true, originalName: true, mimeType: true, size: true, description: true, createdAt: true, uploadedById: true },
    });
  }

  @Post() @RequirePermissions('attachments.upload') @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', uploadOptions(Object.keys(ALLOWED_ATTACHMENTS))))
  async upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadDto) {
    assertValidUpload(file);
    await this.assertAccess(u, dto.entityType, dto.entityId);
    const ext = extOf(file.originalname);
    const storedName = `${randomUUID()}.${ext}`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, storedName), file.buffer, { mode: 0o640 });
    const safeName = file.originalname.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 200);
    return this.prisma.attachment.create({
      data: {
        entityType: dto.entityType, entityId: dto.entityId, originalName: safeName, storedName, mimeType: ALLOWED_ATTACHMENTS[ext].mime,
        size: file.size, sha256: createHash('sha256').update(file.buffer).digest('hex'), description: dto.description, uploadedById: u.id,
      },
      select: { id: true, originalName: true, size: true, createdAt: true },
    });
  }

  @Get(':id/download')
  async download(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a || a.archivedAt) throw notFound('Файл');
    await this.assertAccess(u, a.entityType as EntityType, a.entityId);
    const file = path.join(this.dir, path.basename(a.storedName));
    await fs.access(file).catch(() => { throw notFound('Файл'); });
    res.set({
      'Content-Type': a.mimeType,
      'Content-Disposition': `attachment; filename="file.${extOf(a.storedName)}"; filename*=UTF-8''${encodeURIComponent(a.originalName)}`,
      'X-Content-Type-Options': 'nosniff',
    });
    return new StreamableFile(createReadStream(file));
  }

  /** Файлы не удаляются физически — помечаются как архивные (сохранность для аудита) */
  @Delete(':id') @RequirePermissions('attachments.upload')
  async archive(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const a = await this.prisma.attachment.findUnique({ where: { id } });
    if (!a || a.archivedAt) throw notFound('Файл');
    await this.assertAccess(u, a.entityType as EntityType, a.entityId);
    if (a.uploadedById !== u.id && !hasPermission(u, 'settings.manage')) throw badRequest('Архивировать файл может только загрузивший его пользователь или администратор');
    await this.prisma.attachment.update({ where: { id }, data: { archivedAt: new Date() } });
    return { ok: true };
  }
}
