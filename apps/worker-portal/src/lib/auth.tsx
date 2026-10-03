'use client';

import { createApiClient, type User } from '@flexshift/api-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let unauthorizedHandler: (() => void) | undefined;

/** Single shared API client for the worker portal. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  app: 'worker', // the session is an HttpOnly cookie; no token is stored in the browser
  onUnauthorized: () => unauthorizedHandler?.(),
});

export interface RegisterBody {
  email: string; password: string; firstName: string; lastName: string; phone: string; registrationNumber: string;
  profession?: string; hourlyRate?: number; minimumShiftRate?: number; systemTags?: string[]; accreditations?: string[]; country?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (body: RegisterBody) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => setUser(null), []);

  useEffect(() => {
    unauthorizedHandler = clear;
    // Ask the server whether the cookie holds a valid worker session.
    api.auth.me().then((u) => (u.role === 'RELIEF_WORKER' ? setUser(u) : clear()), clear).finally(() => setLoading(false));
  }, [clear]);

  const accept = useCallback((res: { accessToken: string; user: User }) => {
    setUser(res.user); // the session itself is the HttpOnly cookie the server just set
    return res.user;
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    if (res.user.role !== 'RELIEF_WORKER') {
      await api.auth.logout().catch(() => {}); // the server already set a cookie: drop it
      throw new Error('This portal is for relief workers. Organization staff should use the admin dashboard.');
    }
    return accept(res);
  }, [accept]);

  const register = useCallback(async (body: RegisterBody) => accept(await api.auth.registerWorker({ ...body })), [accept]);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* token may already be invalid */ }
    clear();
  }, [clear]);

  const changePassword = useCallback(async (current: string, next: string) => {
    await api.auth.changePassword(current, next); // the server rotates the session cookie
    setUser(await api.auth.me());
  }, []);

  const refresh = useCallback(async () => { setUser(await api.auth.me()); }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, changePassword, refresh }),
    [user, loading, login, register, logout, changePassword, refresh],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
