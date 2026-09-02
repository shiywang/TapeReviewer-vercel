# Design & Vetting: 1‑minute candlestick chart on the Day/Trade page

**Goal.** On `/day/:date?trade=:id`, show a **1‑minute candlestick chart** for the
selected trade's symbol, zoomed to the trade window, with the **entry/exit
overlaid** — placed **above the "Link video URL"** block (i.e. above `VideoPlayer`
in the Workbench column, replacing today's `ChartPlaceholder`).

**Status:** proposal for review. Nothing implemented yet.

---

## What the chart needs to do (requirements)

1. Render a candlestick 1‑min chart for `trade.symbol` on `trade`'s date.
2. Overlay the trade: **entry** marker at `opened_at`/`avg_entry`, **exit** marker
   at `closed_at`/`avg_exit`; ideally price lines for avg entry/exit (and later
   stop/target). Individual fills available via `api.trade(id).executions`.
3. Auto‑zoom to the trade window with some padding (e.g. ±30 min).
4. Match the app theme (light/candles), be fast, and stay within the free tiers
   of Vercel + Supabase + the data source.
5. Reviewing happens **after** the session (this is a journal), so **real‑time
   data is not required** — end‑of‑day 1‑min bars are enough.

---

## The two options — and an important clarification

The prompt frames this as "TradingView **or** massive.com data." In practice these
are not the same kind of thing: **TradingView is a chart renderer, massive.com is a
data source.** TradingView actually ships *three* different products, and only one
of them competes with "bring your own data + a chart lib." So the real choice is:

- **Option A — TradingView Advanced Chart *widget*** (embed an iframe; TradingView
  supplies both the chart *and* the data).
- **Option B — TradingView *Lightweight Charts* (open‑source lib) + massive.com
  1‑min data** (we supply the data; the lib just draws).

(A third TradingView product, the **Charting Library / Advanced Charts**, is free
but requires an application/approval, self‑hosting, and implementing a datafeed
adapter — heavier than we need. Not recommended; noted for completeness.)

---

## Option A — TradingView Advanced Chart widget

Embed the free `tv.js` Advanced Chart widget pointed at the symbol.

**Pros**
- Zero data plumbing, zero data cost, no API keys. ~1 hour to drop in.
- Familiar, polished chart; indicators for free.

**Cons (disqualifying for a trade‑review journal)**
- **Cannot overlay our data.** The widget exposes no API to add entry/exit markers
  or our fills. Requirement #2 is impossible.
- **Cannot reliably pin to a past intraday window.** It opens "live"; deep‑linking
  to `2026‑09‑01 09:39` with a fixed range and our markers isn't supported.
- **Data entitlement/delay.** US equity intraday on the free widget is typically
  delayed or gated by a TradingView account entitlement; we don't control it.
- **It's an iframe:** limited theming, no data extraction, heavier, an extra
  third‑party frame on every trade view.
- Symbol mapping needs an exchange prefix (`NASDAQ:NVDA`) we'd have to infer.

**Verdict:** great for "glance at a live symbol," **wrong for reviewing a specific
past trade with your executions marked.** Fails the core requirement.

---

## Option B — TradingView Lightweight Charts + massive.com data (recommended)

[Lightweight Charts](https://github.com/tradingview/lightweight-charts) is a free,
Apache‑2.0, ~45 KB library. We fetch 1‑min OHLC bars from massive.com, cache them in
Supabase, and draw candles with our own overlays.

### massive.com fit (the data source)

massive.com is a Polygon‑compatible market‑data provider (its client mirrors
Polygon's `list_aggs(...)` / `/v2/aggs/...` API). Relevant tier:

| | Free "Basic" | Starter $29 | Advanced $199 |
|---|---|---|---|
| Minute aggregates | ✅ | ✅ | ✅ |
| History | **2 years** | 5y | 20y+ |
| Rate limit | **5 calls/min** | unlimited | unlimited |
| Timing | **End‑of‑day** | 15‑min delayed | real‑time |
| Use | individual / non‑pro | " | " |

**The free tier fits this app well:**
- We review *after* the close, so **EOD delivery is fine** — past days' 1‑min bars
  are available.
- The journal's trades are Apr–Sep 2026, inside the **2‑year** window.
- One chart per trade view, with caching, stays far under **5 calls/min**.
- Personal, non‑pro use is permitted.

**Free‑tier limitations to accept:**
- You **can't chart *today's* trades until after market close** (EOD delivery). A
  same‑day chart would need a paid tier ($29+ for 15‑min delayed). Acceptable for
  review; note it in the UI ("bars available after close").
- Only 2 years back. Fine now; revisit if you backfill older history.
- Confirm on first call whether "EOD" free bars are returned for the *current* day
  after close or only the prior day — affects the "today" message.

### Architecture

```
DayPage (selected trade)
  └─ <MarketChart symbol date trade />           client component
        └─ GET /api/ohlc?symbol=NVDA&date=2026-09-01   Next.js route handler (nodejs)
              1. check Supabase ohlc_cache(symbol, date)  → hit: return bars
              2. miss: fetch massive /v2/aggs/ticker/NVDA/range/1/minute/{from}/{to}
                       (server-side, MASSIVE_API_KEY never sent to browser)
              3. store bars in ohlc_cache (immutable once the day has closed)
              4. return bars
        └─ lightweight-charts renders candles + entry/exit markers + price lines
```

**Why cache in Supabase:** a closed day's 1‑min bars never change, so cache them
permanently keyed by `(symbol, trade_date)`. First view of a symbol/day = 1 API
call; everything after is instant and free. Trivially keeps us under 5 calls/min and
under Supabase's 500 MB (390 bars/session × a few hundred symbol‑days ≈ negligible).

### New pieces

- **Lib:** `npm i lightweight-charts` (~45 KB, Apache‑2.0). Note: their terms
  require a small **TradingView attribution** link on the chart — we'll include it.
- **Server:** `src/lib/server/ohlc.ts` (massive client + cache read/write),
  `src/app/api/ohlc/route.ts` (auth‑gated GET, `X-App-Password` like the rest).
- **DB migration:** `ohlc_cache(symbol text, trade_date text, bars jsonb, source text,
  fetched_at text, primary key (symbol, trade_date))` — via our CLI
  (`npm run db:new ohlc_cache` → `npm run db:push`).
- **Client:** `src/spa/components/MarketChart.tsx` replacing `ChartPlaceholder`,
  rendered **above** `VideoPlayer` in the Workbench. Uses `api.ohlc(symbol, date)`.
- **Env:** `MASSIVE_API_KEY` (Vercel, server‑only) — I'll set it via the Vercel API
  like the IBKR keys once you create a key.

### Overlays (the payoff)

- `createSeriesMarkers`: ▲ entry at `opened_at`, ▼ exit at `closed_at` (green/red).
- `createPriceLine`: dashed lines at `avg_entry` and `avg_exit` (later: stop/target).
- Fit content to the trade window ±30 min so the trade is centered.
- Optional later: plot each fill from `executions` as its own marker.

### Effort & cost

- **Effort:** ~half a day. Data proxy + cache (~2 h), migration (~15 m), chart
  component with overlays + theming (~2–3 h), timezone alignment + testing (~1 h).
- **Cost:** $0 (Massive free + existing Vercel/Supabase free tiers).

### Risks / gotchas

- **Timezone alignment.** Massive bar timestamps are epoch‑ms UTC; our
  `opened_at`/`closed_at` are naive ET strings (e.g. `2026‑09‑01T09:39:15`). Must
  align both to a common basis (display in ET) so markers land on the right candle.
- **Options symbols.** OCC option symbols (e.g. `SPXW 260413C06850000`) won't map to
  Massive's stock aggregates. MVP: charts for equities (`AssetClass=STK`); show a
  "no chart for options" note for OPT trades, or later use Massive's options
  aggregates endpoint.
- **API‑key security.** `MASSIVE_API_KEY` stays server‑side in the route handler;
  never shipped to the browser.
- **First‑call verification.** Confirm the exact Massive aggregates URL/response and
  the free‑tier "today after close" behavior before finalizing the UI copy.

**Verdict:** Option B delivers the actual requirement (a real 1‑min candlestick with
your entries marked), at $0, reusing our existing auth + CLI‑migration + env‑var
tooling.

---

## Recommendation

**Build Option B** (Lightweight Charts + massive.com free tier, Supabase‑cached).
Option A can't overlay your fills or pin to a past window, so it doesn't meet the
goal. Keep Option A only as a possible "quick live glance" toggle later if wanted.

## Open questions for you

1. Get a **massive.com free API key** (massive.com → Create API Key) and share it,
   so I can set `MASSIVE_API_KEY` and verify the aggregates call on real data.
2. **Options trades:** OK to show equities‑only charts for the MVP and a "no chart
   for options yet" note? (Options charting can come later.)
3. Session hours: **regular hours only** (09:30–16:00 ET) or include pre/post‑market
   on the chart?
