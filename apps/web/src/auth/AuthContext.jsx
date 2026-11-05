import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, setCsrfToken } from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me');
      setCsrfToken(data.csrfToken);
      setUser(data.user);
      setReason(data.reason || null);
      return data;
    } catch (error) {
      setUser(null);
      setReason(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    setCsrfToken(data.csrfToken);
    setUser(data.user);
    setReason(null);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    await refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      user,
      loading,
      reason,
      isAdmin: user?.role === 'admin',
      isManager: user?.role === 'admin' || user?.role === 'manager',
      login,
      logout,
      refresh,
    }),
    [user, loading, reason, login, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
