import { Alert, App, Button, Card, Checkbox, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, errorText, qs, Paged } from '../../api/client';
import { useAuth } from '../../auth/AuthContext';
import { PageHeader } from '../../components/Common';
import { EmployeeSelect, UnitSelect } from '../../components/Selects';
import { download } from '../../utils/files';
import { fio, fmtDateTime } from '../../utils/format';

const PWD_RULE = { pattern: /^(?=.*[A-Za-zА-Яа-яЁё])(?=.*\d).{10,128}$/, message: 'Не менее 10 символов, буквы и цифры' };

function UsersTab() {
  const { message, modal } = App.useApp();
  const [form] = Form.useForm();
  const [edit, setEdit] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const users = useQuery({ queryKey: ['users', search, page], queryFn: () => api.get<Paged<any>>('/users', { params: qs({ search, page, pageSize: 25 }) }).then((r) => r.data) });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles').then((r) => r.data as any[]) });
  const allUnits = Form.useWatch('allUnits', form);
  const open = (u?: any) => {
    form.resetFields();
    form.setFieldsValue(u ? { ...u, roleIds: u.roles.map((r: any) => r.role.id), unitIds: u.unitScopes.map((s: any) => s.unit.id) } : { allUnits: false, roleIds: [], unitIds: [], isActive: true });
    setEdit(u ?? {});
  };
  const save = async () => {
    const v = await form.validateFields();
    try {
      if (edit.id) { const { login: _l, password: _p, ...rest } = v; await api.patch(`/users/${edit.id}`, rest); }
      else await api.post('/users', v);
      message.success('Сохранено');
      setEdit(null);
      users.refetch();
    } catch (e) { message.error(errorText(e)); }
  };
  const reset = (u: any) => {
    let pwd = '';
    modal.confirm({
      title: `Новый пароль для ${u.login}`, content: <Input.Password onChange={(e) => (pwd = e.target.value)} placeholder="Не менее 10 символов, буквы и цифры" />, okText: 'Установить',
      onOk: async () => { try { await api.post(`/users/${u.id}/reset-password`, { password: pwd, mustChange: true }); message.success('Пароль изменён; пользователь сменит его при входе'); } catch (e) { message.error(errorText(e)); throw e; } },
    });
  };
  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="Логин или ФИО" onSearch={(v) => { setSearch(v); setPage(1); }} style={{ width: 260 }} />
        <Button type="primary" onClick={() => open()}>Добавить пользователя</Button>
      </Space>
      <Table size="small" rowKey="id" loading={users.isFetching} dataSource={users.data?.items} pagination={{ current: page, total: users.data?.total, pageSize: 25, onChange: setPage }}
        columns={[
          { title: 'Логин', dataIndex: 'login' }, { title: 'ФИО', dataIndex: 'fullName' },
          { title: 'Роли', render: (_, u) => u.roles.map((r: any) => <Tag key={r.role.id}>{r.role.name}</Tag>) },
          { title: 'Зона доступа', render: (_, u) => (u.allUnits ? 'Все подразделения' : u.unitScopes.map((s: any) => s.unit.name).join(', ') || <Tag color="red">не задана</Tag>) },
          { title: 'Последний вход', render: (_, u) => fmtDateTime(u.lastLoginAt) },
          { title: 'Состояние', render: (_, u) => <>{u.isActive ? <Tag color="green">активен</Tag> : <Tag>отключён</Tag>}{u.lockedUntil && new Date(u.lockedUntil) > new Date() && <Tag color="red">заблокирован</Tag>}</> },
          { title: '', render: (_, u) => <Space>
            <Button size="small" onClick={() => open(u)}>Изменить</Button>
            <Button size="small" onClick={() => reset(u)}>Сбросить пароль</Button>
            {u.lockedUntil && <Button size="small" onClick={() => api.post(`/users/${u.id}/unlock`).then(() => users.refetch())}>Разблокировать</Button>}
          </Space> },
        ]} />
      <Modal open={!!edit} title={edit?.id ? `Пользователь ${edit.login}` : 'Новый пользователь'} onOk={save} onCancel={() => setEdit(null)} okText="Сохранить" width={640} destroyOnHidden>
        <Form form={form} layout="vertical">
          {!edit?.id && <Form.Item name="login" label="Логин" rules={[{ required: true }, { pattern: /^[a-zA-Z0-9._-]{3,50}$/, message: 'Латиница, цифры, . _ -' }]}><Input /></Form.Item>}
          <Form.Item name="fullName" label="ФИО" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}><Input /></Form.Item>
          {!edit?.id && <Form.Item name="password" label="Временный пароль" rules={[{ required: true }, PWD_RULE]} extra="Пользователь сменит пароль при первом входе"><Input.Password autoComplete="new-password" /></Form.Item>}
          <Form.Item name="roleIds" label="Роли"><Select mode="multiple" options={(roles.data ?? []).map((r) => ({ value: r.id, label: r.name }))} /></Form.Item>
          <Form.Item name="allUnits" valuePropName="checked"><Checkbox>Доступ ко всем подразделениям</Checkbox></Form.Item>
          {!allUnits && <Form.Item name="unitIds" label="Подразделения (с дочерними)"><UnitSelect multiple treeCheckable /></Form.Item>}
          <Form.Item name="employeeId" label="Связанный сотрудник (для назначения ответственным)">
            <EmployeeSelect initialOptions={edit?.employee ? [{ value: edit.employee.id, label: fio(edit.employee) }] : []} />
          </Form.Item>
          {edit?.id && <Form.Item name="isActive" valuePropName="checked"><Checkbox>Учётная запись активна</Checkbox></Form.Item>}
        </Form>
      </Modal>
    </>
  );
}

