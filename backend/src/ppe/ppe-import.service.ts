import { Injectable } from '@nestjs/common';
import { PpeSizeType } from '@prisma/client';
import ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth-user';
import { badRequest } from '../common/errors';
import { cellStr, parseCellDate, parseTableFile, pick } from '../common/table-parser';
import { keyOf, RowError } from '../employees/import.logic';

const SIZE_TYPES: Record<string, PpeSizeType> = {
  'нет': 'NONE', '': 'NONE', 'одежда': 'CLOTHING', 'обувь': 'SHOES', 'головной убор': 'HEAD', 'руки': 'HANDS', 'органы дыхания': 'RESPIRATORY', 'иное': 'OTHER',
};

export const PPE_ITEM_HEADERS = ['Код', 'Наименование*', 'Категория*', 'Модель', 'Ед. изм.', 'Тип размера', 'Характеристики', 'Срок носки (мес.)', 'Основание'];
export const PPE_STANDARD_HEADERS = ['Должность*', 'СИЗ*', 'Количество*', 'Ед. изм.', 'Срок носки (мес.)', 'Условие замены', 'Основание*', 'Дата начала*', 'Дата окончания', 'Примечание'];

const intOrNull = (v: string): number | null | 'invalid' => {
  if (!v) return null;
  const n = Number(v.replace(',', '.'));
  return Number.isInteger(n) && n > 0 && n <= 1000 ? n : 'invalid';
};

@Injectable()
export class PpeImportService {
  constructor(private prisma: PrismaService) {}

  async template(kind: 'items' | 'standards') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(kind === 'items' ? 'СИЗ' : 'Нормы');
    ws.addRow(kind === 'items' ? PPE_ITEM_HEADERS : PPE_STANDARD_HEADERS).font = { bold: true };
    ws.columns.forEach((c) => (c.width = 24));
    const help = wb.addWorksheet('Пояснения');
    help.addRow(['Поля со * обязательны. Даты — ДД.ММ.ГГГГ. Срок носки — целое число месяцев; пусто — срок не календарный (укажите условие замены).']);
    help.addRow(['Нормы вносятся строго по утверждённым документам; в столбце «Основание» укажите документ, пункт и редакцию.']);
    if (kind === 'items') help.addRow(['Тип размера: нет, одежда, обувь, головной убор, руки, органы дыхания, иное.']);
    else help.addRow(['Должность и СИЗ — точное наименование из справочников (СИЗ можно указать кодом).']);
    help.getColumn(1).width = 120;
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async importItems(user: AuthUser, file: Express.Multer.File, dryRun: boolean) {
    const t = await parseTableFile(file.buffer, file.originalname, 5000);
    const existing = await this.prisma.ppeItem.findMany();
    const byCode = new Map(existing.filter((i) => i.code).map((i) => [keyOf(i.code!), i]));
    const byName = new Map(existing.map((i) => [keyOf(i.name), i]));
    const errors: RowError[] = [];
    const ops: { rowNumber: number; id?: string; data: any }[] = [];
    const seen = new Set<string>();
    for (const r of t.rows) {
      const e: RowError[] = [];
      const code = cellStr(pick(r.cells, ['Код']));
      const name = cellStr(pick(r.cells, ['Наименование']));
      const category = cellStr(pick(r.cells, ['Категория']));
      const sizeRaw = keyOf(cellStr(pick(r.cells, ['Тип размера'])));
      const wear = intOrNull(cellStr(pick(r.cells, ['Срок носки (мес.)', 'Срок носки'])));
      if (!name) e.push({ rowNumber: r.rowNumber, field: 'Наименование', message: 'Не указано наименование' });
      if (!category) e.push({ rowNumber: r.rowNumber, field: 'Категория', message: 'Не указана категория' });
      if (!(sizeRaw in SIZE_TYPES)) e.push({ rowNumber: r.rowNumber, field: 'Тип размера', value: sizeRaw, message: 'Неизвестный тип размера' });
      if (wear === 'invalid') e.push({ rowNumber: r.rowNumber, field: 'Срок носки', message: 'Ожидается целое число месяцев' });
      const key = code ? `c:${keyOf(code)}` : `n:${keyOf(name)}`;
      if (seen.has(key)) e.push({ rowNumber: r.rowNumber, field: code ? 'Код' : 'Наименование', message: 'Дубликат в файле' });
      seen.add(key);
      if (e.length) { errors.push(...e); continue; }
      const ex = code ? byCode.get(keyOf(code)) : byName.get(keyOf(name));
      ops.push({
        rowNumber: r.rowNumber, id: ex?.id,
        data: {
          code: code || null, name, category, model: cellStr(pick(r.cells, ['Модель'])) || null, unit: cellStr(pick(r.cells, ['Ед. изм.', 'Ед изм'])) || 'шт.',
          sizeType: SIZE_TYPES[sizeRaw], characteristics: cellStr(pick(r.cells, ['Характеристики'])) || null, defaultWearMonths: wear as number | null,
          basis: cellStr(pick(r.cells, ['Основание'])) || null,
        },
      });
    }
    return this.finish(user, 'PPE_ITEMS', file.originalname, t.rows.length, ops, errors, dryRun, async (tx, op) => {
      if (op.id) await tx.ppeItem.update({ where: { id: op.id }, data: op.data });
      else await tx.ppeItem.create({ data: op.data });
    });
  }

