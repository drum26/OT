import { Alert, App, Button, Card, DatePicker, Descriptions, Form, Input, Select, Space, Spin, Table, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import dayjs from 'dayjs';
import { api, errorText } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, StatusTag } from '../../components/Common';
import { Attachments } from '../../components/Attachments';
import { EmployeeSelect } from '../../components/Selects';
import { EVENT_STATUS, fio, fmtDate, OUTCOME, toApiDate, toDayjs } from '../../utils/format';
import { openPrint } from '../../utils/files';
import { CommissionSelect } from './ChecksPage';

const ROLE: Record<string, string> = { CHAIR: 'Председатель', DEPUTY: 'Заместитель', MEMBER: 'Член комиссии', SECRETARY: 'Секретарь' };

export function CheckDetails() {
  const { id } = useParams();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  const { data: c, isLoading, error, refetch } = useQuery({ queryKey: ['check', id], queryFn: () => api.get(`/knowledge-checks/${id}`).then((r) => r.data) });
  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={errorText(error)} />;
  if (!c) return null;
  const start = () => {
    form.setFieldsValue({
      conductedDate: toDayjs(c.conductedDate) ?? dayjs(), commissionId: c.commissionId, responsibleEmployeeId: c.responsibleEmployeeId,
      protocolNumber: c.protocolNumber, protocolDate: toDayjs(c.protocolDate) ?? dayjs(), reason: c.reason, note: c.note,
      results: Object.fromEntries(c.participants.map((p: any) => [p.employeeId, { outcome: p.result?.outcome, score: p.result?.score, comment: p.result?.comment, nextCheckDate: p.result?.nextCheckManual ? toDayjs(p.result.nextCheckDate) : null, nextCheckBasis: p.result?.nextCheckManual ? p.result.nextCheckBasis : undefined }])),
    });
    setEditing(true);
  };
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post(`/knowledge-checks/${c.id}/conduct`, {
        conductedDate: toApiDate(v.conductedDate), commissionId: v.commissionId, responsibleEmployeeId: v.responsibleEmployeeId, protocolNumber: v.protocolNumber,
        protocolDate: toApiDate(v.protocolDate), reason: v.reason, note: v.note,
        results: Object.entries(v.results).map(([employeeId, r]: any) => ({ employeeId, outcome: r.outcome, score: r.score, comment: r.comment, nextCheckDate: toApiDate(r.nextCheckDate), nextCheckBasis: r.nextCheckBasis })),
      });
      message.success('Результаты зарегистрированы');
      setEditing(false);
      refetch();
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const cancel = () => {
    let reason = '';
    modal.confirm({
      title: 'Отменить проверку?', content: <Input placeholder="Причина отмены" onChange={(e) => (reason = e.target.value)} />, okText: 'Отменить проверку', okButtonProps: { danger: true }, cancelText: 'Назад',
      onOk: async () => {
        if (!reason.trim()) { message.error('Укажите причину'); throw new Error(); }
        try { await api.post(`/knowledge-checks/${c.id}/cancel`, { reason }); refetch(); } catch (e) { message.error(errorText(e)); }
      },
    });
  };
  return (
    <>
      <PageHeader title={<>Проверка знаний: {c.checkType.name} <StatusTag map={EVENT_STATUS} value={c.displayStatus} /></>} extra={<Space>
        {c.status === 'CONDUCTED' && can('reports.export') && <Button icon={<PrinterOutlined />} onClick={() => openPrint(`/print/check-protocol/${c.id}`)}>Протокол</Button>}
        {can('checks.conduct') && c.status !== 'CANCELLED' && !editing && <Button type="primary" onClick={start}>{c.status === 'CONDUCTED' ? 'Исправить результаты' : 'Зарегистрировать результаты'}</Button>}
        {can('checks.plan') && c.status === 'PLANNED' && <Button danger onClick={cancel}>Отменить</Button>}
      </Space>} />
      {c.hiddenParticipants > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Ещё ${c.hiddenParticipants} участник(ов) вне вашей зоны доступа не отображаются`} />}
      <Card size="small">
        <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }}>
          <Descriptions.Item label="Плановая дата">{fmtDate(c.plannedDate) || '—'}</Descriptions.Item>
          <Descriptions.Item label="Дата проведения">{fmtDate(c.conductedDate) || '—'}</Descriptions.Item>
          <Descriptions.Item label="Протокол">{c.protocolNumber ? `№ ${c.protocolNumber} от ${fmtDate(c.protocolDate)}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Основание">{c.reason ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Комиссия">{c.commission ? `${c.commission.name}: ${c.commission.members.map((m: any) => `${ROLE[m.role]} — ${fio(m.employee)}`).join('; ')}` : '—'}</Descriptions.Item>
          <Descriptions.Item label="Ответственное лицо">{c.responsibleName ?? '—'}</Descriptions.Item>
          {c.cancelReason && <Descriptions.Item label="Причина отмены">{c.cancelReason}</Descriptions.Item>}
          {c.note && <Descriptions.Item label="Примечание">{c.note}</Descriptions.Item>}
        </Descriptions>
      </Card>
      {editing ? (
        <Card size="small" title="Регистрация результатов" style={{ marginTop: 12 }}>
          <Form form={form} layout="vertical">
            <Space wrap align="start">
              <Form.Item name="conductedDate" label="Дата проведения" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} /></Form.Item>
              <Form.Item name="protocolNumber" label="Номер протокола"><Input style={{ width: 140 }} /></Form.Item>
              <Form.Item name="protocolDate" label="Дата протокола"><DatePicker format="DD.MM.YYYY" /></Form.Item>
              <Form.Item name="commissionId" label="Комиссия"><CommissionSelect style={{ width: 260 }} /></Form.Item>
              <Form.Item name="responsibleEmployeeId" label="Ответственное лицо"><EmployeeSelect initialOptions={c.responsible ? [{ value: c.responsible.id, label: fio(c.responsible) }] : []} /></Form.Item>
            </Space>
            <Form.Item name="reason" label="Основание"><Input /></Form.Item>
            <Table size="small" rowKey="employeeId" dataSource={c.participants} pagination={false} scroll={{ x: 1100 }}
              columns={[
                { title: 'Сотрудник', render: (_, p: any) => p.fullName, width: 220 },
                { title: 'Результат', width: 200, render: (_, p: any) => (
                  <Form.Item name={['results', p.employeeId, 'outcome']} noStyle rules={[{ required: true, message: 'Укажите результат' }]}>
                    <Select style={{ width: 190 }} placeholder="Результат" options={[{ value: 'PASSED', label: 'Удовлетворительно' }, { value: 'FAILED', label: 'Неудовлетворительно' }, { value: 'ABSENT', label: 'Отсутствовал' }]} />
                  </Form.Item>
                ) },
                { title: 'Оценка / баллы', width: 120, render: (_, p: any) => <Form.Item name={['results', p.employeeId, 'score']} noStyle><Input /></Form.Item> },
                { title: 'Дата след. проверки (вручную)', width: 170, render: (_, p: any) => <Form.Item name={['results', p.employeeId, 'nextCheckDate']} noStyle><DatePicker format="DD.MM.YYYY" placeholder="по правилу" /></Form.Item> },
                { title: 'Основание ручной даты', render: (_, p: any) => <Form.Item name={['results', p.employeeId, 'nextCheckBasis']} noStyle><Input /></Form.Item> },
                { title: 'Комментарий', render: (_, p: any) => <Form.Item name={['results', p.employeeId, 'comment']} noStyle><Input /></Form.Item> },
              ]} />
            <p className="muted" style={{ marginTop: 8 }}>Дата следующей проверки рассчитывается по правилу, действовавшему на дату проверки, для должности участника. Ручная дата требует основания.</p>
            <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} /></Form.Item>
            <Space><Button type="primary" onClick={submit}>Сохранить</Button><Button onClick={() => setEditing(false)}>Отмена</Button></Space>
          </Form>
        </Card>
      ) : (
        <Card size="small" title={`Участники (${c.participants.length})`} style={{ marginTop: 12 }}>
          <Table size="small" rowKey="id" dataSource={c.participants} pagination={{ pageSize: 50 }} rowClassName={(p: any) => (p.result?.outcome === 'FAILED' ? 'row-failed' : '')}
            columns={[
              { title: 'Таб. №', render: (_, p: any) => p.employee.personnelNumber, width: 90 },
              { title: 'Сотрудник', render: (_, p: any) => <Link to={`/employees/${p.employeeId}?tab=checks`}>{p.fullName}</Link> },
              { title: 'Должность (на дату)', dataIndex: 'positionName' },
              { title: 'Подразделение (на дату)', dataIndex: 'unitName' },
              { title: 'Результат', render: (_, p: any) => <StatusTag map={OUTCOME} value={p.result?.outcome ?? 'PENDING'} /> },
              { title: 'Следующая проверка', render: (_, p: any) => <>{fmtDate(p.result?.nextCheckDate)}{p.result?.nextCheckManual && <Tag style={{ marginLeft: 4 }} title={p.result.nextCheckBasis}>вручную</Tag>}</> },
              { title: 'Комментарий', render: (_, p: any) => p.result?.comment },
            ]} />
        </Card>
      )}
      <Card size="small" title="Документы (подписанный протокол и др.)" style={{ marginTop: 12 }}><Attachments entityType="knowledge_check" entityId={c.id} /></Card>
    </>
  );
}
