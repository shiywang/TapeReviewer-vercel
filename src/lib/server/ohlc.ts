// 1-minute OHLC bars from massive.com (Polygon-compatible aggregates API), cached
// per (symbol, ET session date) in Supabase. A closed day's bars never change, so
// the first view of a symbol/day costs one API call and everything after is free —
// keeping us under the free tier's 5 calls/min.
import { supabase } from "./supabase";
import { ApiError } from "./http";

const BASE = process.env.MASSIVE_BASE_URL || "https://api.massive.com";

export interface Bar {
  t: number; // unix SECONDS, start of the 1-min window (UTC)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** YYYY-MM-DD → the next calendar day, so a UTC fetch spans the whole ET session
 *  (ET post-market rolls past midnight UTC). */
function nextDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** ET calendar date (YYYY-MM-DD) for a UTC instant — used to keep only the target
 *  session's bars after a wider UTC fetch. */
function etDate(unixSec: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSec * 1000));
}

// Stored symbols are either plain equities ("NVDA") or OCC option strings
// ("META  260803C00570000"); the latter map to Massive/Polygon option tickers
// ("O:META260803C00570000").
export function toMassiveTicker(symbol: string): string {
  const compact = symbol.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z.]{1,6}\d{6}[CP]\d{8}$/.test(compact)) return `O:${compact}`;
  return symbol.trim().toUpperCase();
}

async function fetchFromMassive(symbol: string, date: string): Promise<Bar[]> {
  const key = (process.env.MASSIVE_API_KEY || "").trim();
  if (!key) throw new ApiError("Market data not configured. Set MASSIVE_API_KEY.", 400);

  const ticker = toMassiveTicker(symbol);
  const from = date;
  const to = nextDay(date); // capture ET pre/post-market that spills across UTC midnight
  const url = new URL(
    `${BASE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/minute/${from}/${to}`,
  );
  url.searchParams.set("adjusted", "true");
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000");
  // Auth: send both the bearer header and apiKey query param (Polygon-style APIs
  // accept one or the other); harmless to include both.
  url.searchParams.set("apiKey", key);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new ApiError("Market data auth failed — check MASSIVE_API_KEY.", 502);
  }
  if (res.status === 429) {
    throw new ApiError("Market data rate limit hit — try again in a minute.", 429);
  }
  if (!res.ok) throw new ApiError(`Market data error (HTTP ${res.status}).`, 502);

  const body = (await res.json()) as {
    results?: { t: number; o: number; h: number; l: number; c: number; v: number }[];
  };
  const raw = body.results || [];
  return raw
    .map((r) => ({ t: Math.floor(r.t / 1000), o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
    .filter((b) => etDate(b.t) === date) // keep only the requested ET session
    .sort((a, b) => a.t - b.t);
}

/** Cached 1-min bars for a symbol on an ET session date. */
export async function getBars(
  symbol: string,
  date: string,
): Promise<{ bars: Bar[]; source: string; cached: boolean }> {
  const sym = symbol.toUpperCase();
  const sb = supabase();

  const { data: hit } = await sb
    .from("ohlc_cache")
    .select("bars, source")
    .eq("symbol", sym)
    .eq("trade_date", date)
    .maybeSingle();
  if (hit) return { bars: (hit as { bars: Bar[] }).bars, source: (hit as { source: string }).source, cached: true };

  const bars = await fetchFromMassive(sym, date);
  // Persist even an empty result (e.g. non-trading day) so we don't refetch.
  await sb
    .from("ohlc_cache")
    .upsert({ symbol: sym, trade_date: date, bars, source: "massive" }, { onConflict: "symbol,trade_date" });
  return { bars, source: "massive", cached: false };
}
