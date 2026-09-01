import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { formatMoney, pnlClass } from "../lib/format";
import type { DasImportPreview } from "../types";

const empty = {
  symbol: "",
  side: "LONG",
  opened_at: "",
  closed_at: "",
  qty: "100",
  avg_entry: "",
  avg_exit: "",
  fees: "0",
  notes: "",
};

type Tab = "manual" | "das";

export default function TradeFormModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>("das");
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<DasImportPreview | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState("");

  if (!open) return null;

  const reset = () => {
    setForm(empty);
    setError("");
    setResult("");
    setPreview(null);
    setSelected(new Set());
    setSaving(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.createTrade({
        symbol: form.symbol,
        side: form.side,
        opened_at: form.opened_at.length === 16 ? `${form.opened_at}:00` : form.opened_at,
        closed_at: form.closed_at.length === 16 ? `${form.closed_at}:00` : form.closed_at,
        qty: Number(form.qty),
        avg_entry: Number(form.avg_entry),
        avg_exit: Number(form.avg_exit),
        fees: Number(form.fees || 0),
        notes: form.notes,
      });
      reset();
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const onDasFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setSaving(true);
    setError("");
    setResult("");
    try {
      const files = Array.from(fileList);
      const res = await api.importDas(files);
      setPreview(res);
      setSelected(new Set(res.trades.filter((t) => t.valid).map((t) => t.index)));
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : "DAS import failed");
    } finally {
      setSaving(false);
    }
  };

  const commitDas = async () => {
    if (!preview) return;
    if (preview.already_imported) {
      setError(
        `Already imported as batch #${preview.existing_batch?.id}. Delete that import on the Import page first.`,
      );
      return;
    }
    const trades = preview.trades.filter((t) => selected.has(t.index) && t.valid);
    if (!trades.length) {
      setError("No trades selected");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await api.commitDas({
        fingerprint: preview.fingerprint,
        trade_fingerprint: preview.trade_fingerprint,
        label: preview.label,
        trades: trades.map((t) => ({
          symbol: t.symbol,
          side: t.side,
          opened_at: t.opened_at,
          closed_at: t.closed_at,
          qty: t.qty,
          avg_entry: t.avg_entry,
          avg_exit: t.avg_exit,
          fees: t.fees,
          gross_pnl: t.gross_pnl,
          net_pnl: t.net_pnl,
          net_roi: t.net_roi,
          source_file: t.source_file,
        })),
      });
      setResult(`Imported ${res.created} trades · ${formatMoney(res.net_pnl_total)} (batch #${res.import_batch_id})`);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-line bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="font-display text-xl font-bold">Add Trade</h2>
            <p className="text-xs text-muted">Manual entry or batch DAS Trader CSV import</p>
          </div>
          <button type="button" onClick={handleClose} className="text-muted hover:text-ink">
            Close
          </button>
        </div>

        <div className="flex gap-2 border-b border-line px-5 pt-3">
          {(
            [
              ["das", "DAS CSV batch"],
              ["manual", "Manual"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-t-lg px-3 py-2 text-sm font-semibold ${
                tab === id ? "bg-paper text-signal" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {tab === "manual" ? (
            <form onSubmit={submitManual} className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                Symbol
                <input
                  required
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                  value={form.symbol}
                  onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })}
                />
              </label>
              <label className="text-sm">
                Side
                <select
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                  value={form.side}
                  onChange={(e) => setForm({ ...form, side: e.target.value })}
                >
                  <option value="LONG">LONG</option>
                  <option value="SHORT">SHORT</option>
                </select>
              </label>
              <label className="text-sm">
                Opened
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                  value={form.opened_at}
                  onChange={(e) => setForm({ ...form, opened_at: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Closed
                <input
                  required
                  type="datetime-local"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                  value={form.closed_at}
                  onChange={(e) => setForm({ ...form, closed_at: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Qty
                <input
                  required
                  type="number"
                  step="any"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Fees
                <input
                  type="number"
                  step="any"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={form.fees}
                  onChange={(e) => setForm({ ...form, fees: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Avg entry
                <input
                  required
                  type="number"
                  step="any"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={form.avg_entry}
                  onChange={(e) => setForm({ ...form, avg_entry: e.target.value })}
                />
              </label>
              <label className="text-sm">
                Avg exit
                <input
                  required
                  type="number"
                  step="any"
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2 font-mono"
                  value={form.avg_exit}
                  onChange={(e) => setForm({ ...form, avg_exit: e.target.value })}
                />
              </label>
              <label className="col-span-2 text-sm">
                Notes
                <textarea
                  className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={handleClose} className="rounded-lg border border-line px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save trade"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-signal/40 bg-signal/5 px-4 py-8 text-center hover:bg-signal/10">
                <span className="font-display text-lg font-bold text-signal">Drop DAS Trader CSV files</span>
                <span className="mt-1 max-w-md text-sm text-muted">
                  Multi-select day exports (e.g. 6-26.csv, 7-1.csv). Executions are matched into round-trip trades
                  automatically.
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  multiple
                  className="hidden"
                  onChange={(e) => onDasFiles(e.target.files)}
                />
              </label>

              {preview && (
                <>
                  {preview.already_imported && (
                    <div className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                      Already imported as batch #{preview.existing_batch?.id} ({preview.existing_batch?.label}). Delete
                      that batch on the Import page before importing again.
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2 text-sm">
                    <div>
                      <span className="font-semibold">{preview.files.length} files</span>
                      <span className="text-muted">
                        {" "}
                        · {preview.execution_count} fills · {preview.valid_count} trades
                      </span>
                    </div>
                    <div className={`font-mono font-semibold ${pnlClass(preview.net_pnl_total)}`}>
                      {formatMoney(preview.net_pnl_total)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-muted">
                    {preview.files.map((f) => (
                      <span key={f.filename} className="rounded-full bg-paper px-2 py-1 font-mono">
                        {f.filename} ({f.executions})
                      </span>
                    ))}
                  </div>

                  <div className="max-h-72 overflow-auto rounded-lg border border-line">
                    <table className="w-full min-w-[640px] text-left text-sm">
                      <thead className="sticky top-0 bg-paper text-xs uppercase text-muted">
                        <tr>
                          <th className="px-2 py-2">
                            <input
                              type="checkbox"
                              checked={selected.size === preview.trades.filter((t) => t.valid).length}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelected(new Set(preview.trades.filter((t) => t.valid).map((t) => t.index)));
                                } else setSelected(new Set());
                              }}
                            />
                          </th>
                          <th className="px-2 py-2">Date</th>
                          <th className="px-2 py-2">Symbol</th>
                          <th className="px-2 py-2">Side</th>
                          <th className="px-2 py-2">Qty</th>
                          <th className="px-2 py-2">P&L</th>
                          <th className="px-2 py-2">File</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.trades.map((t) => (
                          <tr key={t.index} className="border-t border-line/70">
                            <td className="px-2 py-1.5">
                              <input
                                type="checkbox"
                                disabled={!t.valid}
                                checked={selected.has(t.index)}
                                onChange={() => toggle(t.index)}
                              />
                            </td>
                            <td className="px-2 py-1.5 font-mono text-xs">{t.trade_date}</td>
                            <td className="px-2 py-1.5 font-semibold">{t.symbol}</td>
                            <td className="px-2 py-1.5 text-muted">{t.side}</td>
                            <td className="px-2 py-1.5 font-mono">{t.qty}</td>
                            <td className={`px-2 py-1.5 font-mono font-semibold ${pnlClass(t.net_pnl)}`}>
                              {formatMoney(t.net_pnl)}
                            </td>
                            <td className="px-2 py-1.5 font-mono text-xs text-muted">{t.source_file}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={handleClose} className="rounded-lg border border-line px-4 py-2 text-sm">
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={saving || selected.size === 0 || preview.already_imported}
                      onClick={commitDas}
                      className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {preview.already_imported
                        ? "Already imported"
                        : saving
                          ? "Importing…"
                          : `Import ${selected.size} trades`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-loss">{error}</p>}
          {result && <p className="mt-3 text-sm text-signal">{result}</p>}
        </div>
      </div>
    </div>
  );
}
