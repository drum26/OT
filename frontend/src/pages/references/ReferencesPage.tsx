import { Alert, App, AutoComplete, Button, Form, Input, Modal, Select, Space, Table, Tabs, Tag } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, errorText } from '../../api/client';
import { useBriefingTypes, useCheckTypes, useCommissions, useUnits, usePositions, useWorkCategories } from '../../api/refs';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/Common';
import { activeColumn, Field, RefCrud } from '../../components/RefCrud';
import { EmployeeSelect } from '../../components/Selects';
import { fio, fmtDate, fmtDateTime } from '../../utils/format';
import { useUrlFilters } from '../../utils/useUrlFilters';

const ROLES = [{ value: 'CHAIR', label: 'Председатель' }, { value: 'DEPUTY', label: 'Заместитель' }, { value: 'MEMBER', label: 'Член комиссии' }, { value: 'SECRETARY', label: 'Секретарь' }];

function MembersEditor({ value = [], onChange, initial }: { value?: any[]; onChange?: (v: any[]) => void; initial: Record<string, string> }) {
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {value.map((m, i) => (
        <Space key={i}>
          <EmployeeSelect value={m.employeeId} style={{ width: 320 }} initialOptions={initial[m.employeeId] ? [{ value: m.employeeId, label: initial[m.employeeId] }] : []}
            onChange={(v) => onChange?.(value.map((x, j) => (j === i ? { ...x, employeeId: v } : x)))} />
          <Select value={m.role} options={ROLES} style={{ width: 170 }} onChange={(v) => onChange?.(value.map((x, j) => (j === i ? { ...x, role: v } : x)))} />
          <Button danger onClick={() => onChange?.(value.filter((_, j) => j !== i))}>×</Button>
        </Space>
      ))}
      <Button onClick={() => onChange?.([...value, { role: 'MEMBER' }])}>Добавить члена комиссии</Button>
    </Space>
  );
}

function ruleFields(kind: 'briefing' | 'check', types: any[], units: any[], positions: any[], categories: string[]): Field[] {
  return [
    { name: 'typeId', label: kind === 'briefing' ? 'Вид инструктажа' : 'Вид проверки', type: 'select', required: true, options: types.map((t) => ({ value: t.id, label: t.name })) },
    { name: 'positionId', label: 'Должность (пусто — для всех)', type: 'select', options: positions.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'workCategory', label: 'Категория работ (пусто — любая)', type: 'custom', render: () => <AutoComplete allowClear options={categories.map((c) => ({ value: c }))} /> },
    { name: 'unitId', label: 'Подразделение (пусто — все)', type: 'select', options: units.map((u) => ({ value: u.id, label: u.name })) },
    { name: 'periodMonths', label: 'Периодичность, мес.', type: 'number', extra: 'Пусто — разовое мероприятие без периодичности' },
    { name: 'periodDays', label: 'Периодичность, дней (дополнительно)', type: 'number' },
    { name: 'initialDueDays', label: 'Срок первичного прохождения после приёма/перевода, дней', type: 'number' },
    { name: 'resetOnTransfer', label: 'Требуется повторное прохождение после перевода', type: 'bool' },
    ...(kind === 'check' ? [{ name: 'retestDays', label: 'Срок повторной проверки при неудовлетворительном результате, дней', type: 'number' as const }] : []),
    { name: 'basis', label: 'Основание (документ, пункт, редакция)', type: 'textarea', required: true },
    { name: 'validFrom', label: 'Действует с', type: 'date', required: true },
    { name: 'validTo', label: 'Действует по', type: 'date' },
    { name: 'isActive', label: 'Правило активно', type: 'bool' },
    { name: 'note', label: 'Примечание', type: 'textarea' },
  ];
}

const ruleColumns = (positions: any[], units: any[]) => [
  { title: 'Вид', dataIndex: 'typeName' },
  { title: 'Применяется к', render: (_: any, r: any) => [r.positionId && `должность: ${positions.find((p) => p.id === r.positionId)?.name ?? '?'}`, r.workCategory && `категория: ${r.workCategory}`, r.unitId && `подразделение: ${units.find((u) => u.id === r.unitId)?.name ?? '?'}`].filter(Boolean).join('; ') || 'все' },
  { title: 'Периодичность', render: (_: any, r: any) => [r.periodMonths && `${r.periodMonths} мес.`, r.periodDays && `${r.periodDays} дн.`].filter(Boolean).join(' + ') || 'разово' },
  { title: 'Первично, дн.', dataIndex: 'initialDueDays', width: 90 },
  { title: 'Основание', dataIndex: 'basis', ellipsis: true },
  { title: 'Действует', render: (_: any, r: any) => `${fmtDate(r.validFrom)} — ${fmtDate(r.validTo) || '…'}` },
  activeColumn,
];

