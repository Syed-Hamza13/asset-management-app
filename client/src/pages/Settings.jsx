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

function QuickEntryCard() {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [users, setUsers] = useState([]);
  const [enabled, setEnabled] = useState(false);
  const [notifyPicker, setNotifyPicker] = useState(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [fields, setFields] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.quickEntry.get(), api.users.list()])
      .then(([c, u]) => {
        setCfg(c.data);
        setEnabled(c.data.enabled);
        setNotifyPicker(c.data.notifyPicker);
        setTitle(c.data.title);
        setSubtitle(c.data.subtitle);
        setNotifyTitle(c.data.notifyTitle);
        setNotifyBody(c.data.notifyBody);
        setFields(c.data.fields);
        setRecipients(c.data.recipients);
        setUsers(u.data.filter((usr) => usr.isActive));
      })
      .catch((e) => setError(e.message));
  }, []);

  function addField() {
    setFields((f) => [...f, { label: "", type: "text", placeholder: "", required: false }]);
  }
  function updateField(i, patch) {
    setFields((f) => f.map((field, idx) => (idx === i ? { ...field, ...patch } : field)));
  }
  function removeField(i) {
    setFields((f) => f.filter((_, idx) => idx !== i));
  }
  function toggleRecipient(id) {
    setRecipients((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  }

  async function save() {
    setError(""); setBusy(true);
    try {
      const payload = {
        enabled,
        notifyPicker,
        title: title.trim(),
        subtitle: subtitle.trim(),
        notifyTitle: notifyTitle.trim(),
        notifyBody: notifyBody.trim(),
        fields: fields
          .map((f) => ({
            label: f.label.trim(),
            type: f.type,
            placeholder: (f.placeholder || "").trim(),
            required: Boolean(f.required),
          }))
          .filter((f) => f.label),
        recipients,
      };
      const res = await api.quickEntry.save(payload);
      setCfg(res.data);
      setFields(res.data.fields);
      setRecipients(res.data.recipients);
      setEnabled(res.data.enabled);
      setNotifyPicker(res.data.notifyPicker);
      setTitle(res.data.title);
      setSubtitle(res.data.subtitle);
      setNotifyTitle(res.data.notifyTitle);
      setNotifyBody(res.data.notifyBody);
      showToast("Quick Entry settings saved.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!cfg) return <Card className="p-6"><h3 className="font-semibold">Quick Entry</h3><p className="mt-1 text-sm text-slate-500">Loading…</p></Card>;

  const tokens = [...fields.map((f) => f.label.trim()).filter(Boolean), "all"];

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Quick Entry</h3>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          {enabled ? <span className="font-semibold text-emerald-700">Enabled</span> : <span className="text-slate-500">Disabled</span>}
        </label>
      </div>
      <p className="mt-1 text-sm text-slate-500">Show a quick-entry form on the login screen. Submissions do not create assets; they notify the users you pick below.</p>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Input label="Form heading" hint="Shown on the login-screen card." placeholder="Quick Entry" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        <Input label="Sub-heading" hint="The line under the heading." placeholder="Submit a request without signing in." value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={255} />
      </div>

      <div className="mt-6">
        <div className="mb-1.5 text-sm font-medium text-slate-700">Form fields</div>
        <p className="mb-3 text-xs text-slate-500">Only these fields appear on the login-screen form. Nothing is built in.</p>
        <div className="space-y-3">
          {fields.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <input className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Field label" value={f.label} onChange={(e) => updateField(i, { label: e.target.value })} maxLength={120} />
                <select className="rounded-xl border border-slate-200 px-2 py-2 text-sm" value={f.type} onChange={(e) => updateField(i, { type: e.target.value })}>
                  <option value="text">Text</option>
                  <option value="multiline">Long text</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={f.required} onChange={(e) => updateField(i, { required: e.target.checked })} />
                  Required
                </label>
                <button type="button" className="rounded-lg px-2 py-1 text-sm text-red-600 hover:bg-red-50" onClick={() => removeField(i)}>Remove</button>
              </div>
              <input className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400" placeholder="Placeholder text shown inside the empty field (optional)" value={f.placeholder || ""} onChange={(e) => updateField(i, { placeholder: e.target.value })} maxLength={255} />
            </div>
          ))}
        </div>
        <Button variant="secondary" className="mt-3" onClick={addField}>+ Add field</Button>
      </div>

      <div className="mt-6">
        <div className="mb-1.5 text-sm font-medium text-slate-700">Notification the user receives</div>
        <p className="mb-3 text-xs text-slate-500">
          Use {"{curly braces}"} to insert a field answer, or {"{all}"} for every filled field on its own line.
          Available: {tokens.length ? tokens.map((t) => <code key={t} className="rounded bg-slate-100 px-1 py-0.5 text-[11px]">{`{${t}}`}</code>) : <span>add a field first</span>}
        </p>
        <div className="space-y-4">
          <Input label="Notification title" placeholder="New entry: first answer" value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} maxLength={200} />
          <Input label="Notification message" type="textarea" placeholder="Leave empty to list every filled field." value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} maxLength={2000} />
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-1.5 text-sm font-medium text-slate-700">Notify these users</div>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={notifyPicker} onChange={(e) => setNotifyPicker(e.target.checked)} />
          Let the person submitting choose who to notify (shows a name dropdown on the form)
        </label>
        {users.length ? (
          <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={recipients.includes(u.id)} onChange={() => toggleRecipient(u.id)} />
                <span className="truncate">{u.displayName ? `${u.displayName} (${u.email})` : u.email}</span>
                {u.role === "admin" && <span className="ml-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">admin</span>}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No active users.</p>
        )}
      </div>

      <div className="mt-6">
        <Button onClick={save} loading={busy}>Save Quick Entry settings</Button>
      </div>
    </Card>
  );
}

