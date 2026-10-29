import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Reports } from './pages/Reports';
import { Fields } from './pages/Fields';
import { Dropdowns } from './pages/Dropdowns';
import { Settings } from './pages/Settings';
import { AssetType } from './pages/AssetType';
import { AssetEditor } from './pages/AssetEditor';
import { AssetDetail } from './pages/AssetDetail';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { CommonForm } from './pages/CommonForm';
import { Users } from './pages/Users';
import { EmailNotifications } from './pages/EmailNotifications';
import { EmailHistory } from './pages/EmailHistory';
import { useEffect, useState } from 'react';
import { api } from './api/client';

function Protected() {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading...</div>;
  // The root path shows the sign-in screen in place, so opening http://host:port/ lands
  // straight on the app; deep links still bounce via /login to keep ?from working.
  if (!user) return location.pathname === '/' ? <Login /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.mustChangePassword && location.pathname !== '/settings') return <Navigate to="/settings" replace />;
  return <Outlet />;
}
function Outlet() { return <Layout />; }
function RequireCap({ cap, children }) {
  const { can, isAdmin } = useAuth();
  const allowed = cap === 'admin' ? isAdmin : can(cap);
  return allowed ? children : <Navigate to="/" replace />;
}
function PublicRouter() {
  const [setup, setSetup] = useState(null);
  useEffect(() => { api.setupStatus().then((response) => setSetup(response.data.setupRequired)).catch(() => setSetup(false)); }, []);
  if (setup === null) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading...</div>;
  return <Routes><Route path="/login" element={<Login />} />{setup && <Route path="/setup" element={<Setup />} />}<Route element={<Protected />}><Route path="/" element={<Dashboard />} /><Route path="/reports" element={<RequireCap cap="reports.view_own"><Reports /></RequireCap>} /><Route path="/common-form" element={<RequireCap cap="common_form.manage_own"><CommonForm /></RequireCap>} /><Route path="/fields" element={<RequireCap cap="fields.manage_own"><Fields /></RequireCap>} /><Route path="/dropdowns" element={<RequireCap cap="dropdowns.manage_own"><Dropdowns /></RequireCap>} /><Route path="/users" element={<RequireCap cap="admin"><Users /></RequireCap>} /><Route path="/email-notifications" element={<RequireCap cap="email.rules.manage_own"><EmailNotifications /></RequireCap>} /><Route path="/email-history" element={<RequireCap cap="email.history.view_own"><EmailHistory /></RequireCap>} /><Route path="/settings" element={<Settings />} /><Route path="/asset-types/:id" element={<RequireCap cap="asset_types.view_own"><AssetType /></RequireCap>} /><Route path="/asset-types/:assetTypeId/new" element={<RequireCap cap="assets.create_own"><AssetEditor /></RequireCap>} /><Route path="/assets/:publicId" element={<RequireCap cap="assets.view_own"><AssetDetail /></RequireCap>} /><Route path="/assets/:publicId/edit" element={<RequireCap cap="assets.edit_own"><AssetEditor /></RequireCap>} /></Route><Route path="*" element={<Navigate to={setup ? '/setup' : '/'} replace />} /></Routes>;
}
export default function App() { return <PublicRouter />; }
