import { useState } from "react";
import ImportHistory from "../components/ImportHistory";
import { api } from "../lib/api";
import { formatMoney, pnlClass } from "../lib/format";
import type { DasImportPreview } from "../types";

export default function ImportPage() {
  const [mode, setMode] = useState<"das" | "ibkr" | "generic">("das");
  const [syncStatus, setSyncStatus] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [dasPreview, setDasPreview] = useState<DasImportPreview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);

  const runDas = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    setResult("");
    setPreview(null);
    try {
      const res = await api.importDas(Array.from(files));
      setDasPreview(res);
    } catch (err) {
      setDasPreview(null);
      setError(err instanceof Error ? err.message : "DAS import failed");
    } finally {
      setBusy(false);
    }
  };

  // IBKR Flex: kick off SendRequest, then poll GetStatement until the statement
  // is generated. Reuses the DAS preview + commit path (same round-trip engine).
  const runIbkr = async (scope: "today" | "history" = "today") => {
    setBusy(true);
    setError("");
    setResult("");
    setPreview(null);
    setDasPreview(null);
    setSyncStatus("Requesting statement…");
    try {
      const { reference_code, url } = await api.ibkrRequest(scope);
      const deadline = Date.now() + 90_000;
      for (let attempt = 1; ; attempt++) {
        const res = await api.ibkrFetch(reference_code, url);
        if (res.status === "ready") {
          setDasPreview(res);
          setSyncStatus("");
          break;
        }
        if (Date.now() > deadline) {
          throw new Error("IBKR statement not ready after 90s — try again shortly.");
        }
        setSyncStatus(
          res.code === "1018"
            ? "IBKR is throttling requests, waiting…"
            : `Generating statement… (poll ${attempt})`,
        );
        await new Promise((r) => setTimeout(r, res.retry_after_ms || 1500));
      }
    } catch (err) {
      setSyncStatus("");
      setError(err instanceof Error ? err.message : "IBKR sync failed");
    } finally {
      setBusy(false);
    }
  };

  const commitDas = async () => {
    if (!dasPreview) return;
    if (dasPreview.already_imported) {
      setError(
        `Already imported as batch #${dasPreview.existing_batch?.id}. Delete that import below first.`,
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.commitDas({
        source: mode === "ibkr" ? "ibkr" : "das",
        fingerprint: dasPreview.fingerprint,
        trade_fingerprint: dasPreview.trade_fingerprint,
        label: dasPreview.label,
        trades: dasPreview.trades.filter((t) => t.valid).map((t) => ({
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
      const broker = mode === "ibkr" ? "IBKR" : "DAS";
      const skippedNote = res.skipped ? ` · skipped ${res.skipped} already-imported` : "";
      if (res.created === 0) {
        setResult(res.message || `Nothing new — all ${res.skipped ?? 0} trade(s) already imported.`);
      } else {
        setResult(
          `Imported ${res.created} ${broker} trades · ${formatMoney(res.net_pnl_total)} (batch #${res.import_batch_id})${skippedNote}`,
        );
      }
      setHistoryKey((k) => k + 1);
      // refresh duplicate state
      setDasPreview({ ...dasPreview, already_imported: true, existing_batch: { id: res.import_batch_id ?? 0 } as never });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async (f: File, map?: Record<string, string>) => {
    setBusy(true);
    setError("");
    setResult("");
    setDasPreview(null);
    try {
      const res = await api.importCsv(f, map);
      setPreview(res);
      setHeaders((res.headers as string[]) || []);
      setMapping((res.mapping as Record<string, string>) || {});
      setRawRows((res.raw_rows as Record<string, string>[]) || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const res = (await api.commitCsv({
        mapping,
        rows: rawRows,
        account_id: 1,
      })) as { created: number; errors: unknown[] };
      setResult(`Imported ${res.created} trades${res.errors?.length ? ` (${res.errors.length} skipped)` : ""}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Commit failed");
    } finally {
      setBusy(false);
    }
  };

  const rows = (preview?.preview as Array<Record<string, unknown>>) || [];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Import</h1>
        <p className="mt-1 text-sm text-muted">
          Prefer <span className="font-semibold text-ink">DAS Trader CSV batch</span> for day exports. To remove imports,
          use <span className="font-semibold text-ink">Delete imports</span> at the bottom (or delete one trade on Day
          view).
        </p>
      </div>

      <ImportHistory key={historyKey} onChanged={() => setHistoryKey((k) => k + 1)} />

      <div className="flex gap-2">
        {(
          [
            ["das", "DAS Trader"],
            ["ibkr", "IBKR sync"],
            ["generic", "Generic CSV"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              mode === id ? "bg-signal text-white" : "bg-surface border border-line text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "das" || mode === "ibkr" ? (
        <div className="space-y-4">
          {mode === "das" && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-signal/40 bg-signal/5 px-4 py-10 hover:bg-signal/10">
              <span className="font-display text-lg font-bold text-signal">Drop one or more DAS day CSVs</span>
              <span className="mt-1 text-sm text-muted">e.g. 6-26.csv, 7-1.csv — multi-select supported</span>
              <input
                type="file"
                accept=".csv,text/csv"
                multiple
                className="hidden"
                onChange={(e) => runDas(e.target.files)}
              />
            </label>
          )}

          {mode === "ibkr" && (
            <div className="rounded-xl border-2 border-dashed border-signal/40 bg-signal/5 px-4 py-8 text-center">
              <div className="font-display text-lg font-bold text-signal">Sync from Interactive Brokers</div>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Pulls your Flex Query over the IBKR Flex Web Service and matches fills into round-trip
                trades. Already-imported trades are skipped automatically.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runIbkr("today")}
                  className="rounded-lg bg-signal px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Syncing…" : "Sync today"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runIbkr("history")}
                  className="rounded-lg border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50"
                >
                  Backfill history
                </button>
              </div>
              <p className="mx-auto mt-2 max-w-md text-[11px] text-muted">
                <span className="font-semibold">Sync today</span> uses your Trade Confirmation query (current-day fills);{" "}
                <span className="font-semibold">Backfill history</span> uses your Activity query (settled prior days).
              </p>
              {syncStatus && <p className="mt-2 text-xs font-mono text-muted">{syncStatus}</p>}
            </div>
          )}

          {dasPreview && (
            <div className="rounded-xl border border-line bg-surface p-5 shadow-panel">
              {dasPreview.already_imported && (
                <div className="mb-3 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-sm text-warn">
                  Already imported as batch #{dasPreview.existing_batch?.id} ({dasPreview.existing_batch?.label}). Delete
                  that batch below to re-import.
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">
                    {mode === "ibkr" ? "IBKR preview" : "DAS preview"}
                  </h2>
                  <p className="text-sm text-muted">
                    {mode === "ibkr"
                      ? `${dasPreview.execution_count} fills · ${dasPreview.valid_count} trades`
                      : `${dasPreview.files.length} files · ${dasPreview.execution_count} fills · ${dasPreview.valid_count} trades`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`font-mono font-semibold ${pnlClass(dasPreview.net_pnl_total)}`}>
                    {formatMoney(dasPreview.net_pnl_total)}
                  </span>
                  <button
                    type="button"
                    disabled={busy || !dasPreview.valid_count || dasPreview.already_imported}
                    onClick={commitDas}
                    className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {dasPreview.already_imported ? "Already imported" : busy ? "Working…" : "Commit all trades"}
                  </button>
                </div>
              </div>
              <div className="mt-4 max-h-80 overflow-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Symbol</th>
                      <th className="pb-2">Side</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2">P&L</th>
                      <th className="pb-2">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dasPreview.trades.map((t) => (
                      <tr key={t.index} className="border-t border-line/70">
                        <td className="py-2 font-mono text-xs">{t.trade_date}</td>
                        <td className="py-2 font-semibold">{t.symbol}</td>
                        <td className="py-2">{t.side}</td>
                        <td className="py-2 font-mono">{t.qty}</td>
                        <td className={`py-2 font-mono ${pnlClass(t.net_pnl)}`}>{formatMoney(t.net_pnl)}</td>
                        <td className="py-2 font-mono text-xs text-muted">{t.source_file}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {mode === "generic" && (
        <>
          <div className="rounded-xl border border-line bg-surface p-5 shadow-panel">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-4 py-10 hover:border-signal/40 hover:bg-paper/50">
              <span className="font-display text-lg font-bold text-signal">Drop or choose CSV</span>
              <span className="mt-1 text-sm text-muted">{file ? file.name : "symbol, qty, prices, times…"}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFile(f);
                  runPreview(f);
                }}
              />
            </label>
          </div>

          {headers.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5 shadow-panel">
              <h2 className="font-display text-lg font-bold">Column mapping</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ["symbol", "Symbol"],
                  ["qty", "Qty"],
                  ["side", "Side"],
                  ["entry_price", "Entry price"],
                  ["exit_price", "Exit price"],
                  ["price", "Price (fallback)"],
                  ["opened_at", "Opened at"],
                  ["closed_at", "Closed at"],
                  ["datetime", "Datetime (fallback)"],
                  ["fees", "Fees"],
                  ["pnl", "P&L (optional)"],
                  ["action", "Action"],
                ].map(([key, label]) => (
                  <label key={key} className="text-sm">
                    {label}
                    <select
                      className="mt-1 w-full rounded-lg border border-line px-3 py-2"
                      value={mapping[key] || ""}
                      onChange={(e) => setMapping({ ...mapping, [key]: e.target.value })}
                    >
                      <option value="">—</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <button
                type="button"
                disabled={!file || busy}
                onClick={() => file && runPreview(file, mapping)}
                className="mt-4 rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-paper"
              >
                Re-preview with mapping
              </button>
            </div>
          )}

          {preview && (
            <div className="rounded-xl border border-line bg-surface p-5 shadow-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">Preview</h2>
                  <p className="text-sm text-muted">
                    {String(preview.valid_count)} / {String(preview.row_count)} rows valid
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy || !preview.valid_count}
                  onClick={commit}
                  className="rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Working…" : "Commit import"}
                </button>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead className="text-xs uppercase text-muted">
                    <tr>
                      <th className="pb-2">Symbol</th>
                      <th className="pb-2">Side</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2">Entry</th>
                      <th className="pb-2">Exit</th>
                      <th className="pb-2">P&L</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={String(row.index)} className="border-t border-line/70">
                        <td className="py-2 font-semibold">{String(row.symbol || "—")}</td>
                        <td className="py-2">{String(row.side || "—")}</td>
                        <td className="py-2 font-mono">{String(row.qty ?? "—")}</td>
                        <td className="py-2 font-mono">{String(row.avg_entry ?? "—")}</td>
                        <td className="py-2 font-mono">{String(row.avg_exit ?? "—")}</td>
                        <td className={`py-2 font-mono ${pnlClass(Number(row.net_pnl || 0))}`}>
                          {row.net_pnl != null ? formatMoney(Number(row.net_pnl)) : "—"}
                        </td>
                        <td className="py-2">
                          {row.valid ? (
                            <span className="text-profit">OK</span>
                          ) : (
                            <span className="text-loss">{(row.errors as string[]).join(", ")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {error && <div className="rounded-lg border border-loss/30 bg-loss/5 px-3 py-2 text-sm text-loss">{error}</div>}
      {result && <div className="rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-sm text-signal">{result}</div>}
    </div>
  );
}
