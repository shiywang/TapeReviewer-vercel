import { useEffect, useState } from "react";
import type { Kpis } from "../types";
import { formatMoney, formatPct, pnlClass } from "../lib/format";

function useCountUp(value: number, enabled: boolean) {
  const [display, setDisplay] = useState(enabled ? 0 : value);
  useEffect(() => {
    if (!enabled) {
      setDisplay(value);
      return;
    }
    const start = performance.now();
    const from = 0;
    const duration = 400;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (value - from) * t);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, enabled]);
  return display;
}

export default function KpiStrip({ kpis, animate = true }: { kpis: Kpis; animate?: boolean }) {
  const net = useCountUp(kpis.net_pnl, animate);
  const items = [
    { label: "Net P&L", value: formatMoney(net), className: pnlClass(kpis.net_pnl) },
    { label: "Trade win %", value: formatPct(kpis.trade_win_pct), className: "text-ink" },
    { label: "Profit factor", value: kpis.profit_factor.toFixed(2), className: "text-ink" },
    { label: "Day win %", value: formatPct(kpis.day_win_pct), className: "text-ink" },
    { label: "Avg win", value: formatMoney(kpis.avg_win), className: "text-profit" },
    { label: "Avg loss", value: formatMoney(kpis.avg_loss), className: "text-loss" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div key={item.label} className="rounded-xl border border-line bg-surface p-4 shadow-panel animate-count">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{item.label}</div>
          <div className={`mt-2 font-mono text-xl font-semibold tabular-nums ${item.className}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}
