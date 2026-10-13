import { TableData } from '../core/export.service';
import { ComplianceRow } from './compliance.service';
import { COMPLIANCE_STATUS_RU } from './compliance.dto';

export function complianceTable(title: string, rows: ComplianceRow[], typeTitle: string): TableData {
  return {
    title,
    subtitle: `Записей: ${rows.length}`,
    columns: [
      { key: 'personnelNumber', title: 'Таб. №', width: 10 }, { key: 'fullName', title: 'Сотрудник', width: 30 },
      { key: 'unitName', title: 'Подразделение', width: 26 }, { key: 'positionName', title: 'Должность', width: 26 },
      { key: 'typeName', title: typeTitle, width: 24 }, { key: 'lastDate', title: 'Последний раз', type: 'date', width: 12 },
      { key: 'dueDate', title: 'Срок', type: 'date', width: 12 }, { key: 'daysLeft', title: 'Дней до срока', type: 'number', width: 10 },
      { key: 'status', title: 'Состояние', width: 22 }, { key: 'plannedDate', title: 'Запланировано на', type: 'date', width: 12 },
      { key: 'ruleBasis', title: 'Основание правила', width: 30 },
    ],
    rows: rows.map((r) => ({ ...r, status: COMPLIANCE_STATUS_RU[r.status] })),
  };
}
