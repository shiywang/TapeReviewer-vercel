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
  const xml = await get(url, { t: token, q: referenceCode, v: VERSION });
  // A ready statement is a <FlexQueryResponse>; anything else is the envelope.
  if (/<FlexQueryResponse\b/i.test(xml)) return { status: "ready", xml };

  const env = parseEnvelope(xml);
  const code = env.errorCode;
  if (code && SERVER_BUSY.has(code)) return { status: "pending", retryAfterMs: 1500, code };
  if (code && CLIENT_THROTTLED.has(code)) return { status: "pending", retryAfterMs: 10000, code };
  throw new FlexError(env.errorMessage || "Flex GetStatement failed", code);
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

/** Pull <Trade …/> and <TradeConfirm …/> elements into executions. */
export function parseFlexExecutions(xml: string, sourceLabel: string): FlexExec[] {
  const execs: FlexExec[] = [];
  const elements = xml.match(/<(?:Trade|TradeConfirm)\b[^>]*\/?>/gi) || [];
  for (const el of elements) {
    // Only individual fills carry a buySell + tradePrice; skip summary rows.
    const buySell = attr(el, "buySell").toUpperCase();
    const priceRaw = attr(el, "tradePrice") || attr(el, "price");
    if (!buySell || !priceRaw) continue;

    const symbol = (attr(el, "symbol") || attr(el, "underlyingSymbol")).toUpperCase();
    if (!symbol) continue;

    const { date, time } = normalizeDateTime(attr(el, "tradeDate"), attr(el, "dateTime"));
    if (!date) continue;

    const qty = Math.abs(num(attr(el, "quantity")));
    if (qty <= 0) continue;

    execs.push({
      time,
      symbol,
      side: buySell, // "BUY"/"SELL" — sideDelta() understands these
      price: num(priceRaw),
      qty,
      fee: Math.abs(num(attr(el, "ibCommission") || attr(el, "commission"))),
      // pnl=0 → the round-trip engine computes gross from fill prices and
      // subtracts commissions for net. We intentionally do NOT use IBKR's
      // fifoPnlRealized: it is realized P&L *before* commissions, so routing it
      // through the "net P&L" path would double-count / mis-sign fees. Computing
      // from prices is deterministic and matches the DAS behavior. (Caveat:
      // options/futures multipliers aren't applied here — verify on real data
      // if you trade non-equities.)
      pnl: 0,
      trade_date: date,
      source_file: sourceLabel,
    });
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

/** Turn a ready Flex statement into the same preview shape the DAS UI renders. */
export function buildFlexPreview(xml: string): FlexImportPreview {
  const queryName = attr(xml.match(/<FlexQueryResponse\b[^>]*>/i)?.[0] || "", "queryName");
  const execs = parseFlexExecutions(xml, queryName || "IBKR");
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
    fingerprint: fingerprintFiles([[label, xml]]),
    trade_fingerprint: fingerprintTrades(valid as unknown as Record<string, unknown>[]),
    label,
  };
}

/** Read Flex credentials from env, with optional per-request override. */
export function flexCredentials(override?: { token?: string; queryId?: string }): {
  token: string;
  queryId: string;
} {
  const token = (override?.token || process.env.IBKR_FLEX_TOKEN || "").trim();
  const queryId = (override?.queryId || process.env.IBKR_FLEX_QUERY_ID || "").trim();
  if (!token || !queryId) {
    throw new FlexError(
      "IBKR Flex is not configured. Set IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID.",
    );
  }
  return { token, queryId };
}
