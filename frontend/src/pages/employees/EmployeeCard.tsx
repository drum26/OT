import { Alert, Button, Card, Descriptions, Dropdown, Space, Spin, Table, Tabs, Tag } from 'antd';
import { EditOutlined, DownOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useState } from 'react';
import { api, errorText } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, StatusTag } from '../../components/Common';
import { Attachments } from '../../components/Attachments';
import { CHANGE_TYPE, COMPLIANCE_STATUS, CONFIRM_TEXT, EMPLOYEE_STATUS, EVENT_STATUS, FIELD_NAMES, fio, fmtDate, fmtDateTime, OUTCOME, RESULT } from '../../utils/format';
import { EmployeeFormModal, HrOperationModal } from './EmployeeForms';
import { EmployeePpe } from '../ppe/EmployeePpe';

function ComplianceTable({ kind, employeeId }: { kind: 'briefings' | 'knowledge-checks'; employeeId: string }) {
  const { data, isFetching } = useQuery({ queryKey: ['compliance', kind, employeeId], queryFn: () => api.get(`/${kind}/compliance`, { params: { employeeId } }).then((r) => r.data as any[]) });
  return (
    <Table size="small" rowKey="typeId" loading={isFetching} dataSource={data} pagination={false} locale={{ emptyText: 'Правила периодичности для сотрудника не установлены' }}
      columns={[
        { title: 'Вид', dataIndex: 'typeName' },
        { title: 'Последний раз', render: (_, r) => fmtDate(r.lastDate) },
        { title: 'Срок', render: (_, r) => fmtDate(r.dueDate) },
        { title: 'Состояние', render: (_, r) => <StatusTag map={COMPLIANCE_STATUS} value={r.status} /> },
        { title: 'Запланировано', render: (_, r) => (r.plannedId ? <Link to={`/${kind === 'briefings' ? 'briefings' : 'checks'}/${r.plannedId}`}>{fmtDate(r.plannedDate)}</Link> : '') },
        { title: 'Основание правила', dataIndex: 'ruleBasis', ellipsis: true },
      ]} />
  );
}

