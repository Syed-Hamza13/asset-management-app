import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import {
  Button,
  Card,
  DateInput,
  EmptyState,
  Input,
  Popover,
  Select,
  Alert,
  Modal,
} from "../components/ui"; 
import { AutomationBuilder } from "../components/AutomationBuilder";
import { AssetForm } from "../components/AssetForm";
import { formatDateValue } from "../utils";
import { indianDateToIso } from "../utils/date";
import * as XLSX from "xlsx";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";

function FieldForm({ fields, onChange, onSave }) {
  const [local, setLocal] = useState(fields);
  useEffect(() => setLocal(fields), [fields]);
  const move = (i, dir) => {
    const a = [...local];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setLocal(a);
  };
  return (
    <div>
      {local.length === 0 ? (
        <EmptyState
          title="No fields in this form"
          description="Add reusable field definitions to start collecting asset data."
        />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {local.map((f, i) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-3 px-4 py-4"
            >
              <div className="w-8 text-center text-xs text-slate-400">
                {i + 1}
              </div>
              <div className="min-w-[160px] flex-1">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">
                  {f.type}
                  {f.dropdownId ? ` · dropdown #${f.dropdownId}` : ""}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(f.required)}
                  onChange={(e) =>
                    setLocal(
                      local.map((x) =>
                        x.id === f.id
                          ? { ...x, required: e.target.checked }
                          : x,
                      ),
                    )
                  }
                />{" "}
                Required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(f.showInList)}
                  onChange={(e) =>
                    setLocal(
                      local.map((x) =>
                        x.id === f.id
                          ? { ...x, showInList: e.target.checked }
                          : x,
                      ),
                    )
                  }
                />
                Show in Asset List
              </label>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" onClick={() => move(i, 1)}>
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocal(local.filter((x) => x.id !== f.id))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div className="mt-4">
        <Button onClick={() => onSave(local)}>Save form</Button>
      </div>
    </div>
  );
}

function ColumnFilter({ anchorRef, onClose, field, values, selectedValues, onToggle, onClear }) {
  const [search, setSearch] = useState("");
  const matchingValues = values.filter((value) =>
    value.toLowerCase().includes(search.toLowerCase()),
  );
  const allMatchingSelected =
    matchingValues.length > 0 &&
    matchingValues.every((value) => selectedValues.includes(value));

  function toggleMatchingValues() {
    if (allMatchingSelected) {
      matchingValues.forEach((value) => onToggle(value, false));
    } else {
      matchingValues.forEach((value) => onToggle(value, true));
    }
  }

  return (
    <Popover anchorRef={anchorRef} onClose={onClose}>
      <input
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        placeholder={`Search ${field.name}`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoFocus
      />
      <div className="mt-2 flex items-center justify-between border-b border-slate-100 pb-2 text-xs normal-case">
        <button
          type="button"
          className="font-semibold text-slate-700 hover:text-slate-950"
          onClick={toggleMatchingValues}
          disabled={matchingValues.length === 0}
        >
          {allMatchingSelected ? "Clear visible" : "Select visible"}
        </button>
        <button
          type="button"
          className="text-slate-500 hover:text-slate-900"
          onClick={onClear}
        >
          Clear all
        </button>
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto">
        {matchingValues.length === 0 ? (
          <div className="px-1 py-3 text-xs font-normal normal-case text-slate-500">
            No matching values
          </div>
        ) : (
          matchingValues.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-normal normal-case hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(value)}
                onChange={(event) => onToggle(value, event.target.checked)}
              />
              <span className="truncate">{value}</span>
            </label>
          ))
        )}
      </div>
    </Popover>
  );
}