function RolesTab() {
  const { message } = App.useApp();
  const { can } = useAuth();
  const qc = useQueryClient();
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get('/roles').then((r) => r.data as any[]) });
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api.get('/permissions').then((r) => r.data as any[]) });
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const groups = [...new Set((perms.data ?? []).map((p) => p.groupName))];
  const toggle = (roleId: string, code: string, on: boolean, current: string[]) => {
    const cur = draft[roleId] ?? current;
    setDraft({ ...draft, [roleId]: on ? [...cur, code] : cur.filter((c) => c !== code) });
  };
  const save = async (r: any) => {
    try { await api.put(`/roles/${r.id}`, { permissions: draft[r.id] }); message.success(`Роль «${r.name}» сохранена`); const d = { ...draft }; delete d[r.id]; setDraft(d); qc.invalidateQueries({ queryKey: ['roles'] }); } catch (e) { message.error(errorText(e)); }
  };
  if (!roles.data || !perms.data) return null;
  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Права проверяются на сервере. Ограничение по подразделениям задаётся для каждого пользователя." />
      <div style={{ overflowX: 'auto' }}>
        <table className="ant-table" style={{ borderCollapse: 'collapse', fontSize: 13 }}>
          <thead><tr><th style={{ textAlign: 'left', padding: 4 }}>Разрешение</th>{roles.data.map((r) => <th key={r.id} style={{ padding: 4, maxWidth: 120 }}>{r.name}{draft[r.id] && can('roles.manage') && <div><Button size="small" type="primary" onClick={() => save(r)}>Сохранить</Button></div>}</th>)}</tr></thead>
          <tbody>
            {groups.map((g) => [
              <tr key={g}><td colSpan={roles.data.length + 1} style={{ background: '#f0f2f1', padding: 4, fontWeight: 600 }}>{g}</td></tr>,
              ...perms.data.filter((p) => p.groupName === g).map((p) => (
                <tr key={p.code}>
                  <td style={{ padding: 4 }}>{p.name} <Typography.Text type="secondary" style={{ fontSize: 11 }}>{p.code}</Typography.Text></td>
                  {roles.data.map((r) => {
                    const cur: string[] = draft[r.id] ?? r.permissions;
                    return <td key={r.id} style={{ textAlign: 'center' }}><Checkbox disabled={!can('roles.manage')} checked={cur.includes(p.code)} onChange={(e) => toggle(r.id, p.code, e.target.checked, r.permissions)} /></td>;
                  })}
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SettingsTab() {
  const { message } = App.useApp();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.get('/admin/settings').then((r) => r.data as any[]) });
  const rules = useQuery({ queryKey: ['notification-rules'], queryFn: () => api.get('/notification-rules').then((r) => r.data as any[]) });
  const deliveries = useQuery({ queryKey: ['deliveries'], queryFn: () => api.get('/notifications/deliveries').then((r) => r.data as any[]) });
  const [running, setRunning] = useState(false);
  const setVal = async (key: string, value: unknown) => {
    try { await api.put(`/admin/settings/${key}`, { value }); message.success('Сохранено'); settings.refetch(); } catch (e) { message.error(errorText(e)); }
  };
  const updRule = async (id: string, patch: any) => {
    try { await api.put(`/notification-rules/${id}`, patch); rules.refetch(); } catch (e) { message.error(errorText(e)); }
  };
  const EVT: Record<string, string> = { BRIEFING_PLANNED: 'Инструктажи', KNOWLEDGE_CHECK_PLANNED: 'Проверки знаний', PPE_REPLACEMENT: 'Замена СИЗ', TASK_DUE: 'Задачи', BRIEFING_COMPLIANCE_DIGEST: 'Сводка: инструктажи', CHECK_COMPLIANCE_DIGEST: 'Сводка: проверки' };
  return (
    <>
      <Card size="small" title="Параметры системы">
        <Table size="small" rowKey="key" dataSource={settings.data} pagination={false}
          columns={[
            { title: 'Параметр', dataIndex: 'description' },
            { title: 'Значение', width: 360, render: (_, s) => typeof s.default === 'boolean'
              ? <Switch checked={!!s.value} onChange={(v) => setVal(s.key, v)} />
              : typeof s.default === 'number' || s.key === 'personalData.retentionYears'
                ? <InputNumber defaultValue={s.value ?? undefined} min={0} onBlur={(e) => setVal(s.key, e.target.value === '' ? null : Number(e.target.value))} />
                : <Input defaultValue={s.value} onBlur={(e) => e.target.value !== s.value && setVal(s.key, e.target.value)} /> },
          ]} />
      </Card>
      <Card size="small" title="Правила уведомлений" style={{ marginTop: 12 }} extra={<Button loading={running} onClick={async () => { setRunning(true); try { const r = await api.post('/notifications/run'); message.success(`Задание выполнено: ${JSON.stringify(r.data)}`); deliveries.refetch(); } catch (e) { message.error(errorText(e)); } finally { setRunning(false); } }}>Запустить формирование сейчас</Button>}>
        <Table size="small" rowKey="id" dataSource={rules.data} pagination={false} scroll={{ x: 1100 }}
          columns={[
            { title: 'Событие', render: (_, r) => EVT[r.eventType] ?? r.eventType },
            { title: 'За сколько дней', render: (_, r) => r.eventType.includes('DIGEST') ? 'ежедневно' : <Select mode="tags" style={{ width: 150 }} value={r.daysBefore.map(String)} onChange={(v) => updRule(r.id, { daysBefore: v.map(Number).filter((n: number) => n > 0 && n <= 365) })} /> },
            { title: 'В день срока', render: (_, r) => <Switch size="small" checked={r.notifyOnDueDate} onChange={(v) => updRule(r.id, { notifyOnDueDate: v })} /> },
            { title: 'О просрочке', render: (_, r) => <Switch size="small" checked={r.notifyOverdue} onChange={(v) => updRule(r.id, { notifyOverdue: v })} /> },
            { title: 'Ответственному', render: (_, r) => <Switch size="small" checked={r.notifyResponsible} onChange={(v) => updRule(r.id, { notifyResponsible: v })} /> },
            { title: 'Руководителю', render: (_, r) => <Switch size="small" checked={r.notifyUnitHeads} onChange={(v) => updRule(r.id, { notifyUnitHeads: v })} /> },
            { title: 'Специалисту ОТ', render: (_, r) => <Switch size="small" checked={r.notifySafetySpecialists} onChange={(v) => updRule(r.id, { notifySafetySpecialists: v })} /> },
            { title: 'Задача при просрочке', render: (_, r) => r.eventType.includes('DIGEST') || r.eventType === 'TASK_DUE' ? '' : <Switch size="small" checked={r.createTaskOnOverdue} onChange={(v) => updRule(r.id, { createTaskOnOverdue: v })} /> },
            { title: 'Каналы', render: (_, r) => <Select mode="multiple" style={{ width: 200 }} value={r.channels} onChange={(v) => updRule(r.id, { channels: v })} options={[{ value: 'IN_APP', label: 'В приложении' }, { value: 'EMAIL', label: 'E-mail (не настроен)' }]} /> },
            { title: 'Активно', render: (_, r) => <Switch size="small" checked={r.isActive} onChange={(v) => updRule(r.id, { isActive: v })} /> },
          ]} />
      </Card>
      <Card size="small" title="Ошибки и пропуски доставки" style={{ marginTop: 12 }}>
        <Table size="small" rowKey="id" dataSource={deliveries.data} pagination={{ pageSize: 10 }}
          columns={[{ title: 'Время', render: (_, d) => fmtDateTime(d.createdAt) }, { title: 'Уведомление', render: (_, d) => d.notification.title }, { title: 'Пользователь', render: (_, d) => d.notification.user.login },
            { title: 'Канал', dataIndex: 'channel' }, { title: 'Статус', dataIndex: 'status' }, { title: 'Попыток', dataIndex: 'attempts' }, { title: 'Ошибка', dataIndex: 'lastError' }]} />
      </Card>
    </>
  );
}

function AuditTab() {
  const [q, setQ] = useState<any>({ page: 1 });
  const { data, isFetching } = useQuery({ queryKey: ['audit', q], queryFn: () => api.get<Paged<any>>('/admin/audit', { params: qs({ ...q, pageSize: 50 }) }).then((r) => r.data) });
  return (
    <>
      <Space style={{ marginBottom: 12 }} wrap>
        <Input.Search allowClear placeholder="Действие" onSearch={(v) => setQ({ ...q, search: v, page: 1 })} style={{ width: 240 }} />
        <Input.Search allowClear placeholder="Пользователь" onSearch={(v) => setQ({ ...q, userLogin: v, page: 1 })} style={{ width: 200 }} />
        <Input.Search allowClear placeholder="Раздел (employees, briefings…)" onSearch={(v) => setQ({ ...q, entityType: v, page: 1 })} style={{ width: 240 }} />
      </Space>
      <Table size="small" rowKey="id" loading={isFetching} dataSource={data?.items} pagination={{ current: q.page, total: data?.total, pageSize: 50, onChange: (p) => setQ({ ...q, page: p }) }}
        expandable={{ expandedRowRender: (r) => <pre style={{ fontSize: 11, margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(r.details, null, 2)}</pre> }}
        columns={[
          { title: 'Время', render: (_, r) => fmtDateTime(r.createdAt), width: 150 }, { title: 'Пользователь', dataIndex: 'userLogin' }, { title: 'Действие', dataIndex: 'action' },
          { title: 'Запись', dataIndex: 'entityId', ellipsis: true }, { title: 'IP', dataIndex: 'ip' }, { title: 'Успех', dataIndex: 'success', render: (v) => (v ? <Tag color="green">да</Tag> : <Tag color="red">нет</Tag>) },
        ]} />
    </>
  );
}

function BackupTab() {
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const list = useQuery({ queryKey: ['backups'], queryFn: () => api.get('/admin/backups').then((r) => r.data as any[]) });
  return (
    <>
      <Alert type="info" showIcon style={{ marginBottom: 12 }} message="Резервные копии создаются утилитой pg_dump. Восстановление выполняется администратором сервера скриптом scripts/restore.sh (см. docs/OPERATIONS.md) — это необратимо заменяет текущие данные." />
      <Button type="primary" loading={busy} style={{ marginBottom: 12 }} onClick={async () => { setBusy(true); try { await api.post('/admin/backups'); message.success('Резервная копия создана'); list.refetch(); } catch (e) { message.error(errorText(e)); } finally { setBusy(false); } }}>Создать резервную копию</Button>
      <Table size="small" rowKey="name" loading={list.isFetching} dataSource={list.data} pagination={false}
        columns={[{ title: 'Файл', dataIndex: 'name' }, { title: 'Создан', render: (_, r) => fmtDateTime(r.createdAt) }, { title: 'Размер', render: (_, r) => `${(r.size / 1048576).toFixed(1)} МБ` },
          { title: '', render: (_, r) => <Button size="small" onClick={() => download(`/admin/backups/${r.name}`, {}, r.name).catch((e) => message.error(errorText(e)))}>Скачать</Button> }]} />
    </>
  );
}

export function AdminPage() {
  const { can } = useAuth();
  const tabs = [
    can('users.manage') && { key: 'users', label: 'Пользователи', children: <UsersTab /> },
    can('users.manage') && { key: 'roles', label: 'Роли и права', children: <RolesTab /> },
    can('settings.manage') && { key: 'settings', label: 'Настройки и уведомления', children: <SettingsTab /> },
    can('audit.read') && { key: 'audit', label: 'Журнал действий', children: <AuditTab /> },
    can('backup.manage') && { key: 'backup', label: 'Резервное копирование', children: <BackupTab /> },
  ].filter(Boolean) as any[];
  if (!tabs.length) return <Alert type="warning" message="Недостаточно прав" />;
  return (
    <>
      <PageHeader title="Пользователи и настройки" />
      <Tabs items={tabs} destroyOnHidden />
    </>
  );
}
