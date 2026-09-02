import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  createSeriesMarkers,
  LineStyle,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { api } from "../lib/api";
import type { Trade } from "../types";
import { formatTime } from "../lib/format";
import { SessionBands, type SessionBand, type SessionLine } from "./sessionBandsPrimitive";

// Options symbols (OCC style, e.g. "SPXW  260413C06850000") aren't equity tickers;
// the MVP charts equities only.
function isOption(symbol: string): boolean {
  return /\s/.test(symbol) || /\d{6}[CP]\d/.test(symbol);
}

// Naive ET timestamp string ("2026-09-01T09:39:15") → the ET wall-clock expressed
// as a UNIX second (i.e. parsed as if UTC). Bars are shifted the same way below, so
// markers land on the right candle and the axis reads ET.
function etWallSec(naive: string): number {
  return Math.floor(Date.parse(naive.replace(/Z?$/, "") + "Z") / 1000);
}

// ET UTC-offset (seconds, negative) for a given instant — shifts real UTC bar times
// to ET wall-clock so lightweight-charts (which renders in UTC) shows ET.
function etOffsetSec(unixSec: number): number {
  const ms = unixSec * 1000;
  const u = Date.parse(new Date(ms).toLocaleString("en-US", { timeZone: "UTC" }));
  const e = Date.parse(new Date(ms).toLocaleString("en-US", { timeZone: "America/New_York" }));
  return Math.round((e - u) / 1000);
}

