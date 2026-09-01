import { useNavigate } from "react-router-dom";
import type { CalendarResponse } from "../types";
import { formatMoney, pnlClass } from "../lib/format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function PnLCalendar({
  data,
  onMonthChange,
}: {
  data: CalendarResponse;
  onMonthChange: (year: number, month: number) => void;
}) {
  const navigate = useNavigate();
  const monthLabel = new Date(data.year, data.month - 1, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  const prev = () => {
    const d = new Date(data.year, data.month - 2, 1);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  };
  const next = () => {
    const d = new Date(data.year, data.month, 1);
    onMonthChange(d.getFullYear(), d.getMonth() + 1);
  };

  const blanks = Array.from({ length: data.start_weekday });

  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">P&L Calendar</h2>
          <p className={`mt-1 font-mono text-sm ${pnlClass(data.month_net_pnl)}`}>
            Month {formatMoney(data.month_net_pnl)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={prev} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">
            ←
          </button>
          <span className="min-w-36 text-center text-sm font-semibold">{monthLabel}</span>
          <button type="button" onClick={next} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">
            →
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {blanks.map((_, i) => (
              <div key={`b-${i}`} className="min-h-20 rounded-lg bg-transparent" />
            ))}
            {data.cells.map((cell) => {
              const positive = cell.net_pnl > 0;
              const negative = cell.net_pnl < 0;
              const alpha = 0.12 + cell.intensity * 0.35;
              const bg = positive
                ? `rgba(27, 138, 74, ${alpha})`
                : negative
                  ? `rgba(194, 59, 59, ${alpha})`
                  : "transparent";
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => navigate(`/day/${cell.date}`)}
                  title={`${cell.trade_count} trades · ${cell.win_pct.toFixed(0)}% win`}
                  className="min-h-20 rounded-lg border border-line/80 p-1.5 text-left transition hover:-translate-y-0.5 hover:border-signal/40 hover:shadow-sm"
                  style={{ background: bg }}
                >
                  <div className="text-[11px] font-semibold text-muted">{cell.day}</div>
                  {cell.trade_count > 0 ? (
                    <>
                      <div className={`mt-1 font-mono text-xs font-semibold ${pnlClass(cell.net_pnl)}`}>
                        {formatMoney(cell.net_pnl, 0)}
                      </div>
                      <div className="mt-1 flex gap-0.5">
                        {Array.from({ length: Math.min(cell.trade_count, 5) }).map((_, i) => (
                          <span key={i} className={`h-1.5 w-1.5 rounded-full ${positive ? "bg-profit" : "bg-loss"}`} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 text-[10px] text-muted/60">—</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="hidden w-28 shrink-0 flex-col gap-1 sm:flex">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">Weeks</div>
          {data.weeks.map((w) => (
            <div key={w.week} className="rounded-lg border border-line bg-paper/60 px-2 py-2">
              <div className="text-[11px] text-muted">Week {w.week}</div>
              <div className={`font-mono text-xs font-semibold ${pnlClass(w.net_pnl)}`}>{formatMoney(w.net_pnl, 0)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
