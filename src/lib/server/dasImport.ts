// Port of app/das_import.py — DAS Trader Pro execution CSV → round-trip trades.
import { round2, round4, roundTo } from "./analytics";
import { fingerprintFiles, fingerprintTrades } from "./importBatches";

/** Positional CSV reader (quotes, escaped quotes, CRLF). Returns all records. */
function csvReader(text: string): string[][] {
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
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") pushField();
    else if (c === "\n") pushRow();
    else if (c === "\r") {
      /* ignore */
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return records;
}

function normHeader(name: string): string {
  const s = (name || "").trim().replace(/,+$/, "");
  return s.replace(/\s+/g, " ").toLowerCase();
}

export function isDasCsv(headers: string[]): boolean {
  const normalized = new Set(headers.filter(Boolean).map(normHeader));
  const hasSymbol = normalized.has("symbol") || normalized.has("symb");
  const required = ["time", "side", "price", "qty"];
  return hasSymbol && required.every((r) => normalized.has(r));
}

export function dateFromCloid(cloid: string): string | null {
  const digits = (cloid || "").split(".")[0].replace(/\D/g, "");
  if (digits.length < 6) return null;
  const year = 2000 + parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const day = parseInt(digits.slice(4, 6), 10);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

export function dateFromFilename(filename: string, defaultYear = 2026): string | null {
  let stem = (filename || "").split("/").pop() || "";
  stem = stem.includes(".") ? stem.slice(0, stem.lastIndexOf(".")) : stem;
  const m = stem.match(/^(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  return `${defaultYear.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

/** Throws on a non-empty unparseable value (callers catch); empty → 0. */
function parseNumber(raw: string): number {
  let cleaned = (raw || "").replace(/\$/g, "").replace(/,/g, "").trim();
  if (cleaned.startsWith("(") && cleaned.endsWith(")")) cleaned = "-" + cleaned.slice(1, -1);
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error("not a number");
  return n;
}

function sideDelta(side: string, qty: number): number {
  const s = side.toUpperCase().trim();
  if (["B", "BUY", "BC", "COVER", "BOT"].includes(s)) return qty;
  if (["SS", "SHORT", "SSHORT", "SOLD_SHORT", "S", "SELL", "SLD"].includes(s)) return -qty;
  return 0;
}

interface OpenTrade {
  symbol: string;
  side: "LONG" | "SHORT";
  trade_date: string;
  opened_at: string;
  entry_qty: number;
  entry_notional: number;
  exit_qty: number;
  exit_notional: number;
  fees: number;
  pnl_sum: number;
  closed_at: string | null;
  fill_count: number;
  source_file: string;
}

export interface DasTrade {
  symbol: string;
  side: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string;
  qty: number;
  avg_entry: number;
  avg_exit: number;
  fees: number;
  gross_pnl: number;
  net_pnl: number;
  net_roi: number;
  fill_count: number;
  source_file: string;
  trade_date: string;
  valid: boolean;
  errors: string[];
  index?: number;
}

function closeTrade(cur: OpenTrade): DasTrade {
  const qty = cur.entry_qty;
  const avgEntry = cur.entry_qty ? cur.entry_notional / cur.entry_qty : 0;
  const avgExit = cur.exit_qty ? cur.exit_notional / cur.exit_qty : avgEntry;

  let net: number;
  let gross: number;
  if (Math.abs(cur.pnl_sum) > 1e-9) {
    net = round2(cur.pnl_sum);
    gross = round2(net + cur.fees);
  } else {
    gross =
      cur.side === "LONG"
        ? round2((avgExit - avgEntry) * qty)
        : round2((avgEntry - avgExit) * qty);
    net = round2(gross - cur.fees);
  }
  const notional = Math.abs(avgEntry * qty) || 1.0;
  const roi = round4((net / notional) * 100);
  const valid = qty > 0 && cur.exit_qty > 0;
  return {
    symbol: cur.symbol,
    side: cur.side,
    opened_at: `${cur.trade_date}T${cur.opened_at}`,
    closed_at: `${cur.trade_date}T${cur.closed_at || cur.opened_at}`,
    qty: roundTo(qty, 4),
    avg_entry: roundTo(avgEntry, 6),
    avg_exit: roundTo(avgExit, 6),
    fees: roundTo(cur.fees, 4),
    gross_pnl: gross,
    net_pnl: net,
    net_roi: roi,
    fill_count: cur.fill_count,
    source_file: cur.source_file,
    trade_date: cur.trade_date,
    valid,
    errors: valid ? [] : ["incomplete round-trip"],
  };
}

interface Execution {
  time: string;
  symbol: string;
  side: string;
  price: number;
  qty: number;
  fee: number;
  pnl: number;
  trade_date: string;
  source_file: string;
}

export function parseDasExecutions(
  text: string,
  filename = "",
  defaultYear = 2026,
): [string[], Execution[]] {
  const records = csvReader(text);
  if (!records.length) return [[], []];
  const rawHeaders = records[0];

  const headers = rawHeaders
    .filter((h) => h && h.trim().replace(/,+$/, ""))
    .map((h) => h.trim().replace(/,+$/, ""));

  const index = new Map<string, number>();
  rawHeaders.forEach((h, i) => {
    const key = normHeader(h);
    if (!index.has(key)) index.set(key, i);
  });
  const col = (...names: string[]): number | null => {
    for (const n of names) {
      const key = normHeader(n);
      if (index.has(key)) return index.get(key)!;
    }
    return null;
  };

  const iTime = col("Time");
  const iSymbol = col("Symbol", "Symb");
  const iSide = col("Side");
  const iPrice = col("Price");
  const iQty = col("Qty", "Quantity");
  const iFee = col("ECNFee", "EcnFee", "ECN Fee", "Fees");
  const iPnl = col("P / L", "P/L", "PnL", "PL");
  const iCloid = col("Cloid", "ClOrdID");

  if ([iTime, iSymbol, iSide, iPrice, iQty].some((v) => v === null)) return [headers, []];

  const fileDate = dateFromFilename(filename, defaultYear);
  const executions: Execution[] = [];
  for (let r = 1; r < records.length; r++) {
    const row = records[r];
    if (!row.length || row.every((c) => !(c || "").trim())) continue;
    const symbol = (iSymbol! < row.length ? row[iSymbol!] : "").trim().toUpperCase();
    if (!symbol) continue;
    const timeS = (iTime! < row.length ? row[iTime!] : "").trim();
    const side = (iSide! < row.length ? row[iSide!] : "").trim();
    let price: number;
    let qty: number;
    try {
      price = parseNumber(iPrice! < row.length ? row[iPrice!] : "");
      qty = parseNumber(iQty! < row.length ? row[iQty!] : "");
    } catch {
      continue;
    }
    if (qty <= 0 || price < 0) continue;

    let fee = 0;
    if (iFee !== null && iFee < row.length) {
      try {
        fee = parseNumber(row[iFee]);
      } catch {
        fee = 0;
      }
    }
    let pnl = 0;
    if (iPnl !== null && iPnl < row.length) {
      try {
        pnl = parseNumber(row[iPnl]);
      } catch {
        pnl = 0;
      }
    }
    const cloid = iCloid !== null && iCloid < row.length ? row[iCloid] : "";
    const tradeDate = dateFromCloid(cloid) || fileDate;
    if (!tradeDate) continue;

    executions.push({ time: timeS, symbol, side, price, qty, fee, pnl, trade_date: tradeDate, source_file: filename });
  }
  return [headers, executions];
}

export function matchRoundTrips(executions: Execution[]): DasTrade[] {
  const byKey = new Map<string, Execution[]>();
  for (const ex of executions) {
    const key = `${ex.trade_date} ${ex.symbol}`;
    const arr = byKey.get(key) || [];
    arr.push(ex);
    byKey.set(key, arr);
  }

  const trades: DasTrade[] = [];
  const sortedKeys = [...byKey.keys()].sort();
  for (const key of sortedKeys) {
    const [tradeDate, symbol] = key.split(" ");
    const fills = [...byKey.get(key)!].sort((a, b) => {
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      if (a.side !== b.side) return a.side < b.side ? -1 : 1;
      return a.price - b.price;
    });

    let pos = 0;
    let cur: OpenTrade | null = null;
    for (const ex of fills) {
      let remaining = ex.qty;
      const direction = sideDelta(ex.side, 1) > 0 ? 1 : -1;
      const price = ex.price;
      let feeLeft = ex.fee;
      let pnlLeft = ex.pnl;
      let firstSlice = true;

      while (remaining > 1e-9) {
        if (Math.abs(pos) < 1e-9) {
          cur = {
            symbol,
            side: direction > 0 ? "LONG" : "SHORT",
            trade_date: tradeDate,
            opened_at: ex.time,
            entry_qty: 0,
            entry_notional: 0,
            exit_qty: 0,
            exit_notional: 0,
            fees: 0,
            pnl_sum: 0,
            closed_at: null,
            fill_count: 0,
            source_file: ex.source_file || "",
          };
        }
        const c = cur!;
        const opening = (pos >= -1e-9 && direction > 0) || (pos <= 1e-9 && direction < 0);
        if (opening) {
          const addQty = remaining;
          c.entry_qty += addQty;
          c.entry_notional += addQty * price;
          if (firstSlice) {
            c.fees += feeLeft;
            c.pnl_sum += pnlLeft;
            feeLeft = 0;
            pnlLeft = 0;
            c.fill_count += 1;
            firstSlice = false;
          }
          pos += direction * addQty;
          remaining = 0;
        } else {
          const closeQty = Math.min(remaining, Math.abs(pos));
          c.exit_qty += closeQty;
          c.exit_notional += closeQty * price;
          if (firstSlice) {
            c.fees += feeLeft;
            c.pnl_sum += pnlLeft;
            feeLeft = 0;
            pnlLeft = 0;
            c.fill_count += 1;
            firstSlice = false;
          }
          pos += direction * closeQty;
          remaining -= closeQty;
          if (Math.abs(pos) < 1e-6) {
            c.closed_at = ex.time;
            trades.push(closeTrade(c));
            cur = null;
            pos = 0;
          }
        }
      }
    }
  }

  trades.sort((a, b) => {
    if (a.opened_at !== b.opened_at) return a.opened_at < b.opened_at ? -1 : 1;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  trades.forEach((t, i) => (t.index = i));
  return trades;
}

export function importDasFiles(files: [string, string][], defaultYear = 2026) {
  const allExecs: Execution[] = [];
  const fileSummaries: { filename: string; executions: number; headers: string[] }[] = [];
  let detected = true;
  for (const [filename, text] of files) {
    const [headers, execs] = parseDasExecutions(text, filename, defaultYear);
    if (headers.length && !isDasCsv(headers)) detected = false;
    allExecs.push(...execs);
    fileSummaries.push({ filename, executions: execs.length, headers });
  }

  const trades = matchRoundTrips(allExecs);
  const label = [...new Set(files.map(([name]) => name))].sort().join(", ");
  const fp = fingerprintFiles(files);
  return {
    broker: "das",
    detected,
    files: fileSummaries,
    execution_count: allExecs.length,
    trade_count: trades.length,
    valid_count: trades.filter((t) => t.valid).length,
    trades,
    net_pnl_total: round2(trades.filter((t) => t.valid).reduce((a, t) => a + t.net_pnl, 0)),
    fingerprint: fp,
    trade_fingerprint: fingerprintTrades(
      trades.filter((t) => t.valid) as unknown as Record<string, unknown>[],
    ),
    label,
  };
}
