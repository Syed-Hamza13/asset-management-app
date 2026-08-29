import { useToast } from "../context/ToastContext";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Alert,
} from "../components/ui";

const emptyOption = { label: "", value: "" };

export function Dropdowns() {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [editDropdown, setEditDropdown] = useState(false);
  const [editOption, setEditOption] = useState(null);
  const [name, setName] = useState("");
  const [option, setOption] = useState(emptyOption);
  const [error, setError] = useState("");
  const { showToast } = useToast();

  async function load() {
    try {
      setItems((await api.dropdowns.list()).data);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function select(id) {
    try {
      setSelected((await api.dropdowns.get(id)).data);
    } catch (e) {
      setError(e.message);
    }
  }
  async function create(e) {
    e.preventDefault();
    try {
      await api.dropdowns.create({ name });
      setName("");
      showToast("Dropdown created successfully.");
      setOpen(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function rename(e) {
    e.preventDefault();
    try {
      await api.dropdowns.update(selected.id, {
        name,
        isActive: Boolean(selected.is_active),
      });
      setEditDropdown(false);
      await select(selected.id);
      await load();
      showToast("Dropdown name updated successfully.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function addOption(e) {
    e.preventDefault();
    try {
      await api.dropdowns.createOption(selected.id, {
        ...option,
        displayOrder: selected.options.length,
      });
      setOption(emptyOption);
      await select(selected.id);
      await load();
      showToast("Dropdown option added successfully.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function saveOption(e) {
    e.preventDefault();
    try {
      await api.dropdowns.updateOption(selected.id, editOption.id, {
        label: editOption.label,
        value: editOption.value,
        displayOrder: editOption.display_order,
        isActive: Boolean(editOption.is_active),
      });
      setEditOption(null);
      await select(selected.id);
      showToast("Dropdown option updated successfully.");
    } catch (e) {
      setError(e.message);
    }
  }
  async function deactivate(id) {
    try {
      await api.dropdowns.removeOption(selected.id, id);
      await select(selected.id);
      await load();
      showToast("Dropdown option deactivated.");
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Dropdowns</h2>
            <p className="mt-1 text-sm text-slate-500">Reusable option sets.</p>
          </div>
          <Button onClick={() => setOpen(true)}>+ Add</Button>
        </div>
        {error && (
          <div className="mb-4">
            <Alert>{error}</Alert>
          </div>
        )}
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {items.length === 0 ? (
            <EmptyState
              title="No dropdowns"
              description="Create a reusable list like Department or Brand."
            />
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => select(item.id)}
                className={`block w-full px-4 py-4 text-left hover:bg-slate-50 ${selected?.id === item.id ? "bg-slate-50" : ""}`}
              >
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-slate-500">
                  {item.option_count} options
                </div>
              </button>
            ))
          )}
        </Card>
      </div>
      {selected ? (
        <Card className="p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{selected.name}</h3>
              <p className="text-sm text-slate-500">
                Manage options. Changes are applied wherever this dropdown is
                used.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setName(selected.name);
                setEditDropdown(true);
              }}
            >
              Edit name
            </Button>
          </div>
          <form
            onSubmit={addOption}
            className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          >
            <Input
              label="Label"
              value={option.label}
              onChange={(e) => setOption({ ...option, label: e.target.value })}
              required
            />
            <Input
              label="Value"
              value={option.value}
              onChange={(e) => setOption({ ...option, value: e.target.value })}
              required
            />
            <Button>Add option</Button>
          </form>
          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Label</th>
                  <th className="px-4 py-3 text-left">Value</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selected.options.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3">{item.label}</td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {item.value}
                    </td>
                    <td className="px-4 py-3">
                      {item.is_active ? "Active" : "Inactive"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        onClick={() => setEditOption({ ...item })}
                      >
                        Edit
                      </Button>
                      {item.is_active && (
                        <Button
                          variant="ghost"
                          onClick={() => deactivate(item.id)}
                        >
                          Deactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          title="Select a dropdown"
          description="Choose a dropdown from the left to manage its options."
        />
      )}
      <Modal open={open} title="Create Dropdown" onClose={() => setOpen(false)}>
        <form onSubmit={create} className="space-y-4">
          <Input
            label="Dropdown Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Department"
            required
          />
          <Button className="w-full">Create Dropdown</Button>
        </form>
      </Modal>
      <Modal
        open={editDropdown}
        title="Edit Dropdown Name"
        onClose={() => setEditDropdown(false)}
      >
        <form onSubmit={rename} className="space-y-4">
          <Input
            label="Dropdown Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Button className="w-full">Save name</Button>
        </form>
      </Modal>
      <Modal
        open={Boolean(editOption)}
        title="Edit Dropdown Option"
        onClose={() => setEditOption(null)}
      >
        {editOption && (
          <form onSubmit={saveOption} className="space-y-4">
            <Input
              label="Label"
              value={editOption.label}
              onChange={(e) =>
                setEditOption({ ...editOption, label: e.target.value })
              }
              required
            />
            <Input
              label="Value"
              value={editOption.value}
              onChange={(e) =>
                setEditOption({ ...editOption, value: e.target.value })
              }
              required
            />
            <Button className="w-full">Save option</Button>
          </form>
        )}
      </Modal>
    </div>
  );
}
