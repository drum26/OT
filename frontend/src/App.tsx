import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin, Result } from 'antd';
import { useAuth } from './auth/AuthContext';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/employees/EmployeesPage';
import { EmployeeCard } from './pages/employees/EmployeeCard';
import { ImportPage } from './pages/employees/ImportPage';
import { BriefingsPage } from './pages/briefings/BriefingsPage';
import { BriefingDetails } from './pages/briefings/BriefingDetails';
import { ChecksPage } from './pages/checks/ChecksPage';
import { CheckDetails } from './pages/checks/CheckDetails';
import { PpePage } from './pages/ppe/PpePage';
import { CalendarPage } from './pages/CalendarPage';
import { TasksPage } from './pages/TasksPage';
import { ReportsPage } from './pages/ReportsPage';
import { ReferencesPage } from './pages/references/ReferencesPage';
import { AdminPage } from './pages/admin/AdminPage';

function Guard({ perm, children }: { perm?: string; children: JSX.Element }) {
  const { can } = useAuth();
  if (perm && !can(perm)) return <Result status="403" title="Нет доступа" subTitle="Недостаточно прав для просмотра раздела" />;
  return children;
}

export default function App() {
  const { me, loading, can } = useAuth();
  if (loading) return <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>;
  if (!me) return <LoginPage />;
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={can('dashboard.read') ? <DashboardPage /> : <Navigate to="/tasks" replace />} />
        <Route path="/employees" element={<Guard perm="employees.read"><EmployeesPage /></Guard>} />
        <Route path="/employees/import" element={<Guard perm="employees.import"><ImportPage /></Guard>} />
        <Route path="/employees/:id" element={<Guard perm="employees.read"><EmployeeCard /></Guard>} />
        <Route path="/briefings" element={<Guard perm="briefings.read"><BriefingsPage /></Guard>} />
        <Route path="/briefings/:id" element={<Guard perm="briefings.read"><BriefingDetails /></Guard>} />
        <Route path="/checks" element={<Guard perm="checks.read"><ChecksPage /></Guard>} />
        <Route path="/checks/:id" element={<Guard perm="checks.read"><CheckDetails /></Guard>} />
        <Route path="/ppe" element={<Guard perm="ppe.read"><PpePage /></Guard>} />
        <Route path="/calendar" element={<Guard perm="calendar.read"><CalendarPage /></Guard>} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/reports" element={<Guard perm="reports.read"><ReportsPage /></Guard>} />
        <Route path="/references" element={<ReferencesPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Result status="404" title="Страница не найдена" />} />
      </Routes>
    </AppLayout>
  );
}
