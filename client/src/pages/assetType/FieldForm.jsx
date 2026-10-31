import { useEffect, useState } from "react";
import { Button, Card, EmptyState } from "../../components/ui";

// The field list inside "Configure Asset Form": reorder, require, remove.
// Local copy of the form so Save is the only thing that reaches the API.
export function FieldForm({ fields, onSave }) {
  const [local, setLocal] = useState(fields);
  useEffect(() => setLocal(fields), [fields]);
  const move = (i, dir) => {
    const a = [...local];
    const j = i + dir;
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    setLocal(a);
  };
  return (
    <div>
      {local.length === 0 ? (
        <EmptyState
          title="No fields in this form"
          description="Add reusable field definitions to start collecting asset data."
        />
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          {local.map((f, i) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-3 px-4 py-4"
            >
              <div className="w-8 text-center text-xs text-slate-400">
                {i + 1}
              </div>
              <div className="min-w-[160px] flex-1">
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-slate-500">
                  {f.type}
                  {f.dropdownId ? ` · dropdown #${f.dropdownId}` : ""}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(f.required)}
                  onChange={(e) =>
                    setLocal(
                      local.map((x) =>
                        x.id === f.id
                          ? { ...x, required: e.target.checked }
                          : x,
                      ),
                    )
                  }
                />{" "}
                Required
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(f.showInList)}
                  onChange={(e) =>
                    setLocal(
                      local.map((x) =>
                        x.id === f.id
                          ? { ...x, showInList: e.target.checked }
                          : x,
                      ),
                    )
                  }
                />
                Show in Asset List
              </label>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button variant="ghost" onClick={() => move(i, 1)}>
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setLocal(local.filter((x) => x.id !== f.id))}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
      <div className="mt-4">
        <Button onClick={() => onSave(local)}>Save form</Button>
      </div>
    </div>
  );
}
