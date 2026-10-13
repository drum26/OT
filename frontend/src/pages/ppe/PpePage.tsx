import { App, Button, Card, DatePicker, Dropdown, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { MoreOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import dayjs from 'dayjs';
import { api, errorText, qs, Paged } from '../../api/client';
import { usePpeItems } from '../../api/refs';
import { useAuth } from '../../auth/AuthContext';
import { ExportButton, PageHeader, StatusTag } from '../../components/Common';
import { PositionSelect, UnitSelect } from '../../components/Selects';
import { fmtDate, ISSUE_STATUS, PPE_STATUS, toApiDate, toDayjs } from '../../utils/format';
import { useUrlFilters } from '../../utils/useUrlFilters';
import { ConfirmReceiptModal, IssueModal, ReplacementDateModal, ReturnModal } from './PpeModals';
import { PpeItemsTab, PpeStandardsTab } from './PpeRefs';

function ItemSelect(props: any) {
  const { data = [] } = usePpeItems();
  return <Select allowClear showSearch optionFilterProp="label" placeholder="СИЗ" style={{ minWidth: 220 }} options={data.map((i) => ({ value: i.id, label: i.name }))} {...props} />;
}

function NeedsTab() {
  const [f, setF] = useUrlFilters<any>(['unitIds', 'statuses']);
  const { can } = useAuth();
  const [issue, setIssue] = useState<any>(null);
  const params = { unitIds: f.unitIds, positionId: f.positionId, ppeItemId: f.ppeItemId, statuses: f.statuses ?? ['NOT_PROVIDED', 'PARTIAL', 'REPLACEMENT_OVERDUE', 'AWAITING_CONFIRMATION', 'REPLACEMENT_DUE'] };
  const { data, isFetching, refetch } = useQuery({ queryKey: ['ppe-needs', params], queryFn: () => api.get('/ppe/needs', { params: qs(params) }).then((r) => r.data as any[]) });
  return (
    <>
      <div className="filters">
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <PositionSelect value={f.positionId} onChange={(v) => setF({ positionId: v })} />
        <ItemSelect value={f.ppeItemId} onChange={(v: string) => setF({ ppeItemId: v })} />
        <Select mode="multiple" style={{ minWidth: 320 }} value={params.statuses} onChange={(v) => setF({ statuses: v })} options={Object.entries(PPE_STATUS).map(([value, s]) => ({ value, label: s.text }))} />
        <ExportButton url="/ppe/needs/export" params={params} name="Потребность в СИЗ" />
      </div>
      <Table size="small" loading={isFetching} dataSource={data} rowKey={(r) => `${r.employeeId}|${r.ppeItemId}`} pagination={{ pageSize: 50, showSizeChanger: true, showTotal: (t) => `Записей: ${t}` }}
        rowClassName={(r) => (['NOT_PROVIDED', 'REPLACEMENT_OVERDUE'].includes(r.status) ? 'row-overdue' : '')}
        columns={[
          { title: 'Таб. №', dataIndex: 'personnelNumber', width: 90 },
          { title: 'Сотрудник', render: (_, r) => <Link to={`/employees/${r.employeeId}?tab=ppe`}>{r.fullName}</Link> },
          { title: 'Подразделение', dataIndex: 'unitName' }, { title: 'Должность', dataIndex: 'positionName' },
          { title: 'СИЗ', dataIndex: 'itemName' },
          { title: 'Норма', render: (_, r) => (r.standardId ? `${r.normQty} ${r.unit}` : '—') },
          { title: 'Выдано / подтв.', render: (_, r) => `${r.issuedQty} / ${r.confirmedQty}` },
          { title: 'Требуется', dataIndex: 'toIssueQty', align: 'right', render: (v) => (v ? <b>{v}</b> : 0) },
          { title: 'Последняя выдача', render: (_, r) => fmtDate(r.lastIssueDate) },
          { title: 'Плановая замена', render: (_, r) => fmtDate(r.nextReplacementDate) },
          { title: 'Статус', render: (_, r) => <StatusTag map={PPE_STATUS} value={r.status} /> },
          { title: '', render: (_, r) => can('ppe.issue') && r.toIssueQty > 0 && <Button size="small" onClick={() => setIssue(r)}>Выдать</Button> },
        ]} />
      <IssueModal open={!!issue} employeeId={issue?.employeeId} employeeLabel={issue?.fullName} itemId={issue?.ppeItemId} onClose={(c) => { setIssue(null); if (c) refetch(); }} />
    </>
  );
}

function IssuesTab() {
  const [f, setF] = useUrlFilters<any>(['unitIds']);
  const { can } = useAuth();
  const [newIssue, setNewIssue] = useState(false);
  const [ret, setRet] = useState<any>(null);
  const [conf, setConf] = useState<any>(null);
  const [repl, setRepl] = useState<any>(null);
  const params = { pageSize: 25, ...f, tab: undefined };
  const { data, isFetching, refetch } = useQuery({ queryKey: ['ppe-issues', params], queryFn: () => api.get<Paged<any>>('/ppe/issues', { params: qs(params) }).then((r) => r.data), placeholderData: (p) => p });
  const done = (c?: boolean) => { setNewIssue(false); setRet(null); setConf(null); setRepl(null); if (c) refetch(); };
  return (
    <>
      <div className="filters">
        <Input.Search allowClear placeholder="Сотрудник или СИЗ" defaultValue={f.search} onSearch={(v) => setF({ search: v })} style={{ width: 240 }} />
        <UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} />
        <ItemSelect value={f.ppeItemId} onChange={(v: string) => setF({ ppeItemId: v })} />
        <Select allowClear placeholder="Статус" value={f.status} onChange={(v) => setF({ status: v })} style={{ width: 200 }}
          options={[{ value: 'OPEN', label: 'Числится (открытые)' }, ...Object.entries(ISSUE_STATUS).map(([value, s]) => ({ value, label: s.text }))]} />
        <Select allowClear placeholder="Получение" value={f.confirmed} onChange={(v) => setF({ confirmed: v })} style={{ width: 180 }} options={[{ value: 'true', label: 'Подтверждено' }, { value: 'false', label: 'Не подтверждено' }]} />
        <Select allowClear placeholder="Замена" value={f.replacement} onChange={(v) => setF({ replacement: v })} style={{ width: 180 }} options={[{ value: 'overdue', label: 'Просрочена' }, { value: 'due', label: 'Приближается' }]} />
        <DatePicker.RangePicker format="DD.MM.YYYY" value={[toDayjs(f.dateFrom), toDayjs(f.dateTo)]} onChange={(v) => setF({ dateFrom: toApiDate(v?.[0]) ?? undefined, dateTo: toApiDate(v?.[1]) ?? undefined })} />
        <ExportButton url="/ppe/issues/export" params={params} name="Выдача СИЗ" />
        {can('ppe.issue') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setNewIssue(true)}>Выдать СИЗ</Button>}
      </div>
      <Table size="small" rowKey="id" loading={isFetching} dataSource={data?.items}
        onChange={(p) => setF({ page: p.current, pageSize: p.pageSize })}
        pagination={{ current: Number(f.page ?? 1), pageSize: Number(f.pageSize ?? 25), total: data?.total, showSizeChanger: true, showTotal: (t) => `Всего: ${t}` }}
        columns={[
          { title: 'Дата', render: (_, r) => fmtDate(r.issueDate), width: 100 },
          { title: 'Сотрудник', render: (_, r) => <Link to={`/employees/${r.employeeId}?tab=ppe`}>{r.employeeName}</Link> },
          { title: 'СИЗ', render: (_, r) => r.ppeItem.name }, { title: 'Размер', dataIndex: 'size' },
          { title: 'Кол-во', render: (_, r) => `${r.activeQty}/${r.quantity}` },
          { title: 'Плановая замена', render: (_, r) => fmtDate(r.plannedReplacementDate) },
          { title: 'Получение', render: (_, r) => (r.receiptConfirmed ? <Tag color="green">подтверждено</Tag> : <Tag color="gold">не подтверждено</Tag>) },
          { title: 'Статус', render: (_, r) => <StatusTag map={ISSUE_STATUS} value={r.status} /> },
          {
            title: '', render: (_, r) => can('ppe.issue') && ['ACTIVE', 'PARTIALLY_CLOSED'].includes(r.status) && (
              <Dropdown menu={{ items: [
                !r.receiptConfirmed && { key: 'c', label: 'Подтвердить получение', onClick: () => setConf(r) },
                { key: 'r', label: 'Возврат / списание / замена', onClick: () => setRet(r) },
                { key: 'd', label: 'Скорректировать дату замены', onClick: () => setRepl(r) },
              ].filter(Boolean) as any }}><Button size="small" icon={<MoreOutlined />} /></Dropdown>
            ),
          },
        ]} />
      <IssueModal open={newIssue} onClose={done} />
      <ReturnModal issue={ret} onClose={done} />
      <ConfirmReceiptModal issue={conf} onClose={done} />
      <ReplacementDateModal issue={repl} onClose={done} />
    </>
  );
}

