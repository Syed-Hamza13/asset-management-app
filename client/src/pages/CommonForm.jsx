import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button, Card, EmptyState, Alert } from "../components/ui";
import { AutomationBuilder } from "../components/AutomationBuilder";
import { useToast } from "../context/ToastContext";

function FormFields({ fields, allFields, onChange, onSave }) {
  const [local, setLocal] = useState(fields);
  useEffect(() => setLocal(fields), [fields]);
  const attached = new Set(local.map((field) => field.id));
  const add = (event) => {
    const field = allFields.find(
      (item) => Number(item.id) === Number(event.target.value),
    );
    if (field)
      setLocal([...local, { ...field, required: false, showInList: true }]);
    event.target.value = "";
  };
  const move = (index, direction) => {
    const next = [...local];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setLocal(next);
  };
  return (
    <div>
      {local.length === 0 ? (
        <EmptyState
          title="No fields in the common form"
          description="Add reusable fields to make them available for every asset type."
        />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {local.map((field, index) => (
            <div
              key={field.id}
              className="flex flex-wrap items-center gap-3 px-4 py-4"
            >
              <div className="w-8 text-center text-xs text-slate-400">
                {index + 1}
              </div>
              <div className="min-w-[170px] flex-1">
                <div className="font-medium">{field.name}</div>
                <div className="text-xs text-slate-500">
                  {field.type}
                  {field.dropdown_id ? ` · dropdown #${field.dropdown_id}` : ""}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(field.required)}
                  onChange={(event) =>
                    setLocal(
                      local.map((item) =>
                        item.id === field.id
                          ? { ...item, required: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />{" "}
                Required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.showInList !== false}
                  disabled={field.type === "quantity"}
                  onChange={(event) =>
                    setLocal(
                      local.map((item) =>
                        item.id === field.id
                          ? { ...item, showInList: event.target.checked }
                          : item,
                      ),
                    )
                  }
                />{" "}
                {field.type === "quantity" ? "Not a list column" : "Show in Asset List"}
              </label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setLocal(local.filter((item) => item.id !== field.id))
                  }
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <select
          defaultValue=""
          onChange={add}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        >
          <option value="">Add field to common form...</option>
          {allFields
            .filter(
              (field) => !attached.has(field.id) && field.is_active !== false,
            )
            .map((field) => (
              <option key={field.id} value={field.id}>
                {field.name} · {field.type}
              </option>
            ))}
        </select>
        <Button type="button" onClick={() => onSave(local)}>
          Save common form
        </Button>
      </div>
    </div>
  );
}

export function CommonForm() {
  const [fields, setFields] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  async function load() {
    try {
      const [form, definitions] = await Promise.all([
        api.commonForm.get(),
        api.fields.list(),
      ]);
      setFields(form.data);
      setAllFields(definitions.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function save(local) {
    setSaving(true);
    setError("");
    try {
      await api.commonForm.save({
        fields: local.map((field) => ({
          fieldDefinitionId: field.id,
          required: Boolean(field.required),
          showInList: field.showInList !== false,
        })),
      });
      showToast("Common form saved successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return <div className="text-sm text-slate-500">Loading common form...</div>;
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold">Common Form</h2>
        <p className="mt-1 text-sm text-slate-500">
          Fields selected here become available automatically when creating an
          asset of any type.
        </p>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <FormFields fields={fields} allFields={allFields} onSave={save} />
      {saving && (
        <p className="mt-3 text-right text-xs text-slate-500">Saving...</p>
      )}
      <AutomationBuilder commonForm fields={fields} />
    </div>
  );
}
