/**
 * export-csv.ts — client-side CSV/Excel download utility (no extra dependencies)
 */

type Row = Record<string, string | number | boolean | null | undefined>;

function escapeCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  // Quote if contains comma, quote, or newline
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function rowsToCsv(headers: string[], rows: Row[], keys: string[]): string {
  const lines: string[] = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(keys.map(k => escapeCell(row[k])).join(","));
  }
  return lines.join("\r\n");
}

function downloadFile(content: string, filename: string, mime = "text/csv;charset=utf-8;") {
  const bom = "\uFEFF"; // UTF-8 BOM — makes Excel open with correct encoding
  const blob = new Blob([bom + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Exports ──────────────────────────────────────────────────────────────────

export function exportSalesCSV(data: any[], dateFrom: string, dateTo: string) {
  const csv = rowsToCsv(
    ["Date", "Revenue (ETB)", "Orders"],
    data,
    ["date", "revenue", "orders"]
  );
  downloadFile(csv, `coffee-land-sales-${dateFrom}-to-${dateTo}.csv`);
}

export function exportTopItemsCSV(items: any[], dateFrom: string, dateTo: string) {
  const csv = rowsToCsv(
    ["Rank", "Item (EN)", "Item (AM)", "Total Sold", "Revenue (ETB)"],
    items.map((item, i) => ({ rank: i + 1, ...item })),
    ["rank", "nameEn", "nameAm", "totalSold", "revenue"]
  );
  downloadFile(csv, `coffee-land-top-items-${dateFrom}-to-${dateTo}.csv`);
}

export function exportPaymentsCSV(breakdown: any[], dateFrom: string, dateTo: string) {
  const csv = rowsToCsv(
    ["Method", "Transactions", "Amount (ETB)", "Share (%)"],
    breakdown,
    ["method", "count", "amount", "percentage"]
  );
  downloadFile(csv, `coffee-land-payments-${dateFrom}-to-${dateTo}.csv`);
}

export function exportHourlyCSV(hourly: any[]) {
  const today = new Date().toISOString().slice(0, 10);
  const csv = rowsToCsv(
    ["Hour", "Revenue (ETB)", "Orders"],
    hourly.map(h => ({ ...h, hour: `${h.hour}:00–${h.hour + 1}:00` })),
    ["hour", "revenue", "orders"]
  );
  downloadFile(csv, `coffee-land-hourly-${today}.csv`);
}

export function exportCategoriesCSV(categories: any[], dateFrom: string, dateTo: string) {
  const csv = rowsToCsv(
    ["Category", "Revenue (ETB)", "Orders"],
    categories,
    ["categoryName", "revenue", "orders"]
  );
  downloadFile(csv, `coffee-land-categories-${dateFrom}-to-${dateTo}.csv`);
}
