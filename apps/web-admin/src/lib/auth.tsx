'use client';

import { createApiClient, type FacilityBranch, type User } from '@flexshift/api-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const TOKEN_KEY = 'flexshift_token';
const BRANCH_KEY = 'flexshift_branch';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

let unauthorizedHandler: (() => void) | undefined;

/** Single shared API client for the admin app. */
export const api = createApiClient({
  baseUrl: API_BASE_URL,
  getToken: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  onUnauthorized: () => unauthorizedHandler?.(),
});

interface AuthState {
  user: User | null;
  /** True until the stored session has been checked. */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);
export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
};

const STAFF = ['SUPER_ADMIN', 'ORG_ADMIN', 'FACILITY_MANAGER'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    unauthorizedHandler = clear;
    if (!window.localStorage.getItem(TOKEN_KEY)) {
      setLoading(false);
      return;
    }
    api.auth.me().then(
      (u) => (STAFF.includes(u.role) ? setUser(u) : clear()),
      clear,
    ).finally(() => setLoading(false));
  }, [clear]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    if (!STAFF.includes(res.user.role)) {
      throw new Error('This dashboard is for organization staff. Relief workers should use the worker portal.');
    }
    window.localStorage.setItem(TOKEN_KEY, res.accessToken);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.auth.logout(); } catch { /* token may already be invalid */ }
    clear();
  }, [clear]);

  const changePassword = useCallback(async (current: string, next: string) => {
    const { accessToken } = await api.auth.changePassword(current, next);
    window.localStorage.setItem(TOKEN_KEY, accessToken);
    setUser(await api.auth.me());
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, changePassword }), [user, loading, login, logout, changePassword]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ---------- Branch / organization scope ---------- */
interface ScopeState {
  branches: FacilityBranch[];
  loading: boolean;
  /** Selected branch id, or '' for "all branches I can see". */
  branchId: string;
  setBranchId: (id: string) => void;
  /** Branch ids a page should load data for (the selection, or every visible branch). */
  branchIds: string[];
  orgId: string | undefined;
  /** Facility managers are fixed to one branch. */
  canPickBranch: boolean;
}

const ScopeCtx = createContext<ScopeState | null>(null);
export const useScope = () => {
  const ctx = useContext(ScopeCtx);
  if (!ctx) throw new Error('useScope must be used inside <ScopeProvider>');
  return ctx;
};

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [branches, setBranches] = useState<FacilityBranch[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchId, setBranchIdState] = useState('');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    api.branches.list().then(
      (list) => {
        setBranches(list);
        const saved = window.localStorage.getItem(BRANCH_KEY) ?? '';
        setBranchIdState(list.length === 1 ? list[0].id : list.some((b) => b.id === saved) ? saved : '');
      },
      () => setBranches([]),
    ).finally(() => setLoading(false));
  }, [user]);

  const setBranchId = useCallback((id: string) => {
    window.localStorage.setItem(BRANCH_KEY, id);
    setBranchIdState(id);
  }, []);

  const value = useMemo<ScopeState>(() => {
    const selected = branches.find((b) => b.id === branchId);
    return {
      branches,
      loading,
      branchId,
      setBranchId,
      branchIds: branchId ? [branchId] : branches.map((b) => b.id),
      orgId: user?.organizationId ?? selected?.organizationId ?? branches[0]?.organizationId,
      canPickBranch: branches.length > 1,
    };
  }, [branches, loading, branchId, setBranchId, user]);

  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}
