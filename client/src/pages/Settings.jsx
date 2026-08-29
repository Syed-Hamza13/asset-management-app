import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Alert, Button, Card, Input } from "../components/ui";

const maxImageSize = 2 * 1024 * 1024;

function ImageUpload({ label, value, onChange }) {
  function selectImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > maxImageSize) {
      onChange(null, "Please choose an image smaller than 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result, "");
    reader.readAsDataURL(file);
  }
  return <div className="flex items-center gap-3">
    {value && <img src={value} alt="Preview" className="h-12 w-12 rounded-xl border border-slate-200 object-cover" />}
    <div className="min-w-0 flex-1"><div className="text-sm font-medium text-slate-700">{label}</div><div className="text-xs text-slate-500">PNG, JPG, GIF or SVG, max 2 MB</div></div>
    <label className="inline-flex cursor-pointer items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">Choose image<input type="file" accept="image/*" className="sr-only" onChange={selectImage} /></label>
  </div>;
}

export function Settings() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [branding, setBranding] = useState({ favicon: "", appIcon: "" });
  const [error, setError] = useState("");
  const [brandingError, setBrandingError] = useState("");
  const [loading, setLoading] = useState(false);
  const [brandingLoading, setBrandingLoading] = useState(false);
  useEffect(() => {
    api.branding.get().then((response) => setBranding(response.data)).catch(() => {});
  }, []);

  async function submitPassword(event) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await api.changePassword(form); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); showToast("Password changed successfully."); setTimeout(() => window.location.assign("/login"), 400); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  async function saveBranding(event) {
    event.preventDefault(); setBrandingError(""); setBrandingLoading(true);
    try { if (branding.favicon) await api.branding.update("favicon_data_url", branding.favicon); if (branding.appIcon) await api.branding.update("app_icon_data_url", branding.appIcon); showToast("Branding saved successfully."); }
    catch (e) { setBrandingError(e.message); } finally { setBrandingLoading(false); }
  }

  return <div className="max-w-xl space-y-6">
    <div><h2 className="text-xl font-bold">Settings & Security</h2><p className="mt-1 text-sm text-slate-500">Manage your account and application branding.</p></div>
    <Card className="p-6"><h3 className="font-semibold">Application branding</h3><p className="mt-1 text-sm text-slate-500">Upload a favicon and app icon for this workspace.</p><div className="mt-5">{brandingError && <div className="mb-4"><Alert>{brandingError}</Alert></div>}<form onSubmit={saveBranding} className="space-y-5"><ImageUpload label="Favicon" value={branding.favicon} onChange={(value, message) => { setBranding({ ...branding, favicon: value || branding.favicon }); setBrandingError(message); }} /><ImageUpload label="App icon" value={branding.appIcon} onChange={(value, message) => { setBranding({ ...branding, appIcon: value || branding.appIcon }); setBrandingError(message); }} /><Button loading={brandingLoading}>Save branding</Button></form></div></Card>
    <Card className="p-6"><h3 className="font-semibold">Change password</h3><div className="mt-5">{error && <div className="mb-4"><Alert>{error}</Alert></div>}<form onSubmit={submitPassword} className="space-y-4"><Input label="Current password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required /><Input label="New password" type="password" minLength={10} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required /><Input label="Confirm new password" type="password" minLength={10} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required /><Button loading={loading}>Change password</Button></form></div></Card>
  </div>;
}