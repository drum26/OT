import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { badRequest, notFound } from '../common/errors';
import { parseTableFile, ParsedTable } from '../common/table-parser';
import { parseDateOnly, todayInTz } from '../common/dates';
import { UnitTreeService } from '../core/unit-tree.service';
import { analyzeEmployeeRows, EMPLOYEE_TEMPLATE_HEADERS, ExistingEmployee, ImportOptions, keyOf, NormalizedEmployeeRow } from './import.logic';

@Injectable()
export class EmployeeImportService {
  constructor(private prisma: PrismaService, private tree: UnitTreeService) {}

  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Сотрудники');
    ws.addRow(EMPLOYEE_TEMPLATE_HEADERS).font = { bold: true };
    ws.columns.forEach((c) => (c.width = 22));
    const help = wb.addWorksheet('Пояснения');
    [
      ['Поля, отмеченные *, обязательны.'],
      ['Подразделение — точное наименование или код из справочника подразделений.'],
      ['Должность — точное наименование из справочника должностей.'],
      ['Даты — в формате ДД.ММ.ГГГГ или как дата Excel.'],
      ['Статус — работает / временно отсутствует / уволен (по умолчанию «работает»).'],
      ['Для уволенных обязательна дата увольнения.'],
      ['Повторная загрузка с тем же табельным номером обновляет данные (в режиме обновления) без создания дубликатов.'],
    ].forEach((r) => help.addRow(r));
    help.getColumn(1).width = 100;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  private async lookups(user: AuthUser) {
    const [units, positions, employees] = await Promise.all([
      this.prisma.organizationalUnit.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true } }),
      this.prisma.position.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      this.prisma.employee.findMany({
        select: {
          id: true, personnelNumber: true, lastName: true, firstName: true, middleName: true, unitId: true, positionId: true,
          hireDate: true, dismissalDate: true, status: true, phone: true, email: true, manager: { select: { personnelNumber: true } },
        },
      }),
    ]);
    const unitsByKey = new Map<string, string>();
    for (const u of units) {
      unitsByKey.set(keyOf(u.name), u.id);
      if (u.code) unitsByKey.set(keyOf(u.code), u.id);
    }
    const existing = new Map<string, ExistingEmployee>(
      employees.map((e) => [e.personnelNumber, { ...e, managerNumber: e.manager?.personnelNumber ?? null }]),
    );
    return {
      unitsByKey, positionsByKey: new Map(positions.map((p) => [keyOf(p.name), p.id])), existing, allowedUnitIds: user.unitIds,
    };
  }

  async preview(user: AuthUser, file: Express.Multer.File, opts: ImportOptions) {
    if (!file) throw badRequest('Файл не передан');
    const table: ParsedTable = await parseTableFile(file.buffer, file.originalname);
    const required = ['табельный номер', 'фамилия', 'имя'];
    const missing = required.filter((h) => !table.headers.some((x) => x.startsWith(h)));
    if (missing.length) throw badRequest(`В файле отсутствуют обязательные столбцы: ${missing.join(', ')}. Скачайте шаблон.`);
    const lk = await this.lookups(user);
    const res = analyzeEmployeeRows(table.rows, lk, opts);
    const job = await this.prisma.importJob.create({
      data: {
        importType: 'EMPLOYEES', status: 'PREVIEW', fileName: file.originalname.slice(0, 200),
        totalRows: table.rows.length, validRows: res.valid.length, errorCount: res.errors.length, skippedCount: res.skipped,
        payload: { rows: table.rows } as unknown as Prisma.InputJsonValue, options: opts as unknown as Prisma.InputJsonValue,
        createdById: user.id,
        errors: { createMany: { data: res.errors.map((e) => ({ rowNumber: e.rowNumber, field: e.field, value: e.value, message: e.message })) } },
      },
    });
    return {
      jobId: job.id,
      totalRows: table.rows.length,
      toCreate: res.valid.filter((r) => r.action === 'create').length,
      toUpdate: res.valid.filter((r) => r.action === 'update').length,
      unchanged: res.skipped,
      errorRows: new Set(res.errors.map((e) => e.rowNumber)).size,
      errors: res.errors.slice(0, 500),
      preview: res.valid.slice(0, 300),
      newUnits: [...new Set(res.valid.filter((r) => !r.unitId).map((r) => r.unitName))],
      newPositions: [...new Set(res.valid.filter((r) => !r.positionId).map((r) => r.positionName))],
    };
  }

  /**
   * Подтверждение импорта. Строки повторно проверяются по текущему состоянию БД; все изменения выполняются
   * в одной транзакции — при ошибке не сохраняется ничего.
   */
  async commit(user: AuthUser, jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.createdById !== user.id) throw notFound('Задание импорта');
    if (job.status !== 'PREVIEW') throw badRequest('Импорт уже выполнен или отменён');
    const opts = job.options as unknown as ImportOptions;
    const rows = (job.payload as any).rows as ParsedTable['rows'];
    // Восстановление дат после JSON
    for (const r of rows) for (const [k, v] of Object.entries(r.cells)) if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) r.cells[k] = new Date(v);
    const lk = await this.lookups(user);
    const res = analyzeEmployeeRows(rows, lk, opts);
    const today = todayInTz();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Создание недостающих справочных значений
        const unitIds = new Map<string, string>();
        for (const name of new Set(res.valid.filter((r) => !r.unitId).map((r) => r.unitName))) {
          const u = await tx.organizationalUnit.create({ data: { name } });
          unitIds.set(keyOf(name), u.id);
        }
        const posIds = new Map<string, string>();
        for (const name of new Set(res.valid.filter((r) => !r.positionId).map((r) => r.positionName))) {
          const p = await tx.position.create({ data: { name } });
          posIds.set(keyOf(name), p.id);
        }
        const unitOf = (r: NormalizedEmployeeRow) => r.unitId ?? unitIds.get(keyOf(r.unitName))!;
        const posOf = (r: NormalizedEmployeeRow) => r.positionId ?? posIds.get(keyOf(r.positionName))!;

        const toCreate = res.valid.filter((r) => r.action === 'create');
        const toUpdate = res.valid.filter((r) => r.action === 'update');
        const idByNumber = new Map<string, string>([...lk.existing.values()].map((e) => [e.personnelNumber, e.id]));
        const created = toCreate.map((r) => ({ ...r, id: randomUUID() }));
        created.forEach((r) => idByNumber.set(r.personnelNumber, r.id));

        const CHUNK = 500;
        for (let i = 0; i < created.length; i += CHUNK) {
          const part = created.slice(i, i + CHUNK);
          await tx.employee.createMany({
            data: part.map((r) => ({
              id: r.id, personnelNumber: r.personnelNumber, lastName: r.lastName, firstName: r.firstName, middleName: r.middleName,
              unitId: unitOf(r), positionId: posOf(r), hireDate: parseDateOnly(r.hireDate)!, status: r.status,
              dismissalDate: parseDateOnly(r.dismissalDate), phone: r.phone, email: r.email, createdById: user.id, updatedById: user.id,
            })),
          });
          await tx.employeeHistory.createMany({
            data: part.map((r) => ({
              employeeId: r.id, changeType: 'IMPORT_CREATE' as const, effectiveDate: parseDateOnly(r.hireDate)!, toUnitId: unitOf(r), toPositionId: posOf(r),
              reason: `Импорт из файла ${job.fileName}`, authorId: user.id,
            })),
          });
        }

        for (const r of toUpdate) {
          const ex = lk.existing.get(r.personnelNumber)!;
          const unitId = unitOf(r);
          const positionId = posOf(r);
          await tx.employee.update({
            where: { id: ex.id },
            data: {
              lastName: r.lastName, firstName: r.firstName, middleName: r.middleName, unitId, positionId,
              hireDate: parseDateOnly(r.hireDate)!, status: r.status, dismissalDate: parseDateOnly(r.dismissalDate), phone: r.phone, email: r.email,
              updatedById: user.id,
            },
          });
          const moved = unitId !== ex.unitId || positionId !== ex.positionId;
          await tx.employeeHistory.create({
            data: {
              employeeId: ex.id, changeType: moved ? 'TRANSFER' : 'IMPORT_UPDATE', effectiveDate: today,
              fromUnitId: moved ? ex.unitId : null, toUnitId: moved ? unitId : null, fromPositionId: moved ? ex.positionId : null, toPositionId: moved ? positionId : null,
              changes: r.changes as Prisma.InputJsonValue, reason: `Импорт из файла ${job.fileName}`, authorId: user.id,
            },
          });
        }

        // Руководители — после создания всех сотрудников
        for (const r of [...created, ...toUpdate]) {
          if (!r.managerNumber) continue;
          const managerId = idByNumber.get(r.managerNumber);
          const id = idByNumber.get(r.personnelNumber)!;
          if (managerId && managerId !== id) await tx.employee.update({ where: { id }, data: { managerId } });
        }

        await tx.importError.deleteMany({ where: { jobId } });
        if (res.errors.length) await tx.importError.createMany({ data: res.errors.map((e) => ({ jobId, rowNumber: e.rowNumber, field: e.field, value: e.value, message: e.message })) });
        return tx.importJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED', completedAt: new Date(), validRows: res.valid.length, createdCount: created.length, updatedCount: toUpdate.length,
            skippedCount: res.skipped, errorCount: res.errors.length, payload: Prisma.DbNull,
          },
        });
      }, { timeout: 300_000, maxWait: 20_000 });
      this.tree.invalidate();
      return result;
    } catch (e) {
      await this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED', message: (e as Error).message.slice(0, 1000) } });
      throw badRequest(`Импорт не выполнен, изменения не сохранены: ${(e as Error).message.slice(0, 300)}`);
    }
  }

  async cancel(user: AuthUser, jobId: string) {
    const job = await this.prisma.importJob.findUnique({ where: { id: jobId } });
    if (!job || job.createdById !== user.id) throw notFound('Задание импорта');
    if (job.status !== 'PREVIEW') throw badRequest('Задание уже завершено');
    return this.prisma.importJob.update({ where: { id: jobId }, data: { status: 'CANCELLED', payload: Prisma.DbNull } });
  }

  jobs() {
    return this.prisma.importJob.findMany({ orderBy: { createdAt: 'desc' }, take: 100, omit: { payload: true } });
  }

  async errors(jobId: string) {
    return this.prisma.importError.findMany({ where: { jobId }, orderBy: [{ rowNumber: 'asc' }] });
  }
}
