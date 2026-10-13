import dayjs, { Dayjs } from 'dayjs';

/** Дата из API (ГГГГ-ММ-ДД или ISO) → ДД.ММ.ГГГГ без сдвига часового пояса */
export function fmtDate(v?: string | null): string {
  if (!v) return '';
  const s = v.slice(0, 10);
  return `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
}

export function fmtDateTime(v?: string | null): string {
  return v ? dayjs(v).format('DD.MM.YYYY HH:mm') : '';
}

export const toDayjs = (v?: string | null): Dayjs | null => (v ? dayjs(v.slice(0, 10)) : null);
export const toApiDate = (d?: Dayjs | null): string | null => (d ? d.format('YYYY-MM-DD') : null);
export const todayStr = () => dayjs().format('YYYY-MM-DD');

export const fio = (e?: { lastName: string; firstName: string; middleName?: string | null } | null) =>
  e ? [e.lastName, e.firstName, e.middleName].filter(Boolean).join(' ') : '';

type Tag = { text: string; color: string };
export const EMPLOYEE_STATUS: Record<string, Tag> = {
  ACTIVE: { text: 'Работает', color: 'green' }, ABSENT: { text: 'Временно отсутствует', color: 'gold' }, DISMISSED: { text: 'Уволен', color: 'default' },
};
export const EVENT_STATUS: Record<string, Tag> = {
  PLANNED: { text: 'Запланировано', color: 'blue' }, CONDUCTED: { text: 'Проведено', color: 'green' }, CANCELLED: { text: 'Отменено', color: 'default' }, OVERDUE: { text: 'Просрочено', color: 'red' },
};
export const COMPLIANCE_STATUS: Record<string, Tag> = {
  OK: { text: 'В норме', color: 'green' }, UPCOMING: { text: 'Приближается срок', color: 'gold' }, OVERDUE: { text: 'Просрочено', color: 'red' },
  MISSING: { text: 'Нет сведений', color: 'volcano' }, FAILED: { text: 'Неудовл. результат', color: 'magenta' },
};
export const RESULT: Record<string, Tag> = {
  PENDING: { text: 'Ожидается', color: 'default' }, COMPLETED: { text: 'Прошёл', color: 'green' }, NOT_COMPLETED: { text: 'Не прошёл', color: 'red' }, ABSENT: { text: 'Отсутствовал', color: 'default' },
};
export const OUTCOME: Record<string, Tag> = {
  PASSED: { text: 'Удовлетворительно', color: 'green' }, FAILED: { text: 'Неудовлетворительно', color: 'red' }, ABSENT: { text: 'Отсутствовал', color: 'default' }, PENDING: { text: 'Нет результата', color: 'default' },
};
export const PPE_STATUS: Record<string, Tag> = {
  NOT_PROVIDED: { text: 'Не выдано', color: 'red' }, PARTIAL: { text: 'Выдано частично', color: 'volcano' }, REPLACEMENT_OVERDUE: { text: 'Просрочена замена', color: 'red' },
  AWAITING_CONFIRMATION: { text: 'Ожидает подтверждения', color: 'gold' }, REPLACEMENT_DUE: { text: 'Приближается замена', color: 'orange' },
  PROVIDED: { text: 'Обеспечен', color: 'green' }, EXTRA: { text: 'Вне норм', color: 'default' },
};
export const ISSUE_STATUS: Record<string, Tag> = {
  ACTIVE: { text: 'Числится', color: 'green' }, PARTIALLY_CLOSED: { text: 'Частично закрыто', color: 'gold' }, RETURNED: { text: 'Возвращено', color: 'default' },
  WRITTEN_OFF: { text: 'Списано', color: 'default' }, REPLACED: { text: 'Заменено', color: 'default' },
};
export const TASK_STATUS: Record<string, Tag> = {
  OPEN: { text: 'Открыта', color: 'blue' }, IN_PROGRESS: { text: 'В работе', color: 'gold' }, DONE: { text: 'Выполнена', color: 'green' }, CANCELLED: { text: 'Отменена', color: 'default' },
};
export const TASK_PRIORITY: Record<string, Tag> = {
  LOW: { text: 'Низкий', color: 'default' }, NORMAL: { text: 'Обычный', color: 'blue' }, HIGH: { text: 'Высокий', color: 'orange' }, CRITICAL: { text: 'Критический', color: 'red' },
};
export const TASK_TYPE: Record<string, string> = {
  MANUAL: 'Задача', CONTROL_EVENT: 'Контрольное мероприятие', AUTO_BRIEFING: 'Авто: инструктаж', AUTO_CHECK: 'Авто: проверка знаний', AUTO_PPE: 'Авто: СИЗ',
};
export const CONFIRM_METHODS = [
  { value: 'PAPER_JOURNAL_SIGNATURE', label: 'Подпись в бумажном журнале' },
  { value: 'SCANNED_DOCUMENT', label: 'Скан подписанного документа' },
  { value: 'ELECTRONIC', label: 'Электронное подтверждение' },
  { value: 'OTHER', label: 'Иное' },
];
export const CONFIRM_TEXT: Record<string, string> = Object.fromEntries(CONFIRM_METHODS.map((m) => [m.value, m.label]));
export const CHANGE_TYPE: Record<string, string> = {
  HIRE: 'Приём', TRANSFER: 'Перевод', UPDATE: 'Изменение данных', STATUS_CHANGE: 'Изменение статуса', DISMISSAL: 'Увольнение', REHIRE: 'Повторный приём',
  IMPORT_CREATE: 'Создан импортом', IMPORT_UPDATE: 'Обновлён импортом',
};
export const FIELD_NAMES: Record<string, string> = {
  personnelNumber: 'Табельный номер', lastName: 'Фамилия', firstName: 'Имя', middleName: 'Отчество', hireDate: 'Дата приёма', managerId: 'Руководитель',
  phone: 'Телефон', email: 'Email', note: 'Примечание', status: 'Статус', dismissalDate: 'Дата увольнения', unitId: 'Подразделение', positionId: 'Должность', managerNumber: 'Руководитель (таб. №)',
};
