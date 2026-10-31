import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Alert, Button, Input, Modal } from "../components/ui";
import { AutomationBuilder } from "../components/AutomationBuilder";
import { AssetForm } from "../components/AssetForm";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { useColumnFilters } from "../hooks/useColumnFilters";
import { formatAssetValue, withDropdownOptions } from "../utils/assetValues";
import { downloadXlsx } from "../utils/xlsx";
import { AssetListTable } from "./assetType/AssetListTable";
import { BulkUpdateModal } from "./assetType/BulkUpdateModal";
import { ConfigureFormModal } from "./assetType/ConfigureFormModal";
import { CustomizeColumnsModal } from "./assetType/CustomizeColumnsModal";
import { ShareTypeModal } from "./assetType/ShareTypeModal";

export function AssetType() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [type, setType] = useState(null);
  const [assets, setAssets] = useState(null);
  const [form, setForm] = useState([]);
  const [allFields, setAllFields] = useState([]);
  const [error, setError] = useState("");
  const [editName, setEditName] = useState(false);
  const [name, setName] = useState("");
  const [customizeColumns, setCustomizeColumns] = useState(false);
  const [configureForm, setConfigureForm] = useState(false);
  const [configureAutomations, setConfigureAutomations] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const filterAnchorRef = useRef(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [bulkAction, setBulkAction] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editAsset, setEditAsset] = useState(null);
  const { showToast } = useToast();
  const { can, isAdmin, user } = useAuth();
  const canEditForm = can("asset_types.edit_own") || can("fields.manage_own");
  const canBulk = can("assets.bulk_own");
  const canEditAsset = can("assets.edit_own");

  async function load() {
    try {
      const [t, f, fl] = await Promise.all([
        api.assetTypes.get(id),
        api.assets.list(id),
        api.assetTypes.form(id),
      ]);
      setType(t.data);
      setName(t.data.name);
      setAssets(f.data);
      setForm(await withDropdownOptions(fl.data));
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
    setSelectedAssetIds([]);
    setBulkAction("");
    setEditAsset(null);
  }, [id]);
  useEffect(() => {
    setSelectedAssetIds((current) => current.filter((publicId) => assets?.items.some((asset) => asset.publicId === publicId)));
  }, [assets]);

  const visibleFields = form.filter((f) => f.showInList !== false);
  const filterColumns = visibleFields.map((f) => ({ ...f, key: f.field_key }));
  const displayValue = useCallback(
    (asset, field) => formatAssetValue(asset.values?.[field.field_key], field),
    [],
  );
  const {
    filters: columnFilters,
    filterValues,
    filteredItems,
    toggleValue,
    clearColumn,
    clearAll,
    hasActiveFilters,
  } = useColumnFilters({
    items: assets?.items || [],
    columns: filterColumns,
    display: displayValue,
    resetKey: id,
  });

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
  async function saveShares(selectedUserIds) {
    try {
      await api.assetTypes.setShares(id, selectedUserIds);
      setShareOpen(false);
      showToast("Sharing updated successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function assetEdited() {
    setEditAsset(null);
    await load();
  }
  function toggleAssetSelection(publicId, checked) {
    setSelectedAssetIds((current) => checked ? [...new Set([...current, publicId])] : current.filter((idValue) => idValue !== publicId));
  }
  function selectVisibleAssets(checked) {
    setSelectedAssetIds(checked
      ? [...new Set([...selectedAssetIds, ...filteredItems.map((asset) => asset.publicId)])]
      : selectedAssetIds.filter((publicId) => !filteredItems.some((asset) => asset.publicId === publicId)));
  }
  async function runBulkUpdate(fieldKey, value) {
    const res = await api.assets.bulkUpdate(id, selectedAssetIds, { [fieldKey]: value });
    const queued = res.data.notificationsQueued || 0;
    const base = `${selectedAssetIds.length} asset${selectedAssetIds.length === 1 ? "" : "s"} updated successfully.`;
    if (queued > 0) showToast(`${base} ${queued} notification${queued === 1 ? "" : "s"} queued.`, "queued");
    else showToast(base);
  }
  async function finishBulkUpdate() {
    setBulkAction("");
    setSelectedAssetIds([]);
    await load();
  }
  async function runBulkDelete() {
    if (!window.confirm(`You are about to delete ${selectedAssetIds.length} assets in bulk. This action cannot be undone.`)) {
      setBulkAction("");
      return;
    }
    try {
      await api.assets.bulkRemove(id, selectedAssetIds);
      showToast(`${selectedAssetIds.length} asset${selectedAssetIds.length === 1 ? "" : "s"} deleted successfully.`);
      setBulkAction("");
      setSelectedAssetIds([]);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  function onBulkActionChange(value) {
    setBulkAction(value);
    if (value === "delete") runBulkDelete();
  }
  function exportAssets() {
    const rows = filteredItems.map((asset) =>
      Object.fromEntries(
        visibleFields.map((field) => [field.name, displayValue(asset, field)]),
      ),
    );
    downloadXlsx(rows, {
      sheet: "Assets",
      fileName: `${type.slug || type.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-assets.xlsx`,
    });
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
              onClick={() => setCustomizeColumns(true)}
              title="Customize Columns"
            >
              Columns
            </Button>
          )}

          {isAdmin && (
            <Button size="sm" variant="secondary" onClick={() => { setError(""); setShareOpen(true); }}>
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
          <AssetListTable
            id={id}
            type={type}
            canCreateAsset={can("assets.create_own")}
            visibleFields={visibleFields}
            items={assets?.items || []}
            filteredItems={filteredItems}
            hasActiveFilters={hasActiveFilters}
            filters={columnFilters}
            filterValues={filterValues}
            openFilter={openFilter}
            filterAnchorRef={filterAnchorRef}
            onOpenFilter={(key) => setOpenFilter((current) => current === key ? null : key)}
            onCloseFilter={() => setOpenFilter(null)}
            displayValue={displayValue}
            onToggleFilterValue={toggleValue}
            onClearColumn={clearColumn}
            onClearFilters={clearAll}
            canBulk={canBulk}
            selectedAssetIds={selectedAssetIds}
            onSelectVisible={selectVisibleAssets}
            onToggleAsset={toggleAssetSelection}
            onClearSelection={() => setSelectedAssetIds([])}
            bulkAction={bulkAction}
            onBulkActionChange={onBulkActionChange}
            canEditAsset={canEditAsset}
            onEditAsset={setEditAsset}
          />
        </section>
      </div>
      {/* Mounted only while open so each dialog starts from the saved state. */}
      {bulkAction === "update" && (
        <BulkUpdateModal
          open
          count={selectedAssetIds.length}
          fields={form}
          onClose={() => setBulkAction("")}
          onSubmit={runBulkUpdate}
          onSuccess={finishBulkUpdate}
          onError={setError}
        />
      )}
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
      {configureForm && (
        <ConfigureFormModal
          open
          onClose={() => setConfigureForm(false)}
          fields={form}
          allFields={allFields}
          onFieldsChange={setForm}
          onSave={saveForm}
        />
      )}
      <Modal
        open={configureAutomations}
        title="Configure Automations"
        onClose={() => setConfigureAutomations(false)}
        className="max-w-6xl"
      >
        <AutomationBuilder assetTypeId={id} fields={form} />
      </Modal>
      {customizeColumns && (
        <CustomizeColumnsModal
          open
          onClose={() => setCustomizeColumns(false)}
          fields={form}
          onSave={saveColumns}
        />
      )}
      <ShareTypeModal
        open={shareOpen}
        assetTypeId={id}
        typeName={type.name}
        viewerId={user?.id}
        onClose={() => setShareOpen(false)}
        onError={setError}
        onSave={saveShares}
      />
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
