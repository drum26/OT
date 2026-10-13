import { App, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api, errorText, qs, Paged } from '../../api/client';
import { useCommissions } from '../../api/refs';
import { useAuth } from '../../auth/AuthContext';
import { ExportButton, PageHeader, StatusTag } from '../../components/Common';
import { CheckTypeSelect, EmployeeSelect, UnitSelect } from '../../components/Selects';
import { EVENT_STATUS, fmtDate, OUTCOME, toApiDate, toDayjs } from '../../utils/format';
import { useUrlFilters } from '../../utils/useUrlFilters';
import { ComplianceTab } from '../shared/ComplianceTab';
import { GroupPicker } from '../shared/GroupPicker';

export function CommissionSelect(props: any) {
  const { data = [] } = useCommissions();
  return <Select allowClear placeholder="Комиссия" options={data.filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))} {...props} />;
}

export function CheckPlanModal({ open, onClose, initial }: { open: boolean; onClose: (id?: string) => void; initial?: { employeeIds?: string[]; typeId?: string } }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [labels, setLabels] = useState<Record<string, string>>({});
  useEffect(() => { if (open) { form.resetFields(); form.setFieldsValue({ checkTypeId: initial?.typeId, employeeIds: initial?.employeeIds ?? [], plannedDate: dayjs().add(7, 'day') }); } }, [open, initial, form]);
  const submit = async () => {
    const v = await form.validateFields();
    try {
      const r = await api.post('/knowledge-checks/plan', { ...v, plannedDate: toApiDate(v.plannedDate) });
      message.success('Проверка запланирована');
      qc.invalidateQueries({ queryKey: ['checks'] });
      qc.invalidateQueries({ queryKey: ['compliance'] });
      onClose(r.data.id);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={open} width={760} title="Планирование проверки знаний" onOk={submit} okText="Сохранить" onCancel={() => onClose()} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="checkTypeId" label="Вид проверки" rules={[{ required: true }]}><CheckTypeSelect /></Form.Item>
        <Form.Item name="plannedDate" label="Плановая дата" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
        <Form.Item name="employeeIds" label="Сотрудники" rules={[{ required: true, type: 'array', min: 1, message: 'Выберите сотрудников' }]}><GroupPicker labels={labels} setLabels={setLabels} /></Form.Item>
        <Form.Item name="reason" label="Основание проведения"><Input /></Form.Item>
        <Form.Item name="commissionId" label="Комиссия"><CommissionSelect /></Form.Item>
        <Form.Item name="responsibleEmployeeId" label="Ответственное лицо"><EmployeeSelect /></Form.Item>
        <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

function ChecksList() {
  const nav = useNavigate();
  const [f, setF] = useUrlFilters<any>(['unitIds']);
  const params = { pageSize: 25, ...f, tab: undefined };
  const { data, isFetching } = useQuery({ queryKey: ['checks', params], queryFn: () => api.get<Paged<any>>('/knowledge-checks', { params: qs(params) }).then((r) => r.data), placeholderData: (p) => p });
  return (
    <>
      <div className="filters">
        <Select allowClear placeholder="Статус" value={f.status} onChange={(v) => setF({ status: v })} style={{ width: 160 }} options={Object.entries(EVENT_STATUS).map(([value, s]) => ({ value, label: s.text }))} />
        <Select allowClear placeholder="Результат" value={f.outcome} onChange={(v) => setF({ outcome: v })} style={{ width: 190 }} options={Object.entries(OUTCOME).map(([value, s]) => ({ value, label: s.text }))} />
        <CheckTypeSelect value={f.typeId} onChange={(v) => setF({ typeId: v })} />
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <CommissionSelect value={f.commissionId} onChange={(v: string) => setF({ commissionId: v })} style={{ width: 200 }} />
        <EmployeeSelect placeholder="Сотрудник" value={f.employeeId} onChange={(v) => setF({ employeeId: v })} empStatus="ALL" />
        <DatePicker.RangePicker format="DD.MM.YYYY" value={[toDayjs(f.dateFrom), toDayjs(f.dateTo)]} onChange={(v) => setF({ dateFrom: toApiDate(v?.[0]) ?? undefined, dateTo: toApiDate(v?.[1]) ?? undefined })} />
        <ExportButton url="/knowledge-checks/export" params={params} name="Проверки знаний" />
      </div>
      <Table rowKey="id" size="small" loading={isFetching} dataSource={data?.items}
        onChange={(p) => setF({ page: p.current, pageSize: p.pageSize })}
        pagination={{ current: Number(f.page ?? 1), pageSize: Number(f.pageSize ?? 25), total: data?.total, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
        rowClassName={(r) => (r.displayStatus === 'OVERDUE' ? 'row-overdue' : '')}
        onRow={(r) => ({ onDoubleClick: () => nav(`/checks/${r.id}`) })}
        columns={[
          { title: 'Дата', render: (_, r) => <Link to={`/checks/${r.id}`}>{fmtDate(r.conductedDate ?? r.plannedDate)}</Link>, width: 100 },
          { title: 'Вид', render: (_, r) => r.checkType.name },
          { title: 'Статус', render: (_, r) => <StatusTag map={EVENT_STATUS} value={r.displayStatus} /> },
          { title: 'Протокол', render: (_, r) => (r.protocolNumber ? `№ ${r.protocolNumber} от ${fmtDate(r.protocolDate)}` : '') },
          { title: 'Комиссия / ответственный', render: (_, r) => r.commission?.name ?? r.responsibleName },
          { title: 'Участники', render: (_, r) => <span title={r.participantsPreview}>{r.participantsCount}</span> },
          { title: 'Результаты', render: (_, r) => r.status === 'CONDUCTED' && <Space size={4}><Tag color="green">{r.passedCount}</Tag>{r.failedCount > 0 && <Tag color="red">неудовл.: {r.failedCount}</Tag>}</Space> },
        ]} />
    </>
  );
}

export function ChecksPage() {
  const { can } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useUrlFilters<any>();
  const [plan, setPlan] = useState<{ employeeIds?: string[]; typeId?: string } | null>(null);
  return (
    <>
      <PageHeader title="Проверки знаний по охране труда" extra={can('checks.plan') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setPlan({})}>Запланировать</Button>} />
      <Tabs activeKey={f.tab ?? 'list'} onChange={(k) => setF({ tab: k === 'list' ? undefined : k } as any)} destroyOnHidden items={[
        { key: 'list', label: 'Проверки', children: <ChecksList /> },
        { key: 'compliance', label: 'Требуется проверка', children: <ComplianceTab kind="check" onPlan={(employeeIds, typeId) => setPlan({ employeeIds, typeId })} /> },
      ]} />
      <CheckPlanModal open={!!plan} initial={plan ?? undefined} onClose={(id) => { setPlan(null); if (id) nav(`/checks/${id}`); }} />
    </>
  );
}
