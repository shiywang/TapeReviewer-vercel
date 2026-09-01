import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ChartPlaceholder from "../components/ChartPlaceholder";
import VideoLinkModal from "../components/VideoLinkModal";
import SessionVerdict from "../components/SessionVerdict";
import TapeStrip from "../components/TapeStrip";
import VideoPlayer from "../components/VideoPlayer";
import { api } from "../lib/api";
import { formatDateLabel, formatMoney, formatPct, formatTime, pnlClass } from "../lib/format";
import type { DayResponse, Tag, Trade, Verdict } from "../types";

export default function DayPage({ refreshKey }: { refreshKey: number }) {
  const { date = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DayResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = async () => {
    if (!date) return;
    try {
      const [day, tagRes] = await Promise.all([api.day(date), api.tags()]);
      setData(day);
      setTags(tagRes.tags);
      setError("");
      const q = params.get("trade");
      if (q) setSelectedId(Number(q));
      else if (day.trades.length) setSelectedId((prev) => prev ?? day.trades[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load day");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, refreshKey]);

  const selected: Trade | null = useMemo(
    () => data?.trades.find((t) => t.id === selectedId) || null,
    [data, selectedId],
  );

  const selectTrade = (id: number) => {
    setSelectedId(id);
    navigate(`/day/${date}?trade=${id}`, { replace: true });
  };

  const updateVerdict = async (verdict: Verdict) => {
    if (!date) return;
    const next = await api.patchDayJournal(date, { verdict });
    setData(next);
  };

  const saveTradeNotes = async (notes: string) => {
    if (!selected) return;
    setSavingNote(true);
    try {
      await api.updateTrade(selected.id, { notes });
      await load();
    } finally {
      setSavingNote(false);
    }
  };

  const toggleReviewed = async () => {
    if (!selected) return;
    await api.updateTrade(selected.id, { reviewed: !selected.reviewed });
    await load();
  };

  const toggleTag = async (tagId: number) => {
    if (!selected) return;
    const current = new Set((selected.tags || []).map((t) => t.id));
    if (current.has(tagId)) current.delete(tagId);
    else current.add(tagId);
    await api.updateTrade(selected.id, { tag_ids: [...current] });
    await load();
  };

  const setMarkerNow = async () => {
    if (!selected) return;
    const sec = selected.video_marker_sec ?? 0;
    const next = prompt("Seek marker (seconds into this trade’s video)", String(sec));
    if (next == null) return;
    await api.setMarker(selected.id, Number(next));
    await load();
  };

  if (!date) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-xs font-semibold text-signal hover:underline">
            ← Dashboard
          </Link>
          <h1 className="mt-1 font-display text-3xl font-bold">{formatDateLabel(date)}</h1>
        </div>
        {data && (
          <div className="text-right">
            <div className={`font-mono text-2xl font-semibold ${pnlClass(data.summary.net_pnl)}`}>
              {formatMoney(data.summary.net_pnl)}
            </div>
            <div className="text-xs text-muted">
              {data.summary.trade_count} trades · {formatPct(data.summary.trade_win_pct)} win · PF{" "}
              {data.summary.profit_factor.toFixed(2)}
            </div>
          </div>
        )}
      </div>

      {error && <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">{error}</div>}

      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted">Session verdict</span>
            <SessionVerdict value={data.journal.verdict} onChange={updateVerdict} />
          </div>

          <TapeStrip trades={data.trades} selectedId={selectedId} onSelect={selectTrade} />

          <div className="grid gap-4 xl:grid-cols-[240px_1.4fr_300px]">
            {/* Day rail */}
            <aside className="rounded-xl border border-line bg-surface p-3 shadow-panel">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Trades</div>
              <div className="space-y-1">
                {data.trades.map((t) => {
                  const active = t.id === selectedId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => selectTrade(t.id)}
                      className={`relative flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition ${
                        active ? "bg-signal/10" : "hover:bg-paper"
                      }`}
                    >
                      {active && <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r bg-signal animate-accent" />}
                      <div>
                        <div className="flex items-center gap-1.5 font-semibold">
                          {t.symbol}
                          {t.video_path && (
                            <span className="rounded bg-signal/15 px-1 py-0.5 text-[9px] font-bold uppercase text-signal">
                              vid
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-muted">{formatTime(t.opened_at)}</div>
                      </div>
                      <div className={`font-mono text-sm font-semibold ${pnlClass(t.net_pnl)}`}>
                        {formatMoney(t.net_pnl)}
                      </div>
                    </button>
                  );
                })}
                {data.trades.length === 0 && (
                  <p className="px-2 py-6 text-center text-sm text-muted">No trades. Import CSV or add manually.</p>
                )}
              </div>
            </aside>

            {/* Workbench */}
            <section className="space-y-3">
              <VideoPlayer
                key={selected?.id ?? "none"}
                relativePath={selected?.video_path || null}
                seekSec={selected?.video_marker_sec}
                label={selected ? `${selected.symbol} · ${formatTime(selected.opened_at)}` : undefined}
                disabled={!selected}
                onLink={() => {
                  if (!selected) return;
                  setPickerOpen(true);
                }}
                onClear={async () => {
                  if (!selected) return;
                  await api.setTradeVideo(selected.id, null);
                  await load();
                }}
              />
              <ChartPlaceholder trade={selected} />
            </section>

            {/* Stats / notes */}
            <aside className="space-y-3">
              <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
                {selected ? (
                  <>
                    <div className={`font-mono text-2xl font-semibold ${pnlClass(selected.net_pnl)}`}>
                      {formatMoney(selected.net_pnl)}
                    </div>
                    <div className="mt-1 text-sm text-muted">
                      {selected.symbol} · {selected.side}
                    </div>
                    <dl className="mt-4 space-y-2 text-sm">
                      <Row label="Shares" value={String(selected.qty)} />
                      <Row label="Fees" value={formatMoney(selected.fees)} />
                      <Row label="Gross P&L" value={formatMoney(selected.gross_pnl)} />
                      <Row label="Net ROI" value={formatPct(selected.net_roi)} />
                      <Row label="Avg entry" value={`$${selected.avg_entry}`} />
                      <Row label="Avg exit" value={`$${selected.avg_exit}`} />
                      <Row label="Entry" value={formatTime(selected.opened_at)} />
                      <Row label="Exit" value={formatTime(selected.closed_at)} />
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={toggleReviewed}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selected.reviewed ? "bg-signal text-white" : "bg-paper text-muted"
                        }`}
                      >
                        {selected.reviewed ? "Reviewed ✓" : "Mark reviewed"}
                      </button>
                      <button
                        type="button"
                        onClick={setMarkerNow}
                        className="rounded-full bg-paper px-3 py-1 text-xs font-semibold text-muted"
                      >
                        Set video marker
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selected) return;
                          if (!confirm(`Delete ${selected.symbol} trade (${formatMoney(selected.net_pnl)})?`)) return;
                          await api.deleteTrade(selected.id);
                          setSelectedId(null);
                          await load();
                        }}
                        className="rounded-full border border-loss/40 px-3 py-1 text-xs font-semibold text-loss hover:bg-loss/5"
                      >
                        Delete trade
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted">Select a trade to inspect stats.</p>
                )}
              </div>

              <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">Tags</div>
                  <Link to="/tags" className="text-[11px] font-semibold text-signal hover:underline">
                    Manage
                  </Link>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {tags.map((tag) => {
                    const on = !!selected?.tags?.some((t) => t.id === tag.id);
                    const c = tag.color || "#0F8A7A";
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        disabled={!selected}
                        onClick={() => toggleTag(tag.id)}
                        className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold"
                        style={
                          on
                            ? { borderColor: c, background: `${c}22`, color: c }
                            : { borderColor: "#D7DEE6", color: "#5B6B7C" }
                        }
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: c }} />
                        {tag.name}
                        <span className="opacity-70">· {tag.kind || "general"}</span>
                      </button>
                    );
                  })}
                  {tags.length === 0 && (
                    <p className="text-xs text-muted">
                      No tags yet.{" "}
                      <Link to="/tags" className="text-signal underline">
                        Create tags
                      </Link>
                    </p>
                  )}
                </div>
                {selected && (
                  <form
                    className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const nameInput = form.elements.namedItem("quickTag") as HTMLInputElement;
                      const kindInput = form.elements.namedItem("quickKind") as HTMLSelectElement;
                      const value = nameInput.value.trim();
                      if (!value) return;
                      const created = await api.createTag(value, kindInput.value || "general");
                      await api.updateTrade(selected.id, {
                        tag_ids: [...(selected.tags || []).map((t) => t.id), created.id],
                      });
                      nameInput.value = "";
                      await load();
                    }}
                  >
                    <input
                      name="quickTag"
                      placeholder="Tag name…"
                      className="min-w-0 rounded-lg border border-line px-2 py-1.5 text-xs"
                    />
                    <select
                      name="quickKind"
                      defaultValue="general"
                      className="rounded-lg border border-line bg-surface px-2 py-1.5 text-xs"
                    >
                      <option value="general">general</option>
                      <option value="setup">setup</option>
                      <option value="mistake">mistake</option>
                      <option value="emotion">emotion</option>
                      <option value="process">process</option>
                    </select>
                    <button type="submit" className="rounded-lg bg-paper px-2 py-1.5 text-xs font-semibold text-signal">
                      Add
                    </button>
                  </form>
                )}
              </div>

              <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted">Trade note</div>
                <textarea
                  key={selected?.id || "none"}
                  defaultValue={selected?.notes || ""}
                  disabled={!selected}
                  rows={5}
                  placeholder="Why did you take this trade? Did you follow your rules? Note emotions, patterns, management lessons."
                  className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm"
                  onBlur={(e) => {
                    if (selected && e.target.value !== selected.notes) saveTradeNotes(e.target.value);
                  }}
                />
                <p className="mt-1 text-[11px] text-muted">{savingNote ? "Saving…" : "Auto-saves on blur"}</p>
              </div>
            </aside>
          </div>
        </>
      )}

      <VideoLinkModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={async (path) => {
          if (!selected) return;
          await api.setTradeVideo(selected.id, path);
          await load();
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>
  );
}
