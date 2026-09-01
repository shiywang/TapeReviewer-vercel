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

    let batch;
    try {
      batch = await createBatch({
        source,
        fingerprint,
        trade_fingerprint: tradeFp,
        label,
        trade_count: payload.trades.length,
        net_pnl: round2(payload.trades.reduce((a, t) => a + (t.net_pnl || 0), 0)),
        account_id: accountId,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "IMPORT_ALREADY_EXISTS") {
        return httpError("This import was already applied.", 409);
      }
      throw err;
    }

    const sb = supabase();

    // Build all trade rows up front, then bulk-insert. A per-trade loop with
    // several sequential Supabase calls each times out on large imports (e.g. a
    // full IBKR history of hundreds of trades); two bulk inserts stay well within
    // the serverless budget.
    const tradeRows = payload.trades.map((row) => {
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
      return {
        account_id: accountId,
        import_batch_id: batch.id,
        symbol: row.symbol.toUpperCase(),
        side,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        qty: row.qty,
        avg_entry: row.avg_entry,
        avg_exit: row.avg_exit,
        gross_pnl: round2(gross),
        fees,
        net_pnl: round2(net),
        net_roi: round4(roi),
        notes: row.source_file
          ? `Imported from ${brokerName} (${row.source_file})`
          : `Imported from ${brokerName}`,
        profit_target: null,
        stop_loss: null,
      };
    });

    const { data: inserted, error: insErr } = await sb
      .from("trade")
      .insert(tradeRows)
      .select("id");
    if (insErr) throw new ApiError(insErr.message, 500);
    const ids = (inserted || []) as { id: number }[];

    // Two synthetic executions per trade (entry + exit), same as createTrade().
    // PostgREST returns inserted rows in insertion order, so ids[i] ↔ trades[i].
    const execRows: Record<string, unknown>[] = [];
    ids.forEach((t, i) => {
      const row = payload.trades[i];
      const side = row.side ?? "LONG";
      const fees = row.fees ?? 0;
      const buySide = side === "LONG" ? "BUY" : "SELL";
      const sellSide = side === "LONG" ? "SELL" : "BUY";
      execRows.push(
        { trade_id: t.id, executed_at: row.opened_at, side: buySide, qty: row.qty, price: row.avg_entry, fee: fees / 2 },
        { trade_id: t.id, executed_at: row.closed_at, side: sellSide, qty: row.qty, price: row.avg_exit, fee: fees / 2 },
      );
    });
    if (execRows.length) {
      const { error: exErr } = await sb.from("execution").insert(execRows);
      if (exErr) throw new ApiError(exErr.message, 500);
    }

    return json({
      created: ids.length,
      net_pnl_total: round2(tradeRows.reduce((a, r) => a + r.net_pnl, 0)),
      import_batch_id: batch.id,
      fingerprint,
    });
  });
}