  async importStandards(user: AuthUser, file: Express.Multer.File, dryRun: boolean) {
    const t = await parseTableFile(file.buffer, file.originalname, 20000);
    const [positions, items, standards] = await Promise.all([
      this.prisma.position.findMany(), this.prisma.ppeItem.findMany(), this.prisma.ppeStandard.findMany(),
    ]);
    const posByName = new Map(positions.map((p) => [keyOf(p.name), p.id]));
    const itemByKey = new Map<string, string>();
    for (const i of items) { itemByKey.set(keyOf(i.name), i.id); if (i.code) itemByKey.set(keyOf(i.code), i.id); }
    const stdKey = (p: string, i: string, d: Date) => `${p}|${i}|${d.toISOString().slice(0, 10)}`;
    const exStd = new Map(standards.map((s) => [stdKey(s.positionId, s.ppeItemId, s.validFrom), s.id]));
    const errors: RowError[] = [];
    const ops: { rowNumber: number; id?: string; data: any }[] = [];
    const seen = new Set<string>();
    for (const r of t.rows) {
      const e: RowError[] = [];
      const err = (field: string, message: string, value?: string) => e.push({ rowNumber: r.rowNumber, field, message, value });
      const posName = cellStr(pick(r.cells, ['Должность', 'Профессия']));
      const itemName = cellStr(pick(r.cells, ['СИЗ', 'Наименование СИЗ']));
      const qty = intOrNull(cellStr(pick(r.cells, ['Количество'])));
      const wear = intOrNull(cellStr(pick(r.cells, ['Срок носки (мес.)', 'Срок носки'])));
      const basis = cellStr(pick(r.cells, ['Основание']));
      const from = parseCellDate(pick(r.cells, ['Дата начала', 'Дата начала действия']));
      const to = parseCellDate(pick(r.cells, ['Дата окончания', 'Дата окончания действия']));
      const positionId = posByName.get(keyOf(posName));
      const ppeItemId = itemByKey.get(keyOf(itemName));
      if (!posName) err('Должность', 'Не указана должность'); else if (!positionId) err('Должность', 'Должность не найдена в справочнике', posName);
      if (!itemName) err('СИЗ', 'Не указано СИЗ'); else if (!ppeItemId) err('СИЗ', 'СИЗ не найдено в справочнике', itemName);
      if (qty === null || qty === 'invalid') err('Количество', 'Ожидается целое положительное число');
      if (wear === 'invalid') err('Срок носки', 'Ожидается целое число месяцев');
      if (!basis) err('Основание', 'Не указано основание нормы');
      if (!(from instanceof Date)) err('Дата начала', 'Не указана или неверная дата начала действия');
      if (to === 'invalid') err('Дата окончания', 'Неверная дата');
      if (from instanceof Date && to instanceof Date && to < from) err('Дата окончания', 'Раньше даты начала');
      if (!e.length) {
        const k = stdKey(positionId!, ppeItemId!, from as Date);
        if (seen.has(k)) err('СИЗ', 'Дубликат нормы в файле');
        seen.add(k);
      }
      if (e.length) { errors.push(...e); continue; }
      ops.push({
        rowNumber: r.rowNumber, id: exStd.get(stdKey(positionId!, ppeItemId!, from as Date)),
        data: {
          positionId, ppeItemId, quantity: qty, unit: cellStr(pick(r.cells, ['Ед. изм.', 'Ед изм'])) || 'шт.', wearMonths: wear,
          wearCondition: cellStr(pick(r.cells, ['Условие замены', 'Условие'])) || null, basis, validFrom: from, validTo: to instanceof Date ? to : null,
          note: cellStr(pick(r.cells, ['Примечание'])) || null,
        },
      });
    }
    return this.finish(user, 'PPE_STANDARDS', file.originalname, t.rows.length, ops, errors, dryRun, async (tx, op) => {
      if (op.id) await tx.ppeStandard.update({ where: { id: op.id }, data: op.data });
      else await tx.ppeStandard.create({ data: op.data });
    });
  }

  private async finish(
    user: AuthUser, type: 'PPE_ITEMS' | 'PPE_STANDARDS', fileName: string, total: number,
    ops: { rowNumber: number; id?: string; data: any }[], errors: RowError[], dryRun: boolean,
    apply: (tx: any, op: { id?: string; data: any }) => Promise<void>,
  ) {
    const summary = { totalRows: total, toCreate: ops.filter((o) => !o.id).length, toUpdate: ops.filter((o) => o.id).length, errors: errors.slice(0, 500), errorRows: new Set(errors.map((e) => e.rowNumber)).size };
    if (dryRun) return { ...summary, committed: false };
    if (errors.length) throw badRequest('В файле есть ошибки — исправьте их перед загрузкой (загрузка выполняется целиком)');
    await this.prisma.$transaction(async (tx) => {
      for (const op of ops) await apply(tx, op);
      await tx.importJob.create({
        data: { importType: type, status: 'COMPLETED', fileName: fileName.slice(0, 200), totalRows: total, validRows: ops.length, createdCount: summary.toCreate, updatedCount: summary.toUpdate, createdById: user.id, completedAt: new Date() },
      });
    }, { timeout: 120_000 });
    return { ...summary, committed: true };
  }
}
