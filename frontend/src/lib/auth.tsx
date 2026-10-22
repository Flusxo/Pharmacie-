import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { User } from './types';
import { useI18n, type Lang } from '../i18n';

interface Auth {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string, code?: string) => Promise<User>;
  acceptSession: (token: string, user: User) => void;
  logout: () => void;
  /** Reloads the current user; returns it (null when logged out). */
  refresh: () => Promise<User | null>;
}
const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const { setLang } = useI18n();
  // The account's language wins when a session starts (login or reload); switching later saves it.
  const applyAccountLanguage = useCallback((u: User) => u.language && setLang(u.language), [setLang]);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) return null;
    const r = await api<{ user: User }>('/auth/me');
    setUser(r.user);
    return r.user;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) {
      setReady(true);
      return;
    }
    api<{ user: User }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        applyAccountLanguage(r.user);
      })
      .catch(() => logout())
      .finally(() => setReady(true));
  }, [logout, applyAccountLanguage]);

  const acceptSession = useCallback(
    (token: string, u: User) => {
      setToken(token);
      setUser(u);
      applyAccountLanguage(u);
    },
    [applyAccountLanguage],
  );

  const login = useCallback(
    async (email: string, password: string, code?: string) => {
      const r = await api<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: { email, password, code: code || undefined },
      });
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

/** Changes the UI language and, when logged in, saves it on the account (used for emails too). */
export function useChangeLanguage(): (l: Lang) => void {
  const { setLang } = useI18n();
  const user = useContext(Ctx)?.user;
  return useCallback(
    (l: Lang) => {
      setLang(l);
      if (user) void api('/auth/me/preferences', { method: 'PATCH', body: { language: l } }).catch(() => {});
    },
    [setLang, user],
  );
}

/** Where each role lands after login. */
export function homeFor(user: User): string {
  if ((user.role === 'doctor' || user.role === 'pharmacy') && (!user.verified || user.status !== 'active')) return '/waiting';
  return { patient: '/home', doctor: '/doctor', pharmacy: '/pharmacy', staff: '/admin' }[user.role];
}