export default function MarketChart({ trade, date }: { trade: Trade | null; date: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string>("");
  const [barCount, setBarCount] = useState(0);
  const [hasExtended, setHasExtended] = useState(false);

  useEffect(() => {
    if (!trade || !containerRef.current) return;
    if (isOption(trade.symbol)) {
      setStatus("No chart for options yet — equities only.");
      setBarCount(0);
      return;
    }

    let chart: IChartApi | null = null;
    let disposed = false;
    setStatus("Loading chart…");
    setBarCount(0);
    setHasExtended(false);

    api
      .ohlc(trade.symbol, date)
      .then(({ bars }) => {
        if (disposed || !containerRef.current) return;
        if (!bars.length) {
          setStatus("No bars for this day (data is available after market close).");
          return;
        }
        const off = etOffsetSec(bars[Math.floor(bars.length / 2)].t);

        chart = createChart(containerRef.current, {
          height: 660,
          autoSize: false,
          width: containerRef.current.clientWidth,
          layout: { background: { color: "transparent" }, textColor: "#5B6B7C", fontSize: 11 },
          grid: { vertLines: { color: "#EEF2F6" }, horzLines: { color: "#EEF2F6" } },
          rightPriceScale: { borderColor: "#D7DEE6" },
          timeScale: { borderColor: "#D7DEE6", timeVisible: true, secondsVisible: false },
          crosshair: { mode: 0 },
        });

        const series = chart.addSeries(CandlestickSeries, {
          upColor: "#0F9D6B",
          downColor: "#E5484D",
          borderUpColor: "#0F9D6B",
          borderDownColor: "#E5484D",
          wickUpColor: "#0F9D6B",
          wickDownColor: "#E5484D",
        });

        series.setData(
          bars.map((b) => ({
            time: (b.t + off) as UTCTimestamp,
            open: b.o,
            high: b.h,
            low: b.l,
            close: b.c,
          })),
        );

        // Session VWAP (cumulative typical-price × volume, anchored at the first
        // bar) and EMA(9) of close — both computed from the 1-min bars.
        const k = 2 / (9 + 1);
        let cumPV = 0;
        let cumV = 0;
        let ema = bars[0].c;
        const vwapData: { time: UTCTimestamp; value: number }[] = [];
        const emaData: { time: UTCTimestamp; value: number }[] = [];
        bars.forEach((b, i) => {
          const time = (b.t + off) as UTCTimestamp;
          const typical = (b.h + b.l + b.c) / 3;
          cumPV += typical * b.v;
          cumV += b.v;
          if (cumV > 0) vwapData.push({ time, value: cumPV / cumV });
          ema = i === 0 ? b.c : b.c * k + ema * (1 - k);
          emaData.push({ time, value: ema });
        });

        const vwapSeries = chart.addSeries(LineSeries, {
          color: "#111827",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        vwapSeries.setData(vwapData);

        const emaSeries = chart.addSeries(LineSeries, {
          color: "#2563EB",
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        emaSeries.setData(emaData);

        // Shade pre/post-market regions and mark the 09:30 / 16:00 ET boundaries.
        // Times share the bars' "ET wall-clock as UTC" basis (etWallSec).
        const dayOpen = etWallSec(`${date}T09:30:00`) as UTCTimestamp;
        const dayClose = etWallSec(`${date}T16:00:00`) as UTCTimestamp;
        const firstT = (bars[0].t + off) as UTCTimestamp;
        const lastT = (bars[bars.length - 1].t + off) as UTCTimestamp;
        const bands: SessionBand[] = [];
        if (firstT < dayOpen) bands.push({ from: firstT, to: dayOpen, color: "rgba(91,107,124,0.07)" });
        if (lastT > dayClose) bands.push({ from: dayClose, to: lastT, color: "rgba(91,107,124,0.07)" });
        const lines: SessionLine[] = [];
        if (firstT < dayOpen) lines.push({ time: dayOpen, color: "rgba(91,107,124,0.45)" });
        if (lastT > dayClose) lines.push({ time: dayClose, color: "rgba(91,107,124,0.45)" });
        if (bands.length || lines.length) series.attachPrimitive(new SessionBands(bands, lines));
        setHasExtended(bands.length > 0);

        // Entry/exit markers, snapped to the minute so they sit on a candle.
        const entryT = (Math.floor(etWallSec(trade.opened_at) / 60) * 60) as UTCTimestamp;
        const exitT = (Math.floor(etWallSec(trade.closed_at) / 60) * 60) as UTCTimestamp;
        const entryUp = trade.side === "LONG";
        createSeriesMarkers(series, [
          {
            time: entryT,
            position: entryUp ? "belowBar" : "aboveBar",
            color: "#0F9D6B",
            shape: entryUp ? "arrowUp" : "arrowDown",
            text: `Entry ${trade.avg_entry}`,
          },
          {
            time: exitT,
            position: entryUp ? "aboveBar" : "belowBar",
            color: "#E5484D",
            shape: entryUp ? "arrowDown" : "arrowUp",
            text: `Exit ${trade.avg_exit}`,
          },
        ]);

        series.createPriceLine({
          price: trade.avg_entry,
          color: "#0F9D6B",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: true,
          title: "entry",
        });
        series.createPriceLine({
          price: trade.avg_exit,
          color: "#E5484D",
          lineStyle: LineStyle.Dashed,
          lineWidth: 1,
          axisLabelVisible: true,
          title: "exit",
        });

        // Zoom to the trade window ±30 min.
        chart.timeScale().setVisibleRange({
          from: (entryT - 1800) as UTCTimestamp,
          to: (exitT + 1800) as UTCTimestamp,
        });

        setStatus("");
        setBarCount(bars.length);
      })
      .catch((err) => {
        if (!disposed) setStatus(err instanceof Error ? err.message : "Chart failed to load");
      });

    const ro = new ResizeObserver(() => {
      if (chart && containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    });
    if (containerRef.current) ro.observe(containerRef.current);

    return () => {
      disposed = true;
      ro.disconnect();
      chart?.remove();
    };
  }, [trade, date]);

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {trade ? `${trade.symbol} · 1-min` : "Market chart"}
        </h3>
        <div className="flex items-center gap-2">
          {trade && (
            <span className="font-mono text-[11px] text-muted">
              {formatTime(trade.opened_at)} → {formatTime(trade.closed_at)}
            </span>
          )}
          {/* TradingView attribution (required by Lightweight Charts terms). */}
          <a
            href="https://www.tradingview.com/lightweight-charts/"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] text-muted hover:text-signal"
          >
            charts by TradingView
          </a>
        </div>
      </div>
      {!trade ? (
        <p className="mt-3 text-sm text-muted">Select a trade to see its chart.</p>
      ) : (
        <>
          <div ref={containerRef} className="mt-3 w-full" style={{ height: 660 }} />
          {status && <p className="mt-2 text-xs text-muted">{status}</p>}
          {barCount > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              {barCount} bars · <span style={{ color: "#111827" }}>VWAP</span> ·{" "}
              <span style={{ color: "#2563EB" }}>EMA9</span> · green/red dashed = avg entry/exit
              {hasExtended && " · shaded = pre/post-market (09:30–16:00 ET lines)"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
