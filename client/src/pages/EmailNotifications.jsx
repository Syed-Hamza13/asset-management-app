import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { Alert, Button, Card, EmptyState, Input, Modal, Select } from "../components/ui";

const PLACEHOLDERS = [
  "{{asset_type_name}}", "{{asset_public_id}}", "{{created_at}}", "{{updated_at}}",
  "{{user.email}}", "{{user.name}}", "{{field.<key>}}", "{{field.<key>.previous}}",
];

function Tabs({ tab, setTab }) {
  const items = [["templates", "Templates"], ["recipients", "Recipients"], ["rules", "Rules"]];
  return (
    <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1">
      {items.map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function TemplatesTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [fieldMeta, setFieldMeta] = useState([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [insertPrevious, setInsertPrevious] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  async function load() {
    try {
      const [t, tp] = await Promise.all([api.assetTypes.list(), api.email.templates.list()]);
      setTypes(t.data); setRows(tp.data);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  // Build the union of every field across the user's asset types, tagging how
  // many types each appears in so common columns (all types) can be highlighted.
  useEffect(() => {
    if (!types.length) { setFieldMeta([]); return; }
    let active = true;
    setFieldsLoading(true);
    Promise.all(types.map((t) => api.assetTypes.form(t.id).then((r) => r.data || []).catch(() => [])))
      .then((forms) => {
        if (!active) return;
        const map = new Map();
        for (const fs of forms) {
          const seen = new Set();
          for (const f of fs) {
            const fk = f.field_key || f.key;
            if (!fk || seen.has(fk)) continue;
            seen.add(fk);
            const entry = map.get(fk) || { key: fk, name: f.name, type: f.type, usedIn: 0 };
            entry.usedIn += 1;
            map.set(fk, entry);
          }
        }
        setFieldMeta([...map.values()]);
        setFieldsLoading(false);
      });
    return () => { active = false; };
  }, [types]);
  function insert(token) {
    setEditing((cur) => ({ ...cur, bodyTemplate: `${cur.bodyTemplate || ""}${token}` }));
  }
  async function save(e) {
    e.preventDefault();
    try {
      if (editing.id) await api.email.templates.update(editing.id, editing);
      else await api.email.templates.create(editing);
      showToast("Template saved."); setEditing(null); await load();
    } catch (err) { setError(err.message); }
  }
  async function remove(row) {
    if (!confirm(`Delete template "${row.name}"?`)) return;
    try { await api.email.templates.remove(row.id); showToast("Template deleted."); await load(); }
    catch (e) { setError(e.message); }
  }
  const commonFields = fieldMeta.filter((f) => f.usedIn === types.length);
  const otherFields = fieldMeta.filter((f) => f.usedIn < types.length);
  const renderChips = (list) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((f) => (
        <button key={f.key} type="button" title={`{{field.${f.key}}}${f.usedIn < types.length ? ` · in ${f.usedIn} of ${types.length} asset types` : ' · in all asset types'}`}
          className="rounded-lg bg-indigo-50 px-2 py-1 font-mono text-xs text-indigo-700 hover:bg-indigo-100"
          onClick={() => insert(`{{field.${f.key}${insertPrevious ? ".previous" : ""}}}`)}>
          {f.name}
        </button>
      ))}
    </div>
  );
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setEditing({ name: "", subjectTemplate: "", bodyTemplate: "", isActive: true })}>+ New Template</Button></div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {rows.length === 0 ? <EmptyState title="No templates yet" description="Create an email template with placeholders to use in your rules." /> : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">{t.name} {!t.isActive && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">inactive</span>}</div>
                <div className="truncate text-xs text-slate-500">{t.subjectTemplate}</div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" onClick={() => setEditing({ ...t })}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(t)}>Delete</Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Modal open={Boolean(editing)} title={editing?.id ? "Edit Template" : "New Template"} onClose={() => setEditing(null)} className="max-w-2xl">
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} required />
            <Input label="Subject" value={editing.subjectTemplate} onChange={(e) => setEditing({ ...editing, subjectTemplate: e.target.value })} required />
            <Input label="Body" type="textarea" value={editing.bodyTemplate} onChange={(e) => setEditing({ ...editing, bodyTemplate: e.target.value })} hint="Plain text. Click any placeholder to insert it into the body." />
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">General placeholders</div>
              <div className="flex flex-wrap gap-1.5">
                {PLACEHOLDERS.map((p) => (
                  <button key={p} type="button" className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs text-slate-600 hover:bg-slate-200"
                    onClick={() => insert(p)}>{p}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Asset field placeholders</div>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <input type="checkbox" checked={insertPrevious} onChange={(e) => setInsertPrevious(e.target.checked)} />
                  previous value (.previous)
                </label>
              </div>
              <p className="mb-1 text-xs text-slate-500">Every field from your asset forms. A field that isn&rsquo;t on the triggered asset renders blank, so use the common ones for shared rules.</p>
              {fieldsLoading ? (
                <div className="py-3 text-xs text-slate-400">Loading fields…</div>
              ) : fieldMeta.length === 0 ? (
                <div className="py-2 text-xs text-slate-400">No fields available yet.</div>
              ) : (
                <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 p-2">
                  {commonFields.length > 0 && (
                    <>
                      <div className="text-[11px] font-semibold text-slate-500">Common (all {types.length} asset types)</div>
                      {renderChips(commonFields)}
                    </>
                  )}
                  {otherFields.length > 0 && (
                    <>
                      <div className={`text-[11px] font-semibold text-slate-500 ${commonFields.length ? "mt-3" : ""}`}>Other fields (specific asset types)</div>
                      {renderChips(otherFields)}
                    </>
                  )}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button>Save template</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function RecipientsTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  async function load() { try { setRows((await api.email.recipients.list()).data); } catch (e) { setError(e.message); } }
  useEffect(() => { load(); }, []);
  async function save(e) {
    e.preventDefault();
    try {
      if (editing.id) await api.email.recipients.update(editing.id, editing);
      else await api.email.recipients.create(editing);
      showToast("Recipient saved."); setEditing(null); await load();
    } catch (err) { setError(err.message); }
  }
  async function remove(row) {
    if (!confirm(`Delete recipient ${row.email}?`)) return;
    try { await api.email.recipients.remove(row.id); showToast("Recipient deleted."); await load(); } catch (e) { setError(e.message); }
  }
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={() => setEditing({ name: "", email: "", isActive: true })}>+ New Recipient</Button></div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {rows.length === 0 ? <EmptyState title="No recipients yet" description="Add the people who should receive notification emails." /> : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0"><div className="font-medium">{r.name || r.email} {!r.isActive && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">inactive</span>}</div>{r.name && <div className="truncate text-xs text-slate-500">{r.email}</div>}</div>
              <div className="flex shrink-0 gap-1"><Button variant="ghost" onClick={() => setEditing({ ...r })}>Edit</Button><Button variant="ghost" onClick={() => remove(r)}>Delete</Button></div>
            </div>
          ))}
        </Card>
      )}
      <Modal open={Boolean(editing)} title={editing?.id ? "Edit Recipient" : "New Recipient"} onClose={() => setEditing(null)}>
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <Input label="Name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <Input label="Email" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} required />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button>Save recipient</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function RulesTab() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [types, setTypes] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [typeFields, setTypeFields] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [testing, setTesting] = useState(false);
  async function load() {
    try {
      const [r, t, tp, rc] = await Promise.all([api.email.rules.list(), api.assetTypes.list(), api.email.templates.list(), api.email.recipients.list()]);
      setRows(r.data); setTypes(t.data); setTemplates(tp.data); setRecipients(rc.data);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);
  async function loadFields(typeIds) {
    if (!typeIds || !typeIds.length) { setTypeFields([]); return; }
    try {
      const forms = await Promise.all(typeIds.map((id) => api.assetTypes.form(id)));
      const lists = forms.map((res) => res.data || []);
      const intersection = lists[0].filter((f) => lists.every((l) => l.some((x) => x.id === f.id)));
      setTypeFields(intersection);
    } catch { setTypeFields([]); }
  }
  function startNew() {
    setEditing({ assetTypeIds: [], triggerType: "asset_created", triggerFieldId: "", triggerCondition: "any_change", triggerConditionValue: "", templateId: "", recipientIds: [], isActive: true });
    setTypeFields([]);
  }
  function startEdit(row) {
    const ids = (row.assetTypeIds && row.assetTypeIds.length ? row.assetTypeIds : [row.assetTypeId]).map(Number);
    setEditing({ ...row, assetTypeIds: ids, triggerFieldId: row.triggerFieldId || "", triggerConditionValue: row.triggerConditionValue || "", recipientIds: row.recipients.map((r) => r.id) });
    loadFields(ids);
  }
  function toggleAssetType(id, checked) {
    const ids = checked ? [...new Set([...editing.assetTypeIds, id])] : editing.assetTypeIds.filter((x) => x !== id);
    setEditing((cur) => ({ ...cur, assetTypeIds: ids, triggerFieldId: "" }));
    loadFields(ids);
  }
  async function save(e) {
    e.preventDefault();
    if (!editing.assetTypeIds.length) { setError("Select at least one asset type."); return; }
    try {
      const body = {
        assetTypeIds: editing.assetTypeIds.map(Number),
        triggerType: editing.triggerType,
        triggerFieldId: editing.triggerType === "field_changed" ? Number(editing.triggerFieldId) : null,
        triggerCondition: editing.triggerType === "field_changed" ? editing.triggerCondition : undefined,
        triggerConditionValue: ["equals", "not_equals"].includes(editing.triggerCondition) ? editing.triggerConditionValue : undefined,
        templateId: Number(editing.templateId),
        recipientIds: editing.recipientIds.map(Number),
        isActive: editing.isActive,
      };
      if (editing.id) await api.email.rules.update(editing.id, body);
      else await api.email.rules.create(body);
      showToast("Rule saved."); setEditing(null); await load();
    } catch (err) { setError(err.message); }
  }
  async function remove(row) {
    if (!confirm("Delete this rule?")) return;
    try { await api.email.rules.remove(row.id); showToast("Rule deleted."); await load(); } catch (e) { setError(e.message); }
  }
  async function test(row) {
    setTesting(true);
    try { const r = await api.email.rules.test(row.id); showToast(`Test email sent to ${r.data.recipients.join(", ")}.`); }
    catch (e) { setError(e.message); }
    finally { setTesting(false); }
  }
  function toggleRecipient(id, checked) {
    setEditing((cur) => ({ ...cur, recipientIds: checked ? [...new Set([...cur.recipientIds, id])] : cur.recipientIds.filter((x) => x !== id) }));
  }
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button onClick={startNew}>+ New Rule</Button></div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      {rows.length === 0 ? <EmptyState title="No rules yet" description="Create a rule to email recipients when an asset is created or a field changes." /> : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="font-medium">{(r.assetTypes && r.assetTypes.length ? r.assetTypes : [{ name: r.assetTypeName }]).map((t) => t.name).join(", ")} {!r.isActive && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">inactive</span>}</div>
                <div className="text-xs text-slate-500">
                  {r.triggerType === "asset_created" ? "On asset created" : `On "${r.triggerFieldKey}" ${r.triggerCondition}${["equals", "not_equals"].includes(r.triggerCondition) ? ` ${r.triggerConditionValue}` : ""}`} · template "{r.templateName}" · {r.recipients.length} recipient(s)
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" disabled={testing} onClick={() => test(r)}>Test</Button>
                <Button variant="ghost" onClick={() => startEdit(r)}>Edit</Button>
                <Button variant="ghost" onClick={() => remove(r)}>Delete</Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <Modal open={Boolean(editing)} title={editing?.id ? "Edit Rule" : "New Rule"} onClose={() => setEditing(null)} className="max-w-2xl">
        {editing && (
          <form onSubmit={save} className="space-y-4">
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700">Asset types <span className="text-red-500">*</span></div>
              <div className="grid max-h-40 gap-1.5 overflow-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
                {types.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-slate-50">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={editing.assetTypeIds.includes(t.id)} onChange={(e) => toggleAssetType(t.id, e.target.checked)} />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
              {!editing.assetTypeIds.length && <div className="mt-1 text-xs text-slate-500">Select at least one asset type.</div>}
            </div>
            <Select hideBlank label="Trigger" value={editing.triggerType} onChange={(e) => setEditing({ ...editing, triggerType: e.target.value })} options={[{ value: "asset_created", label: "When an asset is created" }, { value: "field_changed", label: "When a field changes" }]} />
            {editing.triggerType === "field_changed" && (
              <>
                <Select hideBlank label="Field" value={editing.triggerFieldId} onChange={(e) => setEditing({ ...editing, triggerFieldId: e.target.value })} options={[{ value: "", label: "Select…" }, ...typeFields.map((f) => ({ value: f.id, label: f.name }))]} required />
                <Select hideBlank label="Condition" value={editing.triggerCondition} onChange={(e) => setEditing({ ...editing, triggerCondition: e.target.value })} options={[{ value: "any_change", label: "Any change" }, { value: "equals", label: "Equals value" }, { value: "not_equals", label: "Not equals value" }, { value: "filled", label: "Becomes filled" }, { value: "empty", label: "Becomes empty" }]} />
                {["equals", "not_equals"].includes(editing.triggerCondition) && (
                  <Input label="Value" value={editing.triggerConditionValue || ""} onChange={(e) => setEditing({ ...editing, triggerConditionValue: e.target.value })} />
                )}
              </>
            )}
            <Select hideBlank label="Template" value={editing.templateId} onChange={(e) => setEditing({ ...editing, templateId: e.target.value })} options={[{ value: "", label: "Select…" }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} required />
            <div>
              <div className="mb-1.5 text-sm font-medium text-slate-700">Recipients <span className="text-red-500">*</span></div>
              {recipients.length === 0 ? <div className="text-sm text-slate-500">No recipients yet. Add one in the Recipients tab.</div> : (
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {recipients.map((rc) => (
                    <label key={rc.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={editing.recipientIds.includes(rc.id)} onChange={(e) => toggleRecipient(rc.id, e.target.checked)} />
                      <span className="truncate">{rc.name || rc.email}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.isActive} onChange={(e) => setEditing({ ...editing, isActive: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!editing.recipientIds.length}>Save rule</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}

export function EmailNotifications() {
  const [tab, setTab] = useState("templates");
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6"><h2 className="text-2xl font-bold">Email Notifications</h2><p className="mt-1 text-sm text-slate-500">Create templates, manage recipients, and set rules that email when assets change.</p></div>
      <Tabs tab={tab} setTab={setTab} />
      {tab === "templates" && <TemplatesTab />}
      {tab === "recipients" && <RecipientsTab />}
      {tab === "rules" && <RulesTab />}
    </div>
  );
}
