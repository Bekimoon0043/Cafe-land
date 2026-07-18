/**
 * Ethiopian Payment Verification Logic
 * Ported from the Go/Gin reference: https://github.com/eyop23/ethio_payment_verfication
 * Supports CBE (PDF receipt) and TeleBirr (HTML receipt)
 */

import * as cheerio from "cheerio";
import { parse, isValid } from "date-fns";
import { logger } from "./logger";

export interface VerifiedPaymentData {
  payerName: string | null;
  payerAccountNo: string | null;
  receiverName: string | null;
  receiverAccountNo: string | null;
  paymentDate: string | null;
  invoiceNo: string | null;
  totalAmount: number | null;
  paymentMode: string | null;
  status: string;
}

// Date formats to try
const DATE_FORMATS = [
  "dd-MM-yyyy HH:mm:ss",
  "M/d/yyyy, h:mm:ss a",
  "d/M/yyyy, h:mm:ss a",
  "yyyy-MM-dd'T'HH:mm:ss",
  "yyyy-MM-dd HH:mm:ss",
];

function parseDate(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/\s+/g, " ");
  for (const fmt of DATE_FORMATS) {
    try {
      const d = parse(cleaned, fmt, new Date());
      if (isValid(d)) return d.toISOString();
    } catch {}
  }
  return cleaned; // Return raw if can't parse
}

function stripEtb(value: string): string {
  return value.replace(/\s*ETB\s*/gi, "").replace(/,/g, "").trim();
}

/**
 * Verify TeleBirr HTML receipt
 */
export async function verifyTelebirr(
  baseUrl: string,
  receiptId: string
): Promise<VerifiedPaymentData> {
  const url = baseUrl.endsWith("/") ? `${baseUrl}${receiptId}` : `${baseUrl}${receiptId}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const html = await resp.text();
    clearTimeout(timeout);

    const $ = cheerio.load(html);
    const data: VerifiedPaymentData = {
      payerName: null,
      payerAccountNo: null,
      receiverName: null,
      receiverAccountNo: null,
      paymentDate: null,
      invoiceNo: null,
      totalAmount: null,
      paymentMode: null,
      status: "Pending",
    };

    // Parse table rows: label → value
    $("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length === 0) return;

      const labelCell = $(cells[0]).text().trim();
      const valueCell = cells.length >= 2 ? $(cells[cells.length - 1]).text().trim() : "";

      const label = labelCell.toLowerCase();

      if (label.includes("payer name")) data.payerName = valueCell;
      else if (label.includes("payment mode")) data.paymentMode = valueCell;
      else if (label.includes("payment reason")) data.paymentMode = data.paymentMode ?? valueCell;
      else if (label.includes("payment date")) data.paymentDate = parseDate(valueCell);
      else if (label.includes("total paid")) {
        const num = parseFloat(stripEtb(valueCell));
        if (!isNaN(num)) data.totalAmount = num;
      } else if (label.includes("transaction status")) data.status = valueCell;
      else if (label.includes("credited party name")) data.receiverName = valueCell;
      else if (label.includes("credited party account")) data.receiverAccountNo = valueCell;
      else if (label.includes("invoice no")) {
        // Special 3-column case: next row may have the value
        if (valueCell && valueCell !== labelCell) {
          data.invoiceNo = valueCell;
        }
      }
    });

    // Handle 3-column invoice no table (header row then data row)
    if (!data.invoiceNo) {
      let foundInvoiceHeader = false;
      $("tr").each((_, row) => {
        const cells = $(row).find("td, th");
        const texts = cells.map((_, c) => $(c).text().trim().toLowerCase()).get();
        if (texts.some((t) => t.includes("invoice no"))) {
          foundInvoiceHeader = true;
          return;
        }
        if (foundInvoiceHeader) {
          const val = $(cells[0]).text().trim();
          if (val) data.invoiceNo = val;
          foundInvoiceHeader = false;
        }
      });
    }

    return data;
  } catch (err: any) {
    clearTimeout(timeout);
    logger.error({ err, url }, "TeleBirr verification failed");
    throw new Error(`TeleBirr verification failed: ${err.message}`);
  }
}

/**
 * Verify CBE PDF receipt by fetching URL and extracting text
 * CBE serves a PDF — we parse line-pairs for label→value
 */
export async function verifyCBE(
  baseUrl: string,
  receiptId: string
): Promise<VerifiedPaymentData> {
  // CBE URL format: base_url?id=receipt_id
  const url = baseUrl.includes("?")
    ? `${baseUrl}&id=${encodeURIComponent(receiptId)}`
    : `${baseUrl}?id=${encodeURIComponent(receiptId)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(url, { signal: controller.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    clearTimeout(timeout);

    const contentType = resp.headers.get("content-type") || "";
    let text = "";

    if (contentType.includes("application/pdf")) {
      // Use pdf-parse to extract text from PDF
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = Buffer.from(await resp.arrayBuffer());
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      text = await resp.text();
    }

    const data: VerifiedPaymentData = {
      payerName: null,
      payerAccountNo: null,
      receiverName: null,
      receiverAccountNo: null,
      paymentDate: null,
      invoiceNo: null,
      totalAmount: null,
      paymentMode: null,
      status: "Successful", // CBE defaults to Successful
    };

    // Parse label→value pairs on consecutive lines
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let expectPayerAccount = false;
    let expectReceiverAccount = false;

    for (let i = 0; i < lines.length - 1; i++) {
      const label = lines[i].toLowerCase();
      const value = lines[i + 1];

      if (label === "payer") {
        data.payerName = value;
        expectPayerAccount = true;
        i++;
      } else if (label === "receiver") {
        data.receiverName = value;
        expectReceiverAccount = true;
        i++;
      } else if (label === "payment date & time" || label.includes("payment date")) {
        data.paymentDate = parseDate(value);
        i++;
      } else if (label.includes("reference no") || label.includes("vat invoice")) {
        data.invoiceNo = value;
        i++;
      } else if (label.includes("transferred amount") || label.includes("transfer amount")) {
        const num = parseFloat(stripEtb(value));
        if (!isNaN(num)) data.totalAmount = num;
        i++;
      } else if (label.includes("reason") || label.includes("type of service")) {
        data.paymentMode = value;
        i++;
      } else if (label === "account") {
        if (expectPayerAccount) {
          data.payerAccountNo = value;
          expectPayerAccount = false;
          i++;
        } else if (expectReceiverAccount) {
          data.receiverAccountNo = value;
          expectReceiverAccount = false;
          i++;
        }
      }
    }

    // Fallback: FT regex for invoice number
    if (!data.invoiceNo) {
      const ftMatch = text.match(/FT\d{7}[A-Z0-9]+/);
      if (ftMatch) data.invoiceNo = ftMatch[0];
    }

    return data;
  } catch (err: any) {
    clearTimeout(timeout);
    logger.error({ err, url }, "CBE verification failed");
    throw new Error(`CBE verification failed: ${err.message}`);
  }
}
