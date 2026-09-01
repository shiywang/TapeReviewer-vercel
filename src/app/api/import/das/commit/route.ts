import { NextRequest } from "next/server";
import { handle, httpError, json, requireAuth } from "@/lib/server/http";
import { createBatch, fingerprintTrades, findBatchByFingerprint } from "@/lib/server/importBatches";
import { createTrade } from "@/lib/server/services";
import { round2 } from "@/lib/server/analytics";
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
    const created: Record<string, unknown>[] = [];
    for (const row of payload.trades) {
      const note = row.source_file
        ? `Imported from ${brokerName} (${row.source_file})`
        : `Imported from ${brokerName}`;
      let trade = await createTrade({
        symbol: row.symbol,
        side: row.side,
        opened_at: row.opened_at,
        closed_at: row.closed_at,
        qty: row.qty,
        avg_entry: row.avg_entry,
        avg_exit: row.avg_exit,
        fees: row.fees || 0,
        account_id: accountId,
        import_batch_id: batch.id,
        notes: note,
      });
      if (row.net_pnl !== null && row.net_pnl !== undefined) {
        const gross = row.gross_pnl != null ? row.gross_pnl : row.net_pnl + (row.fees || 0);
        let roi = row.net_roi;
        if (roi == null) {
          const notional = Math.abs(row.avg_entry * row.qty) || 1.0;
          roi = (row.net_pnl / notional) * 100;
        }
        await sb
          .from("trade")
          .update({ net_pnl: row.net_pnl, gross_pnl: gross, net_roi: roi })
          .eq("id", trade.id as number);
        trade = { ...trade, net_pnl: row.net_pnl, gross_pnl: gross, net_roi: roi };
      }
      created.push(trade);
    }

    return json({
      created: created.length,
      trades: created.slice(0, 100),
      net_pnl_total: created.reduce((a, t) => a + Number(t.net_pnl), 0),
      import_batch_id: batch.id,
      fingerprint,
    });
  });
}
