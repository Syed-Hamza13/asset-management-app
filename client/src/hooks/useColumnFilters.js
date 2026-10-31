import { useEffect, useMemo, useState } from "react";
import { sortedUniqueValues } from "../utils/assetValues";

// Column filtering for the two table pages (asset list, reports): which values
// exist per column, which are picked, and which rows survive. Purely client
// side — no request is made when a filter changes.
//
// `columns` must carry a `key`, `display(item, column)` must return the exact
// string the table shows for that cell (the option lists are compared against
// it), and `resetKey` (e.g. the asset type id) clears the picks when it changes.
export function useColumnFilters({ items, columns, display, resetKey }) {
  const [filters, setFilters] = useState({});

  useEffect(() => {
    if (resetKey === undefined) return;
    setFilters({});
  }, [resetKey]);

  const filterValues = useMemo(
    () =>
      Object.fromEntries(
        columns.map((column) => [
          column.key,
          sortedUniqueValues(items.map((item) => display(item, column))),
        ]),
      ),
    [items, columns, display],
  );

  const filteredItems = items.filter((item) =>
    columns.every((column) => {
      const selected = filters[column.key];
      return !selected?.length || selected.includes(display(item, column));
    }),
  );

  function toggleValue(key, value, checked) {
    setFilters((current) => {
      const selected = current[key] || [];
      const next = checked
        ? [...new Set([...selected, value])]
        : selected.filter((item) => item !== value);
      return { ...current, [key]: next };
    });
  }

  function clearColumn(key) {
    setFilters((current) => ({ ...current, [key]: [] }));
  }

  function clearAll() {
    setFilters({});
  }

  const hasActiveFilters = Object.values(filters).some((values) => values.length > 0);

  return { filters, filterValues, filteredItems, toggleValue, clearColumn, clearAll, hasActiveFilters };
}
