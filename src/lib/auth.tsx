import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, setAuthToken } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  ready: boolean;
  /** accessToken: returned by customer logins; kept only inside the SuperApp mini-app. */
  signIn: (user: User, accessToken?: string) => void;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  // The session cookie is httpOnly, so JS can't check for it directly — just ask
  // the API and treat a 401 as "not logged in".
  const refresh = useCallback(async () => {
    try {
      setUser(await api<User>('/auth/me'));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setAuthToken(null); // expired mini-app token
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, [refresh]);

  const signIn = useCallback((u: User, accessToken?: string) => {
    if (accessToken) setAuthToken(accessToken);
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAuthToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, signIn, signOut, refresh }}>{children}</AuthContext.Provider>
  );
}

// useAuth is tightly coupled to the module-private AuthContext above; splitting it into
// its own file for Fast Refresh would mean exporting the context too, which is worse.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
