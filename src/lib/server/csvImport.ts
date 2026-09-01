// Port of app/csv_import.py — generic CSV → trade preview rows.
import { computePnl, round2, round4 } from "./analytics";

export interface CsvMapping {
  symbol: string;
  side?: string | null;
  qty: string;
  price?: string | null;
  entry_price?: string | null;
  exit_price?: string | null;
  opened_at?: string | null;
  closed_at?: string | null;
  datetime?: string | null;
  fees?: string | null;
  pnl?: string | null;
  action?: string | null;
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, escaped quotes, CRLF). */
export function parseCsvText(text: string): [string[], Record<string, string>[]] {
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    records.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // handled by the following \n; ignore lone CR
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();

  if (!records.length) return [[], []];
  const headers = records[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < records.length; r++) {
    const rec = records[r];
    if (rec.length === 1 && rec[0].trim() === "") continue; // skip blank lines
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (rec[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return [headers, rows];
}

function get(row: Record<string, string>, key?: string | null): string {
  if (!key) return "";
  return (row[key] ?? "").trim();
}

function parseSide(raw: string, action = ""): "LONG" | "SHORT" {
  const value = (raw || action || "").toUpperCase();
  if (["LONG", "BUY", "B", "BOT"].includes(value)) return "LONG";
  if (["SHORT", "SELL", "S", "SLD", "SSHORT"].includes(value)) return "SHORT";
  return "LONG";
}

function parseNumber(raw: string): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  let cleaned = raw.replace(/\$/g, "").replace(/,/g, "").replace(/%/g, "").trim();
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) cleaned = "-" + cleaned.slice(1, -1);
  const n = Number(cleaned);
  return Number.isFinite(n) && cleaned !== "" ? n : null;
}

const pad = (n: number, w = 2) => n.toString().padStart(w, "0");

/** Mirror of the datetime formats accepted by the original Python importer. */
export function parseDt(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim();
  let m: RegExpMatchArray | null;

  // YYYY-MM-DD[ T]HH:MM[:SS]
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h, mi, se] = m;
    return `${pad(+y, 4)}-${pad(+mo)}-${pad(+d)}T${pad(+h)}:${pad(+mi)}:${pad(+(se || 0))}`;
  }
  // YYYY-MM-DD
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${pad(+y, 4)}-${pad(+mo)}-${pad(+d)}T00:00:00`;
  }
  // M/D/YYYY[ HH:MM[:SS]]
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, mo, d, y, h, mi, se] = m;
    return `${pad(+y, 4)}-${pad(+mo)}-${pad(+d)}T${pad(+(h || 0))}:${pad(+(mi || 0))}:${pad(+(se || 0))}`;
  }
  // M/D/YY[ HH:MM[:SS]]  (Python %y: 00-68 → 2000s, 69-99 → 1900s)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})(?:[ ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, mo, d, yy, h, mi, se] = m;
    const year = +yy < 69 ? 2000 + +yy : 1900 + +yy;
    return `${pad(year, 4)}-${pad(+mo)}-${pad(+d)}T${pad(+(h || 0))}:${pad(+(mi || 0))}:${pad(+(se || 0))}`;
  }
  return null;
}

export interface CsvPreviewRow {
  index: number;
  symbol: string;
  side: "LONG" | "SHORT";
  qty: number | null;
  avg_entry: number | null;
  avg_exit: number | null;
  fees: number;
  opened_at: string | null;
  closed_at: string | null;
  gross_pnl: number | null;
  net_pnl: number | null;
  net_roi: number | null;
  errors: string[];
  valid: boolean;
}

export function previewRows(rows: Record<string, string>[], mapping: CsvMapping): CsvPreviewRow[] {
  return rows.map((row, i) => {
    const errors: string[] = [];
    const symbol = get(row, mapping.symbol).toUpperCase();
    if (!symbol) errors.push("missing symbol");

    const side = parseSide(get(row, mapping.side), get(row, mapping.action));
    const qty = parseNumber(get(row, mapping.qty));
    if (qty === null || qty <= 0) errors.push("invalid qty");

    const entry = parseNumber(get(row, mapping.entry_price) || get(row, mapping.price));
    let exit = parseNumber(get(row, mapping.exit_price) || get(row, mapping.price));
    const fees = parseNumber(get(row, mapping.fees)) ?? 0;
    const pnl = parseNumber(get(row, mapping.pnl));

    const openedAt = parseDt(get(row, mapping.opened_at) || get(row, mapping.datetime));
    let closedAt = parseDt(get(row, mapping.closed_at) || get(row, mapping.datetime));
    if (!openedAt) errors.push("missing opened_at");
    if (!closedAt) closedAt = openedAt;

    if (entry === null) errors.push("missing entry price");
    if (exit === null) exit = entry;

    let gross: number | null = null;
    let net: number | null = null;
    let roi: number | null = null;
    if (entry !== null && exit !== null && qty !== null) {
      if (pnl !== null && mapping.pnl) {
        net = pnl;
        gross = pnl + fees;
        const notional = Math.abs(entry * qty) || 1.0;
        roi = (net / notional) * 100;
      } else {
        [gross, net, roi] = computePnl(side, qty, entry, exit, fees);
      }
    }

    return {
      index: i,
      symbol,
      side,
      qty,
      avg_entry: entry,
      avg_exit: exit,
      fees,
      opened_at: openedAt,
      closed_at: closedAt,
      gross_pnl: gross !== null ? round2(gross) : null,
      net_pnl: net !== null ? round2(net) : null,
      net_roi: roi !== null ? round4(roi) : null,
      errors,
      valid: errors.length === 0,
    };
  });
}
