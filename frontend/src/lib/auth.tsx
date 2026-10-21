import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';

interface Auth {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  acceptSession: (token: string, user: User) => void;
  logout: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return;
    const r = await api<{ user: User }>('/auth/me');
    setUser(r.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) {
      setReady(true);
      return;
    }
    refresh()
      .catch(() => logout())
      .finally(() => setReady(true));
  }, [logout, refresh]);

  const acceptSession = useCallback((token: string, u: User) => {
    setToken(token);
    setUser(u);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const r = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: { email, password } });
      acceptSession(r.token, r.user);
      return r.user;
    },
    [acceptSession],
  );

  const value = useMemo(
    () => ({ user, ready, login, acceptSession, logout, refresh }),
    [user, ready, login, acceptSession, logout, refresh],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}

/** Where each role lands after login. */
export function homeFor(user: User): string {
  if ((user.role === 'doctor' || user.role === 'pharmacy') && (!user.verified || user.status !== 'active')) return '/waiting';
  return { patient: '/home', doctor: '/doctor', pharmacy: '/pharmacy', staff: '/admin' }[user.role];
}
