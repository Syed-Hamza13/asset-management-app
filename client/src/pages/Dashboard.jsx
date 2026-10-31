import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  Button,
  Card,
  EmptyState,
  Modal,
  Input,
  SearchInput,
  Alert,
} from "../components/ui";
import { AssetTypeIcon } from "../components/AssetTypeIcon";
import { NotificationBanner } from "../components/NotificationBanner";
import { AddAssetModal } from "./dashboard/AddAssetModal";

export function Dashboard() {
  const [types, setTypes] = useState([]);
  const [open, setOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const { can, isAdmin } = useAuth();
  const canCreateAsset = can("assets.create_own");
  const canCreateType = can("asset_types.create_own");
  const [typeQuery, setTypeQuery] = useState("");
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
  const typeQueryTrimmed = typeQuery.trim().toLowerCase();
  const visibleTypes = typeQueryTrimmed
    ? types.filter((type) => type.name.toLowerCase().includes(typeQueryTrimmed))
    : types;

  function openAddAsset() {
    setError("");
    setOpen(true);
  }

  function addTypeToList(created) {
    setTypes((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  function assetCreated() {
    setOpen(false);
    load();
  }

  return (
    <div>
      <NotificationBanner />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="page-title text-xl font-bold">Assets</h2>
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
      {!loading && types.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput
            value={typeQuery}
            onChange={(e) => setTypeQuery(e.target.value)}
            placeholder="Search asset types by name"
            aria-label="Search asset types"
            className="w-full sm:w-80"
          />
          {typeQueryTrimmed && (
            <span className="text-sm text-slate-500">
              {visibleTypes.length} of {types.length} asset type
              {types.length === 1 ? "" : "s"}
            </span>
          )}
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
      ) : visibleTypes.length === 0 ? (
        <EmptyState
          title={`No asset type matches “${typeQuery.trim()}”`}
          description="Try a different name, or clear the search to see every asset type."
          action={
            <Button variant="secondary" onClick={() => setTypeQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleTypes.map((t) => (
            <Card key={t.id} className="p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <Link to={`/asset-types/${t.id}`} className="flex items-center gap-3">
                <AssetTypeIcon name={t.name} />
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {t.name}{" "}
                    {!isAdmin && t.is_owner === false && (
                      <span className="ml-1 rounded-full bg-sky-100 px-2 py-0.5 align-middle text-xs font-semibold text-sky-700">
                        Shared
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {t.asset_count} asset
                    {Number(t.asset_count) === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            </Card>
          ))}
        </div>
      )}
      {open && (
        <AddAssetModal
          open
          types={types}
          canCreateType={canCreateType}
          error={error}
          onError={setError}
          onTypeCreated={addTypeToList}
          onCreated={assetCreated}
          onClose={() => setOpen(false)}
        />
      )}
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
