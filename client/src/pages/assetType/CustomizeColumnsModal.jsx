import { useState } from "react";
import { Button, Card, EmptyState, Modal } from "../../components/ui";

// "Customize Asset List": pick which fields become columns and in which order.
// Starts from the saved form (a field with no stored flag is shown, matching the
// server default) and only writes on Save.
export function CustomizeColumnsModal({ open, onClose, fields, onSave }) {
  const [columns, setColumns] = useState(() =>
    fields.map((field) => ({ ...field, showInList: field.showInList !== false })),
  );

  function move(index, direction) {
    setColumns((current) => {
      const next = [...current];
      const target = index + direction;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <Modal open={open} title="Customize Asset List" onClose={onClose} className="max-w-4xl">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-slate-500">
            Choose which fields should appear as columns in the asset list.
          </p>
        </div>

        {columns.length === 0 ? (
          <EmptyState
            title="No fields configured"
            description="Add fields to this asset type first."
          />
        ) : (
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {columns.map((f, index) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1">
                  <div className="font-medium">{f.name}</div>

                  <div className="text-xs text-slate-500">{f.type}</div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(f.showInList)}
                    onChange={(e) =>
                      setColumns((current) =>
                        current.map((x) =>
                          x.id === f.id
                            ? {
                                ...x,
                                showInList: e.target.checked,
                              }
                            : x,
                        ),
                      )
                    }
                  />
                  Show
                </label>

                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </Button>

                  <Button
                    variant="ghost"
                    disabled={index === columns.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </Button>
                </div>
              </div>
            ))}
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>

          <Button onClick={() => onSave(columns)}>
            Save Columns
          </Button>
        </div>
      </div>
    </Modal>
  );
}
