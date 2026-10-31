import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Card } from "../../components/ui";

const maxImageSize = 2 * 1024 * 1024;

// The picked image is kept as a data URL in local state and only sent when the
// form is saved, so an oversized or non-image file becomes an inline message.
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

export function BrandingCard() {
  const { showToast } = useToast();
  const [branding, setBranding] = useState({ favicon: "", appIcon: "" });
  const [brandingError, setBrandingError] = useState("");
  const [brandingLoading, setBrandingLoading] = useState(false);

  useEffect(() => {
    api.branding.get().then((response) => setBranding(response.data)).catch(() => {});
  }, []);

  async function saveBranding(event) {
    event.preventDefault(); setBrandingError(""); setBrandingLoading(true);
    try {
      if (branding.favicon) await api.branding.update("favicon_data_url", branding.favicon);
      if (branding.appIcon) await api.branding.update("app_icon_data_url", branding.appIcon);
      showToast("Branding saved successfully.");
      const iconLink = document.querySelector('link[rel="icon"]');
      if (iconLink) iconLink.href = `/api/v1/branding/icon?t=${Date.now()}`;
    }
    catch (e) { setBrandingError(e.message); } finally { setBrandingLoading(false); }
  }

  return (
    <Card className="p-6">
      <h3 className="font-semibold">Application branding</h3>
      <p className="mt-1 text-sm text-slate-500">Upload a favicon and app icon for this workspace.</p>
      <div className="mt-5">
        {brandingError && <div className="mb-4"><Alert>{brandingError}</Alert></div>}
        <form onSubmit={saveBranding} className="space-y-5">
          <ImageUpload label="Favicon" value={branding.favicon} onChange={(value, message) => { setBranding({ ...branding, favicon: value || branding.favicon }); setBrandingError(message); }} />
          <ImageUpload label="App icon" value={branding.appIcon} onChange={(value, message) => { setBranding({ ...branding, appIcon: value || branding.appIcon }); setBrandingError(message); }} />
          <Button loading={brandingLoading}>Save branding</Button>
        </form>
      </div>
    </Card>
  );
}