export function AssetType() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [type, setType] = useState(null);
  const [assets, setAssets] = useState(null);
  const [form, setForm] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [addField, setAddField] = useState("");
  const [error, setError] = useState("");
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState("");
  const [customizeColumns, setCustomizeColumns] = useState(false);
  const [columnForm, setColumnForm] = useState([]);
  const [configureForm, setConfigureForm] = useState(false);
  const [configureAutomations, setConfigureAutomations] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const filterAnchorRef = useRef(null);
  const [columnFilters, setColumnFilters] = useState({});
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");
  const [bulkFieldKey, setBulkFieldKey] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { showToast } = useToast();
  const { can, isAdmin, user } = useAuth();
  const canEditForm = can("asset_types.edit_own") || can("fields.manage_own");
  const canBulk = can("assets.bulk_own");
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUsers, setShareUsers] = useState([]);
  const [shareSelected, setShareSelected] = useState([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const canEditAsset = can("assets.edit_own");
  async function load() {
    try {
      const [t, f, fl] = await Promise.all([
        api.assetTypes.get(id),
        api.assets.list(id),
        api.assetTypes.form(id),
      ]);
      const fieldsWithOptions = await Promise.all(
        fl.data.map(async (field) => {
          if (field.type !== "dropdown") return field;
          const dropdownId = field.dropdownId ?? field.dropdown_id;
          if (!dropdownId) return field;
          const dropdown = await api.dropdowns.get(dropdownId);
          return { ...field, options: dropdown.data.options };
        }),
      );
      setType(t.data);
      setName(t.data.name);
      setAssets(f.data);
      setForm(fieldsWithOptions);
      setAllFields((await api.fields.list()).data);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    setOpenFilter(null);
    setColumnFilters({});
    setSelectedAssetIds([]);
    setBulkAction("");
    setEditAsset(null);
  }, [id]);
  useEffect(() => {
    setSelectedAssetIds((current) => current.filter((publicId) => assets?.items.some((asset) => asset.publicId === publicId)));
  }, [assets]);
  const attached = new Set(form.map((x) => x.id));
  async function saveForm(local) {
    try {
      await api.assetTypes.saveForm(id, {
        fields: local.map((x) => ({
          fieldDefinitionId: x.id,
          required: Boolean(x.required),
        })),
      });
      setConfigureForm(false);
      showToast("Asset form saved successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function saveColumns(columns) {
    try {
      await api.assetTypes.saveForm(id, {
        fields: columns.map((x) => ({
          fieldDefinitionId: x.id,
          required: Boolean(x.required),
          showInList: Boolean(x.showInList),
        })),
      });

      setCustomizeColumns(false);
      showToast("Asset list columns saved successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function rename(e) {
    e.preventDefault();
    try {
      await api.assetTypes.update(id, { name });
      setEditName(false);
      showToast("Asset type renamed successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function deleteAssetType(e) {
    e.preventDefault();
    if (!deleteConfirmed) return;
    setDeleteLoading(true);
    try {
      await api.assetTypes.remove(id);
      showToast("Asset type deleted successfully.");
      navigate("/");
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleteLoading(false);
    }
  }
  async function openShareModal() {
    setError("");
    setShareOpen(true);
    setShareLoading(true);
    try {
      const [usersRes, sharesRes] = await Promise.all([
        api.users.list(),
        api.assetTypes.getShares(id),
      ]);
      setShareUsers(
        usersRes.data.filter(
          (u) => u.role !== "admin" && u.isActive && Number(u.id) !== Number(user?.id),
        ),
      );
      setShareSelected(sharesRes.data.map((s) => Number(s.user_id)));
    } catch (e) {
      setError(e.message);
    } finally {
      setShareLoading(false);
    }
  }
  function toggleShareUser(userId) {
    setShareSelected((current) =>
      current.includes(userId)
        ? current.filter((x) => x !== userId)
        : [...new Set([...current, userId])],
    );
  }
  async function saveShares() {
    setShareSaving(true);
    try {
      await api.assetTypes.setShares(id, shareSelected);
      setShareOpen(false);
      showToast("Sharing updated successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setShareSaving(false);
    }
  }
  async function assetEdited() {
    setEditAsset(null);
    await load();
  }
  const visibleFields = form.filter((f) => f.showInList !== false);
  const displayValue = (asset, field) => {
    const value = asset.values?.[field.field_key];
    if (field.type === "date" || field.type === "auto_date") {
      return formatDateValue(value);
    }
    if (field.type === "dropdown") {
      return field.options?.find((option) => String(option.value) === String(value))?.label ?? String(value ?? "");
    }
    return String(value ?? "");
  };
  const filterValues = Object.fromEntries(
    visibleFields.map((field) => [
      field.field_key,
      [...new Set((assets?.items || []).map((asset) => displayValue(asset, field)))].sort(
        (a, b) => a.localeCompare(b, undefined, { numeric: true }),
      ),
    ]),
  );
  const filteredItems = (assets?.items || []).filter((asset) =>
    visibleFields.every((field) => {
      const selected = columnFilters[field.field_key];
      return !selected?.length || selected.includes(displayValue(asset, field));
    }),
  );
  const selectedItems = filteredItems.filter((asset) => selectedAssetIds.includes(asset.publicId));
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every((asset) => selectedAssetIds.includes(asset.publicId));
  const bulkField = form.find((field) => field.field_key === bulkFieldKey);
  const bulkOptions = bulkField?.options?.filter((option) => option.is_active) || [];
  function toggleAssetSelection(publicId, checked) {
    setSelectedAssetIds((current) => checked ? [...new Set([...current, publicId])] : current.filter((idValue) => idValue !== publicId));
  }
  async function runBulkUpdate(event) {
    event.preventDefault();
    setBulkLoading(true);
    try {
      const isDateField = bulkField?.type === "date" || bulkField?.type === "auto_date";
      const value = isDateField
        ? /^\d{4}-\d{2}-\d{2}$/.test(bulkValue) ? bulkValue : indianDateToIso(bulkValue)
        : bulkField?.type === "number"
          ? Number(bulkValue)
          : bulkField?.type === "boolean"
            ? bulkValue === "true"
            : bulkValue;
      if (isDateField && !value) {
        setError(`${bulkField.name} must be a valid date.`);
        return;
      }
      const res = await api.assets.bulkUpdate(id, selectedAssetIds, { [bulkFieldKey]: value });
      const queued = res.data.notificationsQueued || 0;
      const base = `${selectedAssetIds.length} asset${selectedAssetIds.length === 1 ? "" : "s"} updated successfully.`;
      if (queued > 0) showToast(`${base} ${queued} notification${queued === 1 ? "" : "s"} queued.`, "queued");
      else showToast(base);
      setBulkAction("");
      setSelectedAssetIds([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkLoading(false);
    }
  }
  async function runBulkDelete() {
    if (!window.confirm(`You are about to delete ${selectedAssetIds.length} assets in bulk. This action cannot be undone.`)) {
      setBulkAction("");
      return;
    }
    setBulkLoading(true);
    try {
      await api.assets.bulkRemove(id, selectedAssetIds);
      showToast(`${selectedAssetIds.length} asset${selectedAssetIds.length === 1 ? "" : "s"} deleted successfully.`);
      setBulkAction("");
      setSelectedAssetIds([]);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBulkLoading(false);
    }
  }
  function exportAssets() {
    const rows = filteredItems.map((asset) =>
      Object.fromEntries(
        visibleFields.map((field) => [field.name, displayValue(asset, field)]),
      ),
    );
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Assets");
    XLSX.writeFile(workbook, `${type.slug || type.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-assets.xlsx`);
  }
  if (!type) return <div className="text-sm text-slate-500">Loading...</div>;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <Link
            to="/"
            className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-700"
          >
            Assets
          </Link>
          <span aria-hidden="true" className="shrink-0 text-[11px] text-slate-300">
            /
          </span>
          <h2 className="break-words text-lg font-bold leading-tight">
            {type.name}
          </h2>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
            {type.asset_count} asset{Number(type.asset_count) === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {can("assets.create_own") && (
            <Link to={`/asset-types/${id}/new`}>
              <Button size="sm">+ Add Asset</Button>
            </Link>
          )}

          {canEditForm && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfigureForm(true)}
            >
              Configure Form
            </Button>
          )}

          {can("reports.export_own") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={exportAssets}
              disabled={!filteredItems.length}
            >
              Export XLSX
            </Button>
          )}

          {can("automations.manage_own") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setConfigureAutomations(true)}
              title="Configure Automations"
            >
              Automations
            </Button>
          )}

          {canEditForm && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setColumnForm(
                  form.map((x) => ({
                    ...x,
                    showInList: x.showInList !== false,
                  })),
                );
                setCustomizeColumns(true);
              }}
              title="Customize Columns"
            >
              Columns
            </Button>
          )}

          {isAdmin && (
            <Button size="sm" variant="secondary" onClick={openShareModal}>
              Share
            </Button>
          )}
          {can("asset_types.edit_own") && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setEditName(true)}
            >
              Rename
            </Button>
          )}
          {can("asset_types.delete_own") && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setDeleteConfirmed(false);
                setDeleteOpen(true);
              }}
              title="Delete Asset Type"
            >
              Delete
            </Button>
          )}
        </div>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      <div>
        <section>
          <div className="mb-3">
            
            <p className="text-sm text-slate-500">
              Click an asset to view or edit it.
            </p>
          </div>
          {assets?.items.length === 0 ? (
            <EmptyState
              title={`No ${type.name.toLowerCase()} assets`}
              description="Add your first asset using the configured form."
              action={
                can("assets.create_own") ? (
                  <Link to={`/asset-types/${id}/new`}>
                    <Button>Add Asset</Button>
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <Card className="overflow-visible">
              {(Object.values(columnFilters).some((values) => values.length > 0) ||
                filteredItems.length !== assets.items.length) && (
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm">
                  <span className="text-slate-500">
                    Showing {filteredItems.length} of {assets.items.length} assets
                  </span>
                  <button
                    type="button"
                    className="font-semibold text-slate-700 hover:text-slate-950"
                    onClick={() => setColumnFilters({})}
                  >
                    Clear filters
                  </button>
                </div>
              )}
              {canBulk && selectedAssetIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <span className="mr-1 text-sm font-semibold text-slate-700">{selectedAssetIds.length} selected</span>
                  <Select
                    label=""
                    value={bulkAction}
                    onChange={(event) => {
                      setBulkAction(event.target.value);
                      if (event.target.value === "update") {
                        setBulkFieldKey("");
                        setBulkValue("");
                      }
                      if (event.target.value === "delete") runBulkDelete();
                    }}
                    options={[{ value: "update", label: "Update selected" }, { value: "delete", label: "Delete selected" }]}
                  />
                  <button type="button" className="text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={() => setSelectedAssetIds([])}>Clear selection</button>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">
                        {canBulk && <input type="checkbox" aria-label="Select visible assets" checked={allVisibleSelected} onChange={(event) => setSelectedAssetIds(event.target.checked ? [...new Set([...selectedAssetIds, ...filteredItems.map((asset) => asset.publicId)])] : selectedAssetIds.filter((publicId) => !filteredItems.some((asset) => asset.publicId === publicId)))} />}
                      </th>
                      {visibleFields.map((f) => (
                        <th key={f.id} ref={openFilter === f.field_key ? filterAnchorRef : null} className="px-4 py-3">
                          <button
                            type="button"
                            className={`inline-flex items-center gap-2 text-left hover:text-slate-900 ${
                              columnFilters[f.field_key]?.length
                                ? "text-slate-950"
                                : ""
                            }`}
                            onClick={() =>
                              setOpenFilter((current) =>
                                current === f.field_key ? null : f.field_key,
                              )
                            }
                          >
                            <span>{f.name}</span>
                            <span aria-hidden="true">
                              {columnFilters[f.field_key]?.length ? "●" : "▾"}
                            </span>
                          </button>
                          {openFilter === f.field_key && (
                            <ColumnFilter
                              anchorRef={filterAnchorRef}
                              onClose={() => setOpenFilter(null)}
                              field={f}
                              values={filterValues[f.field_key]}
                              selectedValues={columnFilters[f.field_key] || []}
                              onToggle={(value, checked) =>
                                setColumnFilters((current) => {
                                  const selected = current[f.field_key] || [];
                                  const next = checked
                                    ? [...new Set([...selected, value])]
                                    : selected.filter((item) => item !== value);
                                  return { ...current, [f.field_key]: next };
                                })
                              }
                              onClear={() =>
                                setColumnFilters((current) => ({
                                  ...current,
                                  [f.field_key]: [],
                                }))
                              }
                            />
                          )}
                        </th>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody className="row-hover divide-y divide-slate-100">
                    {filteredItems.map((a) => (
                      <tr key={a.publicId}>
                        <td className="px-4 py-3">{canBulk && <input type="checkbox" aria-label={`Select asset ${a.publicId}`} checked={selectedAssetIds.includes(a.publicId)} onChange={(event) => toggleAssetSelection(a.publicId, event.target.checked)} />}</td>
                        {visibleFields.map((f) => (
                            <td
                              key={f.id}
                              className="max-w-[180px] truncate px-4 py-3"
                            >
                              {displayValue(a, f)}
                            </td>
                          ))}
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {canEditAsset ? (
                            <button
                              type="button"
                              className="font-semibold text-slate-700 hover:text-slate-950"
                              onClick={() => setEditAsset(a)}
                            >
                              Edit
                            </button>
                          ) : (
                            <Link
                              className="font-semibold text-slate-700"
                              to={`/assets/${a.publicId}`}
                            >
                              Open →
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </section>
      </div>
      <Modal
        open={bulkAction === "update"}
        title={`Update ${selectedAssetIds.length} selected asset${selectedAssetIds.length === 1 ? "" : "s"}`}
        onClose={() => setBulkAction("")}
      >
        <form onSubmit={runBulkUpdate} className="space-y-4">
          <Select
            label="Field"
            value={bulkFieldKey}
            onChange={(event) => {
              setBulkFieldKey(event.target.value);
              setBulkValue("");
            }}
            options={form.filter((field) => field.type !== "quantity").map((field) => ({ value: field.field_key, label: field.name }))}
            required
          />
          {bulkField?.type === "dropdown" ? (
            <Select label="Value" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} options={bulkOptions.map((option) => ({ value: option.value, label: option.label }))} required />
          ) : bulkField?.type === "boolean" ? (
            <Select label="Value" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} required />
          ) : (
            bulkField?.type === "date" || bulkField?.type === "auto_date" ? (
              <DateInput label="Value" value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} required />
            ) : (
              <Input label="Value" type={bulkField?.type === "number" ? "number" : "text"} value={bulkValue} onChange={(event) => setBulkValue(event.target.value)} required />
            )
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setBulkAction("")}>Cancel</Button>
            <Button loading={bulkLoading} disabled={!bulkFieldKey}>Update assets</Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={editName}
        title="Rename Asset Type"
        onClose={() => setEditName(false)}
      >
        <form onSubmit={rename} className="space-y-4">
          <Input
            label="Asset Type Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button className="w-full">Save</Button>
        </form>
      </Modal>
      <Modal
        open={deleteOpen}
        title="Delete Asset Type"
        onClose={() => { setDeleteOpen(false); setDeleteConfirmed(false); }}
      >
        <form onSubmit={deleteAssetType} className="space-y-4">
          <p className="text-sm text-slate-600">
            You are about to delete <strong>{type.name}</strong>. This action cannot be undone. Asset types with existing assets cannot be deleted; delete those assets first.
          </p>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={deleteConfirmed} onChange={(event) => setDeleteConfirmed(event.target.checked)} />
            I understand this operation cannot be undone.
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => { setDeleteOpen(false); setDeleteConfirmed(false); }}>Cancel</Button>
            <Button variant="danger" loading={deleteLoading} disabled={!deleteConfirmed}>Delete asset type</Button>
          </div>
        </form>
      </Modal>
      <Modal
        open={configureForm}
        title="Configure Asset Form"
        onClose={() => setConfigureForm(false)}
        className="max-w-4xl"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Add, remove, require and reorder fields for this asset type.
          </p>
          <Card className="p-4">
            <div className="flex gap-2">
              <select
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
                value={addField}
                onChange={(e) => setAddField(e.target.value)}
              >
                <option value="">Add existing field...</option>
                {allFields
                  .filter((f) => f.is_active && !attached.has(f.id))
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
              </select>
              <Button
                disabled={!addField}
                onClick={() => {
                  const f = allFields.find((x) => x.id === Number(addField));
                  setForm([
                    ...form,
                    {
                      ...f,
                      id: f.id,
                      dropdownId: f.dropdown_id,
                      required: false,
                      showInList: true,
                    },
                  ]);
                  setAddField("");
                }}
              >
                Add
              </Button>
            </div>
          </Card>
          <FieldForm fields={form} onSave={saveForm} />
        </div>
      </Modal>
      <Modal
        open={configureAutomations}
        title="Configure Automations"
        onClose={() => setConfigureAutomations(false)}
        className="max-w-6xl"
      >
        <AutomationBuilder assetTypeId={id} fields={form} />
      </Modal>
      <Modal
        open={customizeColumns}
        title="Customize Asset List"
        onClose={() => setCustomizeColumns(false)}
        className="max-w-4xl"
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-500">
              Choose which fields should appear as columns in the asset list.
            </p>
          </div>

          {columnForm.length === 0 ? (
            <EmptyState
              title="No fields configured"
              description="Add fields to this asset type first."
            />
          ) : (
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {columnForm.map((f, index) => (
                <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1">
                    <div className="font-medium">{f.name}</div>

                    <div className="text-xs text-slate-500">{f.type}</div>
                  </div>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(f.showInList)}
                      onChange={(e) =>
                        setColumnForm((current) =>
                          current.map((x) =>
                            x.id === f.id
                              ? {
                                  ...x,
                                  showInList: e.target.checked,
                                }
                              : x,
                          ),
                        )
                      }
                    />
                    Show
                  </label>

                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => {
                        setColumnForm((current) => {
                          const next = [...current];

                          [next[index - 1], next[index]] = [
                            next[index],
                            next[index - 1],
                          ];

                          return next;
                        });
                      }}
                    >
                      ↑
                    </Button>

                    <Button
                      variant="ghost"
                      disabled={index === columnForm.length - 1}
                      onClick={() => {
                        setColumnForm((current) => {
                          const next = [...current];

                          [next[index], next[index + 1]] = [
                            next[index + 1],
                            next[index],
                          ];

                          return next;
                        });
                      }}
                    >
                      ↓
                    </Button>
                  </div>
                </div>
              ))}
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setCustomizeColumns(false)}
            >
              Cancel
            </Button>

            <Button onClick={() => saveColumns(columnForm)}>
              Save Columns
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={shareOpen}
        title="Share this asset type"
        onClose={() => setShareOpen(false)}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Choose which users can access <strong>{type.name}</strong>. Shared
            users see the type in their list with its full form, fields and
            automations, and can add or edit entries. Only you and admins can
            change its structure.
          </p>
          {shareLoading ? (
            <div className="py-6 text-center text-sm text-slate-500">Loading users…</div>
          ) : shareUsers.length === 0 ? (
            <EmptyState
              title="No other users"
              description="Create non-admin users in Settings to share this asset type with them."
            />
          ) : (
            <Card className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {shareUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-100"
                >
                  <input
                    type="checkbox"
                    checked={shareSelected.includes(Number(u.id))}
                    onChange={() => toggleShareUser(Number(u.id))}
                  />
                  <span className="truncate">{u.email}</span>
                </label>
              ))}
            </Card>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShareOpen(false)}>
              Cancel
            </Button>
            <Button loading={shareSaving} disabled={shareLoading} onClick={saveShares}>
              Save sharing
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        open={Boolean(editAsset)}
        title={`Edit ${type.name}${
          editAsset && visibleFields[0]
            ? ` · ${displayValue(editAsset, visibleFields[0]).slice(0, 40)}`
            : ""
        }`}
        onClose={() => setEditAsset(null)}
        className="max-w-3xl"
      >
        {editAsset && (
          <AssetForm
            assetTypeId={id}
            publicId={editAsset.publicId}
            onSaved={assetEdited}
            onCancel={() => setEditAsset(null)}
            footerExtra={
              <Link
                to={`/assets/${editAsset.publicId}`}
                className="text-sm text-slate-500 hover:text-slate-900"
              >
                View full page
              </Link>
            }
          />
        )}
      </Modal>
    </div>
  );
}
