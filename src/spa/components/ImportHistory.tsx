import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatMoney, pnlClass } from "../lib/format";
import type { ImportBatch } from "../types";

export default function ImportHistory({ onChanged }: { onChanged?: () => void }) {
  const [imports, setImports] = useState<ImportBatch[]>([]);
  const [counts, setCounts] = useState({ batched: 0, orphan_imported: 0, total_imported: 0 });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.listImports();
      setImports(res.imports);
      setCounts(res.counts || { batched: 0, orphan_imported: 0, total_imported: 0 });
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load imports");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number, label: string) => {
    if (!confirm(`Delete import batch #${id} (${label}) and all its trades?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await api.deleteImport(id);
      setMessage(`Deleted batch #${id} · ${res.deleted_trades} trades removed`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const clearAll = async () => {
    if (counts.total_imported === 0 && imports.length === 0) return;
    if (
      !confirm(
        `Clear ALL imported trades (${counts.total_imported}) and ${imports.length} batch record(s)? This cannot be undone.`,
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await api.clearImports();
      setMessage(`Cleared ${res.deleted_batches} batches · ${res.deleted_trades} trades removed`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-5 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Delete imports</h2>
          <p className="text-sm text-muted">
            Remove a whole CSV/DAS batch, or clear every imported trade. Manual trades are kept.
          </p>
          <p className="mt-1 font-mono text-xs text-muted">
            {counts.total_imported} imported trades
            {counts.orphan_imported > 0 ? ` (${counts.orphan_imported} without batch id)` : ""}
          </p>
        </div>
        <button
          type="button"
          disabled={busy || (imports.length === 0 && counts.total_imported === 0)}
          onClick={clearAll}
          className="rounded-lg border border-loss/40 px-3 py-1.5 text-sm font-semibold text-loss hover:bg-loss/5 disabled:opacity-40"
        >
          Clear all imported trades
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-loss">{error}</p>}
      {message && <p className="mt-3 text-sm text-signal">{message}</p>}

      {imports.length === 0 ? (
        <p className="mt-4 text-sm text-muted">
          {counts.total_imported > 0
            ? "No batch records, but imported trades still exist — use Clear all imported trades."
            : "No import batches yet."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase text-muted">
              <tr>
                <th className="pb-2">Batch</th>
                <th className="pb-2">Source</th>
                <th className="pb-2">Files</th>
                <th className="pb-2">Trades</th>
                <th className="pb-2">P&L</th>
                <th className="pb-2">When</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {imports.map((batch) => (
                <tr key={batch.id} className="border-t border-line/70">
                  <td className="py-2 font-mono text-xs">#{batch.id}</td>
                  <td className="py-2 uppercase text-muted">{batch.source}</td>
                  <td className="max-w-xs truncate py-2 font-mono text-xs" title={batch.label}>
                    {batch.label}
                  </td>
                  <td className="py-2 font-mono">{batch.live_trade_count ?? batch.trade_count}</td>
                  <td className={`py-2 font-mono font-semibold ${pnlClass(batch.net_pnl)}`}>
                    {formatMoney(batch.net_pnl)}
                  </td>
                  <td className="py-2 font-mono text-xs text-muted">{batch.created_at}</td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => remove(batch.id, batch.label)}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-loss hover:bg-loss/5"
                    >
                      Delete batch
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
