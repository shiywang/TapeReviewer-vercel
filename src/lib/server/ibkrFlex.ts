// IBKR Flex Web Service client + mapping into the existing round-trip engine.
//
// Flow (two steps, both plain HTTPS GET returning XML):
//   1. SendRequest?t=<token>&q=<queryId>&v=3  -> ReferenceCode + Url
//   2. <Url>?t=<token>&q=<ReferenceCode>&v=3  -> the Flex statement XML,
//      or a "generation in progress" status you poll on.
//
// We deliberately do NOT block a serverless function across the whole poll:
// the /request route does step 1, the /fetch route does a single step-2 call
// and reports ready|pending so the browser can poll cheaply. This is both the
// fastest UX and safe against Vercel's function time limit.
//
// The parsed executions are fed straight into matchRoundTrips() — the same
// engine DAS uses — so a Flex import produces byte-identical round-trip trades.
import { matchRoundTrips, type DasTrade } from "./dasImport";
import { round2 } from "./analytics";
import { fingerprintFiles, fingerprintTrades } from "./importBatches";

const SEND_URL =
  "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest";
const STMT_URL =
  "https://gdcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement";
const VERSION = "3";

// Codes that mean "not ready yet, keep polling" vs. "backed off by throttle".
const SERVER_BUSY = new Set(["1009", "1019"]);
const CLIENT_THROTTLED = new Set(["1018"]);

// IBKR rejects some default user agents; the reference clients send "Java".
const HEADERS = { "user-agent": "Java" };

export class FlexError extends Error {
  code: string | null;
  constructor(message: string, code: string | null = null) {
    super(message);
    this.code = code;
  }
}

function attr(tag: string, name: string): string {
  // Attributes are quoted with either " or '.
  const m =
    tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) ||
    tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`, "i"));
  return m ? m[1] : "";
}

function firstTag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1].trim() : null;
}

/** Parse the small <FlexStatementResponse> envelope (step 1 + not-ready step 2). */
function parseEnvelope(xml: string): {
  status: string | null;
  referenceCode: string | null;
  url: string | null;
  errorCode: string | null;
  errorMessage: string | null;
} {
  return {
    status: firstTag(xml, "Status"),
    referenceCode: firstTag(xml, "ReferenceCode"),
    url: firstTag(xml, "Url"),
    errorCode: firstTag(xml, "ErrorCode") || firstTag(xml, "code"),
    errorMessage: firstTag(xml, "ErrorMessage") || firstTag(xml, "message"),
  };
}

async function get(url: string, params: Record<string, string>): Promise<string> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${url}?${qs}`, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new FlexError(`Flex service HTTP ${res.status}`);
  return res.text();
}

/** Step 1 — returns { referenceCode, url } to poll. Throws FlexError on failure. */
export async function sendRequest(
  token: string,
  queryId: string,
): Promise<{ referenceCode: string; url: string }> {
  const xml = await get(SEND_URL, { t: token, q: queryId, v: VERSION });
  const env = parseEnvelope(xml);
  if (env.status !== "Success" || !env.referenceCode) {
    throw new FlexError(
      env.errorMessage || "Flex SendRequest failed (check token & query id)",
      env.errorCode,
    );
  }
  return { referenceCode: env.referenceCode, url: env.url || STMT_URL };
}

export type FetchOutcome =
  | { status: "ready"; xml: string }
  | { status: "pending"; retryAfterMs: number; code: string | null };

/** Step 2 — a single GetStatement call. Reports ready|pending (never blocks). */
export async function fetchStatement(
  token: string,
  referenceCode: string,
  url: string = STMT_URL,
): Promise<FetchOutcome> {
  const body = await get(url, { t: token, q: referenceCode, v: VERSION });
  // Not-ready / error is always a small <FlexStatementResponse> envelope. A ready
  // statement is either <FlexQueryResponse> XML or a CSV (queries can output either).
  if (/<FlexStatementResponse\b/i.test(body)) {
    const env = parseEnvelope(body);
    const code = env.errorCode;
    if (code && SERVER_BUSY.has(code)) return { status: "pending", retryAfterMs: 1500, code };
    if (code && CLIENT_THROTTLED.has(code)) return { status: "pending", retryAfterMs: 10000, code };
    throw new FlexError(env.errorMessage || "Flex GetStatement failed", code);
  }
  return { status: "ready", xml: body };
}

// ---- XML -> executions -> round-trip trades -------------------------------

