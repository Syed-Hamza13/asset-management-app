import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Alert, Button, Card, Input } from '../components/ui';
import { Turnstile } from '../components/Turnstile';

export function Setup() {
  const [form, setForm] = useState({ email: '', password: '', confirmPassword: '' });
  const [token, setToken] = useState(''); const [config, setConfig] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const navigate = useNavigate();
  const updateToken = useCallback((v) => setToken(v), []);
  useEffect(() => { api.turnstileConfig().then(r => setConfig(r.data)).catch(() => setConfig({ enforce: false })); }, []);
  async function submit(e) { e.preventDefault(); setError(''); if (form.password !== form.confirmPassword) return setError('Passwords do not match.'); setLoading(true); try { await api.setup({ ...form, turnstileToken: token }); navigate('/', { replace: true }); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  return <div className="grid min-h-screen place-items-center bg-slate-100 p-4"><Card className="w-full max-w-md p-7"><div className="mb-7"><p className="text-sm font-semibold text-slate-500">First-time setup</p><h1 className="mt-1 text-2xl font-bold">Create admin account</h1><p className="mt-2 text-sm text-slate-500">This screen is available only once.</p></div>{error && <div className="mb-4"><Alert>{error}</Alert></div>}<form onSubmit={submit} className="space-y-4"><Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required autoComplete="email"/><Input label="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required minLength={10} autoComplete="new-password"/><Input label="Confirm password" type="password" value={form.confirmPassword} onChange={e=>setForm({...form,confirmPassword:e.target.value})} required autoComplete="new-password"/><Turnstile onToken={updateToken} config={config}/><Button className="w-full" loading={loading} disabled={!token}>Create admin account</Button></form></Card></div>;
}
