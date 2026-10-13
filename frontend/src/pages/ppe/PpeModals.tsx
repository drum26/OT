import { App, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Radio, Select } from 'antd';
import { useEffect } from 'react';
import dayjs from 'dayjs';
import { api, errorText } from '../../api/client';
import { usePpeItems } from '../../api/refs';
import { EmployeeSelect } from '../../components/Selects';
import { CONFIRM_METHODS, toApiDate } from '../../utils/format';

/** Выдача СИЗ. Отметка о получении ставится только при фактическом подтверждении. */
export function IssueModal({ open, onClose, employeeId, itemId, employeeLabel }: { open: boolean; onClose: (changed?: boolean) => void; employeeId?: string; itemId?: string; employeeLabel?: string }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { data: items = [] } = usePpeItems(open);
  const confirmed = Form.useWatch('receiptConfirmed', form);
  const ppeItemId = Form.useWatch('ppeItemId', form);
  const item = items.find((i) => i.id === ppeItemId);
  useEffect(() => {
    if (open) form.setFieldsValue({ employeeId, ppeItemId: itemId, quantity: 1, issueDate: dayjs(), fromStock: true, receiptConfirmed: false, size: undefined, wearMonths: undefined, basis: undefined, note: undefined });
  }, [open, employeeId, itemId, form]);
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post('/ppe/issues', { ...v, issueDate: toApiDate(v.issueDate) });
      message.success('Выдача зарегистрирована');
      onClose(true);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={open} title="Выдача СИЗ" onOk={submit} okText="Зарегистрировать" onCancel={() => onClose()} width={600} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="employeeId" label="Сотрудник" rules={[{ required: true }]}>
          <EmployeeSelect disabled={!!employeeId} initialOptions={employeeId && employeeLabel ? [{ value: employeeId, label: employeeLabel }] : []} />
        </Form.Item>
        <Form.Item name="ppeItemId" label="СИЗ" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={items.filter((i) => i.status === 'ACTIVE').map((i) => ({ value: i.id, label: `${i.name}${i.model ? ` (${i.model})` : ''}` }))} />
        </Form.Item>
        <Form.Item name="quantity" label="Количество" rules={[{ required: true }]}><InputNumber min={1} max={1000} /></Form.Item>
        <Form.Item name="size" label="Размер / характеристики" rules={[{ required: item && item.sizeType !== 'NONE', message: 'Укажите размер' }]}><Input /></Form.Item>
        <Form.Item name="issueDate" label="Дата выдачи" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
        <Form.Item name="wearMonths" label="Срок носки, мес." extra="Если не указан — берётся из нормы для должности или справочника. Пусто для СИЗ «до износа».">
          <InputNumber min={1} max={240} />
        </Form.Item>
        <Form.Item name="basis" label="Основание операции"><Input placeholder="По умолчанию — основание нормы" /></Form.Item>
        <Form.Item name="fromStock" valuePropName="checked"><Checkbox>Списать с остатка склада</Checkbox></Form.Item>
        <Form.Item name="receiptConfirmed" valuePropName="checked"><Checkbox>Получение подтверждено сотрудником</Checkbox></Form.Item>
        {confirmed && <Form.Item name="receiptMethod" label="Способ подтверждения" rules={[{ required: true }]}><Select options={CONFIRM_METHODS} /></Form.Item>}
        <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}

