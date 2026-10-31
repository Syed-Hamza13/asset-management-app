import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { Button, Card, EmptyState, Modal } from "../../components/ui";

// Admin-only: publish this asset type to selected non-admin users. The list of
// candidates and the current share set are fetched when the dialog opens, so it
// always reflects the server.
export function ShareTypeModal({ open, assetTypeId, typeName, viewerId, onClose, onError, onSave }) {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [usersRes, sharesRes] = await Promise.all([
          api.users.list(),
          api.assetTypes.getShares(assetTypeId),
        ]);
        if (cancelled) return;
        setUsers(
          usersRes.data.filter(
            (u) => u.role !== "admin" && u.isActive && Number(u.id) !== Number(viewerId),
          ),
        );
        setSelected(sharesRes.data.map((s) => Number(s.user_id)));
      } catch (e) {
        if (!cancelled) onError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      await onSave(selected);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} title="Share this asset type" onClose={onClose} className="max-w-lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Choose which users can access <strong>{typeName}</strong>. Shared
          users see the type in their list with its full form, fields and
          automations, and can add or edit entries. Only you and admins can
          change its structure.
        </p>
        {loading ? (
          <div className="py-6 text-center text-sm text-slate-500">Loading users…</div>
        ) : users.length === 0 ? (
          <EmptyState
            title="No other users"
            description="Create non-admin users in Settings to share this asset type with them."
          />
        ) : (
          <Card className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {users.map((u) => (
              <label
                key={u.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-slate-100"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(Number(u.id))}
                  onChange={() =>
                    setSelected((current) =>
                      current.includes(Number(u.id))
                        ? current.filter((x) => x !== Number(u.id))
                        : [...new Set([...current, Number(u.id)])],
                    )
                  }
                />
                <span className="truncate">{u.email}</span>
              </label>
            ))}
          </Card>
        )}
        <div className="dialog-actions flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={loading} onClick={save}>
            Save sharing
          </Button>
        </div>
      </div>
    </Modal>
  );
}
