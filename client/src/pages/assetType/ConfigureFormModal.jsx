import { useState } from "react";
import { Button, Card, Modal } from "../../components/ui";
import { FieldForm } from "./FieldForm";

// "Configure Asset Form": attach a saved field definition, then reorder and
// mark fields required. The reordered copy is held here until Save.
export function ConfigureFormModal({ open, onClose, fields, allFields, onFieldsChange, onSave }) {
  const [addField, setAddField] = useState("");
  const attached = new Set(fields.map((field) => field.id));

  function addSelectedField() {
    const field = allFields.find((x) => x.id === Number(addField));
    onFieldsChange([
      ...fields,
      {
        ...field,
        id: field.id,
        dropdownId: field.dropdown_id,
        required: false,
        showInList: true,
      },
    ]);
    setAddField("");
  }

  return (
    <Modal open={open} title="Configure Asset Form" onClose={onClose} className="max-w-4xl">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Add, remove, require and reorder fields for this asset type.
        </p>
        <Card className="p-4">
          <div className="flex gap-2">
            <select
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5"
              value={addField}
              onChange={(e) => setAddField(e.target.value)}
            >
              <option value="">Add existing field...</option>
              {allFields
                .filter((f) => f.is_active && !attached.has(f.id))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            <Button disabled={!addField} onClick={addSelectedField}>
              Add
            </Button>
          </div>
        </Card>
        <FieldForm fields={fields} onSave={onSave} />
      </div>
    </Modal>
  );
}
