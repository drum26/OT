import { App, Button, DatePicker, Form, Input, List, Modal, Select, Space, Switch, Table, Tabs, Tag } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api, errorText, qs, Paged } from '../api/client';
import { useAssignees } from '../api/refs';
import { useAuth } from '../auth/AuthContext';
import { PageHeader, StatusTag } from '../components/Common';
import { UnitSelect } from '../components/Selects';
import { fmtDate, fmtDateTime, TASK_PRIORITY, TASK_STATUS, TASK_TYPE, toApiDate, toDayjs } from '../utils/format';

const ENTITY_LINK: Record<string, (id: string) => string> = {
  briefing: (id) => `/briefings/${id}`, knowledge_check: (id) => `/checks/${id}`, employee: (id) => `/employees/${id}`,
};

function TaskModal({ task, onClose }: { task: any | null; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { can, me } = useAuth();
  const qc = useQueryClient();
  const { data: users = [] } = useAssignees(!!task);
  const manage = can('tasks.manage');
  useEffect(() => { if (task) form.setFieldsValue({ ...task, dueDate: toDayjs(task.dueDate), taskType: task.taskType ?? 'MANUAL', priority: task.priority ?? 'NORMAL' }); }, [task, form]);
  const save = async () => {
    const v = await form.validateFields();
    const body = manage ? { ...v, dueDate: toApiDate(v.dueDate) } : { status: v.status, result: v.result };
    if (task.id) delete body.taskType;
    if (task.id) delete body.unitId;
    try {
      if (task.id) await api.patch(`/tasks/${task.id}`, body);
      else await api.post('/tasks', body);
      message.success('Сохранено');
      qc.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    } catch (e) {
      message.error(errorText(e));
    }
  };
  const editable = manage;
  return (
    <Modal open={!!task} title={task?.id ? 'Задача' : 'Новая задача'} onOk={save} okText="Сохранить" onCancel={onClose} width={640} destroyOnHidden
      okButtonProps={{ disabled: !manage && task?.assigneeUserId !== me?.id }}>
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="Наименование" rules={[{ required: true, min: 3 }]}><Input disabled={!editable} /></Form.Item>
        <Form.Item name="description" label="Описание"><Input.TextArea rows={3} disabled={!editable} /></Form.Item>
        {!task?.id && <Form.Item name="taskType" label="Тип"><Select options={[{ value: 'MANUAL', label: 'Задача' }, { value: 'CONTROL_EVENT', label: 'Внутреннее контрольное мероприятие' }]} /></Form.Item>}
        <Space wrap>
          <Form.Item name="priority" label="Приоритет"><Select style={{ width: 160 }} disabled={!editable} options={Object.entries(TASK_PRIORITY).map(([value, s]) => ({ value, label: s.text }))} /></Form.Item>
          <Form.Item name="dueDate" label="Срок"><DatePicker format="DD.MM.YYYY" disabled={!editable} /></Form.Item>
          {task?.id && <Form.Item name="status" label="Статус"><Select style={{ width: 160 }} options={Object.entries(TASK_STATUS).map(([value, s]) => ({ value, label: s.text }))} /></Form.Item>}
        </Space>
        <Form.Item name="assigneeUserId" label="Ответственный"><Select allowClear showSearch optionFilterProp="label" disabled={!editable} options={users.map((u) => ({ value: u.id, label: u.fullName }))} /></Form.Item>
        {!task?.id && <Form.Item name="unitId" label="Подразделение"><UnitSelect /></Form.Item>}
        {task?.id && <Form.Item name="result" label="Результат выполнения"><Input.TextArea rows={2} /></Form.Item>}
        {task?.entityType && ENTITY_LINK[task.entityType] && <Link to={ENTITY_LINK[task.entityType](task.entityId)} onClick={onClose}>Перейти к связанной записи</Link>}
      </Form>
    </Modal>
  );
}

function TasksTab() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [task, setTask] = useState<any>(null);
  const [mine, setMine] = useState(false);
  const status = sp.get('status') ?? 'ACTIVE';
  const [page, setPage] = useState(1);
  const params = { status, mine, page, pageSize: 25, taskType: sp.get('taskType') ?? undefined };
  const { data, isFetching } = useQuery({ queryKey: ['tasks', params], queryFn: () => api.get<Paged<any>>('/tasks', { params: qs(params) }).then((r) => r.data) });
  const idParam = sp.get('id');
  useEffect(() => { if (idParam) api.get(`/tasks/${idParam}`).then((r) => setTask(r.data)).catch(() => null); }, [idParam]);
  const setParam = (k: string, v?: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); setPage(1); };
  return (
    <>
      <div className="filters">
        <Select value={status} onChange={(v) => setParam('status', v)} style={{ width: 200 }} options={[
          { value: 'ACTIVE', label: 'Незакрытые' }, { value: 'OVERDUE', label: 'Просроченные' }, ...Object.entries(TASK_STATUS).map(([value, s]) => ({ value, label: s.text })),
        ]} />
        <Select allowClear placeholder="Тип" value={sp.get('taskType') ?? undefined} onChange={(v) => setParam('taskType', v)} style={{ width: 240 }} options={Object.entries(TASK_TYPE).map(([value, label]) => ({ value, label }))} />
        <Space><Switch checked={mine} onChange={setMine} /> Только мои</Space>
        {can('tasks.manage') && <Button type="primary" icon={<PlusOutlined />} onClick={() => setTask({})}>Создать задачу</Button>}
      </div>
      <Table size="small" rowKey="id" loading={isFetching} dataSource={data?.items} onRow={(r) => ({ onClick: () => setTask(r), style: { cursor: 'pointer' } })}
        rowClassName={(r) => (r.overdue ? 'row-overdue' : '')}
        pagination={{ current: page, pageSize: 25, total: data?.total, onChange: setPage, showTotal: (t) => `Всего: ${t}` }}
        columns={[
          { title: 'Срок', render: (_, r) => fmtDate(r.dueDate), width: 100 },
          { title: 'Задача', dataIndex: 'title' },
          { title: 'Тип', render: (_, r) => TASK_TYPE[r.taskType] },
          { title: 'Приоритет', render: (_, r) => <StatusTag map={TASK_PRIORITY} value={r.priority} /> },
          { title: 'Ответственный', render: (_, r) => r.assignee?.fullName },
          { title: 'Статус', render: (_, r) => <>{<StatusTag map={TASK_STATUS} value={r.status} />}{r.overdue && <Tag color="red">просрочена</Tag>}</> },
        ]} />
      <TaskModal task={task} onClose={() => { setTask(null); if (idParam) setParam('id'); }} />
    </>
  );
}

