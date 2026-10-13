import { Button, Input, Select, Table } from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, qs, Paged } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ExportButton, PageHeader, StatusTag } from '../../components/Common';
import { PositionSelect, UnitSelect } from '../../components/Selects';
import { EMPLOYEE_STATUS, fmtDate } from '../../utils/format';
import { useUrlFilters } from '../../utils/useUrlFilters';
import { EmployeeFormModal } from './EmployeeForms';

export function EmployeesPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters<any>(['unitIds']);
  const [creating, setCreating] = useState(false);
  const params = { status: 'CURRENT', pageSize: 25, ...f };
  const { data, isFetching } = useQuery({
    queryKey: ['employees', params],
    queryFn: () => api.get<Paged<any>>('/employees', { params: qs(params) }).then((r) => r.data),
    placeholderData: (p) => p,
  });
  return (
    <>
      <PageHeader title="Сотрудники" extra={<>
        {can('employees.import') && <Button icon={<UploadOutlined />} onClick={() => nav('/employees/import')}>Импорт из Excel</Button>}
        <ExportButton url="/employees/export" params={params} name="Сотрудники" />
        {can('employees.write', 'employees.dismiss') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>Принять сотрудника</Button>}
      </>} />
      <div className="filters">
        <Input.Search allowClear placeholder="ФИО или табельный номер" defaultValue={f.search} onSearch={(v) => setF({ search: v })} style={{ width: 280 }} />
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <PositionSelect value={f.positionId} onChange={(v) => setF({ positionId: v })} />
        <Select value={f.status ?? 'CURRENT'} onChange={(v) => setF({ status: v })} style={{ width: 200 }} options={[
          { value: 'CURRENT', label: 'Работающие и отсутствующие' }, { value: 'ACTIVE', label: 'Работает' }, { value: 'ABSENT', label: 'Временно отсутствует' },
          { value: 'DISMISSED', label: 'Уволенные' }, { value: 'ALL', label: 'Все' },
        ]} />
      </div>
      <Table rowKey="id" size="small" loading={isFetching} dataSource={data?.items}
        onChange={(p, _f, s: any) => setF({ page: p.current, pageSize: p.pageSize, sortBy: s.order ? s.columnKey : undefined, sortDir: s.order === 'descend' ? 'desc' : s.order ? 'asc' : undefined })}
        pagination={{ current: Number(f.page ?? 1), pageSize: Number(f.pageSize ?? 25), total: data?.total, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
        onRow={(r) => ({ onDoubleClick: () => nav(`/employees/${r.id}`) })}
        columns={[
          { title: 'Таб. №', dataIndex: 'personnelNumber', key: 'personnelNumber', sorter: true, width: 100 },
          { title: 'ФИО', key: 'lastName', sorter: true, render: (_, r) => <Link to={`/employees/${r.id}`}>{r.fullName}</Link> },
          { title: 'Подразделение', key: 'unit', sorter: true, render: (_, r) => r.unit.name },
          { title: 'Должность', key: 'position', sorter: true, render: (_, r) => r.position.name },
          { title: 'Дата приёма', key: 'hireDate', sorter: true, render: (_, r) => fmtDate(r.hireDate), width: 110 },
          { title: 'Статус', key: 'status', render: (_, r) => <StatusTag map={EMPLOYEE_STATUS} value={r.status} />, width: 170 },
        ]} />
      <EmployeeFormModal open={creating} onClose={(id) => { setCreating(false); if (id) nav(`/employees/${id}`); }} />
    </>
  );
}
