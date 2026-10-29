import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Alert, Button, Card, EmptyState, Modal, Popover, SearchInput } from "../components/ui";
import { formatDateValue } from "../utils";
import * as XLSX from "xlsx";

function valueFor(row, column) {
  const value = column.key === "assetType" ? row.assetTypeName : row.values?.[column.key];
  if (column.type === "date" || column.type === "auto_date") return formatDateValue(value);
  if (column.type === "dropdown") return column.options?.find((option) => String(option.value) === String(value))?.label ?? String(value ?? "");
  return String(value ?? "");
}

function ReportFilter({ anchorRef, onClose, column, values, selectedValues, onToggle, onClear }) {
  const [search, setSearch] = useState("");
  const matches = values.filter((value) => value.toLowerCase().includes(search.toLowerCase()));
  return (
    <Popover anchorRef={anchorRef} onClose={onClose}>
      <input
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
        placeholder={`Search ${column.label}`}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoFocus
      />
      <div className="mt-2 flex items-center justify-between border-b border-slate-100 pb-2 text-xs normal-case">
        <button type="button" className="font-semibold text-slate-700" onClick={() => matches.forEach((value) => onToggle(value, true))}>Select visible</button>
        <button type="button" className="text-slate-500" onClick={onClear}>Clear all</button>
      </div>
      <div className="mt-2 max-h-56 overflow-y-auto">
        {matches.length ? matches.map((value) => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-normal normal-case hover:bg-slate-50">
            <input type="checkbox" checked={selectedValues.includes(value)} onChange={(event) => onToggle(value, event.target.checked)} />
            <span className="truncate">{value}</span>
          </label>
        )) : <div className="px-1 py-3 text-xs text-slate-500">No matching values</div>}
      </div>
    </Popover>
  );
}

