import { App, Checkbox, DatePicker, Form, Input, Modal, Select } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { api, errorText } from '../../api/client';
import { useDocuments } from '../../api/refs';
import { BriefingTypeSelect, EmployeeSelect } from '../../components/Selects';
import { CONFIRM_METHODS, toApiDate } from '../../utils/format';
import { GroupPicker } from '../shared/GroupPicker';

export function DocumentSelect(props: any) {
  const { data = [] } = useDocuments();
  return <Select allowClear showSearch optionFilterProp="label" placeholder="Инструкция / документ" {...props}
    options={data.filter((d) => d.isActive).map((d) => ({ value: d.id, label: [d.number, d.title, d.version && `ред. ${d.version}`].filter(Boolean).join(' ') }))} />;
}

/** Планирование (mode=plan) или регистрация уже проведённого инструктажа (mode=register) */
export function BriefingFormModal({ mode, open, onClose, initial }: { mode: 'plan' | 'register'; open: boolean; onClose: (id?: string) => void; initial?: { employeeIds?: string[]; typeId?: string } }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [labels, setLabels] = useState<Record<string, string>>({});
  const confirmAll = Form.useWatch('confirmAll', form);
  useEffect(() => {
    if (open) {
      form.resetFields();
      form.setFieldsValue({ briefingTypeId: initial?.typeId, employeeIds: initial?.employeeIds ?? [], date: mode === 'plan' ? dayjs().add(1, 'day') : dayjs() });
    }
  }, [open, initial, mode, form]);
  const submit = async () => {
    const v = await form.validateFields();
    try {
      let r;
      if (mode === 'plan') {
        r = await api.post('/briefings/plan', { briefingTypeId: v.briefingTypeId, plannedDate: toApiDate(v.date), topic: v.topic, reason: v.reason, documentId: v.documentId, responsibleEmployeeId: v.responsibleEmployeeId, note: v.note, employeeIds: v.employeeIds });
      } else {
        r = await api.post('/briefings/register', {
          briefingTypeId: v.briefingTypeId, conductedDate: toApiDate(v.date), topic: v.topic, reason: v.reason, documentId: v.documentId, responsibleEmployeeId: v.responsibleEmployeeId, note: v.note,
          participants: v.employeeIds.map((employeeId: string) => ({ employeeId, result: 'COMPLETED', confirmed: !!v.confirmAll, confirmationMethod: v.confirmAll ? v.confirmationMethod : undefined })),
        });
      }
      message.success(mode === 'plan' ? 'Инструктаж запланирован' : 'Инструктаж зарегистрирован');
      qc.invalidateQueries({ queryKey: ['briefings'] });
      qc.invalidateQueries({ queryKey: ['compliance'] });
      onClose(r.data.id);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={open} width={760} title={mode === 'plan' ? 'Планирование инструктажа' : 'Регистрация проведённого инструктажа'} onOk={submit} okText="Сохранить" onCancel={() => onClose()} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="briefingTypeId" label="Вид инструктажа" rules={[{ required: true }]}><BriefingTypeSelect /></Form.Item>
        <Form.Item name="date" label={mode === 'plan' ? 'Плановая дата' : 'Дата проведения'} rules={[{ required: true }]}>
          <DatePicker format="DD.MM.YYYY" disabledDate={mode === 'register' ? (d) => d.isAfter(dayjs(), 'day') : undefined} />
        </Form.Item>
        <Form.Item name="employeeIds" label="Сотрудники" rules={[{ required: true, type: 'array', min: 1, message: 'Выберите сотрудников' }]}>
          <GroupPicker labels={labels} setLabels={setLabels} />
        </Form.Item>
        <Form.Item name="responsibleEmployeeId" label="Ответственное лицо (проводящий)" rules={mode === 'register' ? [{ required: true }] : []}><EmployeeSelect /></Form.Item>
        <Form.Item name="topic" label="Тема"><Input /></Form.Item>
        <Form.Item name="reason" label="Основание проведения"><Input /></Form.Item>
        <Form.Item name="documentId" label="Инструкция / документ"><DocumentSelect /></Form.Item>
        <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} /></Form.Item>
        {mode === 'register' && <>
          <p className="muted">Всем участникам будет установлен результат «Прошёл». Отсутствовавших исключите из списка или отметьте в карточке инструктажа.</p>
          <Form.Item name="confirmAll" valuePropName="checked"><Checkbox>Проведение подтверждено всеми участниками</Checkbox></Form.Item>
          {confirmAll && <Form.Item name="confirmationMethod" label="Способ подтверждения" rules={[{ required: true }]}><Select options={CONFIRM_METHODS} /></Form.Item>}
        </>}
      </Form>
    </Modal>
  );
}
