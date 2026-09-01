import { useEffect } from "react";
import { DateInput, Input, Select } from "./ui";
import { todayInputValue } from '../utils';

export function DynamicForm({
  fields,
  values,
  setValues,
  errors = {},
  disabled = false,
}) {
  useEffect(() => {
    setValues((current) => {
      const next = { ...current };
      let changed = false;
      for (const field of fields) {
        if (
          field.type === "auto_date" &&
          (current[field.key] === undefined ||
            current[field.key] === null ||
            current[field.key] === "")
        ) {
          next[field.key] = todayInputValue();
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [fields, setValues]);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map((field) => {
        const value = values[field.key];
        const common = {
          disabled,
          required: field.required,
          error: errors[field.key],
        };
        if (field.type === "multiline")
          return (
            <Input
              key={field.id}
              label={field.name}
              type="textarea"
              value={value ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field.key]: e.target.value }))
              }
              {...common}
            />
          );
        if (field.type === "date" || field.type === "auto_date")
          return (
            <DateField
              key={field.id}
              field={field}
              value={value}
              setValues={setValues}
              common={common}
            />
          );
        if (field.type === "number")
          return (
            <Input
              key={field.id}
              label={field.name}
              type="number"
              value={value ?? ""}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  [field.key]:
                    e.target.value === "" ? "" : Number(e.target.value),
                }))
              }
              {...common}
            />
          );
        if (field.type === "quantity")
          return (
            <label key={field.id} className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{field.name}</span>
              <div className="flex h-11 items-center overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button type="button" className="grid h-full w-12 place-items-center text-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => setValues((current) => ({ ...current, [field.key]: Math.max(1, Number(current[field.key] || 1) - 1) }))} disabled={disabled || Number(value || 1) <= 1}>-</button>
                <span className="grid h-full min-w-12 flex-1 place-items-center border-x border-slate-200 font-semibold text-slate-900">{Math.min(15, Math.max(1, Number(value || 1)))}</span>
                <button type="button" className="grid h-full w-12 place-items-center text-xl text-slate-600 hover:bg-slate-50 disabled:opacity-40" onClick={() => setValues((current) => ({ ...current, [field.key]: Math.min(15, Number(current[field.key] || 1) + 1) }))} disabled={disabled || Number(value || 1) >= 15}>+</button>
              </div>
              {errors[field.key] && <span className="mt-1 block text-xs text-red-600">{errors[field.key]}</span>}
            </label>
          );
        if (field.type === "boolean")
          return (
            <label key={field.id} className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                {field.name}
                {field.required ? (
                  <span className="text-red-500"> *</span>
                ) : null}
              </span>
              <select
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                value={value === undefined ? "" : String(value)}
                onChange={(e) =>
                  setValues((v) => ({
                    ...v,
                    [field.key]:
                      e.target.value === ""
                        ? undefined
                        : e.target.value === "true",
                  }))
                }
                disabled={disabled}
              >
                <option value="">Select...</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
              {errors[field.key] && (
                <span className="mt-1 block text-xs text-red-600">
                  {errors[field.key]}
                </span>
              )}
            </label>
          );
        if (field.type === "dropdown")
          return (
            <Select
              key={field.id}
              label={field.name}
              value={value ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [field.key]: e.target.value }))
              }
              options={field.options || []}
              {...common}
            />
          );
        return (
          <Input
            key={field.id}
            label={field.name}
            value={value ?? ""}
            onChange={(e) =>
              setValues((v) => ({ ...v, [field.key]: e.target.value }))
            }
            {...common}
          />
        );
      })}
    </div>
  );
}

function DateField({ field, value, setValues, common }) {
  return (
    <DateInput
      label={field.name}
      value={value ?? ""}
      onChange={(e) =>
        setValues((v) => ({ ...v, [field.key]: e.target.value }))
      }
      {...common}
    />
  );
}