interface FlexExec {
  time: string; // HH:MM:SS
  symbol: string;
  side: string; // BUY / SELL
  price: number;
  qty: number;
  fee: number;
  pnl: number;
  trade_date: string; // YYYY-MM-DD
  source_file: string;
}

function num(s: string): number {
  const n = Number((s || "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
}

/** Normalize an IBKR date/time pair to (YYYY-MM-DD, HH:MM:SS). */
function normalizeDateTime(tradeDate: string, dateTime: string): { date: string; time: string } {
  // tradeDate is usually YYYYMMDD; dateTime is "YYYYMMDD;HHMMSS" or "YYYYMMDD;HH:MM:SS"
  // (separator/format is configurable in the query), sometimes space-separated.
  const dt = (dateTime || "").replace(/\s+/g, ";");
  const [dPart, tPartRaw] = dt.includes(";") ? dt.split(";") : [dateTime, ""];
  const rawDate = (tradeDate || dPart || "").replace(/[^0-9]/g, "");
  let date = "";
  if (rawDate.length >= 8) {
    date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
  }
  let time = (tPartRaw || "").trim();
  if (/^\d{6}$/.test(time)) time = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  if (!time) time = "00:00:00";
  return { date, time };
}

// Build one execution from already-extracted field strings. Shared by the XML
// and CSV parsers so both produce identical results.
//
// P&L handling: IBKR's fifoPnlRealized is realized P&L *before* commissions and
// is multiplier-correct (right for options/futures). When it is present we feed
// the engine a per-fill NET value (fifoPnlRealized + ibCommission, commission is
// negative) so the round-trip's net matches IBKR exactly and gross = net + fees.
// When it is absent (e.g. a bare Trade Confirmation query) we fall back to pnl=0
// and let the engine compute gross from fill prices (equities-correct).
function makeExec(f: {
  symbol: string;
  buySell: string;
  tradePrice: string;
  quantity: string;
  ibCommission: string;
  fifoPnlRealized: string; // "" means the field was absent
  tradeDate: string;
  dateTime: string;
  sourceLabel: string;
}): FlexExec | null {
  const buySell = f.buySell.toUpperCase();
  if (!buySell || !f.tradePrice) return null;
  const symbol = f.symbol.toUpperCase();
  if (!symbol) return null;
  const { date, time } = normalizeDateTime(f.tradeDate, f.dateTime);
  if (!date) return null;
  const qty = Math.abs(num(f.quantity));
  if (qty <= 0) return null;

  const commission = num(f.ibCommission); // negative in IBKR
  const hasFifo = f.fifoPnlRealized.trim() !== "";
  return {
    time,
    symbol,
    side: buySell, // "BUY"/"SELL" — sideDelta() understands these
    price: num(f.tradePrice),
    qty,
    fee: Math.abs(commission),
    pnl: hasFifo ? num(f.fifoPnlRealized) + commission : 0,
    trade_date: date,
    source_file: f.sourceLabel,
  };
}

/** Pull <Trade …/> and <TradeConfirm …/> elements into executions. */
export function parseFlexExecutions(xml: string, sourceLabel: string): FlexExec[] {
  const execs: FlexExec[] = [];
  const elements = xml.match(/<(?:Trade|TradeConfirm)\b[^>]*\/?>/gi) || [];
  for (const el of elements) {
    const ex = makeExec({
      symbol: attr(el, "symbol") || attr(el, "underlyingSymbol"),
      buySell: attr(el, "buySell"),
      tradePrice: attr(el, "tradePrice") || attr(el, "price"),
      quantity: attr(el, "quantity"),
      ibCommission: attr(el, "ibCommission") || attr(el, "commission"),
      fifoPnlRealized: attr(el, "fifoPnlRealized"),
      tradeDate: attr(el, "tradeDate"),
      dateTime: attr(el, "dateTime"),
      sourceLabel,
    });
    if (ex) execs.push(ex);
  }
  return execs;
}

/** Minimal RFC-4180 CSV line splitter (handles quotes + escaped quotes). */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}

/** Parse an IBKR Flex CSV statement's EXECUTION rows into executions. */
export function parseFlexCsv(text: string, sourceLabel: string): FlexExec[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]);
  const col = new Map<string, number>();
  header.forEach((h, i) => col.set(h.trim(), i));
  // Column names differ between Activity Flex (TradePrice/DateTime/IBCommission)
  // and Trade Confirmation Flex (Price/Date-Time/Commission); accept either.
  const at = (row: string[], ...names: string[]) => {
    for (const name of names) {
      const i = col.get(name);
      if (i != null && i < row.length) return row[i];
    }
    return "";
  };
  const hasLod = col.has("LevelOfDetail");

  const execs: FlexExec[] = [];
  for (let r = 1; r < lines.length; r++) {
    const row = splitCsvLine(lines[r]);
    // When the statement has a LevelOfDetail column, only EXECUTION rows are the
    // individual fills we round-trip; other levels are summaries/lots/orders.
    if (hasLod && at(row, "LevelOfDetail") !== "EXECUTION") continue;
    const ex = makeExec({
      symbol: at(row, "Symbol", "UnderlyingSymbol"),
      buySell: at(row, "Buy/Sell"),
      tradePrice: at(row, "TradePrice", "Price"),
      quantity: at(row, "Quantity"),
      ibCommission: at(row, "IBCommission", "Commission"),
      fifoPnlRealized: at(row, "FifoPnlRealized"),
      tradeDate: at(row, "TradeDate"),
      dateTime: at(row, "DateTime", "Date/Time"),
      sourceLabel,
    });
    if (ex) execs.push(ex);
  }
  return execs;
}