function NotificationsTab() {
  const qc = useQueryClient();
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(1);
  const { data, isFetching, refetch } = useQuery({ queryKey: ['notifications', unread, page], queryFn: () => api.get('/notifications', { params: { unreadOnly: unread, page, pageSize: 20 } }).then((r) => r.data) });
  const read = async (id: string) => { await api.post(`/notifications/${id}/read`); refetch(); qc.invalidateQueries({ queryKey: ['notif-count'] }); };
  return (
    <>
      <div className="filters">
        <Space><Switch checked={unread} onChange={(v) => { setUnread(v); setPage(1); }} /> Только непрочитанные</Space>
        <Button onClick={async () => { await api.post('/notifications/read-all'); refetch(); qc.invalidateQueries({ queryKey: ['notif-count'] }); }}>Отметить все как прочитанные</Button>
      </div>
      <List loading={isFetching} dataSource={data?.items ?? []} pagination={{ current: page, pageSize: 20, total: data?.total, onChange: setPage }}
        renderItem={(n: any) => (
          <List.Item actions={[!n.readAt && <Button key="r" size="small" onClick={() => read(n.id)}>Прочитано</Button>, n.link && <Link key="l" to={n.link} onClick={() => !n.readAt && read(n.id)}>Открыть</Link>].filter(Boolean)}>
            <List.Item.Meta title={<span style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</span>} description={<>{n.message} <span className="muted">· {fmtDateTime(n.createdAt)}{n.readAt && ` · прочитано ${fmtDateTime(n.readAt)}`}</span></>} />
          </List.Item>
        )} />
    </>
  );
}

export function TasksPage() {
  const { can } = useAuth();
  const [sp, setSp] = useSearchParams();
  return (
    <>
      <PageHeader title="Задачи и уведомления" />
      <Tabs activeKey={sp.get('tab') ?? (can('tasks.read') ? 'tasks' : 'notifications')} onChange={(k) => setSp({ tab: k })} destroyOnHidden items={[
        ...(can('tasks.read') ? [{ key: 'tasks', label: 'Задачи', children: <TasksTab /> }] : []),
        { key: 'notifications', label: 'Уведомления', children: <NotificationsTab /> },
      ]} />
    </>
  );
}
