import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Card, Input } from "../../components/ui";

export function IpAccessCard() {
  const { showToast } = useToast();
  const [cfg, setCfg] = useState(null);
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [quickEntryEnabled, setQuickEntryEnabled] = useState(false);
  const [list, setList] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.ipAccess.get().then((res) => {
      setCfg(res.data);
      setLoginEnabled(res.data.loginEnabled);
      setQuickEntryEnabled(res.data.quickEntryEnabled);
      setList(res.data.list || "");
    }).catch((e) => setError(e.message));
  }, []);

  const unchanged = cfg
    && loginEnabled === cfg.loginEnabled
    && quickEntryEnabled === cfg.quickEntryEnabled
    && list === (cfg.list || "");

  async function save() {
    setError(""); setBusy(true);
    try {
      const res = await api.ipAccess.update({ loginEnabled, quickEntryEnabled, list });
      setCfg(res.data); setList(res.data.list || "");
      showToast("Network restriction saved.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function addYourIp() {
    const ip = cfg?.yourIp;
    if (!ip) return;
    setList((prev) => {
      const already = prev.split(/[\n,;]+/).map((entry) => entry.trim()).includes(ip);
      if (already) return prev;
      return prev.trim() ? `${prev.trim()}\n${ip}` : ip;
    });
  }

  if (!cfg) return <Card className="p-6"><h3 className="font-semibold">Network restriction (IP allowlist)</h3><p className="mt-1 text-sm text-slate-500">Loading…</p></Card>;

  const anyEnabled = loginEnabled || quickEntryEnabled;
  const lockoutWarning = (cfg.loginEnabled || cfg.quickEntryEnabled) && !cfg.yourIpAllowed
    ? `Your current IP (${cfg.yourIp || "unknown"}) is not on the saved list, so this very page would show 404 (Not Found) after you sign out. Add it before keeping a switch on.`
    : "";
  const bypassNotice = cfg.enforced === false
    ? "Enforcement is currently switched off on the server (IP_ACCESS_ENFORCE=false), so the list below is saved but not applied."
    : "";

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Network restriction (IP allowlist)</h3>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${anyEnabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {anyEnabled ? "Active" : "Inactive"}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Only the addresses or networks listed below can use this app. Anyone outside them gets a plain 404 (Not Found) — no login page, no message, nothing else.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-500">IP the server sees for you:</span>
        <span className="font-mono font-semibold text-slate-800">{cfg.yourIp || "unknown"}</span>
        <Button variant="secondary" className="ml-auto px-3 py-1.5 text-xs" onClick={addYourIp}>Add to list</Button>
        <p className="w-full text-xs text-slate-500">
          Check this value from a second device before relying on the list: if the app runs in Docker with a published port, every visitor can appear as the same gateway IP, and a per-device range will not match.
        </p>
      </div>

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}
      {lockoutWarning && <div className="mt-4"><Alert>{lockoutWarning}</Alert></div>}
      {bypassNotice && <div className="mt-4"><Alert>{bypassNotice}</Alert></div>}
      {cfg.invalidCount > 0 && (
        <div className="mt-4"><Alert>{`${cfg.invalidCount} saved entries could not be read and are ignored: ${cfg.invalid.slice(0, 5).map((entry) => entry.raw).join(", ")}`}</Alert></div>
      )}

      <div className="mt-5 space-y-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={loginEnabled} onChange={(e) => setLoginEnabled(e.target.checked)} />
          <span><span className="font-medium">Restrict the whole app</span><span className="block text-slate-500">Sign-in and every page answer 404 for networks outside the list.</span></span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300" checked={quickEntryEnabled} onChange={(e) => setQuickEntryEnabled(e.target.checked)} />
          <span><span className="font-medium">Restrict Quick Entry</span><span className="block text-slate-500">The form stays hidden and submissions are rejected for other networks.</span></span>
        </label>
      </div>

      <div className="mt-5">
        <Input
          label="Allowed addresses"
          type="textarea"
          spellCheck={false}
          placeholder={"192.168.1.23\n192.168.1.0/24\n10.0.0.5-10.0.0.40\n192.168.7.*"}
          value={list}
          onChange={(e) => setList(e.target.value)}
          hint={`One per line (or separated by commas). Accepts a single IP, a CIDR block, a from-to range or a trailing wildcard. ${cfg.entryCount} of ${cfg.maxEntries} entries in use.`}
        />
      </div>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} loading={busy} disabled={unchanged}>Save</Button>
      </div>
    </Card>
  );
}