function TemplatesTab() {
  const { message } = App.useApp();
  const [edit, setEdit] = useState<any>(null);
  const [verify, setVerify] = useState<any>(null);
  const [form] = Form.useForm();
  const [vform] = Form.useForm();
  const { data, refetch, isFetching } = useQuery({ queryKey: ['templates'], queryFn: () => api.get('/templates').then((r) => r.data as any[]) });
  const save = async () => {
    const v = await form.validateFields();
    try { await api.patch(`/templates/${edit.id}`, v); message.success('Сохранена новая версия шаблона'); setEdit(null); refetch(); } catch (e) { message.error(errorText(e)); }
  };
  const doVerify = async () => {
    const v = await vform.validateFields();
    try { await api.post(`/templates/${verify.id}/verify`, v); message.success('Шаблон отмечен как проверенный'); setVerify(null); refetch(); } catch (e) { message.error(errorText(e)); }
  };
  return (
    <>
      <Alert type="warning" showIcon style={{ marginBottom: 12 }} message="Шаблоны, поставляемые с системой, являются примерами. До использования в официальном документообороте ответственное лицо должно проверить соответствие формы обязательным требованиям и отметить шаблон как проверенный." />
      <Table size="small" rowKey="id" loading={isFetching} dataSource={data} pagination={false}
        columns={[
          { title: 'Код', dataIndex: 'code' }, { title: 'Наименование', dataIndex: 'name' }, { title: 'Версия', dataIndex: 'version' },
          { title: 'Активна', dataIndex: 'isActive', render: (v) => (v ? <Tag color="green">да</Tag> : 'нет') },
          { title: 'Проверка соответствия', render: (_, r) => (r.isVerified ? <Tag color="green" title={r.basis}>проверен: {r.verifiedBy}, {fmtDateTime(r.verifiedAt)}</Tag> : <Tag color="red">не проверен</Tag>) },
          { title: '', render: (_, r) => <Space>
            <Button size="small" onClick={() => { form.setFieldsValue({ name: r.name, content: r.content }); setEdit(r); }}>Изменить</Button>
            {!r.isVerified && <Button size="small" onClick={() => { vform.resetFields(); setVerify(r); }}>Отметить как проверенный</Button>}
            {!r.isActive && <Button size="small" onClick={() => api.post(`/templates/${r.id}/activate`).then(() => refetch())}>Сделать активной</Button>}
          </Space> },
        ]} />
      <Modal open={!!edit} title="Редактирование шаблона (создаётся новая версия)" onOk={save} onCancel={() => setEdit(null)} width={900} okText="Сохранить" destroyOnHidden>
        <p className="muted">HTML-шаблон Handlebars. Значения экранируются автоматически; скрипты и {'{{{ }}}'} запрещены. Доступные помощники: date, inc, eq.</p>
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Наименование" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="content" label="Содержимое" rules={[{ required: true }]}><Input.TextArea rows={22} style={{ fontFamily: 'monospace', fontSize: 12 }} /></Form.Item>
        </Form>
      </Modal>
      <Modal open={!!verify} title="Подтверждение проверки шаблона" onOk={doVerify} onCancel={() => setVerify(null)} okText="Подтвердить" destroyOnHidden>
        <Form form={vform} layout="vertical">
          <Form.Item name="verifiedBy" label="Кем проверен (ФИО, должность)" rules={[{ required: true, min: 3 }]}><Input /></Form.Item>
          <Form.Item name="basis" label="Основание (нормативный документ / форма, редакция)" rules={[{ required: true, min: 3 }]}><Input.TextArea rows={3} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ReferencesPage() {
  const { can } = useAuth();
  const [f, setF] = useUrlFilters<any>();
  const { data: units = [] } = useUnits();
  const { data: positions = [] } = usePositions();
  const { data: bTypes = [] } = useBriefingTypes();
  const { data: cTypes = [] } = useCheckTypes();
  const { data: categories = [] } = useWorkCategories();
  const org = can('org.manage');
  const safety = can('safety_refs.manage');
  const { data: commissions = [] } = useCommissions();
  const memberLabels = useMemo(() => {
    const l: Record<string, string> = {};
    for (const c of commissions) for (const m of c.members) l[m.employeeId] = fio(m.employee);
    return l;
  }, [commissions]);

  const tabs = [
    {
      key: 'units', label: 'Подразделения', children: <RefCrud endpoint="/units" queryKey="units" canEdit={org} title="Подразделение" defaults={{ isActive: true }}
        columns={[{ title: 'Код', dataIndex: 'code', width: 100 }, { title: 'Наименование', dataIndex: 'name' },
          { title: 'Вышестоящее', render: (_, r) => units.find((u) => u.id === r.parentId)?.name }, { title: 'Работников', render: (_, r) => r._count?.employees }, activeColumn]}
        fields={[{ name: 'code', label: 'Код' }, { name: 'name', label: 'Наименование', required: true }, { name: 'parentId', label: 'Вышестоящее подразделение', type: 'unit' }, { name: 'isActive', label: 'Действует', type: 'bool' }]} />,
    },
    {
      key: 'positions', label: 'Должности и профессии', children: <RefCrud endpoint="/positions" queryKey="positions" canEdit={org} title="Должность" defaults={{ isActive: true }}
        columns={[{ title: 'Код', dataIndex: 'code', width: 100 }, { title: 'Наименование', dataIndex: 'name' }, { title: 'Категория работ', dataIndex: 'workCategory' }, { title: 'Профессия рабочего', dataIndex: 'isProfession', render: (v) => (v ? 'да' : '') }, activeColumn]}
        fields={[{ name: 'code', label: 'Код' }, { name: 'name', label: 'Наименование', required: true },
          { name: 'workCategory', label: 'Категория работ (для правил периодичности)', type: 'custom', render: () => <AutoComplete allowClear options={categories.map((c) => ({ value: c }))} /> },
          { name: 'isProfession', label: 'Профессия рабочего', type: 'bool' }, { name: 'isActive', label: 'Действует', type: 'bool' }]} />,
    },
    {
      key: 'briefing-types', label: 'Виды инструктажей', children: <RefCrud endpoint="/briefing-types" queryKey="briefing-types" canEdit={safety} title="Вид инструктажа" defaults={{ isActive: true, requiresConfirmation: true }}
        columns={[{ title: 'Код', dataIndex: 'code' }, { title: 'Наименование', dataIndex: 'name' }, { title: 'Периодический', dataIndex: 'isPeriodic', render: (v) => (v ? 'да' : '') },
          { title: 'Требуется подтверждение', dataIndex: 'requiresConfirmation', render: (v) => (v ? 'да' : 'нет') }, { title: 'Порядок', dataIndex: 'sortOrder' }, activeColumn]}
        fields={[{ name: 'code', label: 'Код (латиница)', required: true }, { name: 'name', label: 'Наименование', required: true }, { name: 'description', label: 'Описание / основание', type: 'textarea' },
          { name: 'isPeriodic', label: 'Периодический (сроки по правилам)', type: 'bool' }, { name: 'requiresConfirmation', label: 'Требуется фиксация подтверждения проведения', type: 'bool' },
          { name: 'sortOrder', label: 'Порядок сортировки', type: 'number' }, { name: 'isActive', label: 'Действует', type: 'bool' }]} />,
    },
    {
      key: 'briefing-rules', label: 'Правила инструктажей', children: <>
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Периодичность и сроки задаются по применимым нормативным документам и локальным актам организации с указанием основания и периода действия. Применяется наиболее специфичное правило (должность > категория работ > подразделение > общее), действовавшее на дату мероприятия." />
        <RefCrud endpoint="/briefing-rules" queryKey="briefing-rules" canEdit={safety} title="Правило" defaults={{ isActive: true }} columns={ruleColumns(positions, units)} fields={ruleFields('briefing', bTypes, units, positions, categories)}
          toApi={(v) => ({ ...v, workCategory: v.workCategory || null })} />
      </>,
    },
    {
      key: 'check-types', label: 'Виды проверок знаний', children: <RefCrud endpoint="/check-types" queryKey="check-types" canEdit={safety} title="Вид проверки" defaults={{ isActive: true }}
        columns={[{ title: 'Код', dataIndex: 'code' }, { title: 'Наименование', dataIndex: 'name' }, { title: 'Описание', dataIndex: 'description', ellipsis: true }, activeColumn]}
        fields={[{ name: 'code', label: 'Код (латиница)', required: true }, { name: 'name', label: 'Наименование', required: true }, { name: 'description', label: 'Описание / основание', type: 'textarea' }, { name: 'isActive', label: 'Действует', type: 'bool' }]} />,
    },
    {
      key: 'check-rules', label: 'Правила проверок знаний', children: <RefCrud endpoint="/check-rules" queryKey="check-rules" canEdit={safety} title="Правило" defaults={{ isActive: true }}
        columns={[...ruleColumns(positions, units).slice(0, 4), { title: 'Повторно при неудаче, дн.', dataIndex: 'retestDays' }, ...ruleColumns(positions, units).slice(4)]}
        fields={ruleFields('check', cTypes, units, positions, categories)} toApi={(v) => ({ ...v, workCategory: v.workCategory || null })} />,
    },
    {
      key: 'documents', label: 'Документы и инструкции', children: <RefCrud endpoint="/safety-documents" queryKey="safety-documents" canEdit={safety} title="Документ" defaults={{ isActive: true, docType: 'INSTRUCTION' }}
        columns={[{ title: 'Тип', dataIndex: 'docType', render: (v) => ({ INSTRUCTION: 'Инструкция', PROGRAM: 'Программа', ORDER: 'Приказ', REGULATION: 'Положение', OTHER: 'Иное' } as any)[v] },
          { title: 'Номер', dataIndex: 'number' }, { title: 'Наименование', dataIndex: 'title' }, { title: 'Редакция', dataIndex: 'version' }, { title: 'Утверждён', render: (_, r) => fmtDate(r.approvedDate) }, activeColumn]}
        fields={[{ name: 'docType', label: 'Тип', type: 'select', required: true, options: [{ value: 'INSTRUCTION', label: 'Инструкция по охране труда' }, { value: 'PROGRAM', label: 'Программа инструктажа/обучения' }, { value: 'ORDER', label: 'Приказ' }, { value: 'REGULATION', label: 'Положение' }, { value: 'OTHER', label: 'Иное' }] },
          { name: 'number', label: 'Номер' }, { name: 'title', label: 'Наименование', required: true }, { name: 'version', label: 'Редакция / версия' },
          { name: 'approvedDate', label: 'Дата утверждения', type: 'date' }, { name: 'validFrom', label: 'Действует с', type: 'date' }, { name: 'validTo', label: 'Действует по', type: 'date' },
          { name: 'isActive', label: 'Действует', type: 'bool' }, { name: 'note', label: 'Примечание', type: 'textarea' }]} />,
    },
    {
      key: 'commissions', label: 'Комиссии', children: <RefCrud endpoint="/commissions" queryKey="commissions" canEdit={safety} title="Комиссия" defaults={{ isActive: true, members: [] }}
        toApi={(v) => ({ ...v, members: (v.members ?? []).filter((m: any) => m.employeeId).map((m: any) => ({ employeeId: m.employeeId, role: m.role })) })}
        columns={[{ title: 'Наименование', dataIndex: 'name' }, { title: 'Приказ', render: (_, r) => (r.orderNumber ? `№ ${r.orderNumber} от ${fmtDate(r.orderDate)}` : '') },
          { title: 'Состав', render: (_, r) => r.members.map((m: any) => `${ROLES.find((x) => x.value === m.role)?.label}: ${fio(m.employee)}`).join('; ') }, activeColumn]}
        fields={[{ name: 'name', label: 'Наименование', required: true }, { name: 'orderNumber', label: 'Номер приказа' }, { name: 'orderDate', label: 'Дата приказа', type: 'date' },
          { name: 'members', label: 'Состав', type: 'custom', render: () => <MembersEditor initial={memberLabels} /> }, { name: 'isActive', label: 'Действует', type: 'bool' }]} />,
    },
    ...(can('templates.manage') ? [{ key: 'templates', label: 'Шаблоны печатных форм', children: <TemplatesTab /> }] : []),
  ];
  return (
    <>
      <PageHeader title="Справочники" />
      <Tabs activeKey={f.tab ?? 'units'} onChange={(k) => setF({ tab: k } as any)} destroyOnHidden items={tabs} />
    </>
  );
}
