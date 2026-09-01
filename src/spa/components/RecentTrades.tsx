import { Link } from "react-router-dom";
import type { Trade } from "../types";
import { formatMoney, pnlClass } from "../lib/format";

export default function RecentTrades({
  trades,
  onlyUnreviewed,
  onToggleFilter,
}: {
  trades: Trade[];
  onlyUnreviewed: boolean;
  onToggleFilter: () => void;
}) {
  const visible = onlyUnreviewed ? trades.filter((t) => !t.reviewed) : trades;

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Recent trades</h2>
        <button
          type="button"
          onClick={onToggleFilter}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            onlyUnreviewed ? "bg-signal text-white" : "bg-paper text-muted"
          }`}
        >
          {onlyUnreviewed ? "Unreviewed" : "All"}
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="pb-2 font-semibold">Date</th>
              <th className="pb-2 font-semibold">Symbol</th>
              <th className="pb-2 font-semibold">Side</th>
              <th className="pb-2 font-semibold">P&L</th>
              <th className="pb-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((t) => {
              const day = t.closed_at.slice(0, 10);
              return (
                <tr key={t.id} className="border-t border-line/70">
                  <td className="py-2.5 font-mono text-xs text-muted">{day}</td>
                  <td className="py-2.5">
                    <Link to={`/day/${day}?trade=${t.id}`} className="font-semibold text-ink hover:text-signal">
                      {t.symbol}
                    </Link>
                  </td>
                  <td className="py-2.5 text-muted">{t.side}</td>
                  <td className={`py-2.5 font-mono font-semibold ${pnlClass(t.net_pnl)}`}>{formatMoney(t.net_pnl)}</td>
                  <td className="py-2.5">
                    {t.reviewed ? (
                      <span className="rounded-full bg-signal/10 px-2 py-0.5 text-xs font-semibold text-signal">
                        Reviewed
                      </span>
                    ) : (
                      <span className="rounded-full bg-warn/10 px-2 py-0.5 text-xs font-semibold text-warn">Open</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted">
                  No trades to show
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
