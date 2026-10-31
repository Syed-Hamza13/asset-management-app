import { useState } from "react";
import { api } from "../../api/client";
import { useToast } from "../../context/ToastContext";
import { Alert, Button, Card, Input } from "../../components/ui";

const emptyForm = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordCard() {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submitPassword(event) {
    event.preventDefault(); setError(""); setLoading(true);
    try { await api.changePassword(form); setForm(emptyForm); showToast("Password changed successfully."); setTimeout(() => window.location.assign("/"), 400); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }

  return (
    <Card className="p-6">
      <h3 className="font-semibold">Change password</h3>
      <div className="mt-5">
        {error && <div className="mb-4"><Alert>{error}</Alert></div>}
        <form onSubmit={submitPassword} className="space-y-4">
          <Input label="Current password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
          <Input label="New password" type="password" minLength={10} value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required />
          <Input label="Confirm new password" type="password" minLength={10} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
          <Button loading={loading}>Change password</Button>
        </form>
      </div>
    </Card>
  );
}
