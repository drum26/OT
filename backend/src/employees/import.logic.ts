import { EmployeeStatus } from '@prisma/client';
import { cellStr, parseCellDate, pick, RawCell } from '../common/table-parser';
import { formatDateOnly } from '../common/dates';

export const EMPLOYEE_COLUMNS = {
  personnelNumber: ['Табельный номер', 'Таб номер', 'Таб. №', 'Табельный'],
  lastName: ['Фамилия'],
  firstName: ['Имя'],
  middleName: ['Отчество'],
  unit: ['Подразделение', 'Код подразделения', 'Цех', 'Отдел'],
  position: ['Должность', 'Профессия', 'Должность (профессия)', 'Должность или профессия'],
  hireDate: ['Дата приема', 'Дата приёма', 'Дата приема на работу', 'Дата приёма на работу'],
  status: ['Статус'],
  dismissalDate: ['Дата увольнения'],
  managerNumber: ['Табельный номер руководителя', 'Руководитель (таб номер)', 'Таб номер руководителя'],
  phone: ['Телефон'],
  email: ['Email', 'E-mail', 'Электронная почта'],
};

export const EMPLOYEE_TEMPLATE_HEADERS = [
  'Табельный номер*', 'Фамилия*', 'Имя*', 'Отчество', 'Подразделение*', 'Должность*', 'Дата приёма*',
  'Статус', 'Дата увольнения', 'Табельный номер руководителя', 'Телефон', 'Email',
];

const STATUS_MAP: Record<string, EmployeeStatus> = {
  'работает': 'ACTIVE', 'работающий': 'ACTIVE', 'действующий': 'ACTIVE', 'active': 'ACTIVE',
  'временно отсутствует': 'ABSENT', 'отсутствует': 'ABSENT', 'absent': 'ABSENT',
  'уволен': 'DISMISSED', 'уволена': 'DISMISSED', 'dismissed': 'DISMISSED',
};

export interface ImportLookups {
  unitsByKey: Map<string, string>; // нормализованное имя или код → id
  positionsByKey: Map<string, string>;
  existing: Map<string, ExistingEmployee>; // табельный номер → сотрудник
  allowedUnitIds: string[] | null;
}

export interface ExistingEmployee {
  id: string; personnelNumber: string; lastName: string; firstName: string; middleName: string | null;
  unitId: string; positionId: string; hireDate: Date; dismissalDate: Date | null; status: EmployeeStatus;
  phone: string | null; email: string | null; managerNumber: string | null;
}

export interface ImportOptions {
  updateExisting: boolean;
  createMissingUnits: boolean;
  createMissingPositions: boolean;
}

