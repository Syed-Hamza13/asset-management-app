import { useEffect, useState } from "react";
import { useToast } from "../context/ToastContext";
import { api } from "../api/client";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Alert,
} from "../components/ui";

const types = [
  ["text", "Short Text"],
  ["multiline", "Multiline Text"],
  ["mobile", "Mobile Number"],
  ["number", "Number"],
  ["quantity", "Quantity (1-15)"],
  ["boolean", "Yes / No"],
  ["date", "Date"],
  ["auto_date", "Current Date (Editable)"],
  ["dropdown", "Dropdown"],
];
const typeLabel = (t) => types.find((x) => x[0] === t)?.[1] || t;
export function Fields() {
  const [items, setItems] = useState([]);
  const [dropdowns, setDropdowns] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const [migration, setMigration] = useState(null);
  const [busy, setBusy] = useState(false);
  const blank = {
    name: "",
    key: "",
    type: "text",
    dropdownId: "",
    isActive: true,
  };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
    const { showToast } = useToast();
  async function load() {
    try {
      setItems((await api.fields.list()).data);
      setDropdowns((await api.dropdowns.list()).data);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function startEdit(x) {
    setEdit(x);
    setMigration(null);
    setForm({
      name: x.name,
      key: x.field_key,
      type: x.type,
      dropdownId: x.dropdown_id || "",
      isActive: Boolean(x.is_active),
    });
    setOpen(true);
  }
  function closeAll() {
    setOpen(false);
    setEdit(null);
    setMigration(null);
    setForm(blank);
    setError("");
  }
  function buildBody() {
    return {
      ...form,
      dropdownId: form.type === "dropdown" ? Number(form.dropdownId) : null,
    };
  }
  async function performSave(body) {
    setBusy(true);
    try {
      if (edit) await api.fields.update(edit.id, body);
      else await api.fields.create(body);
      closeAll();
      showToast(
        migration
          ? "Field type changed and data migrated."
          : edit
            ? "Field updated successfully."
            : "Field created successfully."
      );
      await load();
    } catch (e) {
      setError(e.message);
      setMigration(null);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    // Editing a field that is in use and whose type is changing -> preview + confirm.
    const typeChanged = edit && form.type !== edit.type;
    const inUse = edit && Number(edit.form_usage_count) > 0;
    if (typeChanged && inUse) {
      setBusy(true);
      try {
        setMigration(await api.fields.previewTypeChange(edit.id, form.type));
      } catch (e) {
        setError(e.message);
      } finally {
        setBusy(false);
      }
      return;
    }
    await performSave(buildBody());
  }
  function confirmMigration() {
    performSave(buildBody());
  }
  async function remove(id) {
    if (!confirm("Delete this field definition? It must not be in use."))
      return;
    try {
      await api.fields.remove(id);
        showToast("Field deleted successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Field Definitions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reusable fields for your asset forms.
          </p>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setForm(blank);
            setOpen(true);
          }}
        >
          + Add Field
        </Button>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          title="No fields yet"
          description="Create fields such as Serial Number, Brand, Price, or Department."
          action={<Button onClick={() => setOpen(true)}>Create a field</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Key</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((x) => (
                  <tr key={x.id}>
                    <td className="px-5 py-4 font-medium">{x.name}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">
                      {x.field_key}
                    </td>
                    <td className="px-5 py-4">
                      {types.find((t) => t[0] === x.type)?.[1]}
                    </td>
                    <td className="px-5 py-4">{x.dropdown_name || "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" onClick={() => startEdit(x)}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => remove(x.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal
        open={open}
        title={migration ? "Confirm type change" : edit ? "Edit Field" : "Create Field"}
        onClose={closeAll}
      >
        {migration ? (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              You are changing <span className="font-semibold">{migration.data.from && typeLabel(migration.data.from)}</span>{" "}
              to <span className="font-semibold">{typeLabel(migration.data.to)}</span> for “{form.name}”.
            </p>
            {migration.data.blocked ? (
              <Alert>{migration.data.blockReason}</Alert>
            ) : !migration.data.migratable ? (
              <>
                <Alert>
                  This change cannot be applied yet: {migration.data.issueCount} existing
                  value(s) are not compatible with{" "}
                  <span className="font-semibold">{typeLabel(migration.data.to)}</span>. Fix or
                  clear these first, then try again.
                </Alert>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Asset</th>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Current value</th>
                        <th className="px-3 py-2">Why</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {migration.data.issues.map((it) => (
                        <tr key={it.publicId}>
                          <td className="px-3 py-2 font-medium">{it.label}</td>
                          <td className="px-3 py-2 text-slate-500">{it.assetTypeName}</td>
                          <td className="px-3 py-2 font-mono">{it.value}</td>
                          <td className="px-3 py-2 text-rose-600">{it.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  This field is used by{" "}
                  <span className="font-semibold">{migration.data.usage}</span> form(s). Their
                  stored data will be kept and migrated automatically.
                </p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    {migration.data.rowsToMigrate === 0
                      ? "No stored values need converting."
                      : `${migration.data.rowsToMigrate} stored value(s) will be converted to the new type.`}
                  </li>
                  <li>
                    {migration.data.references?.automationRules
                      ? `${migration.data.references.automationRules} automation rule(s) reference this field and will keep working.`
                      : "No automation rules reference this field."}
                  </li>
                  <li>
                    {migration.data.references?.emailRules
                      ? `${migration.data.references.emailRules} email rule(s) use it as a trigger; they will keep working.`
                      : "No email rules use it as a trigger."}
                  </li>
                  <li>
                    {migration.data.references?.templates?.length
                      ? `Email templates referencing it (${migration.data.references.templates.join(", ")}) use its key, which does not change.`
                      : "No email templates embed this field."}
                  </li>
                </ul>
              </div>
            )}
            {error && <Alert>{error}</Alert>}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMigration(null)} disabled={busy}>
                Back
              </Button>
              {migration.data.blocked || !migration.data.migratable ? null : (
                <Button className="flex-1" onClick={confirmMigration} loading={busy}>
                  Confirm &amp; migrate
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
          <Input
            label="Field Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Serial Number"
            required
          />
          <Input
            label="Internal Key"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            placeholder="serial_number"
            hint="Letters, numbers and underscores are recommended."
          />
          <Select
            label="Field Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={types.map((t) => ({ value: t[0], label: t[1] }))}
          />
          {form.type === "dropdown" && (
            <Select
              label="Dropdown Source"
              value={form.dropdownId}
              onChange={(e) => setForm({ ...form, dropdownId: e.target.value })}
              options={dropdowns.map((d) => ({ value: d.id, label: d.name }))}
              required
            />
          )}
          {edit && form.type !== edit.type && Number(edit.form_usage_count) > 0 && (
            <p className="text-xs text-slate-500">
              This field is used by {edit.form_usage_count} form(s). You will be shown a
              confirmation before the type is changed.
            </p>
          )}
          <Button className="w-full" loading={busy}>
            {edit ? "Save changes" : "Create field"}
          </Button>
        </form>
        )}
      </Modal>
    </div>
  );
}
