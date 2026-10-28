import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  Input,
  Alert,
} from "../components/ui";
import { DynamicForm } from "../components/DynamicForm";

export function Dashboard() {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { can } = useAuth();
  const canCreateAsset = can("assets.create_own");
  const canCreateType = can("asset_types.create_own");
  const [typeSearch, setTypeSearch] = useState("");
  const [selectedType, setSelectedType] = useState(null);
  const [typePickerOpen, setTypePickerOpen] = useState(true);
  const [fields, setFields] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [values, setValues] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [typeLoading, setTypeLoading] = useState(false);
  const [creatingType, setCreatingType] = useState(false);
  const [emptyReason, setEmptyReason] = useState(null);
  async function load() {
    setLoading(true);
    try {
      setTypes((await api.assetTypes.list()).data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.assetTypes.create({ name });
      showToast("Asset type created successfully.");
      setName("");
      setTypeModalOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }
  const filteredTypes = types.filter((type) =>
    type.name.toLowerCase().includes(typeSearch.trim().toLowerCase()),
  );
  const exactType = types.find(
    (type) => type.name.toLowerCase() === typeSearch.trim().toLowerCase(),
  );
  const canCreateInlineType =
    canCreateType && typeSearch.trim().length > 0 && !exactType;

  function openAddAsset() {
    setError("");
    setFieldErrors({});
    setTypeSearch("");
    setSelectedType(null);
    setTypePickerOpen(true);
    setFields([]);
    setAutomations([]);
    setValues({});
    setEmptyReason(null);
    setOpen(true);
  }

  async function selectType(type) {
    setSelectedType(type);
    setTypeSearch(type.name);
    setTypePickerOpen(false);
    setValues({});
    setFieldErrors({});
    setError("");
    setEmptyReason(null);
    setTypeLoading(true);
    try {
      const form = await api.assets.form(type.id);
      const enriched = await Promise.all(
        form.data.fields.map(async (field) => {
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
      setFields(enriched);
      setAutomations(form.data.automations || []);
      if (!enriched.length) {
        const commonForm = await api.commonForm.get();
        setEmptyReason(commonForm.data.length ? "type" : "common-form");
      }
    } catch (e) {
      setError(e.message);
      setFields([]);
      setAutomations([]);
    } finally {
      setTypeLoading(false);
    }
  }

  async function createTypeAndSelect() {
    const typeName = typeSearch.trim();
    if (!typeName || creatingType) return;
    setCreatingType(true);
    setError("");
    try {
      const response = await api.assetTypes.create({ name: typeName });
      showToast("Asset type created successfully.");
      const created = response.data;
      setTypes((current) =>
        [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
      );
      await selectType(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreatingType(false);
    }
  }

  async function addAsset(e) {
    e.preventDefault();
    if (!selectedType) return;
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const response = await api.assets.create(selectedType.id, values);
      const queued = response.data.notificationsQueued || 0;
      if (queued > 0) showToast(`Asset added. ${queued} notification${queued === 1 ? "" : "s"} queued.`, "queued");
      else showToast("Asset added successfully.");
      setOpen(false);
      navigate(`/assets/${response.data.publicId}`);
      await load();
    } catch (e) {
      setError(e.message);
      if (e.fields) setFieldErrors(e.fields);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Assets</h2>
          <p className="mt-1 text-sm text-slate-500">
            Choose an asset type to manage its records.
          </p>
        </div>
        <div className="flex gap-2">
          {canCreateAsset && <Button onClick={openAddAsset}>+ Add Asset</Button>}
          {canCreateType && (
            <Button variant="secondary" onClick={() => setTypeModalOpen(true)}>
              + Add Asset Type
            </Button>
          )}
        </div>
      </div>
      {error && !open && !typeModalOpen && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {loading ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Loading...
        </Card>
      ) : types.length === 0 ? (
        <EmptyState
          title="No asset types yet"
          description="Create your first asset type, then configure its fields."
          action={
            canCreateType ? (
              <Button onClick={() => setTypeModalOpen(true)}>
                Create first asset type
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {types.map((t) => (
            <Card key={t.id} className="p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <Link to={`/asset-types/${t.id}`} className="block">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{t.name}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {t.asset_count} asset
                      {Number(t.asset_count) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
                    →
                  </span>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
      <Modal
        open={open}
        title="Add Asset"
        onClose={() => setOpen(false)}
        className="max-h-[92vh] max-w-3xl"
      >
        <div className="space-y-5">
          {error && <Alert>{error}</Alert>}
          <div>
            <Input
              label="Asset Type"
              value={typeSearch}
              onFocus={() => setTypePickerOpen(true)}
              onChange={(e) => {
                setTypeSearch(e.target.value);
                setSelectedType(null);
                setTypePickerOpen(true);
                setFields([]);
                setAutomations([]);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canCreateInlineType) {
                  e.preventDefault();
                  createTypeAndSelect();
                }
              }}
              placeholder="Search or type a new asset type"
              autoFocus
            />
            <div
              className={`${typePickerOpen ? "mt-2" : "hidden"} max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg`}
            >
              {filteredTypes
                .filter((type) => type.id !== selectedType?.id)
                .map((type) => (
                  <button
                    type="button"
                    key={type.id}
                    className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => selectType(type)}
                  >
                    {type.name}
                  </button>
                ))}
              {canCreateInlineType && (
                <button
                  type="button"
                  className="block w-full rounded-lg border-t border-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={createTypeAndSelect}
                >
                  {creatingType
                    ? "Creating..."
                    : `Create “${typeSearch.trim()}”`}
                </button>
              )}
              {!filteredTypes.filter((type) => type.id !== selectedType?.id)
                .length &&
                !canCreateInlineType && (
                  <div className="px-3 py-2 text-sm text-slate-500">
                    No asset type found.
                  </div>
                )}
            </div>
          </div>
          {selectedType && (
            <form onSubmit={addAsset} className="space-y-4">
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                Adding a new{" "}
                <strong className="text-slate-900">{selectedType.name}</strong>{" "}
                asset
              </div>
              {typeLoading ? (
                <div className="py-6 text-center text-sm text-slate-500">
                  Loading fields...
                </div>
              ) : fields.length ? (
                <DynamicForm
                  fields={fields}
                  values={values}
                  setValues={setValues}
                  errors={fieldErrors}
                  automations={automations}
                  isNew={true}
                />
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm text-slate-500">
                  {emptyReason === "common-form" ? (
                    <>
                      The Common Form has no fields yet, so new asset types
                      start empty.{" "}
                      <Link
                        to="/common-form"
                        className="font-semibold text-slate-700 underline"
                      >
                        Configure the Common Form
                      </Link>{" "}
                      to add default fields.
                    </>
                  ) : (
                    <>
                      No fields configured for this asset type yet.{" "}
                      <Link
                        to={`/asset-types/${selectedType.id}`}
                        className="font-semibold text-slate-700 underline"
                      >
                        Configure Form
                      </Link>
                    </>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button loading={saving}>Save {selectedType.name}</Button>
              </div>
            </form>
          )}
        </div>
      </Modal>
      <Modal
        open={typeModalOpen}
        title="Create Asset Type"
        onClose={() => setTypeModalOpen(false)}
      >
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <form onSubmit={create} className="space-y-4">
          <Input
            label="Asset Type Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Laptop"
            autoFocus
            required
          />
          <Button loading={saving} className="w-full">
            Create Asset Type
          </Button>
        </form>
      </Modal>
    </div>
  );
}
