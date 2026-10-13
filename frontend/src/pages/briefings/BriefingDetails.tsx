import { Alert, App, Button, Card, Checkbox, DatePicker, Descriptions, Form, Input, Modal, Select, Space, Spin, Table, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import dayjs from 'dayjs';
import { api, errorText } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader, StatusTag } from '../../components/Common';
import { Attachments } from '../../components/Attachments';
import { EmployeeSelect } from '../../components/Selects';
import { CONFIRM_METHODS, CONFIRM_TEXT, EVENT_STATUS, fio, fmtDate, fmtDateTime, RESULT, toApiDate, toDayjs } from '../../utils/format';
import { DocumentSelect } from './BriefingForms';

export function BriefingDetails() {
  const { id } = useParams();
  const { can } = useAuth();
  const { message, modal } = App.useApp();
  const [conducting, setConducting] = useState(false);
  const [confirmIds, setConfirmIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [form] = Form.useForm();
  const [cform] = Form.useForm();
  const { data: b, isLoading, error, refetch } = useQuery({ queryKey: ['briefing', id], queryFn: () => api.get(`/briefings/${id}`).then((r) => r.data) });
  if (isLoading) return <Spin />;
  if (error) return <Alert type="error" message={errorText(error)} />;
  if (!b) return null;

  const startConduct = () => {
    form.setFieldsValue({
      conductedDate: toDayjs(b.conductedDate) ?? dayjs(), responsibleEmployeeId: b.responsibleEmployeeId, topic: b.topic, reason: b.reason, documentId: b.documentId, note: b.note,
      participants: Object.fromEntries(b.participants.map((p: any) => [p.employeeId, { result: p.result === 'PENDING' ? 'COMPLETED' : p.result, confirmed: p.confirmed, confirmationMethod: p.confirmationMethod ?? 'PAPER_JOURNAL_SIGNATURE' }])),
    });
    setConducting(true);
  };
  const submitConduct = async () => {
    const v = await form.validateFields();
    try {
      await api.post(`/briefings/${b.id}/conduct`, {
        conductedDate: toApiDate(v.conductedDate), responsibleEmployeeId: v.responsibleEmployeeId, topic: v.topic, reason: v.reason, documentId: v.documentId, note: v.note,
        participants: Object.entries(v.participants).map(([employeeId, p]: any) => ({
          employeeId, result: p.result, confirmed: p.result === 'COMPLETED' && !!p.confirmed, confirmationMethod: p.result === 'COMPLETED' && p.confirmed ? p.confirmationMethod : undefined,
        })),
      });
      message.success('Проведение зарегистрировано');
      setConducting(false);
      refetch();
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const cancel = () => {
    let reason = '';
    modal.confirm({
      title: 'Отменить инструктаж?', content: <Input placeholder="Причина отмены" onChange={(e) => (reason = e.target.value)} />, okText: 'Отменить инструктаж', okButtonProps: { danger: true }, cancelText: 'Назад',
      onOk: async () => {
        if (!reason.trim()) { message.error('Укажите причину'); throw new Error(); }
        try { await api.post(`/briefings/${b.id}/cancel`, { reason }); refetch(); } catch (e) { message.error(errorText(e)); }
      },
    });
  };
  const submitConfirm = async () => {
    const v = await cform.validateFields();
    try {
      await api.post(`/briefings/${b.id}/confirm`, { participantIds: confirmIds, method: v.method, note: v.note });
      message.success('Подтверждение зафиксировано');
      setConfirmOpen(false);
      setConfirmIds([]);
      refetch();
    } catch (e) {
      message.error(errorText(e));
    }
  };

  const canConduct = can('briefings.conduct') && b.status !== 'CANCELLED';
  return (
    <>
      <PageHeader title={<>Инструктаж: {b.briefingType.name} <StatusTag map={EVENT_STATUS} value={b.displayStatus} /></>} extra={<Space>
        {canConduct && !conducting && <Button type="primary" onClick={startConduct}>{b.status === 'CONDUCTED' ? 'Исправить результаты' : 'Зарегистрировать проведение'}</Button>}
        {can('briefings.plan') && b.status === 'PLANNED' && <Button danger onClick={cancel}>Отменить</Button>}
      </Space>} />
      {b.hiddenParticipants > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`Ещё ${b.hiddenParticipants} участник(ов) вне вашей зоны доступа не отображаются`} />}
      <Card size="small">
        <Descriptions size="small" column={{ xs: 1, md: 2, xl: 3 }}>
          <Descriptions.Item label="Плановая дата">{fmtDate(b.plannedDate) || '—'}</Descriptions.Item>
          <Descriptions.Item label="Дата проведения">{fmtDate(b.conductedDate) || '—'}</Descriptions.Item>
          <Descriptions.Item label="Ответственный">{b.responsibleName ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Тема">{b.topic ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Основание">{b.reason ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Инструкция / документ">{b.document ? [b.document.number, b.document.title].filter(Boolean).join(' ') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Требуется подтверждение">{b.briefingType.requiresConfirmation ? 'да' : 'нет'}</Descriptions.Item>
          {b.cancelReason && <Descriptions.Item label="Причина отмены">{b.cancelReason}</Descriptions.Item>}
          {b.note && <Descriptions.Item label="Примечание">{b.note}</Descriptions.Item>}
          <Descriptions.Item label="Создано / изменено">{fmtDateTime(b.createdAt)} / {fmtDateTime(b.updatedAt)}</Descriptions.Item>
        </Descriptions>
      </Card>

      {conducting ? (
        <Card size="small" title="Регистрация проведения" style={{ marginTop: 12 }}>
          <Form form={form} layout="vertical">
            <Space wrap align="start">
              <Form.Item name="conductedDate" label="Дата проведения" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} /></Form.Item>
              <Form.Item name="responsibleEmployeeId" label="Проводил (ответственное лицо)" rules={[{ required: true, message: 'Обязательное поле' }]}>
                <EmployeeSelect initialOptions={b.responsible ? [{ value: b.responsible.id, label: fio(b.responsible) }] : []} style={{ width: 320 }} />
              </Form.Item>
              <Form.Item name="documentId" label="Инструкция / документ"><DocumentSelect style={{ width: 320 }} /></Form.Item>
            </Space>
            <Form.Item name="topic" label="Тема"><Input /></Form.Item>
            <Form.Item name="reason" label="Основание"><Input /></Form.Item>
            <Table size="small" rowKey="employeeId" dataSource={b.participants} pagination={false}
              columns={[
                { title: 'Сотрудник', render: (_, p: any) => `${p.fullName} (${p.employee.personnelNumber})` },
                { title: 'Результат', width: 180, render: (_, p: any) => (
                  <Form.Item name={['participants', p.employeeId, 'result']} noStyle>
                    <Select style={{ width: 160 }} options={[{ value: 'COMPLETED', label: 'Прошёл' }, { value: 'NOT_COMPLETED', label: 'Не прошёл' }, { value: 'ABSENT', label: 'Отсутствовал' }]} />
                  </Form.Item>
                ) },
                { title: 'Подтверждение проведения', render: (_, p: any) => (
                  <Space>
                    <Form.Item name={['participants', p.employeeId, 'confirmed']} valuePropName="checked" noStyle><Checkbox>подтверждено</Checkbox></Form.Item>
                    <Form.Item name={['participants', p.employeeId, 'confirmationMethod']} noStyle><Select style={{ width: 240 }} options={CONFIRM_METHODS} /></Form.Item>
                  </Space>
                ) },
              ]} />
            <Form.Item name="note" label="Примечание" style={{ marginTop: 12 }}><Input.TextArea rows={2} /></Form.Item>
            <Space><Button type="primary" onClick={submitConduct}>Сохранить</Button><Button onClick={() => setConducting(false)}>Отмена</Button></Space>
          </Form>
        </Card>
      ) : (
        <Card size="small" title={`Участники (${b.participants.length})`} style={{ marginTop: 12 }} extra={
          canConduct && b.status === 'CONDUCTED' && <Button disabled={!confirmIds.length} onClick={() => { cform.setFieldsValue({ method: 'PAPER_JOURNAL_SIGNATURE' }); setConfirmOpen(true); }}>Зафиксировать подтверждение ({confirmIds.length})</Button>
        }>
          <Table size="small" rowKey="id" dataSource={b.participants} pagination={{ pageSize: 50 }}
            rowSelection={canConduct && b.status === 'CONDUCTED' ? {
              selectedRowKeys: confirmIds, onChange: (k) => setConfirmIds(k as string[]),
              getCheckboxProps: (p: any) => ({ disabled: p.result !== 'COMPLETED' || p.confirmed }),
            } : undefined}
            columns={[
              { title: 'Таб. №', render: (_, p: any) => p.employee.personnelNumber, width: 90 },
              { title: 'Сотрудник', render: (_, p: any) => <Link to={`/employees/${p.employeeId}?tab=briefings`}>{p.fullName}</Link> },
              { title: 'Подразделение', render: (_, p: any) => p.employee.unit.name },
              { title: 'Должность', render: (_, p: any) => p.employee.position.name },
              { title: 'Результат', render: (_, p: any) => <StatusTag map={RESULT} value={p.result} /> },
              { title: 'Подтверждение', render: (_, p: any) => (p.confirmed ? <span title={p.confirmationNote ?? ''}>{CONFIRM_TEXT[p.confirmationMethod]}, {fmtDateTime(p.confirmedAt)}</span> : p.result === 'COMPLETED' && b.briefingType.requiresConfirmation ? <Tag color="gold">не зафиксировано</Tag> : '') },
              { title: 'Следующий', render: (_, p: any) => fmtDate(p.nextDueDate) },
            ]} />
        </Card>
      )}
      <Card size="small" title="Документы (сканы журналов, подтверждения)" style={{ marginTop: 12 }}><Attachments entityType="briefing" entityId={b.id} /></Card>
      <Modal open={confirmOpen} title="Фиксация подтверждения проведения" onOk={submitConfirm} onCancel={() => setConfirmOpen(false)} okText="Зафиксировать" destroyOnHidden>
        <p className="muted">Отмечается факт подтверждения, имеющийся у организации (подпись в журнале, скан и т.п.). Система не формирует подписи работников.</p>
        <Form form={cform} layout="vertical">
          <Form.Item name="method" label="Способ подтверждения" rules={[{ required: true }]}><Select options={CONFIRM_METHODS} /></Form.Item>
          <Form.Item name="note" label="Примечание (например, № страницы журнала)"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
