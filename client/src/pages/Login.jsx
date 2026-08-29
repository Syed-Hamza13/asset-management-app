import { useCallback, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Card, Input } from '../components/ui';
import { Turnstile } from '../components/Turnstile';

export function Login() {
  const { user, login } = useAuth(); const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' }); const [token,setToken]=useState(''); const [error,setError]=useState(''); const [loading,setLoading]=useState(false); const updateToken=useCallback(setToken, []);
  if (user) return <Navigate to={location.state?.from || '/'} replace />;
  async function submit(e) { e.preventDefault(); setError(''); setLoading(true); try { await login({ ...form, turnstileToken: token }); } catch(e) { setError(e.message); } finally { setLoading(false); } }
  return <div className="grid min-h-screen place-items-center bg-slate-100 p-4"><Card className="w-full max-w-md p-7"><div className="mb-7"><h1 className="text-2xl font-bold">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in to manage your assets.</p></div>{error && <div className="mb-4"><Alert>{error}</Alert></div>}<form onSubmit={submit} className="space-y-4"><Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required autoComplete="email"/><Input label="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required autoComplete="current-password"/><Turnstile onToken={updateToken}/><Button className="w-full" loading={loading} disabled={!token}>Login</Button></form></Card></div>;
}
