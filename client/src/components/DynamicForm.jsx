import { useEffect, useRef } from "react";
import { DateInput, Input, Select } from "./ui";
import { todayInputValue } from '../utils/date';
import {
  actionValue,
  conditionMatches,
  isBlockedAutoDateClear,
  isFilledValue,
} from '../../../shared/automationRules.js';

export function DynamicForm({
  fields,
  values,
  setValues,
  errors = {},
  disabled = false,
  automations = [],
  previousValues = {},
  isNew = false,
}) {
  const automatedRef = useRef(new Set());
  const manualRef = useRef(new Set());
  const applyingRef = useRef(false);
  const lastValuesRef = useRef(values);
  const seededRef = useRef(false);

  // One pass: seed the auto_date defaults for a create form, then run the
  // owner's automation rules over the seeded values. Seeding has to happen in
  // the same pass as the rules — the rules used to evaluate the pre-seed
  // snapshot and wrote a "" back over the date that had just been queued.
  // Seeding runs once per mounted form, so a date the user clears by hand stays
  // cleared, and on edit (isNew false) the saved value is never touched.
  useEffect(() => {
    if (applyingRef.current) {
      applyingRef.current = false;
      lastValuesRef.current = values;
      return;
    }
    const previous = lastValuesRef.current;
    lastValuesRef.current = values;

    const next = { ...values };
    if (isNew && fields.length && !seededRef.current) {
      seededRef.current = true;
      for (const field of fields) {
        if (field.type === "auto_date" && !isFilledValue(next[field.key]))
          next[field.key] = todayInputValue();
      }
    }

    const changedKeys = new Set(
      Object.keys(values).filter((key) => values[key] !== previous[key]),
    );
    for (const key of changedKeys) {
      if (automatedRef.current.has(key)) {
        manualRef.current.add(key);
        automatedRef.current.delete(key);
      }
    }
    for (const rule of automations) {
      if (manualRef.current.has(rule.targetKey)) {
        if (!changedKeys.has(rule.sourceKey)) continue;
        manualRef.current.delete(rule.targetKey);
      }
      if (
        !conditionMatches(
          rule,
          next[rule.sourceKey],
          previousValues[rule.sourceKey],
        )
      )
        continue;
      if (isBlockedAutoDateClear(rule, next[rule.targetKey])) continue;
      next[rule.targetKey] = actionValue(rule);
      automatedRef.current.add(rule.targetKey);
    }
    // Write only the keys this pass changed. Replacing the whole object here
    // would drop any update queued in the same commit.
    const patch = {};
    let changed = false;
    for (const [key, value] of Object.entries(next)) {
      if (values[key] !== value) {
        patch[key] = value;
        changed = true;
      }
    }
    if (changed) {
      applyingRef.current = true;
      setValues((current) => ({ ...current, ...patch }));
    }
  }, [values, automations, previousValues, setValues, fields, isNew]);

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
        if (field.type === "mobile")
          return (
            <Input
              key={field.id}
              label={field.name}
              type="tel"
              inputMode="tel"
              placeholder="e.g. 9876543210"
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
