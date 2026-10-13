import { Button, DatePicker, Input, Select, Space, Table, Tabs, Tag } from 'antd';
import { PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { api, qs, Paged } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { ExportButton, PageHeader, StatusTag } from '../../components/Common';
import { BriefingTypeSelect, EmployeeSelect, UnitSelect } from '../../components/Selects';
import { EVENT_STATUS, fmtDate, toApiDate, toDayjs } from '../../utils/format';
import { openPrint } from '../../utils/files';
import { useUrlFilters } from '../../utils/useUrlFilters';
import { ComplianceTab } from '../shared/ComplianceTab';
import { BriefingFormModal } from './BriefingForms';

function Journal() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [f, setF] = useUrlFilters<any>(['unitIds']);
  const params = { pageSize: 25, ...f, tab: undefined };
  const { data, isFetching } = useQuery({
    queryKey: ['briefings', params],
    queryFn: () => api.get<Paged<any>>('/briefings', { params: qs(params) }).then((r) => r.data),
    placeholderData: (p) => p,
  });
  return (
    <>
      <div className="filters">
        <Select allowClear placeholder="Статус" value={f.status} onChange={(v) => setF({ status: v })} style={{ width: 160 }}
          options={Object.entries(EVENT_STATUS).map(([value, s]) => ({ value, label: s.text }))} />
        <BriefingTypeSelect value={f.typeId} onChange={(v) => setF({ typeId: v })} />
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <EmployeeSelect placeholder="Сотрудник" value={f.employeeId} onChange={(v) => setF({ employeeId: v })} empStatus="ALL" />
        <EmployeeSelect placeholder="Ответственный" value={f.responsibleId} onChange={(v) => setF({ responsibleId: v })} empStatus="ALL" />
        <DatePicker.RangePicker format="DD.MM.YYYY" value={[toDayjs(f.dateFrom), toDayjs(f.dateTo)]} onChange={(v) => setF({ dateFrom: toApiDate(v?.[0]) ?? undefined, dateTo: toApiDate(v?.[1]) ?? undefined })} />
        <Input.Search allowClear placeholder="Тема / основание" defaultValue={f.search} onSearch={(v) => setF({ search: v })} style={{ width: 200 }} />
        <ExportButton url="/briefings/export" params={params} name="Журнал инструктажей" print={false} />
        {can('reports.export') && <Button icon={<PrinterOutlined />} onClick={() => openPrint('/print/briefing-journal', params)}>Печать журнала</Button>}
      </div>
      <Table rowKey="id" size="small" loading={isFetching} dataSource={data?.items}
        onChange={(p) => setF({ page: p.current, pageSize: p.pageSize })}
        pagination={{ current: Number(f.page ?? 1), pageSize: Number(f.pageSize ?? 25), total: data?.total, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
        rowClassName={(r) => (r.displayStatus === 'OVERDUE' ? 'row-overdue' : '')}
        onRow={(r) => ({ onDoubleClick: () => nav(`/briefings/${r.id}`) })}
        columns={[
          { title: 'Дата', render: (_, r) => <Link to={`/briefings/${r.id}`}>{fmtDate(r.conductedDate ?? r.plannedDate)}</Link>, width: 100 },
          { title: 'Вид', render: (_, r) => r.briefingType.name },
          { title: 'Статус', render: (_, r) => <StatusTag map={EVENT_STATUS} value={r.displayStatus} />, width: 130 },
          { title: 'Тема / основание', render: (_, r) => [r.topic, r.reason].filter(Boolean).join('; '), ellipsis: true },
          { title: 'Участники', render: (_, r) => <span title={r.participantsPreview}>{r.participantsCount}{r.status === 'CONDUCTED' && ` (прошли: ${r.completedCount})`}</span> },
          { title: 'Подтверждение', render: (_, r) => (r.status === 'CONDUCTED' && r.briefingType.requiresConfirmation ? (r.unconfirmedCount ? <Tag color="gold">не подтверждено: {r.unconfirmedCount}</Tag> : <Tag color="green">подтверждено</Tag>) : '') },
          { title: 'Ответственный', dataIndex: 'responsibleName' },
        ]} />
    </>
  );
}

export function BriefingsPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters<any>();
  const [form, setForm] = useState<{ mode: 'plan' | 'register'; employeeIds?: string[]; typeId?: string } | null>(null);
  return (
    <>
      <PageHeader title="Инструктажи по охране труда" extra={<Space>
        {can('briefings.conduct') && <Button onClick={() => setForm({ mode: 'register' })}>Зарегистрировать проведённый</Button>}
        {can('briefings.plan') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setForm({ mode: 'plan' })}>Запланировать</Button>}
      </Space>} />
      <Tabs activeKey={f.tab ?? 'journal'} onChange={(k) => setF({ tab: k === 'journal' ? undefined : k } as any)} destroyOnHidden items={[
        { key: 'journal', label: 'Журнал и план', children: <Journal /> },
        { key: 'compliance', label: 'Требуется инструктаж', children: <ComplianceTab kind="briefing" onPlan={(employeeIds, typeId) => setForm({ mode: 'plan', employeeIds, typeId })} /> },
      ]} />
      <BriefingFormModal mode={form?.mode ?? 'plan'} open={!!form} initial={form ?? undefined} onClose={(id) => { setForm(null); if (id) nav(`/briefings/${id}`); }} />
    </>
  );
}
