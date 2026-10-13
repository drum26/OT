import { ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Badge, Button, Dropdown, Layout, List, Menu, Popover, Space, Typography } from 'antd';
import {
  AlertOutlined, BarChartOutlined, BellOutlined, BookOutlined, CalendarOutlined, CheckSquareOutlined, DashboardOutlined, LogoutOutlined,
  SafetyCertificateOutlined, SettingOutlined, SkinOutlined, SolutionOutlined, TeamOutlined, UserOutlined, KeyOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import { fmtDateTime } from '../utils/format';
import { ChangePasswordModal } from '../pages/ChangePasswordModal';

const { Sider, Header, Content } = Layout;

function NotificationBell() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: count } = useQuery({ queryKey: ['notif-count'], queryFn: () => api.get('/notifications/unread-count').then((r) => r.data.count as number), refetchInterval: 60_000 });
  const { data: list, refetch } = useQuery({ queryKey: ['notif-last'], queryFn: () => api.get('/notifications', { params: { pageSize: 8 } }).then((r) => r.data.items as any[]), enabled: false });
  const open = async (n: any) => {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`);
    qc.invalidateQueries({ queryKey: ['notif-count'] });
    if (n.link) nav(n.link);
  };
  return (
    <Popover trigger="click" placement="bottomRight" onOpenChange={(o) => o && refetch()} title="Уведомления"
      content={
        <div style={{ width: 380 }}>
          <List size="small" dataSource={list ?? []} locale={{ emptyText: 'Нет уведомлений' }}
            renderItem={(n: any) => (
              <List.Item style={{ cursor: 'pointer', opacity: n.readAt ? 0.6 : 1 }} onClick={() => open(n)}>
                <List.Item.Meta title={<span style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.title}</span>} description={<>{n.message}<br /><span className="muted">{fmtDateTime(n.createdAt)}</span></>} />
              </List.Item>
            )} />
          <Button type="link" block onClick={() => nav('/tasks?tab=notifications')}>Все уведомления</Button>
        </div>
      }>
      <Badge count={count ?? 0} size="small"><Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Уведомления" /></Badge>
    </Popover>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { me, logout, can } = useAuth();
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [pwd, setPwd] = useState(false);

  const items = [
    can('dashboard.read') && { key: '/', icon: <DashboardOutlined />, label: <Link to="/">Главная</Link> },
    can('employees.read') && { key: '/employees', icon: <TeamOutlined />, label: <Link to="/employees">Сотрудники</Link> },
    can('briefings.read') && { key: '/briefings', icon: <SolutionOutlined />, label: <Link to="/briefings">Инструктажи</Link> },
    can('checks.read') && { key: '/checks', icon: <SafetyCertificateOutlined />, label: <Link to="/checks">Проверки знаний</Link> },
    can('ppe.read') && { key: '/ppe', icon: <SkinOutlined />, label: <Link to="/ppe">Средства индивидуальной защиты</Link> },
    can('calendar.read') && { key: '/calendar', icon: <CalendarOutlined />, label: <Link to="/calendar">Календарь</Link> },
    { key: '/tasks', icon: <CheckSquareOutlined />, label: <Link to="/tasks">Задачи и уведомления</Link> },
    can('reports.read') && { key: '/reports', icon: <BarChartOutlined />, label: <Link to="/reports">Отчёты</Link> },
    { key: '/references', icon: <BookOutlined />, label: <Link to="/references">Справочники</Link> },
    (can('users.manage') || can('settings.manage') || can('audit.read') || can('backup.manage')) && { key: '/admin', icon: <SettingOutlined />, label: <Link to="/admin">Пользователи и настройки</Link> },
  ].filter(Boolean) as any[];
  const selected = items.map((i) => i.key).filter((k) => (k === '/' ? loc.pathname === '/' : loc.pathname.startsWith(k))).slice(-1);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed} width={260} breakpoint="lg">
        <div className="logo"><AlertOutlined /> {!collapsed && 'Охрана труда'}</div>
        <Menu theme="dark" mode="inline" selectedKeys={selected} items={items} />
      </Sider>
      <Layout>
        <Header style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid #e8e8e8' }}>
          <Space size="middle">
            <NotificationBell />
            <Dropdown menu={{ items: [
              { key: 'pwd', icon: <KeyOutlined />, label: 'Сменить пароль', onClick: () => setPwd(true) },
              { key: 'out', icon: <LogoutOutlined />, label: 'Выйти', onClick: () => logout() },
            ] }}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" icon={<UserOutlined />} />
                <Typography.Text>{me?.fullName}</Typography.Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ padding: 20 }}>{children}</Content>
      </Layout>
      <ChangePasswordModal open={pwd || !!me?.mustChangePassword} forced={!!me?.mustChangePassword} onClose={() => setPwd(false)} />
    </Layout>
  );
}
