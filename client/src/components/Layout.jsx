import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useState } from "react";
import { Info } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";
import { ToastProvider } from "../context/ToastContext";
import { NotificationsProvider } from "../context/NotificationsContext";
import { NotificationBell } from "./NotificationBell";
import { AboutDialog } from "./AboutDialog";
import { useAppIcon } from "../hooks/useAppIcon";
import { APP } from "../appInfo";

const nav = [
  ["/", "Assets", null],
  ["/reports", "Reports", "reports.view_own"],
  ["/common-form", "Common Form", "common_form.manage_own"],
  ["/fields", "Field Definitions", "fields.manage_own"],
  ["/dropdowns", "Dropdowns", "dropdowns.manage_own"],
  ["/email-notifications", "Email Notifications", "email.rules.manage_own"],
  ["/email-history", "Email History", "email.history.view_own"],
  ["/users", "Users", "admin"],
  ["/settings", "Settings", null],
];
export function Layout() {
  const { user, logout, can, isAdmin } = useAuth();
  const location = useLocation();
  const visibleNav = nav.filter(([, , cap]) => cap === null || (cap === "admin" ? isAdmin : can(cap)));
  const title = location.pathname.startsWith("/asset-types/")
    ? "Asset Type"
    : nav.find((n) => location.pathname === n[0])?.[1] || APP.name;
  const appIcon = useAppIcon();
  const [aboutOpen, setAboutOpen] = useState(false);
  return (
    <ToastProvider>
    <NotificationsProvider>
      <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {/* The title is a real flex item with min-w-0 + truncate and the bell is
            shrink-0: at w-64 the old layout let "Asset Manager" run under the bell. */}
        <div className="flex h-16 items-center gap-2 px-5">
          {appIcon && <img src={appIcon} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover" />}
          <span className="min-w-0 flex-1 truncate text-base font-bold">{APP.name}</span>
          <div className="shrink-0">
            <NotificationBell align="left" />
          </div>
        </div>
        <nav className="px-3 py-4">
          {visibleNav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `mb-1 block rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-4">
          <div className="truncate text-xs text-slate-500">{user?.email}</div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <button
              onClick={logout}
              className="text-sm font-semibold text-slate-700 hover:text-slate-950"
            >
              Logout
            </button>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              aria-label={`About ${APP.name}`}
              title={`About ${APP.name}`}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              <Info className="h-4 w-4" />
            </button>
          </div>
        </div>
        <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} icon={appIcon} />
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            {/* An <h1>, not a div: below lg: this is the page's only visible title (the in-page
               .page-title <h2> is hidden to avoid printing the name twice), and a screen reader
               still needs a heading to announce. Preflight resets h1 styling, so the classes
               below keep it pixel-identical to the div it replaced. */}
            <h1 className="flex min-w-0 items-center gap-2 truncate text-base font-bold">{appIcon && <img src={appIcon} alt="" className="h-7 w-7 rounded-md object-cover" />}{title}</h1>
            <div className="flex shrink-0 items-center gap-3">
              <NotificationBell align="right" />
              <button onClick={logout} className="text-sm font-semibold text-slate-600">
                Logout
              </button>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3">
            {visibleNav.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `shrink-0 rounded-lg px-3 py-2 text-xs font-semibold ${isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        {/* <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <div className="lg:hidden text-base font-bold">Asset Manager</div>
            <h1 className="hidden text-sm font-semibold text-slate-700 sm:block">
              {title}
            </h1>
            <div className="lg:hidden">
              <button
                onClick={logout}
                className="text-sm font-semibold text-slate-600"
              >
                Logout
              </button>
            </div>
          </div>
        </header> */}
        <main className="mx-auto max-w-7xl min-w-0 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      </div>
    </NotificationsProvider>
    </ToastProvider>
  );
}
