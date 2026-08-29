import { useEffect, useState } from "react";
import { useToast } from "../context/ToastContext";
import { api } from "../api/client";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Alert,
} from "../components/ui";

const types = [
  ["text", "Short Text"],
  ["multiline", "Multiline Text"],
  ["number", "Number"],
  ["quantity", "Quantity (1-15)"],
  ["boolean", "Yes / No"],
  ["date", "Date"],
  ["auto_date", "Current Date (Editable)"],
  ["dropdown", "Dropdown"],
];
export function Fields() {
  const [items, setItems] = useState([]);
  const [dropdowns, setDropdowns] = useState([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(null);
  const blank = {
    name: "",
    key: "",
    type: "text",
    dropdownId: "",
    isActive: true,
  };
  const [form, setForm] = useState(blank);
  const [error, setError] = useState("");
    const { showToast } = useToast();
  async function load() {
    try {
      setItems((await api.fields.list()).data);
      setDropdowns((await api.dropdowns.list()).data);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);
  function startEdit(x) {
    setEdit(x);
    setForm({
      name: x.name,
      key: x.field_key,
      type: x.type,
      dropdownId: x.dropdown_id || "",
      isActive: Boolean(x.is_active),
    });
    setOpen(true);
  }
  async function submit(e) {
    e.preventDefault();
    setError("");
    try {
      const body = {
        ...form,
        dropdownId: form.type === "dropdown" ? Number(form.dropdownId) : null,
      };
      if (edit) await api.fields.update(edit.id, body);
      else await api.fields.create(body);
      setOpen(false);
      setEdit(null);
      setForm(blank);
        showToast(edit ? "Field updated successfully." : "Field created successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function remove(id) {
    if (!confirm("Delete this field definition? It must not be in use."))
      return;
    try {
      await api.fields.remove(id);
        showToast("Field deleted successfully.");
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Field Definitions</h2>
          <p className="mt-1 text-sm text-slate-500">
            Reusable fields for your asset forms.
          </p>
        </div>
        <Button
          onClick={() => {
            setEdit(null);
            setForm(blank);
            setOpen(true);
          }}
        >
          + Add Field
        </Button>
      </div>
      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState
          title="No fields yet"
          description="Create fields such as Serial Number, Brand, Price, or Department."
          action={<Button onClick={() => setOpen(true)}>Create a field</Button>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Name</th>
                  <th className="px-5 py-3">Key</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Source</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((x) => (
                  <tr key={x.id}>
                    <td className="px-5 py-4 font-medium">{x.name}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-500">
                      {x.field_key}
                    </td>
                    <td className="px-5 py-4">
                      {types.find((t) => t[0] === x.type)?.[1]}
                    </td>
                    <td className="px-5 py-4">{x.dropdown_name || "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <Button variant="ghost" onClick={() => startEdit(x)}>
                        Edit
                      </Button>
                      <Button variant="ghost" onClick={() => remove(x.id)}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <Modal
        open={open}
        title={edit ? "Edit Field" : "Create Field"}
        onClose={() => setOpen(false)}
      >
        <form onSubmit={submit} className="space-y-4">
          <Input
            label="Field Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Serial Number"
            required
          />
          <Input
            label="Internal Key"
            value={form.key}
            onChange={(e) => setForm({ ...form, key: e.target.value })}
            placeholder="serial_number"
            hint="Letters, numbers and underscores are recommended."
          />
          <Select
            label="Field Type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={types.map((t) => ({ value: t[0], label: t[1] }))}
          />
          {form.type === "dropdown" && (
            <Select
              label="Dropdown Source"
              value={form.dropdownId}
              onChange={(e) => setForm({ ...form, dropdownId: e.target.value })}
              options={dropdowns.map((d) => ({ value: d.id, label: d.name }))}
              required
            />
          )}
          <Button className="w-full">
            {edit ? "Save changes" : "Create field"}
          </Button>
        </form>
      </Modal>
    </div>
  );
}
