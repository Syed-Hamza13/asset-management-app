import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Button, Card, Alert } from '../components/ui';
import { DynamicForm } from '../components/DynamicForm';
import { useToast } from '../context/ToastContext';

async function loadFields(typeId, includeQuantity = true) {
  const form = await api.assets.form(typeId);
  const allFields = form.data.fields;
  const fields = includeQuantity
    ? allFields
    : allFields.filter((field) => field.type !== 'quantity');
  const enriched = await Promise.all(fields.map(async f => {
    if (f.type !== 'dropdown') return f;
    const d = await api.dropdowns.get(f.dropdownId);
    return { ...f, options: d.data.options.filter(o => o.is_active).map(o => ({ value: o.value, label: o.label })) };
  }));
  return { fields: enriched, automations: form.data.automations || [] };
}

function toFormValues(values, fields) {
  return { ...(values || {}) };
}

function toApiValues(values, fields) {
  return { ...(values || {}) };
}

export function AssetEditor() {
  const { assetTypeId, publicId } = useParams();
  const editing = Boolean(publicId);
  const nav = useNavigate();
  const [type, setType] = useState(null);
  const [fields, setFields] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [previousValues, setPreviousValues] = useState({});
  const [values, setValues] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        let assetData = null;
        let typeData;
        if (assetTypeId) {
          typeData = await api.assetTypes.get(assetTypeId);
        } else {
          assetData = await api.assets.get(publicId);
          typeData = await api.assetTypes.get(assetData.data.assetTypeId);
        }
        setType(typeData.data);
        const typeId = assetTypeId || typeData.data.id;
        const { fields: fs, automations: rules } = await loadFields(typeId, !editing);
        setFields(fs);
        setAutomations(rules);
        if (assetData) {
          const loaded = toFormValues(assetData.data.values, fs);
          setValues(loaded);
          setPreviousValues(loaded);
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [assetTypeId, publicId]);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const apiValues = toApiValues(values, fields);
      const res = editing ? await api.assets.update(publicId, apiValues) : await api.assets.create(assetTypeId, apiValues);
      const queued = res.data.notificationsQueued || 0;
      if (queued > 0) showToast(`${editing ? "Asset updated" : "Asset added"}. ${queued} notification${queued === 1 ? "" : "s"} queued.`, "queued");
      else showToast(editing ? 'Asset updated successfully.' : 'Asset added successfully.');
      nav(editing ? `/assets/${publicId}` : `/asset-types/${assetTypeId}`);
    } catch (e) {
      setError(e.message);
      if (e.fields) setFieldErrors(e.fields);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading form...</div>;
  if (error && !type) return <Alert>{error}</Alert>;
  return <div className="mx-auto max-w-3xl">
    <div className="mb-6"><Link to={editing ? `/assets/${publicId}` : `/asset-types/${assetTypeId}`} className="text-sm text-slate-500">← Back</Link><h2 className="mt-2 text-2xl font-bold">{editing ? 'Edit' : 'Add'} {type.name}</h2><p className="mt-1 text-sm text-slate-500">Fill the configured fields below.</p></div>
    {error && <div className="mb-4"><Alert>{error}</Alert></div>}
    <Card className="p-6"><form onSubmit={submit}>{!loading && !fields.length && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">No fields configured for this asset type yet. <Link to={`/asset-types/${assetTypeId}`} className="font-semibold text-slate-700 underline">Configure Form</Link></div>}<DynamicForm fields={fields} values={values} setValues={setValues} errors={fieldErrors} automations={automations} previousValues={previousValues} isNew={!editing}/><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => nav(-1)}>Cancel</Button><Button loading={saving}>{editing ? 'Save Changes' : `Save ${type.name}`}</Button></div></form></Card>
  </div>;
}
