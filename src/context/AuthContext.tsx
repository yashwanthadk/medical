import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authHeaders, setStoredSessionToken } from '../lib/authToken';
import type { AuthUser } from '../types/medical';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  aiConfigured: boolean;
  refreshAuth: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const [meRes, healthRes] = await Promise.all([
        fetch('/api/auth/me', {
          credentials: 'include',
          headers: authHeaders(),
        }),
        fetch('/api/health'),
      ]);

      if (healthRes.ok) {
        const health = (await healthRes.json()) as { aiConfigured?: boolean };
        setAiConfigured(Boolean(health.aiConfigured));
      }

      if (meRes.ok) {
        const data = (await meRes.json()) as { user: AuthUser; aiConfigured?: boolean };
        setUser(data.user);
        if (typeof data.aiConfigured === 'boolean') {
          setAiConfigured(data.aiConfigured);
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
    }).catch(() => undefined);
    setStoredSessionToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, aiConfigured, refreshAuth, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
