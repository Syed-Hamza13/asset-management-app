import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearCsrf } from '../api/client';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  useEffect(() => { api.me().then(r => setUser(r.data.user)).catch(() => setUser(null)).finally(() => setBooting(false)); }, []);
  const login = async (body) => { const r = await api.login(body); setUser(r.data.user); };
  const logout = async () => { await api.logout().catch(() => {}); clearCsrf(); setUser(null); };
  return <AuthContext.Provider value={{ user, booting, login, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
