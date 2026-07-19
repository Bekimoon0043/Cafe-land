/**
 * receipt-print.ts
 * Opens a clean browser print window containing only the receipt.
 * Works with any printer the OS has registered: thermal POS, desktop, PDF.
 */

export interface ReceiptItem {
  nameEn: string;
  quantity: number;
  unitPrice: number;
}

export interface ReceiptData {
  orderNumber: string;
  orderType: string;
  tableLabel?: string | null;
  staffName?: string | null;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  printedAt?: Date;
}

export function printReceipt(data: ReceiptData) {
  const now = data.printedAt ?? new Date();
  const dateStr = now.toLocaleDateString("en-ET", { year: "numeric", month: "short", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-ET", { hour: "2-digit", minute: "2-digit" });

  const itemRows = data.items.map(i => {
    const lineTotal = (i.unitPrice * i.quantity).toFixed(2);
    const name = i.nameEn.length > 22 ? i.nameEn.slice(0, 20) + "…" : i.nameEn;
    return `
      <tr>
        <td>${i.quantity}x</td>
        <td>${name}</td>
        <td style="text-align:right">${i.unitPrice.toFixed(2)}</td>
        <td style="text-align:right">${lineTotal}</td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt ${data.orderNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 80mm;          /* 80 mm thermal paper */
      padding: 4mm 4mm;
      color: #000;
    }
    .center  { text-align: center; }
    .bold    { font-weight: bold; }
    .big     { font-size: 15px; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    table    { width: 100%; border-collapse: collapse; }
    td       { padding: 1px 2px; vertical-align: top; }
    td:first-child { width: 28px; }
    td:nth-child(2){ width: auto; }
    td:nth-child(3), td:last-child { width: 60px; white-space: nowrap; }
    .total-row td { font-weight: bold; font-size: 13px; }
    .footer { margin-top: 6px; font-size: 11px; }
    @media print {
      @page { margin: 0; size: 80mm auto; }
    }
  </style>
</head>
<body>
  <div class="center bold big">☕ Coffee Land</div>
  <div class="center" style="font-size:10px;margin-bottom:4px">እንኳን ወደ ቡና ምድር ሞድር በደህና መጡ</div>
  <div class="divider"></div>

  <div><span class="bold">Order:</span> #${data.orderNumber}</div>
  <div><span class="bold">Type:</span> ${data.orderType.replace("_", " ")}</div>
  ${data.tableLabel ? `<div><span class="bold">Table:</span> ${data.tableLabel}</div>` : ""}
  ${data.staffName  ? `<div><span class="bold">Server:</span> ${data.staffName}</div>` : ""}
  <div><span class="bold">Date:</span> ${dateStr} ${timeStr}</div>

  <div class="divider"></div>

  <table>
    <thead>
      <tr>
        <td class="bold">Qty</td>
        <td class="bold">Item</td>
        <td class="bold" style="text-align:right">Price</td>
        <td class="bold" style="text-align:right">Total</td>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <div class="divider"></div>

  <table>
    <tr>
      <td>Subtotal</td>
      <td style="text-align:right">${data.subtotal.toFixed(2)} ETB</td>
    </tr>
    <tr>
      <td>Tax (15%)</td>
      <td style="text-align:right">${data.tax.toFixed(2)} ETB</td>
    </tr>
    <tr class="total-row">
      <td>TOTAL</td>
      <td style="text-align:right">${data.total.toFixed(2)} ETB</td>
    </tr>
  </table>

  <div class="divider"></div>

  ${data.notes ? `<div style="font-size:11px"><span class="bold">Notes:</span> ${data.notes}</div><div class="divider"></div>` : ""}

  <div class="center footer">Thank you for visiting Coffee Land!</div>
  <div class="center footer">አመሰግናለን! ደህና ይኑሩ 🙏</div>
  <br/>
</body>
</html>`;

  const win = window.open("", "_blank", "width=420,height=680,toolbar=0,menubar=0,scrollbars=1");
  if (!win) {
    alert("Pop-up blocked. Please allow pop-ups for this site to print receipts.");
    return;
  }
  win.document.write(html);
  win.document.close();
  // Give the browser a moment to render before triggering print
  win.onload = () => { win.focus(); win.print(); };
  // Fallback if onload already fired
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* already printed */ } }, 600);
}
