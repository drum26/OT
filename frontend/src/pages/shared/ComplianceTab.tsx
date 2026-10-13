import { Button, Select, Table } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { api, qs } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ExportButton, StatusTag } from '../../components/Common';
import { BriefingTypeSelect, CheckTypeSelect, PositionSelect, UnitSelect } from '../../components/Selects';
import { COMPLIANCE_STATUS, fmtDate } from '../../utils/format';
import { useUrlFilters } from '../../utils/useUrlFilters';

/** Список сотрудников, которым необходимо пройти инструктаж / проверку (по правилам периодичности) */
export function ComplianceTab({ kind, onPlan }: { kind: 'briefing' | 'check'; onPlan: (employeeIds: string[], typeId?: string) => void }) {
  const { can } = useAuth();
  const [f, setF] = useUrlFilters<any>(['unitIds', 'statuses']);
  const [selected, setSelected] = useState<string[]>([]);
  const base = kind === 'briefing' ? '/briefings' : '/knowledge-checks';
  const params = { unitIds: f.unitIds, positionId: f.positionId, typeId: f.typeId, statuses: f.statuses ?? (kind === 'check' ? ['OVERDUE', 'MISSING', 'FAILED', 'UPCOMING'] : ['OVERDUE', 'MISSING', 'UPCOMING']) };
  const { data, isFetching } = useQuery({ queryKey: ['compliance', kind, params], queryFn: () => api.get(`${base}/compliance`, { params: qs(params) }).then((r) => r.data as any[]) });
  const rows = (data ?? []).map((r) => ({ ...r, key: `${r.employeeId}|${r.typeId}` }));
  const selRows = rows.filter((r) => selected.includes(r.key));
  const types = [...new Set(selRows.map((r) => r.typeId))];
  return (
    <>
      <div className="filters">
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <PositionSelect value={f.positionId} onChange={(v) => setF({ positionId: v })} />
        {kind === 'briefing' ? <BriefingTypeSelect value={f.typeId} onChange={(v) => setF({ typeId: v })} /> : <CheckTypeSelect value={f.typeId} onChange={(v) => setF({ typeId: v })} />}
        <Select mode="multiple" style={{ minWidth: 300 }} value={params.statuses} onChange={(v) => setF({ statuses: v })} placeholder="Состояние"
          options={Object.entries(COMPLIANCE_STATUS).filter(([k]) => kind === 'check' || k !== 'FAILED').map(([value, s]) => ({ value, label: s.text }))} />
        <ExportButton url={`${base}/compliance/export`} params={params} name="Потребность" />
        {can(kind === 'briefing' ? 'briefings.plan' : 'checks.plan') && (
          <Button type="primary" disabled={!selected.length || types.length !== 1} onClick={() => onPlan([...new Set(selRows.map((r) => r.employeeId))], types[0])}
            title={types.length > 1 ? 'Выберите строки одного вида' : undefined}>
            Запланировать для выбранных ({new Set(selRows.map((r) => r.employeeId)).size})
          </Button>
        )}
      </div>
      <Table size="small" loading={isFetching} dataSource={rows} rowKey="key" pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `Записей: ${t}` }}
        rowSelection={{ selectedRowKeys: selected, onChange: (k) => setSelected(k as string[]) }}
        rowClassName={(r) => (r.status === 'FAILED' ? 'row-failed' : r.status === 'OVERDUE' || r.status === 'MISSING' ? 'row-overdue' : '')}
        columns={[
          { title: 'Таб. №', dataIndex: 'personnelNumber', width: 90 },
          { title: 'Сотрудник', render: (_, r) => <Link to={`/employees/${r.employeeId}?tab=${kind === 'briefing' ? 'briefings' : 'checks'}`}>{r.fullName}</Link>, sorter: (a, b) => a.fullName.localeCompare(b.fullName, 'ru') },
          { title: 'Подразделение', dataIndex: 'unitName', sorter: (a, b) => a.unitName.localeCompare(b.unitName, 'ru') },
          { title: 'Должность', dataIndex: 'positionName' },
          { title: 'Вид', dataIndex: 'typeName' },
          { title: 'Последний раз', render: (_, r) => fmtDate(r.lastDate) },
          { title: 'Срок', render: (_, r) => fmtDate(r.dueDate), sorter: (a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''), defaultSortOrder: 'ascend' },
          { title: 'Дней до срока', dataIndex: 'daysLeft', align: 'right', width: 70 },
          { title: 'Состояние', render: (_, r) => <StatusTag map={COMPLIANCE_STATUS} value={r.status} /> },
          { title: 'Запланировано', render: (_, r) => (r.plannedId ? <Link to={`/${kind === 'briefing' ? 'briefings' : 'checks'}/${r.plannedId}`}>{fmtDate(r.plannedDate) || 'да'}</Link> : '') },
        ]} />
    </>
  );
}
