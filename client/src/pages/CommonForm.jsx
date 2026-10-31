import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Button, Card, EmptyState, Alert, Modal } from "../components/ui";
import { AutomationBuilder } from "../components/AutomationBuilder";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

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
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:py-4"
            >
              <div className="w-6 text-center text-xs text-slate-400 sm:w-8">
                {index + 1}
              </div>
              <div className="min-w-0 flex-1 sm:min-w-[170px]">
                <div className="font-medium">{field.name}</div>
                <div className="text-xs text-slate-500">
                  {field.type}
                  {field.dropdown_id ? ` · dropdown #${field.dropdown_id}` : ""}
                </div>
              </div>
              {/* On a phone the two flags move below the name and the arrows stay
                  beside it: order-3 + w-full reflows this row without changing the
                  desktop order or the gap between the flags. */}
              <div className="order-3 flex w-full flex-wrap items-center gap-x-3 gap-y-1 sm:order-none sm:w-auto">
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
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Move up"
                  className="min-w-10 px-2 sm:min-w-0"
                  onClick={() => move(index, -1)}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label="Move down"
                  className="min-w-10 px-2 sm:min-w-0"
                  onClick={() => move(index, 1)}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  size="sm"
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
  const [copyOpen, setCopyOpen] = useState(false);
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
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
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="page-title text-xl font-bold">Common Form</h2>
          <p className="mt-1 text-sm text-slate-500">
            Fields selected here become available automatically when creating an
            asset of any type.
          </p>
        </div>
        {isAdmin && (
          <Button variant="secondary" className="shrink-0" onClick={() => setCopyOpen(true)}>
            Copy to users
          </Button>
        )}
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
      {isAdmin && (
        <CopyToUsersModal open={copyOpen} onClose={() => setCopyOpen(false)} fieldCount={fields.length} />
      )}
    </div>
  );
}

function CopyToUsersModal({ open, onClose, fieldCount }) {
  const [targets, setTargets] = useState([]);
  const [ruleCount, setRuleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const { showToast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSelected([]);
    setResults(null);
    setError("");
    setLoading(true);
    Promise.all([api.commonForm.copyTargets(), api.commonForm.automations.list()])
      .then(([targetRes, ruleRes]) => {
        setTargets(targetRes.data);
        setRuleCount(ruleRes.data.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open]);

  function toggle(userId) {
    setSelected((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  async function run() {
    setBusy(true);
    setError("");
    try {
      const response = await api.commonForm.copyTo(selected);
      setResults(response.data.results);
      const copied = response.data.results.filter((result) => result.ok).length;
      showToast(copied ? `Copied to ${copied} ${copied === 1 ? "user" : "users"}.` : "Nothing was copied.");
      const refreshed = await api.commonForm.copyTargets();
      setTargets(refreshed.data);
      setSelected([]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title="Copy this common form to users" onClose={onClose} className="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Puts an independent copy of your form — <strong>{fieldCount} {fieldCount === 1 ? "field" : "fields"}</strong>
          {" "}and <strong>{ruleCount} automation {ruleCount === 1 ? "rule" : "rules"}</strong> — into their account.
          Any field or dropdown they do not have yet is created in their name, so after the copy each of you edits
          your own form and neither one changes the other. Only users whose common form is still empty can receive a
          copy, so nothing of theirs is ever overwritten.
        </p>
        {error && <Alert>{error}</Alert>}
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-500">Loading users…</div>
        ) : targets.length === 0 ? (
          <EmptyState
            title="No user to copy to"
            description="Every other account is an admin or is deactivated."
          />
        ) : (
          <Card className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {targets.map((target) => (
              <label
                key={target.userId}
                className={`flex items-center gap-3 px-4 py-3 text-sm transition-colors ${target.ready ? "cursor-pointer hover:bg-slate-100" : "opacity-60"}`}
              >
                <input
                  type="checkbox"
                  disabled={!target.ready}
                  checked={selected.includes(target.userId)}
                  onChange={() => toggle(target.userId)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{target.displayName || target.email}</span>
                  {target.displayName && (
                    <span className="block truncate text-xs text-slate-500">{target.email}</span>
                  )}
                </span>
                {!target.ready && (
                  <span className="shrink-0 text-xs text-slate-400">
                    {`has ${target.fieldCount} ${target.fieldCount === 1 ? "field" : "fields"}`}
                  </span>
                )}
              </label>
            ))}
          </Card>
        )}
        {results && (
          <div className="space-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-sm">
            {results.map((result) => (
              <div key={result.userId} className="flex items-start gap-2">
                <span className={result.ok ? "text-emerald-600" : "text-red-500"}>{result.ok ? "✓" : "✕"}</span>
                <span className="min-w-0">
                  <span className="font-medium">{result.displayName || result.email}</span>
                  <span className="block text-xs text-slate-500">
                    {result.ok
                      ? `${result.fieldsCopied} fields, ${result.rulesCopied} rules copied (${result.fieldsCreated} new ${result.fieldsCreated === 1 ? "field" : "fields"}${result.dropdownsCreated ? `, ${result.dropdownsCreated} new ${result.dropdownsCreated === 1 ? "dropdown" : "dropdowns"}` : ""})${result.rulesSkipped ? `, ${result.rulesSkipped} rules skipped` : ""}`
                      : result.reason}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="dialog-actions flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {results ? "Done" : "Cancel"}
          </Button>
          <Button onClick={run} loading={busy} disabled={!selected.length}>
            {selected.length
              ? `Copy to ${selected.length} ${selected.length === 1 ? "user" : "users"}`
              : "Select users to copy to"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