export function Reports() {
  const { can } = useAuth();
  const [types, setTypes] = useState([]); const [rows, setRows] = useState([]); const [columns, setColumns] = useState([]); const [selectedColumns, setSelectedColumns] = useState([]); const [filters, setFilters] = useState({}); const [sort, setSort] = useState({ key: "assetType", direction: "asc" }); const [openFilter, setOpenFilter] = useState(null); const [customize, setCustomize] = useState(false); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [search, setSearch] = useState("");
  const filterAnchorRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const typeResponse = await api.assetTypes.list();
        const typeData = typeResponse.data;
        const results = await Promise.all(typeData.map(async (type) => {
          const [formResponse, firstPage] = await Promise.all([api.assetTypes.form(type.id), api.assets.list(type.id, 1)]);
          const pages = [firstPage.data.items];
          const pageCount = Math.ceil(firstPage.data.total / firstPage.data.pageSize);
          if (pageCount > 1) {
            const remaining = await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => api.assets.list(type.id, index + 2)));
            remaining.forEach((page) => pages.push(page.data.items));
          }
          const fields = await Promise.all(formResponse.data.map(async (field) => {
            if (field.type !== "dropdown") return field;
            const dropdownId = field.dropdownId ?? field.dropdown_id;
            if (!dropdownId) return field;
            const dropdown = await api.dropdowns.get(dropdownId);
            return { ...field, options: dropdown.data.options };
          }));
          return { type, fields, assets: pages.flat() };
        }));
        const columnMap = new Map([["assetType", { key: "assetType", label: "Asset Type", type: "text" }]]);
        const reportRows = [];
        results.forEach(({ type, fields, assets }) => {
          fields.forEach((field) => { if (!columnMap.has(field.field_key)) columnMap.set(field.field_key, { key: field.field_key, label: field.name, type: field.type, options: field.options }); });
          assets.forEach((asset) => reportRows.push({ ...asset, assetTypeName: type.name, assetTypeId: type.id }));
        });
        const reportColumns = [...columnMap.values()];
        setTypes(typeData); setRows(reportRows); setColumns(reportColumns); setSelectedColumns(reportColumns.map((column) => column.key));
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const visibleColumns = columns.filter((column) => selectedColumns.includes(column.key));
  const filterValues = useMemo(() => Object.fromEntries(columns.map((column) => [column.key, [...new Set(rows.map((row) => valueFor(row, column)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))])), [columns, rows]);
  const needle = search.trim().toLowerCase();
  const filteredRows = rows.filter((row) => (!needle || visibleColumns.some((column) => valueFor(row, column).toLowerCase().includes(needle))) && visibleColumns.every((column) => !filters[column.key]?.length || filters[column.key].includes(valueFor(row, column))));
  const sortedRows = [...filteredRows].sort((left, right) => {
    const column = columns.find((item) => item.key === sort.key); if (!column) return 0;
    return valueFor(left, column).localeCompare(valueFor(right, column), undefined, { numeric: true, sensitivity: "base" }) * (sort.direction === "asc" ? 1 : -1);
  });
  function toggleSort(key) { setSort((current) => current.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }); }
  function toggleFilter(key, value, checked) { setFilters((current) => { const selected = current[key] || []; const next = checked ? [...new Set([...selected, value])] : selected.filter((item) => item !== value); return { ...current, [key]: next }; }); }
  function exportReport() {
    const exportRows = sortedRows.map((row) => Object.fromEntries(visibleColumns.map((column) => [column.label, valueFor(row, column)])));
    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, "asset-report.xlsx");
  }

  if (loading) return <div className="text-sm text-slate-500">Loading report...</div>;
  if (error) return <Alert>{error}</Alert>;
  return <div><div className="mb-6 flex flex-wrap items-center gap-3"><div className="w-full sm:mr-auto sm:w-auto"><h2 className="text-2xl font-bold">Reports</h2><p className="mt-1 text-sm text-slate-500">View and analyze assets across every asset type.</p></div><SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search any column..." className="w-full sm:w-64 md:w-80" /><div className="flex gap-2">{can("reports.export_own") && <Button variant="secondary" onClick={exportReport} disabled={!sortedRows.length}>Export XLSX</Button>}<Button variant="secondary" onClick={() => setCustomize(true)}>Customize Columns</Button></div></div>{rows.length === 0 ? <EmptyState title="No assets yet" description="Assets from all asset types will appear here." /> : <Card className="overflow-visible"><div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 text-sm"><span className="text-slate-500">Showing {sortedRows.length} of {rows.length} assets{needle ? ` matching "${search.trim()}"` : ""}</span>{Object.values(filters).some((values) => values.length) && <button type="button" className="font-semibold text-slate-700" onClick={() => setFilters({})}>Clear filters</button>}</div><div className="relative overflow-x-auto overflow-y-visible"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{visibleColumns.map((column) => <th key={column.key} ref={openFilter === column.key ? filterAnchorRef : null} className="whitespace-nowrap px-4 py-3"><div className="flex items-center gap-1"><button type="button" className="hover:text-slate-900" onClick={() => toggleSort(column.key)}>{column.label} {sort.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</button><button type="button" className={`text-[10px] ${filters[column.key]?.length ? "text-slate-950" : "text-slate-400"}`} onClick={() => setOpenFilter((current) => current === column.key ? null : column.key)}>●</button></div>{openFilter === column.key && <ReportFilter anchorRef={filterAnchorRef} onClose={() => setOpenFilter(null)} column={column} values={filterValues[column.key] || []} selectedValues={filters[column.key] || []} onToggle={(value, checked) => toggleFilter(column.key, value, checked)} onClear={() => setFilters((current) => ({ ...current, [column.key]: [] }))} />}</th>)}<th /></tr></thead><tbody className="row-hover divide-y divide-slate-100">{!sortedRows.length && <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-10 text-center text-sm text-slate-500">No assets match this search or these filters.</td></tr>}{sortedRows.map((row) => <tr key={row.publicId}>{visibleColumns.map((column) => <td key={column.key} className="max-w-[220px] truncate px-4 py-3">{column.key === "assetType" ? <Link className="font-medium text-slate-800 hover:text-slate-950" to={`/asset-types/${row.assetTypeId}`}>{valueFor(row, column)}</Link> : valueFor(row, column)}</td>)}<td className="whitespace-nowrap px-4 py-3 text-right"><Link className="font-semibold text-slate-700" to={`/assets/${row.publicId}`}>Open →</Link></td></tr>)}</tbody></table></div></Card>}
    <Modal open={customize} title="Customize Report Columns" onClose={() => setCustomize(false)} className="max-w-3xl"><div className="space-y-2">{columns.map((column) => <label key={column.key} className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={selectedColumns.includes(column.key)} disabled={column.key === "assetType"} onChange={(event) => setSelectedColumns((current) => event.target.checked ? [...current, column.key] : current.filter((key) => key !== column.key))} /><span>{column.label}</span>{column.key === "assetType" && <span className="ml-auto text-xs text-slate-400">Required</span>}</label>)}<div className="flex justify-end pt-3"><Button onClick={() => setCustomize(false)}>Done</Button></div></div></Modal></div>;
}
