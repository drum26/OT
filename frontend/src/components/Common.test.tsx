import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusTag } from './Common';
import { COMPLIANCE_STATUS } from '../utils/format';
import { LoginPage } from '../pages/LoginPage';
import { AuthProvider } from '../auth/AuthContext';
import { api } from '../api/client';

describe('компоненты', () => {
  it('StatusTag показывает русское название статуса', () => {
    render(<StatusTag map={COMPLIANCE_STATUS} value="FAILED" />);
    expect(screen.getByText('Неудовл. результат')).toBeInTheDocument();
  });

  it('LoginPage: обязательные поля и сообщение сервера об ошибке', async () => {
    vi.spyOn(api, 'post').mockRejectedValue({ response: { status: 401, data: { message: 'Неверный логин или пароль' } } });
    render(<AuthProvider><LoginPage /></AuthProvider>);
    await userEvent.click(screen.getByRole('button', { name: /Войти/ }));
    expect(await screen.findByText('Введите логин')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Логин'), 'user');
    await userEvent.type(screen.getByLabelText('Пароль'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: /Войти/ }));
    expect(await screen.findByText('Неверный логин или пароль')).toBeInTheDocument();
  });
});
