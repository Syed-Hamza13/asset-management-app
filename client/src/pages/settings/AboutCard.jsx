import { useState } from "react";
import { Button, Card } from "../../components/ui";
import { AboutDialog } from "../../components/AboutDialog";
import { useAppIcon } from "../../hooks/useAppIcon";
import { APP } from "../../appInfo";

// Not admin-only: every signed-in user can see what this application is, who made
// it and under what license it is released.
export function AboutCard() {
  const [open, setOpen] = useState(false);
  const appIcon = useAppIcon();

  return (
    <Card className="p-6">
      <h3 className="font-semibold">About this application</h3>
      <p className="mt-1 text-sm text-slate-500">
        Version {APP.version} · {APP.license.name} · free and open source
      </p>
      <div className="mt-4">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          Show details
        </Button>
      </div>
      <AboutDialog open={open} onClose={() => setOpen(false)} icon={appIcon} />
    </Card>
  );
}