function StockTab() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [open, setOpen] = useState(false);
  const stock = useQuery({ queryKey: ['ppe-stock'], queryFn: () => api.get('/ppe/stock').then((r) => r.data as any[]) });
  const moves = useQuery({ queryKey: ['ppe-moves'], queryFn: () => api.get('/ppe/stock/movements').then((r) => r.data as any[]) });
  const save = async () => {
    const v = await form.validateFields();
    try {
      await api.post('/ppe/stock', { ...v, movementDate: toApiDate(v.movementDate) });
      message.success('Операция сохранена');
      setOpen(false);
      stock.refetch();
      moves.refetch();
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const MT: Record<string, string> = { RECEIPT: 'Поступление', ISSUE: 'Выдача', RETURN: 'Возврат', WRITE_OFF: 'Списание', ADJUSTMENT: 'Корректировка' };
  return (
    <>
      {can('ppe.stock') && <Button type="primary" icon={<PlusOutlined />} style={{ marginBottom: 12 }} onClick={() => { form.resetFields(); form.setFieldsValue({ movementType: 'RECEIPT', movementDate: dayjs(), quantity: 1 }); setOpen(true); }}>Складская операция</Button>}
      <Card size="small" title="Остатки">
        <Table size="small" rowKey={(r) => `${r.ppeItemId}|${r.size}`} loading={stock.isFetching} dataSource={stock.data} pagination={{ pageSize: 30 }}
          columns={[{ title: 'СИЗ', dataIndex: 'itemName' }, { title: 'Категория', dataIndex: 'category' }, { title: 'Размер', dataIndex: 'size' },
            { title: 'Остаток', dataIndex: 'quantity', align: 'right', render: (v, r) => <span style={{ color: v < 0 ? '#cf1322' : undefined }}>{v} {r.unit}</span> }]} />
      </Card>
      <Card size="small" title="Последние движения" style={{ marginTop: 12 }}>
        <Table size="small" rowKey="id" loading={moves.isFetching} dataSource={moves.data} pagination={{ pageSize: 20 }}
          columns={[{ title: 'Дата', render: (_, r) => fmtDate(r.movementDate) }, { title: 'Операция', render: (_, r) => MT[r.movementType] }, { title: 'СИЗ', render: (_, r) => r.ppeItem.name },
            { title: 'Размер', dataIndex: 'size' }, { title: 'Кол-во', dataIndex: 'quantity', align: 'right' }, { title: 'Документ', dataIndex: 'document' }, { title: 'Примечание', dataIndex: 'note' }]} />
      </Card>
      <Modal open={open} title="Складская операция" onOk={save} onCancel={() => setOpen(false)} okText="Сохранить" destroyOnHidden>
        <Form form={form} layout="vertical">
          <Form.Item name="movementType" label="Операция"><Select options={[{ value: 'RECEIPT', label: 'Поступление' }, { value: 'WRITE_OFF', label: 'Списание со склада' }, { value: 'ADJUSTMENT', label: 'Корректировка (±)' }]} /></Form.Item>
          <Form.Item name="ppeItemId" label="СИЗ" rules={[{ required: true }]}><ItemSelect /></Form.Item>
          <Form.Item name="size" label="Размер"><Input /></Form.Item>
          <Form.Item name="quantity" label="Количество" rules={[{ required: true }]}><InputNumber /></Form.Item>
          <Form.Item name="movementDate" label="Дата" rules={[{ required: true }]}><DatePicker format="DD.MM.YYYY" /></Form.Item>
          <Form.Item name="document" label="Документ (накладная, акт)"><Input /></Form.Item>
          <Form.Item name="note" label="Примечание"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function PurchaseTab() {
  const [f, setF] = useUrlFilters<any>(['unitIds']);
  const params = { unitIds: f.unitIds };
  const { data, isFetching } = useQuery({ queryKey: ['ppe-purchase', params], queryFn: () => api.get('/ppe/needs/purchase', { params: qs(params) }).then((r) => r.data) });
  return (
    <>
      <div className="filters"><UnitSelect multiple value={f.unitIds} onChange={(v) => setF({ unitIds: v as string[] })} /></div>
      <Table size="small" rowKey="itemName" loading={isFetching} dataSource={data?.rows} pagination={false}
        columns={(data?.columns ?? []).map((c: any) => ({ title: c.title, dataIndex: c.key, align: c.type === 'number' ? 'right' : undefined }))} />
      <p className="muted" style={{ marginTop: 8 }}>Расчёт: требуется выдать по действующим нормам (недостача + просроченная плановая замена) за вычетом складского остатка.</p>
    </>
  );
}

export function PpePage() {
  const [f, setF] = useUrlFilters<any>();
  const { can } = useAuth();
  const tabs = [
    { key: 'needs', label: 'Потребность', children: <NeedsTab /> },
    { key: 'issues', label: 'Выдача и движение', children: <IssuesTab /> },
    { key: 'stock', label: 'Склад', children: <StockTab /> },
    { key: 'purchase', label: 'Потребность в закупке', children: <PurchaseTab /> },
    { key: 'items', label: 'Справочник СИЗ', children: <PpeItemsTab /> },
    { key: 'standards', label: 'Нормы выдачи', children: <PpeStandardsTab /> },
  ];
  void can;
  return (
    <>
      <PageHeader title="Средства индивидуальной защиты" extra={<Space />} />
      <Tabs activeKey={f.tab ?? 'needs'} onChange={(k) => setF({ tab: k === 'needs' ? undefined : k } as any)} destroyOnHidden items={tabs} />
    </>
  );
}