export function EmployeeCard() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [op, setOp] = useState<any>(null);
  const { data: e, isLoading, error } = useQuery({ queryKey: ['employee', id], queryFn: () => api.get(`/employees/${id}`).then((r) => r.data) });
  const history = useQuery({ queryKey: ['employee', id, 'history'], queryFn: () => api.get(`/employees/${id}/history`).then((r) => r.data as any[]) });
  const briefings = useQuery({ queryKey: ['employee', id, 'briefings'], queryFn: () => api.get(`/briefings/employee/${id}`).then((r) => r.data as any[]), enabled: can('briefings.read') });
  const checks = useQuery({ queryKey: ['employee', id, 'checks'], queryFn: () => api.get(`/knowledge-checks/employee/${id}`).then((r) => r.data as any[]), enabled: can('checks.read') });
  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={errorText(error)} />;
  if (!e) return null;
  const dismissed = e.status === 'DISMISSED';
  const ops = [
    can('employees.transfer') && !dismissed && { key: 'transfer', label: 'Перевод' },
    can('employees.write') && !dismissed && { key: 'status', label: e.status === 'ABSENT' ? 'Вернуть в статус «Работает»' : 'Временное отсутствие' },
    can('employees.dismiss') && !dismissed && { key: 'dismiss', label: 'Увольнение', danger: true },
    can('employees.dismiss') && dismissed && { key: 'rehire', label: 'Повторный приём' },
  ].filter(Boolean) as any[];

  const tabs = [
    can('briefings.read') && {
      key: 'briefings', label: 'Инструктажи', children: <>
        <Card size="small" title="Состояние по правилам"><ComplianceTable kind="briefings" employeeId={e.id} /></Card>
        <Card size="small" title="История инструктажей" style={{ marginTop: 12 }}>
          <Table size="small" rowKey="id" loading={briefings.isFetching} dataSource={briefings.data} pagination={{ pageSize: 20 }}
            columns={[
              { title: 'Дата', render: (_, r) => <Link to={`/briefings/${r.briefingId}`}>{fmtDate(r.briefing.conductedDate ?? r.briefing.plannedDate)}</Link> },
              { title: 'Вид', render: (_, r) => r.briefing.briefingType.name },
              { title: 'Статус', render: (_, r) => <StatusTag map={EVENT_STATUS} value={r.displayStatus} /> },
              { title: 'Результат', render: (_, r) => <StatusTag map={RESULT} value={r.result} /> },
              { title: 'Подтверждение', render: (_, r) => (r.confirmed ? CONFIRM_TEXT[r.confirmationMethod] : r.result === 'COMPLETED' ? <Tag color="gold">не зафиксировано</Tag> : '') },
              { title: 'Проводил', dataIndex: 'responsibleName' },
              { title: 'Следующий', render: (_, r) => fmtDate(r.nextDueDate) },
            ]} />
        </Card>
      </>,
    },
    can('checks.read') && {
      key: 'checks', label: 'Проверки знаний', children: <>
        <Card size="small" title="Состояние по правилам"><ComplianceTable kind="knowledge-checks" employeeId={e.id} /></Card>
        <Card size="small" title="История проверок" style={{ marginTop: 12 }}>
          <Table size="small" rowKey="id" loading={checks.isFetching} dataSource={checks.data} pagination={{ pageSize: 20 }}
            rowClassName={(r) => (r.result?.outcome === 'FAILED' ? 'row-failed' : '')}
            columns={[
              { title: 'Дата', render: (_, r) => <Link to={`/checks/${r.checkId}`}>{fmtDate(r.check.conductedDate ?? r.check.plannedDate)}</Link> },
              { title: 'Вид', render: (_, r) => r.check.checkType.name },
              { title: 'Должность / подразделение (на дату)', render: (_, r) => `${r.positionName ?? ''} / ${r.unitName ?? ''}` },
              { title: 'Статус', render: (_, r) => <StatusTag map={EVENT_STATUS} value={r.displayStatus} /> },
              { title: 'Результат', render: (_, r) => <StatusTag map={OUTCOME} value={r.result?.outcome ?? (r.check.status === 'CONDUCTED' ? 'PENDING' : null)} /> },
              { title: 'Протокол', render: (_, r) => (r.check.protocolNumber ? `№ ${r.check.protocolNumber} от ${fmtDate(r.check.protocolDate)}` : '') },
              { title: 'Следующая', render: (_, r) => fmtDate(r.result?.nextCheckDate) },
            ]} />
        </Card>
      </>,
    },
    can('ppe.read') && { key: 'ppe', label: 'СИЗ', children: <EmployeePpe employee={e} /> },
    {
      key: 'history', label: 'История изменений', children: (
        <Table size="small" rowKey="id" loading={history.isFetching} dataSource={history.data} pagination={false}
          columns={[
            { title: 'Дата', render: (_, r) => fmtDate(r.effectiveDate), width: 100 },
            { title: 'Событие', render: (_, r) => CHANGE_TYPE[r.changeType] ?? r.changeType, width: 160 },
            {
              title: 'Изменения', render: (_, r) => (
                <>
                  {(r.fromUnit || r.toUnit) && r.fromUnit !== r.toUnit && <div>Подразделение: {r.fromUnit ?? '—'} → {r.toUnit ?? '—'}</div>}
                  {(r.fromPosition || r.toPosition) && r.fromPosition !== r.toPosition && <div>Должность: {r.fromPosition ?? '—'} → {r.toPosition ?? '—'}</div>}
                  {r.changes && Object.entries(r.changes).filter(([k]) => !['unitId', 'positionId'].includes(k)).map(([k, v]: any) => <div key={k}>{FIELD_NAMES[k] ?? k}: {String(v.from ?? '—')} → {String(v.to ?? '—')}</div>)}
                </>
              ),
            },
            { title: 'Основание', render: (_, r) => [r.orderNumber && `Приказ № ${r.orderNumber}`, r.reason].filter(Boolean).join('; ') },
            { title: 'Автор / время записи', render: (_, r) => <span className="muted">{r.author ?? ''} {fmtDateTime(r.createdAt)}</span> },
          ]} />
      ),
    },
    { key: 'files', label: 'Документы', children: <Attachments entityType="employee" entityId={e.id} /> },
  ].filter(Boolean) as any[];

  return (
    <>
      <PageHeader title={<>{e.fullName} <StatusTag map={EMPLOYEE_STATUS} value={e.status} /></>} extra={<Space>
        {can('employees.write') && <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>Редактировать</Button>}
        {ops.length > 0 && <Dropdown menu={{ items: ops, onClick: (x) => setOp(x.key) }}><Button>Кадровые операции <DownOutlined /></Button></Dropdown>}
      </Space>} />
      <Card size="small">
        <Descriptions size="small" column={{ xs: 1, md: 2 }} labelStyle={{ width: 180 }}>
          <Descriptions.Item label="Табельный номер">{e.personnelNumber}</Descriptions.Item>
          <Descriptions.Item label="Подразделение">{e.unit.name}</Descriptions.Item>
          <Descriptions.Item label="Должность / профессия">{e.position.name}{e.position.workCategory && <Tag style={{ marginLeft: 6 }}>{e.position.workCategory}</Tag>}</Descriptions.Item>
          <Descriptions.Item label="Дата приёма">{fmtDate(e.hireDate)}</Descriptions.Item>
          {e.dismissalDate && <Descriptions.Item label="Дата увольнения">{fmtDate(e.dismissalDate)}</Descriptions.Item>}
          <Descriptions.Item label="Руководитель">{e.manager ? <Link to={`/employees/${e.manager.id}`}>{fio(e.manager)}</Link> : '—'}</Descriptions.Item>
          {e.phone && <Descriptions.Item label="Телефон">{e.phone}</Descriptions.Item>}
          {e.email && <Descriptions.Item label="Email">{e.email}</Descriptions.Item>}
          {e.note && <Descriptions.Item label="Примечание">{e.note}</Descriptions.Item>}
        </Descriptions>
      </Card>
      <Tabs style={{ marginTop: 12 }} activeKey={sp.get('tab') ?? tabs[0]?.key} onChange={(k) => setSp({ tab: k }, { replace: true })} items={tabs} destroyOnHidden />
      <EmployeeFormModal open={editing} employee={e} onClose={() => setEditing(false)} />
      <HrOperationModal op={op} employee={e} onClose={() => setOp(null)} />
    </>
  );
}
