import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, refreshToken, setAccessToken, setLogoutHandler } from '../api/client';

export interface Me {
  id: string;
  login: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  unitIds: string[] | null;
  employeeId: string | null;
  mustChangePassword: boolean;
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
  can: (...perms: string[]) => boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const r = await api.get<Me>('/auth/me');
    setMe(r.data);
  }, []);

  useEffect(() => {
    setLogoutHandler(() => { setAccessToken(null); setMe(null); });
    // Восстановление сессии по refresh-cookie
    refreshToken().then(async (t) => {
      if (t) await reload().catch(() => setMe(null));
      setLoading(false);
    });
  }, [reload]);

  const login = async (login: string, password: string) => {
    const r = await api.post('/auth/login', { login, password });
    setAccessToken(r.data.accessToken);
    await reload();
  };

  const logout = async () => {
    await api.post('/auth/logout').catch(() => null);
    setAccessToken(null);
    setMe(null);
  };

  /** Есть ли у пользователя ВСЕ перечисленные разрешения (интерфейс; сервер проверяет права самостоятельно) */
  const can = useCallback((...perms: string[]) => !!me && perms.every((p) => me.permissions.includes(p)), [me]);

  return <Ctx.Provider value={{ me, loading, login, logout, reload, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
