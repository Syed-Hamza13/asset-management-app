import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { Button, Card, Alert } from "../components/ui";
import { formatDateValue, formatIndiaDateTime } from "../utils";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
export function AssetDetail() {
  const { publicId } = useParams();
  const nav = useNavigate();
  const [asset, setAsset] = useState(null);
  const [fields, setFields] = useState([]);
  const [error, setError] = useState("");
  const { showToast } = useToast();
  const { can } = useAuth();
  useEffect(() => {
    (async () => {
      try {
        const a = await api.assets.get(publicId);
        setAsset(a.data);
        const f = await api.assets.form(a.data.assetTypeId);
        const enriched = await Promise.all(
          f.data.fields.map(async (x) => {
            if (x.type !== "dropdown") return { ...x };
            const dropdownId = x.dropdownId ?? x.dropdown_id;
            if (!dropdownId) return { ...x };
            return { ...x, options: (await api.dropdowns.get(dropdownId)).data.options };
          }),
        );
        setFields(enriched);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [publicId]);
  async function remove() {
    if (!confirm("Delete this asset? This action cannot be undone.")) return;
    try {
      await api.assets.remove(publicId);
      showToast("Asset deleted successfully.");
      nav(`/asset-types/${asset.assetTypeId}`);
    } catch (e) {
      setError(e.message);
    }
  }
  if (!asset)
    return error ? (
      <Alert>{error}</Alert>
    ) : (
      <div className="text-sm text-slate-500">Loading...</div>
    );
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to={`/asset-types/${asset.assetTypeId}`}
            className="text-sm text-slate-500"
          >
            ← {asset.assetTypeName}
          </Link>
          <h2 className="mt-2 text-2xl font-bold">{asset.assetTypeName}</h2>
          <p className="mt-1 font-mono text-xs text-slate-400">
            {asset.publicId}
          </p>
        </div>
        <div className="flex gap-2">
          {can("assets.edit_own") && (
            <Link to={`/assets/${publicId}/edit`}>
              <Button>Edit</Button>
            </Link>
          )}
          {can("assets.delete_own") && (
            <Button variant="danger" onClick={remove}>
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
      <Card className="p-6">
        <div className="grid gap-5 md:grid-cols-2">
          {fields.map((f) => (
            <div key={f.id}>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {f.name}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {f.type === "date" || f.type === "auto_date"
                  ? formatDateValue(asset.values?.[f.key])
                  : f.type === "dropdown"
                    ? f.options?.find((option) => String(option.value) === String(asset.values?.[f.key]))?.label ?? String(asset.values?.[f.key] ?? "")
                    : String(asset.values?.[f.key] ?? "")}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 border-t border-slate-100 pt-4 text-xs text-slate-400">
          Created {formatIndiaDateTime(asset.createdAt)} · Updated{" "}
          {formatIndiaDateTime(asset.updatedAt)} (IST)
        </div>
      </Card>
    </div>
  );
}
