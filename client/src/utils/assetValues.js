import { api } from "../api/client";
import { formatDateValue } from "./date";

// How one stored asset value is shown to the user. Three pages render the same
// value (asset list, reports, asset detail), so the rules live here:
// dates become DD/MM/YYYY, a dropdown id becomes its option label, and anything
// else is stringified with null/undefined collapsed to "".
export function formatAssetValue(value, field) {
  if (field.type === "date" || field.type === "auto_date") return formatDateValue(value);
  if (field.type === "dropdown") {
    return field.options?.find((option) => String(option.value) === String(value))?.label ?? String(value ?? "");
  }
  return String(value ?? "");
}

// The option list a filter popover shows for one column: every distinct display
// value the current rows produce, alphabetically with numbers in natural order.
export function sortedUniqueValues(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

// The form endpoints return a dropdown field without its options, so every page
// that renders a form fetches them. `activeOnly` keeps the live options and
// narrows them to what a <Select> needs; the list/detail views need the full
// option rows (they display deactivated stored values too).
export async function withDropdownOptions(fields, { activeOnly = false } = {}) {
  return Promise.all(
    fields.map(async (field) => {
      if (field.type !== "dropdown") return field;
      const dropdownId = field.dropdownId ?? field.dropdown_id;
      if (!dropdownId) return field;
      const { data } = await api.dropdowns.get(dropdownId);
      if (!activeOnly) return { ...field, options: data.options };
      return {
        ...field,
        options: data.options
          .filter((option) => option.is_active)
          .map((option) => ({ value: option.value, label: option.label })),
      };
    }),
  );
}
