import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import { formatMoney, formatPct, pnlClass } from "../lib/format";
import type { Tag, TagStatsResponse } from "../types";

const DEFAULT_KINDS = ["general", "setup", "mistake", "emotion", "process"];

const PRESET_COLORS = ["#0F8A7A", "#1B8A4A", "#C23B3B", "#C47E1A", "#3B6BC2", "#7A3BC2", "#0E1621"];

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(from), to: fmt(to) };
}

function titleCase(value: string) {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function TagsPage() {
  const initial = defaultRange();
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState<TagStatsResponse | null>(null);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [kindFilter, setKindFilter] = useState("all");
  const [name, setName] = useState("");
  const [kind, setKind] = useState("general");
  const [customKind, setCustomKind] = useState("");
  const [color, setColor] = useState("#0F8A7A");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const kindOptions = useMemo(() => {
    const fromApi = stats?.kind_options || [];
    const fromTags = tags.map((t) => t.kind || "general");
    return Array.from(new Set([...DEFAULT_KINDS, ...fromApi, ...fromTags])).sort();
  }, [stats, tags]);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const [tagRes, statRes] = await Promise.all([
        api.tags(),
        api.tagStats(from || undefined, to || undefined),
      ]);
      setTags(tagRes.tags);
      setStats(statRes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tags");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const filteredTagStats = useMemo(() => {
    if (!stats) return [];
    if (kindFilter === "all") return stats.tags;
    return stats.tags.filter((row) => (row.tag.kind || "general") === kindFilter);
  }, [stats, kindFilter]);

  const chartData = useMemo(() => {
    return filteredTagStats
      .filter((row) => row.trade_count > 0)
      .map((row) => ({
        name: row.tag.name,
        net_pnl: row.net_pnl,
        trade_count: row.trade_count,
        color: row.tag.color || "#0F8A7A",
      }));
  }, [filteredTagStats]);

  const kindChartData = useMemo(() => {
    if (!stats?.kinds) return [];
    return stats.kinds
      .filter((row) => row.trade_count > 0)
      .map((row) => ({
        name: titleCase(row.kind),
        kind: row.kind,
        net_pnl: row.net_pnl,
        trade_count: row.trade_count,
      }));
  }, [stats]);

  const resolveKind = () => {
    const custom = customKind.trim().toLowerCase().replace(/\s+/g, "_");
    if (custom) return custom;
    return kind || "general";
  };

  const resolveColor = () => {
    const m = color.trim().match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
    if (!m) return "#0F8A7A";
    let hex = m[1];
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    return `#${hex.toUpperCase()}`;
  };

  const createOrUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const nextKind = resolveKind();
      const nextColor = resolveColor();
      if (editingId != null) {
        await api.updateTag(editingId, { name: name.trim(), kind: nextKind, color: nextColor });
        setMessage("Tag updated.");
      } else {
        await api.createTag(name.trim(), nextKind, nextColor);
        setMessage("Tag created.");
      }
      setName("");
      setKind("general");
      setCustomKind("");
      setColor("#0F8A7A");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setKind("general");
    setCustomKind("");
    setColor("#0F8A7A");
    setMessage("");
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setName(tag.name);
    const k = tag.kind || "general";
    if (DEFAULT_KINDS.includes(k) || kindOptions.includes(k)) {
      setKind(k);
      setCustomKind("");
    } else {
      setKind("general");
      setCustomKind(k);
    }
    setColor(tag.color || "#0F8A7A");
    setMessage(`Editing “${tag.name}” — change name, kind, or color, then Save.`);
    requestAnimationFrame(() => {
      document.getElementById("tag-editor")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const remove = async (tag: Tag) => {
    if (!confirm(`Delete tag “${tag.name}”? It will be removed from all trades.`)) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.deleteTag(tag.id);
      if (editingId === tag.id) resetForm();
      setMessage(`Deleted “${tag.name}”.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const visibleTags = useMemo(() => {
    if (kindFilter === "all") return tags;
    return tags.filter((t) => (t.kind || "general") === kindFilter);
  }, [tags, kindFilter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Tags</h1>
          <p className="mt-1 text-sm text-muted">
            Each tag has a <span className="font-semibold text-ink">kind</span> (setup, mistake, emotion…). Filter and
            compare by kind or individual tag.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted">
            Kind
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="ml-2 rounded-lg border border-line bg-surface px-2 py-1.5 text-sm"
            >
              <option value="all">All kinds</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {titleCase(k)}
                </option>
              ))}
            </select>
          </label>
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
          <button
            type="button"
            onClick={() => {
              const r = defaultRange();
              setFrom(r.from);
              setTo(r.to);
            }}
            className="rounded-lg border border-line px-2 py-1.5 text-xs text-muted hover:text-ink"
          >
            Last 30 days
          </button>
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
            }}
            className="rounded-lg border border-line px-2 py-1.5 text-xs text-muted hover:text-ink"
          >
            All time
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">{error}</div>}
      {message && <div className="rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-sm text-signal">{message}</div>}

      {stats && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Trades in range</div>
            <div className="mt-2 font-mono text-2xl font-semibold">{stats.trade_count}</div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Net P&L</div>
            <div className={`mt-2 font-mono text-2xl font-semibold ${pnlClass(stats.net_pnl)}`}>
              {formatMoney(stats.net_pnl)}
            </div>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Untagged</div>
            <div className="mt-2 font-mono text-2xl font-semibold">{stats.untagged.trade_count}</div>
            <div className={`font-mono text-sm ${pnlClass(stats.untagged.net_pnl)}`}>
              {formatMoney(stats.untagged.net_pnl)}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
          <h2 className="font-display text-lg font-bold">P&L by kind</h2>
          <p className="mt-1 text-sm text-muted">Rolled up across all tags in each kind</p>
          <div className="mt-4 h-64">
            {kindChartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {busy ? "Loading…" : "No tagged trades in this range"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={kindChartData}>
                  <CartesianGrid stroke="#D7DEE6" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={56} />
                  <Tooltip
                    formatter={(value: number, _n, item) => [
                      formatMoney(value),
                      `${item.payload.trade_count} trades`,
                    ]}
                    contentStyle={{ borderRadius: 10, borderColor: "#D7DEE6" }}
                  />
                  <Bar dataKey="net_pnl" radius={[6, 6, 0, 0]}>
                    {kindChartData.map((row) => (
                      <Cell key={row.kind} fill={row.net_pnl >= 0 ? "#0F8A7A" : "#C23B3B"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
          <h2 className="font-display text-lg font-bold">P&L by tag</h2>
          <p className="mt-1 text-sm text-muted">
            {kindFilter === "all" ? "All kinds" : `Kind: ${titleCase(kindFilter)}`}
          </p>
          <div className="mt-4 h-64">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                {busy ? "Loading…" : "No tagged trades for this filter"}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ bottom: 24 }}>
                  <CartesianGrid stroke="#D7DEE6" strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} width={56} />
                  <Tooltip
                    formatter={(value: number, _n, item) => [
                      formatMoney(value),
                      `${item.payload.trade_count} trades`,
                    ]}
                    contentStyle={{ borderRadius: 10, borderColor: "#D7DEE6" }}
                  />
                  <Bar dataKey="net_pnl" radius={[6, 6, 0, 0]}>
                    {chartData.map((row) => (
                      <Cell key={row.name} fill={row.net_pnl >= 0 ? row.color : "#C23B3B"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
            <h2 className="font-display text-lg font-bold">Kind statistics</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="pb-2">Kind</th>
                    <th className="pb-2">Tags</th>
                    <th className="pb-2">Trades</th>
                    <th className="pb-2">Win %</th>
                    <th className="pb-2">Net P&L</th>
                    <th className="pb-2">Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats?.kinds || []).map((row) => (
                    <tr key={row.kind} className="border-t border-line/70">
                      <td className="py-2.5">
                        <button
                          type="button"
                          onClick={() => setKindFilter(row.kind)}
                          className="font-semibold text-signal hover:underline"
                        >
                          {titleCase(row.kind)}
                        </button>
                      </td>
                      <td className="py-2.5 font-mono">{row.tag_count}</td>
                      <td className="py-2.5 font-mono">{row.trade_count}</td>
                      <td className="py-2.5 font-mono">{formatPct(row.trade_win_pct)}</td>
                      <td className={`py-2.5 font-mono font-semibold ${pnlClass(row.net_pnl)}`}>
                        {formatMoney(row.net_pnl)}
                      </td>
                      <td className={`py-2.5 font-mono ${pnlClass(row.avg_pnl)}`}>{formatMoney(row.avg_pnl)}</td>
                    </tr>
                  ))}
                  {(stats?.kinds || []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted">
                        No kind stats yet — create tags with a kind, then label trades.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
            <h2 className="font-display text-lg font-bold">Tag statistics</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="pb-2">Tag</th>
                    <th className="pb-2">Kind</th>
                    <th className="pb-2">Trades</th>
                    <th className="pb-2">Win %</th>
                    <th className="pb-2">Net P&L</th>
                    <th className="pb-2">Avg P&L</th>
                    <th className="pb-2">PF</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {filteredTagStats.map((row) => (
                    <tr key={row.tag.id} className="border-t border-line/70">
                      <td className="py-2.5">
                        <span className="inline-flex items-center gap-2 font-semibold">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ background: row.tag.color || "#0F8A7A" }}
                          />
                          {row.tag.name}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted">
                          {titleCase(row.tag.kind || "general")}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono">{row.trade_count}</td>
                      <td className="py-2.5 font-mono">{formatPct(row.trade_win_pct)}</td>
                      <td className={`py-2.5 font-mono font-semibold ${pnlClass(row.net_pnl)}`}>
                        {formatMoney(row.net_pnl)}
                      </td>
                      <td className={`py-2.5 font-mono ${pnlClass(row.avg_pnl)}`}>{formatMoney(row.avg_pnl)}</td>
                      <td className="py-2.5 font-mono">{row.profit_factor.toFixed(2)}</td>
                      <td className="py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(row.tag)}
                          className="mr-2 text-xs font-semibold text-signal hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(row.tag)}
                          className="text-xs font-semibold text-loss hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tags.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted">
                        No tags yet — create one with a kind, then label trades on{" "}
                        <Link to={`/day/${to || new Date().toISOString().slice(0, 10)}`} className="text-signal underline">
                          Day view
                        </Link>
                        .
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <form
          id="tag-editor"
          onSubmit={createOrUpdate}
          className={`h-fit rounded-xl border bg-surface p-4 shadow-panel ${
            editingId != null ? "border-signal ring-2 ring-signal/20" : "border-line"
          }`}
        >
          <h2 className="font-display text-lg font-bold">{editingId != null ? "Edit tag" : "Create tag"}</h2>
          {editingId != null && (
            <p className="mt-1 text-xs text-muted">Update name, kind, or color for this tag. Changes apply everywhere it’s used.</p>
          )}
          <label className="mt-3 block text-sm">
            Name
            <input
              required
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Good Setup"
            />
          </label>
          <label className="mt-3 block text-sm">
            Kind
            <select
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setCustomKind("");
              }}
            >
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {titleCase(k)}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 block text-sm">
            Or custom kind
            <input
              className="mt-1 w-full rounded-lg border border-line px-3 py-2"
              value={customKind}
              onChange={(e) => setCustomKind(e.target.value)}
              placeholder="e.g. news_play"
            />
            <span className="mt-1 block text-xs text-muted">
              Custom kind overrides the dropdown when filled (saved as lowercase_with_underscores).
            </span>
          </label>
          <div className="mt-3">
            <div className="text-sm">Color</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 ${color === c ? "border-ink" : "border-transparent"}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
              <input
                type="color"
                value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0F8A7A"}
                onChange={(e) => setColor(e.target.value.toUpperCase())}
                className="h-7 w-10 cursor-pointer rounded border border-line bg-transparent"
                title="Pick a color"
              />
              <input
                type="text"
                value={color}
                onChange={(e) => {
                  let v = e.target.value.trim();
                  if (v && !v.startsWith("#")) v = `#${v}`;
                  setColor(v);
                }}
                onBlur={() => {
                  const m = color.match(/^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
                  if (!m) {
                    setColor("#0F8A7A");
                    return;
                  }
                  let hex = m[1];
                  if (hex.length === 3) {
                    hex = hex
                      .split("")
                      .map((ch) => ch + ch)
                      .join("");
                  }
                  setColor(`#${hex.toUpperCase()}`);
                }}
                spellCheck={false}
                placeholder="#FBE709"
                className="w-28 rounded-lg border border-line px-2 py-1.5 font-mono text-sm uppercase"
                aria-label="Hex color"
              />
            </div>
            <span className="mt-1 block text-xs text-muted">Paste a hex code (e.g. #fbe709) or use the picker.</span>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {editingId != null ? "Save changes" : "Create tag"}
            </button>
            {editingId != null && (
              <button type="button" onClick={resetForm} className="rounded-lg border border-line px-4 py-2 text-sm">
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-line bg-surface p-4 shadow-panel">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-bold">Manage tags</h2>
            <p className="mt-1 text-sm text-muted">Edit name, kind, or color — or delete a tag from all trades.</p>
          </div>
          {editingId != null && (
            <button type="button" onClick={resetForm} className="text-xs font-semibold text-signal hover:underline">
              Stop editing
            </button>
          )}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pb-2">Tag</th>
                <th className="pb-2">Kind</th>
                <th className="pb-2">Color</th>
                <th className="pb-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTags.map((tag) => (
                <tr
                  key={tag.id}
                  className={`border-t border-line/70 ${editingId === tag.id ? "bg-signal/5" : ""}`}
                >
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{ background: tag.color || "#0F8A7A" }}
                      />
                      {tag.name}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="rounded-full bg-paper px-2 py-0.5 text-xs font-semibold text-muted">
                      {titleCase(tag.kind || "general")}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <span className="inline-flex items-center gap-2 font-mono text-xs text-muted">
                      <span
                        className="inline-block h-5 w-5 rounded border border-line"
                        style={{ background: tag.color || "#0F8A7A" }}
                      />
                      {tag.color || "#0F8A7A"}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => startEdit(tag)}
                      disabled={busy}
                      className="mr-3 text-xs font-semibold text-signal hover:underline disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(tag)}
                      disabled={busy}
                      className="text-xs font-semibold text-loss hover:underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {visibleTags.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted">
                    {tags.length === 0
                      ? "No tags yet — create one in the form above."
                      : "No tags match this kind filter."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
