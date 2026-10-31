import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Input, Modal } from "../../components/ui";
import { DynamicForm } from "../../components/DynamicForm";
import { withDropdownOptions } from "../../utils/assetValues";

// The dashboard's create-asset flow: pick (or inline-create) a type, then fill
// that type's form. It owns only the picker/form state; the error message stays
// with the page because the same error also feeds the banner behind the modal.
export function AddAssetModal({
  open,
  types,
  canCreateType,
  error,
  onError,
  onTypeCreated,
  onCreated,
  onClose,
}) {
  const { showToast } = useToast();
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
  const [saving, setSaving] = useState(false);

  const filteredTypes = types.filter((type) =>
    type.name.toLowerCase().includes(typeSearch.trim().toLowerCase()),
  );
  const exactType = types.find(
    (type) => type.name.toLowerCase() === typeSearch.trim().toLowerCase(),
  );
  const canCreateInlineType =
    canCreateType && typeSearch.trim().length > 0 && !exactType;

  async function selectType(type) {
    setSelectedType(type);
    setTypeSearch(type.name);
    setTypePickerOpen(false);
    setValues({});
    setFieldErrors({});
    onError("");
    setEmptyReason(null);
    setTypeLoading(true);
    try {
      const form = await api.assets.form(type.id);
      const enriched = await withDropdownOptions(form.data.fields, { activeOnly: true });
      setFields(enriched);
      setAutomations(form.data.automations || []);
      if (!enriched.length) {
        const commonForm = await api.commonForm.get();
        setEmptyReason(commonForm.data.length ? "type" : "common-form");
      }
    } catch (e) {
      onError(e.message);
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
    onError("");
    try {
      const response = await api.assetTypes.create({ name: typeName });
      showToast("Asset type created successfully.");
      const created = response.data;
      onTypeCreated(created);
      await selectType(created);
    } catch (e) {
      onError(e.message);
    } finally {
      setCreatingType(false);
    }
  }

  async function addAsset(e) {
    e.preventDefault();
    if (!selectedType) return;
    setSaving(true);
    onError("");
    setFieldErrors({});
    try {
      const response = await api.assets.create(selectedType.id, values);
      const queued = response.data.notificationsQueued || 0;
      if (queued > 0) showToast(`Asset added. ${queued} notification${queued === 1 ? "" : "s"} queued.`, "queued");
      else showToast("Asset added successfully.");
      onCreated(response.data);
    } catch (e) {
      onError(e.message);
      if (e.fields) setFieldErrors(e.fields);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Add Asset"
      onClose={onClose}
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
            <div className="dialog-actions flex justify-end gap-2">
              <Button
                variant="secondary"
                type="button"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button loading={saving}>Save {selectedType.name}</Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