export function ReturnModal({ issue, onClose }: { issue: any | null; onClose: (changed?: boolean) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const type = Form.useWatch('operationType', form);
  useEffect(() => { if (issue) form.setFieldsValue({ operationType: 'RETURN', quantity: issue.activeQty, operationDate: dayjs(), toStock: false, newFromStock: true, reason: undefined }); }, [issue, form]);
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post(`/ppe/issues/${issue.id}/return`, { ...v, operationDate: toApiDate(v.operationDate) });
      message.success('Операция зарегистрирована');
      onClose(true);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={!!issue} title={`Возврат / списание / замена: ${issue?.ppeItem?.name ?? ''}`} onOk={submit} okText="Зарегистрировать" onCancel={() => onClose()} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="operationType" label="Операция">
          <Radio.Group options={[{ value: 'RETURN', label: 'Возврат' }, { value: 'WRITE_OFF', label: 'Списание' }, { value: 'REPLACEMENT', label: 'Замена (новая выдача)' }]} />
        </Form.Item>
        <Form.Item name="quantity" label={`Количество (числится: ${issue?.activeQty})`} rules={[{ required: true }]}><InputNumber min={1} max={issue?.activeQty} /></Form.Item>
        <Form.Item name="operationDate" label="Дата" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
        <Form.Item name="reason" label="Основание" rules={[{ required: true, min: 3 }]}><Input.TextArea rows={2} placeholder="Например: износ, увольнение, досрочная замена" /></Form.Item>
        {type === 'RETURN' && <Form.Item name="toStock" valuePropName="checked"><Checkbox>Вернуть на склад (пригодно к использованию)</Checkbox></Form.Item>}
        {type === 'REPLACEMENT' && <>
          <Form.Item name="newSize" label="Размер новой выдачи"><Input placeholder={issue?.size ?? ''} /></Form.Item>
          <Form.Item name="newFromStock" valuePropName="checked"><Checkbox>Списать новую выдачу с остатка склада</Checkbox></Form.Item>
          <Form.Item name="newReceiptConfirmed" valuePropName="checked"><Checkbox>Получение новой выдачи подтверждено</Checkbox></Form.Item>
          <Form.Item noStyle shouldUpdate>{({ getFieldValue }) => getFieldValue('newReceiptConfirmed') && (
            <Form.Item name="newReceiptMethod" label="Способ подтверждения" rules={[{ required: true }]}><Select options={CONFIRM_METHODS} /></Form.Item>
          )}</Form.Item>
        </>}
      </Form>
    </Modal>
  );
}

export function ConfirmReceiptModal({ issue, onClose }: { issue: any | null; onClose: (changed?: boolean) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post(`/ppe/issues/${issue.id}/confirm`, v);
      message.success('Получение подтверждено');
      onClose(true);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={!!issue} title="Подтверждение фактического получения СИЗ" onOk={submit} okText="Подтвердить" onCancel={() => onClose()} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ method: 'PAPER_JOURNAL_SIGNATURE' }}>
        <Form.Item name="method" label="Способ подтверждения" rules={[{ required: true }]}><Select options={CONFIRM_METHODS} /></Form.Item>
        <Form.Item name="note" label="Примечание"><Input /></Form.Item>
      </Form>
      <p className="muted">Подтверждение фиксирует факт получения, удостоверенный сотрудником (например, подписью в личной карточке). Система не создаёт подписи.</p>
    </Modal>
  );
}

export function ReplacementDateModal({ issue, onClose }: { issue: any | null; onClose: (changed?: boolean) => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  useEffect(() => { if (issue) form.setFieldsValue({ date: issue.plannedReplacementDate ? dayjs(issue.plannedReplacementDate.slice(0, 10)) : null, basis: undefined }); }, [issue, form]);
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post(`/ppe/issues/${issue.id}/replacement-date`, { date: toApiDate(v.date), basis: v.basis });
      message.success('Дата замены скорректирована');
      onClose(true);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={!!issue} title="Корректировка плановой даты замены" onOk={submit} okText="Сохранить" onCancel={() => onClose()} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="date" label="Плановая дата замены (пусто — по износу / условию)"><DatePicker format="DD.MM.YYYY" allowClear /></Form.Item>
        <Form.Item name="basis" label="Основание корректировки" rules={[{ required: true, min: 3 }]}><Input.TextArea rows={2} placeholder="Сезонность, фактический износ, досрочная замена…" /></Form.Item>
      </Form>
    </Modal>
  );
}
