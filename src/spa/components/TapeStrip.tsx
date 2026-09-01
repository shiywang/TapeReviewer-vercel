import type { Trade } from "../types";
import { formatTime } from "../lib/format";

export default function TapeStrip({
  trades,
  selectedId,
  onSelect,
}: {
  trades: Trade[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-paper/60 px-4 py-3 text-sm text-muted">
        No trades on the tape for this day.
      </div>
    );
  }

  const times = trades.map((t) => new Date(t.opened_at).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 1);

  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-panel">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Tape strip</span>
        <span className="font-mono text-[11px] text-muted">
          {formatTime(trades[0].opened_at)} → {formatTime(trades[trades.length - 1].closed_at)}
        </span>
      </div>
      <div className="relative h-10 rounded-lg bg-paper">
        <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 bg-line" />
        {trades.map((t) => {
          const left = ((new Date(t.opened_at).getTime() - min) / span) * 100;
          const win = t.net_pnl >= 0;
          const selected = t.id === selectedId;
          return (
            <button
              key={t.id}
              type="button"
              title={`${t.symbol} ${t.net_pnl}`}
              onClick={() => onSelect(t.id)}
              className={`absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 transition ${
                win ? "bg-profit border-profit" : "bg-loss border-loss"
              } ${selected ? "scale-125 ring-2 ring-signal ring-offset-2" : "hover:scale-110"}`}
              style={{ left: `${Math.min(98, Math.max(2, left))}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}
