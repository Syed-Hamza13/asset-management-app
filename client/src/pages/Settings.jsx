import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Alert, Button, Card, Input } from "../components/ui";

const maxImageSize = 2 * 1024 * 1024;

function SmtpCard() {
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

function TurnstileCard() {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.turnstile.settings().then((res) => { setCfg(res.data); setEnabled(res.data.enabled); })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    setError(""); setBusy(true);
    try { const res = await api.turnstile.update(enabled); setCfg(res.data); showToast(`Turnstile is now ${res.data.enabled ? "enabled" : "disabled"}.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!cfg) return <Card className="p-6"><h3 className="font-semibold">Turnstile (human verification)</h3><p className="mt-1 text-sm text-slate-500">Loading…</p></Card>;

  const warning = cfg.enabled && !cfg.hasSiteKey
    ? "Turnstile is enabled but this server has no site key, so sign-in will be blocked."
    : cfg.enabled && !cfg.hasSecretKey
      ? "Turnstile is enabled but this server has no secret key, so verification cannot complete."
      : "";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Turnstile (human verification)</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {cfg.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Show a Cloudflare Turnstile challenge on the sign-in and setup pages. Only applies in production.</p>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {warning && <div className="mt-4"><Alert>{warning}</Alert></div>}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Require Turnstile verification
        </label>
        <Button onClick={save} loading={busy} disabled={enabled === cfg.enabled}>Save</Button>
      </div>
    </Card>
  );
}

function ImageUpload({ label, value, onChange }) {
  function selectImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > maxImageSize) {
      onChange(null, "Please choose an image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result, "");
    reader.readAsDataURL(file);
  }
  return <div className="flex items-center gap-3">
    {value && <img src={value} alt="Preview" className="h-12 w-12 rounded-xl border border-slate-200 object-cover" />}
    <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-700">{label}</div><div className="text-xs text-slate-500">PNG, JPG, GIF or SVG, max 2 MB</div></div>
    <label className="inline-flex cursor-pointer items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Choose image<input type="file" accept="image/*" className="sr-only" onChange={selectImage} /></label>
  </div>;
}

export function Settings() {
  const { logout, can, user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [branding, setBranding] = useState({ favicon: "", appIcon: "" });
  const [error, setError] = useState("");
  const [brandingError, setBrandingError] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  useEffect(() => {
    if (!can("branding.manage")) return;
    api.branding.get().then((response) => setBranding(response.data)).catch(() => {});
  }, []);

  async function submitPassword(event) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await api.changePassword(form); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); showToast("Password changed successfully."); setTimeout(() => window.location.assign("/login"), 400); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  async function saveBranding(event) {
    event.preventDefault(); setBrandingError(""); setBrandingLoading(true);
    try { if (branding.favicon) await api.branding.update("favicon_data_url", branding.favicon); if (branding.appIcon) await api.branding.update("app_icon_data_url", branding.appIcon); showToast("Branding saved successfully."); }
    catch (e) { setBrandingError(e.message); } finally { setBrandingLoading(false); }
  }

  return <div className="max-w-xl space-y-6">
    <div><h2 className="text-xl font-bold">Settings & Security</h2><p className="mt-1 text-sm text-slate-500">Manage your account and application branding.</p></div>
    {user?.mustChangePassword && <Alert>You must change your password before continuing. Use your temporary password as the current password below.</Alert>}
    {can("branding.manage") && <Card className="p-6"><h3 className="font-semibold">Application branding</h3><p className="mt-1 text-sm text-slate-500">Upload a favicon and app icon for this workspace.</p><div className="mt-5">{brandingError && <div className="mb-4"><Alert>{brandingError}</Alert></div>}<form onSubmit={saveBranding} className="space-y-5"><ImageUpload label="Favicon" value={branding.favicon} onChange={(value, message) => { setBranding({ ...branding, favicon: value || branding.favicon }); setBrandingError(message); }} /><ImageUpload label="App icon" value={branding.appIcon} onChange={(value, message) => { setBranding({ ...branding, appIcon: value || branding.appIcon }); setBrandingError(message); }} /><Button loading={brandingLoading}>Save branding</Button></form></div></Card>}
    {isAdmin && <TurnstileCard />}
    {isAdmin && <SmtpCard />}
    <Card className="p-6"><h3 className="font-semibold">Change password</h3><div className="mt-5">{error && <div className="mb-4"><Alert>{error}</Alert></div>}<form onSubmit={submitPassword} className="space-y-4"><Input label="Current password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /><Input label="New password" type="password" minLength={10} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /><Input label="Confirm new password" type="password" minLength={10} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required /><Button loading={loading}>Change password</Button></form></div></Card>
  </div>;
}