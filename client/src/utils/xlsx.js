import * as XLSX from "xlsx";

// The two export buttons build the same one-sheet workbook from
// `{ header: value }` objects; only the sheet name and file name differ.
export function downloadXlsx(rows, { sheet, fileName }) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheet);
  XLSX.writeFile(workbook, fileName);
}
