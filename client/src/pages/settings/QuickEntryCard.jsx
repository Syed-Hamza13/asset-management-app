import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Card, Input } from "../../components/ui";

export function QuickEntryCard() {
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
