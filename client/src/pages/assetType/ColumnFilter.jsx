import { useState } from "react";
import { Popover } from "../../components/ui";

// Filter popover for one asset-list column. Anchored to the <th> that opened it
// and rendered through Popover, so it can flip above the header near the bottom
// of the viewport.
export function ColumnFilter({
  anchorRef,
  onClose,
  field,
  values,
  selectedValues,
  onToggle,
  onClear,
}) {
  const [search, setSearch] = useState("");
  const matchingValues = values.filter((value) =>
    value.toLowerCase().includes(search.toLowerCase()),
  );
  const allMatchingSelected =
    matchingValues.length > 0 &&
    matchingValues.every((value) => selectedValues.includes(value));

  function toggleMatchingValues() {
    if (allMatchingSelected) {
      matchingValues.forEach((value) => onToggle(value, false));
    } else {
      matchingValues.forEach((value) => onToggle(value, true));
    }
  }

  return (
    <Popover anchorRef={anchorRef} onClose={onClose}>
      <input
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal normal-case outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        placeholder={`Search ${field.name}`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoFocus
      />
      <div className="mt-2 flex items-center justify-between border-b border-slate-100 pb-2 text-xs normal-case">
        <button
          type="button"
          className="font-semibold text-slate-700 hover:text-slate-950"
          onClick={toggleMatchingValues}
          disabled={matchingValues.length === 0}
        >
          {allMatchingSelected ? "Clear visible" : "Select visible"}
        </button>
        <button
          type="button"
          className="text-slate-500 hover:text-slate-900"
          onClick={onClear}
        >
          Clear all
        </button>
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto">
        {matchingValues.length === 0 ? (
          <div className="px-1 py-3 text-xs font-normal normal-case text-slate-500">
            No matching values
          </div>
        ) : (
          matchingValues.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-normal normal-case hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(value)}
                onChange={(event) => onToggle(value, event.target.checked)}
              />
              <span className="truncate">{value}</span>
            </label>
          ))
        )}
      </div>
    </Popover>
  );
}
