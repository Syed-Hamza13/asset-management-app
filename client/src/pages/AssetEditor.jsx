import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { Button, Card, Alert } from '../components/ui';
import { DynamicForm } from '../components/DynamicForm';
import { indianDateToIso } from '../utils/date';
import { useToast } from '../context/ToastContext';

async function loadFields(typeId, includeQuantity = true) {
  const form = await api.assets.form(typeId);
  const fields = includeQuantity
    ? form.data
    : form.data.filter((field) => field.type !== 'quantity');
  return Promise.all(fields.map(async f => {
    if (f.type !== 'dropdown') return f;
    const d = await api.dropdowns.get(f.dropdownId);
    return { ...f, options: d.data.options.filter(o => o.is_active).map(o => ({ value: o.value, label: o.label })) };
  }));
}

function toFormValues(values, fields) {
  const next = { ...(values || {}) };
  for (const field of fields) {
    if (field.type === 'date' && next[field.key]) {
      const match = String(next[field.key]).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) next[field.key] = `${match[3]}/${match[2]}/${match[1]}`;
    }
  }
  return next;
}

function toApiValues(values, fields) {
  const next = { ...(values || {}) };
  for (const field of fields) {
    if (field.type === 'date' && Object.prototype.hasOwnProperty.call(next, field.key)) {
      const iso = indianDateToIso(next[field.key]);
      if (iso === null) throw Object.assign(new Error(`${field.name} must use DD/MM/YYYY format.`), { fields: { [field.key]: 'Use DD/MM/YYYY.' } });
      next[field.key] = iso;
    }
  }
  return next;
}

export function AssetEditor() {
  const { assetTypeId, publicId } = useParams();
  const editing = Boolean(publicId);
  const nav = useNavigate();
  const [type, setType] = useState(null);
  const [fields, setFields] = useState([]);
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
        const fs = await loadFields(typeId, !editing);
        setFields(fs);
        if (assetData) setValues(toFormValues(assetData.data.values, fs));
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
      if (editing) await api.assets.update(publicId, apiValues);
      else await api.assets.create(assetTypeId, apiValues);
      showToast(editing ? 'Asset updated successfully.' : 'Asset added successfully.');
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
    <Card className="p-6"><form onSubmit={submit}><DynamicForm fields={fields} values={values} setValues={setValues} errors={fieldErrors}/><div className="mt-6 flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => nav(-1)}>Cancel</Button><Button loading={saving}>{editing ? 'Save Changes' : `Save ${type.name}`}</Button></div></form></Card>
  </div>;
}
