import { useAuth } from "../context/AuthContext";
import { Alert } from "../components/ui";
import { BrandingCard } from "./settings/BrandingCard";
import { IpAccessCard } from "./settings/IpAccessCard";
import { PasswordCard } from "./settings/PasswordCard";
import { QuickEntryCard } from "./settings/QuickEntryCard";
import { SmtpCard } from "./settings/SmtpCard";
import { TurnstileCard } from "./settings/TurnstileCard";

// Each card loads and saves its own settings, so one failing endpoint only
// blanks its own card. The admin cards are the last four.
export function Settings() {
  const { can, user, isAdmin } = useAuth();

  return <div className="max-w-xl space-y-6">
    <div><h2 className="text-xl font-bold">Settings & Security</h2><p className="mt-1 text-sm text-slate-500">Manage your account and application branding.</p></div>
    {user?.mustChangePassword && <Alert>You must change your password before continuing. Use your temporary password as the current password below.</Alert>}
    {can("branding.manage") && <BrandingCard />}
    {isAdmin && <TurnstileCard />}
    {isAdmin && <IpAccessCard />}
    {isAdmin && <QuickEntryCard />}
    {isAdmin && <SmtpCard />}
    <PasswordCard />
  </div>;
}
