import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Alert, Button, Card, Input } from '../components/ui';
import { Turnstile } from '../components/Turnstile';

export function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' }); const [token,setToken]=useState(''); const [config,setConfig]=useState(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(false); const updateToken=useCallback(setToken, []);
  useEffect(() => { api.turnstileConfig().then(r=>setConfig(r.data)).catch(()=>setConfig({ enforce:false })); }, []);
  async function submit(e) { e.preventDefault(); setError(''); setLoading(true); try { await login({ ...form, turnstileToken: token }); } catch(e) { setError(e.message); } finally { setLoading(false); } }
  return <div className="grid min-h-screen place-items-center bg-slate-100 p-4"><div className="flex w-full max-w-md flex-col items-center gap-4 md:max-w-4xl md:flex-row md:items-start md:justify-center md:gap-6"><Card className="w-full p-7 md:max-w-md md:flex-1"><div className="mb-7"><h1 className="text-2xl font-bold">Welcome back</h1><p className="mt-2 text-sm text-slate-500">Sign in to manage your assets.</p></div>{error && <div className="mb-4"><Alert>{error}</Alert></div>}<form onSubmit={submit} className="space-y-4"><Input label="Email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required autoComplete="email"/><Input label="Password" type="password" value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required autoComplete="current-password"/><Turnstile onToken={updateToken} config={config}/><Button className="w-full" loading={loading} disabled={!token}>Login</Button></form></Card><QuickEntryCard turnstileConfig={config} /></div></div>;
}

function QuickEntryCard({ turnstileConfig }) {
  const [pub, setPub] = useState(null);
  const [extra, setExtra] = useState({});
  const [notifySel, setNotifySel] = useState([]);
  const [qToken, setQToken] = useState('');
  const updateQToken = useCallback(setQToken, []);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { api.quickEntry.publicConfig().then(r => setPub(r.data)).catch(() => setPub({ enabled: false, fields: [] })); }, []);
  if (!pub || !pub.enabled) return null;

  const needsToken = Boolean(turnstileConfig?.enforce);
  const canSubmit = !needsToken || Boolean(qToken);

  async function send(e) {
    e.preventDefault(); setError('');
    if (pub.notifyPicker && notifySel.length === 0) { setError('Select at least one person to notify.'); return; }
    setBusy(true);
    try {
      await api.quickEntry.submit({
        turnstileToken: qToken || 'bypass',
        notifyUserIds: pub.notifyPicker ? notifySel : [],
        fields: pub.fields.map((f) => ({ id: f.id, value: extra[f.id] ?? '' })),
      });
      setDone(true);
      setExtra({});
      setNotifySel([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="w-full p-5 md:max-w-md md:flex-1 md:p-6">
      <div>
        <h2 className="font-semibold">{pub.title || 'Quick Entry'}</h2>
        <p className="mt-1 text-sm text-slate-500">{pub.subtitle || 'Submit a request without signing in.'}</p>
      </div>
      <div className="mt-4">
        {done ? (
          <div className="space-y-3">
            <Alert type="success">Your entry was submitted. The relevant people have been notified.</Alert>
            <Button variant="secondary" onClick={() => setDone(false)}>Submit another</Button>
          </div>
        ) : (
          <form onSubmit={send} className="space-y-4">
            {error && <Alert>{error}</Alert>}
            {pub.fields.map((f) => (
              <Input
                key={f.id}
                label={f.label}
                type={f.type === 'multiline' ? 'textarea' : 'text'}
                placeholder={f.placeholder || ''}
                required={f.required}
                value={extra[f.id] ?? ''}
                onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })}
              />
            ))}
            {pub.notifyPicker && (
              <NotifyPicker options={pub.selectable} value={notifySel} onChange={setNotifySel} />
            )}
            <Turnstile onToken={updateQToken} config={turnstileConfig} />
            <Button className="w-full" loading={busy} disabled={!canSubmit}>Submit</Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function NotifyPicker({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const toggle = (id) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="relative">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        Notify<span className="text-red-500"> *</span>
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm outline-none focus:border-slate-400"
      >
        {value.length ? `${value.length} selected` : 'Select people to notify...'}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
            {options.map((o) => (
              <label key={o.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
                <span className="truncate">{o.label}</span>
              </label>
            ))}
            {!options.length && <div className="px-2 py-2 text-sm text-slate-500">No one available.</div>}
          </div>
        </>
      )}
    </div>
  );
}
