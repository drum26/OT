import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { LockOutlined, UserOutlined, AlertOutlined } from '@ant-design/icons';
import { useAuth } from '../auth/AuthContext';
import { errorText } from '../api/client';

export function LoginPage() {
  const { login } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (v: { login: string; password: string }) => {
    setBusy(true);
    setError(null);
    try {
      await login(v.login, v.password);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#14261c' }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}><AlertOutlined style={{ color: '#1f6f43' }} /> Охрана труда</Typography.Title>
        <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>Вход в систему</Typography.Paragraph>
        {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={submit} requiredMark={false}>
          <Form.Item name="login" label="Логин" rules={[{ required: true, message: 'Введите логин' }]}><Input prefix={<UserOutlined />} autoComplete="username" autoFocus /></Form.Item>
          <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}><Input.Password prefix={<LockOutlined />} autoComplete="current-password" /></Form.Item>
          <Button type="primary" htmlType="submit" block loading={busy}>Войти</Button>
        </Form>
      </Card>
    </div>
  );
}
