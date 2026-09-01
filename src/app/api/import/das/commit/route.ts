import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { createBatch, fingerprintTrades, findBatchByFingerprint } from "@/lib/server/importBatches";
import { ApiError } from "@/lib/server/http";
import { computePnl, round2, round4 } from "@/lib/server/analytics";
import { supabase } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DasRow {
  symbol: string;
  side: "LONG" | "SHORT";
  opened_at: string;
  closed_at: string;
  qty: number;
  avg_entry: number;
  avg_exit: number;
  fees?: number;
  gross_pnl?: number | null;
  net_pnl?: number | null;
  net_roi?: number | null;
  source_file?: string | null;
}

export async function POST(req: NextRequest) {
  const unauth = requireAuth(req);
  if (unauth) return unauth;
  return handle(async () => {
    const payload = (await req.json()) as {
      trades: DasRow[];
      account_id?: number;
      fingerprint?: string;
      trade_fingerprint?: string;
      label?: string;
      source?: "das" | "ibkr";
    };
    if (!payload.trades?.length) return httpError("No trades to import", 400);
    const accountId = payload.account_id ?? 1;
    const source = payload.source === "ibkr" ? "ibkr" : "das";
    const brokerName = source === "ibkr" ? "IBKR" : "DAS Trader";

    const tradeFp =
      payload.trade_fingerprint ||
      fingerprintTrades(payload.trades as unknown as Record<string, unknown>[]);
    const fingerprint = payload.fingerprint || tradeFp;
    const label =
      payload.label ||
      [...new Set(payload.trades.map((t) => t.source_file).filter(Boolean))].sort().join(", ") ||
      `${brokerName} import`;

    for (const key of [fingerprint, tradeFp]) {
      const existing = await findBatchByFingerprint(key, accountId);
      if (existing) {
        return httpError(
          `This import was already applied (batch #${existing.id}: ${existing.label}). Delete that import first to re-import.`,
          409,
        );
      }
    }

    const sb = supabase();

    // Trade-level overlap key: identifies the same round-trip across different
    // queries (e.g. today's Trade Confirmation sync vs. a later Activity backfill
    // that both contain the same fills). Price is intentionally excluded — the
    // two query types can report slightly different average prices for the same
    // trade, but symbol/side/open/close/qty pin it uniquely enough for one user.
    const keyOf = (t: {
      symbol: string;
      side: string;
      opened_at: string;
      closed_at: string;
      qty: number;
    }) => `${t.symbol.toUpperCase()}|${t.side}|${t.opened_at}|${t.closed_at}|${t.qty}`;

    const { data: existingTrades, error: exFetchErr } = await sb
      .from("trade")
      .select("symbol, side, opened_at, closed_at, qty")
      .eq("account_id", accountId);
    if (exFetchErr) throw new ApiError(exFetchErr.message, 500);
    const existingKeys = new Set((existingTrades || []).map((t) => keyOf(t as never)));

    // Build rows, dropping any that already exist and any duplicated within this
    // same payload. Bulk-insert the rest (two inserts total → no per-trade loop
    // that would time out on a large history).
    const seenInPayload = new Set<string>();
    const newItems = payload.trades
      .map((row) => {
        const side = row.side ?? "LONG";
        const fees = row.fees ?? 0;
        let gross: number;
        let net: number;
        let roi: number;
        if (row.net_pnl !== null && row.net_pnl !== undefined) {
          net = row.net_pnl;
          gross = row.gross_pnl != null ? row.gross_pnl : row.net_pnl + fees;
          const notional = Math.abs(row.avg_entry * row.qty) || 1.0;
          roi = row.net_roi != null ? row.net_roi : (row.net_pnl / notional) * 100;
        } else {
          [gross, net, roi] = computePnl(side, row.qty, row.avg_entry, row.avg_exit, fees);
        }
        const key = keyOf({ ...row, side });
        return { row, side, fees, gross, net, roi, key };
      })
      .filter((it) => {
        if (existingKeys.has(it.key) || seenInPayload.has(it.key)) return false;
        seenInPayload.add(it.key);
        return true;
      });

    const skipped = payload.trades.length - newItems.length;
    if (!newItems.length) {
      return json({
        created: 0,
        skipped,
        net_pnl_total: 0,
        import_batch_id: null,
        fingerprint,
        message: `All ${skipped} trade(s) already imported — nothing new.`,
      });
    }

    let batch;
    try {
      batch = await createBatch({
        source,
        fingerprint,
        trade_fingerprint: tradeFp,
        label,
        trade_count: newItems.length,
        net_pnl: round2(newItems.reduce((a, it) => a + it.net, 0)),
        account_id: accountId,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "IMPORT_ALREADY_EXISTS") {
        return httpError("This import was already applied.", 409);
      }
      throw err;
    }

    const tradeRows = newItems.map((it) => ({
      account_id: accountId,
      import_batch_id: batch.id,
      symbol: it.row.symbol.toUpperCase(),
      side: it.side,
      opened_at: it.row.opened_at,
      closed_at: it.row.closed_at,
      qty: it.row.qty,
      avg_entry: it.row.avg_entry,
      avg_exit: it.row.avg_exit,
      gross_pnl: round2(it.gross),
      fees: it.fees,
      net_pnl: round2(it.net),
      net_roi: round4(it.roi),
      notes: it.row.source_file
        ? `Imported from ${brokerName} (${it.row.source_file})`
        : `Imported from ${brokerName}`,
      profit_target: null,
      stop_loss: null,
    }));

    const { data: inserted, error: insErr } = await sb
      .from("trade")
      .insert(tradeRows)
      .select("id");
    if (insErr) throw new ApiError(insErr.message, 500);
    const ids = (inserted || []) as { id: number }[];

    // Two synthetic executions per trade (entry + exit), same as createTrade().
    // PostgREST returns inserted rows in insertion order, so ids[i] ↔ newItems[i].
    const execRows: Record<string, unknown>[] = [];
    ids.forEach((t, i) => {
      const it = newItems[i];
      const buySide = it.side === "LONG" ? "BUY" : "SELL";
      const sellSide = it.side === "LONG" ? "SELL" : "BUY";
      execRows.push(
        { trade_id: t.id, executed_at: it.row.opened_at, side: buySide, qty: it.row.qty, price: it.row.avg_entry, fee: it.fees / 2 },
        { trade_id: t.id, executed_at: it.row.closed_at, side: sellSide, qty: it.row.qty, price: it.row.avg_exit, fee: it.fees / 2 },
      );
    });
    if (execRows.length) {
      const { error: exErr } = await sb.from("execution").insert(execRows);
      if (exErr) throw new ApiError(exErr.message, 500);
    }

    return json({
      created: ids.length,
      skipped,
      net_pnl_total: round2(newItems.reduce((a, it) => a + it.net, 0)),
      import_batch_id: batch.id,
      fingerprint,
    });
  });
}
