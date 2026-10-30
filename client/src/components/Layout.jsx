import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { Button } from "./ui";
import { ToastProvider } from "../context/ToastContext";
import { NotificationsProvider } from "../context/NotificationsContext";
import { NotificationBell } from "./NotificationBell";
import { api } from "../api/client";

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
    : nav.find((n) => location.pathname === n[0])?.[1] || "Asset Manager";
  // The tab favicon is served by GET /api/v1/branding/icon (linked from index.html), so it
  // is already correct on the sign-in screen; only the sidebar icon needs the authed read.
  const [appIcon, setAppIcon] = useState("");
  useEffect(() => {
    api.branding.get().then((response) => setAppIcon(response.data.appIcon)).catch(() => {});
  }, []);
  return (
    <ToastProvider>
    <NotificationsProvider>
      <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center justify-between gap-2 px-6 text-lg font-bold">
          <span className="flex min-w-0 items-center gap-2 truncate">
            {appIcon && <img src={appIcon} alt="" className="h-8 w-8 rounded-lg object-cover" />}
            Asset Manager
          </span>
          <NotificationBell align="left" />
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
          <button
            onClick={logout}
            className="mt-2 text-sm font-semibold text-slate-700 hover:text-slate-950"
          >
            Logout
          </button>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 truncate text-base font-bold">{appIcon && <img src={appIcon} alt="" className="h-7 w-7 rounded-md object-cover" />}{title}</div>
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