export interface NormalizedEmployeeRow {
  rowNumber: number;
  action: 'create' | 'update' | 'unchanged';
  existingId?: string;
  personnelNumber: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  unitName: string;
  unitId: string | null; // null — будет создано
  positionName: string;
  positionId: string | null;
  hireDate: string;
  status: EmployeeStatus;
  dismissalDate: string | null;
  managerNumber: string | null;
  phone: string | null;
  email: string | null;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

export interface RowError { rowNumber: number; field?: string; value?: string; message: string }

export const keyOf = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PN_RE = /^[\p{L}\d][\p{L}\d\-/._]{0,49}$/u;
const NAME_RE = /^[\p{L}][\p{L}\-' ]{0,99}$/u;

/**
 * Проверка и нормализация строк импорта сотрудников (без обращения к БД).
 * Ошибочные строки не импортируются; остальные помечаются как create / update / unchanged.
 */
export function analyzeEmployeeRows(
  rows: { rowNumber: number; cells: Record<string, RawCell> }[],
  lk: ImportLookups,
  opts: ImportOptions,
): { valid: NormalizedEmployeeRow[]; errors: RowError[]; skipped: number } {
  const errors: RowError[] = [];
  const valid: NormalizedEmployeeRow[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  const fileNumbers = new Set(rows.map((r) => cellStr(pick(r.cells, EMPLOYEE_COLUMNS.personnelNumber))).filter(Boolean));

  for (const { rowNumber, cells } of rows) {
    const rowErr: RowError[] = [];
    const err = (field: string, value: unknown, message: string) => rowErr.push({ rowNumber, field, value: value == null ? '' : String(value).slice(0, 200), message });

    const personnelNumber = cellStr(pick(cells, EMPLOYEE_COLUMNS.personnelNumber));
    const lastName = cellStr(pick(cells, EMPLOYEE_COLUMNS.lastName));
    const firstName = cellStr(pick(cells, EMPLOYEE_COLUMNS.firstName));
    const middleName = cellStr(pick(cells, EMPLOYEE_COLUMNS.middleName)) || null;
    const unitName = cellStr(pick(cells, EMPLOYEE_COLUMNS.unit));
    const positionName = cellStr(pick(cells, EMPLOYEE_COLUMNS.position));
    const hireRaw = pick(cells, EMPLOYEE_COLUMNS.hireDate);
    const statusRaw = cellStr(pick(cells, EMPLOYEE_COLUMNS.status));
    const dismissRaw = pick(cells, EMPLOYEE_COLUMNS.dismissalDate);
    const managerNumber = cellStr(pick(cells, EMPLOYEE_COLUMNS.managerNumber)) || null;
    const phone = cellStr(pick(cells, EMPLOYEE_COLUMNS.phone)) || null;
    const email = cellStr(pick(cells, EMPLOYEE_COLUMNS.email)) || null;

    if (!personnelNumber) err('Табельный номер', '', 'Не указан табельный номер');
    else if (!PN_RE.test(personnelNumber)) err('Табельный номер', personnelNumber, 'Недопустимые символы в табельном номере');
    if (!lastName) err('Фамилия', '', 'Не указана фамилия');
    else if (!NAME_RE.test(lastName)) err('Фамилия', lastName, 'Недопустимые символы');
    if (!firstName) err('Имя', '', 'Не указано имя');
    else if (!NAME_RE.test(firstName)) err('Имя', firstName, 'Недопустимые символы');
    if (middleName && !NAME_RE.test(middleName)) err('Отчество', middleName, 'Недопустимые символы');
    if (!unitName) err('Подразделение', '', 'Не указано подразделение');
    if (!positionName) err('Должность', '', 'Не указана должность');

    const hire = parseCellDate(hireRaw);
    if (hire === null) err('Дата приёма', '', 'Не указана дата приёма');
    else if (hire === 'invalid') err('Дата приёма', cellStr(hireRaw), 'Неверный формат даты (ожидается ДД.ММ.ГГГГ)');

    let status: EmployeeStatus = 'ACTIVE';
    if (statusRaw) {
      const s = STATUS_MAP[keyOf(statusRaw)];
      if (!s) err('Статус', statusRaw, 'Неизвестный статус (допустимо: работает, временно отсутствует, уволен)');
      else status = s;
    }
    const dismissal = parseCellDate(dismissRaw);
    if (dismissal === 'invalid') err('Дата увольнения', cellStr(dismissRaw), 'Неверный формат даты');
    if (dismissal && dismissal !== 'invalid' && !statusRaw) status = 'DISMISSED';
    if (status === 'DISMISSED' && !(dismissal instanceof Date)) err('Дата увольнения', '', 'Для уволенного сотрудника требуется дата увольнения');
    if (status !== 'DISMISSED' && dismissal instanceof Date) err('Дата увольнения', cellStr(dismissRaw), 'Дата увольнения указана для неуволенного сотрудника');
    if (hire instanceof Date && dismissal instanceof Date && dismissal < hire) err('Дата увольнения', cellStr(dismissRaw), 'Дата увольнения раньше даты приёма');

    if (email && !EMAIL_RE.test(email)) err('Email', email, 'Неверный формат адреса');
    if (phone && !/^[\d+\-() ]{3,30}$/.test(phone)) err('Телефон', phone, 'Неверный формат телефона');
    if (managerNumber && managerNumber === personnelNumber) err('Табельный номер руководителя', managerNumber, 'Сотрудник не может быть руководителем самому себе');
    if (managerNumber && !fileNumbers.has(managerNumber) && !lk.existing.has(managerNumber)) err('Табельный номер руководителя', managerNumber, 'Руководитель не найден ни в файле, ни в базе');

    const unitId = unitName ? lk.unitsByKey.get(keyOf(unitName)) ?? null : null;
    if (unitName && !unitId && !opts.createMissingUnits) err('Подразделение', unitName, 'Подразделение не найдено в справочнике');
    if (unitId && lk.allowedUnitIds && !lk.allowedUnitIds.includes(unitId)) err('Подразделение', unitName, 'Нет доступа к подразделению');
    if (!unitId && opts.createMissingUnits && lk.allowedUnitIds) err('Подразделение', unitName, 'Создание подразделений доступно только пользователю с доступом ко всем подразделениям');
    const positionId = positionName ? lk.positionsByKey.get(keyOf(positionName)) ?? null : null;
    if (positionName && !positionId && !opts.createMissingPositions) err('Должность', positionName, 'Должность не найдена в справочнике');

    if (personnelNumber) {
      if (seen.has(personnelNumber)) err('Табельный номер', personnelNumber, `Дубликат табельного номера в файле (строка ${seen.get(personnelNumber)})`);
      else seen.set(personnelNumber, rowNumber);
    }

    const existing = personnelNumber ? lk.existing.get(personnelNumber) : undefined;
    if (existing && !opts.updateExisting) err('Табельный номер', personnelNumber, 'Сотрудник с таким табельным номером уже существует (включите режим обновления)');
    if (existing && lk.allowedUnitIds && !lk.allowedUnitIds.includes(existing.unitId)) err('Табельный номер', personnelNumber, 'Существующий сотрудник относится к недоступному подразделению');

    if (rowErr.length) { errors.push(...rowErr); continue; }

    const row: NormalizedEmployeeRow = {
      rowNumber, action: 'create', personnelNumber, lastName, firstName, middleName,
      unitName, unitId, positionName, positionId,
      hireDate: formatDateOnly(hire as Date)!, status,
      dismissalDate: dismissal instanceof Date ? formatDateOnly(dismissal) : null,
      managerNumber, phone, email,
    };
    if (existing) {
      row.existingId = existing.id;
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      const cmp = (field: string, from: unknown, to: unknown) => { if ((from ?? null) !== (to ?? null)) changes[field] = { from: from ?? null, to: to ?? null }; };
      cmp('lastName', existing.lastName, lastName);
      cmp('firstName', existing.firstName, firstName);
      cmp('middleName', existing.middleName, middleName);
      cmp('unitId', existing.unitId, unitId ?? `new:${unitName}`);
      cmp('positionId', existing.positionId, positionId ?? `new:${positionName}`);
      cmp('hireDate', formatDateOnly(existing.hireDate), row.hireDate);
      cmp('status', existing.status, status);
      cmp('dismissalDate', formatDateOnly(existing.dismissalDate), row.dismissalDate);
      cmp('phone', existing.phone, phone);
      cmp('email', existing.email, email);
      if (managerNumber) cmp('managerNumber', existing.managerNumber, managerNumber);
      row.changes = changes;
      row.action = Object.keys(changes).length ? 'update' : 'unchanged';
      if (row.action === 'unchanged') skipped++;
    }
    valid.push(row);
  }
  return { valid, errors, skipped };
}
