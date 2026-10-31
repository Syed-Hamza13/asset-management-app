import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Card } from "../../components/ui";

export function TurnstileCard() {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.turnstile.settings().then((res) => { setCfg(res.data); setEnabled(res.data.enabled); })
      .catch((e) => setError(e.message));
  }, []);

  async function save() {
    setError(""); setBusy(true);
    try { const res = await api.turnstile.update(enabled); setCfg(res.data); showToast(`Turnstile is now ${res.data.enabled ? "enabled" : "disabled"}.`); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!cfg) return <Card className="p-6"><h3 className="font-semibold">Turnstile (human verification)</h3><p className="mt-1 text-sm text-slate-500">Loading…</p></Card>;

  const warning = cfg.enabled && !cfg.hasSiteKey
    ? "Turnstile is enabled but this server has no site key, so sign-in will be blocked."
    : cfg.enabled && !cfg.hasSecretKey
      ? "Turnstile is enabled but this server has no secret key, so verification cannot complete."
      : "";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Turnstile (human verification)</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {cfg.enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">Show a Cloudflare Turnstile challenge on the sign-in and setup pages. Only applies in production.</p>
      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {warning && <div className="mt-4"><Alert>{warning}</Alert></div>}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Require Turnstile verification
        </label>
        <Button onClick={save} loading={busy} disabled={enabled === cfg.enabled}>Save</Button>
      </div>
    </Card>
  );
}
