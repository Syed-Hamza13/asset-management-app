import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, EmptyState, Select } from "../components/ui";

const STATUSES = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "sending", label: "Sending" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

const BADGE = {
  pending: "bg-slate-100 text-slate-600",
  sending: "bg-amber-100 text-amber-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-400",
};

function fmt(date) {
  if (!date) return "";
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString();
}

export function EmailHistory() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState("");
  const [allUsers, setAllUsers] = useState(false);
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const params = { status, limit: 200 };
      const res = allUsers && isAdmin
        ? await api.email.historyAll(params)
        : await api.email.history(params);
      setRows(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [status, allUsers]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h2 className="page-title text-2xl font-bold">Email History</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every notification email queued from your asset activity.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[150px] flex-1 sm:w-48 sm:flex-none">
          <Select hideBlank label="Status" value={status} onChange={(e) => setStatus(e.target.value)} options={STATUSES} />
        </div>
        {isAdmin && (
          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allUsers} onChange={(e) => setAllUsers(e.target.checked)} />
            <span>All users</span>
          </label>
        )}
        <div className="w-full pb-1.5 sm:ml-auto sm:w-auto">
          <Button variant="secondary" className="w-full sm:w-auto" onClick={load} disabled={loading}>Refresh</Button>
        </div>
      </div>

      {error && <div className="mb-3"><Alert>{error}</Alert></div>}

      {rows.length === 0 && !loading ? (
        <EmptyState title="No notifications yet" description="When an asset rule fires, queued and sent emails appear here." />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {rows.map((r) => {
            const to = Array.isArray(r.recipients) ? r.recipients.map((x) => x.email || x).join(", ") : "";
            const open = expanded === r.id;
            return (
              <div key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                  onClick={() => setExpanded(open ? null : r.id)}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${BADGE[r.status] || "bg-slate-100 text-slate-600"}`}>{r.status}</span>
                      <span className="truncate font-medium">{r.template?.subject || "(no subject)"}</span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500">
                      {r.eventType === "asset_created" ? "Asset created" : "Field changed"}
                      {r.assetPublicId ? ` · ${r.assetPublicId}` : ""}
                      {allUsers && isAdmin && r.ownerEmail ? ` · ${r.ownerEmail}` : ""}
                      {r.createdAt ? ` · ${fmt(r.createdAt)}` : ""}
                    </div>
                    {r.status === "failed" && r.lastError && (
                      <div className="mt-1 truncate text-xs text-red-600">{r.lastError}</div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{open ? "Hide" : "Details"}</span>
                </button>
                {open && (
                  <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-4 py-3 text-xs">
                    <div><span className="font-semibold text-slate-500">To:</span> {to || "—"}</div>
                    <div><span className="font-semibold text-slate-500">Template:</span> {r.template?.name || "—"}</div>
                    <div><span className="font-semibold text-slate-500">Attempts:</span> {r.attempts}</div>
                    {r.sentAt && <div><span className="font-semibold text-slate-500">Sent:</span> {fmt(r.sentAt)}</div>}
                    {r.lastError && <div className="text-red-600"><span className="font-semibold">Error:</span> {r.lastError}</div>}
                    {r.template?.body && (
                      <div>
                        <div className="mb-1 font-semibold text-slate-500">Body snapshot:</div>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-2 text-slate-700">{r.template.body}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
