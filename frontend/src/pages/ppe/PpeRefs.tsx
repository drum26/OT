import { Alert, App, Button, Modal, Space, Table, Upload } from 'antd';
import { DownloadOutlined, UploadOutlined } from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText } from '../../api/client';
import { usePpeItems } from '../../api/refs';
import { useAuth } from '../../auth/AuthContext';
import { RefCrud } from '../../components/RefCrud';
import { download } from '../../utils/files';
import { fmtDate } from '../../utils/format';

const SIZE_TYPES = [
  { value: 'NONE', label: 'Без размера' }, { value: 'CLOTHING', label: 'Одежда' }, { value: 'SHOES', label: 'Обувь' }, { value: 'HEAD', label: 'Головной убор' },
  { value: 'HANDS', label: 'Руки' }, { value: 'RESPIRATORY', label: 'Органы дыхания' }, { value: 'OTHER', label: 'Иное' },
];

/** Загрузка справочника/норм из Excel: сначала проверка, затем загрузка целиком */
function ImportButton({ kind }: { kind: 'items' | 'standards' }) {
  const { message, modal } = App.useApp();
  const qc = useQueryClient();
  const [res, setRes] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);
  const send = async (f: File, dryRun: boolean) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('dryRun', String(dryRun));
    return (await api.post(`/ppe/${kind}/import`, fd)).data;
  };
  return (
    <>
      <Button icon={<DownloadOutlined />} onClick={() => download('/ppe/import/template', { kind }, 'Шаблон.xlsx')}>Шаблон</Button>
      <Upload showUploadList={false} accept=".xlsx,.csv" beforeUpload={(f) => { setFile(f); send(f, true).then(setRes).catch((e) => message.error(errorText(e))); return false; }}>
        <Button icon={<UploadOutlined />}>Загрузить из Excel</Button>
      </Upload>
      <Modal open={!!res} title="Проверка файла" onCancel={() => setRes(null)} width={800}
        okText="Загрузить" okButtonProps={{ disabled: !!res?.errors?.length || !(res?.toCreate + res?.toUpdate) }}
        onOk={() => modal.confirm({
          title: 'Загрузить данные?', content: `Создать: ${res.toCreate}, обновить: ${res.toUpdate}`,
          onOk: async () => { try { await send(file!, false); message.success('Загружено'); setRes(null); qc.invalidateQueries(); } catch (e) { message.error(errorText(e)); } },
        })}>
        {res && <>
          <p>Строк: {res.totalRows}. Будет создано: {res.toCreate}, обновлено: {res.toUpdate}.</p>
          {res.errors.length > 0 && <Alert type="error" showIcon message={`Ошибки в ${res.errorRows} строках — исправьте файл (загрузка выполняется целиком)`} style={{ marginBottom: 8 }} />}
          {res.errors.length > 0 && <Table size="small" rowKey={(_, i) => String(i)} dataSource={res.errors} pagination={{ pageSize: 8 }}
            columns={[{ title: 'Строка', dataIndex: 'rowNumber' }, { title: 'Поле', dataIndex: 'field' }, { title: 'Значение', dataIndex: 'value' }, { title: 'Ошибка', dataIndex: 'message' }]} />}
        </>}
      </Modal>
    </>
  );
}

export function PpeItemsTab() {
  const { can } = useAuth();
  return (
    <RefCrud endpoint="/ppe/items" queryKey="ppe-items" canEdit={can('ppe.norms.manage')} title="СИЗ" defaults={{ unit: 'шт.', sizeType: 'NONE', status: 'ACTIVE' }}
      extra={can('ppe.norms.manage') && <Space><ImportButton kind="items" /></Space>}
      columns={[
        { title: 'Код', dataIndex: 'code', width: 90 }, { title: 'Наименование', dataIndex: 'name' }, { title: 'Категория', dataIndex: 'category' },
        { title: 'Модель', dataIndex: 'model' }, { title: 'Ед.', dataIndex: 'unit', width: 60 },
        { title: 'Размер', dataIndex: 'sizeType', render: (v) => SIZE_TYPES.find((s) => s.value === v)?.label },
        { title: 'Срок носки, мес.', dataIndex: 'defaultWearMonths', width: 110 }, { title: 'Статус', dataIndex: 'status', render: (v) => (v === 'ACTIVE' ? 'действует' : 'архив') },
      ]}
      fields={[
        { name: 'code', label: 'Код' }, { name: 'name', label: 'Наименование', required: true }, { name: 'category', label: 'Категория', required: true },
        { name: 'model', label: 'Тип / модель' }, { name: 'unit', label: 'Единица измерения', required: true },
        { name: 'sizeType', label: 'Размер / характеристика', type: 'select', options: SIZE_TYPES },
        { name: 'characteristics', label: 'Характеристики', type: 'textarea' },
        { name: 'defaultWearMonths', label: 'Срок носки по умолчанию, мес.', type: 'number', extra: 'Пусто — срок не календарный (до износа и т.п.)' },
        { name: 'basis', label: 'Основание применения', type: 'textarea' },
        { name: 'status', label: 'Статус', type: 'select', options: [{ value: 'ACTIVE', label: 'Действует' }, { value: 'ARCHIVED', label: 'Архив' }] },
      ]} />
  );
}

export function PpeStandardsTab() {
  const { can } = useAuth();
  const { data: items = [] } = usePpeItems();
  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Нормы вносятся по утверждённым документам с указанием основания и периода действия. Система не содержит предустановленных нормативов." />
      <RefCrud endpoint="/ppe/standards" queryKey="ppe-standards" canEdit={can('ppe.norms.manage')} title="Норма" defaults={{ quantity: 1, unit: 'шт.' }}
        extra={can('ppe.norms.manage') && <ImportButton kind="standards" />}
        toApi={(v) => ({ ...v, wearMonths: v.wearMonths ?? null })}
        columns={[
          { title: 'Должность', render: (_, r) => r.position.name }, { title: 'СИЗ', render: (_, r) => r.ppeItem.name },
          { title: 'Кол-во', render: (_, r) => `${r.quantity} ${r.unit}` }, { title: 'Срок носки', render: (_, r) => (r.wearMonths ? `${r.wearMonths} мес.` : r.wearCondition ?? '') },
          { title: 'Основание', dataIndex: 'basis', ellipsis: true }, { title: 'Действует', render: (_, r) => `${fmtDate(r.validFrom)} — ${fmtDate(r.validTo) || '…'}` },
        ]}
        fields={[
          { name: 'positionId', label: 'Должность / профессия', type: 'position', required: true },
          { name: 'ppeItemId', label: 'СИЗ', type: 'select', required: true, options: items.map((i) => ({ value: i.id, label: i.name })) },
          { name: 'quantity', label: 'Количество', type: 'number', required: true }, { name: 'unit', label: 'Единица измерения', required: true },
          { name: 'wearMonths', label: 'Срок носки, мес.', type: 'number', extra: 'Пусто — если замена не по календарю' },
          { name: 'wearCondition', label: 'Условие замены (если срок не календарный)', extra: 'Например: «до износа», «дежурный»' },
          { name: 'basis', label: 'Основание нормы', type: 'textarea', required: true },
          { name: 'validFrom', label: 'Дата начала действия', type: 'date', required: true }, { name: 'validTo', label: 'Дата окончания действия', type: 'date' },
          { name: 'note', label: 'Примечание', type: 'textarea' },
        ]} />
    </>
  );
}