export interface FlexImportPreview {
  broker: "ibkr";
  detected: boolean;
  files: { filename: string; executions: number; headers: string[] }[];
  execution_count: number;
  trade_count: number;
  valid_count: number;
  trades: DasTrade[];
  net_pnl_total: number;
  fingerprint: string;
  trade_fingerprint: string;
  label: string;
}

/** Turn a ready Flex statement (XML or CSV) into the DAS-shaped preview. */
export function buildFlexPreview(statement: string): FlexImportPreview {
  const isXml = /<FlexQueryResponse\b/i.test(statement);
  const queryName = isXml
    ? attr(statement.match(/<FlexQueryResponse\b[^>]*>/i)?.[0] || "", "queryName")
    : "";
  const execs = isXml
    ? parseFlexExecutions(statement, queryName || "IBKR")
    : parseFlexCsv(statement, "IBKR");
  // matchRoundTrips takes the DAS Execution shape; ours is structurally identical.
  const trades = matchRoundTrips(execs as never);

  const dates = [...new Set(trades.map((t) => t.trade_date))].sort();
  const label =
    "IBKR" +
    (queryName ? ` ${queryName}` : "") +
    (dates.length ? ` (${dates[0]}${dates.length > 1 ? `…${dates[dates.length - 1]}` : ""})` : "");

  const valid = trades.filter((t) => t.valid);
  return {
    broker: "ibkr",
    detected: true,
    files: [{ filename: label, executions: execs.length, headers: [] }],
    execution_count: execs.length,
    trade_count: trades.length,
    valid_count: valid.length,
    trades,
    net_pnl_total: round2(valid.reduce((a, t) => a + t.net_pnl, 0)),
    // Fingerprint on the raw statement AND on the trades, so re-syncing the same
    // day is idempotent even if IBKR reorders/re-times identical fills.
    fingerprint: fingerprintFiles([[label, statement]]),
    trade_fingerprint: fingerprintTrades(valid as unknown as Record<string, unknown>[]),
    label,
  };
}

/** The Flex Web Service token (needed by both request and fetch). */
export function flexToken(override?: string): string {
  const token = (override || process.env.IBKR_FLEX_TOKEN || "").trim();
  if (!token) throw new FlexError("IBKR Flex is not configured. Set IBKR_FLEX_TOKEN.");
  return token;
}

// Two queries: "today" = a fast Trade Confirmation query (intraday, current-day
// fills), "history" = an Activity query for backfilling settled prior-day data.
// Overlap between the two is de-duplicated at commit time (trade-level key).
export type FlexScope = "today" | "history";

/** Pick the Flex query id for a scope, falling back to whichever is configured. */
export function flexQueryId(scope: FlexScope = "today", override?: string): string {
  const today = (process.env.IBKR_FLEX_QUERY_ID || "").trim();
  const history = (process.env.IBKR_FLEX_QUERY_ID_HISTORY || "").trim();
  const queryId = (override || (scope === "history" ? history : today) || today || history).trim();
  if (!queryId) {
    throw new FlexError(
      "No IBKR Flex query configured. Set IBKR_FLEX_QUERY_ID (today) and/or IBKR_FLEX_QUERY_ID_HISTORY.",
    );
  }
  return queryId;
}
