import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Card, Input } from "../../components/ui";

export function SmtpCard() {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({ host: "", port: 587, secure: false, username: "", fromEmail: "", fromName: "", replyTo: "", enabled: false });
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api.smtp.get().then((res) => {
      setCfg(res.data);
      setForm({
        host: res.data.host, port: res.data.port, secure: res.data.secure,
        username: res.data.username, fromEmail: res.data.fromEmail,
        fromName: res.data.fromName, replyTo: res.data.replyTo, enabled: res.data.enabled,
      });
    }).catch((e) => setError(e.message));
  }, []);

  function set(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function save(e) {
    e.preventDefault(); setError(""); setBusy("save");
    try {
      const body = { ...form, port: Number(form.port) };
      if (password) body.password = password;
      const res = await api.smtp.update(body);
      setCfg(res.data); setPassword("");
      showToast("SMTP settings saved.");
    } catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  async function clearPassword() {
    if (!confirm("Remove the stored SMTP password?")) return;
    setError(""); setBusy("clear");
    try { const res = await api.smtp.update({ password: null }); setCfg(res.data); showToast("Stored password removed."); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  async function testConnection() {
    setError(""); setBusy("conn");
    try { await api.smtp.testConnection(); showToast("SMTP connection OK."); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  async function sendTest(e) {
    e.preventDefault(); setError(""); setBusy("mail");
    try { await api.smtp.testEmail(testTo); showToast(`Test email sent to ${testTo}.`); }
    catch (err) { setError(err.message); } finally { setBusy(""); }
  }

  if (!cfg) return <Card className="p-6"><h3 className="font-semibold">SMTP</h3><p className="mt-1 text-sm text-slate-500">Loading…</p></Card>;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">SMTP (email delivery)</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.configured ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {cfg.configured ? "Configured" : "Not configured"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Global mail server used to deliver notification emails. Admins only.</p>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      <form onSubmit={save} className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2"><Input label="Host" value={form.host} onChange={(e) => set("host", e.target.value)} placeholder="smtp.example.com" /></div>
          <Input label="Port" type="number" value={form.port} onChange={(e) => set("port", e.target.value)} min={1} max={65535} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Username" value={form.username} onChange={(e) => set("username", e.target.value)} autoComplete="off" />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" hint={cfg.passwordConfigured ? "Stored. Leave blank to keep, or type to replace." : "Not set."} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="From email" type="email" value={form.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} required />
          <Input label="From name" value={form.fromName} onChange={(e) => set("fromName", e.target.value)} />
        </div>
        <Input label="Reply-To (optional)" type="email" value={form.replyTo} onChange={(e) => set("replyTo", e.target.value)} />
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.secure} onChange={(e) => set("secure", e.target.checked)} /> Use TLS/SSL (secure)</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Enabled</label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button loading={busy === "save"} disabled={Boolean(busy) && busy !== "save"}>Save SMTP</Button>
          <Button type="button" variant="secondary" loading={busy === "conn"} disabled={Boolean(busy) && busy !== "conn"} onClick={testConnection}>Test connection</Button>
          {cfg.passwordConfigured && <Button type="button" variant="ghost" loading={busy === "clear"} disabled={Boolean(busy) && busy !== "clear"} onClick={clearPassword}>Clear password</Button>}
        </div>
      </form>
      <form onSubmit={sendTest} className="mt-5 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-5">
        <div className="min-w-56 flex-1"><Input label="Send a test email to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" /></div>
        <Button type="submit" variant="secondary" loading={busy === "mail"} disabled={(Boolean(busy) && busy !== "mail") || !cfg.configured}>Send test email</Button>
      </form>
    </Card>
  );
}
