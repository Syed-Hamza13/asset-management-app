import { Link } from "react-router-dom";
import { Button, Card, EmptyState, Select } from "../../components/ui";
import { ColumnFilter } from "./ColumnFilter";

// The asset list for one asset type: one column per "show in list" field, a
// filter popover on every column header, and the bulk-selection checkboxes.
// Everything here is client-side; the rows arrive already loaded by the page.
export function AssetListTable({
  type,
  canCreateAsset,
  visibleFields,
  items,
  filteredItems,
  hasActiveFilters,
  filters,
  filterValues,
  openFilter,
  filterAnchorRef,
  onOpenFilter,
  onCloseFilter,
  displayValue,
  onToggleFilterValue,
  onClearColumn,
  onClearFilters,
  canBulk,
  selectedAssetIds,
  onSelectVisible,
  onToggleAsset,
  onClearSelection,
  bulkAction,
  onBulkActionChange,
  canEditAsset,
  onEditAsset,
  id,
}) {
  const allVisibleSelected =
    filteredItems.length > 0 &&
    filteredItems.every((asset) => selectedAssetIds.includes(asset.publicId));

  if (items.length === 0) {
    return (
      <EmptyState
        title={`No ${type.name.toLowerCase()} assets`}
        description="Add your first asset using the configured form."
        action={
          canCreateAsset ? (
            <Link to={`/asset-types/${id}/new`}>
              <Button>Add Asset</Button>
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <Card className="overflow-visible">
      {(hasActiveFilters || filteredItems.length !== items.length) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm">
          <span className="text-slate-500">
            Showing {filteredItems.length} of {items.length} assets
          </span>
          <button
            type="button"
            className="font-semibold text-slate-700 hover:text-slate-950"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </div>
      )}
      {canBulk && selectedAssetIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <span className="mr-1 text-sm font-semibold text-slate-700">{selectedAssetIds.length} selected</span>
          <Select
            label=""
            value={bulkAction}
            onChange={(event) => onBulkActionChange(event.target.value)}
            options={[{ value: "update", label: "Update selected" }, { value: "delete", label: "Delete selected" }]}
          />
          <button type="button" className="text-sm font-semibold text-slate-500 hover:text-slate-900" onClick={onClearSelection}>Clear selection</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">
                {canBulk && <input type="checkbox" aria-label="Select visible assets" checked={allVisibleSelected} onChange={(event) => onSelectVisible(event.target.checked)} />}
              </th>
              {visibleFields.map((f) => (
                <th key={f.id} ref={openFilter === f.field_key ? filterAnchorRef : null} className="px-4 py-3">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-2 text-left hover:text-slate-900 ${
                      filters[f.field_key]?.length
                        ? "text-slate-950"
                        : ""
                    }`}
                    onClick={() => onOpenFilter(f.field_key)}
                  >
                    <span>{f.name}</span>
                    <span aria-hidden="true">
                      {filters[f.field_key]?.length ? "●" : "▾"}
                    </span>
                  </button>
                  {openFilter === f.field_key && (
                    <ColumnFilter
                      anchorRef={filterAnchorRef}
                      onClose={onCloseFilter}
                      field={f}
                      values={filterValues[f.field_key]}
                      selectedValues={filters[f.field_key] || []}
                      onToggle={(value, checked) => onToggleFilterValue(f.field_key, value, checked)}
                      onClear={() => onClearColumn(f.field_key)}
                    />
                  )}
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody className="row-hover divide-y divide-slate-100">
            {filteredItems.map((a) => (
              <tr key={a.publicId}>
                <td className="px-4 py-3">{canBulk && <input type="checkbox" aria-label={`Select asset ${a.publicId}`} checked={selectedAssetIds.includes(a.publicId)} onChange={(event) => onToggleAsset(a.publicId, event.target.checked)} />}</td>
                {visibleFields.map((f) => (
                    <td
                      key={f.id}
                      className="max-w-[180px] truncate px-4 py-3"
                    >
                      {displayValue(a, f)}
                    </td>
                  ))}
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  {canEditAsset ? (
                    <button
                      type="button"
                      className="font-semibold text-slate-700 hover:text-slate-950"
                      onClick={() => onEditAsset(a)}
                    >
                      Edit
                    </button>
                  ) : (
                    <Link
                      className="font-semibold text-slate-700"
                      to={`/assets/${a.publicId}`}
                    >
                      Open →
                    </Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
