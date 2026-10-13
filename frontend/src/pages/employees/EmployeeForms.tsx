import { App, DatePicker, Form, Input, Modal, Select } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api, errorText } from '../../api/client';
import { EmployeeSelect, PositionSelect, UnitSelect } from '../../components/Selects';
import { fio, toApiDate, toDayjs } from '../../utils/format';
import dayjs from 'dayjs';

const NAME_RULE = { pattern: /^[\p{L}][\p{L}\-' ]{0,99}$/u, message: 'Допустимы буквы, дефис, апостроф' };
const dateRule = { required: true, message: 'Укажите дату' };

/** Приём (создание) и редактирование кадровых данных */
export function EmployeeFormModal({ open, onClose, employee }: { open: boolean; onClose: (id?: string) => void; employee?: any }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const qc = useQueryClient();
  useEffect(() => {
    if (open) form.setFieldsValue(employee ? { ...employee, hireDate: toDayjs(employee.hireDate), reason: undefined } : { hireDate: dayjs() });
  }, [open, employee, form]);
  const submit = async () => {
    const v = await form.validateFields();
    const body = { ...v, hireDate: toApiDate(v.hireDate) };
    try {
      const r = employee ? await api.patch(`/employees/${employee.id}`, body) : await api.post('/employees', body);
      message.success(employee ? 'Изменения сохранены' : 'Сотрудник принят');
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['employee'] });
      onClose(r.data.id);
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={open} title={employee ? 'Редактирование кадровых данных' : 'Приём сотрудника'} onOk={submit} okText="Сохранить" onCancel={() => onClose()} width={640} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="personnelNumber" label="Табельный номер" rules={[{ required: true }, { pattern: /^[\p{L}\d][\p{L}\d\-/._]{0,49}$/u, message: 'Недопустимые символы' }]}><Input /></Form.Item>
        <Form.Item name="lastName" label="Фамилия" rules={[{ required: true }, NAME_RULE]}><Input /></Form.Item>
        <Form.Item name="firstName" label="Имя" rules={[{ required: true }, NAME_RULE]}><Input /></Form.Item>
        <Form.Item name="middleName" label="Отчество" rules={[NAME_RULE]}><Input /></Form.Item>
        {!employee && <>
          <Form.Item name="unitId" label="Подразделение" rules={[{ required: true }]}><UnitSelect /></Form.Item>
          <Form.Item name="positionId" label="Должность / профессия" rules={[{ required: true }]}><PositionSelect /></Form.Item>
          <Form.Item name="orderNumber" label="Номер приказа о приёме"><Input /></Form.Item>
        </>}
        <Form.Item name="hireDate" label="Дата приёма" rules={[dateRule]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
        <Form.Item name="managerId" label="Непосредственный руководитель">
          <EmployeeSelect initialOptions={employee?.manager ? [{ value: employee.manager.id, label: fio(employee.manager) }] : []} />
        </Form.Item>
        <Form.Item name="phone" label="Телефон (если необходим для работы)" rules={[{ pattern: /^[\d+\-() ]{3,30}$/, message: 'Неверный формат' }]}><Input /></Form.Item>
        <Form.Item name="email" label="Email (если необходим)" rules={[{ type: 'email', message: 'Неверный email' }]}><Input /></Form.Item>
        <Form.Item name="note" label="Примечание"><Input.TextArea rows={2} /></Form.Item>
        {employee && <Form.Item name="reason" label="Основание изменения"><Input /></Form.Item>}
      </Form>
    </Modal>
  );
}

type Op = 'transfer' | 'dismiss' | 'status' | 'rehire';
const TITLES: Record<Op, string> = { transfer: 'Перевод', dismiss: 'Увольнение', status: 'Изменение статуса', rehire: 'Повторный приём' };

/** Кадровые операции: перевод, увольнение, отсутствие, повторный приём (с записью в историю) */
export function HrOperationModal({ op, employee, onClose }: { op: Op | null; employee: any; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  useEffect(() => { if (op) form.resetFields(); }, [op, form]);
  const submit = async () => {
    const v = await form.validateFields();
    const body: any = { ...v };
    for (const k of ['effectiveDate', 'dismissalDate', 'hireDate']) if (v[k]) body[k] = toApiDate(v[k]);
    const run = async () => {
      try {
        await api.post(`/employees/${employee.id}/${op}`, body);
        message.success('Операция выполнена');
        qc.invalidateQueries({ queryKey: ['employee'] });
        qc.invalidateQueries({ queryKey: ['employees'] });
        onClose();
      } catch (e) {
        message.error(errorText(e));
      }
    };
    if (op === 'dismiss') {
      modal.confirm({ title: 'Уволить сотрудника?', content: 'История инструктажей, проверок знаний и выдачи СИЗ будет сохранена.', okText: 'Уволить', okButtonProps: { danger: true }, onOk: run });
    } else await run();
  };
  return (
    <Modal open={!!op} title={op ? `${TITLES[op]}: ${employee?.fullName}` : ''} onOk={submit} okText="Выполнить" onCancel={onClose} destroyOnHidden>
      <Form form={form} layout="vertical" initialValues={{ effectiveDate: dayjs(), dismissalDate: dayjs(), hireDate: dayjs(), status: employee?.status === 'ABSENT' ? 'ACTIVE' : 'ABSENT' }}>
        {op === 'transfer' && <>
          <Form.Item name="unitId" label="Новое подразделение"><UnitSelect placeholder={employee?.unit?.name} /></Form.Item>
          <Form.Item name="positionId" label="Новая должность"><PositionSelect placeholder={employee?.position?.name} /></Form.Item>
          <Form.Item name="effectiveDate" label="Дата перевода" rules={[dateRule]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
        </>}
        {op === 'dismiss' && <Form.Item name="dismissalDate" label="Дата увольнения" rules={[dateRule]}><DatePicker format="DD.MM.YYYY" /></Form.Item>}
        {op === 'status' && <>
          <Form.Item name="status" label="Статус"><Select options={[{ value: 'ACTIVE', label: 'Работает' }, { value: 'ABSENT', label: 'Временно отсутствует' }]} /></Form.Item>
          <Form.Item name="effectiveDate" label="С даты" rules={[dateRule]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
        </>}
        {op === 'rehire' && <>
          <Form.Item name="hireDate" label="Дата приёма" rules={[dateRule]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
          <Form.Item name="unitId" label="Подразделение" rules={[{ required: true }]}><UnitSelect /></Form.Item>
          <Form.Item name="positionId" label="Должность" rules={[{ required: true }]}><PositionSelect /></Form.Item>
        </>}
        {op !== 'status' && <Form.Item name="orderNumber" label="Номер приказа"><Input /></Form.Item>}
        <Form.Item name="reason" label="Основание / причина"><Input.TextArea rows={2} /></Form.Item>
      </Form>
    </Modal>
  );
}
