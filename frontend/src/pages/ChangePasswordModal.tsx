import { App, Form, Input, Modal } from 'antd';
import { api, errorText } from '../api/client';
import { useAuth } from '../auth/AuthContext';

export function ChangePasswordModal({ open, forced, onClose }: { open: boolean; forced: boolean; onClose: () => void }) {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const { reload } = useAuth();
  const submit = async () => {
    const v = await form.validateFields();
    try {
      await api.post('/auth/change-password', { currentPassword: v.currentPassword, newPassword: v.newPassword });
      message.success('Пароль изменён');
      form.resetFields();
      await reload();
      onClose();
    } catch (e) {
      message.error(errorText(e));
    }
  };
  return (
    <Modal open={open} title={forced ? 'Необходимо сменить пароль' : 'Смена пароля'} onOk={submit} okText="Сохранить" onCancel={forced ? undefined : onClose}
      closable={!forced} maskClosable={false} cancelButtonProps={{ style: { display: forced ? 'none' : undefined } }} destroyOnHidden>
      <Form form={form} layout="vertical">
        <Form.Item name="currentPassword" label="Текущий пароль" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
        <Form.Item name="newPassword" label="Новый пароль" rules={[{ required: true }, { pattern: /^(?=.*[A-Za-zА-Яа-яЁё])(?=.*\d).{10,128}$/, message: 'Не менее 10 символов, буквы и цифры' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirm" label="Повторите пароль" dependencies={['newPassword']}
          rules={[{ required: true }, ({ getFieldValue }) => ({ validator: (_, v) => (v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Пароли не совпадают'))) })]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
