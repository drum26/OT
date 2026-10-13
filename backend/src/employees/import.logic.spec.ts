import { analyzeEmployeeRows, ImportLookups } from './import.logic';
import { normalizeHeader, parseCellDate, parseCsv } from '../common/table-parser';
import { parseDateOnly } from '../common/dates';

const H = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [normalizeHeader(k), v as any]));
const lk = (): ImportLookups => ({
  unitsByKey: new Map([['цех 1', 'U1'], ['c1', 'U1']]),
  positionsByKey: new Map([['токарь', 'P1']]),
  existing: new Map([['100', {
    id: 'E100', personnelNumber: '100', lastName: 'Иванов', firstName: 'Иван', middleName: null, unitId: 'U1', positionId: 'P1',
    hireDate: parseDateOnly('2020-01-01')!, dismissalDate: null, status: 'ACTIVE', phone: null, email: null, managerNumber: null,
  }]]),
  allowedUnitIds: null,
});
const row = (n: number, o: Record<string, unknown>) => ({ rowNumber: n, cells: H({ 'Табельный номер*': '200', 'Фамилия*': 'Петров', 'Имя*': 'Пётр', 'Подразделение*': 'Цех 1', 'Должность*': 'Токарь', 'Дата приёма*': '01.02.2021', ...o }) });
const opts = { updateExisting: true, createMissingUnits: false, createMissingPositions: false };

describe('analyzeEmployeeRows', () => {
  it('корректная строка — создание', () => {
    const r = analyzeEmployeeRows([row(2, {})], lk(), opts);
    expect(r.errors).toEqual([]);
    expect(r.valid[0]).toMatchObject({ action: 'create', unitId: 'U1', positionId: 'P1', hireDate: '2021-02-01', status: 'ACTIVE' });
  });
  it('проверка обязательных полей и формата', () => {
    const r = analyzeEmployeeRows([row(2, { 'Фамилия*': '', 'Дата приёма*': '31.02.2021', 'Email': 'bad' })], lk(), opts);
    const msgs = r.errors.map((e) => e.field);
    expect(msgs).toEqual(expect.arrayContaining(['Фамилия', 'Дата приёма', 'Email']));
    expect(r.valid).toHaveLength(0);
  });
  it('дубликаты табельного номера в файле', () => {
    const r = analyzeEmployeeRows([row(2, {}), row(3, {})], lk(), opts);
    expect(r.errors.some((e) => e.rowNumber === 3 && /Дубликат/.test(e.message))).toBe(true);
  });
  it('существующий сотрудник: без режима обновления — ошибка, с режимом — обновление без дубликата', () => {
    const e1 = analyzeEmployeeRows([row(2, { 'Табельный номер*': '100' })], lk(), { ...opts, updateExisting: false });
    expect(e1.errors[0].message).toMatch(/уже существует/);
    const e2 = analyzeEmployeeRows([row(2, { 'Табельный номер*': '100' })], lk(), opts);
    expect(e2.valid[0].action).toBe('update');
    expect(e2.valid[0].existingId).toBe('E100');
  });
  it('неизменённая запись пропускается', () => {
    const r = analyzeEmployeeRows([row(2, { 'Табельный номер*': '100', 'Фамилия*': 'Иванов', 'Имя*': 'Иван', 'Дата приёма*': '01.01.2020' })], lk(), opts);
    expect(r.valid[0].action).toBe('unchanged');
    expect(r.skipped).toBe(1);
  });
  it('неизвестные подразделение/должность и зона доступа', () => {
    const r = analyzeEmployeeRows([row(2, { 'Подразделение*': 'Нет такого', 'Должность*': 'Нет' })], lk(), opts);
    expect(r.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['Подразделение', 'Должность']));
    const r2 = analyzeEmployeeRows([row(2, {})], { ...lk(), allowedUnitIds: ['U9'] }, opts);
    expect(r2.errors[0].message).toMatch(/Нет доступа/);
  });
  it('уволенный требует дату увольнения', () => {
    const r = analyzeEmployeeRows([row(2, { 'Статус': 'уволен' })], lk(), opts);
    expect(r.errors[0].field).toBe('Дата увольнения');
  });
});

describe('разбор ячеек', () => {
  it('даты в разных форматах', () => {
    expect((parseCellDate('05.03.2024') as Date).toISOString().slice(0, 10)).toBe('2024-03-05');
    expect((parseCellDate('2024-03-05') as Date).toISOString().slice(0, 10)).toBe('2024-03-05');
    expect((parseCellDate(45356) as Date).toISOString().slice(0, 10)).toBe('2024-03-05');
    expect(parseCellDate('32.01.2024')).toBe('invalid');
    expect(parseCellDate('')).toBeNull();
  });
  it('CSV с ; и кавычками', () => {
    expect(parseCsv('﻿a;b\r\n"x;y";"q""z"\n')).toEqual([['a', 'b'], ['x;y', 'q"z']]);
  });
});
