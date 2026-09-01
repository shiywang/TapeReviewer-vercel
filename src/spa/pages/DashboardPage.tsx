import { useEffect, useState } from "react";
import CumulativeChart from "../components/CumulativeChart";
import KpiStrip from "../components/KpiStrip";
import PnLCalendar from "../components/PnLCalendar";
import RecentTrades from "../components/RecentTrades";
import { api } from "../lib/api";
import type { CalendarResponse, DashboardResponse } from "../types";

export default function DashboardPage({ refreshKey }: { refreshKey: number }) {
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [cal, setCal] = useState<CalendarResponse | null>(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [onlyUnreviewed, setOnlyUnreviewed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([api.dashboard(from || undefined, to || undefined), api.calendar(year, month)])
      .then(([d, c]) => {
        setDash(d);
        setCal(c);
        setError("");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [year, month, from, to, refreshKey]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">
            {dash?.account.name || "Main"} · calendar-first review
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted">
            From
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="ml-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs text-muted">
            To
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="ml-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          {(from || to) && (
            <button
              type="button"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
              className="rounded-lg border border-line px-2 py-1.5 text-xs text-muted hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">{error}</div>}
      {loading && !dash && <div className="text-sm text-muted">Loading dashboard…</div>}

      {dash && (
        <>
          <KpiStrip kpis={dash.kpis} />
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            {cal && (
              <PnLCalendar
                data={cal}
                onMonthChange={(y, m) => {
                  setYear(y);
                  setMonth(m);
                }}
              />
            )}
            <CumulativeChart data={dash.cumulative} />
          </div>
          <RecentTrades
            trades={dash.recent_trades}
            onlyUnreviewed={onlyUnreviewed}
            onToggleFilter={() => setOnlyUnreviewed((v) => !v)}
          />
        </>
      )}
    </div>
  );
}