function IpAccessCard() {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [quickEntryEnabled, setQuickEntryEnabled] = useState(false);
  const [list, setList] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.ipAccess.get().then((res) => {
      setCfg(res.data);
      setLoginEnabled(res.data.loginEnabled);
      setQuickEntryEnabled(res.data.quickEntryEnabled);
      setList(res.data.list || "");
    }).catch((e) => setError(e.message));
  }, []);

  const unchanged = cfg
    && loginEnabled === cfg.loginEnabled
    && quickEntryEnabled === cfg.quickEntryEnabled
    && list === (cfg.list || "");

  async function save() {
    setError(""); setBusy(true);
    try {
      const res = await api.ipAccess.update({ loginEnabled, quickEntryEnabled, list });
      setCfg(res.data); setList(res.data.list || "");
      showToast("Network restriction saved.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function addYourIp() {
    const ip = cfg?.yourIp;
    if (!ip) return;
    setList((prev) => {
      const already = prev.split(/[\n,;]+/).map((entry) => entry.trim()).includes(ip);
      if (already) return prev;
      return prev.trim() ? `${prev.trim()}\n${ip}` : ip;
    });
  }

  if (!cfg) return <Card className="p-6"><h3 className="font-semibold">Network restriction (IP allowlist)</h3><p className="mt-1 text-sm text-slate-500">Loading…</p></Card>;

  const anyEnabled = loginEnabled || quickEntryEnabled;
  const lockoutWarning = (cfg.loginEnabled || cfg.quickEntryEnabled) && !cfg.yourIpAllowed
    ? `Your current IP (${cfg.yourIp || "unknown"}) is not on the saved list, so this very page would show 404 (Not Found) after you sign out. Add it before keeping a switch on.`
    : "";
  const bypassNotice = cfg.enforced === false
    ? "Enforcement is currently switched off on the server (IP_ACCESS_ENFORCE=false), so the list below is saved but not applied."
    : "";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Network restriction (IP allowlist)</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${anyEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {anyEnabled ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Only the addresses or networks listed below can use this app. Anyone outside them gets a plain 404 (Not Found) — no login page, no message, nothing else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-500">IP the server sees for you:</span>
        <span className="font-mono font-semibold text-slate-800">{cfg.yourIp || "unknown"}</span>
        <Button variant="secondary" className="ml-auto px-3 py-1.5 text-xs" onClick={addYourIp}>Add to list</Button>
        <p className="w-full text-xs text-slate-500">
          Check this value from a second device before relying on the list: if the app runs in Docker with a published port, every visitor can appear as the same gateway IP, and a per-device range will not match.
        </p>
      </div>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {lockoutWarning && <div className="mt-4"><Alert>{lockoutWarning}</Alert></div>}
      {bypassNotice && <div className="mt-4"><Alert>{bypassNotice}</Alert></div>}
      {cfg.invalidCount > 0 && (
        <div className="mt-4"><Alert>{`${cfg.invalidCount} saved entries could not be read and are ignored: ${cfg.invalid.slice(0, 5).map((entry) => entry.raw).join(", ")}`}</Alert></div>
      )}

      <div className="mt-5 space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={loginEnabled} onChange={(e) => setLoginEnabled(e.target.checked)} />
          <span><span className="font-medium">Restrict the whole app</span><span className="block text-slate-500">Sign-in and every page answer 404 for networks outside the list.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={quickEntryEnabled} onChange={(e) => setQuickEntryEnabled(e.target.checked)} />
          <span><span className="font-medium">Restrict Quick Entry</span><span className="block text-slate-500">The form stays hidden and submissions are rejected for other networks.</span></span>
        </label>
      </div>

      <div className="mt-5">
        <Input
          label="Allowed addresses"
          type="textarea"
          spellCheck={false}
          placeholder={"192.168.1.23\n192.168.1.0/24\n10.0.0.5-10.0.0.40\n192.168.7.*"}
          value={list}
          onChange={(e) => setList(e.target.value)}
          hint={`One per line (or separated by commas). Accepts a single IP, a CIDR block, a from-to range or a trailing wildcard. ${cfg.entryCount} of ${cfg.maxEntries} entries in use.`}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} loading={busy} disabled={unchanged}>Save</Button>
      </div>
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
    try { await api.changePassword(form); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); showToast("Password changed successfully."); setTimeout(() => window.location.assign("/"), 400); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  async function saveBranding(event) {
    event.preventDefault(); setBrandingError(""); setBrandingLoading(true);
    try {
      if (branding.favicon) await api.branding.update("favicon_data_url", branding.favicon);
      if (branding.appIcon) await api.branding.update("app_icon_data_url", branding.appIcon);
      showToast("Branding saved successfully.");
      const iconLink = document.querySelector('link[rel="icon"]');
      if (iconLink) iconLink.href = `/api/v1/branding/icon?t=${Date.now()}`;
    }
    catch (e) { setBrandingError(e.message); } finally { setBrandingLoading(false); }
  }

  return <div className="max-w-xl space-y-6">
    <div><h2 className="text-xl font-bold">Settings & Security</h2><p className="mt-1 text-sm text-slate-500">Manage your account and application branding.</p></div>
    {user?.mustChangePassword && <Alert>You must change your password before continuing. Use your temporary password as the current password below.</Alert>}
    {can("branding.manage") && <Card className="p-6"><h3 className="font-semibold">Application branding</h3><p className="mt-1 text-sm text-slate-500">Upload a favicon and app icon for this workspace.</p><div className="mt-5">{brandingError && <div className="mb-4"><Alert>{brandingError}</Alert></div>}<form onSubmit={saveBranding} className="space-y-5"><ImageUpload label="Favicon" value={branding.favicon} onChange={(value, message) => { setBranding({ ...branding, favicon: value || branding.favicon }); setBrandingError(message); }} /><ImageUpload label="App icon" value={branding.appIcon} onChange={(value, message) => { setBranding({ ...branding, appIcon: value || branding.appIcon }); setBrandingError(message); }} /><Button loading={brandingLoading}>Save branding</Button></form></div></Card>}
    {isAdmin && <TurnstileCard />}
    {isAdmin && <IpAccessCard />}
    {isAdmin && <QuickEntryCard />}
    {isAdmin && <SmtpCard />}
    <Card className="p-6"><h3 className="font-semibold">Change password</h3><div className="mt-5">{error && <div className="mb-4"><Alert>{error}</Alert></div>}<form onSubmit={submitPassword} className="space-y-4"><Input label="Current password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /><Input label="New password" type="password" minLength={10} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /><Input label="Confirm new password" type="password" minLength={10} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required /><Button loading={loading}>Change password</Button></form></div></Card>
  </div>;
}