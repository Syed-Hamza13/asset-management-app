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
import { useEffect, useState } from 'react';
import { api } from './api/client';

function Protected() {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading...</div>;
  return user ? <Outlet /> : <Navigate to="/login" state={{ from: location.pathname }} replace />;
}
function Outlet() { return <Layout />; }
function PublicRouter() {
  const [setup, setSetup] = useState(null);
  useEffect(() => { api.setupStatus().then((response) => setSetup(response.data.setupRequired)).catch(() => setSetup(false)); }, []);
  if (setup === null) return <div className="grid min-h-screen place-items-center text-sm text-slate-500">Loading...</div>;
  return <Routes><Route path="/login" element={<Login />} />{setup && <Route path="/setup" element={<Setup />} />}<Route element={<Protected />}><Route path="/" element={<Dashboard />} /><Route path="/reports" element={<Reports />} /><Route path="/common-form" element={<CommonForm />} /><Route path="/fields" element={<Fields />} /><Route path="/dropdowns" element={<Dropdowns />} /><Route path="/settings" element={<Settings />} /><Route path="/asset-types/:id" element={<AssetType />} /><Route path="/asset-types/:assetTypeId/new" element={<AssetEditor />} /><Route path="/assets/:publicId" element={<AssetDetail />} /><Route path="/assets/:publicId/edit" element={<AssetEditor />} /></Route><Route path="*" element={<Navigate to={setup ? '/setup' : '/'} replace />} /></Routes>;
}
export default function App() { return <PublicRouter />; }
