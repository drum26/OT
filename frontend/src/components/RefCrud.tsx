import { App, Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Table, TableColumnsType } from 'antd';
import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ReactNode, useState } from 'react';
import { api, errorText } from '../api/client';
import { toApiDate, toDayjs } from '../utils/format';
import { PositionSelect, UnitSelect } from './Selects';

export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'number' | 'bool' | 'date' | 'select' | 'multiselect' | 'unit' | 'position' | 'custom';
  required?: boolean;
  options?: { value: any; label: string }[];
  rules?: any[];
  extra?: string;
  render?: () => ReactNode;
  /** показывать только при создании */
  createOnly?: boolean;
}

/** Универсальная таблица справочника с формой создания/редактирования. Удаление не предусмотрено — архивирование через статус. */
export function RefCrud({ endpoint, queryKey, columns, fields, canEdit, title, defaults, extra, toApi, filter }: {
  endpoint: string; queryKey: string; columns: TableColumnsType<any>; fields: Field[]; canEdit: boolean; title?: string;
  defaults?: Record<string, any>; extra?: ReactNode; toApi?: (v: any, rec?: any) => any; filter?: (r: any) => boolean;
}) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  const [form] = Form.useForm();
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const { data, isFetching } = useQuery({ queryKey: [queryKey], queryFn: () => api.get(endpoint).then((r) => r.data as any[]) });
  const open = (rec?: any) => {
    form.resetFields();
    const v: any = { ...(defaults ?? {}), ...(rec ?? {}) };
    for (const f of fields) if (f.type === 'date') v[f.name] = toDayjs(v[f.name]);
    form.setFieldsValue(v);
    setEditing(rec ?? {});
  };
  const save = async () => {
    const v = await form.validateFields();
    for (const f of fields) {
      if (f.type === 'date') v[f.name] = toApiDate(v[f.name]);
      if (f.type === 'number' && v[f.name] === undefined) v[f.name] = null;
    }
    const body = toApi ? toApi(v, editing) : v;
    try {
      if (editing?.id) await api.patch(`${endpoint}/${editing.id}`, body);
      else await api.post(endpoint, body);
      message.success('Сохранено');
      setEditing(null);
      qc.invalidateQueries({ queryKey: [queryKey] });
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const rows = (data ?? []).filter((r) => (filter ? filter(r) : true)).filter((r) => !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  const input = (f: Field) => {
    switch (f.type) {
      case 'textarea': return <Input.TextArea rows={3} />;
      case 'number': return <InputNumber style={{ width: 160 }} />;
      case 'date': return <DatePicker format="DD.MM.YYYY" />;
      case 'select': return <Select allowClear options={f.options} showSearch optionFilterProp="label" />;
      case 'multiselect': return <Select mode="multiple" options={f.options} />;
      case 'unit': return <UnitSelect />;
      case 'position': return <PositionSelect />;
      case 'custom': return f.render!();
      default: return <Input />;
    }
  };
  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search allowClear placeholder="Поиск" onSearch={setSearch} style={{ width: 260 }} />
        {canEdit && <Button type="primary" icon={<PlusOutlined />} onClick={() => open()}>Добавить</Button>}
        {extra}
      </Space>
      <Table size="small" rowKey="id" loading={isFetching} dataSource={rows} pagination={{ pageSize: 50, showTotal: (t) => `Записей: ${t}` }}
        rowClassName={(r) => (r.isActive === false || r.status === 'ARCHIVED' ? 'muted' : '')}
        columns={[...columns, ...(canEdit ? [{ title: '', width: 50, render: (_: any, r: any) => <Button size="small" icon={<EditOutlined />} onClick={() => open(r)} /> }] : [])]} />
      <Modal open={!!editing} title={`${editing?.id ? 'Редактирование' : 'Добавление'}${title ? `: ${title}` : ''}`} onOk={save} okText="Сохранить" onCancel={() => setEditing(null)} width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          {fields.filter((f) => !(f.createOnly && editing?.id)).map((f) =>
            f.type === 'bool'
              ? <Form.Item key={f.name} name={f.name} valuePropName="checked" extra={f.extra}><Checkbox>{f.label}</Checkbox></Form.Item>
              : <Form.Item key={f.name} name={f.name} label={f.label} extra={f.extra} rules={[...(f.required ? [{ required: true, message: 'Обязательное поле' }] : []), ...(f.rules ?? [])]}>{input(f)}</Form.Item>,
          )}
        </Form>
      </Modal>
    </>
  );
}

export const activeColumn = { title: 'Статус', width: 100, render: (_: any, r: any) => (r.isActive === false ? 'архив' : 'действует') };
