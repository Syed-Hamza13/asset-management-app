import { useEffect, useState } from "react";
import { api } from "../api/client";

// The branding icon is a data URL returned by the authed GET /api/v1/branding read
// (the tab favicon comes from the public /api/v1/branding/icon route, so it is
// already correct on the sign-in screen). A failed read leaves the string empty and
// callers fall back to a neutral mark instead of a broken image.
export function useAppIcon() {
  const [appIcon, setAppIcon] = useState("");
  useEffect(() => {
    api.branding.get().then((response) => setAppIcon(response.data.appIcon)).catch(() => {});
  }, []);
  return appIcon;
}
