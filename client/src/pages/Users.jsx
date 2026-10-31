import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, Input, Modal, Select } from "../components/ui";

const CAPTION_GROUPS = [
  ["Asset Types", ["asset_types.view_own", "asset_types.create_own", "asset_types.edit_own", "asset_types.delete_own"]],
  ["Assets", ["assets.view_own", "assets.create_own", "assets.edit_own", "assets.delete_own", "assets.bulk_own"]],
  ["Configuration", ["fields.manage_own", "dropdowns.manage_own", "common_form.manage_own", "automations.manage_own"]],
  ["Reports & Branding", ["reports.view_own", "reports.export_own", "branding.manage"]],
  ["Email Notifications", ["email.templates.manage_own", "email.rules.manage_own", "email.history.view_own"]],
];

function PermissionChecklist({ value, onChange }) {
  return (
    <div className="space-y-4">
      {CAPTION_GROUPS.map(([group, caps]) => (
        <div key={group}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {caps.map((cap) => (
              <label key={cap} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={value.includes(cap)}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...value, cap] : value.filter((c) => c !== cap))
                  }
                />
                <span className="font-mono text-xs text-slate-700">{cap}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Users() {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState([]);
  const [caps, setCaps] = useState({ all: [], defaults: [] });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [permsFor, setPermsFor] = useState(null);
  const [resetFor, setResetFor] = useState(null);
  const [nameFor, setNameFor] = useState(null);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [form, setForm] = useState({ email: "", password: "", displayName: "", role: "user", permissions: [] });
  const [permsDraft, setPermsDraft] = useState([]);
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([api.users.list(), api.users.capabilities()]);
      setUsers(u.data);
      setCaps(c.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setError("");
    setForm({ email: "", password: "", displayName: "", role: "user", permissions: caps.defaults });
    setCreateOpen(true);
  }

  async function createUser(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.users.create(form);
      showToast("User created. They must change the password on first login.");
      setCreateOpen(false);
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u) {
    setError("");
    try {
      await api.users.update(u.id, { isActive: !u.isActive });
      showToast(u.isActive ? "User deactivated." : "User reactivated.");
      await load();
    } catch (e) { setError(e.message); }
  }

  async function changeRole(u, role) {
    setError("");
    try {
      await api.users.update(u.id, { role });
      showToast("Role updated.");
      await load();
    } catch (e) { setError(e.message); }
  }

  async function savePermissions(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.users.setPermissions(permsFor.id, permsDraft);
      showToast("Permissions updated. They apply on the user's next request.");
      setPermsFor(null);
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function doResetPassword(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.users.resetPassword(resetFor.id, newPassword);
      showToast("Password reset. The user must change it on next login.");
      setResetFor(null);
      setNewPassword("");
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveDisplayName(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.users.update(nameFor.id, { displayName: displayNameDraft.trim() });
      showToast("Display name updated.");
      setNameFor(null);
      setDisplayNameDraft("");
      await load();
    } catch (e2) {
      setError(e2.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(u) {
    if (!confirm(`Delete ${u.email}? All of their asset types, assets, fields, and dropdowns will be permanently deleted.`)) return;
    setError("");
    try {
      await api.users.remove(u.id);
      showToast("User deleted.");
      await load();
    } catch (e) { setError(e.message); }
  }

  if (loading) return <div className="text-sm text-slate-500">Loading...</div>;
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Users</h2>
          <p className="mt-1 text-sm text-slate-500">
            Create accounts, grant capabilities, deactivate or reset passwords.
          </p>
        </div>
        <Button onClick={openCreate}>+ Add User</Button>
      </div>
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}
      <Card className="divide-y divide-slate-100">
        {users.map((u) => {
          const isSelf = Number(u.id) === Number(currentUser?.id);
          return (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-semibold text-slate-900">{u.displayName || u.email}</span>
                  {isSelf && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">you</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${u.role === "admin" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{u.role}</span>
                  {!u.isActive && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">deactivated</span>}
                  {u.mustChangePassword && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">must change password</span>}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  {u.displayName && <span className="mr-2">{u.email}</span>}
                  {u.role === "admin" ? "Full access to everything" : `${u.permissions.length} capabilit${u.permissions.length === 1 ? "y" : "ies"} granted`}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => { setNameFor(u); setDisplayNameDraft(u.displayName || ""); setError(""); }}>Display name</Button>
                {u.role !== "admin" && (
                  <Button variant="secondary" onClick={() => { setPermsFor(u); setPermsDraft(u.permissions); setError(""); }}>Permissions</Button>
                )}
                <Button variant="secondary" onClick={() => { setResetFor(u); setNewPassword(""); setError(""); }}>Reset password</Button>
                {u.role !== "admin" && (
                  <Button variant="secondary" onClick={() => changeRole(u, "admin")}>Make admin</Button>
                )}
                {u.role === "admin" && !isSelf && (
                  <Button variant="secondary" onClick={() => changeRole(u, "user")}>Make user</Button>
                )}
                {!isSelf && (
                  <Button variant="secondary" onClick={() => toggleActive(u)}>{u.isActive ? "Deactivate" : "Reactivate"}</Button>
                )}
                {!isSelf && (
                  <Button variant="danger" onClick={() => removeUser(u)}>Delete</Button>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <Modal open={createOpen} title="Add User" onClose={() => setCreateOpen(false)} className="max-h-[92vh] max-w-2xl">
        <form onSubmit={createUser} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
          <Input label="Display Name" hint="Shown to people in the Quick Entry notification picker. Optional." value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} maxLength={100} />
          <Input label="Temporary Password" type="text" hint="At least 10 characters. The user must change it at first login." value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} />
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value, permissions: e.target.value === "admin" ? [] : caps.defaults })}
            options={[{ value: "user", label: "User (granted capabilities only)" }, { value: "admin", label: "Admin (full access)" }]}
          />
          {form.role === "user" && (
            <PermissionChecklist value={form.permissions} onChange={(permissions) => setForm({ ...form, permissions })} />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={saving}>Create User</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(permsFor)} title={`Permissions — ${permsFor?.email || ""}`} onClose={() => setPermsFor(null)} className="max-h-[92vh] max-w-2xl">
        <form onSubmit={savePermissions} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <PermissionChecklist value={permsDraft} onChange={setPermsDraft} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setPermsFor(null)}>Cancel</Button>
            <Button loading={saving}>Save Permissions</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(resetFor)} title={`Reset Password — ${resetFor?.email || ""}`} onClose={() => setResetFor(null)}>
        <form onSubmit={doResetPassword} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input label="New Temporary Password" type="text" hint="At least 10 characters. The user must change it at next login." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={10} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setResetFor(null)}>Cancel</Button>
            <Button loading={saving}>Reset Password</Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(nameFor)} title={`Display Name — ${nameFor?.email || ""}`} onClose={() => setNameFor(null)}>
        <form onSubmit={saveDisplayName} className="space-y-4">
          {error && <Alert>{error}</Alert>}
          <Input label="Display Name" hint="Leave empty to fall back to the email address. Max 100 characters." value={displayNameDraft} onChange={(e) => setDisplayNameDraft(e.target.value)} maxLength={100} autoFocus />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setNameFor(null)}>Cancel</Button>
            <Button loading={saving}>Save Name</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
