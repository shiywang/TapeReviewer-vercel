import type { Trade } from "../types";
import { formatTime } from "../lib/format";

export default function ChartPlaceholder({ trade }: { trade: Trade | null }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Market chart</h3>
        <span className="rounded-full bg-line/60 px-2 py-0.5 text-[11px] font-semibold text-muted">Coming later</span>
      </div>
      <p className="mt-1 text-xs text-muted">Placeholder — candlesticks will plug in here later.</p>
      <div className="relative mt-4 h-24 overflow-hidden rounded-lg border border-line bg-surface">
        <div className="absolute inset-y-3 left-[18%] right-[42%] rounded bg-signal/15" />
        <div className="absolute bottom-2 left-[18%] font-mono text-[10px] text-signal">
          {trade ? `Entry ${formatTime(trade.opened_at)}` : "Entry"}
        </div>
        <div className="absolute bottom-2 right-[42%] font-mono text-[10px] text-signal">
          {trade ? `Exit ${formatTime(trade.closed_at)}` : "Exit"}
        </div>
        <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-line" />
      </div>
    </div>
  );
}
