export interface ConductInput {
  conductedDate: Date;
  today: Date;
  plannedDate?: Date | null;
  responsibleEmployeeId?: string | null;
  topic?: string | null;
  documentId?: string | null;
  participants: { employeeId: string; result: string; confirmed?: boolean; confirmationMethod?: string | null }[];
}

export interface ConductOptions {
  requireTopic: boolean;
  requireDocument: boolean;
}

/**
 * Бизнес-правила регистрации проведения мероприятия.
 * Запланированное мероприятие нельзя отметить проведённым без заполнения обязательных полей.
 */
export function validateConduct(i: ConductInput, o: ConductOptions): string[] {
  const errors: string[] = [];
  if (i.conductedDate > i.today) errors.push('Дата проведения не может быть позже текущей даты');
  if (!i.responsibleEmployeeId) errors.push('Не указано ответственное лицо (проводивший инструктаж)');
  if (o.requireTopic && !i.topic?.trim()) errors.push('Не указана тема инструктажа');
  if (o.requireDocument && !i.documentId) errors.push('Не указана инструкция / документ, по которому проводится инструктаж');
  if (!i.participants.length) errors.push('Нет участников');
  const seen = new Set<string>();
  for (const p of i.participants) {
    if (seen.has(p.employeeId)) errors.push('Сотрудник указан в списке участников дважды');
    seen.add(p.employeeId);
    if (!['COMPLETED', 'NOT_COMPLETED', 'ABSENT'].includes(p.result)) errors.push('Для каждого участника должен быть указан результат');
    if (p.confirmed && !p.confirmationMethod) errors.push('При фиксации подтверждения укажите способ подтверждения');
    if (p.confirmed && p.result !== 'COMPLETED') errors.push('Подтверждение фиксируется только для участников, прошедших инструктаж');
  }
  return [...new Set(errors)];
}
