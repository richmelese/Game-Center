'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, tokens } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  signIn: (accessToken: string, user: User) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!tokens.customer()) {
      setUser(null);
      return;
    }
    try {
      setUser(await api<User>('/auth/me'));
    } catch {
      tokens.setCustomer(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback((accessToken: string, u: User) => {
    tokens.setCustomer(accessToken);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    tokens.setCustomer(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
