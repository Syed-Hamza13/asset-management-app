import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, clearCsrf } from '../api/client';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => { api.me().then(r => setUser(r.data.user)).catch(() => setUser(null)).finally(() => setBooting(false)); }, []);
  const login = async (body) => { const r = await api.login(body); setUser(r.data.user); };
  const logout = async () => { await api.logout().catch(() => {}); clearCsrf(); setUser(null); };
  const refresh = useCallback(async () => {
    try { const r = await api.me(); setUser(r.data.user); } catch { setUser(null); }
  }, []);
  const can = useCallback((capability) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    return (user.permissions || []).includes(capability);
  }, [user]);
  return <AuthContext.Provider value={{ user, booting, login, logout, refresh, can, isAdmin: user?.role === 'admin' }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
