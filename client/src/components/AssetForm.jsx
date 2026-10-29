import { useEffect, useState } from "react";
import { api } from "../api/client";
import { Alert, Button } from "./ui";
import { DynamicForm } from "./DynamicForm";
import { useToast } from "../context/ToastContext";

async function loadFields(typeId, includeQuantity) {
  const form = await api.assets.form(typeId);
  const allFields = includeQuantity
    ? form.data.fields
    : form.data.fields.filter((field) => field.type !== "quantity");
  const enriched = await Promise.all(
    allFields.map(async (field) => {
      if (field.type !== "dropdown") return field;
      const dropdown = await api.dropdowns.get(field.dropdownId);
      return {
        ...field,
        options: dropdown.data.options
          .filter((option) => option.is_active)
          .map((option) => ({ value: option.value, label: option.label })),
      };
    }),
  );
  return { fields: enriched, automations: form.data.automations || [] };
}

export function AssetForm({
  assetTypeId,
  publicId,
  onSaved,
  onCancel,
  onTypeLoaded,
  emptyHint,
  footerExtra,
}) {
  const editing = Boolean(publicId);
  const [type, setType] = useState(null);
  const [fields, setFields] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [previousValues, setPreviousValues] = useState({});
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const assetData = publicId ? await api.assets.get(publicId) : null;
        const typeData = await api.assetTypes.get(
          assetTypeId || assetData.data.assetTypeId,
        );
        const loaded = await loadFields(typeData.data.id, !editing);
        if (cancelled) return;
        setType(typeData.data);
        onTypeLoaded?.(typeData.data);
        setFields(loaded.fields);
        setAutomations(loaded.automations);
        if (assetData) {
          const initial = { ...(assetData.data.values || {}) };
          setValues(initial);
          setPreviousValues(initial);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assetTypeId, publicId, editing]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const res = editing
        ? await api.assets.update(publicId, values)
        : await api.assets.create(assetTypeId, values);
      const queued = res.data.notificationsQueued || 0;
      if (queued > 0)
        showToast(
          `${editing ? "Asset updated" : "Asset added"}. ${queued} notification${queued === 1 ? "" : "s"} queued.`,
          "queued",
        );
      else
        showToast(
          editing
            ? "Asset updated successfully."
            : "Asset added successfully.",
        );
      onSaved?.(res.data);
    } catch (e) {
      setError(e.message);
      if (e.fields) setFieldErrors(e.fields);
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <div className="text-sm text-slate-500">Loading form...</div>
    );

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {!fields.length && (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
          No fields configured for this asset type yet. {emptyHint}
        </div>
      )}
      <DynamicForm
        fields={fields}
        values={values}
        setValues={setValues}
        errors={fieldErrors}
        automations={automations}
        previousValues={previousValues}
        isNew={!editing}
      />
      <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 pt-2">
        {footerExtra}
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
          <Button loading={saving}>
            {editing ? "Save Changes" : `Save ${type?.name ?? "Asset"}`}
          </Button>
        </div>
      </div>
    </form>
  );
}
