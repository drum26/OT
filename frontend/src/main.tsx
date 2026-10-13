import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import './styles.css';

dayjs.locale('ru');

// Ошибки валидации форм antd уже отображаются у полей — не считаем их необработанными
window.addEventListener('unhandledrejection', (e) => {
  if (e.reason && typeof e.reason === 'object' && 'errorFields' in e.reason) e.preventDefault();
});

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={ruRU}
      theme={{ token: { colorPrimary: '#1f6f43', borderRadius: 4, fontSize: 14 }, components: { Layout: { siderBg: '#14261c', headerBg: '#ffffff' }, Menu: { darkItemBg: '#14261c', darkSubMenuItemBg: '#0f1d15' } } }}
    >
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <App />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
